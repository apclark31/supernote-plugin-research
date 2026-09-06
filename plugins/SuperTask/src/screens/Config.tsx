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
import {loadConfig, saveConfig, getCachedConfig, getConfigSource, wasTemplateGenerated} from '../utils/config';
import {setConfigLoader, testConnection, getProjects} from '../api/todoist';
import {log} from '../utils/debug';
import {reloadGestureConfig} from '../utils/gestureDetector';
import {importTokenFromFile, TOKEN_DIR_LABEL} from '../utils/tokenImport';
import {PERMISSION_GROUPS, getPermissionStates, ensurePermissionGroup} from '../utils/permissions';
import {FONT_SCALE_STEPS} from '../utils/fontScale';
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
  {key: 'last', label: 'Last opened'}, // F-038: default -- reopen where the user left off
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

// F-035: a relative measure (Windows-style display scaling), not abstract
// Default/Large/Extra Large. Keys stay multipliers -- see fontScale.js.
const TEXT_SCALE_OPTIONS = FONT_SCALE_STEPS.map(n => ({
  key: n,
  label: `${Math.round(n * 100)}%`,
}));

// F-034: the General/Setup page split lives in the header row.
const PAGE_OPTIONS: Array<{key: 'general' | 'setup'; label: string}> = [
  {key: 'general', label: 'General'},
  {key: 'setup', label: 'Setup'},
];

// Collapse legacy lasso-gesture values to the three valid keys (matches the
// mapping the async load has always applied)
function normalizeLassoInput(v?: string): string {
  if (!v || v === 'off') return 'off';
  return v === 'pen-lasso' ? 'pen-lasso' : 'finger';
}

export default function Config({onNavigate, nav}: Props) {
  // Saved-config snapshot for the FIRST render. Settings is almost always
  // reached warm (from TaskHome), so every control can paint its saved value
  // immediately -- previously the screen mounted on defaults and every
  // checkbox/segment visibly snapped when the async load landed, despite the
  // data being entirely local. Cold start falls back to defaults and the
  // loadConfig().then below corrects them (setters bail when values match).
  const [cfg0] = useState(getCachedConfig);

  // Two pages split by frequency of use: General = everyday settings
  // (short scroll -- e-ink scrolling is imperfect); Setup = touch-once /
  // super-user concerns (account, connection, debugging).
  const [page, setPage] = useState<'general' | 'setup'>(
    cfg0 && !cfg0.apiToken ? 'setup' : 'general',
  );

  // Account
  const [token, setToken] = useState(cfg0?.apiToken || '');
  const [tokenMasked, setTokenMasked] = useState(true);
  const [status, setStatus] = useState('');
  const [configSource, setConfigSource] = useState(() => (cfg0 ? getConfigSource() : 'defaults'));
  const [projects, setProjects] = useState<any[]>([]);

  // Settings values
  const [defaultTab, setDefaultTab] = useState(cfg0?.defaultTab || 'last');
  const [bezelSwipeEnabled, setBezelSwipeEnabled] = useState(cfg0?.bezelSwipeEnabled === true);
  const [threeFingerTapEnabled, setThreeFingerTapEnabled] = useState(cfg0?.threeFingerTapEnabled === true);
  const [lassoGestureInput, setLassoGestureInput] = useState(normalizeLassoInput(cfg0?.lassoGestureInput));
  const [postCreateAction, setPostCreateAction] = useState(cfg0?.postCreateAction || 'prompt');
  const [markAsTextFontSize, setMarkAsTextFontSize] = useState(cfg0?.markAsTextFontSize || 32);
  const [enabledProjectIds, setEnabledProjectIds] = useState<string[]>(cfg0?.enabledProjectIds || []);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(cfg0?.defaultProjectId || null);
  const [debugMode, setDebugMode] = useState(cfg0?.debugMode === true);
  const [debugServerUrl, setDebugServerUrlField] = useState(cfg0?.debugServerUrl || '');
  const [fontScale, setFontScaleField] = useState(cfg0?.fontScale || 1);
  const [refreshOnOpen, setRefreshOnOpen] = useState(cfg0?.refreshOnOpen !== false);
  const [importStatus, setImportStatus] = useState('');

  // Apply-on-change feedback
  const [savedRow, setSavedRow] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  // True when the last failed save coincides with the folder permission not
  // being granted -- the header then names the fix instead of "write failed"
  const [saveFailedPerm, setSaveFailedPerm] = useState(false);
  const savedTimer = useRef<any>(null);

  // Info sheets + transient statuses
  const [infoSheet, setInfoSheet] = useState<'token' | 'gesture' | 'server' | 'postCreate' | 'permissions' | 'opening' | 'capturing' | 'projects' | 'debugging' | null>(null);
  // Chauvet 3.29.44 per-plugin permissions: null = firmware has no permission
  // model (pre-0.1.65); otherwise group id -> granted / missing / partial / unknown
  const [permStates, setPermStates] = useState<Record<string, string> | null>(null);
  const [permBusy, setPermBusy] = useState(false);
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
      if (config.enabledProjectIds) {
        setEnabledProjectIds(prev =>
          JSON.stringify(prev) === JSON.stringify(config.enabledProjectIds)
            ? prev
            : config.enabledProjectIds,
        );
      }
      if (config.defaultTab) setDefaultTab(config.defaultTab);
      if (config.defaultProjectId) setDefaultProjectId(config.defaultProjectId);
      if (config.postCreateAction) setPostCreateAction(config.postCreateAction);
      if (config.debugMode !== undefined) setDebugMode(config.debugMode);
      if (config.markAsTextFontSize) setMarkAsTextFontSize(config.markAsTextFontSize);
      if (config.lassoGestureInput) setLassoGestureInput(normalizeLassoInput(config.lassoGestureInput));
      setBezelSwipeEnabled(config.bezelSwipeEnabled === true);
      setThreeFingerTapEnabled(config.threeFingerTapEnabled === true);
      if (config.debugServerUrl) setDebugServerUrlField(config.debugServerUrl);
      if (config.fontScale) setFontScaleField(config.fontScale);
      setRefreshOnOpen(config.refreshOnOpen !== false);

      setConfigSource(getConfigSource());
      refreshPermissions();

      if (config.apiToken) {
        try {
          setConfigLoader(() => Promise.resolve({apiToken: config.apiToken}));
          log('Config', 'Auto-fetching projects...');
          const fetched = await getProjects();
          // Identity-stable when unchanged so the projects section doesn't
          // repaint on every mount
          setProjects(prev =>
            JSON.stringify(prev) === JSON.stringify(fetched || []) ? prev : (fetched || []),
          );
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
    if (!ok) {
      try {
        const snap = await getPermissionStates();
        const perm = snap.supported && snap.groups.folder !== 'granted';
        setSaveFailedPerm(perm);
        if (perm) setPermStates(snap.groups);
      } catch {
        setSaveFailedPerm(false);
      }
    } else {
      setSaveFailedPerm(false);
    }
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

  // ── Permissions (Chauvet 3.29.44) ───────────────────────

  const refreshPermissions = async () => {
    const res = await getPermissionStates();
    setPermStates(res.supported ? res.groups : null);
  };

  // Re-ask the host for every group that is not fully granted, one group at
  // a time (the host shows one dialog per permission; force bypasses the
  // once-per-process guard so a changed mind is honoured immediately).
  const handleRequestPermissions = async () => {
    setPermBusy(true);
    try {
      for (const g of PERMISSION_GROUPS) {
        if (permStates && permStates[g.id] !== 'granted') {
          await ensurePermissionGroup(g.id as 'folder' | 'sync' | 'cleanup', {force: true});
        }
      }
      await refreshPermissions();
    } finally {
      setPermBusy(false);
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
    if (!(await ensurePermissionGroup('sync'))) {
      setPingStatus('Network not allowed: enable "Sync with Todoist" under Permissions (it covers the log server too).');
      return;
    }

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
  // F-036 coupling: the default project is a WRITE default, "Show projects"
  // is a READ filter. A default that is unticked under Show projects still
  // receives every new task, but Today/Upcoming/Done hide it -- warn on the
  // row instead of silently dropping the saved value. Empty enabled list =
  // nothing is filtered.
  const defaultProjectHidden =
    !!defaultProjectId &&
    enabledProjectIds.length > 0 &&
    !enabledProjectIds.includes(defaultProjectId);
  const defaultProjectName = projects.find(p => p.id === defaultProjectId)?.name;

  // ── Render ───────────────────────────────────────────────

  return (
    <View style={s.wrapper}>
      {/* F-034: title + page switcher share the header row. The page split is
          by frequency of use (short scrolls on e-ink); promoting it here buys
          the sections back a whole fixed band of vertical space. */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.title}>Settings</Text>
          <View style={s.pageSwitch}>
            <Segmented options={PAGE_OPTIONS} value={page} onChange={setPage} />
          </View>
        </View>
        <View style={s.headerRight}>
          {saveFailed ? (
            <Text style={s.headerFail} numberOfLines={2}>
              {saveFailedPerm
                ? 'Not saved — allow "Remember your settings" under Setup > Permissions'
                : 'Session only — device write failed'}
            </Text>
          ) : lastSaved ? (
            <Text style={s.headerSaved} numberOfLines={1}>Saved {lastSaved} ✓</Text>
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
            hint={`Put supertask-token.txt in ${TOKEN_DIR_LABEL}, then tap Import. Tap ? for steps.`}
            onInfo={() => setInfoSheet('token')}
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
                No token yet. Easiest: sync a supertask-token.txt file into
                MyStyle/SuperTask from your phone and tap Import above. Tap ?
                for all options (USB config file, Bluetooth keyboard,
                on-screen keyboard).
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

          <SettingRow
            label="Permissions"
            hint={
              permStates === null
                ? 'This firmware does not manage plugin permissions. Tap ? to see what SuperTask does with your files and network.'
                : 'Supernote asks about each of these the first time it is needed. Everything SuperTask touches stays inside MyStyle/SuperTask; the network is used only for Todoist. Tap ? for the full reasons.'
            }
            onInfo={() => setInfoSheet('permissions')}>
            {permStates !== null && (
              <>
                <View style={s.permList}>
                  {PERMISSION_GROUPS.map(g => {
                    const st = permStates[g.id];
                    const granted = st === 'granted';
                    const label =
                      granted ? 'Allowed'
                      : st === 'partial' ? 'Partly'
                      : st === 'unknown' ? 'Unknown'
                      : 'Not yet';
                    return (
                      <View key={g.id} style={s.permRow}>
                        <Text style={s.permRowLabel} numberOfLines={2}>{g.label}</Text>
                        <View style={[s.permChip, granted && s.permChipOn]}>
                          <Text style={[s.permChipText, granted && s.permChipTextOn]}>{label}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
                {PERMISSION_GROUPS.some(g => permStates[g.id] !== 'granted') && (
                  <View style={s.inputRow}>
                    <Pressable style={s.btnAction} onPress={handleRequestPermissions} disabled={permBusy}>
                      <Text style={s.btnActionText}>{permBusy ? 'Asking...' : 'Allow missing'}</Text>
                    </Pressable>
                    <Text style={s.statusInline}>Supernote will ask about each one that is not yet allowed.</Text>
                  </View>
                )}
              </>
            )}
          </SettingRow>
        </Section>
        )}

        {/* ── General page ── */}
        {page === 'general' && (
        <>
        <Section title="OPENING SUPERTASK" first onInfo={() => setInfoSheet('opening')}>
          <SettingRow
            label="Default tab"
            hint="Where SuperTask lands on a fresh open. Last opened returns to whatever tab you were on when you closed it."
            saved={savedRow === 'defaultTab'}>
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

          <CheckRow
            checked={refreshOnOpen}
            onToggle={() => {
              const v = !refreshOnOpen;
              setRefreshOnOpen(v);
              applyChange('refreshOnOpen', {refreshOnOpen: v});
            }}
            label="Clear ghosting on open"
            hint="Repaints the screen once, right after the task list first appears, so the note underneath does not show through. Turn off if you would rather not have the extra flash."
            saved={savedRow === 'refreshOnOpen'}
          />
        </Section>

        {/* ── Capturing Tasks ── */}
        <Section title="CAPTURING TASKS" onInfo={() => setInfoSheet('capturing')}>
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

          <SettingRow
            label="After creating a task"
            onInfo={() => setInfoSheet('postCreate')}
            saved={savedRow === 'postCreate'}>
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

          {/* F-036: a WRITE default belongs with the creation flow, not with
              the visibility filter. Own guard: with no projects loaded the
              control would be a lone "None" cell. */}
          {projects.length > 0 && (
            <SettingRow
              label="Default project for new tasks"
              hint="Where a captured task lands unless you pick a project in the form"
              saved={savedRow === 'defaultProject'}>
              <Segmented
                options={projectOptions}
                value={defaultProjectId}
                onChange={v => {
                  setDefaultProjectId(v);
                  applyChange('defaultProject', {defaultProjectId: v});
                }}
              />
              {defaultProjectHidden && (
                <View style={s.notice}>
                  <Text style={s.noticeText}>
                    {defaultProjectName || 'This project'} is unticked under Projects &gt; Show
                    projects. New tasks will still be created there, but they will not
                    appear on Today, Upcoming, or Done until you tick it again.
                  </Text>
                </View>
              )}
            </SettingRow>
          )}
        </Section>

        {/* ── Projects ── */}
        {projects.length > 0 && (
          <Section title="PROJECTS" onInfo={() => setInfoSheet('projects')}>
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
          </Section>
        )}
        </>
        )}

        {/* ── Setup page: Debugging ── */}
        {page === 'setup' && (
        <Section title="DEBUGGING" onInfo={() => setInfoSheet('debugging')}>
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
            <SettingRow label="Debug log" hint="View log entries and upload to the log server">
              <Pressable style={s.btnAction} onPress={() => nav.push('debug')}>
                <Text style={s.btnActionText}>Open</Text>
              </Pressable>
            </SettingRow>
          )}

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
        intro={'1. Go to todoist.com/prefs/integrations and scroll to "API token" to find yours.\n\n2. Pick one of the options below. You only need to do this once: the token is saved on the device in an obscured form and survives reinstalls.'}
        sections={[
          {label: 'Option 1. Sync a token file from the Supernote Partner app (recommended)', body: 'From your phone or computer, create a plain text file named **supertask-token.txt** containing only the token.\n\nPut it in the **MyStyle/SuperTask** folder on your Supernote using the Supernote Partner app, Supernote Cloud, or USB.\n\nThen tap **Import** above. SuperTask saves the token and deletes the file. Only that one folder is checked.'},
          {label: 'Option 2. Paste or type it here', body: 'Pair a Bluetooth keyboard (Supernote Settings > Bluetooth), tap the token field, paste with Ctrl+V or type it, then tap **Save**. The on-screen keyboard works too, just slowly.'},
          {label: 'Option 3. Edit the config file over USB (advanced)', body: 'Connect to a computer, open **MyStyle/SuperTask/supertask-config.json** in a text editor, replace the apiToken value with your token, save, and reopen the plugin. It is obscured on the next load.'},
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
        visible={infoSheet === 'postCreate'}
        title="After creating a task"
        intro="Controls what the task form does right after a task is created -- whether you got there from a lasso capture, the Quick Add gesture, or the + New button."
        sections={[
          {label: 'Ask (Add / Done)', body: 'After the task is created, the form stays open with three choices:\n\nAdd Another -- clear the form and capture the next task (keeps the note context).\nView Task -- open the new task’s details.\nDone -- finish and close.\n\nBest when you tend to capture several tasks in one sitting.'},
          {label: 'Go back', body: 'Skips the prompt. About half a second after the task is created you are returned to wherever you came from -- the note or the previous screen.\n\nBest when you usually capture one task at a time and want the fewest taps.'},
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

      {/* F-028: one (?) per section. Copy states what the feature does and
          what it means; mechanics (thresholds, cooldowns) are named so the
          behaviour is predictable, not mysterious. */}
      <InfoSheet
        visible={infoSheet === 'opening'}
        title="Opening SuperTask"
        intro="Ways to get to your task list from a note, and what to expect once you are there."
        sections={[
          {label: 'Toolbar button', body: 'Tap SuperTask in the note toolbar plugin menu. Always available; nothing to enable.'},
          {label: 'Bezel swipe (optional)', body: 'With two or more fingers, swipe up from the very bottom edge of the page, about a finger length. Off by default. It only counts when the swipe starts in the bottom edge zone, so ordinary scrolling and a resting hand do not trigger it.'},
          {label: 'Three-finger double tap (optional)', body: 'Tap twice quickly with three fingers anywhere on the page. Off by default, because a palm landing on the screen can look like it. If you write with your hand on the screen, prefer the bezel swipe.'},
          {label: 'Long press on a task link', body: 'Hold one finger on the dashed box around a captured task for about a second to open that task directly. Always on -- it needs a link under your finger, so nothing accidental can fire it.'},
          {label: 'Pen cooldown', body: 'For 1.5 seconds after any pen contact, finger gestures are ignored. This is what stops your palm from opening SuperTask mid-sentence. Pause briefly after writing before you gesture.'},
          {label: 'Default tab', body: 'The tab SuperTask opens on. "Last opened" returns you to whatever tab you were on when you closed it.'},
          {label: 'Completing tasks', body: 'Tap a task\'s box to select it; tap more to select several. A bar at the top shows Complete and Clear. After completing, the same bar offers Undo until you tap OK.'},
        ]}
        onClose={() => setInfoSheet(null)}
      />

      <InfoSheet
        visible={infoSheet === 'capturing'}
        title="Capturing tasks"
        intro="Turn handwriting into a Todoist task without leaving the note."
        sections={[
          {label: 'Lasso, then Add Task', body: 'Lasso some handwriting with the pen and tap Add Task in the lasso toolbar. SuperTask recognizes the writing, lets you fix the title and pick a date, priority, and project, then creates the task in Todoist with a link back to this note and page.'},
          {label: 'Done vs Convert to Text', body: 'After the task is created, Done leaves your handwriting as it is and draws a dashed link box around it. Convert to Text replaces the handwriting with typed text in the same box. Either way the box is a link: long-press it to open the task.'},
          {label: 'Quick Add gesture', body: 'An optional shortcut that skips the toolbar button. Off by default; see the (?) next to that setting.'},
          {label: 'After creating a task', body: 'Whether the form stays open to add another task, or returns you to the note. See its (?).'},
          {label: 'Mark-as-text font size', body: 'The size of the typed text used by Convert to Text.'},
          {label: 'Default project', body: 'Where a new task lands in Todoist unless you choose a different project in the form. If that project is hidden under Projects, this row warns you.'},
        ]}
        onClose={() => setInfoSheet(null)}
      />

      <InfoSheet
        visible={infoSheet === 'projects'}
        title="Projects"
        intro="Which Todoist projects SuperTask shows."
        sections={[
          {label: 'Show projects', body: 'Untick a project to hide its tasks from the Today, Upcoming, and Done tabs. Hidden projects can still be chosen in the project picker when you create or edit a task.'},
          {label: 'What is never filtered', body: 'The On Device tab and the This Note panel always show every task you captured from your notes, whatever its project -- they answer "what did I write down here?", not "what is due?".'},
          {label: 'Default project', body: 'Lives under Capturing Tasks. If the project chosen as the default is unticked here, new tasks still go there but will not appear in your lists; that row shows a warning.'},
        ]}
        onClose={() => setInfoSheet(null)}
      />

      <InfoSheet
        visible={infoSheet === 'debugging'}
        title="Debugging"
        intro="Tools for troubleshooting. Nothing here is needed for everyday use."
        sections={[
          {label: 'Debug mode', body: 'Adds Log buttons to screens and unlocks the Debug log and Diagnostics rows below. It does not change how SuperTask behaves.'},
          {label: 'Where logs live', body: 'SuperTask always keeps a log on the device at MyStyle/SuperTask/logs/session.log (two rotating files, about 1 MB total). Attach that file to a bug report. It records what the plugin did, including task titles and note names, but never your API token.'},
          {label: 'Debug log server', body: 'Optional: stream the same log live to a computer on your own wifi while you reproduce a problem. Set-up steps are under that row\'s (?).'},
          {label: 'Diagnostics', body: 'A live readout of touch and pen events, used for tuning gestures.'},
        ]}
        onClose={() => setInfoSheet(null)}
      />

      <InfoSheet
        visible={infoSheet === 'permissions'}
        title="What SuperTask is allowed to do"
        intro="Supernote firmware 3.29.44 (2.26.41 on A5X/A6X) lets you decide, per plugin, what it may touch. SuperTask needs three things, and Supernote asks you about each one the first time it is needed: the folder when you first open the plugin, Todoist when your tasks first load, and deleting only when you import a token file. Say no to any of them and the matching feature simply stops working."
        sections={[
          ...PERMISSION_GROUPS.map(g => ({label: g.label, body: g.why})),
          {label: 'In short', body: 'Every file SuperTask reads or saves lives in one folder, MyStyle/SuperTask, and the only thing it ever deletes is the token file after import. Your notes and documents are never modified, uploaded, or deleted by it. The only place data goes is your own Todoist account. If you said no and change your mind, use Allow missing on this screen.'},
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
    gap: 16,
  },
  // F-034: title + page switcher. Never shrinks -- if the row gets tight at a
  // large text scale, the save status truncates instead (it is transient and
  // secondary; the switcher is a primary control and must stay tappable).
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexShrink: 0,
  },
  // Segmented cells carry marginBottom:-2 to collapse doubled borders when a
  // long set wraps. In this single-row use that would hang the group 2px low.
  pageSwitch: {
    marginBottom: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 14,
    flexShrink: 1,
  },
  headerSaved: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    flexShrink: 1,
  },
  headerFail: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    textDecorationLine: 'underline',
    flexShrink: 1,
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
  // (F-034 removed tabBar/tab/tabActive/tabText/tabTextActive -- the page
  // switcher now renders through the shared Segmented primitive.)
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
  permList: {
    marginBottom: 8,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  permRowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
    flexShrink: 1,
  },
  permChip: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  permChipOn: {
    backgroundColor: '#000000',
  },
  permChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  permChipTextOn: {
    color: '#ffffff',
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
