/**
 * Chip - bordered metadata tag (design-home-v2.md, F-024).
 *
 * The ONE idiom for row metadata: priority, due date, project, page number,
 * sync state. Drawn border, fixed padding, black on white; `inverted` flips
 * to white-on-black for urgency (e.g. overdue). No grays, no bare text
 * fragments -- borders are what e-ink renders crisply.
 */

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useFontScale} from '../utils/useFontScale';

export default function Chip({label, inverted}: {label: string; inverted?: boolean}) {
  const scale = useFontScale();
  return (
    <View style={[st.chip, inverted && st.chipInverted]}>
      <Text style={[st.text, {fontSize: Math.round(12 * scale)}, inverted && st.textInverted]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start',
  },
  chipInverted: {
    backgroundColor: '#000000',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000000',
  },
  textInverted: {
    color: '#ffffff',
  },
});
