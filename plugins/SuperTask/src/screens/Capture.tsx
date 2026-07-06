/**
 * Capture - OCR bridge for lasso/doc capture flows
 *
 * Runs recognition on mount, then navigates to TaskAdd with pre-filled content.
 * Shows on-screen diagnostics since dev server logs may not be reachable.
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {PluginManager, PluginCommAPI, PluginDocAPI} from 'sn-plugin-lib';
import {closePlugin} from '../utils/closePlugin';
import {loadConfig} from '../utils/config';
import {setConfigLoader, getProjects} from '../api/todoist';
import {log, logError} from '../utils/debug';
import {recognizeLassoElements} from '../utils/ocr';

type Nav = {
  push: (name: string, params?: Record<string, any>) => void;
  pop: () => void;
  resetTo: (name: string, params?: Record<string, any>) => void;
  canGoBack: boolean;
};

type Props = {
  mode: 'lasso' | 'doc';
  nav: Nav;
};

// Timeout wrapper -- SDK calls can hang forever on device
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// EMR digitizer maximum values.
// Some devices (e.g. Nomad) report page size 1404x1872 but their
// digitizer uses A5X2-range EMR values (max ~21632/16224). We detect
// the correct range from the actual element data rather than guessing
// from page size alone.
const EMR_NORMAL = {portrait: {maxX: 15819, maxY: 11864}, landscape: {maxX: 11864, maxY: 15819}};
const EMR_A5X2   = {portrait: {maxX: 21632, maxY: 16224}, landscape: {maxX: 16224, maxY: 21632}};

function getEmrMaximums(pageSize: {width: number; height: number}, emrMaxX: number, emrMaxY: number) {
  const isPortrait = pageSize.width <= pageSize.height;
  // If any element EMR value exceeds normal range, device uses A5X2 digitizer
  const usesA5X2 = emrMaxX > 15819 || emrMaxY > 11864;
  const range = usesA5X2 ? EMR_A5X2 : EMR_NORMAL;
  return isPortrait ? range.portrait : range.landscape;
}

export default function Capture({mode, nav}: Props) {
  // On-screen trace log for debugging without dev server
  const [trace, setTrace] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  const addTrace = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setTrace(prev => [...prev, `[${ts}] ${msg}`]);
    log('Capture', msg);
  };

  useEffect(() => {
    addTrace(`MOUNT mode=${mode}`);
    setConfigLoader(loadConfig);
    loadConfig().then(config => {
      if (config.debugMode) setDebugMode(true);
    });
    runCapture();
  }, []);

  const runCapture = async () => {
    try {
      addTrace('Starting capture...');

      // Load config first (sync/fast)
      const config = await loadConfig();
      addTrace(`Config loaded, hasToken=${!!config.apiToken}`);

      // Run OCR + fetch projects in parallel (projects are independent)
      addTrace('Starting capture + project fetch in parallel...');
      const capturePromise = mode === 'lasso' ? captureLasso() : captureDocText();
      const projectsPromise = withTimeout(getProjects(), 8000, 'getProjects').catch((err: any) => {
        addTrace(`Project fetch failed (non-fatal): ${err.message}`);
        return [] as any[];
      });

      const [captureResult, projects] = await Promise.all([capturePromise, projectsPromise]);
      addTrace(`Got ${(projects as any[])?.length ?? 0} projects`);

      if (!captureResult) {
        addTrace('Capture returned null (error already shown)');
        return;
      }

      addTrace('Navigating to TaskAdd...');
      setDone(true);
      nav.resetTo('task-add', {
        projects,
        defaultProjectId: config.defaultProjectId,
        initialContent: captureResult.content,
        initialDescription: captureResult.description,
        captureMode: mode,
        noteContext: captureResult.noteContext,
      });
    } catch (err: any) {
      logError('Capture', err);
      addTrace(`FATAL: ${err.message}`);
      setError(`Unexpected error: ${err.message}`);
    }
  };

  const captureLasso = async (): Promise<{content: string; description: string; noteContext?: any} | null> => {
    addTrace('captureLasso: calling getLassoElements...');

    try {
      const elements = await withTimeout(
        PluginCommAPI.getLassoElements(),
        10000,
        'getLassoElements',
      );
      addTrace(`getLassoElements: success=${elements?.success} count=${elements?.result?.length ?? 0}`);

      if (!elements?.success || !elements?.result?.length) {
        setError('No elements selected. Lasso some handwriting first.');
        addTrace('ERROR: no elements');
        return null;
      }

      // OCR via shared utility (filters to supported types, logs diagnostics)
      const ocr = await recognizeLassoElements(elements.result, addTrace);
      if (!ocr.success) {
        setError('Could not recognize handwriting. Try selecting clearer text.');
        addTrace('ERROR: recognition failed');
        return null;
      }

      const content = ocr.text;
      const {filePath, pageNum, pageSize} = ocr.pageContext;

      // Compute bounding box from lasso elements (EMR coords) then convert to pixels
      let bounds = null;
      try {
        let emrMinX = Infinity, emrMinY = Infinity, emrMaxX = 0, emrMaxY = 0;
        for (const el of elements.result) {
          if (el.maxX !== undefined && el.maxX > emrMaxX) emrMaxX = el.maxX;
          if (el.maxY !== undefined && el.maxY > emrMaxY) emrMaxY = el.maxY;
          // Check sub-objects for position data
          if (el.textBox?.textRect) {
            const r = el.textBox.textRect;
            if (r.left < emrMinX) emrMinX = r.left;
            if (r.top < emrMinY) emrMinY = r.top;
          }
          if (el.link) {
            if (el.link.X < emrMinX) emrMinX = el.link.X;
            if (el.link.Y < emrMinY) emrMinY = el.link.Y;
          }
          if (el.title) {
            if (el.title.X < emrMinX) emrMinX = el.title.X;
            if (el.title.Y < emrMinY) emrMinY = el.title.Y;
          }
        }
        addTrace(`EMR bounds: maxX=${emrMaxX} maxY=${emrMaxY} minX=${emrMinX === Infinity ? 'none' : emrMinX} minY=${emrMinY === Infinity ? 'none' : emrMinY}`);

        // maxX/maxY on lasso elements are page-level constants, not stroke positions.
        // Read actual stroke point data to compute real bounding box.
        const {maxX: realMaxX, maxY: realMaxY} = getEmrMaximums(pageSize, emrMaxX, emrMaxY);
        const scaleX = realMaxX / (pageSize.height - 1);
        const scaleY = realMaxY / (pageSize.width - 1);
        addTrace(`EMR scale: ${scaleX.toFixed(3)}/${scaleY.toFixed(3)} (realMax ${realMaxX}/${realMaxY})`);

        // Read first and last stroke points from each element to find real bounds
        let sMinX = Infinity, sMinY = Infinity, sMaxX = 0, sMaxY = 0;
        let pointsRead = 0;
        for (const el of elements.result) {
          if (!el.stroke?.points?._size) continue;
          try {
            const pts = el.stroke.points;
            const first = await pts.get(0);
            const last = await pts.get(pts._size - 1);
            for (const pt of [first, last]) {
              if (pt?.x !== undefined && pt?.y !== undefined) {
                // These are EMR coordinates
                if (pt.x < sMinX) sMinX = pt.x;
                if (pt.x > sMaxX) sMaxX = pt.x;
                if (pt.y < sMinY) sMinY = pt.y;
                if (pt.y > sMaxY) sMaxY = pt.y;
                pointsRead++;
              }
            }
          } catch (e: any) {
            addTrace(`Stroke point read error: ${e.message}`);
          }
        }
        addTrace(`Stroke points: ${pointsRead} pts from ${elements.result.length} els, EMR x=${sMinX}-${sMaxX} y=${sMinY}-${sMaxY}`);

        if (pointsRead > 0 && sMinX !== Infinity) {
          // Convert EMR stroke bounds to pixel coordinates
          // EMR x -> pixel y (direct), EMR y -> pixel x (mirrored)
          const pxLeft = Math.round(pageSize.width - 1 - sMaxY / scaleY);
          const pxTop = Math.round(sMinX / scaleX);
          const pxRight = Math.round(pageSize.width - 1 - sMinY / scaleY);
          const pxBottom = Math.round(sMaxX / scaleX);
          bounds = {
            left: Math.min(pxLeft, pxRight),
            top: Math.min(pxTop, pxBottom),
            right: Math.max(pxLeft, pxRight),
            bottom: Math.max(pxTop, pxBottom),
          };
        } else {
          // Fallback: couldn't read points, skip marking
          addTrace('No stroke points readable, skipping bounds');
        }

        if (bounds) {
          addTrace(`Pixel bounds: l=${bounds.left} t=${bounds.top} r=${bounds.right} b=${bounds.bottom}`);
        }
      } catch (e: any) {
        addTrace(`Bounds calc failed: ${e.message}`);
      }

      // Build source context from filePath/pageNum we already fetched
      const fileName = filePath?.split('/').pop()?.replace('.note', '') || 'note';
      const description = `From: ${fileName} p.${pageNum}`;
      addTrace(`Done: "${content.slice(0, 40)}" -- ${description}`);

      // Collect lasso element identifiers for later deletion (Mark as Text)
      const lassoElementIds = elements.result.map((el: any) => ({
        uuid: el.uuid,
        numInPage: el.numInPage,
        type: el.type,
      }));
      addTrace(`Collected ${lassoElementIds.length} element IDs (sample: uuid=${lassoElementIds[0]?.uuid} numInPage=${lassoElementIds[0]?.numInPage})`);

      const noteContext = bounds ? {filePath, pageNum, bounds, pageSize, lassoElementIds} : null;
      return {content, description, noteContext};
    } catch (err: any) {
      addTrace(`captureLasso ERROR: ${err.message}`);
      setError(`Recognition error: ${err.message}`);
      return null;
    }
  };

  const captureDocText = async (): Promise<{content: string; description: string} | null> => {
    addTrace('captureDocText: calling getLastSelectedText...');

    try {
      let text = '';

      try {
        const selected = await withTimeout(PluginDocAPI.getLastSelectedText(), 5000, 'getLastSelectedText');
        addTrace(`getLastSelectedText: success=${selected?.success}`);
        if (selected?.success && selected?.result) {
          text = selected.result;
        }
      } catch (e: any) {
        addTrace(`getLastSelectedText failed, trying fallback: ${e.message}`);
        try {
          const fallback = await withTimeout(PluginDocAPI.getSelectedText(), 5000, 'getSelectedText');
          if (fallback?.success && fallback?.result) {
            text = fallback.result;
          }
        } catch (e2: any) {
          addTrace(`getSelectedText fallback also failed: ${e2.message}`);
        }
      }

      if (!text) {
        setError('No text selected. Highlight some text in the document first.');
        return null;
      }

      const content = text.trim();
      let fileName = 'document';
      try {
        const filePath = await withTimeout(PluginCommAPI.getCurrentFilePath(), 3000, 'getCurrentFilePath');
        fileName = filePath?.result?.split('/').pop() || 'document';
      } catch (e: any) {
        addTrace(`getCurrentFilePath failed: ${e.message}`);
      }

      const description = `From: ${fileName}`;
      addTrace(`Done: "${content.slice(0, 40)}" -- ${description}`);
      return {content, description};
    } catch (err: any) {
      addTrace(`captureDocText ERROR: ${err.message}`);
      setError(`Capture error: ${err.message}`);
      return null;
    }
  };

  // Error state
  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Capture Error</Text>
          <Pressable style={styles.headerBtn} onPress={() => closePlugin()}>
            <Text style={styles.headerBtnText}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.errorText}>{error}</Text>
        <View style={styles.buttonRow}>
          <Pressable style={styles.btn} onPress={() => {
            setError('');
            setTrace([]);
            runCapture();
          }}>
            <Text style={styles.btnText}>Retry</Text>
          </Pressable>
          {debugMode && (
            <Pressable style={styles.btn} onPress={() => nav.resetTo('debug')}>
              <Text style={styles.btnText}>Log</Text>
            </Pressable>
          )}
        </View>
        {debugMode && (
          <ScrollView style={styles.traceScroll}>
            <Text style={styles.traceTitle}>Trace:</Text>
            {trace.map((t, i) => (
              <Text key={i} style={styles.traceLine}>{t}</Text>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  // Loading state -- shows on-screen trace when debug mode is on
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {mode === 'lasso' ? 'Recognizing...' : 'Reading text...'}
        </Text>
        <Pressable style={styles.headerBtn} onPress={() => closePlugin()}>
          <Text style={styles.headerBtnText}>Close</Text>
        </Pressable>
      </View>
      {debugMode ? (
        <ScrollView style={styles.traceScroll}>
          {trace.map((t, i) => (
            <Text key={i} style={styles.traceLine}>{t}</Text>
          ))}
          {!done && <Text style={styles.traceLine}>...</Text>}
        </ScrollView>
      ) : (
        <View style={styles.traceScroll}>
          <Text style={styles.traceLine}>
            {done ? 'Done' : 'Processing...'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  headerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
  },
  headerBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    padding: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  traceScroll: {
    flex: 1,
    padding: 12,
  },
  traceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  traceLine: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#000000',
    marginBottom: 4,
    lineHeight: 18,
  },
});
