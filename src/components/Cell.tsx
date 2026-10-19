import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../theme';

export interface CellProps {
  index: number;
  size: number;
  x: number;
  y: number;
  row: number; // for the accessibility label
  col: number;
  value: number;
  given: boolean;
  showError: boolean;
  pencil: number; // candidate bitmask to draw
  bg: string;
  matchDigit: number; // candidate digit to highlight (identical-number highlight)
  keyMask: number; // hint: reason candidates (primary colour)
  keyAltMask: number; // hint: reason candidates (alternate colour)
  elimMask: number; // hint: candidates to remove
  placeDigit: number; // hint: digit to place
  symbols: string; // digit -> glyph
  candidateGrid: 3 | 4;
  maxDigit: number;
  label?: string; // calcudoku cage label
  labelSpace?: boolean; // the board has cage labels: every cell leaves room for one, so digits and candidates match in size
  mini?: boolean;
  theme: Theme;
  onPress?: (index: number) => void;
}

function CellView(p: CellProps) {
  const { size, theme: t } = p;
  const k = p.candidateGrid;
  const labelH = p.labelSpace && !p.mini ? Math.max(9, size * 0.26) : 0;
  const candSize = (size - labelH) / k;
  const placeBox = labelH ? (size - labelH) * 0.92 : size * 0.82; // below the cage label
  const valueColor = p.given ? t.digitGiven : p.showError ? t.digitError : t.digitUser;
  const glyph = (d: number) => p.symbols[d] ?? String(d);
  const digits = Array.from({ length: k * k }, (_, i) => i + 1).filter((d) => d <= Math.max(p.maxDigit, k * k));

  const content = (
    <>
      {p.label ? (
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            { fontSize: p.mini ? Math.max(4, size * 0.3) : Math.max(8, size * 0.24), color: t.text, left: p.mini ? 1 : 2 },
          ]}
        >
          {p.label}
        </Text>
      ) : null}
      {p.value ? (
        <Text
          style={[
            styles.value,
            {
              fontSize: size * (p.labelSpace ? 0.52 : 0.62),
              lineHeight: size * 0.9,
              color: valueColor,
              fontWeight: p.given ? '600' : '500',
              marginTop: labelH * 0.5,
            },
          ]}
        >
          {glyph(p.value)}
        </Text>
      ) : p.placeDigit ? (
        <View
          style={[
            styles.place,
            { backgroundColor: t.hintPlace, width: placeBox, height: placeBox, borderRadius: placeBox * 0.24, marginTop: labelH },
          ]}
        >
          <Text style={[styles.value, { fontSize: placeBox * 0.68, lineHeight: placeBox * 0.98, color: t.text }]}>
            {glyph(p.placeDigit)}
          </Text>
        </View>
      ) : p.pencil && !p.mini ? (
        <View style={[styles.candGrid, { paddingTop: labelH, paddingHorizontal: (size - candSize * k) / 2 }]}>
          {digits.map((d) => {
            const on = (p.pencil >> d) & 1;
            const b = 1 << d;
            const isElim = (p.elimMask & b) !== 0;
            const isKey = (p.keyMask & b) !== 0;
            const isAlt = (p.keyAltMask & b) !== 0;
            const isMatch = p.matchDigit === d && on;
            let bg: string | undefined;
            let color = t.pencil;
            if (isElim) {
              bg = t.hintElim;
              color = t.hintElimText;
            } else if (isKey) bg = t.hintKey;
            else if (isAlt) bg = t.hintKeyAlt;
            else if (isMatch) {
              bg = t.pencilMatchBg;
              color = t.pencilMatchText;
            }
            return (
              <View key={d} style={[styles.cand, { width: candSize, height: candSize }]}>
                {on ? (
                  <View
                    // Always give this view a background (transparent when not
                    // highlighted) and keep it from being flattened: otherwise
                    // Android recreates it when a highlight appears and drops the
                    // corner radius, so highlights flip between shapes.
                    collapsable={false}
                    style={{
                      width: candSize * 0.9,
                      height: candSize * 0.9,
                      borderRadius: candSize * 0.2,
                      backgroundColor: bg ?? 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: candSize * 0.7,
                        lineHeight: candSize * 0.84,
                        color,
                        fontWeight: bg ? '700' : '400',
                        textDecorationLine: isElim ? 'line-through' : 'none',
                        includeFontPadding: false,
                        textAlign: 'center',
                      }}
                    >
                      {glyph(d)}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );

  const style = [styles.cell, { left: p.x, top: p.y, width: size, height: size, backgroundColor: p.bg }];
  if (!p.onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      onPress={() => p.onPress?.(p.index)}
      style={style}
      accessibilityLabel={`Row ${p.row + 1} column ${p.col + 1}${p.value ? `, ${glyph(p.value)}` : ''}`}
    >
      {content}
    </Pressable>
  );
}

export const Cell = memo(CellView);

/** Kakuro clue cell: dark, split by a diagonal, across total top-right and down total bottom-left. */
export const ClueCell = memo(function ClueCell(p: {
  x: number;
  y: number;
  size: number;
  across?: number;
  down?: number;
  mini?: boolean;
  theme: Theme;
}) {
  const t = p.theme;
  const diag = Math.SQRT2 * p.size;
  const hasClue = p.across != null || p.down != null;
  const fs = Math.max(p.mini ? 4 : 8, p.size * 0.3);
  return (
    <View
      style={[styles.cell, { left: p.x, top: p.y, width: p.size, height: p.size, backgroundColor: t.clueBg, overflow: 'hidden' }]}
    >
      {hasClue ? (
        <>
          <View
            style={{
              position: 'absolute',
              width: diag,
              height: 1,
              backgroundColor: t.clueLine,
              left: (p.size - diag) / 2,
              top: p.size / 2,
              transform: [{ rotate: '45deg' }],
            }}
          />
          {p.across != null ? (
            <Text style={[styles.clueText, { color: t.clueText, fontSize: fs, right: 2, top: 1 }]}>{p.across}</Text>
          ) : null}
          {p.down != null ? (
            <Text style={[styles.clueText, { color: t.clueText, fontSize: fs, left: 2, bottom: 1 }]}>{p.down}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  value: { textAlign: 'center', includeFontPadding: false, fontVariant: ['tabular-nums'] },
  place: { alignItems: 'center', justifyContent: 'center' },
  candGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', height: '100%' },
  cand: { alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', top: 0, fontWeight: '700', includeFontPadding: false },
  clueText: { position: 'absolute', fontWeight: '700', includeFontPadding: false, fontVariant: ['tabular-nums'] },
});
