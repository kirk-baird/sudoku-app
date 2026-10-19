// Candidates, applying steps, grading, singles-only finish, rules and hints.

import { CellDigit, DigitRules, PuzzleHint, PuzzleStep, bit, popcount } from '../common';
import { allowedMask } from './combos';
import { State, TECHNIQUE_BY_ID, findStep, makeStep } from './techniques';
import { Ctx, KakuroLayout, KakuroPuzzle, cellListText, cellName, ctxOf } from './types';

/** Legal candidates per cell given placed values (0 for filled/black cells). */
export function legalCands(ctx: Ctx, values: number[]): number[] {
  const allowed = ctx.runs.map((run) => {
    let placed = 0;
    let sum = 0;
    let k = 0;
    for (const c of run.cells) {
      const v = values[c];
      if (v) {
        placed |= bit(v);
        sum += v;
      } else k++;
    }
    return allowedMask(run.sum - sum, k, placed);
  });
  const out = new Array<number>(ctx.n).fill(0);
  for (const c of ctx.whiteCells) {
    if (values[c]) continue;
    let m = 0x3fe;
    for (const r of ctx.cellRuns[c]) m &= allowed[r];
    out[c] = m;
  }
  return out;
}

/** Digits not yet placed in any of the cell's runs, ignoring the sums (0 for filled/black cells). */
export function basicCands(ctx: Ctx, values: number[]): number[] {
  const out = new Array<number>(ctx.n).fill(0);
  for (const c of ctx.whiteCells) {
    if (values[c]) continue;
    let m = 0x3fe;
    for (const q of ctx.peers[c]) if (values[q]) m &= ~bit(values[q]);
    out[c] = m;
  }
  return out;
}

export function applyStep(ctx: Ctx, s: State, st: PuzzleStep): State {
  const values = s.values.slice();
  const cands = s.cands.slice();
  for (const e of st.eliminations) cands[e.cell] &= ~bit(e.digit);
  for (const p of st.placements) {
    values[p.cell] = p.digit;
    cands[p.cell] = 0;
    for (const q of ctx.peers[p.cell]) cands[q] &= ~bit(p.digit);
  }
  return { values, cands };
}

export function initialState(ctx: Ctx, values?: number[]): State {
  const v = values ? values.slice() : new Array<number>(ctx.n).fill(0);
  return { values: v, cands: legalCands(ctx, v) };
}

export interface Grade {
  solved: boolean;
  maxTier: number;
  steps: number;
  counts: Record<string, number>;
}

export function grade(p: KakuroLayout, maxTier = 4): Grade {
  const ctx = ctxOf(p);
  let s = initialState(ctx);
  const counts: Record<string, number> = {};
  let maxT = 0;
  let steps = 0;
  for (;;) {
    if (ctx.whiteCells.every((c) => s.values[c])) return { solved: true, maxTier: maxT, steps, counts };
    const st = findStep(ctx, s, maxTier);
    if (!st) return { solved: false, maxTier: maxT, steps, counts };
    counts[st.technique] = (counts[st.technique] ?? 0) + 1;
    maxT = Math.max(maxT, TECHNIQUE_BY_ID[st.technique].tier);
    steps++;
    s = applyStep(ctx, s, st);
  }
}

/**
 * If the rest of the puzzle can be completed using only naked singles on the
 * legal candidates (which includes the last cell of a run), return the
 * placements in order; otherwise null. Assumes placed values are correct.
 */
export function singlesFinish(p: KakuroPuzzle, values: number[]): CellDigit[] | null {
  const ctx = ctxOf(p);
  const v = values.slice();
  const out: CellDigit[] = [];
  for (;;) {
    const empties = ctx.whiteCells.filter((c) => !v[c]);
    if (!empties.length) return out;
    const legal = legalCands(ctx, v);
    let progress = false;
    for (const c of empties) {
      if (popcount(legal[c]) !== 1) continue;
      const d = 31 - Math.clz32(legal[c]);
      v[c] = d;
      out.push({ cell: c, digit: d });
      progress = true;
      break;
    }
    if (!progress) return null;
  }
}

export function rulesFor(p: KakuroPuzzle): DigitRules {
  const ctx = ctxOf(p);
  return {
    cellCount: ctx.n,
    maxDigit: 9,
    playable: p.white.slice(),
    peers: ctx.peers.map((x) => x.slice()),
    legalCandidates: (values: number[]) => {
      // Digits already used in a run are excluded too (combos avoid placed digits).
      return legalCands(ctx, values);
    },
    basicCandidates: (values: number[]) => basicCands(ctx, values),
  };
}

export function clues(p: KakuroPuzzle): Map<number, { across?: number; down?: number }> {
  const m = new Map<number, { across?: number; down?: number }>();
  for (const r of p.runs) {
    const e = m.get(r.clueCell) ?? {};
    e[r.dir] = r.sum;
    m.set(r.clueCell, e);
  }
  return m;
}

/**
 * Hint from the player's own pencil marks (mirrors the classic-sudoku hint).
 * @param removedCorrect cells where the player explicitly removed the correct
 *   candidate and it is still missing.
 * @param runMath cells without marks start from the candidates the run sums
 *   allow; false: from every digit not yet in their runs.
 */
export function findHint(p: KakuroPuzzle, values: number[], pencil: number[], removedCorrect: number[] = [], runMath = true): PuzzleHint {
  const ctx = ctxOf(p);
  const sol = p.solution;
  if (ctx.whiteCells.every((c) => values[c] === sol[c])) return { kind: 'solved', message: 'The puzzle is solved!' };

  const wrong = ctx.whiteCells.filter((c) => values[c] && values[c] !== sol[c]);
  if (wrong.length) {
    return {
      kind: 'wrongValue',
      cells: wrong,
      message:
        wrong.length === 1
          ? `${cellName(ctx, wrong[0])} contains the wrong digit. Fix that first — logic built on it will go astray.`
          : `${wrong.length} placed digits are wrong (${cellListText(ctx, wrong)}). Fix those first.`,
    };
  }

  // Cells without marks hold every candidate: with run sums, those the sums allow.
  const legal = runMath ? legalCands(ctx, values) : basicCands(ctx, values);
  const cands = new Array<number>(ctx.n).fill(0);
  for (const c of ctx.whiteCells) if (!values[c]) cands[c] = pencil[c] ? pencil[c] & 0x3fe : legal[c];
  const missing = ctx.whiteCells.filter((c) => !values[c] && !(cands[c] & bit(sol[c])));
  // checked against the marks themselves: an emptied cell still lacks the digit
  const removed = removedCorrect.filter((c) => !values[c] && !(pencil[c] & bit(sol[c])));
  if (removed.length) {
    return {
      kind: 'missingCandidate',
      cells: removed,
      message:
        `You removed the correct digit from the pencil marks in ${cellListText(ctx, removed)}. ` +
        `Rewind to the first mistake, or re-check the candidates in ${removed.length === 1 ? 'that cell' : 'those cells'}.`,
    };
  }
  for (const c of missing) cands[c] = legal[c];

  // Clean-up: pencil marks clashing with a digit placed in the same run.
  const conflicts: CellDigit[] = [];
  const examples: string[] = [];
  for (const c of ctx.whiteCells) {
    if (values[c] || !pencil[c]) continue;
    for (const q of ctx.peers[c]) {
      const d = values[q];
      if (d && cands[c] & bit(d) && !conflicts.some((x) => x.cell === c && x.digit === d)) {
        conflicts.push({ cell: c, digit: d });
        if (examples.length < 3) examples.push(`${d} from ${cellName(ctx, c)} (${cellName(ctx, q)} is ${d})`);
      }
    }
  }
  if (conflicts.length) {
    return {
      kind: 'step',
      step: makeStep('cleanup', {
        eliminations: conflicts,
        pattern: [...new Set(conflicts.map((x) => x.cell))],
        explanation:
          `Some pencil marks clash with digits already placed in the same run. ` +
          `Remove ${examples.join('; ')}${conflicts.length > examples.length ? ` and ${conflicts.length - examples.length} more` : ''}.`,
      }),
      cands,
    };
  }

  const st = findStep(ctx, { values, cands });
  if (st) return { kind: 'step', step: st, cands };

  const cell = ctx.whiteCells.find((c) => !values[c])!;
  return {
    kind: 'reveal',
    cell,
    digit: sol[cell],
    message: `No logical step found with the techniques I know. ${cellName(ctx, cell)} is ${sol[cell]}.`,
  };
}
