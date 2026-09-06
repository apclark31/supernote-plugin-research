/**
 * Plugin permissions (SDK 0.1.65 / Chauvet 3.29.44 "plugin permission
 * management", SNDEV-70).
 *
 * The host grants permissions per plugin, on first use, through its own
 * dialog (Deny / Allow while in use / Always allow). Nothing is declared at
 * build time -- PluginConfig.json has no permission field -- so this module
 * is the plugin's whole permission story:
 *
 *   1. At startup, check each permission SuperTask actually uses and request
 *      the missing ones, in a fixed order, one dialog at a time.
 *   2. Log every state loudly. A denied FILE:WRITE looks like "device write
 *      failed" in Settings and a denied INTERNET looks like a network outage;
 *      the session log must say which it really was.
 *   3. Export the plain-language explanation of what each permission is used
 *      for, so Settings > Setup can show the same words the user sees here.
 *
 * Scope discipline (the reason each request is defensible): every file
 * SuperTask reads, writes, or deletes lives in MyStyle/SuperTask, except two
 * read-only existence checks on note paths before jumping to them. Note
 * content is read through the SDK's note APIs, not through file access.
 *
 * States per SDK JSDoc: hasPermission 0 = not granted, 1 = granted;
 * requestPermission result 0 = denied, 1 = allow while in use, 2 = always.
 * The SDK lists FILE:WRITE, FILE:DELETE, and INTERNET; FILE:READ comes from
 * Ratta's review guidelines ("not granted by default"). The name is passed
 * straight through to the host, so an unknown name fails per-permission and
 * is logged, never fatal.
 */
import {PluginManager} from 'sn-plugin-lib';
import {log} from './debug';

export const PERMISSIONS = [
  {
    key: 'plugin.permission.FILE:READ',
    short: 'FILE:READ',
    label: 'Read its own files',
    // What the host shows if the user previously denied and we ask again.
    desc: 'SuperTask reads its own folder, MyStyle/SuperTask: your saved settings, the list of tasks you captured from notes, and the token file you sync there for setup.',
    // Full plain-language explanation for the Settings info sheet.
    why: 'Reads only the MyStyle/SuperTask folder: your saved settings, the list of tasks you captured from notes, a cached copy of your task list, and the supertask-token.txt file you sync there during setup. It also checks that a note still exists before jumping to it. Your notes, documents, and handwriting are never read through this permission.',
  },
  {
    key: 'plugin.permission.FILE:WRITE',
    short: 'FILE:WRITE',
    label: 'Save its own files',
    desc: 'SuperTask saves your settings, your captured-task list, and a troubleshooting log inside MyStyle/SuperTask. Nothing is written anywhere else.',
    why: 'Saves your settings, your captured-task list, a cached copy of your task list, and a troubleshooting log, all inside MyStyle/SuperTask. Nothing is written outside that folder. Your token is stored obfuscated, not in plain text.',
  },
  {
    key: 'plugin.permission.FILE:DELETE',
    short: 'FILE:DELETE',
    label: 'Tidy up its own files',
    desc: 'SuperTask deletes only its own files in MyStyle/SuperTask: the synced token file after import, old log files, and its cache. Never your notes or documents.',
    why: 'Deletes only files SuperTask created or that you placed in MyStyle/SuperTask for it: the supertask-token.txt file right after import (so your token never sits on the device in plain text), the previous log file when the log rotates, and its own task cache. It never deletes notes, documents, or anything outside its folder.',
  },
  {
    key: 'plugin.permission.INTERNET',
    short: 'INTERNET',
    label: 'Sync with Todoist',
    desc: 'SuperTask talks to Todoist (api.todoist.com) to create, list, and complete your tasks. Nothing else is sent anywhere.',
    why: 'Talks to Todoist (api.todoist.com) to create, list, edit, and complete your tasks, using the API token you provide. Optionally, if you set one up under Debugging, it can stream its troubleshooting log to a computer on your own wifi. No other data leaves the device, and nothing is sent to the plugin author.',
  },
];

// Some APIs return bare numbers, others APIResponse-wrapped -- accept both.
function unwrap(raw) {
  return typeof raw === 'object' && raw !== null ? raw.result : raw;
}

export function isPermissionApiAvailable() {
  return typeof PluginManager.hasPermission === 'function';
}

/**
 * Read-only snapshot of every permission's state, for Settings.
 * @returns {Promise<{supported: boolean, states: Record<string, number|null>}>}
 *   state 1 = granted, 0 = not granted, null = host returned an error
 *   (typically an unrecognised permission name).
 */
export async function getPermissionStates() {
  if (!isPermissionApiAvailable()) return {supported: false, states: {}};
  const states = {};
  for (const p of PERMISSIONS) {
    try {
      states[p.short] = unwrap(await PluginManager.hasPermission(p.key));
    } catch (e) {
      states[p.short] = null;
      log('Perms', `${p.short} hasPermission failed: ${e.message}`);
    }
  }
  return {supported: true, states};
}

/**
 * Startup guard: check each permission and request the missing ones. Runs
 * sequentially so the host shows one dialog at a time, in the order listed
 * above. Never throws.
 * @returns {Promise<{supported: boolean, states: Record<string, number|null>}>}
 *   post-request states in the same shape as getPermissionStates().
 */
export async function ensureCorePermissions() {
  if (!isPermissionApiAvailable()) {
    log('Perms', 'permission API unavailable (SDK/firmware pre-0.1.65) -- nothing to check');
    return {supported: false, states: {}};
  }
  const states = {};
  for (const p of PERMISSIONS) {
    try {
      const has = unwrap(await PluginManager.hasPermission(p.key));
      log('Perms', `${p.short} hasPermission=${has}`);
      if (has === 1) {
        states[p.short] = 1;
        continue;
      }
      const res = unwrap(await PluginManager.requestPermission(p.key, p.desc));
      log('Perms', `${p.short} requestPermission -> ${res} (0=denied,1=while-in-use,2=always)`);
      states[p.short] = res === 0 ? 0 : 1;
    } catch (e) {
      // Unknown name on this firmware, or the dialog path threw. Log and
      // move on -- the feature that needs it fails visibly on its own.
      states[p.short] = null;
      log('Perms', `${p.short} check/request failed: ${e.message}`);
    }
  }
  const missing = PERMISSIONS.filter(p => states[p.short] !== 1).map(p => p.short);
  log('Perms', missing.length ? `NOT GRANTED: ${missing.join(', ')}` : 'all permissions granted');
  return {supported: true, states};
}
