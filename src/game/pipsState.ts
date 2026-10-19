// Pure game state for Pips: domino placement, turning, undo, clearing the
// board, hints, and where a tapped or dragged domino lands. Pips is solved by
// trial and error, so wrong placements are not counted as mistakes.

import { Difficulty } from '../engine/common';
import { PipsPuzzle, Placement, Spot, isSolved } from '../engine/pips';

export interface PipsGameState {
  id: string;
  type: 'pips';
  payload: PipsPuzzle;
  difficulty: Difficulty;
  place: Placement; // per domino: its spot, or null while in the tray
  history: { before: Placement }[];
  hintsUsed: number;
  elapsedMs: number;
  completed: boolean;
  savedAt?: number;
}

export type PipsAction =
  | { type: 'put'; k: number; spot: Spot | null } // null takes it back to the tray
  | { type: 'undo' }
  | { type: 'clear' } // every domino back to the tray
  | { type: 'hintShown' };

export function newPipsGame(id: string, difficulty: Difficulty, p: PipsPuzzle): PipsGameState {
  return {
    id,
    type: 'pips',
    payload: p,
    difficulty,
    place: p.dominoes.map(() => null),
    history: [],
    hintsUsed: 0,
    elapsedMs: 0,
    completed: false,
  };
}

const sameCells = (a: Spot | null, b: Spot) => !!a && a[0] === b[0] && a[1] === b[1];

/** Which domino covers each cell (grid index -> domino). */
export function occupancy(place: Placement): Map<number, number> {
  const out = new Map<number, number>();
  place.forEach((spot, k) => {
    if (!spot) return;
    out.set(spot[0], k);
    out.set(spot[1], k);
  });
  return out;
}

export function pipsReducer(s: PipsGameState, a: PipsAction): PipsGameState {
  if (a.type === 'hintShown') return { ...s, hintsUsed: s.hintsUsed + 1 };
  if (s.completed) return s;
  switch (a.type) {
    case 'put': {
      const cur = s.place[a.k];
      if (a.spot === null ? !cur : sameCells(cur, a.spot)) return s;
      const cells = new Set(s.payload.cells);
      if (a.spot && (!cells.has(a.spot[0]) || !cells.has(a.spot[1]) || a.spot[0] === a.spot[1])) return s;
      const place = s.place.slice();
      place[a.k] = a.spot;
      // Anything already on those cells goes back to the tray.
      if (a.spot) {
        place.forEach((sp, j) => {
          if (j !== a.k && sp && (a.spot!.includes(sp[0]) || a.spot!.includes(sp[1]))) place[j] = null;
        });
      }
      return { ...s, place, history: [...s.history, { before: s.place }], completed: isSolved(s.payload, place) };
    }
    case 'undo': {
      const last = s.history[s.history.length - 1];
      if (!last) return s;
      return { ...s, place: last.before, history: s.history.slice(0, -1) };
    }
    case 'clear': {
      if (s.place.every((sp) => !sp)) return s;
      return { ...s, place: s.place.map(() => null), history: [...s.history, { before: s.place }] };
    }
  }
  return s;
}

// ---------- moving dominoes (pure helpers for the screen) ----------

const DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** The cell next to `cell` in direction `dir` (right, down, left, up), or -1 off the board. */
function step(p: PipsPuzzle, cell: number, dir: number): number {
  const r = Math.floor(cell / p.cols) + DIRS[dir][0];
  const c = (cell % p.cols) + DIRS[dir][1];
  if (r < 0 || c < 0 || r >= p.rows || c >= p.cols) return -1;
  const j = r * p.cols + c;
  return p.cells.includes(j) ? j : -1;
}

/**
 * How a domino lies, each a quarter turn clockwise from the last: 0 a|b
 * across, 1 a over b, 2 b|a, 3 b over a (a = its first half).
 */
export type Turn = 0 | 1 | 2 | 3;

export const nextTurn = (o: Turn) => ((o + 1) % 4) as Turn;

/** How the domino on `spot` lies. */
export function spotTurn(p: PipsPuzzle, spot: Spot): Turn {
  const across = Math.floor(spot[0] / p.cols) === Math.floor(spot[1] / p.cols);
  return ((across ? 0 : 1) + (spot[0] < spot[1] ? 0 : 2)) as Turn;
}

/** The spot for a domino lying `o` with its top-left half on `anchor`, or null if it runs off the board. */
export function turnedSpot(p: PipsPuzzle, anchor: number, o: Turn): Spot | null {
  if (!p.cells.includes(anchor)) return null;
  const other = step(p, anchor, o % 2 === 0 ? 0 : 1);
  if (other < 0) return null;
  return o < 2 ? [anchor, other] : [other, anchor];
}

/**
 * Where domino k lands when tapped onto `cell` while lying `o`: covering
 * `cell` the way it is shown (its top-left half there, else its other half),
 * preferring empty cells; turned a quarter if it doesn't fit that way. Null if
 * `cell` has no neighbour on the board.
 */
export function tapSpot(s: PipsGameState, k: number, cell: number, o: Turn): Spot | null {
  const p = s.payload;
  const occ = occupancy(s.place);
  const free = (j: number) => !occ.has(j) || occ.get(j) === k;
  const options: Spot[] = [];
  for (const t of [o, nextTurn(o)]) {
    const back = step(p, cell, t % 2 === 0 ? 2 : 3); // the cell left of / above `cell`
    for (const anchor of [cell, back]) {
      const spot = anchor >= 0 ? turnedSpot(p, anchor, t) : null;
      if (spot) options.push(spot);
    }
  }
  return options.find((sp) => free(sp[0]) && free(sp[1])) ?? options[0] ?? null;
}

/** Which way `cell` lies from `from` (0 right, 1 down, 2 left, 3 up), or -1 if they don't touch. */
function dirTo(p: PipsPuzzle, from: number, cell: number): number {
  return [0, 1, 2, 3].findIndex((d) => step(p, from, d) === cell);
}

/** Clockwise quarter turns (0–3) that take a domino from `before` to `after` around `pivot`, a cell of both. */
export function quarterTurns(p: PipsPuzzle, pivot: number, before: Spot, after: Spot): number {
  const a = dirTo(p, pivot, before[0] === pivot ? before[1] : before[0]);
  const b = dirTo(p, pivot, after[0] === pivot ? after[1] : after[0]);
  return a < 0 || b < 0 ? 0 : (b - a + 4) % 4;
}

/**
 * Turns a placed domino a quarter turn clockwise around the half on `pivot`
 * (one of its cells): that half stays put and the other swings from right to
 * below, left, above. Positions off the board or taken by another domino are
 * skipped; null if there is nowhere else for it to go.
 */
export function turnSpot(s: PipsGameState, k: number, pivot: number): Spot | null {
  const cur = s.place[k];
  if (!cur || !cur.includes(pivot)) return null;
  const p = s.payload;
  const occ = occupancy(s.place);
  const free = (j: number) => !occ.has(j) || occ.get(j) === k;
  const other = cur[0] === pivot ? cur[1] : cur[0];
  const dir = dirTo(p, pivot, other);
  for (let t = 1; t < 4; t++) {
    const j = step(p, pivot, (dir + t) % 4);
    if (j >= 0 && free(j)) return cur[0] === pivot ? [pivot, j] : [j, pivot];
  }
  return null;
}
