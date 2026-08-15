/**
 * ProjectPicker - Toggle buttons for selecting a project
 *
 * Uses a wrapping flexRow instead of horizontal ScrollView
 * to avoid touch interception issues on e-ink.
 */

import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {log} from '../utils/debug';
import {useFontScale} from '../utils/useFontScale';

type Project = {
  id: string;
  name: string;
};

type Props = {
  projects: Project[];
  selectedId: string | null;
  onChange: (projectId: string | null) => void;
};

export default function ProjectPicker({projects, selectedId, onChange}: Props) {
  const scale = useFontScale();
  if (!projects.length) return null;

  return (
    <View style={styles.row}>
      {projects.map(p => (
        <Pressable
          key={p.id}
          style={[styles.button, selectedId === p.id && styles.selected]}
          onPress={() => { log('ProjectPicker', `pressed: ${p.name} (${p.id})`); onChange(selectedId === p.id ? null : p.id); }}>
          <Text style={[styles.text, {fontSize: Math.round(14 * scale)}, selectedId === p.id && styles.textSelected]}>
            {p.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
  },
  selected: {
    backgroundColor: '#000000',
  },
  text: {
    fontSize: 14,
    color: '#000000',
  },
  textSelected: {
    color: '#ffffff',
  },
});
