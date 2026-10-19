import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Settings, useSettings } from '../settings';
import { useTheme } from '../theme';
import { buildInfo } from '../version';

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

const TOGGLES: { key: BoolKey; title: string; desc: string; needs?: BoolKey }[] = [
  {
    key: 'errorDetection',
    title: 'Error detection',
    desc: 'Show wrong digits and wrongly removed candidates in red, and count both as mistakes. Not in Pips, where a red domino would give the answer away.',
  },
  {
    key: 'autoCandidates',
    title: 'Auto candidates',
    desc: 'Fill every empty cell with all possible pencil marks. You remove candidates as you eliminate them.',
  },
  {
    key: 'cageMath',
    title: 'Auto candidates: arithmetic',
    desc: 'Calcudoku and Kakuro: also leave out digits that no combination of their cage or run allows. Off, working out the sums is up to you.',
    needs: 'autoCandidates',
  },
  {
    key: 'highlightCandidates',
    title: 'Highlight matching candidates',
    desc: 'Selecting a filled 8 also highlights every 8 in the pencil marks.',
  },
  { key: 'haptics', title: 'Haptic feedback', desc: 'Small vibration on taps and mistakes.' },
];

const BUILD = buildInfo();

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const t = useTheme();
  const { settings, update } = useSettings();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={30} color={t.text} />
        </Pressable>
        <Text style={[styles.title, { color: t.text }]}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.group, { backgroundColor: t.surface, borderColor: t.border }]}>
          {TOGGLES.map((row, idx) => {
            const off = !!row.needs && !settings[row.needs];
            return (
            <View
              key={row.key}
              style={[styles.row, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }, off && { opacity: 0.5 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: t.text }]}>{row.title}</Text>
                <Text style={[styles.rowDesc, { color: t.textMuted }]}>{row.desc}</Text>
              </View>
              <Switch
                value={settings[row.key]}
                disabled={off}
                onValueChange={(v) => update({ [row.key]: v })}
                trackColor={{ true: t.accent, false: t.border }}
                thumbColor="#FFFFFF"
                accessibilityLabel={row.title}
              />
            </View>
            );
          })}
        </View>

        <Text style={[styles.section, { color: t.textMuted }]}>THEME</Text>
        <View style={[styles.segment, { backgroundColor: t.surfaceAlt }]}>
          {(['system', 'light', 'dark'] as const).map((m) => {
            const on = settings.theme === m;
            return (
              <Pressable
                key={m}
                onPress={() => update({ theme: m })}
                style={[styles.segBtn, on && { backgroundColor: t.surface }]}
              >
                <Text style={[styles.segText, { color: on ? t.text : t.textMuted }]}>
                  {m[0].toUpperCase() + m.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.section, { color: t.textMuted }]}>TIPS</Text>
        <View style={[styles.group, { backgroundColor: t.surface, borderColor: t.border, padding: 14, gap: 6 }]}>
          <Text style={[styles.rowDesc, { color: t.text }]}>• Long-press a number to enter it in the other mode (pencil ↔ digit).</Text>
          <Text style={[styles.rowDesc, { color: t.text }]}>• Rewind jumps back to just before your first mistake that’s still on the board.</Text>
          <Text style={[styles.rowDesc, { color: t.text }]}>• Hints work from your own pencil marks; cells with none are treated as having every possible candidate.</Text>
          <Text style={[styles.rowDesc, { color: t.text }]}>• With no cell selected, tap a number to highlight it on the board, placed or not. Tap the selected cell again to let go of it.</Text>
          <Text style={[styles.rowDesc, { color: t.text }]}>• Tap the timer to pause.</Text>
        </View>

        <View style={styles.about} accessibilityLabel={`Version ${BUILD.version}, ${BUILD.detail}`}>
          <Text style={[styles.aboutVersion, { color: t.textMuted }]}>Sudokou {BUILD.version}</Text>
          <Text style={[styles.aboutDetail, { color: t.textMuted }]}>{BUILD.detail}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  title: { fontSize: 22, fontWeight: '700' },
  content: { padding: 16, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  group: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowDesc: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, marginTop: 8 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segText: { fontSize: 14, fontWeight: '600' },
  about: { alignItems: 'center', marginTop: 12, marginBottom: 8, gap: 2 },
  aboutVersion: { fontSize: 13, fontWeight: '600' },
  aboutDetail: { fontSize: 12 },
});
