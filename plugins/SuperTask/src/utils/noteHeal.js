/**
 * Note-rename healing (B-005).
 *
 * The registry and Todoist descriptions store note paths. Renaming a .note
 * file breaks those back-references (View Note, This Note, Device grouping).
 * The link elements INSIDE the note survive the rename though -- so we can
 * find the renamed file by looking for our own supertask:// link.
 *
 * Strategy (cheap-first, per tracker B-005):
 * 1. For each distinct registry notePath, check existence (one native call).
 * 2. For a missing note, list .note files in the SAME directory that aren't
 *    already claimed by registry entries.
 * 3. Probe each candidate at the missing task's recorded page for a
 *    supertask://task/<id> link -- one getElements per candidate, elements
 *    recycled immediately.
 * 4. On a match: update every registry entry for that note, and patch the
 *    Todoist description back-reference for tasks that carry one.
 *
 * Also backfills notePath for legacy entries from the Todoist description
 * back-reference (full path stored there since before the registry kept it).
 *
 * Runs on every TaskHome data load (fire-and-forget). The steady-state cost
 * is one exists() per distinct notePath -- cheap native calls; the expensive
 * directory probe only triggers for a path that is actually missing. It used
 * to run once per SESSION, but the plugin process outlives view close/reopen
 * (the B-031 finding), so a rename made mid-session was never detected until
 * the process died. Only concurrent overlap is guarded now.
 * Holds no locks; every step degrades to a logged skip. Legacy entries with
 * neither notePath nor a description path are skipped -- nothing to check
 * against.
 */

import {PluginFileAPI, FileUtils} from 'sn-plugin-lib';
import {log} from './debug';
import {getAllTasks, updateTaskNote} from './taskRegistry';
import {updateTask} from '../api/todoist';
import {recycleElements} from './ocr';

let _inflight = null;

/**
 * @param {Array} apiTasks - active Todoist tasks (for description patching)
 * @returns {Promise<number>} count of registry entries healed
 *
 * Concurrent callers JOIN the in-flight run instead of being dropped: a
 * failed note-jump awaits the heal that may already be probing (the probe
 * takes seconds -- one getElements marshal per candidate) and retries when
 * it lands, rather than racing it.
 */
export function healRenamedNotes(apiTasks) {
  if (_inflight) return _inflight;
  _inflight = runHeal(apiTasks).finally(() => {
    _inflight = null;
  });
  return _inflight;
}

async function runHeal(apiTasks) {

  let healed = 0;
  try {
    if (!FileUtils?.exists || !FileUtils?.listFiles) {
      log('Heal', 'FileUtils not available -- skipping rename check');
      return 0;
    }

    const regTasks = await getAllTasks();

    // Backfill notePath for legacy entries (captured before F-024 fixed
    // addTask dropping it). The Todoist description back-reference has
    // stored the FULL path all along -- recover it from there. This fixes
    // Device-tab labels and replaces the blind same-directory jump guess
    // with a real path (B-029). Runs before the rename check below so a
    // backfilled path that turns out stale gets probed in the same pass.
    for (const rt of regTasks) {
      if (rt.notePath) continue;
      const apiTask = (apiTasks || []).find(t => t.id === rt.id);
      const m = apiTask?.description?.match(/\[SuperTask\] Captured from: (\/.+\.note) p\.\d+/);
      if (!m) continue;
      try {
        await updateTaskNote(rt.id, {noteFile: m[1].split('/').pop(), notePath: m[1]});
        rt.notePath = m[1]; // visible to the rename check below
        healed++;
        log('Heal', `Backfilled notePath for ${rt.id}: ${m[1]}`);
      } catch (e) {
        log('Heal', `Backfill failed for ${rt.id}: ${e.message}`);
      }
    }

    const byPath = new Map();
    for (const rt of regTasks) {
      if (!rt.notePath) continue; // legacy entry with no back-reference either: nothing to verify
      if (!byPath.has(rt.notePath)) byPath.set(rt.notePath, []);
      byPath.get(rt.notePath).push(rt);
    }
    if (byPath.size === 0) return healed;

    const knownPaths = new Set(byPath.keys());

    for (const [path, entries] of byPath) {
      let exists = true;
      try {
        exists = await FileUtils.exists(path);
      } catch (e) {
        log('Heal', `exists(${path}) failed: ${e.message}`);
        continue;
      }
      if (exists) continue;

      log('Heal', `Note missing: ${path} (${entries.length} tasks) -- probing same directory`);
      const dir = path.substring(0, path.lastIndexOf('/'));

      let files = [];
      try {
        files = (await FileUtils.listFiles(dir)) || [];
      } catch (e) {
        log('Heal', `listFiles(${dir}) failed: ${e.message}`);
        continue;
      }

      // listFiles may return bare names or full paths -- normalize
      const candidates = files
        .map(f => (typeof f === 'string' ? f : f?.path || ''))
        .filter(f => f.endsWith('.note'))
        .map(f => (f.startsWith('/') ? f : `${dir}/${f}`))
        .filter(f => !knownPaths.has(f));

      // Probe likeliest candidates first: renames usually extend or tweak
      // the old name ("Amplitude" -> "Amplitude Integration Notes"), and
      // each probe costs a full getElements marshal (~3-4s on device), so
      // longest-common-prefix ordering typically turns a 12s scan into one
      // probe.
      const missingName = (path.split('/').pop() || '').replace(/\.note$/, '');
      const prefixLen = f => {
        const name = (f.split('/').pop() || '').replace(/\.note$/, '');
        let i = 0;
        while (i < Math.min(name.length, missingName.length) && name[i] === missingName[i]) i++;
        return i;
      };
      candidates.sort((a, b) => prefixLen(b) - prefixLen(a));

      // Probe candidates for the first task's link at its recorded page
      const probe = entries[0];
      let healedPath = null;
      for (const cand of candidates) {
        if (await noteHasTaskLink(cand, probe.pageNum, probe.id)) {
          healedPath = cand;
          break;
        }
      }

      if (!healedPath) {
        log('Heal', `No same-directory candidate matched ${path} -- leaving as-is`);
        continue;
      }

      const newFile = healedPath.split('/').pop();
      log('Heal', `Rename detected: ${path} -> ${healedPath} (${entries.length} entries)`);

      for (const rt of entries) {
        try {
          await updateTaskNote(rt.id, {noteFile: newFile, notePath: healedPath});
          healed++;
        } catch (e) {
          log('Heal', `Registry update failed for ${rt.id}: ${e.message}`);
        }

        // Patch the Todoist description back-reference if present
        const apiTask = (apiTasks || []).find(t => t.id === rt.id);
        if (apiTask?.description?.includes('Captured from:')) {
          const newDesc = apiTask.description.replace(
            /(\[SuperTask\] Captured from: ).*( p\.\d+)/,
            `$1${healedPath}$2`,
          );
          if (newDesc !== apiTask.description) {
            try {
              await updateTask(rt.id, {description: newDesc});
              apiTask.description = newDesc; // keep in-memory copy consistent
              log('Heal', `Patched Todoist back-reference for ${rt.id}`);
            } catch (e) {
              log('Heal', `Description patch failed for ${rt.id} (registry still healed): ${e.message}`);
            }
          }
        }
      }
    }
  } catch (e) {
    log('Heal', `healRenamedNotes error: ${e.message}`);
  }

  if (healed > 0) log('Heal', `Healed ${healed} registry entries`);
  return healed;
}

async function noteHasTaskLink(notePath, pageNum, taskId) {
  try {
    const res = await PluginFileAPI.getElements(pageNum ?? 0, notePath);
    if (!res?.success || !res.result) return false;
    const els = res.result;
    const wanted = `supertask://task/${taskId}`;
    const found = els.some(el => el.type === 600 && el.link?.destPath === wanted);
    recycleElements(els);
    if (found) log('Heal', `Probe hit: ${notePath} p.${pageNum} has link for ${taskId}`);
    return found;
  } catch (e) {
    log('Heal', `Probe failed for ${notePath}: ${e.message}`);
    return false;
  }
}
