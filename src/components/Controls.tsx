import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function ToolButton(props: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  badge?: string;
  theme: Theme;
}) {
  const t = props.theme;
  const color = props.disabled ? t.border : props.active ? t.accent : t.text;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [styles.tool, pressed && { opacity: 0.55 }]}
      accessibilityRole="button"
      accessibilityLabel={props.label}
    >
      <View>
        <MaterialCommunityIcons name={props.icon} size={26} color={color} />
        {props.badge ? (
          <View style={[styles.badge, { backgroundColor: props.active ? t.accent : t.textMuted }]}>
            <Text style={[styles.badgeText, { color: t.accentText }]}>{props.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.toolLabel, { color: props.disabled ? t.border : t.textMuted }]}>{props.label}</Text>
    </Pressable>
  );
}

export function NumberPad(props: {
  maxDigit: number;
  symbols: string; // digit -> glyph
  counts: number[]; // placed (correct) count per digit (index 1..maxDigit)
  totals: number[] | null; // expected count per digit; null hides the counters
  pencilMode: boolean;
  highlighted?: number; // digit the pad is highlighting on the board (no cell selected)
  onDigit: (d: number) => void;
  onLongDigit: (d: number) => void;
  disabled?: boolean;
  theme: Theme;
}) {
  const t = props.theme;
  const digits = Array.from({ length: props.maxDigit }, (_, i) => i + 1);
  const rows = props.maxDigit > 9 ? [digits.slice(0, Math.ceil(digits.length / 2)), digits.slice(Math.ceil(digits.length / 2))] : [digits];
  const compact = rows.length > 1;
  return (
    <View style={{ gap: 4 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.pad}>
          {row.map((d) => {
            const remaining = props.totals ? props.totals[d] - props.counts[d] : null;
            const done = remaining != null && remaining <= 0;
            const lit = props.highlighted === d;
            return (
              <Pressable
                key={d}
                disabled={props.disabled}
                onPress={() => props.onDigit(d)}
                onLongPress={() => props.onLongDigit(d)}
                delayLongPress={350}
                style={({ pressed }) => [
                  styles.padKey,
                  compact && styles.padKeyCompact,
                  { backgroundColor: pressed ? t.surfaceAlt : lit ? t.cellSame : t.surface, borderColor: lit ? t.accent : t.border },
                ]}
                accessibilityLabel={`${props.pencilMode ? 'Pencil ' : ''}${props.symbols[d]}`}
                accessibilityState={{ selected: lit }}
              >
                <Text
                  style={[
                    styles.padDigit,
                    compact && styles.padDigitCompact,
                    props.pencilMode && (compact ? styles.padDigitPencilCompact : styles.padDigitPencil),
                    { color: done ? t.border : props.pencilMode ? t.textMuted : t.accent },
                  ]}
                >
                  {props.symbols[d]}
                </Text>
                {remaining != null ? (
                  <Text style={[styles.padCount, { color: t.textMuted }]}>{done ? ' ' : remaining}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tool: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6, flex: 1 },
  toolLabel: { fontSize: 12, marginTop: 2 },
  badge: { position: 'absolute', right: -14, top: -4, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: 9, fontWeight: '700' },
  pad: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  padKey: { flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 4, borderRadius: 10, borderWidth: 1 },
  padDigit: { fontSize: 30, fontWeight: '500', lineHeight: 34, fontVariant: ['tabular-nums'] },
  padDigitPencil: { fontSize: 22, lineHeight: 34, fontWeight: '400' },
  padCount: { fontSize: 11, lineHeight: 13 },
  padKeyCompact: { paddingTop: 3, paddingBottom: 2 },
  padDigitCompact: { fontSize: 24, lineHeight: 28 },
  padDigitPencilCompact: { fontSize: 18, lineHeight: 28, fontWeight: '400' },
});
