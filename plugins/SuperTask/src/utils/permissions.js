/**
 * Plugin permission checks (SDK 0.1.65, SNDEV-70 build 1).
 *
 * 0.1.65 introduces a named-permission model (PluginManager.hasPermission /
 * requestPermission) including plugin.permission.INTERNET. If firmware
 * enforces it, an ungranted plugin's fetch() calls fail looking exactly like
 * network errors -- sync dies with no pointer to the real cause. So startup
 * checks INTERNET, requests it when missing, and logs every state so a
 * denied permission is visible in the session log rather than masquerading
 * as connectivity trouble. (Settings > Account & Sync surfacing: build 2.)
 *
 * States per SDK JSDoc: hasPermission 0=not granted, 1=granted;
 * requestPermission result 0=denied, 1=allow while in use, 2=always allow.
 */
import {PluginManager} from 'sn-plugin-lib';
import {log} from './debug';

const INTERNET = 'plugin.permission.INTERNET';

// Some APIs return bare numbers, others APIResponse-wrapped -- accept both.
function unwrap(raw) {
  return typeof raw === 'object' && raw !== null ? raw.result : raw;
}

export async function ensureCorePermissions() {
  if (typeof PluginManager.hasPermission !== 'function') {
    log('Perms', 'permission API unavailable (SDK/firmware pre-0.1.65) -- nothing to check');
    return {supported: false};
  }
  try {
    const state = unwrap(await PluginManager.hasPermission(INTERNET));
    log('Perms', `INTERNET hasPermission=${state}`);
    if (state === 0) {
      const res = unwrap(await PluginManager.requestPermission(
        INTERNET,
        'SuperTask syncs your tasks with Todoist over the network.',
      ));
      log('Perms', `INTERNET requestPermission -> ${res} (0=denied,1=while-in-use,2=always)`);
      return {supported: true, granted: res !== 0};
    }
    return {supported: true, granted: true};
  } catch (e) {
    log('Perms', `permission check failed: ${e.message}`);
    return {supported: true, error: e.message};
  }
}
