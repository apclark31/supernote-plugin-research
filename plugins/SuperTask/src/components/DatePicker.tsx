/**
 * DatePicker - Simple month-grid calendar for e-ink
 *
 * Opens on the current month, lets user tap a day or navigate months.
 * Tapping a date calls onChange with a YYYY-MM-DD string.
 * Tapping "Clear" calls onChange with empty string.
 */

import React, {useState} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {log} from '../utils/debug';
import {useFontScale} from '../utils/useFontScale';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

type Props = {
  value: string; // YYYY-MM-DD or empty
  onChange: (date: string) => void;
  onClose: () => void;
};

export default function DatePicker({value, onChange, onClose}: Props) {
  const scale = useFontScale();
  const today = new Date();
  const initial = value ? new Date(value + 'T00:00:00') : today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const todayStr = formatDate(today);
  const selectedStr = value || '';

  const prevMonth = () => {
    log('DatePicker', 'prev month');
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    log('DatePicker', 'next month');
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const selectDate = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    log('DatePicker', `selected: ${dateStr}`);
    onChange(dateStr);
    onClose();
  };

  const handleClear = () => {
    log('DatePicker', 'cleared');
    onChange('');
    onClose();
  };

  // Build the grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to complete the last row
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.navButton} onPress={prevMonth}>
          <Text style={[styles.navText, {fontSize: Math.round(18 * scale)}]}>{'<'}</Text>
        </Pressable>
        <Text style={[styles.monthLabel, {fontSize: Math.round(16 * scale)}]}>
          {MONTHS[viewMonth]} {viewYear}
        </Text>
        <Pressable style={styles.navButton} onPress={nextMonth}>
          <Text style={[styles.navText, {fontSize: Math.round(18 * scale)}]}>{'>'}</Text>
        </Pressable>
      </View>

      <View style={styles.dayHeaders}>
        {DAYS.map(d => (
          <Text key={d} style={[styles.dayHeader, {fontSize: Math.round(13 * scale)}]}>{d}</Text>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((day, ci) => {
            if (day === null) {
              return <View key={ci} style={styles.cell} />;
            }
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedStr;

            return (
              <Pressable
                key={ci}
                style={[
                  styles.cell,
                  isToday && styles.cellToday,
                  isSelected && styles.cellSelected,
                ]}
                onPress={() => selectDate(day)}>
                <Text style={[
                  styles.cellText,
                  {fontSize: Math.round(15 * scale)},
                  isToday && styles.cellTextToday,
                  isSelected && styles.cellTextSelected,
                ]}>
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.footer}>
        <Pressable style={styles.footerButton} onPress={() => { onChange(todayStr); onClose(); }}>
          <Text style={[styles.footerButtonText, {fontSize: Math.round(14 * scale)}]}>Today</Text>
        </Pressable>
        <Pressable style={styles.footerButton} onPress={handleClear}>
          <Text style={[styles.footerButtonText, {fontSize: Math.round(14 * scale)}]}>Clear</Text>
        </Pressable>
        <Pressable style={styles.footerButton} onPress={onClose}>
          <Text style={[styles.footerButtonText, {fontSize: Math.round(14 * scale)}]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  navText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#666666',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    maxHeight: 44,
  },
  cellToday: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
  },
  cellSelected: {
    backgroundColor: '#000000',
    borderRadius: 4,
  },
  cellText: {
    fontSize: 15,
    color: '#000000',
  },
  cellTextToday: {
    fontWeight: '700',
  },
  cellTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
  },
  footerButton: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    alignItems: 'center',
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
});
