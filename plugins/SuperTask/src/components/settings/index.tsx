/**
 * Settings primitives -- the ONLY controls allowed on settings screens.
 * See docs/design-settings-v2.md (F-023).
 *
 * Design rules:
 * - Drawn Views, never text glyphs: fixed geometry, so toggling a control
 *   can never reflow its row (the ASCII (*)/[X] jitter this replaces).
 * - Pure black on white, 2px borders, no animation, no grayscale shading.
 * - One single-select idiom (Segmented), one boolean idiom (Check/CheckRow),
 *   one info affordance (? chip -> InfoSheet).
 *
 * Plugin-agnostic on purpose: no SuperTask imports. Once proven on-device,
 * copy this directory to template/ alongside dev-server.js.
 */

import React from 'react';
import {View, Text, Pressable, StyleSheet, TextInput} from 'react-native';
import {useFontScale} from '../../utils/useFontScale';

// Accessibility text scale (F-031): StyleSheets are static, so scaled sizes
// are inline overrides. Boxes/borders stay fixed -- only text scales.
function useFs() {
  const scale = useFontScale();
  return (n: number) => Math.round(n * scale);
}

// ── Section ────────────────────────────────────────────────

export function Section({title, first, onInfo, children}: {title: string; first?: boolean; onInfo?: () => void; children: React.ReactNode}) {
  const fs = useFs();
  return (
    <View style={[st.section, !first && st.sectionRule]}>
      <View style={st.sectionTitleRow}>
        <Text style={[st.sectionTitle, {fontSize: fs(18)}]}>{title}</Text>
        {onInfo ? <InfoButton onPress={onInfo} /> : null}
      </View>
      {children}
    </View>
  );
}

// ── SavedTick ──────────────────────────────────────────────

export function SavedTick({visible}: {visible: boolean}) {
  const fs = useFs();
  if (!visible) return null;
  return (
    <View style={st.savedChip}>
      <Text style={[st.savedChipText, {fontSize: fs(13)}]}>Saved ✓</Text>
    </View>
  );
}

// ── InfoButton (the one info affordance) ───────────────────

export function InfoButton({onPress}: {onPress: () => void}) {
  return (
    <Pressable style={st.infoBtn} onPress={onPress} hitSlop={8}>
      <Text style={st.infoBtnText}>?</Text>
    </Pressable>
  );
}

// ── SettingRow ─────────────────────────────────────────────
// Label line (label + optional ? + Saved chip), optional hint below,
// control below that. Every setting renders through this shell.

export function SettingRow({
  label,
  hint,
  onInfo,
  saved,
  children,
}: {
  label: string;
  hint?: string;
  onInfo?: () => void;
  saved?: boolean;
  children?: React.ReactNode;
}) {
  const fs = useFs();
  return (
    <View style={st.row}>
      <View style={st.rowHeader}>
        <View style={st.rowLabelWrap}>
          <Text style={[st.rowLabel, {fontSize: fs(16)}]}>{label}</Text>
          {onInfo ? <InfoButton onPress={onInfo} /> : null}
        </View>
        <SavedTick visible={!!saved} />
      </View>
      {hint ? <Text style={[st.rowHint, {fontSize: fs(13)}]}>{hint}</Text> : null}
      {children ? <View style={st.rowControl}>{children}</View> : null}
    </View>
  );
}

// ── Segmented (the ONLY single-select) ─────────────────────
// Equal-height bordered cells; selected cell inverts. Wraps for long sets.

export function Segmented<T extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: Array<{key: T; label: string}>;
  value: T;
  onChange: (key: T) => void;
}) {
  const fs = useFs();
  return (
    <View style={st.segmentedWrap}>
      {options.map((opt, i) => {
        const selected = opt.key === value;
        return (
          <Pressable
            key={String(opt.key) + i}
            style={[st.segment, selected && st.segmentSelected]}
            onPress={() => onChange(opt.key)}>
            <Text style={[st.segmentText, {fontSize: fs(15)}, selected && st.segmentTextSelected]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Check (the ONLY boolean) ───────────────────────────────
// Drawn box, identical bounding box in both states. Checked = solid inner fill.

export function Check({checked, size = 28}: {checked: boolean; size?: number}) {
  const inner = Math.round(size / 2);
  return (
    <View style={[st.checkBox, {width: size, height: size}]}>
      {checked ? <View style={[st.checkFill, {width: inner, height: inner}]} /> : null}
    </View>
  );
}

export function CheckRow({
  checked,
  onToggle,
  label,
  hint,
  saved,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  hint?: string;
  saved?: boolean;
}) {
  const fs = useFs();
  return (
    <Pressable style={st.checkRow} onPress={onToggle}>
      <Check checked={checked} />
      <View style={st.checkRowBody}>
        <View style={st.rowHeader}>
          <Text style={[st.rowLabel, {fontSize: fs(16)}]}>{label}</Text>
          <SavedTick visible={!!saved} />
        </View>
        {hint ? <Text style={[st.rowHint, {fontSize: fs(13)}]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

// Compact check item for multi-select grids (e.g. project visibility)
export function CheckItem({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  const fs = useFs();
  return (
    <Pressable style={st.checkItem} onPress={onToggle}>
      <Check checked={checked} size={24} />
      <Text style={[st.checkItemLabel, {fontSize: fs(15)}]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// ── InfoSheet (the one modal template) ─────────────────────

export type InfoSheetSection = {label: string; body: string};

// Minimal emphasis markup for sheet bodies: **like this** renders bold.
// Kept deliberately tiny -- one marker, no nesting -- so copy stays
// readable in source and the template stays a plain Text tree.
function renderEmphasis(body: string): React.ReactNode {
  const parts = body.split('**');
  if (parts.length < 3) return body;
  return parts.map((part, i) =>
    i % 2 === 1 ? <Text key={i} style={st.sheetBold}>{part}</Text> : part,
  );
}

export function InfoSheet({
  visible,
  title,
  intro,
  sections,
  onClose,
}: {
  visible: boolean;
  title: string;
  intro?: string;
  sections: InfoSheetSection[];
  onClose: () => void;
}) {
  const fs = useFs();
  if (!visible) return null;
  return (
    <Pressable style={st.overlay} onPress={onClose}>
      <Pressable style={st.sheet} onPress={() => {}}>
        <Text style={[st.sheetTitle, {fontSize: fs(20)}]}>{title}</Text>
        {intro ? <Text style={[st.sheetIntro, {fontSize: fs(14)}]}>{intro}</Text> : null}
        {sections.map((sec, i) => (
          <View key={i}>
            <View style={st.sheetRule} />
            <Text style={[st.sheetLabel, {fontSize: fs(15)}]}>{sec.label}</Text>
            <Text style={[st.sheetBody, {fontSize: fs(14), lineHeight: fs(20)}]}>{renderEmphasis(sec.body)}</Text>
          </View>
        ))}
        <Pressable style={st.sheetClose} onPress={onClose}>
          <Text style={[st.sheetCloseText, {fontSize: fs(15)}]}>Close</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

// ── InputSheet (text entry that the keyboard cannot cover) ──
// Fields near the bottom of a settings page sit under the on-screen
// keyboard / handwriting pane the moment they get focus (device 2026-09-06,
// debug server URL). This dialog puts the field in the upper third of the
// panel, above that pane, with explicit Save / Cancel.

export function InputSheet({
  visible,
  title,
  hint,
  value,
  placeholder,
  onSave,
  onCancel,
}: {
  visible: boolean;
  title: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onSave: (next: string) => void;
  onCancel: () => void;
}) {
  const fs = useFs();
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => { if (visible) setDraft(value); }, [visible, value]);
  if (!visible) return null;
  return (
    <Pressable style={st.overlayTop} onPress={onCancel}>
      <Pressable style={st.sheet} onPress={() => {}}>
        <Text style={[st.sheetTitle, {fontSize: fs(20)}]}>{title}</Text>
        {hint ? <Text style={[st.sheetIntro, {fontSize: fs(14)}]}>{hint}</Text> : null}
        <TextInput
          style={[st.inputField, {fontSize: fs(16)}]}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => onSave(draft.trim())}
        />
        <View style={st.inputActions}>
          <Pressable style={st.inputBtn} onPress={onCancel}>
            <Text style={[st.inputBtnText, {fontSize: fs(15)}]}>Cancel</Text>
          </Pressable>
          <Pressable style={[st.inputBtn, st.inputBtnPrimary]} onPress={() => onSave(draft.trim())}>
            <Text style={[st.inputBtnText, st.inputBtnTextPrimary, {fontSize: fs(15)}]}>Save</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

// ── Styles ─────────────────────────────────────────────────

const st = StyleSheet.create({
  section: {
    paddingVertical: 14,
  },
  sectionRule: {
    borderTopWidth: 2,
    borderTopColor: '#000000',
    marginTop: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.5,
  },
  row: {
    marginBottom: 16,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  rowHint: {
    fontSize: 13,
    color: '#555555',
    marginTop: 2,
  },
  rowControl: {
    marginTop: 8,
  },
  savedChip: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  savedChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  infoBtn: {
    width: 26,
    height: 26,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  segmentedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
  },
  segment: {
    borderWidth: 2,
    borderColor: '#000000',
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 64,
    alignItems: 'center',
    marginRight: -2, // collapse doubled borders between cells
    marginBottom: -2,
    backgroundColor: '#ffffff',
  },
  segmentSelected: {
    backgroundColor: '#000000',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  segmentTextSelected: {
    color: '#ffffff',
  },
  checkBox: {
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkFill: {
    backgroundColor: '#000000',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
    minHeight: 44,
  },
  checkRowBody: {
    flex: 1,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '46%',
    minHeight: 40,
  },
  checkItemLabel: {
    fontSize: 15,
    color: '#000000',
    flexShrink: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  // Same overlay, but the box sits in the upper third so the keyboard /
  // handwriting pane rising from the bottom never covers the field.
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: '8%',
    padding: 24,
  },
  inputField: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#000000',
    marginTop: 8,
  },
  inputActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  inputBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: '#ffffff',
  },
  inputBtnPrimary: {
    backgroundColor: '#000000',
  },
  inputBtnText: {
    fontWeight: '700',
    color: '#000000',
  },
  inputBtnTextPrimary: {
    color: '#ffffff',
  },
  sheet: {
    width: '92%',
    maxWidth: 760,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 4,
    padding: 20,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  sheetIntro: {
    fontSize: 14,
    color: '#333333',
    marginBottom: 4,
  },
  sheetRule: {
    borderTopWidth: 1,
    borderTopColor: '#000000',
    marginVertical: 10,
  },
  sheetLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  sheetBody: {
    fontSize: 14,
    color: '#222222',
    lineHeight: 20,
  },
  sheetBold: {
    fontWeight: '700',
    color: '#000000',
  },
  sheetClose: {
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sheetCloseText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
});
