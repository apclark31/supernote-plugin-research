/**
 * NoteOpener -- note/page/document navigation.
 *
 * SDK 0.1.65 (SNDEV-70 build 1): native PluginFileAPI.openFile and
 * PluginCommAPI.jumpToPage are the primary path, with the Android-intent
 * machinery (AgP42/supernote-dashboard findings) kept as the compiled-in
 * fallback -- and as the ONLY path for folders, which openFile does not
 * cover. Config gate `useNativeOpenFile` (default ON) drops back to
 * intents without a rebuild if the native path misbehaves on device.
 *
 * Page bases differ by layer and the conversion lives HERE, nowhere else:
 *   - this module's public contract (historical): 1-based, 0 = last-used
 *   - native openFile: 0-based, -1 = last-viewed
 *   - native jumpToPage: 0-based
 *   - intent `page` extra: 1-based
 *
 * See docs/design-sdk065-migration.md for the gap analysis and
 * docs/design-native-intents.md for the intent-era findings.
 */
import {NativeModules} from 'react-native';
import RNFS from 'react-native-fs';
import {PluginManager, PluginFileAPI, PluginCommAPI} from 'sn-plugin-lib';
import {loadConfig} from './config';
import {log, logError} from './debug';
import {markViewClosed} from './viewState';

const {NoteOpener} = NativeModules;

async function nativeGateOn() {
  try {
    const cfg = await loadConfig();
    return cfg.useNativeOpenFile !== false; // default ON
  } catch (e) {
    return true;
  }
}

// Brief delay so the target view settles before we remove the plugin
// overlay. Device question #1 (design doc): openFile may dismiss the view
// itself -- keep the dance until characterized, it is harmless if so.
function closeViewSoon() {
  setTimeout(() => { PluginManager.closePluginView(); markViewClosed('noteOpener'); }, 150);
}

function apiOk(res) {
  return !!res?.success && res.result !== false;
}

/**
 * Open a .note file in the editor at a specific page, then close the plugin view.
 * @param {string} path - Full path to the .note file
 * @param {number} [page=0] - 1-based page number (0 = last-used page)
 * @returns {Promise<{success: boolean, error?: string, via?: string}>}
 */
export async function openNote(path, page = 0) {
  // Pre-flight: firing at a nonexistent path strands the user in the
  // editor's own error, outside the plugin. Legacy registry entries jump
  // via a guessed path (B-029) and rename heal-retry (B-005) depends on
  // this failing INSIDE the plugin -- so it guards BOTH the native and
  // intent paths.
  try {
    const exists = await RNFS.exists(path);
    log('NoteOpener', `pre-flight exists=${exists} for ${path}`);
    if (!exists) {
      return {success: false, error: `Note not found on device: ${path}`};
    }
  } catch (e) {
    log('NoteOpener', `pre-flight exists() failed (proceeding anyway): ${e.message}`);
  }

  // Native path (0.1.65+)
  if (typeof PluginFileAPI.openFile === 'function' && (await nativeGateOn())) {
    try {
      const nativePage = page > 0 ? page - 1 : -1;
      const res = await PluginFileAPI.openFile(path, nativePage);
      log('NoteOpener', `openFile(native) page=${nativePage} -> ${JSON.stringify(res)}`);
      if (apiOk(res)) {
        closeViewSoon();
        return {success: true, via: 'openFile'};
      }
      log('NoteOpener', 'openFile(native) unsuccessful -- falling back to intent');
    } catch (e) {
      log('NoteOpener', `openFile(native) threw (${e.message}) -- falling back to intent`);
    }
  }

  // Intent fallback (former primary; still required on pre-0.1.65 firmware)
  if (!NoteOpener) {
    return {success: false, error: 'openFile unavailable and NoteOpener native module missing'};
  }
  try {
    log('NoteOpener', `openNote(intent) path=${path} page=${page}`);
    await NoteOpener.openNote(path, page);
    closeViewSoon();
    return {success: true, via: 'intent'};
  } catch (e) {
    logError('NoteOpener', e);
    return {success: false, error: e.message};
  }
}

/**
 * Jump to a page within the CURRENT note (0.1.65+), then close the plugin
 * view. This is the F-026 "This Note" case the intent path could never
 * verify -- intents re-target the running editor unreliably.
 * @param {number} page0 - 0-based page index
 * @returns {Promise<{success: boolean, error?: string, via?: string}>}
 */
export async function jumpWithinNote(page0) {
  if (typeof PluginCommAPI.jumpToPage !== 'function' || !(await nativeGateOn())) {
    return {success: false, error: 'jumpToPage unavailable'};
  }
  try {
    const res = await PluginCommAPI.jumpToPage(page0);
    log('NoteOpener', `jumpToPage(${page0}) -> ${JSON.stringify(res)}`);
    if (apiOk(res)) {
      closeViewSoon();
      return {success: true, via: 'jumpToPage'};
    }
    return {success: false, error: `jumpToPage failed: ${JSON.stringify(res?.error ?? res)}`};
  } catch (e) {
    logError('NoteOpener', e);
    return {success: false, error: e.message};
  }
}

/**
 * Open a folder in the Supernote file manager, then close the plugin view.
 * INTENT-ONLY: openFile handles files, not directories (design doc gap
 * analysis) -- this is the surviving use case for the native module.
 * @param {string} folderPath - Full path to the folder
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function openFolder(folderPath) {
  if (!NoteOpener) {
    return {success: false, error: 'NoteOpener native module not available'};
  }
  try {
    log('NoteOpener', `openFolder path=${folderPath}`);
    await NoteOpener.openFolder(folderPath);
    closeViewSoon();
    return {success: true};
  } catch (e) {
    logError('NoteOpener', e);
    return {success: false, error: e.message};
  }
}

/**
 * Open a document, then close the plugin view. Native openFile first
 * (supports pdf/epub/cbz/xps/fb2 with an honored page param), intent
 * fallback (whose page extra the viewer may ignore).
 * @param {string} path - Full path to the document
 * @param {number} [page=0] - 1-based page number (0 = last-used page)
 * @returns {Promise<{success: boolean, error?: string, via?: string}>}
 */
export async function openDocument(path, page = 0) {
  if (typeof PluginFileAPI.openFile === 'function' && (await nativeGateOn())) {
    try {
      const nativePage = page > 0 ? page - 1 : -1;
      const res = await PluginFileAPI.openFile(path, nativePage);
      log('NoteOpener', `openFile(native,doc) page=${nativePage} -> ${JSON.stringify(res)}`);
      if (apiOk(res)) {
        closeViewSoon();
        return {success: true, via: 'openFile'};
      }
      log('NoteOpener', 'openFile(native,doc) unsuccessful -- falling back to intent');
    } catch (e) {
      log('NoteOpener', `openFile(native,doc) threw (${e.message}) -- falling back to intent`);
    }
  }
  if (!NoteOpener) {
    return {success: false, error: 'openFile unavailable and NoteOpener native module missing'};
  }
  try {
    log('NoteOpener', `openDocument(intent) path=${path} page=${page}`);
    await NoteOpener.openDocument(path, page);
    closeViewSoon();
    return {success: true};
  } catch (e) {
    logError('NoteOpener', e);
    return {success: false, error: e.message};
  }
}
