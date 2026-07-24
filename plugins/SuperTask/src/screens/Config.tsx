/**
 * Config screen - Compact e-ink layout
 *
 * Two tabs: Connections (API token, config source) and Preferences
 * (all settings use horizontal controls for space efficiency).
 *
 * Config persistence: reads/writes config via RNFS JSON file (react-native-fs).
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Clipboard,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {closePlugin} from '../utils/closePlugin';
import {loadConfig, saveConfig, getConfigSource, reloadConfig, wasTemplateGenerated} from '../utils/config';
import {setConfigLoader, testConnection, getProjects} from '../api/todoist';
import {log} from '../utils/debug';
import {reloadGestureConfig} from '../utils/gestureDetector';

type Props = {
  onNavigate: (screen: string) => void;
  nav?: {push: (name: string, params?: Record<string, any>) => void; pop: () => void; replace: (name: string, params?: Record<string, any>) => void; resetTo: (name: string, params?: Record<string, any>) => void; canGoBack: boolean};
};

const TAB_OPTIONS = [
  {key: 'today', label: 'Today'},
  {key: 'upcoming', label: 'Upcoming'},
  {key: 'projects', label: 'Projects'},
];

export default function Config({onNavigate, nav}: Props) {
  const [activeTab, setActiveTab] = useState('connections');
  const [token, setToken] = useState('');
  const [tokenMasked, setTokenMasked] = useState(true);
  const [status, setStatus] = useState('');
  const [configSource, setConfigSource] = useState('defaults');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [enabledProjectIds, setEnabledProjectIds] = useState<string[]>([]);
  const [defaultTab, setDefaultTab] = useState('today');
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);
  const [postCreateAction, setPostCreateAction] = useState('prompt');
  const [defaultScreen, setDefaultScreen] = useState('task-home');
  const [debugMode, setDebugMode] = useState(false);
  const [markAsTextFontSize, setMarkAsTextFontSize] = useState(32);
  const [lassoGestureInput, setLassoGestureInput] = useState('off');
  const [showTokenInfo, setShowTokenInfo] = useState(false);
  const [showGestureInfo, setShowGestureInfo] = useState(false);

  useEffect(() => {
    log('Config', 'MOUNT -- loading saved config');
    loadConfig().then(async config => {
      log('Config', `Config loaded: hasToken=${!!config.apiToken} defaultTab=${config.defaultTab}`);
      if (config.apiToken) {
        setToken(config.apiToken);
        setActiveTab('preferences');
      }
      if (config.enabledProjectIds) setEnabledProjectIds(config.enabledProjectIds);
      if (config.defaultTab) setDefaultTab(config.defaultTab);
      if (config.defaultProjectId) setDefaultProjectId(config.defaultProjectId);
      if (config.postCreateAction) setPostCreateAction(config.postCreateAction);
      if (config.defaultScreen) setDefaultScreen(config.defaultScreen);
      if (config.debugMode !== undefined) setDebugMode(config.debugMode);
      if (config.markAsTextFontSize) setMarkAsTextFontSize(config.markAsTextFontSize);
      if (config.lassoGestureInput) setLassoGestureInput(
        config.lassoGestureInput === 'off' ? 'off'
        : config.lassoGestureInput === 'pen-lasso' ? 'pen-lasso'
        : 'finger'
      );

      setConfigSource(getConfigSource());

      if (config.apiToken) {
        try {
          setConfigLoader(() => Promise.resolve({apiToken: config.apiToken}));
          log('Config', 'Auto-fetching projects...');
          const fetched = await getProjects();
          setProjects(fetched || []);
          log('Config', `Auto-fetched ${fetched?.length ?? 0} projects`);
        } catch (err: any) {
          log('Config', `Auto-fetch projects failed: ${err.message}`);
        }
      }
    });
  }, []);

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getString();
      if (text && text.trim()) {
        setToken(text.trim());
        log('Config', `Pasted token from clipboard (${text.trim().length} chars)`);
      } else {
        log('Config', 'Clipboard empty');
      }
    } catch (err: any) {
      log('Config', `Clipboard paste failed: ${err.message}`);
    }
  };

  const handleTestConnection = async () => {
    const t = token.trim();
    if (!t) {
      setStatus('Enter an API token first');
      return;
    }

    setStatus('Testing...');
    setConfigLoader(() => Promise.resolve({apiToken: t}));

    try {
      const result = await testConnection();
      setStatus(`Connected! ${result.taskCount} tasks, ${result.projectCount} projects`);
      log('Config', `Connected: ${result.taskCount} tasks, ${result.projectCount} projects`);

      const fetchedProjects = await getProjects();
      setProjects(fetchedProjects || []);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const toggleProject = (projectId: string) => {
    setEnabledProjectIds(prev =>
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId],
    );
  };

  const handleSave = async () => {
    log('Config', 'SAVE pressed');
    setSaving(true);
    const saved = await saveConfig({
      apiToken: token.trim(),
      enabledProjectIds,
      defaultTab,
      defaultProjectId,
      postCreateAction,
      defaultScreen,
      debugMode,
      markAsTextFontSize,
      lassoGestureInput,
    });
    setSaving(false);
    setSaveStatus(saved ? 'Saved to device' : 'Saved (session only)');
    setConfigSource(getConfigSource());
    reloadGestureConfig();
    setTimeout(() => setSaveStatus(''), 2000);
  };

  const sourceLabel = (s: string) => {
    switch (s) {
      case 'file': return 'Device file';
      case 'bundled': return 'Build config';
      default: return 'Not saved';
    }
  };

  // ── Connections Tab ──────────────────────────────────────
  const renderConnectionsTab = () => (
    <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={s.inlineRow}>
        <Text style={s.sectionTitle}>Todoist API Token</Text>
        <Pressable style={s.infoBtn} onPress={() => setShowTokenInfo(true)}>
          <Text style={s.infoBtnText}>?</Text>
        </Pressable>
      </View>
      <View style={s.tokenRow}>
        <TextInput
          style={[s.input, {flex: 1}]}
          value={token}
          onChangeText={setToken}
          placeholder="Paste your API token"
          secureTextEntry={tokenMasked}
        />
        <Pressable style={s.btnSmall} onPress={handlePaste}>
          <Text style={s.btnSmallText}>Paste</Text>
        </Pressable>
        <Pressable style={s.btnSmall} onPress={() => setTokenMasked(!tokenMasked)}>
          <Text style={s.btnSmallText}>{tokenMasked ? 'Show' : 'Hide'}</Text>
        </Pressable>
      </View>
      <Text style={s.hint}>todoist.com/prefs/integrations &gt; API token</Text>

      {!token && wasTemplateGenerated() && (
        <View style={s.setupNotice}>
          <Text style={s.setupNoticeText}>
            Config file created at MyStyle/SuperTask/supertask-config.json.
            Connect via USB to add your token, or tap ? above for all options.
          </Text>
        </View>
      )}

      <View style={s.inlineRow}>
        <Pressable style={s.btnAction} onPress={handleTestConnection}>
          <Text style={s.btnActionText}>Test Connection</Text>
        </Pressable>
        {status ? <Text style={s.statusInline}>{status}</Text> : null}
      </View>

      <View style={s.separator} />

      <Text style={s.sectionTitle}>Config Source</Text>
      <View style={s.inlineRow}>
        <View style={s.sourceChip}>
          <Text style={s.sourceChipText}>{sourceLabel(configSource)}</Text>
        </View>
        <Text style={s.hint}>
          {configSource === 'file'
            ? 'MyStyle/SuperTask/supertask-config.json'
            : configSource === 'bundled'
            ? 'Using build-time config.local.js'
            : 'No persistent config found'}
        </Text>
      </View>
    </ScrollView>
  );

  // ── Preferences Tab ──────────────────────────────────────
  const renderPreferencesTab = () => (
    <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
      {/* ── General ── */}
      <Text style={s.groupTitle}>General</Text>

      <Text style={s.sectionTitle}>Default tab</Text>
      <View style={s.toggleRow}>
        {TAB_OPTIONS.map(opt => (
          <Pressable
            key={opt.key}
            style={[s.toggleBtn, defaultTab === opt.key && s.toggleBtnActive]}
            onPress={() => setDefaultTab(opt.key)}>
            <Text style={[s.toggleText, defaultTab === opt.key && s.toggleTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.sectionTitle}>After creating a task</Text>
      <View style={s.inlineRow}>
        <Pressable style={s.radioRow} onPress={() => setPostCreateAction('prompt')}>
          <Text style={s.radio}>{postCreateAction === 'prompt' ? '(*)' : '( )'}</Text>
          <Text style={s.radioLabel}>Ask (Add/Done)</Text>
        </Pressable>
        <Pressable style={s.radioRow} onPress={() => setPostCreateAction('auto-back')}>
          <Text style={s.radio}>{postCreateAction === 'auto-back' ? '(*)' : '( )'}</Text>
          <Text style={s.radioLabel}>Go back</Text>
        </Pressable>
      </View>

      <Text style={s.sectionTitle}>Open plugin to</Text>
      <View style={s.inlineRow}>
        <Pressable style={s.radioRow} onPress={() => setDefaultScreen('task-home')}>
          <Text style={s.radio}>{defaultScreen === 'task-home' ? '(*)' : '( )'}</Text>
          <Text style={s.radioLabel}>Task Home</Text>
        </Pressable>
        <Pressable style={s.radioRow} onPress={() => setDefaultScreen('last-used')}>
          <Text style={s.radio}>{defaultScreen === 'last-used' ? '(*)' : '( )'}</Text>
          <Text style={s.radioLabel}>Last Used</Text>
        </Pressable>
      </View>

      {/* ── Projects ── */}
      {projects.length > 0 && (
        <>
          <View style={s.separator} />
          <Text style={s.groupTitle}>Projects</Text>

          <Text style={s.sectionTitle}>
            Show projects  <Text style={s.hint}>Select which to show</Text>
          </Text>
          <View style={s.checkGrid}>
            {projects.map(p => {
              const enabled = enabledProjectIds.includes(p.id);
              return (
                <Pressable key={p.id} style={s.checkItem} onPress={() => toggleProject(p.id)}>
                  <Text style={s.checkbox}>{enabled ? '[X]' : '[  ]'}</Text>
                  <Text style={s.checkLabel} numberOfLines={1}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={s.sectionTitle}>Default project for new tasks</Text>
          <View style={s.buttonGrid}>
            <Pressable
              style={[s.gridBtn, !defaultProjectId && s.gridBtnActive]}
              onPress={() => setDefaultProjectId(null)}>
              <Text style={[s.gridBtnText, !defaultProjectId && s.gridBtnTextActive]}>None</Text>
            </Pressable>
            {projects.map(p => (
              <Pressable
                key={p.id}
                style={[s.gridBtn, defaultProjectId === p.id && s.gridBtnActive]}
                onPress={() => setDefaultProjectId(p.id)}>
                <Text style={[s.gridBtnText, defaultProjectId === p.id && s.gridBtnTextActive]}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* ── Handwriting ── */}
      <View style={s.separator} />
      <Text style={s.groupTitle}>Handwriting</Text>

      <View style={s.inlineRow}>
        <Text style={s.sectionTitle}>Quick Add Gesture</Text>
        <Pressable style={s.infoBtn} onPress={() => setShowGestureInfo(true)}>
          <Text style={s.infoBtnText}>i</Text>
        </Pressable>
      </View>
      <View style={s.inlineRow}>
        <Pressable style={s.radioRow} onPress={() => setLassoGestureInput('off')}>
          <Text style={s.radio}>{lassoGestureInput === 'off' ? '(*)' : '( )'}</Text>
          <Text style={s.radioLabel}>Off</Text>
        </Pressable>
        <Pressable style={s.radioRow} onPress={() => setLassoGestureInput('finger')}>
          <Text style={s.radio}>{lassoGestureInput === 'finger' ? '(*)' : '( )'}</Text>
          <Text style={s.radioLabel}>Finger lasso</Text>
        </Pressable>
        <Pressable style={s.radioRow} onPress={() => setLassoGestureInput('pen-lasso')}>
          <Text style={s.radio}>{lassoGestureInput === 'pen-lasso' ? '(*)' : '( )'}</Text>
          <Text style={s.radioLabel}>Pen lasso</Text>
        </Pressable>
      </View>
      <Text style={s.hint}>  Long press on a linked task always works (any mode)</Text>

      <Text style={s.sectionTitle}>Mark as text font size</Text>
      <View style={s.inlineRow}>
        <Text style={s.sizeLabel}>Size:</Text>
        {[24, 28, 32, 36, 40].map(size => (
          <Pressable
            key={size}
            style={[s.sizeBtn, markAsTextFontSize === size && s.sizeBtnActive]}
            onPress={() => setMarkAsTextFontSize(size)}>
            <Text style={[s.sizeBtnText, markAsTextFontSize === size && s.sizeBtnTextActive]}>
              {size}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Advanced ── */}
      <View style={s.separator} />
      <Text style={s.groupTitle}>Advanced</Text>

      <Pressable style={s.radioRow} onPress={() => setDebugMode(!debugMode)}>
        <Text style={s.checkbox}>{debugMode ? '[X]' : '[  ]'}</Text>
        <Text style={s.radioLabel}>Debug mode</Text>
        <Text style={s.hint}>  Show Log buttons</Text>
      </Pressable>

      {debugMode && nav && (
        <Pressable style={[s.btnAction, {marginTop: 8}]} onPress={() => nav.push('diagnostics')}>
          <Text style={s.btnActionText}>API Diagnostics</Text>
        </Pressable>
      )}
    </ScrollView>
  );

  // ── Main Layout ──────────────────────────────────────────
  return (
    <View style={s.wrapper}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Settings</Text>
        <View style={s.headerBtns}>
          <Pressable style={s.headerBtn} onPress={handleSave} disabled={saving}>
            <Text style={s.headerBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
          {nav?.canGoBack ? (
            <Pressable style={s.headerBtn} onPress={() => nav.pop()}>
              <Text style={s.headerBtnText}>Back</Text>
            </Pressable>
          ) : (
            <Pressable style={s.headerBtn} onPress={() => closePlugin()}>
              <Text style={s.headerBtnText}>Close</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        <Pressable
          style={[s.tab, activeTab === 'connections' && s.tabActive]}
          onPress={() => setActiveTab('connections')}>
          <Text style={[s.tabText, activeTab === 'connections' && s.tabTextActive]}>Connections</Text>
        </Pressable>
        <Pressable
          style={[s.tab, activeTab === 'preferences' && s.tabActive]}
          onPress={() => setActiveTab('preferences')}>
          <Text style={[s.tabText, activeTab === 'preferences' && s.tabTextActive]}>Preferences</Text>
        </Pressable>
      </View>

      {/* Body */}
      <View style={s.body}>
        {activeTab === 'connections' ? renderConnectionsTab() : renderPreferencesTab()}
      </View>

      {/* Token info popup */}
      {showTokenInfo && (
        <Pressable style={s.overlayCenter} onPress={() => setShowTokenInfo(false)}>
          <Pressable style={s.overlayModal} onPress={() => {}}>
            <Text style={s.overlayTitle}>How to enter your API token</Text>
            <Text style={s.overlayHint}>
              Go to todoist.com/prefs/integrations and scroll to "API token" to find yours.
              You only need to do this once -- your token is saved to the device and persists across reinstalls.
            </Text>

            <View style={s.overlaySeparator} />

            <Text style={s.methodLabel}>1. Edit config via USB (easiest)</Text>
            <Text style={s.methodBody}>
              A config file was created on your device at:{'\n'}
              MyStyle/SuperTask/supertask-config.json{'\n'}
              {'\n'}
              Connect your Supernote to a computer via USB, open the file in a text editor, and replace YOUR_TOKEN_HERE with your actual token. Save the file and reopen the plugin.{'\n'}
              {'\n'}
              Your plain text token will be automatically obfuscated the next time the plugin loads.
            </Text>

            <View style={s.overlaySeparator} />

            <Text style={s.methodLabel}>2. Bluetooth keyboard</Text>
            <Text style={s.methodBody}>
              Pair a Bluetooth keyboard (Supernote Settings &gt; Bluetooth), then tap the token field above and paste with Ctrl+V. Tap Save when done.
            </Text>

            <View style={s.overlaySeparator} />

            <Text style={s.methodLabel}>3. On-screen keyboard</Text>
            <Text style={s.methodBody}>
              Tap the token field above and type the 40-character token using the on-screen keyboard. Slow, but you only need to do it once. Tap Save when done.
            </Text>

            <Pressable style={s.overlayCloseBtn} onPress={() => setShowTokenInfo(false)}>
              <Text style={s.overlayCloseBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

      {/* Gesture info popup */}
      {showGestureInfo && (
        <Pressable style={s.overlayCenter} onPress={() => setShowGestureInfo(false)}>
          <Pressable style={s.overlayModal} onPress={() => {}}>
            <Text style={s.overlayTitle}>Quick Add Gestures</Text>
            <Text style={s.overlayHint}>
              Choose how to quickly capture handwriting as a task without using the lasso toolbar button.
            </Text>

            <View style={s.overlaySeparator} />

            <Text style={s.methodLabel}>Finger lasso</Text>
            <Text style={s.methodBody}>
              Hold one finger on the page for about half a second, then drag to draw a selection area. When you lift your finger, the selected content is sent to Quick Add.{'\n'}
              {'\n'}
              The selection is invisible while you draw -- you won't see the lasso outline. Best for quickly grabbing a rough area of handwriting.
            </Text>

            <View style={s.overlaySeparator} />

            <Text style={s.methodLabel}>Pen lasso</Text>
            <Text style={s.methodBody}>
              Hold one finger on the screen, then use your pen to draw a lasso selection as you normally would. You'll see the native lasso outline as you draw. When you lift your finger, the selected content is sent to Quick Add.{'\n'}
              {'\n'}
              This gives you the visible lasso feedback you're used to, with the speed of skipping the toolbar button.
            </Text>

            <View style={s.overlaySeparator} />

            <Text style={s.methodLabel}>Long press (always on)</Text>
            <Text style={s.methodBody}>
              Long press (~1 second) on any content linked to a task to open its detail view. This works regardless of which gesture mode is selected.
            </Text>

            <Pressable style={s.overlayCloseBtn} onPress={() => setShowGestureInfo(false)}>
              <Text style={s.overlayCloseBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

      {/* Save toast */}
      {saveStatus ? (
        <View style={s.toast}>
          <Text style={s.toastText}>{saveStatus}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {flex: 1, backgroundColor: '#ffffff'},

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {fontSize: 24, fontWeight: '700', color: '#000000'},
  headerBtns: {flexDirection: 'row', gap: 8},
  headerBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
  },
  headerBtnText: {fontSize: 16, fontWeight: '600', color: '#000000'},

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {borderBottomColor: '#000000'},
  tabText: {fontSize: 16, color: '#888888', fontWeight: '500'},
  tabTextActive: {color: '#000000', fontWeight: '700'},

  // Body
  body: {flex: 1},
  scroll: {flex: 1},
  scrollContent: {padding: 20, paddingBottom: 40},

  // Sections
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    marginTop: 10,
    marginBottom: 6,
  },
  hint: {fontSize: 12, color: '#666666', fontWeight: '400'},
  separator: {height: 1, backgroundColor: '#cccccc', marginVertical: 14},

  // Inputs
  input: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#000000',
  },
  tokenRow: {flexDirection: 'row', gap: 6, marginBottom: 4},

  // Buttons
  btnSmall: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    justifyContent: 'center',
  },
  btnSmallText: {fontSize: 13, fontWeight: '600', color: '#000000'},
  btnDisabled: {borderColor: '#aaaaaa'},
  btnDisabledText: {color: '#aaaaaa'},
  btnAction: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  btnActionText: {fontSize: 15, fontWeight: '700', color: '#000000'},

  // Inline row
  inlineRow: {flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap'},

  // Status
  statusInline: {fontSize: 14, color: '#000000'},

  // Config source chip
  sourceChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
  },
  sourceChipText: {fontSize: 13, fontWeight: '600', color: '#000000'},

  // Toggle row (horizontal buttons like Default tab)
  toggleRow: {flexDirection: 'row', gap: 6},
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#000000',
    alignItems: 'center',
  },
  toggleBtnActive: {backgroundColor: '#000000'},
  toggleText: {fontSize: 14, fontWeight: '600', color: '#000000'},
  toggleTextActive: {color: '#ffffff'},

  // Radio
  radioRow: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6},
  radio: {fontSize: 15, fontWeight: '700', color: '#000000', fontFamily: 'monospace'},
  radioLabel: {fontSize: 15, color: '#000000'},

  // Checkbox
  checkbox: {fontSize: 15, fontWeight: '700', color: '#000000', fontFamily: 'monospace'},
  checkLabel: {fontSize: 14, color: '#000000', flex: 1},

  // 2-column checkbox grid
  checkGrid: {flexDirection: 'row', flexWrap: 'wrap'},
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '50%',
    paddingVertical: 6,
  },

  // Button grid (default project, wrapping)
  buttonGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  gridBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
  },
  gridBtnActive: {backgroundColor: '#000000'},
  gridBtnText: {fontSize: 13, fontWeight: '600', color: '#000000'},
  gridBtnTextActive: {color: '#ffffff'},

  // Size picker
  sizeLabel: {fontSize: 14, fontWeight: '600', color: '#000000', marginRight: 4},
  sizeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#000000',
  },
  sizeBtnActive: {backgroundColor: '#000000'},
  sizeBtnText: {fontSize: 14, color: '#000000'},
  sizeBtnTextActive: {color: '#ffffff'},

  // Setup notice (first launch)
  setupNotice: {
    marginTop: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: '#000000',
    borderStyle: 'dashed',
    borderRadius: 4,
    backgroundColor: '#f8f8f8',
  },
  setupNoticeText: {
    fontSize: 13,
    color: '#000000',
    lineHeight: 18,
  },

  // Info button
  infoBtn: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  infoBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },

  // Info popup overlay
  overlayCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    zIndex: 20,
    elevation: 20,
  },
  overlayModal: {
    marginHorizontal: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    alignSelf: 'stretch',
    maxHeight: '85%',
  },
  overlayTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 6,
  },
  overlayHint: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 18,
  },
  overlaySeparator: {
    height: 1,
    backgroundColor: '#cccccc',
    marginVertical: 12,
  },
  methodLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  methodBody: {
    fontSize: 13,
    color: '#000000',
    lineHeight: 19,
  },
  overlayCloseBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    alignItems: 'center',
  },
  overlayCloseBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },

  // Toast
  toast: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    padding: 12,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  toastText: {fontSize: 15, fontWeight: '700', color: '#000000'},
});
