/**
 * Task data cache with prefetch and fetch deduplication.
 *
 * Module-level state -- survives React mount/unmount cycles within
 * the same plugin session. Importable from gesture handler (outside
 * React) and TaskHome (inside React).
 *
 * Pattern: stale-while-revalidate. Serve cached data immediately,
 * refresh in background. No TTL -- cache lives until invalidated
 * or process restarts.
 */

import RNFS from 'react-native-fs';
import {log} from '../utils/debug';
import {loadConfig} from '../utils/config';
import {setConfigLoader, getTasks, getProjects} from '../api/todoist';

// --- Module state ---
let _cache = null;            // {tasks: [], projects: [], timestamp: number}
let _inflightPromise = null;  // Dedup guard: shared promise for concurrent callers
let _inflightStart = 0;       // When the in-flight fetch started (staleness watchdog)

// --- Disk snapshot (stale-while-revalidate across cold starts) ---
// The in-memory cache dies with the JS process, so every cold open used to
// show the full loading screen. Each successful fetch now also writes a
// snapshot to disk; initTaskCache() (called from index.js at startup)
// hydrates it so the first open paints the last-known list instantly and
// revalidates in the background.
const CACHE_DIR = '/storage/emulated/0/MyStyle/SuperTask';
const CACHE_FILE = CACHE_DIR + '/task-cache.json';
const CACHE_TMP = CACHE_FILE + '.tmp';
const DISK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // don't resurrect week-old state

let _hydrationPromise = null; // Dedup: one disk read per process
let _persistChain = Promise.resolve(); // Serializes disk writes/deletes (B-025 pattern)

/**
 * Hydrate the in-memory cache from the disk snapshot. Safe to call any
 * number of times (one disk read per process); never clobbers an
 * in-memory cache that a fetch already populated. Resolves to the
 * CURRENT cache (not the hydration-time snapshot), so callers after an
 * invalidation correctly see null.
 */
export function initTaskCache() {
  if (!_hydrationPromise) {
    _hydrationPromise = (async () => {
      try {
        if (_cache) return;
        const exists = await RNFS.exists(CACHE_FILE);
        if (!exists) return;
        const raw = await RNFS.readFile(CACHE_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.projects)) return;
        if (typeof data.timestamp !== 'number' || Date.now() - data.timestamp > DISK_MAX_AGE_MS) {
          log('Cache', 'Disk snapshot too old -- ignoring');
          return;
        }
        if (!_cache) { // a fetch may have completed during the read
          _cache = data;
          log('Cache', `Hydrated ${data.tasks.length} tasks from disk (age ${Math.round((Date.now() - data.timestamp) / 60000)}min)`);
        }
      } catch (e) {
        log('Cache', `Disk hydration failed (non-fatal): ${e.message}`);
      }
    })();
  }
  return _hydrationPromise.then(() => _cache);
}

function persistCache(data) {
  _persistChain = _persistChain
    .then(async () => {
      const dirExists = await RNFS.exists(CACHE_DIR);
      if (!dirExists) await RNFS.mkdir(CACHE_DIR);
      await RNFS.writeFile(CACHE_TMP, JSON.stringify(data), 'utf8');
      // rename replaces atomically on Android -- no unlink (FILE:WRITE only)
      await RNFS.moveFile(CACHE_TMP, CACHE_FILE);
    })
    .catch(e => log('Cache', `Disk persist failed (non-fatal): ${e.message}`));
}

// If an in-flight fetch is older than this, abandon it and start fresh.
// Fetches now have a 20s abort timeout + retries (~65s worst case), but that
// relies on JS timers, which are suspended while the plugin view is closed --
// this identity check is the timer-free backstop so one wedged fetch can't
// poison the dedup guard for the life of the process (B-022).
const INFLIGHT_STALE_MS = 90000;

/**
 * Return cached task/project data, or null if no cache exists.
 */
export function getCache() {
  return _cache;
}

/**
 * Fetch tasks and projects from Todoist API. Deduplicates concurrent
 * calls -- if a fetch is already in-flight, returns the same promise.
 *
 * Updates the module-level cache on success. On failure, logs the
 * error but does NOT clear existing cache (stale data > nothing).
 *
 * @returns {Promise<{tasks: any[], projects: any[], timestamp: number} | null>}
 */
export function fetchTaskData() {
  if (_inflightPromise) {
    if (Date.now() - _inflightStart < INFLIGHT_STALE_MS) {
      log('Cache', 'Joining existing in-flight fetch');
      return _inflightPromise;
    }
    // Wedged fetch -- abandon it. If it ever resolves, its finally{} sees it
    // no longer owns the slot and leaves the new fetch alone; a late success
    // still writes _cache, which is fine (fresher data is always welcome).
    log('Cache', `Abandoning stale in-flight fetch (${Math.round((Date.now() - _inflightStart) / 1000)}s old)`);
    _inflightPromise = null;
  }

  log('Cache', 'Starting new fetch');
  setConfigLoader(loadConfig);

  const promise = (async () => {
    try {
      const config = await loadConfig();
      if (!config.apiToken) {
        log('Cache', 'No API token, skipping fetch');
        return null;
      }

      const [tasks, projects] = await Promise.all([
        getTasks(),
        getProjects(),
      ]);

      const data = {
        tasks: tasks || [],
        projects: projects || [],
        timestamp: Date.now(),
      };

      _cache = data;
      persistCache(data); // fire-and-forget disk snapshot for cold starts
      log('Cache', `Cached ${data.tasks.length} tasks, ${data.projects.length} projects`);
      return data;
    } catch (e) {
      log('Cache', `Fetch failed: ${e.message}`);
      // Don't clear _cache -- stale data is better than nothing
      throw e;
    } finally {
      // Only clear the slot if this fetch still owns it (it may have been
      // abandoned as stale and replaced while hung).
      if (_inflightPromise === promise) {
        _inflightPromise = null;
      }
    }
  })();

  _inflightPromise = promise;
  _inflightStart = Date.now();
  return promise;
}

/**
 * Clear the cache. Call after mutations (create, complete, delete)
 * so the next mount fetches fresh data instead of showing stale state.
 */
export function invalidateCache() {
  _cache = null;
  // Drop the disk snapshot too: after a mutation it holds pre-mutation
  // state, and resurrecting a completed task on the next cold start reads
  // as data loss. The next successful fetch rewrites it.
  // Overwrite rather than delete: hydration rejects a snapshot without a
  // tasks array, so an empty object is as good as no file -- and it keeps
  // the cache on FILE:WRITE alone (Chauvet 3.29.44).
  _persistChain = _persistChain
    .then(() => RNFS.writeFile(CACHE_FILE, '{}', 'utf8'))
    .catch(() => {});
  log('Cache', 'Invalidated');
}
