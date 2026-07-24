/**
 * TabBar - segmented tab strip (F-024): matches the settings design language.
 * Selected cell inverts to black/white; no gray inactive text, no underlines.
 */

import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {log} from '../utils/debug';

type Tab = {
  key: string;
  label: string;
};

type Props = {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
};

export default function TabBar({tabs, activeTab, onTabChange}: Props) {
  return (
    <View style={styles.container}>
      {tabs.map(tab => {
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => { log('TabBar', `TAB pressed: ${tab.key}`); onTabChange(tab.key); }}>
            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRightWidth: 2,
    borderRightColor: '#000000',
    backgroundColor: '#ffffff',
  },
  tabActive: {
    backgroundColor: '#000000',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  tabTextActive: {
    fontWeight: '700',
    color: '#ffffff',
  },
});
