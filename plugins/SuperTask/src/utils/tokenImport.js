/**
 * Token file import (F-029) -- the no-cable, no-typing auth path.
 *
 * Users already move files onto the device wirelessly (Supernote Partner
 * app, Supernote Cloud, or USB). So: save the Todoist API token into a file
 * named `supertask-token.txt`, put it in MyStyle/SuperTask (the folder the
 * plugin creates on first run, next to supertask-config.json), tap Import in
 * Settings. The plugin saves the token (auto-obfuscated by the config layer)
 * and DELETES the plaintext file.
 *
 * Scope (Chauvet 3.29.44 permission model, SNDEV-70): the scan is confined
 * to the plugin's own folder. It used to sweep the top level of all six sync
 * roots, which meant FILE:READ across Document/INBOX/Note/EXPORT/SCREENSHOT
 * for one setup step -- more reach than the feature needs, and exactly the
 * kind of thing a permission reviewer (or a user) should question. One
 * folder, one file name, nothing recursive.
 *
 * Reading uses the confirmed fetch('file://...') pattern: status is 0 (not
 * 200), so ignore response.ok and call .text() directly.
 */

import {FileUtils} from 'sn-plugin-lib';
import {log} from './debug';
import {saveConfig} from './config';

const TOKEN_FILENAME = 'supertask-token.txt';

// The plugin's own folder -- same as config.js CONFIG_DIR. The only place
// the importer looks.
export const TOKEN_DIR = '/storage/emulated/0/MyStyle/SuperTask';
export const TOKEN_DIR_LABEL = 'MyStyle/SuperTask';
const SCAN_ROOTS = [TOKEN_DIR];

/**
 * Scan, import, obfuscate, delete.
 * @returns {Promise<{ok: boolean, message: string}>} user-facing outcome
 */
export async function importTokenFromFile() {
  try {
    if (!FileUtils?.listFiles) {
      return {ok: false, message: 'File access unavailable'};
    }

    // 1. Find the token file in the plugin folder (top level only)
    let found = null;
    for (const root of SCAN_ROOTS) {
      try {
        const files = (await FileUtils.listFiles(root)) || [];
        const hit = files
          .map(f => (typeof f === 'string' ? f : f?.path || ''))
          .find(f => f.toLowerCase().endsWith('/' + TOKEN_FILENAME) ||
                     f.toLowerCase() === TOKEN_FILENAME);
        if (hit) {
          found = hit.startsWith('/') ? hit : `${root}/${hit}`;
          break;
        }
      } catch (e) {
        log('TokenImport', `listFiles(${root}) failed: ${e.message}`);
      }
    }

    if (!found) {
      return {
        ok: false,
        message: `No ${TOKEN_FILENAME} found in ${TOKEN_DIR_LABEL}. Put the file in that folder (not a subfolder), then try again.`,
      };
    }
    log('TokenImport', `Found token file: ${found}`);

    // 2. Read it (fetch file:// returns status 0 -- read .text() directly)
    let raw = '';
    try {
      const resp = await fetch('file://' + found);
      raw = await resp.text();
    } catch (e) {
      return {ok: false, message: `Found the file but could not read it: ${e.message}`};
    }

    // 3. Extract the token: first line-ish run of plausible token characters.
    // Todoist tokens are 40 hex chars; accept 32-64 alphanumerics to be
    // tolerant of future formats, but reject prose.
    const match = raw.match(/[A-Za-z0-9]{32,64}/);
    if (!match) {
      return {
        ok: false,
        message: 'File found but no token in it. Paste ONLY the API token from todoist.com/prefs/integrations into the file.',
      };
    }
    const token = match[0];

    // 4. Save (config layer obfuscates on disk)
    const saved = await saveConfig({apiToken: token});
    log('TokenImport', `Token imported (${token.length} chars, saved=${saved})`);

    // 5. Delete the plaintext file -- never leave a bare token lying around
    let deleted = false;
    try {
      deleted = await FileUtils.deleteFile(found);
    } catch (e) {
      log('TokenImport', `deleteFile failed: ${e.message}`);
    }

    return {
      ok: true,
      message: deleted
        ? 'Token imported and saved. The token file was deleted.'
        : 'Token imported and saved. Could not delete the token file -- please remove it manually.',
    };
  } catch (e) {
    log('TokenImport', `importTokenFromFile error: ${e.message}`);
    return {ok: false, message: `Import failed: ${e.message}`};
  }
}
