/**
 * PermissionsIntro -- the one explainer screen shown on first launch on
 * permission-managed firmware (Chauvet 3.29.44+), before any host dialog.
 *
 * Why it exists: the firmware asks for each permission with its own dialog
 * and the SDK cannot batch them. Four unexplained prompts in a row is a bad
 * first impression, so this screen says everything once, in plain words,
 * with a "Why?" expander per row; Continue then triggers only the folder
 * pair (read + write). Sync and cleanup are requested later, in context
 * (see permissions.js).
 *
 * Built on the settings primitives' visual rules: black on white, 2px
 * borders, drawn views, no animation.
 */

import React, {useState} from 'react';
import {View, Text, Pressable, StyleSheet, ScrollView} from 'react-native';
import {PERMISSION_GROUPS, ensurePermissionGroup} from '../utils/permissions';
import {useFontScale} from '../utils/useFontScale';
import {log} from '../utils/debug';

type Props = {
  onDone: () => void;
};

export default function PermissionsIntro({onDone}: Props) {
  const scale = useFontScale();
  const fs = (n: number) => Math.round(n * scale);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const handleContinue = async () => {
    setBusy(true);
    log('PermissionsIntro', 'Continue -> requesting folder group');
    try {
      const ok = await ensurePermissionGroup('folder', {force: true});
      log('PermissionsIntro', `folder group granted=${ok}`);
    } finally {
      setBusy(false);
      onDone();
    }
  };

  return (
    <View style={s.wrapper}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <Text style={[s.title, {fontSize: fs(24)}]}>Before you start</Text>
        <Text style={[s.intro, {fontSize: fs(15), lineHeight: fs(22)}]}>
          SuperTask keeps everything in one folder of its own on this device and only
          ever talks to your Todoist account. Supernote will ask you to confirm each of
          the three things below the first time it is needed.
        </Text>

        <Text style={[s.heading, {fontSize: fs(13)}]}>WHAT SUPERTASK NEEDS</Text>

        {PERMISSION_GROUPS.map(g => {
          const expanded = !!open[g.id];
          return (
            <View key={g.id} style={s.row}>
              <View style={s.rowHead}>
                <View style={s.rowText}>
                  <Text style={[s.rowLabel, {fontSize: fs(17)}]}>{g.label}</Text>
                  <Text style={[s.rowSummary, {fontSize: fs(14), lineHeight: fs(20)}]}>{g.summary}</Text>
                </View>
                <Pressable
                  style={[s.whyBtn, expanded && s.whyBtnOn]}
                  hitSlop={8}
                  onPress={() => setOpen(prev => ({...prev, [g.id]: !prev[g.id]}))}>
                  <Text style={[s.whyText, expanded && s.whyTextOn, {fontSize: fs(14)}]}>
                    {expanded ? 'Close' : 'Why?'}
                  </Text>
                </Pressable>
              </View>
              {expanded ? (
                <Text style={[s.why, {fontSize: fs(14), lineHeight: fs(21)}]}>{g.why}</Text>
              ) : null}
            </View>
          );
        })}

        <Text style={[s.footnote, {fontSize: fs(13), lineHeight: fs(19)}]}>
          Tap Continue and Supernote will ask about the folder now (two prompts). Choose
          "Always allow" and it will not ask again. Todoist access is requested the first
          time your tasks load; deleting the token file only when you import one. You can
          review or change any of this later under Settings {'>'} Setup {'>'} Permissions.
        </Text>

        <Pressable style={[s.primary, busy && s.primaryBusy]} onPress={handleContinue} disabled={busy}>
          <Text style={[s.primaryText, {fontSize: fs(18)}]}>{busy ? 'Asking Supernote...' : 'Continue'}</Text>
        </Pressable>
        <Pressable style={s.secondary} onPress={() => { log('PermissionsIntro', 'Not now'); onDone(); }} disabled={busy}>
          <Text style={[s.secondaryText, {fontSize: fs(15)}]}>Not now</Text>
        </Pressable>
        <Text style={[s.footnoteSmall, {fontSize: fs(12), lineHeight: fs(17)}]}>
          If you choose Not now, SuperTask still opens, but it cannot remember settings or
          captured tasks until you allow the folder.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {flex: 1, backgroundColor: '#ffffff'},
  scroll: {flex: 1},
  content: {padding: 24, paddingBottom: 40},
  title: {fontSize: 24, fontWeight: '700', color: '#000000', marginBottom: 10},
  intro: {fontSize: 15, color: '#222222', marginBottom: 22},
  heading: {fontSize: 13, fontWeight: '700', color: '#000000', letterSpacing: 1, marginBottom: 8},
  row: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  rowHead: {flexDirection: 'row', alignItems: 'flex-start', gap: 12},
  rowText: {flex: 1},
  rowLabel: {fontSize: 17, fontWeight: '700', color: '#000000', marginBottom: 4},
  rowSummary: {fontSize: 14, color: '#333333'},
  whyBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  whyBtnOn: {backgroundColor: '#000000'},
  whyText: {fontSize: 14, fontWeight: '700', color: '#000000'},
  whyTextOn: {color: '#ffffff'},
  why: {
    fontSize: 14,
    color: '#222222',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#000000',
  },
  footnote: {fontSize: 13, color: '#333333', marginTop: 8, marginBottom: 20},
  primary: {
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    alignItems: 'center',
    backgroundColor: '#000000',
    marginBottom: 10,
  },
  primaryBusy: {backgroundColor: '#ffffff'},
  primaryText: {fontSize: 18, fontWeight: '700', color: '#ffffff'},
  secondary: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryText: {fontSize: 15, fontWeight: '600', color: '#000000', textDecorationLine: 'underline'},
  footnoteSmall: {fontSize: 12, color: '#555555', textAlign: 'center'},
});
