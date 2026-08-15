/**
 * TaskRow - task row with drawn checkbox and chip metadata (F-024/F-025).
 *
 * Metadata is rendered as bordered chips (the ONE idiom -- see Chip.tsx):
 * [P1] [Jul 28] [Work] [p.4] [pending sync]. Overdue inverts. The checkbox
 * is the shared drawn Check box, never a text glyph.
 *
 * Completion is SELECT-THEN-COMMIT (F-025 v2 / F-043): tapping the box
 * SELECTS the task -- the box fills and nothing else in the row changes,
 * so there is zero layout shift. The parent screen's contextual header
 * (SelectionBar) carries the labeled Complete action and the post-commit
 * Undo. The row holds no completion state and no timers. In `checked` mode
 * (Done tab) a single tap reopens -- that action is inherently recoverable,
 * so it needs no confirmation.
 */

import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {log} from '../utils/debug';
import Chip from './Chip';
import {Check} from './settings';
import {useFontScale} from '../utils/useFontScale';

const PRIORITY_LABELS: Record<number, string> = {
  4: 'P1',
  3: 'P2',
  2: 'P3',
  1: '',
};

type Props = {
  task: any;
  onCheckPress: (taskId: string) => void; // active rows: toggle select; checked rows: reopen
  onPress: (task: any) => void;
  showProject?: string;
  pageNum?: number;
  checked?: boolean;      // Done-tab mode: box filled, tap = reopen
  selected?: boolean;     // selection mode: box filled while selected
  completedAt?: string;   // ISO completion timestamp -> "Done Jul 24" chip
  onOpenNote?: () => void; // renders a right-aligned "Note >" jump button
};

export default function TaskRow({task, onCheckPress, onPress, showProject, pageNum, checked, selected, completedAt, onOpenNote}: Props) {
  const scale = useFontScale();

  const handleCheckPress = () => {
    log('TaskRow', `CHECK pressed id=${task.id} checked=${!!checked} selected=${!!selected}`);
    onCheckPress(task.id);
  };

  const priorityLabel = PRIORITY_LABELS[task.priority] || '';
  const dueDate = task.due?.date || '';
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = !checked && dueDate && dueDate < today;
  const isToday = dueDate === today;

  const chips: Array<{label: string; inverted?: boolean}> = [];
  if (completedAt) chips.push({label: `Done ${formatDate(completedAt.slice(0, 10))}`});
  if (isOverdue) chips.push({label: `Overdue ${formatDate(dueDate)}`, inverted: true});
  else if (isToday) chips.push({label: 'Today'});
  else if (dueDate) chips.push({label: formatDate(dueDate)});
  if (priorityLabel) chips.push({label: priorityLabel});
  if (showProject) chips.push({label: showProject});
  if (pageNum !== undefined) chips.push({label: `p.${pageNum}`});
  if (task._registryOnly) chips.push({label: 'pending sync'});

  // Layout responds to PERSISTENT metadata: with chips the row top-aligns
  // (title pairs with the checkbox, chips wrap below); without chips the
  // single title line centers against the checkbox target. Selection adds
  // no elements, so the decision never flips mid-interaction.
  const hasMeta = chips.length > 0;

  return (
    <Pressable
      style={[styles.row, !hasMeta && styles.rowCentered]}
      onPress={() => { log('TaskRow', `ROW pressed id=${task.id}`); onPress(task); }}>
      <Pressable
        style={[styles.checkTarget, !hasMeta && styles.checkTargetCentered]}
        onPress={handleCheckPress}
        hitSlop={6}>
        <Check checked={!!checked || !!selected} />
      </Pressable>
      <View style={styles.content}>
        <Text style={[styles.title, {fontSize: Math.round(16 * scale), lineHeight: Math.round(22 * scale)}]}>{task.content}</Text>
        {chips.length > 0 && (
          <View style={styles.meta}>
            {chips.map((c, i) => (
              <Chip key={i} label={c.label} inverted={c.inverted} />
            ))}
          </View>
        )}
      </View>
      {onOpenNote ? (
        <Pressable
          style={styles.noteBtn}
          onPress={() => { log('TaskRow', `OPEN NOTE pressed id=${task.id}`); onOpenNote(); }}
          hitSlop={6}>
          <Text style={[styles.noteBtnText, {fontSize: Math.round(13 * scale)}]}>{'Note >'}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowCentered: {
    alignItems: 'center',
  },
  checkTarget: {
    width: 44,
    minHeight: 44,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 0,
    marginRight: 6,
  },
  checkTargetCentered: {
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 22,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  noteBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginLeft: 8,
    alignSelf: 'flex-start',
  },
  noteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
});
