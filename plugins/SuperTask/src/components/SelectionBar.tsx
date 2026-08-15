/**
 * SelectionBar - contextual header content for select-then-commit completion
 * (F-025 v2 / F-043).
 *
 * Rendered INSIDE a screen's existing header band in place of its normal
 * title/buttons, so the band's geometry never changes (the F-023 no-reflow
 * rule). Two modes:
 *   selection: "N selected"        [Complete N] [Clear]
 *   undo:      "Completed N tasks" [Undo] [OK]
 * No timers -- the undo bar persists until OK, Undo, or the next interaction.
 */
import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {useFontScale} from '../utils/useFontScale';

type Props = {
  count: number; // selected count -> selection mode when > 0
  undoCount: number; // just-completed count -> undo mode when count is 0
  busy: boolean;
  onComplete: () => void;
  onClear: () => void;
  onUndo: () => void;
  onDismiss: () => void;
};

export default function SelectionBar({count, undoCount, busy, onComplete, onClear, onUndo, onDismiss}: Props) {
  const scale = useFontScale();
  const selecting = count > 0;
  const label = selecting
    ? `${count} selected`
    : `Completed ${undoCount} task${undoCount !== 1 ? 's' : ''}`;

  return (
    <View style={styles.bar}>
      <Text style={[styles.label, {fontSize: Math.round(16 * scale)}]}>{label}</Text>
      <View style={styles.buttons}>
        {selecting ? (
          <>
            <Pressable style={[styles.btn, styles.btnPrimary]} disabled={busy} onPress={onComplete}>
              <Text style={[styles.btnText, styles.btnTextPrimary, {fontSize: Math.round(14 * scale)}]}>
                {busy ? 'Completing...' : count > 1 ? `Complete ${count}` : 'Complete'}
              </Text>
            </Pressable>
            <Pressable style={styles.btn} disabled={busy} onPress={onClear}>
              <Text style={[styles.btnText, {fontSize: Math.round(14 * scale)}]}>Clear</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={[styles.btn, styles.btnPrimary]} disabled={busy} onPress={onUndo}>
              <Text style={[styles.btnText, styles.btnTextPrimary, {fontSize: Math.round(14 * scale)}]}>
                {busy ? 'Undoing...' : 'Undo'}
              </Text>
            </Pressable>
            <Pressable style={styles.btn} disabled={busy} onPress={onDismiss}>
              <Text style={[styles.btnText, {fontSize: Math.round(14 * scale)}]}>OK</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontWeight: '700',
    color: '#000000',
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  btnPrimary: {
    backgroundColor: '#000000',
  },
  btnText: {
    fontWeight: '700',
    color: '#000000',
  },
  btnTextPrimary: {
    color: '#ffffff',
  },
});
