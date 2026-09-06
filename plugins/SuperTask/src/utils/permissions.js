/**
 * Plugin permissions (Chauvet 3.29.44 / 2.26.41 "plugin permission
 * management", sn-plugin-lib 0.1.65; SNDEV-70, SNDEV-71).
 *
 * The firmware grants permissions per plugin, one host dialog per permission
 * (Deny / Allow while in use / Always allow). The SDK has no batch call and
 * PluginConfig.json has no declaration, so the dialogs cannot be merged.
 * What the plugin controls is WHEN each one fires and what the user has read
 * beforehand. Design (Alex, 2026-09-06):
 *
 *   1. One explainer screen of ours on first launch (PermissionsIntro) with
 *      three plain-language rows, each expandable to the full reason.
 *   2. Just-in-time requests, grouped by the human concept, not the
 *      technical name:
 *        folder  = FILE:READ + FILE:WRITE  -> at Continue on the explainer
 *        sync    = INTERNET                -> first Todoist/log-server call
 *        cleanup = FILE:DELETE             -> first token import
 *      So launch is two quick dialogs the user was just told about; the
 *      others appear where the reason is self-evident.
 *   3. Technical names appear only inside the expanded "why" text.
 *
 * Scope discipline: every file SuperTask reads or writes lives in
 * MyStyle/SuperTask, except two read-only exists() pre-flights on note paths.
 * Persistence never deletes: atomic writes rename over the old file, the
 * cache is invalidated by overwriting, the log rotates by copy+truncate. The
 * only delete is the token file after import.
 *
 * States per SDK JSDoc: hasPermission 0 = not granted, 1 = granted;
 * requestPermission 0 = denied, 1 = allow while in use, 2 = always. FILE:READ
 * is named by Ratta's review guidelines but not in the SDK JSDoc; it is
 * passed through by name and an unknown name is logged, never fatal.
 */
import {PluginManager} from 'sn-plugin-lib';
import {log} from './debug';

const READ = 'plugin.permission.FILE:READ';
const WRITE = 'plugin.permission.FILE:WRITE';
const DELETE = 'plugin.permission.FILE:DELETE';
const INTERNET = 'plugin.permission.INTERNET';

// Short display names for logs and technical footnotes
const SHORT = {
  [READ]: 'FILE:READ',
  [WRITE]: 'FILE:WRITE',
  [DELETE]: 'FILE:DELETE',
  [INTERNET]: 'INTERNET',
};

/**
 * The three things SuperTask asks for, in the words the user sees.
 * `summary` is the one-liner under the row; `why` is the expanded text;
 * `desc` is what the host shows if it re-prompts after a denial.
 */
export const PERMISSION_GROUPS = [
  {
    id: 'folder',
    label: 'Remember your settings and captured tasks',
    summary: 'Uses one folder of its own, MyStyle/SuperTask. Nothing else.',
    why: 'SuperTask keeps its settings, the list of tasks you captured from notes, a cached copy of your task list, and a troubleshooting log in its own folder, MyStyle/SuperTask, and reads them back when it opens. It also checks that a note still exists before jumping to it. It never reads, changes, or uploads your notes, documents, or handwriting through this; handwriting is only read through Supernote\'s own plugin feature when you lasso it. (Supernote calls this FILE:READ and FILE:WRITE.)',
    permissions: [READ, WRITE],
    desc: 'SuperTask keeps its settings and your captured-task list in its own folder, MyStyle/SuperTask. It does not touch your notes or documents.',
  },
  {
    id: 'sync',
    label: 'Sync with Todoist',
    summary: 'Talks only to your own Todoist account.',
    why: 'SuperTask connects to Todoist (api.todoist.com) to create, list, edit, and complete your tasks, using the API token you provide. If you set one up under Debugging, it can also stream its troubleshooting log to a computer on your own wifi. Nothing is sent anywhere else, and nothing is sent to the plugin author. (Supernote calls this INTERNET.)',
    permissions: [INTERNET],
    desc: 'SuperTask connects to Todoist (api.todoist.com) to sync your tasks. Nothing else is sent anywhere.',
  },
  {
    id: 'cleanup',
    label: 'Clean up after itself',
    summary: 'Deletes only its own files, such as the token file after import.',
    why: 'When you import your Todoist token from a file, SuperTask deletes that file right after reading it, so your token never sits on the device in plain text. That is the only thing it deletes. It never deletes notes, documents, or anything outside its own folder. (Supernote calls this FILE:DELETE.)',
    permissions: [DELETE],
    desc: 'SuperTask deletes the token file after importing it, so your token is not left in plain text. It never deletes notes or documents.',
  },
];

// Some APIs return bare numbers, others APIResponse-wrapped -- accept both.
function unwrap(raw) {
  return typeof raw === 'object' && raw !== null ? raw.result : raw;
}

export function isPermissionApiAvailable() {
  return typeof PluginManager.hasPermission === 'function';
}

async function hasPerm(key) {
  try {
    return unwrap(await PluginManager.hasPermission(key));
  } catch (e) {
    log('Perms', `${SHORT[key]} hasPermission failed: ${e.message}`);
    return null;
  }
}

/**
 * Read-only snapshot for Settings and the explainer. Never shows a dialog.
 * @returns {Promise<{supported: boolean, groups: Record<string, 'granted'|'missing'|'partial'|'unknown'>, states: Record<string, number|null>}>}
 */
export async function getPermissionStates() {
  if (!isPermissionApiAvailable()) return {supported: false, groups: {}, states: {}};
  const states = {};
  const groups = {};
  for (const g of PERMISSION_GROUPS) {
    let granted = 0;
    let unknown = 0;
    for (const key of g.permissions) {
      const st = await hasPerm(key);
      states[SHORT[key]] = st;
      if (st === 1) granted++;
      else if (st === null) unknown++;
    }
    groups[g.id] =
      granted === g.permissions.length ? 'granted'
      : granted > 0 ? 'partial'
      : unknown === g.permissions.length ? 'unknown'
      : 'missing';
  }
  return {supported: true, groups, states};
}

// A group that was denied is not re-asked on every call that needs it --
// once per process unless the caller forces (Settings > Allow missing,
// the explainer's Continue). Denied features fail visibly on their own.
const _askedThisProcess = new Set();

/**
 * Make sure a group is granted, asking the host for each missing
 * permission in order (one dialog at a time). Never throws.
 * @param {'folder'|'sync'|'cleanup'} id
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<boolean>} true when every permission in the group is granted
 */
export async function ensurePermissionGroup(id, opts = {}) {
  if (!isPermissionApiAvailable()) return true; // pre-permission firmware
  const g = PERMISSION_GROUPS.find(x => x.id === id);
  if (!g) return true;
  let all = true;
  for (const key of g.permissions) {
    const has = await hasPerm(key);
    if (has === 1) continue;
    if (has === null) { all = false; continue; } // unknown name on this firmware
    if (_askedThisProcess.has(key) && !opts.force) {
      all = false;
      continue;
    }
    _askedThisProcess.add(key);
    try {
      const res = unwrap(await PluginManager.requestPermission(key, g.desc));
      log('Perms', `${SHORT[key]} requestPermission -> ${res} (0=denied,1=while-in-use,2=always) [group ${id}]`);
      if (res === 0) all = false;
    } catch (e) {
      log('Perms', `${SHORT[key]} requestPermission failed: ${e.message}`);
      all = false;
    }
  }
  return all;
}

/**
 * Startup: log every permission's state so a denied one is visible in the
 * session log next to whatever fails because of it. No dialogs -- those
 * belong to the explainer and the just-in-time call sites.
 */
export async function logPermissionStates() {
  if (!isPermissionApiAvailable()) {
    log('Perms', 'permission API unavailable (SDK/firmware pre-0.1.65) -- nothing to check');
    return {supported: false, groups: {}, states: {}};
  }
  const snap = await getPermissionStates();
  const parts = Object.entries(snap.states).map(([k, v]) => `${k}=${v}`);
  log('Perms', `startup states: ${parts.join(' ')}`);
  const missing = Object.entries(snap.groups).filter(([, s]) => s !== 'granted').map(([g, s]) => `${g}:${s}`);
  log('Perms', missing.length ? `groups not fully granted: ${missing.join(', ')}` : 'all permission groups granted');
  return snap;
}
