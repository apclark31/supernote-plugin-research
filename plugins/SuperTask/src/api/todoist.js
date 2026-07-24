/**
 * Todoist API v1 client
 *
 * All task CRUD operations go through here. Uses the device's
 * fetch() which works on Supernote without restrictions.
 */

import {log, logError} from '../utils/debug';

const TODOIST_API = 'https://api.todoist.com/api/v1';

// Without a timeout, a request that stalls mid-flight (wifi drop) leaves the
// awaiting caller hung forever -- and anything holding a guard flag or dedup
// promise on it stays locked for the life of the process (B-022).
const FETCH_TIMEOUT_MS = 20000;

let _configLoader = null;

export function setConfigLoader(loader) {
  _configLoader = loader;
}

/**
 * fetch() with an abort timeout. RN's fetch buffers the full response body
 * natively, so only the request itself can hang -- body reads resolve from
 * memory and don't need their own deadline.
 */
async function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {...options, signal: controller.signal});
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`Request timed out after ${ms}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function todoistFetch(path, options = {}) {
  if (!_configLoader) {
    throw new Error('Config loader not set. Call setConfigLoader first.');
  }

  log('API', `Loading config...`);
  const config = await _configLoader();
  if (!config.apiToken) {
    throw new Error('No API token configured');
  }

  const url = `${TODOIST_API}${path}`;
  const method = options.method || 'GET';
  log('API', `${method} ${url}`);

  const maxRetries = 2;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = attempt * 1500;
      log('API', `Retry ${attempt}/${maxRetries} after ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }

    let response;
    try {
      response = await fetchWithTimeout(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
    } catch (e) {
      // Timeouts and network drops are retryable, same as 5xx
      lastError = e;
      log('API', `Request failed: ${e.message}`);
      if (attempt < maxRetries) continue;
      throw lastError;
    }

    log('API', `Response: ${response.status}`);

    // Retry on 5xx server errors
    if (response.status >= 500) {
      const text = await response.text();
      lastError = new Error(`Todoist ${response.status}: ${text}`);
      if (attempt < maxRetries) continue;
      throw lastError;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Todoist ${response.status}: ${text}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  throw lastError;
}

/**
 * Extract array from paginated API response.
 * v1 API returns {results: [...], next_cursor: "..."} or bare arrays.
 */
function unwrapResult(result) {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object') {
    if (Array.isArray(result.results)) return result.results;
    if (Array.isArray(result.items)) return result.items;
    if (Array.isArray(result.tasks)) return result.tasks;
  }
  log('API', `unwrapResult: unexpected format, returning empty array`);
  return [];
}

/**
 * Fetch all pages for a paginated endpoint.
 */
async function fetchAllPages(path, params = '') {
  const MAX_PAGES = 20; // safety ceiling: ~1000 items; a misbehaving cursor must not loop forever
  let allItems = [];
  let cursor = null;
  let pages = 0;

  do {
    if (++pages > MAX_PAGES) {
      log('API', `Pagination CAPPED at ${MAX_PAGES} pages (${allItems.length} items) -- results truncated`);
      break;
    }
    const sep = params || cursor ? '?' : '';
    const cursorParam = cursor ? `cursor=${encodeURIComponent(cursor)}` : '';
    const joinChar = params && cursorParam ? '&' : '';
    const url = `${path}${sep}${params}${joinChar}${cursorParam}`;

    const result = await todoistFetch(url);
    const items = unwrapResult(result);
    allItems = allItems.concat(items);

    cursor = result && typeof result === 'object' ? result.next_cursor : null;
    if (cursor) {
      log('API', `Pagination: got ${items.length} items, next cursor: ${cursor}`);
    }
  } while (cursor);

  return allItems;
}

export async function getTask(taskId) {
  const task = await todoistFetch(`/tasks/${taskId}`);
  log('API', `getTask(${taskId}): "${task?.content}"`);
  return task;
}

export async function getTasks(filter) {
  const params = filter ? `filter=${encodeURIComponent(filter)}` : '';
  const tasks = await fetchAllPages('/tasks', params);
  log('API', `getTasks: ${tasks.length} total tasks`);
  return tasks;
}

export async function getTasksByProject(projectId) {
  const tasks = await fetchAllPages('/tasks', `project_id=${projectId}`);
  log('API', `getTasksByProject(${projectId}): ${tasks.length} tasks`);
  return tasks;
}

export async function getProjects() {
  const projects = await fetchAllPages('/projects');
  log('API', `getProjects: ${projects.length} projects`);
  return projects;
}

export async function createTask({content, description, projectId, priority, dueString}) {
  const body = {content};
  if (description) body.description = description;
  if (projectId) body.project_id = projectId;
  if (priority) body.priority = priority;
  if (dueString) body.due_string = dueString;

  log('API', `Creating task: ${content}`);
  return todoistFetch('/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateTask(taskId, {content, description, priority, dueString, projectId}) {
  const body = {};
  if (content !== undefined) body.content = content;
  if (description !== undefined) body.description = description;
  if (priority !== undefined) body.priority = priority;
  if (dueString !== undefined) body.due_string = dueString;
  if (projectId !== undefined) body.project_id = projectId;

  log('API', `Updating task ${taskId}: ${JSON.stringify(body)}`);
  return todoistFetch(`/tasks/${taskId}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function completeTask(taskId) {
  return todoistFetch(`/tasks/${taskId}/close`, {method: 'POST'});
}

export async function deleteTask(taskId) {
  return todoistFetch(`/tasks/${taskId}`, {method: 'DELETE'});
}

export async function testConnection() {
  log('API', 'Testing connection...');
  const projects = await getProjects();
  const tasks = await getTasks();
  return {
    ok: true,
    projectCount: projects?.length ?? 0,
    taskCount: tasks?.length ?? 0,
  };
}
