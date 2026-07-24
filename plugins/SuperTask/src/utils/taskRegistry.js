/**
 * Task Registry -- local index of tasks created by SuperTask.
 *
 * Stores task metadata in RNFS JSON for fast page-level lookup
 * without hitting the Todoist API. Written on task creation,
 * read when SuperTask opens to show "tasks on this page."
 *
 * File: /MyStyle/SuperTask/task-registry.json
 */

import RNFS from 'react-native-fs';
import {log} from './debug';

const REGISTRY_DIR = '/storage/emulated/0/MyStyle/SuperTask';
const REGISTRY_FILE = REGISTRY_DIR + '/task-registry.json';
const REGISTRY_TMP = REGISTRY_FILE + '.tmp';

let _cache = null;
let _readPromise = null;   // Dedup: concurrent first reads share one parse
let _chain = Promise.resolve(); // Serializes read-modify-write mutations (B-025)

function emptyRegistry() {
  return {tasks: {}, lastSync: null};
}

/**
 * Run a mutation exclusively -- concurrent addTask/removeTask calls used to
 * read-modify-write independently, last writer silently dropping the other's
 * entry (B-025). Failures don't break the chain.
 */
function serialize(op) {
  const run = _chain.then(() => op());
  _chain = run.then(() => undefined, () => undefined);
  return run;
}

async function read() {
  if (_cache) return _cache;
  if (_readPromise) return _readPromise;
  _readPromise = (async () => {
    try {
      const exists = await RNFS.exists(REGISTRY_FILE);
      if (!exists) {
        // Crash recovery: if we died between writing the temp file and the
        // rename, the temp file holds the last complete registry.
        if (await RNFS.exists(REGISTRY_TMP)) {
          const rawTmp = await RNFS.readFile(REGISTRY_TMP, 'utf8');
          _cache = JSON.parse(rawTmp);
          log('Registry', `Recovered ${Object.keys(_cache.tasks).length} tasks from temp file`);
          return _cache;
        }
        _cache = emptyRegistry();
        return _cache;
      }
      const raw = await RNFS.readFile(REGISTRY_FILE, 'utf8');
      _cache = JSON.parse(raw);
      log('Registry', `Loaded ${Object.keys(_cache.tasks).length} tasks`);
      return _cache;
    } catch (e) {
      log('Registry', `Read failed (starting empty): ${e.message}`);
      _cache = emptyRegistry();
      return _cache;
    } finally {
      _readPromise = null;
    }
  })();
  return _readPromise;
}

async function write(registry) {
  _cache = registry;
  try {
    const dirExists = await RNFS.exists(REGISTRY_DIR);
    if (!dirExists) {
      await RNFS.mkdir(REGISTRY_DIR);
    }
    // Atomic-ish write: full temp file first, then swap in. A process kill
    // mid-write can no longer truncate the registry (B-025).
    await RNFS.writeFile(REGISTRY_TMP, JSON.stringify(registry, null, 2), 'utf8');
    try {
      await RNFS.unlink(REGISTRY_FILE);
    } catch {}
    await RNFS.moveFile(REGISTRY_TMP, REGISTRY_FILE);
  } catch (e) {
    log('Registry', `Write failed: ${e.message}`);
  }
}

/**
 * Add a task to the registry after creation.
 */
export function addTask(taskId, {content, noteFile, notePath, pageNum, completed = false}) {
  return serialize(async () => {
    const registry = await read();
    registry.tasks[taskId] = {
      content,
      noteFile,
      // Full path enables filesystem-style labels in the On Device tab
      // ("Connor / 1x1"). Older entries without it fall back to noteFile.
      ...(notePath ? {notePath} : {}),
      pageNum,
      createdAt: new Date().toISOString(),
      completed,
    };
    await write(registry);
    log('Registry', `Added task ${taskId}: "${content.slice(0, 30)}"`);
  });
}

/**
 * Get all tasks for a specific note file and page number.
 */
export async function getTasksForPage(noteFile, pageNum) {
  const registry = await read();
  const results = [];
  for (const [id, task] of Object.entries(registry.tasks)) {
    if (task.noteFile === noteFile && task.pageNum === pageNum) {
      results.push({id, ...task});
    }
  }
  return results;
}

/**
 * Get all tasks for a specific note file (any page).
 */
export async function getTasksForNote(noteFile) {
  const registry = await read();
  const results = [];
  for (const [id, task] of Object.entries(registry.tasks)) {
    if (task.noteFile === noteFile) {
      results.push({id, ...task});
    }
  }
  return results;
}

/**
 * Mark a task as completed in the registry.
 */
export function markCompleted(taskId) {
  return serialize(async () => {
    const registry = await read();
    if (registry.tasks[taskId]) {
      registry.tasks[taskId].completed = true;
      await write(registry);
      log('Registry', `Marked completed: ${taskId}`);
    }
  });
}

/**
 * Update a task's ID (e.g., after offline sync replaces local ID with Todoist ID).
 */
export function updateTaskId(oldId, newId) {
  return serialize(async () => {
    const registry = await read();
    if (registry.tasks[oldId]) {
      registry.tasks[newId] = registry.tasks[oldId];
      delete registry.tasks[oldId];
      await write(registry);
      log('Registry', `Updated ID: ${oldId} -> ${newId}`);
    }
  });
}

/**
 * Get a single task by ID.
 */
export async function getTask(taskId) {
  const registry = await read();
  const task = registry.tasks[taskId];
  return task ? {id: taskId, ...task} : null;
}

/**
 * Get all tasks in the registry.
 */
export async function getAllTasks() {
  const registry = await read();
  return Object.entries(registry.tasks).map(([id, task]) => ({id, ...task}));
}

/**
 * Remove a task from the registry.
 */
export function removeTask(taskId) {
  return serialize(async () => {
    const registry = await read();
    if (registry.tasks[taskId]) {
      delete registry.tasks[taskId];
      await write(registry);
      log('Registry', `Removed task: ${taskId}`);
    }
  });
}

/**
 * Update lastSync timestamp.
 */
export function setLastSync() {
  return serialize(async () => {
    const registry = await read();
    registry.lastSync = new Date().toISOString();
    await write(registry);
  });
}

/**
 * Invalidate in-memory cache (force re-read from disk).
 */
export function invalidateCache() {
  _cache = null;
}
