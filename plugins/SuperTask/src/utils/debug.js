/**
 * Debug logger -- local-first (F-022 phase 1).
 *
 * Every entry goes to THREE places, most reliable first:
 *   1. Rotating session file in MyStyle/SuperTask/logs/ (always on,
 *      batched event-driven appends -- survives crashes, USB-retrievable)
 *   2. In-memory ring buffer (2000 entries) for the in-app viewer
 *   3. Dev server via Upload Log (opportunistic; URL is runtime-configurable
 *      through the saved config, so an IP change never needs a rebuild)
 */

import RNFS from 'react-native-fs';

// Debug server URL: bundled config.local is only the FALLBACK default.
// config.js calls setDebugServerUrl() with the saved-config value on every
// load/save, so the URL can be changed in Settings or by USB-editing
// supertask-config.json -- no rebuild needed.
let _debugServerUrl = '';
try {
  const cfg = require('../../config.local');
  _debugServerUrl = (cfg.default || cfg).debugServerUrl || '';
} catch {}

export function setDebugServerUrl(url) {
  if (typeof url === 'string' && url.trim()) {
    _debugServerUrl = url.trim();
  }
}

export function getDebugServerUrl() {
  return _debugServerUrl;
}

const MAX_ENTRIES = 2000;
const entries = [];
let _listener = null;
let _debugMode = false;

// --- Persistent session file (always on) ---
const LOG_DIR = '/storage/emulated/0/MyStyle/SuperTask/logs';
const SESSION_LOG = LOG_DIR + '/session.log';
const SESSION_LOG_PREV = LOG_DIR + '/session.log.1';
const FLUSH_EVERY = 25;             // entries per batched append. Event-driven --
                                    // JS timers are suspended while the view is closed.
const ROTATE_BYTES = 512 * 1024;    // rotate session.log -> session.log.1 (2 files kept)

let _pendingFlush = [];
let _flushedBytes = -1;             // -1 = measure existing file size on first flush
let _fileLogBroken = false;         // one-shot kill switch: never recurse into log() on failure
let _flushChain = Promise.resolve();

/**
 * Append pending entries to the session file. Called automatically every
 * FLUSH_EVERY entries and from exportLog(); safe to call any time.
 */
export function flushToFile() {
  if (_fileLogBroken || _pendingFlush.length === 0) return _flushChain;
  const batch = _pendingFlush.join('\n') + '\n';
  _pendingFlush = [];
  _flushChain = _flushChain.then(async () => {
    try {
      if (_flushedBytes < 0) {
        if (!(await RNFS.exists(LOG_DIR))) {
          await RNFS.mkdir(LOG_DIR);
        }
        _flushedBytes = (await RNFS.exists(SESSION_LOG))
          ? Number((await RNFS.stat(SESSION_LOG)).size) || 0
          : 0;
      }
      if (_flushedBytes > ROTATE_BYTES) {
        // Rotate WITHOUT a delete (Chauvet 3.29.44 keeps FILE:DELETE for the
        // token import only): copy over the previous file, then truncate the
        // live one. Both are writes.
        await RNFS.copyFile(SESSION_LOG, SESSION_LOG_PREV);
        await RNFS.writeFile(SESSION_LOG, '', 'utf8');
        _flushedBytes = 0;
      }
      await RNFS.appendFile(SESSION_LOG, batch, 'utf8');
      _flushedBytes += batch.length;
    } catch (e) {
      _fileLogBroken = true;
    }
  });
  return _flushChain;
}

export function setDebugMode(enabled) {
  _debugMode = enabled;
}

export function isDebugMode() {
  return _debugMode;
}

export function log(tag, message) {
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${tag}: ${message}`;
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  _pendingFlush.push(entry);
  if (_pendingFlush.length >= FLUSH_EVERY) flushToFile();
  if (_listener) _listener([...entries]);
}

export function logError(tag, err) {
  const msg = err instanceof Error
    ? `${err.message}\n${err.stack?.split('\n').slice(0, 3).join('\n')}`
    : String(err);
  log(tag, `ERROR ${msg}`);
}

export function getEntries() {
  return [...entries];
}

export function setListener(fn) {
  _listener = fn;
}

export function clearEntries() {
  entries.length = 0;
  if (_listener) _listener([]);
}

/**
 * Export debug log: flush the session file, then POST to the dev server
 * (10s abort timeout -- an unreachable server must not hang the button).
 * On failure, write a timestamped export file. Either way the rolling
 * session.log already has everything.
 */
export async function exportLog() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logText = entries.length
    ? `--- SuperTask Log ${timestamp} ---\n\n${entries.join('\n')}`
    : '(no log entries)';

  // Make sure the session file is current before anything network-dependent
  try {
    await flushToFile();
  } catch {}

  // Method 1: POST to dev server, with timeout. Network permission is asked
  // for here (in context) on Chauvet 3.29.44; lazy require because
  // permissions.js imports this module's log().
  if (_debugServerUrl) {
    try {
      const {ensurePermissionGroup} = require('./permissions');
      if (!(await ensurePermissionGroup('sync'))) {
        return 'Upload not allowed: enable "Sync with Todoist" under Settings > Setup > Permissions (it also covers the log server).';
      }
    } catch {}
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(_debugServerUrl, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: logText,
        signal: controller.signal,
      });

      if (resp.ok) {
        return 'Log sent to dev server';
      }
      log('Export', `Dev server responded ${resp.status}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('Export', `Dev server failed (${_debugServerUrl}): ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  } else {
    log('Export', 'No dev server URL configured');
  }

  // Method 2: timestamped export file on device (retrievable via USB)
  try {
    const dirExists = await RNFS.exists(LOG_DIR);
    if (!dirExists) {
      await RNFS.mkdir(LOG_DIR);
    }
    const fileName = `supertask-${timestamp}.txt`;
    await RNFS.writeFile(`${LOG_DIR}/${fileName}`, logText, 'utf8');
    return `Server unreachable -- saved to MyStyle/SuperTask/logs/${fileName}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Export failed: ${msg} (rolling log: MyStyle/SuperTask/logs/session.log)`;
  }
}
