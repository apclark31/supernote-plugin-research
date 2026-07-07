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
    log('Cache', 'Joining existing in-flight fetch');
    return _inflightPromise;
  }

  log('Cache', 'Starting new fetch');
  setConfigLoader(loadConfig);

  _inflightPromise = (async () => {
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
      _inflightPromise = null;
    }
  })();

  return _inflightPromise;
}

/**
 * Clear the cache. Call after mutations (create, complete, delete)
 * so the next mount fetches fresh data instead of showing stale state.
 */
export function invalidateCache() {
  _cache = null;
  log('Cache', 'Invalidated');
}
