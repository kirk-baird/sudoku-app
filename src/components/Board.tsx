import React, { memo, useMemo } from 'react';
import { View } from 'react-native';
import { PuzzleStep } from '../engine/common';
import { BoardLayout } from '../games/registry';
import { Theme } from '../theme';
import { Cell, ClueCell } from './Cell';

/** What a hint wants highlighted on the board. */
export interface HintMarks {
  step?: PuzzleStep;
  cells?: number[]; // problem cells (wrong digits etc.)
  effective?: number[]; // candidates the hint reasoned about
}

interface Props {
  layout: BoardLayout;
  cellSize: number;
  maxDigit: number;
  givens: number[];
  values: number[];
  pencil: number[];
  solution: number[];
  playable: boolean[];
  peers: number[][];
  selected: number | null;
  highlightDigit: number;
  errorDetection: boolean;
  highlightCandidates: boolean;
  /** Cells where the correct candidate was removed (shown as errors). */
  candidateErrors?: number[];
  hint: HintMarks | null;
  hidden: boolean; // paused
  mini?: boolean;
  theme: Theme;
  onPressCell?: (i: number) => void;
}

const GAP = 1;

export function boardPixelSize(layout: BoardLayout, cellSize: number) {
  const pitch = cellSize + GAP;
  return { width: layout.gridCols * pitch + GAP, height: layout.gridRows * pitch + GAP };
}

/** Thin grid lines behind cells and thick region/cage/outer borders on top. Static per puzzle. */
const Lines = memo(function Lines({
  layout,
  cellSize,
  mini,
  theme: t,
  layer,
}: {
  layout: BoardLayout;
  cellSize: number;
  mini?: boolean;
  theme: Theme;
  layer: 'back' | 'front';
}) {
  const pitch = cellSize + GAP;
  const cellAt = useMemo(() => {
    const m = new Map<number, number>();
    layout.pos.forEach(([r, c], i) => m.set(r * layout.gridCols + c, i));
    return m;
  }, [layout]);

  const views: React.ReactNode[] = [];
  if (layer === 'back') {
    layout.pos.forEach(([r, c], i) => {
      views.push(
        <View
          key={i}
          style={{ position: 'absolute', left: c * pitch, top: r * pitch, width: pitch + GAP, height: pitch + GAP, backgroundColor: t.lineThin }}
        />,
      );
    });
    return <>{views}</>;
  }

  const T = mini ? 1.5 : cellSize < 26 ? 2 : 2.5;
  const region = layout.regionOf;
  const at = (r: number, c: number) => (r < 0 || c < 0 || r >= layout.gridRows || c >= layout.gridCols ? undefined : cellAt.get(r * layout.gridCols + c));
  layout.pos.forEach(([r, c], i) => {
    const x = c * pitch;
    const y = r * pitch;
    const differs = (j: number | undefined) => j === undefined || (region ? region[j] !== region[i] : false);
    // top and left edges for every cell; bottom/right only where there's no neighbour (avoids double bars)
    const sides: ['top' | 'left' | 'bottom' | 'right', number | undefined][] = [
      ['top', at(r - 1, c)],
      ['left', at(r, c - 1)],
      ['bottom', at(r + 1, c)],
      ['right', at(r, c + 1)],
    ];
    for (const [side, j] of sides) {
      if ((side === 'bottom' || side === 'right') && j !== undefined) continue;
      if (!differs(j)) continue;
      const horizontal = side === 'top' || side === 'bottom';
      const lineX = side === 'right' ? x + pitch : x;
      const lineY = side === 'bottom' ? y + pitch : y;
      views.push(
        <View
          key={`${i}${side}`}
          style={{
            position: 'absolute',
            backgroundColor: t.lineThick,
            left: horizontal ? x - T / 2 + GAP / 2 : lineX - T / 2 + GAP / 2,
            top: horizontal ? lineY - T / 2 + GAP / 2 : y - T / 2 + GAP / 2,
            width: horizontal ? pitch + T : T,
            height: horizontal ? T : pitch + T,
            borderRadius: T / 2,
          }}
        />,
      );
    }
  });
  return <>{views}</>;
});

export function Board(p: Props) {
  const t = p.theme;
  const { layout, cellSize } = p;
  const pitch = cellSize + GAP;
  const size = boardPixelSize(layout, cellSize);

  const hintData = useMemo(() => {
    const n = layout.pos.length;
    const key = new Array(n).fill(0);
    const alt = new Array(n).fill(0);
    const elim = new Array(n).fill(0);
    const place = new Array(n).fill(0);
    const pattern = new Set<number>();
    const unitCells = new Set<number>();
    const problem = new Set<number>(p.hint?.cells ?? []);
    const st = p.hint?.step;
    if (st) {
      for (const k of st.keys) (k.color === 1 ? alt : key)[k.cell] |= 1 << k.digit;
      for (const e of st.eliminations) elim[e.cell] |= 1 << e.digit;
      for (const pl of st.placements) place[pl.cell] = pl.digit;
      st.pattern.forEach((c) => pattern.add(c));
      st.unitCells.forEach((c) => unitCells.add(c));
    }
    return { key, alt, elim, place, pattern, unitCells, problem, active: !!p.hint };
  }, [p.hint, layout]);

  const sel = p.selected;
  const peerSet = useMemo(() => new Set(sel != null ? p.peers[sel] : []), [sel, p.peers]);
  const hl = p.highlightDigit;
  const candErr = useMemo(() => new Set(p.candidateErrors ?? []), [p.candidateErrors]);

  const cells: React.ReactNode[] = [];
  layout.pos.forEach(([r, c], i) => {
    const x = c * pitch + GAP;
    const y = r * pitch + GAP;
    if (!p.playable[i]) {
      const clue = layout.clues?.get(i);
      cells.push(<ClueCell key={i} x={x} y={y} size={cellSize} across={clue?.across} down={clue?.down} mini={p.mini} theme={t} />);
      return;
    }
    const value = p.values[i];
    const given = !!p.givens[i];
    const wrong = !!value && !given && value !== p.solution[i];
    const showError = wrong && p.errorDetection;
    const shaded = layout.shaded?.[i];

    let bg = given ? t.cellGiven : shaded ? t.cellShaded : t.cell;
    if (hintData.active) {
      if (hintData.problem.has(i)) bg = t.cellError;
      else if (hintData.pattern.has(i)) bg = t.hintPattern;
      else if (hintData.unitCells.has(i)) bg = given ? t.cellPeerGiven : t.cellPeer;
    } else if (!p.mini) {
      // a removed correct candidate shows even on the selected cell, so you notice straight away
      if (candErr.has(i)) bg = t.cellError;
      else if (sel === i) bg = t.cellSelected;
      else if (showError) bg = t.cellError;
      else if (hl && value === hl) bg = t.cellSame;
      else if (peerSet.has(i)) bg = given ? t.cellPeerGiven : t.cellPeer;
    }

    let pencil = value ? 0 : p.pencil[i];
    const involved = hintData.key[i] | hintData.alt[i] | hintData.elim[i];
    if (involved && p.hint?.effective) pencil = p.hint.effective[i];

    cells.push(
      <Cell
        key={i}
        index={i}
        size={cellSize}
        x={x}
        y={y}
        row={r}
        col={c}
        value={p.hidden ? 0 : value}
        given={given}
        showError={showError}
        pencil={p.hidden ? 0 : pencil}
        bg={p.hidden ? t.cell : bg}
        matchDigit={!hintData.active && p.highlightCandidates ? hl : 0}
        keyMask={hintData.key[i]}
        keyAltMask={hintData.alt[i]}
        elimMask={hintData.elim[i]}
        placeDigit={hintData.place[i]}
        symbols={layout.symbols}
        candidateGrid={layout.candidateGrid}
        maxDigit={p.maxDigit}
        label={layout.labels?.[i]}
        labelSpace={!!layout.labels}
        mini={p.mini}
        theme={t}
        onPress={p.onPressCell}
      />,
    );
  });

  return (
    <View style={{ width: size.width, height: size.height }}>
      <Lines layout={layout} cellSize={cellSize} mini={p.mini} theme={t} layer="back" />
      {cells}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size.width, height: size.height }}>
        <Lines layout={layout} cellSize={cellSize} mini={p.mini} theme={t} layer="front" />
      </View>
    </View>
  );
}
