/**
 * PermissionsIntro -- the one explainer screen shown on first launch on
 * permission-managed firmware (Chauvet 3.29.44+), before any host dialog.
 *
 * Why it exists: the firmware asks for each permission with its own dialog
 * and the SDK cannot batch them. Four unexplained prompts in a row is a bad
 * first impression, so this screen says everything once, in plain words,
 * with a "Why?" expander per row; Continue then walks through all three
 * groups in order (four host prompts, each one the user was just told
 * about). The just-in-time asks in permissions.js remain as the safety net.
 *
 * Built on the settings primitives' visual rules: black on white, 2px
 * borders, drawn views, no animation.
 */

import React, {useState} from 'react';
import {View, Text, Pressable, StyleSheet, ScrollView} from 'react-native';
import {PERMISSION_GROUPS, ensureAllPermissionGroups} from '../utils/permissions';
import {useFontScale} from '../utils/useFontScale';
import {log} from '../utils/debug';
import {reloadGestureConfig} from '../utils/gestureDetector';

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
    log('PermissionsIntro', 'Continue -> requesting all groups');
    try {
      await ensureAllPermissionGroups();
      // Startup consumers of the config (gesture detector, debug URL, font
      // scale) ran BEFORE this grant and got defaults because the file read
      // was denied -- bezel swipe stayed off until a reboot (device
      // 2026-09-06, build 1j). Re-read now that the folder is readable.
      reloadGestureConfig();
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
          ever talks to your Todoist account. When you tap Continue, Supernote will ask
          you to confirm the three things below, one at a time.
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

        <View style={s.callout}>
          <Text style={[s.calloutTitle, {fontSize: fs(16)}]}>
            We recommend selecting "Always allow" to ensure smooth operation of the plugin.
          </Text>
          <Text style={[s.calloutBody, {fontSize: fs(14), lineHeight: fs(20)}]}>
            "Allow this time only" lasts until you close the plugin, so it will ask again
            next time. "Don't allow" switches that part of SuperTask off.
          </Text>
        </View>
        <Text style={[s.footnote, {fontSize: fs(13), lineHeight: fs(19)}]}>
          You can review or change any of this later under Settings {'>'} Setup {'>'}
          Permissions, or in Supernote's own plugin settings.
        </Text>

        <Pressable style={[s.primary, busy && s.primaryBusy]} onPress={handleContinue} disabled={busy}>
          <Text style={[s.primaryText, {fontSize: fs(18)}]}>{busy ? 'Asking Supernote...' : 'Continue'}</Text>
        </Pressable>
        <Pressable style={s.secondary} onPress={() => { log('PermissionsIntro', 'Not now'); onDone(); }} disabled={busy}>
          <Text style={[s.secondaryText, {fontSize: fs(15)}]}>Not now</Text>
        </Pressable>
        <Text style={[s.footnoteSmall, {fontSize: fs(12), lineHeight: fs(17)}]}>
          If you choose Not now, SuperTask still opens, but each part will ask for its
          permission the first time you use it.
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
  callout: {
    borderWidth: 2,
    borderColor: '#000000',
    borderLeftWidth: 8,
    borderRadius: 4,
    padding: 12,
    marginTop: 6,
    marginBottom: 12,
  },
  calloutTitle: {fontSize: 16, fontWeight: '700', color: '#000000', marginBottom: 4},
  calloutBody: {fontSize: 14, color: '#222222'},
  footnote: {fontSize: 13, color: '#333333', marginTop: 4, marginBottom: 20},
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
