import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PuzzleHint } from '../engine/common';
import { Theme } from '../theme';

const TIER_LABEL = ['Basic', 'Medium', 'Hard', 'Extra Hard', 'Extreme'];

export function HintPanel(props: {
  hint: PuzzleHint;
  canRewind?: boolean;
  onApply: () => void;
  onRewind?: () => void; // none: the game has no Rewind
  onClose: () => void;
  bodyMaxHeight?: number; // default 130
  theme: Theme;
}) {
  const { hint, theme: t } = props;
  let title = '';
  let subtitle = '';
  let body = '';
  let applyLabel: string | null = null;
  let showRewind = false;

  switch (hint.kind) {
    case 'step': {
      title = hint.step.name;
      subtitle = TIER_LABEL[hint.step.tier] ?? '';
      body = hint.step.explanation;
      applyLabel = hint.step.placements.length ? 'Place it' : 'Apply';
      break;
    }
    case 'wrongValue':
      title = 'Mistake on the board';
      body = hint.message;
      showRewind = !!props.canRewind && !!props.onRewind;
      break;
    case 'missingCandidate':
      title = 'Candidate eliminated by mistake';
      body = hint.message;
      showRewind = !!props.canRewind && !!props.onRewind;
      break;
    case 'reveal':
      title = 'Reveal';
      body = hint.message;
      applyLabel = 'Place it';
      break;
    case 'solved':
      title = 'Solved';
      body = hint.message;
      break;
  }

  return (
    <View style={[styles.panel, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color={t.accent} />
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        {subtitle ? (
          <View style={[styles.chip, { backgroundColor: t.surfaceAlt }]}>
            <Text style={[styles.chipText, { color: t.textMuted }]}>{subtitle}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable onPress={props.onClose} hitSlop={10} accessibilityLabel="Close hint">
          <MaterialCommunityIcons name="close" size={22} color={t.textMuted} />
        </Pressable>
      </View>
      <ScrollView style={[styles.scroll, props.bodyMaxHeight ? { maxHeight: props.bodyMaxHeight } : null]} contentContainerStyle={{ paddingBottom: 4 }}>
        <Text style={[styles.body, { color: t.text }]}>{body}</Text>
      </ScrollView>
      <View style={styles.actions}>
        {showRewind ? (
          <Pressable onPress={props.onRewind} style={[styles.btn, { backgroundColor: t.accent }]}>
            <Text style={[styles.btnText, { color: t.accentText }]}>Rewind to first mistake</Text>
          </Pressable>
        ) : null}
        {applyLabel ? (
          <Pressable onPress={props.onApply} style={[styles.btn, { backgroundColor: t.accent }]}>
            <Text style={[styles.btnText, { color: t.accentText }]}>{applyLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700' },
  chip: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: '600' },
  scroll: { maxHeight: 130 },
  body: { fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { fontSize: 14, fontWeight: '600' },
});
