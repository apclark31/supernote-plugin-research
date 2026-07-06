/**
 * SuperTask - Root component
 *
 * Stack-based navigation for drill-down flows.
 * Reads initial button ID from global (set by index.js before mount),
 * then registers listeners for subsequent presses.
 *
 * @format
 */

import React, {useState, useEffect, useCallback, useRef} from 'react';
import {View, Text, ScrollView, Pressable, StyleSheet} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

import TaskHome from './src/screens/TaskHome';
import ProjectView from './src/screens/ProjectView';
import TaskDetail from './src/screens/TaskDetail';
import TaskAdd from './src/screens/TaskAdd';
import Capture from './src/screens/Capture';
import QuickAdd from './src/screens/QuickAdd';
import Config from './src/screens/Config';
import Diagnostics from './src/screens/Diagnostics';
import {log, logError, getEntries, setListener, exportLog, setDebugMode} from './src/utils/debug';
import {initGestureDetector} from './src/utils/gestureDetector';
import {closePlugin} from './src/utils/closePlugin';
import {loadConfig} from './src/utils/config';
import {getTask as getRegistryTask} from './src/utils/taskRegistry';
import {setConfigLoader, getTask as getApiTask, getProjects} from './src/api/todoist';

type ScreenEntry = {
  name: string;
  params?: Record<string, any>;
  id: number;
};

// Read the initial button ID set by index.js before React mounted
function getInitialScreen(): ScreenEntry {
  // Check for deep link from gesture detector
  const deepLink = global.__superTaskDeepLink;
  if (deepLink) {
    global.__superTaskDeepLink = null; // Consume it
    if (deepLink.action === 'view-task' && deepLink.taskId) {
      return {name: 'deep-link-loading', params: {taskId: deepLink.taskId}, id: 0};
    }
    if (deepLink.action === 'lasso-add') {
      return {name: 'capture-lasso', id: 0};
    }
    if (deepLink.action === 'view-project' && deepLink.projectId) {
      return {name: 'project-view', params: {projectId: deepLink.projectId, projectName: deepLink.projectName || 'Project'}, id: 0};
    }
    if (deepLink.action === 'this-page') {
      return {name: 'task-home', params: {focusTab: deepLink.focusTab || 'today'}, id: 0};
    }
  }

  const raw = global.__superTaskButtonId;
  // Coerce to number for comparison -- SDK may pass string or number
  const buttonId = typeof raw === 'string' ? parseInt(raw, 10) || raw : raw;
  if (buttonId === 200) return {name: 'capture-lasso', id: 0};
  if (buttonId === 300) return {name: 'capture-doc', id: 0};
  if (raw === 'config') return {name: 'config', id: 0};
  return {name: 'task-home', id: 0};
}

/**
 * DeepLinkLoader -- transitional screen that resolves a task ID into
 * full task data, then navigates to TaskDetail.
 */
function DeepLinkLoader({taskId, nav}: {taskId: string; nav: any}) {
  const [status, setStatus] = useState('Loading task...');

  useEffect(() => {
    (async () => {
      log('DeepLink', `Loading task ${taskId}`);
      setConfigLoader(loadConfig);

      try {
        // Fetch task and projects in parallel (single task by ID, not all tasks)
        const [taskResult, projectsResult] = await Promise.allSettled([
          getApiTask(taskId),
          getProjects(),
        ]);

        const projects = projectsResult.status === 'fulfilled' ? (projectsResult.value || []) : [];
        if (projectsResult.status === 'rejected') {
          log('DeepLink', `Projects fetch failed: ${projectsResult.reason?.message}`);
        }

        if (taskResult.status === 'fulfilled' && taskResult.value) {
          log('DeepLink', `Found task: "${taskResult.value.content}"`);
          nav.replace('task-detail', {task: taskResult.value, projects});
          return;
        }
        if (taskResult.status === 'rejected') {
          log('DeepLink', `API fetch failed: ${taskResult.reason?.message}`);
        }

        // Fallback: build minimal task object from registry
        const regTask = await getRegistryTask(taskId);
        if (regTask) {
          log('DeepLink', `Found task in registry: "${regTask.content}"`);
          nav.replace('task-detail', {
            task: {id: taskId, content: regTask.content, description: '', priority: 1},
            projects,
          });
          return;
        }

        // Not found anywhere
        log('DeepLink', `Task ${taskId} not found`);
        setStatus(`Task not found: ${taskId}`);
        setTimeout(() => nav.resetTo('task-home'), 2000);
      } catch (e: any) {
        logError('DeepLink', e);
        setStatus(`Error: ${e.message}`);
        setTimeout(() => nav.resetTo('task-home'), 2000);
      }
    })();
  }, []);

  return (
    <View style={{flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center', padding: 24}}>
      <Text style={{fontSize: 16, fontWeight: '700', color: '#000000'}}>{status}</Text>
    </View>
  );
}

let navIdCounter = 0;

function App(): React.JSX.Element {
  const [screenStack, setScreenStack] = useState<ScreenEntry[]>([getInitialScreen()]);
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [exportStatus, setExportStatus] = useState('');
  const resetToRef = useRef<(name: string, params?: Record<string, any>) => void>();

  const push = useCallback((name: string, params?: Record<string, any>) => {
    log('App', `push: ${name} ${params ? JSON.stringify(params) : ''}`);
    setScreenStack(prev => [...prev, {name, params, id: ++navIdCounter}]);
  }, []);

  const pop = useCallback(() => {
    setScreenStack(prev => {
      if (prev.length <= 1) return prev;
      log('App', `pop: back to ${prev[prev.length - 2].name}`);
      return prev.slice(0, -1);
    });
  }, []);

  const replace = useCallback((name: string, params?: Record<string, any>) => {
    log('App', `replace: ${name}`);
    setScreenStack(prev => [...prev.slice(0, -1), {name, params, id: ++navIdCounter}]);
  }, []);

  const resetTo = useCallback((name: string, params?: Record<string, any>) => {
    log('App', `resetTo: ${name}`);
    setScreenStack([{name, params, id: ++navIdCounter}]);
  }, []);

  resetToRef.current = resetTo;

  useEffect(() => {
    setListener(setDebugLog);
    loadConfig().then(config => {
      if (config.debugMode) setDebugMode(true);
    });

    const initial = global.__superTaskButtonId;
    log('App', `MOUNT -- initial buttonId=${JSON.stringify(initial)} screen=${screenStack[0].name}`);

    // Gesture detector is initialized in index.js (before mount) so
    // long-press detection works even on a fresh note view. We still
    // call init here as a guard in case index.js init was too early.
    initGestureDetector();

    // Expose a navigate callback so the gesture detector can route
    // directly when the App is already mounted (re-show via showPluginView).
    // For first-mount, getInitialScreen() reads the global instead.
    global.__superTaskNavigate = (screen: string, params?: Record<string, any>) => {
      log('App', `__superTaskNavigate: ${screen} ${params ? JSON.stringify(params) : ''}`);
      resetToRef.current?.(screen, params);
    };

    // Register listeners for subsequent button presses (e.g., switching
    // between tasks and config without closing the plugin view)
    const configSub = PluginManager.registerConfigButtonListener({
      onClick: () => {
        log('App', 'CONFIG button pressed (listener)');
        resetToRef.current?.('config');
      },
      onConfigButtonPress: () => {
        log('App', 'CONFIG button pressed (listener/legacy)');
        resetToRef.current?.('config');
      },
    });

    const buttonSub = PluginManager.registerButtonListener({
      onButtonPress: (event: any) => {
        const raw = event?.id;
        const id = typeof raw === 'string' ? parseInt(raw, 10) || raw : raw;
        log('App', `BUTTON pressed raw=${JSON.stringify(raw)} id=${id} (listener)`);
        if (id === 200) {
          resetToRef.current?.('capture-lasso');
        } else if (id === 300) {
          resetToRef.current?.('capture-doc');
        } else {
          resetToRef.current?.('task-home');
        }
      },
    });

    return () => {
      log('App', 'UNMOUNT -- removing listeners');
      global.__superTaskNavigate = null;
      if (configSub?.remove) configSub.remove();
      if (buttonSub?.remove) buttonSub.remove();
    };
  }, []);

  const current = screenStack[screenStack.length - 1];
  const canGoBack = screenStack.length > 1;

  useEffect(() => {
    log('App', `SCREEN changed: "${current.name}" stackDepth=${screenStack.length} params=${current.params ? Object.keys(current.params).join(',') : 'none'}`);
  }, [screenStack]);

  // Show debug log on error or when navigated to
  if (error || current.name === 'debug') {
    return (
      <View style={styles.container}>
        <View style={styles.debugHeader}>
          <Text style={styles.debugTitle}>
            {error ? 'Error' : 'Debug Log'}
          </Text>
          <View style={styles.debugButtons}>
            <Pressable
              style={styles.debugButton}
              onPress={async () => {
                setExportStatus('Uploading...');
                const result = await exportLog();
                setExportStatus(result);
              }}>
              <Text style={styles.debugButtonText}>Upload Log</Text>
            </Pressable>
            <Pressable
              style={styles.debugButton}
              onPress={() => { setError(null); resetTo('task-home'); }}>
              <Text style={styles.debugButtonText}>Tasks</Text>
            </Pressable>
            <Pressable
              style={styles.debugButton}
              onPress={() => closePlugin()}>
              <Text style={styles.debugButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}
        {exportStatus ? (
          <Text style={styles.exportStatus}>{exportStatus}</Text>
        ) : null}
        <ScrollView style={styles.debugScroll}>
          {getEntries().map((entry, i) => (
            <Text key={i} style={styles.debugEntry}>{entry}</Text>
          ))}
          {getEntries().length === 0 && (
            <Text style={styles.debugEntry}>No log entries yet.</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  const nav = {push, pop, replace, resetTo, canGoBack};
  const isOverlay = current.name === 'capture-lasso';

  return (
    <View style={[styles.container, isOverlay && styles.containerOverlay]}>
      {current.name === 'task-home' && (
        <TaskHome key={current.id} nav={nav} />
      )}
      {current.name === 'project-view' && (
        <ProjectView key={current.id} nav={nav} projectId={current.params?.projectId} projectName={current.params?.projectName} />
      )}
      {current.name === 'task-detail' && (
        <TaskDetail key={current.id} nav={nav} task={current.params?.task} projects={current.params?.projects} />
      )}
      {current.name === 'task-add' && (
        <TaskAdd
          key={current.id}
          nav={nav}
          projects={current.params?.projects || []}
          defaultProjectId={current.params?.defaultProjectId}
          initialContent={current.params?.initialContent}
          initialDescription={current.params?.initialDescription}
          captureMode={current.params?.captureMode}
          noteContext={current.params?.noteContext}
        />
      )}
      {current.name === 'capture-lasso' && (
        <QuickAdd key={current.id} nav={nav} />
      )}
      {current.name === 'capture-doc' && (
        <Capture key={current.id} mode="doc" nav={nav} />
      )}
      {current.name === 'deep-link-loading' && (
        <DeepLinkLoader key={current.id} taskId={current.params?.taskId} nav={nav} />
      )}
      {current.name === 'config' && (
        <Config key={current.id} onNavigate={(s: string) => resetTo(s)} nav={nav} />
      )}
      {current.name === 'diagnostics' && (
        <Diagnostics key={current.id} nav={nav} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  containerOverlay: {
    backgroundColor: 'transparent',
  },
  debugHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  debugTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  debugButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  debugButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
  },
  debugButtonText: {
    fontSize: 14,
    color: '#000000',
  },
  errorText: {
    padding: 16,
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    backgroundColor: '#f0f0f0',
  },
  debugScroll: {
    flex: 1,
    padding: 12,
  },
  debugEntry: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#000000',
    marginBottom: 4,
    lineHeight: 16,
  },
  exportStatus: {
    padding: 8,
    fontSize: 13,
    color: '#000000',
    backgroundColor: '#e8e8e8',
    textAlign: 'center',
  },
});

export default App;
