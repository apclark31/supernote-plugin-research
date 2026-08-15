/**
 * useTaskSelection - select-then-commit completion state (F-025 v2 / F-043).
 *
 * Checkbox taps SELECT tasks; completion commits from the screen's
 * contextual header (SelectionBar), and Undo reopens via the same
 * endpoint the Done tab uses. Deliberateness comes from the labeled
 * Complete button instead of a double-tap window.
 *
 * NO TIMERS anywhere: selection has no expiry, and the undo bar persists
 * until an explicit dismiss or the next interaction. JS timers suspend when
 * the plugin view closes, and time pressure is hostile on e-ink anyway.
 */
import {useState} from 'react';
import {completeTask, reopenTask} from '../api/todoist';
import {log, logError} from './debug';

type Opts = {
  onCompleted?: (ids: string[]) => void; // prune lists / invalidate cache
  onUndone?: (ids: string[]) => void; // restore reopened tasks
  onError?: (msg: string) => void;
};

export function useTaskSelection(tag: string, opts: Opts) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [undoIds, setUndoIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggleSelect = (taskId: string) => {
    setUndoIds([]); // any new selection dismisses a lingering undo bar
    setSelectedIds(prev => {
      const next = prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId];
      log(tag, `SELECT toggle id=${taskId} -> ${next.length} selected`);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setUndoIds([]);
  };

  const completeSelected = async () => {
    if (busy || selectedIds.length === 0) return;
    setBusy(true);
    log(tag, `COMPLETE commit: ${selectedIds.length} selected`);
    const done: string[] = [];
    const failed: string[] = [];
    for (const id of selectedIds) {
      try {
        await completeTask(id);
        done.push(id);
      } catch (err: any) {
        logError(tag, err);
        failed.push(id);
      }
    }
    setBusy(false);
    setSelectedIds(failed); // failures stay selected for retry
    if (done.length) {
      setUndoIds(done);
      opts.onCompleted?.(done);
    }
    if (failed.length) {
      opts.onError?.(`Complete failed for ${failed.length} task${failed.length !== 1 ? 's' : ''}`);
    }
  };

  const undo = async () => {
    if (busy || undoIds.length === 0) return;
    setBusy(true);
    log(tag, `UNDO: reopening ${undoIds.length}`);
    const back: string[] = [];
    for (const id of undoIds) {
      try {
        await reopenTask(id);
        back.push(id);
      } catch (err: any) {
        logError(tag, err);
      }
    }
    setBusy(false);
    setUndoIds([]);
    if (back.length) opts.onUndone?.(back);
  };

  const dismissUndo = () => setUndoIds([]);

  const active = selectedIds.length > 0 || undoIds.length > 0;

  return {selectedIds, undoIds, busy, active, toggleSelect, clearSelection, completeSelected, undo, dismissUndo};
}
