/**
 * NoteOpener -- direct note/page navigation via Android Intents.
 *
 * Replaces the temp link workaround (tempLinkNav.js) with instant,
 * artifact-free navigation. Based on findings from AgP42/supernote-dashboard.
 *
 * See docs/design-native-intents.md for full rationale.
 */
import {NativeModules} from 'react-native';
import RNFS from 'react-native-fs';
import {PluginManager} from 'sn-plugin-lib';
import {log, logError} from './debug';
import {markViewClosed} from './viewState';

const {NoteOpener} = NativeModules;

/**
 * Open a .note file in the editor at a specific page, then close the plugin view.
 * @param {string} path - Full path to the .note file
 * @param {number} [page=0] - 1-based page number (0 = last-used page)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function openNote(path, page = 0) {
  if (!NoteOpener) {
    return {success: false, error: 'NoteOpener native module not available'};
  }
  // Pre-flight: firing the intent at a nonexistent path shows the editor's
  // own "note not found" and leaves the user stranded outside the plugin.
  // Legacy registry entries jump via a guessed path (B-029), so verify
  // first and fail INSIDE the plugin where we can show what was tried.
  // exists=true in the log also convicts the editor when it still refuses
  // a real file (spaces-in-filename hypothesis).
  try {
    const exists = await RNFS.exists(path);
    log('NoteOpener', `pre-flight exists=${exists} for ${path}`);
    if (!exists) {
      return {success: false, error: `Note not found on device: ${path}`};
    }
  } catch (e) {
    log('NoteOpener', `pre-flight exists() failed (proceeding anyway): ${e.message}`);
  }
  try {
    log('NoteOpener', `openNote path=${path} page=${page}`);
    await NoteOpener.openNote(path, page);
    // Brief delay so the target activity starts before we remove the plugin overlay
    setTimeout(() => { PluginManager.closePluginView(); markViewClosed('noteOpener'); }, 150);
    return {success: true};
  } catch (e) {
    logError('NoteOpener', e);
    return {success: false, error: e.message};
  }
}

/**
 * Open a folder in the Supernote file manager, then close the plugin view.
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
    setTimeout(() => { PluginManager.closePluginView(); markViewClosed('noteOpener'); }, 150);
    return {success: true};
  } catch (e) {
    logError('NoteOpener', e);
    return {success: false, error: e.message};
  }
}

/**
 * Open a PDF in the Supernote Document viewer, then close the plugin view.
 * Note: page parameter may be ignored by the viewer.
 * @param {string} path - Full path to the .pdf file
 * @param {number} [page=0] - 1-based page number (0 = last-used page)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function openDocument(path, page = 0) {
  if (!NoteOpener) {
    return {success: false, error: 'NoteOpener native module not available'};
  }
  try {
    log('NoteOpener', `openDocument path=${path} page=${page}`);
    await NoteOpener.openDocument(path, page);
    setTimeout(() => { PluginManager.closePluginView(); markViewClosed('noteOpener'); }, 150);
    return {success: true};
  } catch (e) {
    logError('NoteOpener', e);
    return {success: false, error: e.message};
  }
}
