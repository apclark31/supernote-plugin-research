/**
 * SectionHeader - group divider with title, count chip, optional chevron (F-024).
 * White background + black rule (no gray tint -- e-ink dithers it), count in
 * the same Chip idiom as row metadata.
 */

import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import Chip from './Chip';
import {useFontScale} from '../utils/useFontScale';

type Props = {
  title: string;
  count?: number;
  onPress?: () => void;
};

export default function SectionHeader({title, count, onPress}: Props) {
  const scale = useFontScale();
  const content = (
    <View style={styles.container}>
      <Text style={[styles.title, {fontSize: Math.round(14 * scale)}]}>{title.toUpperCase()}</Text>
      <View style={styles.right}>
        {count !== undefined ? <Chip label={String(count)} /> : null}
        {onPress ? <Text style={styles.arrow}>{'>'}</Text> : null}
      </View>
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 2,
    borderTopColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.5,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  arrow: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
});
