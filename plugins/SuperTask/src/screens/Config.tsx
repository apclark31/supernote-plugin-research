/**
 * Config screen -- Settings v2 (F-023, design-settings-v2.md)
 *
 * One scroll, five honest groups, built exclusively on the settings
 * primitives (Section / SettingRow / Segmented / Check / InfoSheet).
 *
 * Persistence model: APPLY ON CHANGE. Every control persists immediately
 * (saveConfig is serialized + atomic per B-025); the changed row shows a
 * "Saved ✓" chip and the header carries the last save result, including
 * an explicit failure state. Only the API token and the log server URL
 * (typed text) use deliberate commit points (Save button / end-editing).
 */

import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Clipboard,
} from 'react-native';
import {closePlugin} from '../utils/closePlugin';
import {loadConfig, saveConfig, getConfigSource, wasTemplateGenerated} from '../utils/config';
import {setConfigLoader, testConnection, getProjects} from '../api/todoist';
import {log} from '../utils/debug';
import {reloadGestureConfig} from '../utils/gestureDetector';
import {importTokenFromFile} from '../utils/tokenImport';
import {
  Section,
  SettingRow,
  Segmented,
  CheckRow,
  CheckItem,
  InfoButton,
  InfoSheet,
  SavedTick,
} from '../components/settings';

type Props = {
  onNavigate: (screen: string) => void;
  nav?: {push: (name: string, params?: Record<string, any>) => void; pop: () => void; replace: (name: string, params?: Record<string, any>) => void; resetTo: (name: string, params?: Record<string, any>) => void; canGoBack: boolean};
};

const TAB_OPTIONS = [
  {key: 'today', label: 'Today'},
  {key: 'upcoming', label: 'Upcoming'},
  {key: 'projects', label: 'Projects'},
  {key: 'device', label: 'On Device'},
];

const GESTURE_OPTIONS = [
  {key: 'off', label: 'Off'},
  {key: 'finger', label: 'Finger lasso'},
  {key: 'pen-lasso', label: 'Pen lasso'},
];

const POST_CREATE_OPTIONS = [
  {key: 'prompt', label: 'Ask (Add / Done)'},
  {key: 'auto-back', label: 'Go back'},
];

const FONT_SIZE_OPTIONS = [24, 28, 32, 36, 40].map(n => ({key: n, label: String(n)}));

const TEXT_SCALE_OPTIONS = [
  {key: 1, label: 'Default'},
  {key: 1.15, label: 'Large'},
  {key: 1.3, label: 'Extra Large'},
];

export default function Config({onNavigate, nav}: Props) {
  // Two pages split by frequency of use: General = everyday settings
  // (short scroll -- e-ink scrolling is imperfect); Setup = touch-once /
  // super-user concerns (account, connection, debugging).
  const [page, setPage] = useState<'general' | 'setup'>('general');

  // Account
  const [token, setToken] = useState('');
  const [tokenMasked, setTokenMasked] = useState(true);
  const [status, setStatus] = useState('');
  const [configSource, setConfigSource] = useState('defaults');
  const [projects, setProjects] = useState<any[]>([]);

  // Settings values
  const [defaultTab, setDefaultTab] = useState('today');
  const [bezelSwipeEnabled, setBezelSwipeEnabled] = useState(false);
  const [threeFingerTapEnabled, setThreeFingerTapEnabled] = useState(false);
  const [lassoGestureInput, setLassoGestureInput] = useState('off');
  const [postCreateAction, setPostCreateAction] = useState('prompt');
  const [markAsTextFontSize, setMarkAsTextFontSize] = useState(32);
  const [enabledProjectIds, setEnabledProjectIds] = useState<string[]>([]);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [debugServerUrl, setDebugServerUrlField] = useState('');
  const [fontScale, setFontScaleField] = useState(1);
  const [importStatus, setImportStatus] = useState('');

  // Apply-on-change feedback
  const [savedRow, setSavedRow] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const savedTimer = useRef<any>(null);

  // Info sheets + transient statuses
  const [infoSheet, setInfoSheet] = useState<'token' | 'gesture' | 'server' | null>(null);
  const [pingStatus, setPingStatus] = useState('');

  useEffect(() => {
    log('Config', 'MOUNT -- loading saved config');
    loadConfig().then(async config => {
      log('Config', `Config loaded: hasToken=${!!config.apiToken} defaultTab=${config.defaultTab}`);
      if (config.apiToken) {
        setToken(config.apiToken);
      } else {
        setPage('setup'); // first run: land on Setup so the token flow is front and center
      }
      if (config.enabledProjectIds) setEnabledProjectIds(config.enabledProjectIds);
      if (config.defaultTab) setDefaultTab(config.defaultTab);
      if (config.defaultProjectId) setDefaultProjectId(config.defaultProjectId);
      if (config.postCreateAction) setPostCreateAction(config.postCreateAction);
      if (config.debugMode !== undefined) setDebugMode(config.debugMode);
      if (config.markAsTextFontSize) setMarkAsTextFontSize(config.markAsTextFontSize);
      if (config.lassoGestureInput) setLassoGestureInput(
        config.lassoGestureInput === 'off' ? 'off'
        : config.lassoGestureInput === 'pen-lasso' ? 'pen-lasso'
        : 'finger'
      );
      setBezelSwipeEnabled(config.bezelSwipeEnabled === true);
      setThreeFingerTapEnabled(config.threeFingerTapEnabled === true);
      if (config.debugServerUrl) setDebugServerUrlField(config.debugServerUrl);
      if (config.fontScale) setFontScaleField(config.fontScale);

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
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  /**
   * Apply-on-change core: persist one change, mark the row saved, update
   * the header status (including the write-failure state), and hot-reload
   * the gesture detector when a gesture key changed.
   */
  const applyChange = async (rowKey: string, partial: Record<string, any>, gesture = false) => {
    const ok = await saveConfig(partial);
    setConfigSource(getConfigSource());
    setLastSaved(new Date().toLocaleTimeString());
    setSaveFailed(!ok);
    setSavedRow(rowKey);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedRow(null), 2000);
    if (gesture) reloadGestureConfig();
    log('Config', `Applied ${Object.keys(partial).join(',')}${ok ? '' : ' (SESSION ONLY -- write failed)'}`);
  };

  // ── Account handlers ─────────────────────────────────────

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

  const handleSaveToken = () => {
    applyChange('token', {apiToken: token.trim()});
  };

  // F-029: no-cable auth -- find supertask-token.txt in a synced folder,
  // import it, delete the plaintext file
  const handleImportToken = async () => {
    setImportStatus('Searching synced folders...');
    const result = await importTokenFromFile();
    setImportStatus(result.message);
    if (result.ok) {
      const config = await loadConfig();
      if (config.apiToken) setToken(config.apiToken);
      setConfigSource(getConfigSource());
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
      setStatus(`Connected: ${result.taskCount} tasks, ${result.projectCount} projects`);
      log('Config', `Connected: ${result.taskCount} tasks, ${result.projectCount} projects`);
      const fetchedProjects = await getProjects();
      setProjects(fetchedProjects || []);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  };

  // ── Projects handlers ────────────────────────────────────

  const toggleProject = (projectId: string) => {
    const next = enabledProjectIds.includes(projectId)
      ? enabledProjectIds.filter(id => id !== projectId)
      : [...enabledProjectIds, projectId];
    setEnabledProjectIds(next);
    applyChange('showProjects', {enabledProjectIds: next});
  };

  // ── Debug server handlers ────────────────────────────────

  const commitServerUrl = () => {
    applyChange('server', {debugServerUrl: debugServerUrl.trim()});
  };

  // Ping the dev server. Tests the FIELD value (pre-save) so a typo is
  // caught before committing. Tries /ping; falls back to GET / for older
  // dev-server builds.
  const handleTestServer = async () => {
    const url = debugServerUrl.trim();
    if (!url) {
      setPingStatus('Enter a URL first (tap ? for setup help)');
      return;
    }
    const base = url.replace(/\/log\/?$/, '');
    setPingStatus('Testing...');
    log('Config', `Server ping test: ${base}/ping`);

    const tryFetch = async (target: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        return await fetch(target, {signal: controller.signal});
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      const resp = await tryFetch(`${base}/ping`);
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.ok) {
        setPingStatus(`Server reachable: ${data.service || 'ok'}`);
        log('Config', 'Server ping: OK');
        return;
      }
      const rootResp = await tryFetch(base + '/');
      if (rootResp.ok) {
        setPingStatus('Server reachable (older dev-server.js -- restart it to get /ping)');
        return;
      }
      setPingStatus(`Reached ${base} but got HTTP ${rootResp.status} -- is this the log server?`);
    } catch (e: any) {
      const msg = e?.name === 'AbortError'
        ? 'No response in 5s -- check IP, same wifi, server running, firewall'
        : `Failed: ${e?.message}`;
      setPingStatus(msg);
      log('Config', `Server ping failed: ${e?.message}`);
    }
  };

  const sourceLabel = (src: string) => {
    switch (src) {
      case 'file': return 'Device file';
      case 'bundled': return 'Build config';
      default: return 'Not saved';
    }
  };

  const projectOptions = [
    {key: null as string | null, label: 'None'},
    ...projects.map(p => ({key: p.id as string | null, label: p.name as string})),
  ];

  // ── Render ───────────────────────────────────────────────

  return (
    <View style={s.wrapper}>
      <View style={s.header}>
        <Text style={s.title}>Settings</Text>
        <View style={s.headerRight}>
          {saveFailed ? (
            <Text style={s.headerFail}>Session only — device write failed</Text>
          ) : lastSaved ? (
            <Text style={s.headerSaved}>Saved {lastSaved} ✓</Text>
          ) : null}
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

      {/* Page split by frequency of use (short scrolls on e-ink) */}
      <View style={s.tabBar}>
        <Pressable
          style={[s.tab, page === 'general' && s.tabActive]}
          onPress={() => setPage('general')}>
          <Text style={[s.tabText, page === 'general' && s.tabTextActive]}>General</Text>
        </Pressable>
        <Pressable
          style={[s.tab, page === 'setup' && s.tabActive]}
          onPress={() => setPage('setup')}>
          <Text style={[s.tabText, page === 'setup' && s.tabTextActive]}>Setup</Text>
        </Pressable>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">

        {/* ── Setup page: Account & Sync ── */}
        {page === 'setup' && (
        <Section title="ACCOUNT & SYNC" first>
          <SettingRow
            label="Todoist API token"
            hint="todoist.com/prefs/integrations > API token"
            onInfo={() => setInfoSheet('token')}
            saved={savedRow === 'token'}>
            <View style={s.inputRow}>
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
              <Pressable style={[s.btnSmall, s.btnSmallPrimary]} onPress={handleSaveToken}>
                <Text style={[s.btnSmallText, s.btnSmallPrimaryText]}>Save</Text>
              </Pressable>
            </View>
          </SettingRow>

          <SettingRow
            label="Import token from file"
            hint="Save your token as supertask-token.txt, sync it to any Supernote folder (Partner app, cloud, or USB), then tap Import. The file is deleted after import."
            saved={savedRow === 'token'}>
            <View style={s.inputRow}>
              <Pressable style={s.btnAction} onPress={handleImportToken}>
                <Text style={s.btnActionText}>Import</Text>
              </Pressable>
            </View>
            {importStatus ? <Text style={s.statusInline}>{importStatus}</Text> : null}
          </SettingRow>

          {!token && wasTemplateGenerated() && (
            <View style={s.notice}>
              <Text style={s.noticeText}>
                Config file created at MyStyle/SuperTask/supertask-config.json.
                Connect via USB to add your token, or tap ? above for all options.
              </Text>
            </View>
          )}

          <SettingRow label="Test connection">
            <View style={s.inputRow}>
              <Pressable style={s.btnAction} onPress={handleTestConnection}>
                <Text style={s.btnActionText}>Test</Text>
              </Pressable>
              {status ? <Text style={s.statusInline}>{status}</Text> : null}
            </View>
          </SettingRow>

          <SettingRow
            label="Config source"
            hint={
              configSource === 'file'
                ? 'MyStyle/SuperTask/supertask-config.json'
                : configSource === 'bundled'
                ? 'Using build-time config.local.js'
                : 'No persistent config found'
            }>
            <View style={s.sourceChip}>
              <Text style={s.sourceChipText}>{sourceLabel(configSource)}</Text>
            </View>
          </SettingRow>
        </Section>
        )}

        {/* ── General page ── */}
        {page === 'general' && (
        <>
        <Section title="OPENING SUPERTASK" first>
          <SettingRow label="Default tab" saved={savedRow === 'defaultTab'}>
            <Segmented
              options={TAB_OPTIONS}
              value={defaultTab}
              onChange={v => {
                setDefaultTab(v);
                applyChange('defaultTab', {defaultTab: v});
              }}
            />
          </SettingRow>

          <CheckRow
            checked={bezelSwipeEnabled}
            onToggle={() => {
              const v = !bezelSwipeEnabled;
              setBezelSwipeEnabled(v);
              applyChange('bezel', {bezelSwipeEnabled: v}, true);
            }}
            label="Bezel swipe"
            hint="2+ fingers up from the bottom edge opens tasks"
            saved={savedRow === 'bezel'}
          />

          <CheckRow
            checked={threeFingerTapEnabled}
            onToggle={() => {
              const v = !threeFingerTapEnabled;
              setThreeFingerTapEnabled(v);
              applyChange('threeFinger', {threeFingerTapEnabled: v}, true);
            }}
            label="Three-finger double tap"
            hint="Opens tasks -- anywhere on the page"
            saved={savedRow === 'threeFinger'}
          />

          <Text style={s.sectionNote}>Long press on a linked task always opens it.</Text>
        </Section>

        {/* ── Display ── */}
        <Section title="DISPLAY">
          <SettingRow
            label="Text size"
            hint="Larger text across task lists and settings (accessibility)"
            saved={savedRow === 'fontScale'}>
            <Segmented
              options={TEXT_SCALE_OPTIONS}
              value={fontScale}
              onChange={v => {
                setFontScaleField(v as number);
                applyChange('fontScale', {fontScale: v});
              }}
            />
          </SettingRow>
        </Section>

        {/* ── Capturing Tasks ── */}
        <Section title="CAPTURING TASKS">
          <SettingRow
            label="Quick Add gesture"
            onInfo={() => setInfoSheet('gesture')}
            saved={savedRow === 'quickAdd'}>
            <Segmented
              options={GESTURE_OPTIONS}
              value={lassoGestureInput}
              onChange={v => {
                setLassoGestureInput(v);
                applyChange('quickAdd', {lassoGestureInput: v}, true);
              }}
            />
          </SettingRow>

          <SettingRow label="After creating a task" saved={savedRow === 'postCreate'}>
            <Segmented
              options={POST_CREATE_OPTIONS}
              value={postCreateAction}
              onChange={v => {
                setPostCreateAction(v);
                applyChange('postCreate', {postCreateAction: v});
              }}
            />
          </SettingRow>

          <SettingRow label="Mark-as-text font size" saved={savedRow === 'fontSize'}>
            <Segmented
              options={FONT_SIZE_OPTIONS}
              value={markAsTextFontSize}
              onChange={v => {
                setMarkAsTextFontSize(v as number);
                applyChange('fontSize', {markAsTextFontSize: v});
              }}
            />
          </SettingRow>
        </Section>

        {/* ── Projects ── */}
        {projects.length > 0 && (
          <Section title="PROJECTS">
            <SettingRow
              label="Show projects"
              hint="Untick projects to hide them across SuperTask"
              saved={savedRow === 'showProjects'}>
              <View style={s.checkGrid}>
                {projects.map(p => (
                  <CheckItem
                    key={p.id}
                    checked={enabledProjectIds.includes(p.id)}
                    onToggle={() => toggleProject(p.id)}
                    label={p.name}
                  />
                ))}
              </View>
            </SettingRow>

            <SettingRow label="Default project for new tasks" saved={savedRow === 'defaultProject'}>
              <Segmented
                options={projectOptions}
                value={defaultProjectId}
                onChange={v => {
                  setDefaultProjectId(v);
                  applyChange('defaultProject', {defaultProjectId: v});
                }}
              />
            </SettingRow>
          </Section>
        )}
        </>
        )}

        {/* ── Setup page: Debugging ── */}
        {page === 'setup' && (
        <Section title="DEBUGGING">
          <CheckRow
            checked={debugMode}
            onToggle={() => {
              const v = !debugMode;
              setDebugMode(v);
              applyChange('debugMode', {debugMode: v});
            }}
            label="Debug mode"
            hint="Show Log buttons in screens"
            saved={savedRow === 'debugMode'}
          />

          <SettingRow
            label="Debug log server"
            hint="Where Upload Log streams logs (computer's LAN IP, not a .local name). Logs always also write to MyStyle/SuperTask/logs/session.log."
            onInfo={() => setInfoSheet('server')}
            saved={savedRow === 'server'}>
            <View style={s.inputRow}>
              <TextInput
                style={[s.input, {flex: 1}]}
                value={debugServerUrl}
                onChangeText={setDebugServerUrlField}
                onEndEditing={commitServerUrl}
                placeholder="http://192.168.x.x:3000/log"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable style={s.btnSmall} onPress={handleTestServer}>
                <Text style={s.btnSmallText}>Test</Text>
              </Pressable>
            </View>
            {pingStatus ? <Text style={s.statusInline}>{pingStatus}</Text> : null}
          </SettingRow>

          {debugMode && nav && (
            <SettingRow label="Diagnostics">
              <Pressable style={s.btnAction} onPress={() => nav.push('diagnostics')}>
                <Text style={s.btnActionText}>Open</Text>
              </Pressable>
            </SettingRow>
          )}
        </Section>
        )}
      </ScrollView>

      {/* ── Info sheets (one template) ── */}
      <InfoSheet
        visible={infoSheet === 'token'}
        title="How to enter your API token"
        intro={'Go to todoist.com/prefs/integrations and scroll to "API token" to find yours. You only need to do this once -- your token is saved to the device and persists across reinstalls.'}
        sections={[
          {label: '1. Sync a token file (easiest -- no cable)', body: 'On your phone or computer, create a plain text file named supertask-token.txt containing ONLY your API token. Sync it to any Supernote folder using the Supernote Partner app or Supernote Cloud (or copy via USB). Then tap Import above. The plugin saves the token securely and deletes the file.'},
          {label: '2. Edit config via USB', body: 'A config file was created on your device at:\nMyStyle/SuperTask/supertask-config.json\n\nConnect your Supernote to a computer via USB, open the file in a text editor, and replace YOUR_TOKEN_HERE with your actual token. Save the file and reopen the plugin.\n\nYour plain text token will be automatically obfuscated the next time the plugin loads.'},
          {label: '3. Bluetooth keyboard', body: 'Pair a Bluetooth keyboard (Supernote Settings > Bluetooth), then tap the token field, paste with Ctrl+V, and tap Save.'},
          {label: '4. On-screen keyboard', body: 'Tap the token field and type the 40-character token using the on-screen keyboard. Slow, but you only need to do it once. Tap Save when done.'},
        ]}
        onClose={() => setInfoSheet(null)}
      />

      <InfoSheet
        visible={infoSheet === 'gesture'}
        title="Quick Add gestures"
        intro="Choose how to quickly capture handwriting as a task without using the lasso toolbar button."
        sections={[
          {label: 'Finger lasso', body: "Hold one finger on the page for about half a second, then drag to draw a selection area. When you lift your finger, the selected content is sent to Quick Add.\n\nThe selection is invisible while you draw -- you won't see the lasso outline. Best for quickly grabbing a rough area of handwriting."},
          {label: 'Pen lasso', body: "Hold one finger on the screen, then use your pen to draw a lasso selection as you normally would. You'll see the native lasso outline as you draw. When you lift your finger, the selected content is sent to Quick Add.\n\nThis gives you the visible lasso feedback you're used to, with the speed of skipping the toolbar button."},
        ]}
        onClose={() => setInfoSheet(null)}
      />

      <InfoSheet
        visible={infoSheet === 'server'}
        title="Debug log server setup"
        intro="The plugin can stream debug logs over wifi to a small server on your computer. This is optional -- logs are ALWAYS saved on the device at MyStyle/SuperTask/logs/session.log, retrievable via USB. That file is usually all you need for a bug report."
        sections={[
          {label: 'Get the server file', body: 'dev-server.js is a single small file with no dependencies. It comes with the SuperTask download (next to the .snplg) -- save it anywhere on your computer, e.g. your Desktop. It writes received logs to a logs/ folder beside itself.'},
          {label: 'Mac', body: '1. Install Node.js from nodejs.org (or: brew install node)\n2. Open Terminal\n3. cd into the folder where you saved dev-server.js\n4. Run: node dev-server.js\n\nThe server prints its address, e.g. http://192.168.1.20:3000/log -- enter that in the field, then tap Test.'},
          {label: 'Windows', body: '1. Install Node.js from nodejs.org\n2. Open PowerShell (or Command Prompt)\n3. cd into the folder where you saved dev-server.js\n4. Run: node dev-server.js\n5. If Windows Firewall asks, click Allow (private networks)\n\nEnter the printed address in the field, then tap Test.'},
          {label: 'If Test fails', body: "Supernote and computer must be on the SAME wifi network. Use the computer's LAN IP address (192.168.x.x) -- Android cannot resolve .local names. If your computer's IP changed, the server prints the new one on startup; update the field here (no reinstall needed)."},
        ]}
        onClose={() => setInfoSheet(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerSaved: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  headerFail: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    textDecorationLine: 'underline',
  },
  headerBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  headerBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 0,
  },
  tab: {
    borderWidth: 2,
    borderColor: '#000000',
    paddingVertical: 10,
    paddingHorizontal: 28,
    marginRight: -2,
    backgroundColor: '#ffffff',
  },
  tabActive: {
    backgroundColor: '#000000',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: '#000000',
    minHeight: 44,
  },
  btnSmall: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  btnSmallText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  btnSmallPrimary: {
    backgroundColor: '#000000',
  },
  btnSmallPrimaryText: {
    color: '#ffffff',
  },
  btnAction: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
  },
  btnActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
  statusInline: {
    fontSize: 14,
    color: '#000000',
    flexShrink: 1,
    marginTop: 6,
  },
  notice: {
    borderWidth: 1,
    borderColor: '#000000',
    borderStyle: 'dashed',
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 13,
    color: '#000000',
    lineHeight: 18,
  },
  sourceChip: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#000000',
  },
  sourceChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  sectionNote: {
    fontSize: 13,
    color: '#555555',
  },
  checkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
