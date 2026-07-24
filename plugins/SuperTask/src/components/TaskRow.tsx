/**
 * TaskRow - task row with drawn checkbox and chip metadata (F-024).
 *
 * Metadata is rendered as bordered chips (the ONE idiom -- see Chip.tsx):
 * [P1] [Jul 28] [Work] [p.4] [pending sync]. Overdue inverts. The checkbox
 * is the shared drawn Check box (same language as the settings screen),
 * never a text glyph.
 */

import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {log} from '../utils/debug';
import Chip from './Chip';
import {Check} from './settings';

const PRIORITY_LABELS: Record<number, string> = {
  4: 'P1',
  3: 'P2',
  2: 'P3',
  1: '',
};

type Props = {
  task: any;
  onComplete: (taskId: string) => void;
  onPress: (task: any) => void;
  showProject?: string;
  pageNum?: number;
};

export default function TaskRow({task, onComplete, onPress, showProject, pageNum}: Props) {
  const priorityLabel = PRIORITY_LABELS[task.priority] || '';
  const dueDate = task.due?.date || '';
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = dueDate && dueDate < today;
  const isToday = dueDate === today;

  const chips: Array<{label: string; inverted?: boolean}> = [];
  if (isOverdue) chips.push({label: `Overdue ${formatDate(dueDate)}`, inverted: true});
  else if (isToday) chips.push({label: 'Today'});
  else if (dueDate) chips.push({label: formatDate(dueDate)});
  if (priorityLabel) chips.push({label: priorityLabel});
  if (showProject) chips.push({label: showProject});
  if (pageNum !== undefined) chips.push({label: `p.${pageNum}`});
  if (task._registryOnly) chips.push({label: 'pending sync'});

  return (
    <Pressable style={styles.row} onPress={() => { log('TaskRow', `ROW pressed id=${task.id}`); onPress(task); }}>
      <Pressable
        style={styles.checkTarget}
        onPress={() => { log('TaskRow', `CHECKBOX pressed id=${task.id}`); onComplete(task.id); }}
        hitSlop={6}>
        <Check checked={false} />
      </Pressable>
      <View style={styles.content}>
        <Text style={styles.title}>{task.content}</Text>
        {chips.length > 0 && (
          <View style={styles.meta}>
            {chips.map((c, i) => (
              <Chip key={i} label={c.label} inverted={c.inverted} />
            ))}
          </View>
        )}
      </View>
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
  checkTarget: {
    width: 44,
    minHeight: 44,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 0,
    marginRight: 6,
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
});
