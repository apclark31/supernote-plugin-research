/**
 * Diagnostics - Test SDK APIs needed for dashboard feature
 *
 * Runs each API call with timeouts and logs success/failure.
 * Results shown on screen and sent to dev log server.
 */

import React, {useState, useRef, useEffect} from 'react';
import {View, Text, Pressable, StyleSheet, ScrollView, Linking} from 'react-native';
import {
  PluginCommAPI,
  PluginNoteAPI,
  PluginFileAPI,
  FileUtils,
  PluginManager,
  NativeUIUtils,
} from 'sn-plugin-lib';
import {closePlugin} from '../utils/closePlugin';
import {log} from '../utils/debug';
import {openNote} from '../utils/noteOpener';

type Props = {
  nav: {pop: () => void};
};

type TestResult = {
  name: string;
  status: 'pending' | 'pass' | 'fail' | 'running';
  detail: string;
};

// Module-level motion state -- survives component remounts after closePluginView/showPluginView
let _motionSub: any = null;
let _motionLog: string[] = [];
let _motionCount = 0;
// UI update hook -- set while the component is mounted, null otherwise, so a
// listener that outlives a mount never calls setState on a dead component (B-027)
let _uiNotify: ((lines: string[]) => void) | null = null;

// Android MotionEvent: lower 8 bits = action, upper bits = pointer index
const BASE_ACTIONS: Record<number, string> = {0: 'DOWN', 1: 'UP', 2: 'MOVE', 3: 'CANCEL', 5: 'PTR_DOWN', 6: 'PTR_UP'};
const TOOL_NAMES: Record<number, string> = {0: '???', 1: 'FINGER', 2: 'PEN'};

function decodeAction(raw: number): string {
  const action = raw & 0xff;
  const ptrIdx = (raw >> 8) & 0xff;
  const name = BASE_ACTIONS[action] || String(action);
  return ptrIdx > 0 ? `${name}[${ptrIdx}]` : name;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export default function Diagnostics({nav}: Props) {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  // Store templates from test 1 for use in tests 2 and 4
  const templatesRef = React.useRef<any[]>([]);

  // Navigation test state
  const [navResult, setNavResult] = useState('');
  const [navNotePath, setNavNotePath] = useState('');

  // Motion listener UI state -- reads from module-level storage on mount
  const [motionActive, setMotionActive] = useState(!!_motionSub);
  const [motionEvents, setMotionEvents] = useState<string[]>([..._motionLog]);

  // Register the UI hook for the module-level listener; on unmount (user
  // navigated to another screen) stop the listener entirely -- the captured
  // log survives in _motionLog, but a diagnostics listener must never keep
  // running alongside the gesture detector for the rest of the session (B-027).
  useEffect(() => {
    _uiNotify = setMotionEvents;
    return () => {
      _uiNotify = null;
      if (_motionSub) {
        _motionSub.remove();
        _motionSub = null;
        log('Diag', `Motion listener auto-stopped on screen exit. Total events: ${_motionCount}`);
      }
    };
  }, []);

  const startMotionListener = () => {
    // Clean up any existing listener
    if (_motionSub) {
      _motionSub.remove();
      _motionSub = null;
    }
    _motionCount = 0;
    _motionLog = [];
    setMotionEvents([]);
    setMotionActive(true);
    log('Diag', 'Motion listener starting...');

    _motionSub = PluginManager.registerMotionListener(1, {
      onMsg: (msg: any) => {
        _motionCount++;
        const action = decodeAction(msg.action);
        const tool = TOOL_NAMES[msg.toolType] || String(msg.toolType);
        const x = Math.round(msg.x);
        const y = Math.round(msg.y);
        const p = msg.pressure?.toFixed(2) ?? '?';
        const ptrCount = msg.pointerCount ?? msg.pointers?.length ?? '?';

        const line = `#${_motionCount} ${action} ${tool} (${x},${y}) p=${p} ptrs=${ptrCount}`;

        // Log every DOWN/UP, but only every 10th MOVE
        if (msg.action !== 2 || _motionCount % 10 === 0) {
          log('Diag', `Motion: ${line}`);
        }

        // Store in module-level log (survives remount). 1000 lines ≈ a full
        // gesture-recording batch; raw events also reach debug.js's session file.
        _motionLog = [line, ..._motionLog].slice(0, 1000);

        // Update UI only while the component is mounted
        if (_uiNotify) _uiNotify([..._motionLog]);
      },
    });
    log('Diag', 'Motion listener registered');
  };

  const startAndClose = () => {
    startMotionListener();
    log('Diag', 'Closing plugin view -- draw/tap on note, then reopen plugin');
    setTimeout(() => {
      closePlugin();
    }, 500);
  };

  const stopMotionListener = () => {
    if (_motionSub) {
      _motionSub.remove();
      _motionSub = null;
    }
    setMotionActive(false);
    log('Diag', `Motion listener stopped. Total events: ${_motionCount}`);
  };

  const update = (name: string, status: TestResult['status'], detail: string) => {
    log('Diag', `${name}: ${status} -- ${detail}`);
    setResults(prev => {
      const idx = prev.findIndex(r => r.name === name);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = {name, status, detail};
        return copy;
      }
      return [...prev, {name, status, detail}];
    });
  };

  const runAll = async () => {
    setRunning(true);
    setResults([]);
    templatesRef.current = [];
    log('Diag', '=== Starting diagnostic run ===');

    // Get a valid absolute base path for file operations
    let basePath = '';
    try {
      const exportPath = await withTimeout(FileUtils.getExportPath(), 5000, 'getExportPath');
      // exportPath is like /storage/emulated/0/EXPORT -- derive /storage/emulated/0/
      if (exportPath) {
        basePath = exportPath.replace(/EXPORT\/?$/, '');
      }
      update('basePath', 'pass', basePath || '(empty)');
    } catch (e: any) {
      update('basePath', 'fail', e.message);
    }

    // Get current note context (may timeout if no note is active)
    let filePath = '';
    let pageNum = 0;
    try {
      const fp = await withTimeout(PluginCommAPI.getCurrentFilePath(), 5000, 'getCurrentFilePath');
      filePath = fp?.result || '';
      const pn = await withTimeout(PluginCommAPI.getCurrentPageNum(), 5000, 'getCurrentPageNum');
      pageNum = pn?.result ?? 0;
      update('noteContext', 'pass', `file=${filePath} page=${pageNum}`);
    } catch (e: any) {
      update('noteContext', 'fail', `No active note: ${e.message}`);
    }

    // --- Context-free tests ---

    // 1. getNoteSystemTemplates
    await testGetTemplates();

    // 2. createNote (uses template from test 1 + proper absolute path)
    await testCreateNote(basePath);

    // --- Context-dependent tests (need active note) ---

    // 3. insertTextLink (operates on current note page)
    await testInsertTextLink(filePath);

    // 4. insertNotePage
    await testInsertNotePage(filePath);

    // 5. replaceElements roundtrip
    await testReplaceElements(filePath, pageNum);

    // openFilePath skipped -- it ejects from the note to file manager

    log('Diag', '=== Diagnostic run complete ===');
    setRunning(false);
  };

  const testGetTemplates = async () => {
    const name = 'getNoteSystemTemplates';
    update(name, 'running', '');
    try {
      const result = await withTimeout(
        PluginCommAPI.getNoteSystemTemplates(),
        8000,
        name,
      );
      const templates = Array.isArray(result) ? result : [];
      templatesRef.current = templates;
      const summary = templates.length > 0
        ? templates.slice(0, 3).map((t: any) => typeof t === 'string' ? t : JSON.stringify(t)).join(', ')
        : 'empty';
      update(name, 'pass', `${templates.length} templates: ${summary}`);
    } catch (e: any) {
      update(name, 'fail', e.message);
    }
  };

  const testCreateNote = async (basePath: string) => {
    const name = 'createNote';
    update(name, 'running', '');

    const templates = templatesRef.current;
    if (templates.length === 0) {
      update(name, 'fail', 'No templates (getNoteSystemTemplates must run first)');
      return;
    }

    // Try each template format: name, hUri, vUri
    const t = templates[0];
    const templateName = typeof t === 'string' ? t : t?.name;
    const templateHUri = t?.hUri;
    const templateVUri = t?.vUri;
    const testPath = basePath ? `${basePath}Note/_supertask_diag.note` : '/storage/emulated/0/Note/_supertask_diag.note';

    // Try with template name first (docs say pass Template.name)
    const attempts = [
      {label: 'name', value: templateName},
      {label: 'vUri', value: templateVUri},
      {label: 'hUri', value: templateHUri},
    ].filter(a => a.value);

    const errors: string[] = [];
    for (const attempt of attempts) {
      try {
        log('Diag', `createNote: path=${testPath} template[${attempt.label}]=${attempt.value}`);
        const result = await withTimeout(
          PluginFileAPI.createNote({
            notePath: testPath,
            template: attempt.value,
            mode: 0,
            isPortrait: true,
          }),
          10000,
          `createNote(${attempt.label})`,
        );
        const json = JSON.stringify(result);
        const ok = result?.success || result?.result === true;

        if (ok) {
          update(name, 'pass', `template=${attempt.label}:${attempt.value} path=${testPath}`);
          try { await FileUtils.deleteFile(testPath); } catch {}
          return;
        }

        const errMsg = `${attempt.label}: ${result?.error?.message || json} (code ${result?.error?.code || '?'})`;
        errors.push(errMsg);
        log('Diag', `createNote ${attempt.label} failed: ${json}`);
      } catch (e: any) {
        errors.push(`${attempt.label}: ${e.message}`);
        log('Diag', `createNote ${attempt.label} error: ${e.message}`);
      }
    }

    update(name, 'fail', `path=${testPath}\n${errors.join('\n')}`);
  };

  const testInsertTextLink = async (filePath: string) => {
    const name = 'insertTextLink';
    update(name, 'running', '');
    if (!filePath) {
      update(name, 'fail', 'Needs active note context (open note, lasso, then run diag)');
      return;
    }
    try {
      const result = await withTimeout(
        PluginNoteAPI.insertTextLink({
          destPath: 'https://todoist.com',
          destPage: 0,
          style: 2,
          linkType: 4,
          rect: {left: 100, top: 100, right: 400, bottom: 140},
          fontSize: 16,
          fullText: 'SuperTask Dashboard',
          showText: 'SuperTask Dashboard',
          isItalic: 0,
        }),
        8000,
        name,
      );
      const json = JSON.stringify(result);
      const ok = result?.success || result?.result === 0;
      update(name, ok ? 'pass' : 'fail', json);
    } catch (e: any) {
      update(name, 'fail', e.message);
    }
  };

  const testInsertNotePage = async (filePath: string) => {
    const name = 'insertNotePage';
    update(name, 'running', '');
    if (!filePath) {
      update(name, 'fail', 'Needs active note context');
      return;
    }

    const templates = templatesRef.current;
    if (templates.length === 0) {
      update(name, 'fail', 'No templates available');
      return;
    }

    const t = templates[0];
    const templateName = typeof t === 'string' ? t : t?.name;

    try {
      const totalRes = await withTimeout(
        PluginFileAPI.getNoteTotalPageNum(filePath),
        5000,
        'getNoteTotalPageNum',
      );
      const total = totalRes?.result ?? 1;

      log('Diag', `insertNotePage: path=${filePath} page=${total} template=${templateName}`);
      const result = await withTimeout(
        PluginFileAPI.insertNotePage({
          notePath: filePath,
          page: total,
          template: templateName,
        }),
        10000,
        name,
      );
      const json = JSON.stringify(result);
      const ok = result?.success || result?.result === true;
      update(name, ok ? 'pass' : 'fail', `page=${total} template=${templateName} ${json}`);

      if (ok) {
        try {
          await withTimeout(PluginFileAPI.removeNotePage(filePath, total), 5000, 'removeNotePage');
        } catch {}
      }
    } catch (e: any) {
      update(name, 'fail', e.message);
    }
  };

  const testOpenFilePath = async (basePath: string) => {
    const name = 'openFilePath';
    update(name, 'running', '');
    try {
      const dir = basePath ? `${basePath}Note/` : '/storage/emulated/0/Note/';
      log('Diag', `openFilePath: ${dir}`);
      const result = await withTimeout(
        FileUtils.openFilePath(dir),
        8000,
        name,
      );
      update(name, result ? 'pass' : 'fail', `result=${result} path=${dir}`);
    } catch (e: any) {
      update(name, 'fail', e.message);
    }
  };

  // --- Navigation tests (run individually, may leave the plugin) ---

  const getNotePath = async (): Promise<string> => {
    if (navNotePath) return navNotePath;
    try {
      const fp = await withTimeout(PluginCommAPI.getCurrentFilePath(), 5000, 'getCurrentFilePath');
      const path = fp?.result || '';
      if (path) {
        setNavNotePath(path);
        return path;
      }
    } catch {}
    return '';
  };

  const testNavOpenFilePath = async () => {
    const path = await getNotePath();
    if (!path) {
      setNavResult('openFilePath: No note path available');
      return;
    }
    setNavResult(`openFilePath: trying ${path}...`);
    log('NavTest', `openFilePath(${path})`);
    try {
      const result = await withTimeout(FileUtils.openFilePath(path), 8000, 'openFilePath');
      const msg = `openFilePath: result=${result} path=${path}`;
      log('NavTest', msg);
      setNavResult(msg);
    } catch (e: any) {
      const msg = `openFilePath: ERROR ${e.message}`;
      log('NavTest', msg);
      setNavResult(msg);
    }
  };

  const testNavLinkingOpenURL = async () => {
    const path = await getNotePath();
    if (!path) {
      setNavResult('Linking.openURL: No note path available');
      return;
    }
    const url = `file://${path}`;
    setNavResult(`Linking.openURL: trying ${url}...`);
    log('NavTest', `Linking.openURL(${url})`);
    try {
      await Linking.openURL(url);
      const msg = `Linking.openURL: called successfully (check if note opened)`;
      log('NavTest', msg);
      setNavResult(msg);
    } catch (e: any) {
      const msg = `Linking.openURL: ERROR ${e.message}`;
      log('NavTest', msg);
      setNavResult(msg);
    }
  };

  const testNavRattaDialog = async () => {
    setNavResult('showRattaDialog: showing...');
    log('NavTest', 'showRattaDialog test');
    try {
      const result = await withTimeout(
        NativeUIUtils.showRattaDialog(
          'Navigate to MyNotes/Meeting.note page 3',
          'Cancel',
          'Go',
          true,
        ),
        15000,
        'showRattaDialog',
      );
      const msg = `showRattaDialog: result=${result} (true=right button, false=left)`;
      log('NavTest', msg);
      setNavResult(msg);
    } catch (e: any) {
      const msg = `showRattaDialog: ERROR ${e.message}`;
      log('NavTest', msg);
      setNavResult(msg);
    }
  };

  const testNavElementBounds = async () => {
    const path = await getNotePath();
    if (!path) {
      setNavResult('Element bounds: No note path available');
      return;
    }
    setNavResult('Element bounds: scanning...');
    log('NavTest', `Scanning elements for link bounds on ${path}`);
    try {
      const pn = await withTimeout(PluginCommAPI.getCurrentPageNum(), 5000, 'getCurrentPageNum');
      const pageNum = pn?.result ?? 0;
      const elemResult = await withTimeout(PluginFileAPI.getElements(pageNum, path), 8000, 'getElements');
      if (!elemResult?.success) {
        setNavResult(`Element bounds: getElements failed: ${JSON.stringify(elemResult)}`);
        return;
      }
      const elements = elemResult.result || [];
      const links = elements.filter((el: any) => el.type === 600);
      const stLinks = links.filter((el: any) => el.link?.destPath?.startsWith('supertask://'));
      const details = links.map((el: any) => {
        const l = el.link || {};
        return `cat=${l.category} X=${l.X} Y=${l.Y} w=${l.width} h=${l.height} dest=${(l.destPath || '').slice(0, 40)} ctrl=[${(l.controlTrailNums || []).join(',')}]`;
      });
      const msg = `${links.length} links (${stLinks.length} supertask):\n${details.join('\n') || '(none)'}`;
      log('NavTest', msg);
      setNavResult(`Element bounds:\n${msg}`);

      // Recycle
      elements.forEach((el: any) => { if (el.recycle) el.recycle(); });
    } catch (e: any) {
      const msg = `Element bounds: ERROR ${e.message}`;
      log('NavTest', msg);
      setNavResult(msg);
    }
  };

  const testOpenNote = async () => {
    const path = await getNotePath();
    if (!path) {
      setNavResult('openNote: No note path available');
      return;
    }
    setNavResult('openNote: opening current note at page 1...');
    log('NavTest', `openNote path=${path} page=1`);

    // openNote handles closePluginView internally (150ms delay)
    const result = await openNote(path, 1);
    if (result.success) {
      log('NavTest', 'openNote: success');
    } else {
      log('NavTest', `openNote: FAILED ${result.error}`);
      setNavResult(`openNote failed: ${result.error}`);
    }
  };

  const testReplaceElements = async (currentPath: string, page: number) => {
    const name = 'replaceElements';
    update(name, 'running', '');
    if (!currentPath) {
      update(name, 'fail', 'No current file path');
      return;
    }
    try {
      await withTimeout(PluginNoteAPI.saveCurrentNote(), 5000, 'saveCurrentNote');

      const getResult = await withTimeout(
        PluginFileAPI.getElements(page, currentPath),
        8000,
        'getElements',
      );
      if (!getResult?.success) {
        update(name, 'fail', `getElements: ${JSON.stringify(getResult)}`);
        return;
      }
      const elements = getResult.result || [];
      const count = Array.isArray(elements) ? elements.length : 0;

      const replaceResult = await withTimeout(
        PluginFileAPI.replaceElements(currentPath, page, Array.isArray(elements) ? elements : []),
        10000,
        'replaceElements',
      );
      const json = JSON.stringify(replaceResult);
      const ok = replaceResult?.success || replaceResult?.result === true;
      update(name, ok ? 'pass' : 'fail', `${count} els roundtripped. ${json}`);
    } catch (e: any) {
      update(name, 'fail', e.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.pop()}>
          <Text style={styles.backText}>{'< Back'}</Text>
        </Pressable>
        <Text style={styles.title}>API Diagnostics</Text>
        <View style={{width: 50}} />
      </View>

      <Pressable
        style={[styles.runButton, running && styles.buttonDisabled]}
        onPress={runAll}
        disabled={running}>
        <Text style={[styles.runText, running && styles.runTextDisabled]}>
          {running ? 'Running...' : 'Run All Tests'}
        </Text>
      </Pressable>

      <ScrollView style={styles.scroll}>
        {results.map((r, i) => (
          <View key={i} style={styles.resultRow}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultIcon}>
                {r.status === 'pass' ? 'OK' : r.status === 'fail' ? 'FAIL' : r.status === 'running' ? '...' : '  '}
              </Text>
              <Text style={styles.resultName}>{r.name}</Text>
            </View>
            {r.detail ? (
              <Text style={styles.resultDetail}>{r.detail}</Text>
            ) : null}
          </View>
        ))}
        {results.length === 0 && !running && !motionActive && motionEvents.length === 0 && (
          <Text style={styles.hint}>
            Tap "Run All Tests" to probe SDK APIs for dashboard.{'\n'}
            Open a note first so file-context tests can run.
          </Text>
        )}
      </ScrollView>

      {/* Navigation Tests */}
      <View style={styles.navSection}>
        <Text style={styles.navTitle}>Navigation Tests</Text>
        <View style={styles.navButtons}>
          <Pressable style={styles.navBtn} onPress={testNavOpenFilePath}>
            <Text style={styles.navBtnText}>openFilePath</Text>
          </Pressable>
          <Pressable style={styles.navBtn} onPress={testNavLinkingOpenURL}>
            <Text style={styles.navBtnText}>Linking.openURL</Text>
          </Pressable>
          <Pressable style={styles.navBtn} onPress={testNavRattaDialog}>
            <Text style={styles.navBtnText}>RattaDialog</Text>
          </Pressable>
          <Pressable style={styles.navBtn} onPress={testNavElementBounds}>
            <Text style={styles.navBtnText}>Link Bounds</Text>
          </Pressable>
        </View>
        {navResult ? (
          <Text style={styles.navResult}>{navResult}</Text>
        ) : (
          <Text style={styles.navHint}>Test APIs for opening notes. Open a note with supertask links first.</Text>
        )}
        <Text style={[styles.navTitle, {marginTop: 8}]}>Intent Navigation (closes plugin)</Text>
        <View style={styles.navButtons}>
          <Pressable style={styles.navBtn} onPress={testOpenNote}>
            <Text style={styles.navBtnText}>openNote (p.1)</Text>
          </Pressable>
        </View>
      </View>

      {/* Motion Listener Test */}
      <View style={styles.motionSection}>
        <View style={styles.motionHeader}>
          <Text style={styles.motionTitle}>Motion Listener</Text>
          <View style={{flexDirection: 'row', gap: 8}}>
            {!motionActive && (
              <Pressable style={styles.motionBtn} onPress={startAndClose}>
                <Text style={styles.motionBtnText}>Start & Close</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.motionBtn, motionActive && styles.motionBtnActive]}
              onPress={motionActive ? stopMotionListener : startMotionListener}>
              <Text style={[styles.motionBtnText, motionActive && styles.motionBtnTextActive]}>
                {motionActive ? 'Stop' : 'Start'}
              </Text>
            </Pressable>
          </View>
        </View>
        {motionEvents.length > 0 && (
          <ScrollView style={styles.motionLog} nestedScrollEnabled>
            {motionEvents.map((line, i) => (
              <Text key={i} style={styles.motionLine}>{line}</Text>
            ))}
          </ScrollView>
        )}
        {motionActive && motionEvents.length === 0 && (
          <Text style={styles.motionHint}>Listening... touch the screen with pen or finger</Text>
        )}
        {!motionActive && _motionCount > 0 && motionEvents.length > 0 && (
          <Text style={styles.motionHint}>Captured {_motionCount} events (showing last 200)</Text>
        )}
      </View>
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
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  runButton: {
    margin: 16,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  buttonDisabled: {
    backgroundColor: '#ffffff',
    borderColor: '#cccccc',
  },
  runText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  runTextDisabled: {
    color: '#cccccc',
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  resultRow: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultIcon: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: '#000000',
    width: 36,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  resultDetail: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#000000',
    marginTop: 4,
    marginLeft: 44,
    lineHeight: 16,
  },
  hint: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
    padding: 16,
  },

  // Navigation tests
  navSection: {
    borderTopWidth: 2,
    borderTopColor: '#000000',
    padding: 12,
    maxHeight: 200,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  navButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  navBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
  },
  navBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },
  navResult: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#000000',
    lineHeight: 16,
  },
  navHint: {
    fontSize: 13,
    color: '#666666',
    fontStyle: 'italic',
  },

  // Motion listener
  motionSection: {
    borderTopWidth: 2,
    borderTopColor: '#000000',
    padding: 12,
    maxHeight: 240,
  },
  motionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  motionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  motionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
  },
  motionBtnActive: {
    backgroundColor: '#000000',
  },
  motionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  motionBtnTextActive: {
    color: '#ffffff',
  },
  motionLog: {
    flex: 1,
  },
  motionLine: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#000000',
    lineHeight: 16,
  },
  motionHint: {
    fontSize: 13,
    color: '#666666',
    fontStyle: 'italic',
  },
});
