// Calcudoku engine entry point.

import {
  CellDigit,
  Difficulty,
  DifficultyInfo,
  DigitRules,
  PuzzleHint,
  PuzzleStep,
  hasBit,
  rcName,
} from '../common';
import { Rng } from '../rng';
import { CageOptions, DEFAULT_CAGE_OPTIONS, cagePuzzle, randomLatin } from './generator';
import { CalcCage, CalcudokuPuzzle, getCtx, latinCandidates, legalCandidates } from './model';
import { State, TECHNIQUES, TECHNIQUE_BY_ID, applyStep, findStep } from './techniques';

export type { CageOp, CalcCage, CalcudokuPuzzle } from './model';
export { cageLabel } from './model';
export { solve } from './solver';
export { TECHNIQUES } from './techniques';

// ---------- difficulty ----------

interface LevelSpec {
  size: number;
  minTier: number;
  maxTier: number;
  cage: CageOptions;
}

const GENTLE: CageOptions = DEFAULT_CAGE_OPTIONS;
const TOUGH: CageOptions = {
  ...DEFAULT_CAGE_OPTIONS,
  sizeWeights: [0, 1, 3, 6, 5],
  maxSingles: 2,
  pDiv: 0.4,
  pSub: 0.4,
  pMul: 0.3,
};
const BIG: CageOptions = {
  ...DEFAULT_CAGE_OPTIONS,
  sizeWeights: [0, 1, 5, 6, 3],
  maxSingles: 1,
  pDiv: 0.5,
  pSub: 0.45,
  pMul: 0.4,
};

export const LEVELS: Record<Difficulty, LevelSpec> = {
  medium: { size: 5, minTier: 1, maxTier: 1, cage: { ...GENTLE, maxSingles: 3 } },
  hard: { size: 6, minTier: 2, maxTier: 2, cage: { ...TOUGH, maxSingles: 2 } },
  extraHard: { size: 7, minTier: 3, maxTier: 3, cage: { ...TOUGH, maxSingles: 2 } },
  extreme: { size: 8, minTier: 3, maxTier: 4, cage: { ...BIG, maxSingles: 1 } },
};

export const DIFFICULTY_INFO: Record<Difficulty, DifficultyInfo> = {
  medium: { label: 'Medium', description: '5×5 grid, gentle cage logic' },
  hard: { label: 'Hard', description: '6×6 grid, cage and line interactions' },
  extraHard: { label: 'Extra Hard', description: '7×7 grid, line sums and X-Wings' },
  extreme: { label: 'Extreme', description: '8×8 grid, few free cells' },
};

// ---------- solving ----------

const ctxOf = (p: CalcudokuPuzzle) => getCtx(p.size, p.cages);

export function rulesFor(p: CalcudokuPuzzle): DigitRules {
  const ctx = ctxOf(p);
  const N2 = p.size * p.size;
  return {
    cellCount: N2,
    maxDigit: p.size,
    playable: new Array<boolean>(N2).fill(true),
    peers: ctx.peers,
    legalCandidates: (values: number[]) => legalCandidates(ctx, values),
    basicCandidates: (values: number[]) => latinCandidates(ctx, values),
  };
}

export interface CalcGrade {
  solved: boolean;
  maxTier: number;
  steps: number;
  counts: Record<string, number>;
}

/** Human-style logical solve using the techniques easiest-first. */
export function grade(p: CalcudokuPuzzle, maxTier = 4): CalcGrade {
  const ctx = ctxOf(p);
  const values = new Array<number>(p.size * p.size).fill(0);
  let s: State = { values, cands: legalCandidates(ctx, values) };
  const counts: Record<string, number> = {};
  let maxT = 0;
  let steps = 0;
  for (;;) {
    if (s.values.every((v) => v !== 0)) return { solved: true, maxTier: maxT, steps, counts };
    const st = findStep(ctx, s, maxTier);
    if (!st) return { solved: false, maxTier: maxT, steps, counts };
    counts[st.technique] = (counts[st.technique] ?? 0) + 1;
    maxT = Math.max(maxT, st.tier);
    steps++;
    s = applyStep(ctx, s, st);
  }
}

/**
 * If the rest can be completed with singles only (naked single on legal
 * candidates, hidden single in a row/column, single-cell or last-cell cage),
 * return the placements in order; else null. Assumes placed values are correct.
 */
export function singlesFinish(p: CalcudokuPuzzle, values: number[]): CellDigit[] | null {
  const ctx = ctxOf(p);
  const v = values.slice();
  const out: CellDigit[] = [];
  for (;;) {
    if (v.every((x) => x !== 0)) return out;
    const s: State = { values: v, cands: legalCandidates(ctx, v) };
    const st = findStep(ctx, s, 0);
    if (!st || !st.placements.length) return null;
    for (const pl of st.placements) {
      v[pl.cell] = pl.digit;
      out.push(pl);
    }
  }
}

// ---------- hints ----------

const cellListOf = (cells: number[], n: number) => cells.map((c) => rcName(c, n)).join(', ');

/**
 * Hint from the player's pencil marks. Cells without marks (or with marks
 * missing the answer) are treated as holding every candidate: with
 * `cageMath`, those the cage arithmetic allows, else every digit not yet in
 * the row or column (so the hint can teach the cage logic).
 */
export function findHint(p: CalcudokuPuzzle, values: number[], pencil: number[], removedCorrect: number[] = [], cageMath = true): PuzzleHint {
  const { size: n, solution } = p;
  const ctx = ctxOf(p);
  if (values.every((v, i) => v === solution[i])) return { kind: 'solved', message: 'The puzzle is solved!' };

  const wrong = values.map((v, i) => (v && v !== solution[i] ? i : -1)).filter((i) => i >= 0);
  if (wrong.length) {
    return {
      kind: 'wrongValue',
      cells: wrong,
      message:
        wrong.length === 1
          ? `${rcName(wrong[0], n)} contains the wrong digit. Fix that first — logic built on it will go astray.`
          : `${wrong.length} placed digits are wrong (${cellListOf(wrong, n)}). Fix those first.`,
    };
  }

  const legal = cageMath ? legalCandidates(ctx, values) : latinCandidates(ctx, values);
  const cands = values.map((v, i) => (v ? 0 : pencil[i] ? pencil[i] : legal[i]));
  const missing = cands.map((m, i) => (!values[i] && !hasBit(m, solution[i]) ? i : -1)).filter((i) => i >= 0);
  // checked against the marks themselves: an emptied cell still lacks the digit
  const removed = removedCorrect.filter((i) => !values[i] && !hasBit(pencil[i], solution[i]));
  if (removed.length) {
    return {
      kind: 'missingCandidate',
      cells: removed,
      message:
        `You removed the correct digit from the pencil marks in ${cellListOf(removed, n)}. ` +
        `Rewind to the first mistake, or re-check the candidates in ${removed.length === 1 ? 'that cell' : 'those cells'}.`,
    };
  }
  for (const i of missing) cands[i] = legal[i];

  // Clean-up: pencil marks that a placed digit in the same row/column rules out.
  const conflicts: CellDigit[] = [];
  const examples: string[] = [];
  for (let i = 0; i < n * n; i++) {
    if (values[i] || !pencil[i] || missing.includes(i)) continue;
    for (const q of ctx.peers[i]) {
      const d = values[q];
      if (d && hasBit(cands[i], d) && !conflicts.some((c) => c.cell === i && c.digit === d)) {
        conflicts.push({ cell: i, digit: d });
        if (examples.length < 3) examples.push(`${d} from ${rcName(i, n)} (${rcName(q, n)} is ${d})`);
      }
    }
  }
  if (conflicts.length) {
    const step: PuzzleStep = {
      technique: 'cleanup',
      name: 'Candidate Clean-up',
      tier: 0,
      placements: [],
      eliminations: conflicts,
      pattern: [...new Set(conflicts.map((c) => c.cell))],
      keys: [],
      unitCells: [],
      explanation:
        `Some pencil marks clash with digits already placed in the same row or column. ` +
        `Remove ${examples.join('; ')}${conflicts.length > examples.length ? ` and ${conflicts.length - examples.length} more` : ''}.`,
    };
    return { kind: 'step', step, cands };
  }

  const st = findStep(ctx, { values, cands });
  if (st) return { kind: 'step', step: st, cands };

  const cell = values.findIndex((v) => v === 0);
  return {
    kind: 'reveal',
    cell,
    digit: solution[cell],
    message: `No logical step found with the techniques I know. ${rcName(cell, n)} is ${solution[cell]}.`,
  };
}

// ---------- generation ----------

/** Does a graded puzzle fit the level? */
export function fitsLevel(d: Difficulty, g: CalcGrade, singles: number): boolean {
  const L = LEVELS[d];
  return g.solved && g.maxTier >= L.minTier && g.maxTier <= L.maxTier && singles <= L.cage.maxSingles;
}

/**
 * Generate a unique puzzle of the given difficulty, solvable with the engine's
 * techniques. Each attempt is one random layout (bounded work); returns null if
 * none of `maxAttempts` attempts fit.
 */
export function generate(difficulty: Difficulty, rng: Rng, maxAttempts = 100): CalcudokuPuzzle | null {
  const L = LEVELS[difficulty];
  for (let a = 0; a < maxAttempts; a++) {
    const sol = randomLatin(L.size, rng);
    const p = cagePuzzle(L.size, sol, rng, L.cage);
    if (!p) continue;
    const singles = p.cages.filter((c: CalcCage) => c.op === '=').length;
    if (fitsLevel(difficulty, grade(p, L.maxTier), singles)) return p;
  }
  return null;
}

export const techniqueName = (id: string) => (id === 'cleanup' ? 'Candidate Clean-up' : (TECHNIQUE_BY_ID[id]?.name ?? id));
export const techniqueTier = (id: string) => TECHNIQUE_BY_ID[id]?.tier ?? 0;
export const ALL_TECHNIQUES = TECHNIQUES.map((t) => ({ id: t.id, name: t.name, tier: t.tier }));
