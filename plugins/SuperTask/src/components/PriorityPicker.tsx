/**
 * PriorityPicker - P1-P4 toggle buttons
 *
 * Todoist priority values: 4=P1(urgent), 3=P2, 2=P3, 1=P4(normal)
 */

import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {log} from '../utils/debug';
import {useFontScale} from '../utils/useFontScale';

const PRIORITIES = [
  {value: 4, label: 'P1'},
  {value: 3, label: 'P2'},
  {value: 2, label: 'P3'},
  {value: 1, label: 'P4'},
];

type Props = {
  value: number;
  onChange: (priority: number) => void;
};

export default function PriorityPicker({value, onChange}: Props) {
  const scale = useFontScale();
  return (
    <View style={styles.row}>
      {PRIORITIES.map(p => (
        <Pressable
          key={p.value}
          style={[styles.button, value === p.value && styles.selected]}
          onPress={() => { log('PriorityPicker', `pressed: ${p.label}`); onChange(p.value); }}>
          <Text style={[styles.text, {fontSize: Math.round(16 * scale)}, value === p.value && styles.textSelected]}>
            {p.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    alignItems: 'center',
  },
  selected: {
    backgroundColor: '#000000',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  textSelected: {
    color: '#ffffff',
  },
});
