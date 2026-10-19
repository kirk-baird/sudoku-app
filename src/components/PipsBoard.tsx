import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, GestureResponderEvent, Platform, Pressable, Text, View, ViewStyle } from 'react-native';
import { PuzzleStep } from '../engine/common';
import { PipsPuzzle, Placement, Spot, cellValues, regionLabel, regionStatus } from '../engine/pips';
import { Turn } from '../game/pipsState';
import { Theme } from '../theme';

const gapFor = (cell: number) => Math.max(2, Math.round(cell * 0.07));

/** Spacing on a board of cellSize cells: cell (row, col) has its top-left corner at (col × pitch, row × pitch). */
export function pipsGeometry(cellSize: number) {
  const gap = gapFor(cellSize);
  return { gap, pitch: cellSize + gap, inset: Math.max(1, Math.round(cellSize * 0.05)) };
}

export function pipsBoardSize(p: PipsPuzzle, cellSize: number, mini?: boolean) {
  const pitch = cellSize + gapFor(cellSize);
  const margin = mini ? 0 : Math.round(cellSize * 0.3); // room for the labels that hang off the board
  return { width: p.cols * pitch + margin, height: p.rows * pitch + margin };
}

/** Region colour per region: greedy, so touching regions never share one. */
export function regionColours(p: PipsPuzzle, count: number): number[] {
  const regionOf = new Map<number, number>();
  p.regions.forEach((r, k) => r.cells.forEach((c) => regionOf.set(c, k)));
  const out: number[] = [];
  p.regions.forEach((r, k) => {
    const taken = new Set<number>();
    for (const c of r.cells) {
      for (const j of [c - p.cols, c + p.cols, c % p.cols ? c - 1 : -1, (c + 1) % p.cols ? c + 1 : -1]) {
        const o = regionOf.get(j);
        if (o !== undefined && o < k) taken.add(out[o]);
      }
    }
    let colour = k % count;
    for (let t = 0; t < count && taken.has(colour); t++) colour = (colour + 1) % count;
    out.push(colour);
  });
  return out;
}

// Dot positions on a 3×3 grid (0 = start, 1 = middle, 2 = end) for 0–6 pips.
const LAYOUT: [number, number][][] = [
  [],
  [[1, 1]],
  [
    [0, 0],
    [2, 2],
  ],
  [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 2],
    [1, 2],
    [2, 2],
  ],
];

/** The dots for one half of a domino, drawn in a size×size square. */
export function PipFace({ value, size, color }: { value: number; size: number; color: string }) {
  const r = Math.max(1.5, size * 0.095);
  const m = size * 0.24;
  const at = (k: number) => (k === 0 ? m : k === 1 ? size / 2 : size - m) - r;
  return (
    <View style={{ width: size, height: size }}>
      {LAYOUT[value].map(([row, col], i) => (
        <View key={i} style={{ position: 'absolute', left: at(col), top: at(row), width: 2 * r, height: 2 * r, borderRadius: r, backgroundColor: color }} />
      ))}
    </View>
  );
}

/** A domino lying across (a on the left) or down (a on top). `half` is its thickness; `length` defaults to two halves. */
export function DominoView(props: {
  a: number;
  b: number;
  half: number;
  length?: number;
  vertical?: boolean;
  face: string;
  edge: string;
  pip: string;
  edgeWidth?: number;
  dashed?: boolean;
}) {
  const { half, vertical } = props;
  const len = props.length ?? half * 2;
  const w = vertical ? half : len;
  const h = vertical ? len : half;
  const bw = props.edgeWidth ?? Math.max(1.5, half * 0.05);
  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: half * 0.18,
        backgroundColor: props.face,
        borderWidth: bw,
        borderColor: props.edge,
        borderStyle: props.dashed ? 'dashed' : 'solid',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        overflow: 'hidden',
      }}
    >
      <PipFace value={props.a} size={half - bw * 2} color={props.pip} />
      <View style={vertical ? { width: half * 0.6, height: Math.max(1, bw * 0.7), backgroundColor: props.edge, opacity: 0.5 } : { height: half * 0.6, width: Math.max(1, bw * 0.7), backgroundColor: props.edge, opacity: 0.5 }} />
      <PipFace value={props.b} size={half - bw * 2} color={props.pip} />
    </View>
  );
}

/** A domino lifted off the board or out of the tray: a little bigger, with a shadow. */
export const RAISED_SCALE = 1.08;
export const raisedShadow = (half: number) => ({ borderRadius: half * 0.18, boxShadow: '0px 6px 14px rgba(0, 0, 0, 0.35)' });

const SPIN_MS = 180;

/**
 * Turns its children from `from` degrees to upright when mounted (remount it,
 * by key, for each turn), around `origin` (default: its centre).
 */
export function Spin(props: { from: number; origin?: [number, number]; style?: ViewStyle; children: React.ReactNode }) {
  const [angle] = useState(() => new Animated.Value(props.from));
  useEffect(() => {
    Animated.timing(angle, { toValue: 0, duration: SPIN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [angle]);
  const rotate = angle.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });
  return (
    <Animated.View style={[props.style, props.origin ? { transformOrigin: [props.origin[0], props.origin[1], 0] } : null, { transform: [{ rotate }] }]}>
      {props.children}
    </Animated.View>
  );
}

/** A placed domino being turned: it swings `deg` degrees clockwise around its half on `pivot`. `id` restarts the swing. */
export interface PipsSpin {
  k: number;
  pivot: number;
  deg: number;
  id: number;
}

const BoardCell = memo(function BoardCell(props: {
  index: number;
  x: number;
  y: number;
  size: number;
  bg: string;
  ring: string | null;
  label: string;
  onPress?: (i: number) => void;
  onLongPress?: (i: number) => void;
}) {
  const style = {
    position: 'absolute' as const,
    left: props.x,
    top: props.y,
    width: props.size,
    height: props.size,
    borderRadius: props.size * 0.14,
    backgroundColor: props.bg,
    borderWidth: props.ring ? 2 : 0,
    borderColor: props.ring ?? undefined,
  };
  if (!props.onPress) return <View style={style} />;
  return (
    <Pressable
      style={style}
      onPress={() => props.onPress?.(props.index)}
      onLongPress={() => props.onLongPress?.(props.index)}
      delayLongPress={350}
      accessibilityLabel={props.label}
    />
  );
});

export function PipsBoard(props: {
  puzzle: PipsPuzzle;
  place: Placement;
  cellSize: number;
  raised?: number | null; // domino lifted on the board, ready to turn or drag
  spin?: PipsSpin | null; // the raised domino's last turn, animated
  hintStep?: PuzzleStep | null;
  problemCells?: number[];
  hidden?: boolean;
  mini?: boolean;
  lifted?: number | null; // domino being dragged: not drawn in its spot
  dropTarget?: Spot | null; // where the dragged domino would land
  theme: Theme;
  onPressCell?: (cell: number) => void;
  onLongPressCell?: (cell: number) => void;
}) {
  const { puzzle: p, cellSize: s, theme: t, mini } = props;
  const place = props.hidden ? p.dominoes.map(() => null) : props.place;
  const { gap, pitch, inset } = pipsGeometry(s);
  const size = pipsBoardSize(p, s, mini);
  const xy = (c: number) => ({ x: (c % p.cols) * pitch, y: Math.floor(c / p.cols) * pitch });
  const regionOf = new Map<number, number>();
  p.regions.forEach((r, k) => r.cells.forEach((c) => regionOf.set(c, k)));
  const colours = regionColours(p, t.regionFill.length);
  const fill = (c: number) => {
    const k = regionOf.get(c);
    return k === undefined ? t.pipsBlank : t.regionFill[colours[k]];
  };
  const pattern = new Set(props.hidden ? [] : (props.hintStep?.pattern ?? []));
  const unit = new Set(props.hidden ? [] : (props.hintStep?.unitCells ?? []));
  const problem = new Set(props.problemCells ?? []);
  const vals = cellValues(p, place);

  const nodes: React.ReactNode[] = [];

  // Fill the gaps inside a region so it reads as one shape.
  if (!props.hidden) {
    for (const c of p.cells) {
      const k = regionOf.get(c);
      if (k === undefined) continue;
      const { x, y } = xy(c);
      const right = (c + 1) % p.cols !== 0 && regionOf.get(c + 1) === k;
      const down = regionOf.get(c + p.cols) === k;
      const colour = fill(c);
      // Reach past the rounded corners so the join has no notch.
      const rad = Math.ceil(s * 0.14);
      if (right) nodes.push(<View key={`gr${c}`} style={{ position: 'absolute', left: x + s - rad, top: y, width: gap + 2 * rad, height: s, backgroundColor: colour }} />);
      if (down) nodes.push(<View key={`gd${c}`} style={{ position: 'absolute', left: x, top: y + s - rad, width: s, height: gap + 2 * rad, backgroundColor: colour }} />);
      if (right && down && regionOf.get(c + p.cols + 1) === k)
        nodes.push(<View key={`gc${c}`} style={{ position: 'absolute', left: x + s - rad, top: y + s - rad, width: gap + 2 * rad, height: gap + 2 * rad, backgroundColor: colour }} />);
    }
  }

  for (const c of p.cells) {
    const { x, y } = xy(c);
    let bg = props.hidden ? t.pipsBlank : fill(c);
    if (problem.has(c)) bg = t.cellError;
    else if (pattern.has(c)) bg = t.hintPattern;
    const rg = regionOf.get(c);
    const what = rg === undefined ? 'no rule' : `region ${regionLabel(p.regions[rg])}`;
    const v = vals.get(c);
    nodes.push(
      <BoardCell
        key={`c${c}`}
        index={c}
        x={x}
        y={y}
        size={s}
        bg={bg}
        ring={unit.has(c) && !pattern.has(c) ? t.accent : null}
        label={`Row ${Math.floor(c / p.cols) + 1} column ${(c % p.cols) + 1}, ${what}${v !== undefined ? `, ${v} pips` : ''}`}
        onPress={mini ? undefined : props.onPressCell}
        onLongPress={mini ? undefined : props.onLongPressCell}
      />,
    );
  }

  // Dominoes on the board (and a ghost for the hint), drawn over the cells but letting taps through.
  const drawDomino = (
    key: string,
    a: number,
    b: number,
    ca: number,
    cb: number,
    look: { face: string; edge: string; pip: string; width?: number; dashed?: boolean },
    raise?: { spin: PipsSpin | null },
    into: React.ReactNode[] = nodes,
  ) => {
    const pa = xy(ca);
    const pb = xy(cb);
    const vertical = pa.x === pb.x;
    const first = vertical ? (pa.y < pb.y ? pa : pb) : pa.x < pb.x ? pa : pb;
    const swap = vertical ? pa.y > pb.y : pa.x > pb.x;
    const half = s - 2 * inset;
    const len = 2 * s + gap - 2 * inset;
    const box: ViewStyle = {
      position: 'absolute',
      left: first.x + inset,
      top: first.y + inset,
      width: vertical ? half : len,
      height: vertical ? len : half,
      pointerEvents: 'none',
    };
    let face = mini ? (
      <View style={{ flex: 1, borderRadius: half * 0.2, backgroundColor: look.face, borderWidth: 1, borderColor: look.edge }} />
    ) : (
      <DominoView
        a={swap ? b : a}
        b={swap ? a : b}
        half={half}
        length={len}
        vertical={vertical}
        face={look.face}
        edge={look.edge}
        pip={look.pip}
        edgeWidth={look.width}
        dashed={look.dashed}
      />
    );
    if (!raise) {
      into.push(
        <View key={key} style={box}>
          {face}
        </View>,
      );
      return;
    }
    face = <View style={[raisedShadow(half), { transform: [{ translateY: -half * 0.08 }, { scale: RAISED_SCALE }] }]}>{face}</View>;
    const sp = raise.spin;
    if (!sp) {
      into.push(
        <View key={key} style={box}>
          {face}
        </View>,
      );
      return;
    }
    // Swing around the centre of the half that stays put.
    const pv = xy(sp.pivot);
    const origin: [number, number] = [pv.x + s / 2 - (first.x + inset), pv.y + s / 2 - (first.y + inset)];
    into.push(
      <Spin key={`${key}s${sp.id}`} from={-sp.deg} origin={origin} style={box}>
        {face}
      </Spin>,
    );
  };
  const raisedNodes: React.ReactNode[] = []; // drawn last, above everything
  place.forEach((spot, k) => {
    if (!spot || k === props.lifted) return;
    const [a, b] = p.dominoes[k];
    const up = props.raised === k && !mini;
    drawDomino(
      `d${k}`,
      a,
      b,
      spot[0],
      spot[1],
      {
        face: t.dominoFace,
        edge: up ? t.accent : t.dominoEdge,
        pip: t.dominoPip,
        width: up ? Math.max(2.5, s * 0.07) : undefined,
      },
      up ? { spin: props.spin?.k === k ? props.spin : null } : undefined,
      up ? raisedNodes : nodes,
    );
  });
  const ghost = props.hidden ? null : props.hintStep?.placements;
  if (ghost && ghost.length === 2 && !place.some((sp) => sp && sp.includes(ghost[0].cell) && sp.includes(ghost[1].cell))) {
    drawDomino('ghost', ghost[0].digit, ghost[1].digit, ghost[0].cell, ghost[1].cell, { face: t.hintPlace, edge: t.hintKey, pip: t.text, dashed: true, width: 2 });
  }
  if (props.dropTarget && !props.hidden) {
    const pa = xy(Math.min(...props.dropTarget));
    const across = Math.abs(props.dropTarget[0] - props.dropTarget[1]) === 1;
    nodes.push(
      <View
        key="drop"
        style={{
          position: 'absolute',
          left: pa.x,
          top: pa.y,
          width: across ? 2 * s + gap : s,
          height: across ? s : 2 * s + gap,
          borderRadius: s * 0.2,
          borderWidth: Math.max(2.5, s * 0.07),
          borderColor: t.accent,
          pointerEvents: 'none',
        }}
      />,
    );
  }

  // Region labels hang off the bottom-right corner of each region's last cell.
  if (!mini && !props.hidden) {
    p.regions.forEach((r, k) => {
      const last = r.cells.reduce((best, c) => (Math.floor(c / p.cols) > Math.floor(best / p.cols) || (Math.floor(c / p.cols) === Math.floor(best / p.cols) && c > best) ? c : best));
      const { x, y } = xy(last);
      const label = regionLabel(r);
      const status = regionStatus(r, vals);
      const b = Math.max(18, Math.round(s * 0.46));
      nodes.push(
        <View
          key={`b${k}`}
          style={{
            position: 'absolute',
            left: x + s - b * 0.62,
            top: y + s - b * 0.5,
            width: b,
            height: b,
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <View
            style={{
              position: 'absolute',
              width: b * 0.78,
              height: b * 0.78,
              borderRadius: b * 0.14,
              transform: [{ rotate: '45deg' }],
              backgroundColor: status === 'broken' ? t.digitError : t.regionBadge[colours[k]],
              borderWidth: 1.5,
              borderColor: t.bg,
            }}
          />
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: b * (label.length > 2 ? 0.34 : 0.44) }} numberOfLines={1}>
            {label}
          </Text>
        </View>,
      );
    });
  }

  nodes.push(...raisedNodes);
  return <View style={{ width: size.width, height: size.height }}>{nodes}</View>;
}

/** A domino lying `o` (see Turn), as two halves of size `half` and a length `length`. */
export function TurnedDomino(props: { a: number; b: number; o: Turn; half: number; length?: number; edge: string; edgeWidth?: number; theme: Theme }) {
  const { o, theme: t } = props;
  return (
    <DominoView
      a={o < 2 ? props.a : props.b}
      b={o < 2 ? props.b : props.a}
      half={props.half}
      length={props.length}
      vertical={o % 2 === 1}
      face={t.dominoFace}
      edge={props.edge}
      pip={t.dominoPip}
      edgeWidth={props.edgeWidth}
    />
  );
}

/** The empty slot a placed or dragged domino leaves in the tray. */
function TraySlot({ half, theme: t }: { half: number; theme: Theme }) {
  return (
    <View style={{ width: half * 2, height: half * 2, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: half * 2, height: half, borderRadius: half * 0.18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.border }} />
    </View>
  );
}

/** Finger positions (window coordinates) while a tray domino is dragged. */
export interface TrayDrag {
  start: (k: number, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: (x: number, y: number) => void;
  cancel: () => void;
}

/** Movement before a press turns into a drag. */
export const DRAG_SLOP = 6;

function TrayDomino(props: {
  k: number;
  a: number;
  b: number;
  turn: Turn;
  spin: number; // changes each time it is turned (0: not turned yet), swinging it round
  half: number;
  selected: boolean;
  lifted: boolean;
  disabled?: boolean;
  theme: Theme;
  onPress: (k: number) => void;
  drag: TrayDrag;
}) {
  const { a, b, half, theme: t, selected: sel, drag } = props;
  const start = useRef({ x: 0, y: 0 });
  const at = (e: GestureResponderEvent) => [e.nativeEvent.pageX, e.nativeEvent.pageY] as const;
  // Taps go to the Pressable; once the finger moves, the drag takes over.
  // While dragged it stays mounted (showing an empty slot): unmounting the
  // view that holds the touch would end the drag.
  return (
    <View
      onStartShouldSetResponderCapture={(e) => {
        start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        return false;
      }}
      onMoveShouldSetResponderCapture={(e) => !props.disabled && Math.hypot(e.nativeEvent.pageX - start.current.x, e.nativeEvent.pageY - start.current.y) > DRAG_SLOP}
      onResponderGrant={(e) => drag.start(props.k, ...at(e))}
      onResponderMove={(e) => drag.move(...at(e))}
      onResponderRelease={(e) => drag.end(...at(e))}
      onResponderTerminate={drag.cancel}
      onResponderTerminationRequest={() => false}
    >
      {props.lifted ? (
        <TraySlot half={half} theme={t} />
      ) : (
        <Pressable
          onPress={() => props.onPress(props.k)}
          disabled={props.disabled}
          accessibilityRole="button"
          accessibilityState={{ selected: sel }}
          accessibilityLabel={`Domino ${a} and ${b}${sel ? ', selected' : ''}`}
          accessibilityHint={sel ? 'Tap again to turn it' : 'Tap to pick it up, or drag it onto the board'}
          style={{ width: half * 2, height: half * 2, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: sel ? -4 : 0 }] }}
        >
          <Spin key={props.spin} from={props.spin ? -90 : 0}>
            <View style={sel ? [raisedShadow(half), { transform: [{ scale: RAISED_SCALE }] }] : null}>
              <TurnedDomino a={a} b={b} o={props.turn} half={half} edge={sel ? t.accent : t.dominoEdge} edgeWidth={sel ? 3 : undefined} theme={t} />
            </View>
          </Spin>
        </Pressable>
      )}
    </View>
  );
}

/**
 * The dominoes still to place, each shown the way it is turned. Placed (and
 * dragged) ones leave an empty slot so nothing jumps around.
 */
export function DominoTray(props: {
  puzzle: PipsPuzzle;
  place: Placement;
  turns: Turn[];
  spin: { k: number; id: number } | null; // the last tray domino turned
  selected: number | null;
  lifted: number | null;
  half: number;
  disabled?: boolean;
  theme: Theme;
  onPress: (k: number) => void;
  drag: TrayDrag;
}) {
  const { puzzle: p, half, theme: t } = props;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: half * 0.4, rowGap: half * 0.15 }}>
      {p.dominoes.map(([a, b], k) => {
        if (props.place[k]) return <TraySlot key={k} half={half} theme={t} />;
        return (
          <TrayDomino
            key={k}
            k={k}
            a={a}
            b={b}
            turn={props.turns[k] ?? 0}
            spin={props.spin?.k === k ? props.spin.id : 0}
            half={half}
            selected={props.selected === k}
            lifted={props.lifted === k}
            disabled={props.disabled}
            theme={t}
            onPress={props.onPress}
            drag={props.drag}
          />
        );
      })}
    </View>
  );
}
