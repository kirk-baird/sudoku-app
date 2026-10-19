// Pieces shared by every game screen: stopwatch, header, rules sheet and the
// completion dialog.

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DIFFICULTY_NAMES, Difficulty } from '../engine/common';
import { FONTS } from '../fonts';
import { GameDef } from '../games/registry';
import { formatTime } from '../stats';
import { Theme } from '../theme';
import { Dialog } from './Dialog';

/**
 * Full-screen modal with its own safe-area context. On iOS a Modal is rendered
 * outside the app's SafeAreaProvider, so without this the insets come back as
 * zero and headers slide under the status bar / Dynamic Island.
 */
export function SafeModal(props: { visible: boolean; onRequestClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onRequestClose}>
      <SafeAreaProvider>{props.children}</SafeAreaProvider>
    </Modal>
  );
}

/** Pausable stopwatch held outside React state so boards don't re-render every second. */
export class Clock {
  acc: number;
  since: number | null = null;
  constructor(ms: number) {
    this.acc = ms;
  }
  start() {
    if (this.since == null) this.since = Date.now();
  }
  stop() {
    if (this.since != null) {
      this.acc += Date.now() - this.since;
      this.since = null;
    }
  }
  get ms() {
    return this.acc + (this.since != null ? Date.now() - this.since : 0);
  }
}

function TimerText({ clock, color }: { clock: Clock; color: string }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(id);
  }, []);
  return <Text style={[styles.timer, { color }]}>{formatTime(clock.ms)}</Text>;
}

export function GameHeader(props: {
  def: GameDef;
  difficulty: Difficulty;
  mistakes: number | null; // null hides the counter
  hintsUsed: number;
  clock: Clock;
  paused: boolean;
  onBack: () => void;
  onTogglePause: () => void;
  onHelp: () => void;
  onSettings: () => void;
  theme: Theme;
}) {
  const t = props.theme;
  const meta = [DIFFICULTY_NAMES[props.difficulty]];
  if (props.mistakes != null) meta.push(`Mistakes ${props.mistakes}`);
  if (props.hintsUsed) meta.push(`Hints ${props.hintsUsed}`);
  return (
    <View style={styles.header}>
      <Pressable onPress={props.onBack} hitSlop={12} accessibilityLabel="Back">
        <MaterialCommunityIcons name="chevron-left" size={30} color={t.text} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
          {props.def.name}
        </Text>
        <View style={styles.metaRow}>
          {meta.map((m) => (
            <Text key={m} style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
              {m}
            </Text>
          ))}
        </View>
      </View>
      <Pressable
        onPress={props.onTogglePause}
        style={[styles.timerBox, { backgroundColor: t.surface, borderColor: t.border }]}
        accessibilityLabel={props.paused ? 'Resume' : 'Pause'}
      >
        <TimerText clock={props.clock} color={t.text} />
        <MaterialCommunityIcons name={props.paused ? 'play' : 'pause'} size={18} color={t.textMuted} />
      </Pressable>
      <Pressable onPress={props.onHelp} hitSlop={8} accessibilityLabel="How to play" style={{ marginLeft: 2 }}>
        <MaterialCommunityIcons name="help-circle-outline" size={24} color={t.text} />
      </Pressable>
      <Pressable onPress={props.onSettings} hitSlop={8} accessibilityLabel="Settings">
        <MaterialCommunityIcons name="cog-outline" size={24} color={t.text} />
      </Pressable>
    </View>
  );
}

/** Rules and tips for a game type, as a list. Used on the game-type page and in the in-game sheet. */
export function RulesList({ def, theme: t }: { def: GameDef; theme: Theme }) {
  return (
    <View style={{ gap: 10 }}>
      {def.rules.map((r, i) => (
        <View key={i} style={styles.ruleRow}>
          <View style={[styles.ruleDot, { backgroundColor: t.accent }]} />
          <Text style={[styles.ruleText, { color: t.text }]}>{r}</Text>
        </View>
      ))}
      {def.tips.length ? <Text style={[styles.tipsHead, { color: t.text }]}>Tips</Text> : null}
      {def.tips.map((r, i) => (
        <View key={`t${i}`} style={styles.ruleRow}>
          <View style={[styles.ruleDot, { backgroundColor: t.border }]} />
          <Text style={[styles.ruleText, { color: t.textMuted }]}>{r}</Text>
        </View>
      ))}
    </View>
  );
}

export function RulesSheet(props: { visible: boolean; def: GameDef; onClose: () => void; theme: Theme }) {
  const t = props.theme;
  return (
    <SafeModal visible={props.visible} onRequestClose={props.onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: t.text }]}>How to play {props.def.name}</Text>
          <Pressable onPress={props.onClose} hitSlop={10} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={26} color={t.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4 }}>
          <RulesList def={props.def} theme={t} />
        </ScrollView>
      </SafeAreaView>
    </SafeModal>
  );
}

export function CompletionDialog(props: {
  visible: boolean;
  isBest: boolean;
  difficulty: Difficulty;
  ms: number;
  mistakes: number | null; // null: not counted
  hintsUsed: number;
  onHome: () => void;
  onNewGame: () => void;
  theme: Theme;
}) {
  const t = props.theme;
  return (
    <Dialog
      visible={props.visible}
      title={props.isBest ? 'New best time!' : 'Solved!'}
      theme={t}
      buttons={[
        { label: 'Home', onPress: props.onHome },
        { label: 'New game', onPress: props.onNewGame, primary: true },
      ]}
      onRequestClose={props.onHome}
    >
      <View style={{ gap: 6 }}>
        <StatRow label="Difficulty" value={DIFFICULTY_NAMES[props.difficulty]} theme={t} />
        <StatRow label="Time" value={formatTime(props.ms)} theme={t} />
        {props.mistakes != null ? <StatRow label="Mistakes" value={String(props.mistakes)} theme={t} /> : null}
        <StatRow label="Hints" value={String(props.hintsUsed)} theme={t} />
        {props.hintsUsed > 0 ? (
          <Text style={{ color: t.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6 }}>
            Only puzzles solved without hints count toward your best time.
          </Text>
        ) : null}
      </View>
    </Dialog>
  );
}

function StatRow({ label, value, theme: t }: { label: string; value: string; theme: Theme }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: t.textMuted, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 6 },
  title: { fontFamily: FONTS.displayBold, fontSize: 20, lineHeight: 24 },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 1 },
  meta: { fontSize: 12 },
  timerBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6 },
  timer: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  ruleRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  ruleDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  ruleText: { flex: 1, fontSize: 15, lineHeight: 22 },
  tipsHead: { fontFamily: FONTS.displaySemi, fontSize: 17, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  sheetTitle: { fontFamily: FONTS.displayBold, fontSize: 22, flex: 1 },
});
