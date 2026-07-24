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

import {log} from '../utils/debug';
import {loadConfig} from '../utils/config';
import {setConfigLoader, getTasks, getProjects} from '../api/todoist';

// --- Module state ---
let _cache = null;            // {tasks: [], projects: [], timestamp: number}
let _inflightPromise = null;  // Dedup guard: shared promise for concurrent callers
let _inflightStart = 0;       // When the in-flight fetch started (staleness watchdog)

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
  log('Cache', 'Invalidated');
}
