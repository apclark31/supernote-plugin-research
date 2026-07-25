/**
 * Token file import (F-029) -- the no-cable, no-typing auth path.
 *
 * Users already move files onto the device wirelessly (Supernote Partner
 * app, Supernote Cloud, email-to-INBOX, or USB). So: save the Todoist API
 * token into a file named `supertask-token.txt`, sync it to any top-level
 * Supernote folder, tap Import in Settings. The plugin finds it, saves the
 * token (auto-obfuscated by the config layer), and DELETES the plaintext
 * file.
 *
 * Reading uses the confirmed fetch('file://...') pattern: status is 0 (not
 * 200), so ignore response.ok and call .text() directly.
 */

import {FileUtils} from 'sn-plugin-lib';
import {log} from './debug';
import {saveConfig} from './config';

const TOKEN_FILENAME = 'supertask-token.txt';

// The six user-syncable roots (mirrors the SDK's own scan roots)
const SCAN_ROOTS = [
  '/storage/emulated/0/Document',
  '/storage/emulated/0/INBOX',
  '/storage/emulated/0/Note',
  '/storage/emulated/0/EXPORT',
  '/storage/emulated/0/MyStyle',
  '/storage/emulated/0/SCREENSHOT',
];

/**
 * Scan, import, obfuscate, delete.
 * @returns {Promise<{ok: boolean, message: string}>} user-facing outcome
 */
export async function importTokenFromFile() {
  try {
    if (!FileUtils?.listFiles) {
      return {ok: false, message: 'File access unavailable'};
    }

    // 1. Find the token file in any scan root (top level)
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
        message: `No ${TOKEN_FILENAME} found. Sync one to the top level of Document, INBOX, Note, EXPORT, MyStyle, or SCREENSHOT, then try again.`,
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
