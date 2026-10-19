// Pure game-state logic: placing digits, pencil marks, undo, rewind-to-first-
// mistake, applying hints. No React here so it can be unit tested.

import { CellDigit, DigitRules } from '../engine/common';
import { Cands, Grid, bit, has } from '../engine/grid';
import { Difficulty } from '../engine/logic';
import { legalCandidates } from '../engine/sudoku/core';
import { CLASSIC } from '../engine/sudoku/geometry';
import type { GameType } from '../games/types';

/** The parts of a hint step the reducer needs (works for every engine). */
export interface AppliedStep {
  placements: CellDigit[];
  eliminations: CellDigit[];
}

export interface Snapshot {
  values: Grid;
  pencil: Cands;
}

/** A mistake introduced by an action. For 'candidate', digit is the (removed) correct digit. */
export interface Mistake {
  kind: 'value' | 'candidate';
  cell: number;
  digit: number;
}

export interface HistoryEntry {
  before: Snapshot;
  mistakes: Mistake[];
}

export interface GameState {
  id: string;
  /** Missing on games saved before game types existed: treat as classic. */
  type?: GameType;
  /** Type-specific puzzle data (cages, runs, regions…). */
  payload?: unknown;
  savedAt?: number;
  difficulty: Difficulty;
  givens: Grid;
  solution: Grid;
  values: Grid;
  pencil: Cands;
  history: HistoryEntry[];
  mistakes: number; // wrong digits placed + correct candidates removed (counter)
  hintsUsed: number;
  elapsedMs: number;
  completed: boolean;
}

export type GameAction =
  | { type: 'input'; cell: number; digit: number; pencil: boolean }
  | { type: 'erase'; cell: number; autoCandidates: boolean }
  | { type: 'undo' }
  | { type: 'rewind' }
  | { type: 'applyStep'; step: AppliedStep; cands?: Cands } // cands: what the hint reasoned about
  | { type: 'autoPlace'; placement: CellDigit }
  | { type: 'fillCandidates' }
  | { type: 'hintShown' }
  | { type: 'setElapsed'; ms: number }
  | { type: 'load'; state: GameState };

/** Classic rules, used when no rules are supplied (and by the classic tests). */
export const CLASSIC_RULES: DigitRules = {
  cellCount: 81,
  maxDigit: 9,
  playable: new Array(81).fill(true),
  peers: CLASSIC.peers,
  legalCandidates: (values) => legalCandidates(CLASSIC, values),
};

/**
 * The rules auto candidates follow: without the arithmetic, a puzzle that
 * offers basic candidates (Calcudoku, Kakuro) only rules out digits already
 * placed in the same row, column or run.
 */
export function candidateRules(rules: DigitRules, cageMath: boolean): DigitRules {
  return cageMath || !rules.basicCandidates ? rules : { ...rules, legalCandidates: rules.basicCandidates };
}

export function newGame(
  id: string,
  difficulty: Difficulty,
  givens: Grid,
  solution: Grid,
  autoCandidates: boolean,
  extra: { type?: GameType; payload?: unknown; rules?: DigitRules } = {},
): GameState {
  const rules = extra.rules ?? CLASSIC_RULES;
  const values = givens.slice();
  return {
    id,
    type: extra.type ?? 'classic',
    payload: extra.payload,
    difficulty,
    givens: givens.slice(),
    solution: solution.slice(),
    values,
    pencil: autoCandidates ? rules.legalCandidates(values) : new Array(givens.length).fill(0),
    history: [],
    mistakes: 0,
    hintsUsed: 0,
    elapsedMs: 0,
    completed: false,
  };
}

const snap = (s: GameState): Snapshot => ({ values: s.values.slice(), pencil: s.pencil.slice() });

const isSolved = (values: Grid, solution: Grid) => values.every((v, i) => v === solution[i]);

/** Place digit (no toggle). Mutates values/pencil; returns mistakes introduced. */
function placeInto(rules: DigitRules, values: Grid, pencil: Cands, solution: Grid, cell: number, digit: number): Mistake[] {
  values[cell] = digit;
  pencil[cell] = 0;
  const b = bit(digit);
  for (const p of rules.peers[cell]) pencil[p] &= ~b;
  return digit !== solution[cell] ? [{ kind: 'value', cell, digit }] : [];
}

/**
 * A placed digit is leaving `cell` (overwritten or cleared): give it back to
 * the peers that lost it when it was placed, where it is still legal.
 * Otherwise fixing a wrong digit leaves it wrongly removed from its peers.
 */
function restoreToPeers(rules: DigitRules, s: GameState, values: Grid, pencil: Cands, cell: number, old: number) {
  // the latest action that put `old` into the cell
  let k = s.history.length - 1;
  while (k >= 0 && s.history[k].before.values[cell] === old) k--;
  if (k < 0) return;
  const had = s.history[k].before.pencil;
  const legal = rules.legalCandidates(values);
  for (const p of rules.peers[cell]) if (!values[p] && has(had[p], old) && has(legal[p], old)) pencil[p] |= bit(old);
}

function commit(s: GameState, before: Snapshot, values: Grid, pencil: Cands, mistakes: Mistake[], extra: Partial<GameState> = {}): GameState {
  return {
    ...s,
    values,
    pencil,
    history: [...s.history, { before, mistakes }],
    // wrong digits and wrongly removed candidates both count as mistakes
    mistakes: s.mistakes + mistakes.length,
    completed: isSolved(values, s.solution),
    ...extra,
  };
}

/** Is this recorded mistake still affecting the current board? */
function stillPresent(s: GameState, m: Mistake): boolean {
  if (m.kind === 'value') return s.values[m.cell] === m.digit;
  // Still missing from an unsolved cell, even if the cell now has no marks at
  // all: removing the other candidates afterwards doesn't fix it. Adding the
  // digit back or placing a digit in the cell does.
  return s.values[m.cell] === 0 && !has(s.pencil[m.cell], m.digit);
}

/** Index of the earliest history entry whose mistake is still on the board, or -1. */
export function firstMistakeIndex(s: GameState): number {
  return s.history.findIndex((h) => h.mistakes.some((m) => stillPresent(s, m)));
}

/** Cells where the player removed the correct candidate and it is still missing. */
export function removedCorrectCells(s: GameState): number[] {
  const out = new Set<number>();
  for (const h of s.history) for (const m of h.mistakes) if (m.kind === 'candidate' && stillPresent(s, m)) out.add(m.cell);
  return [...out];
}

export const wrongCells = (s: GameState) =>
  s.values.map((v, i) => (v && !s.givens[i] && v !== s.solution[i] ? i : -1)).filter((i) => i >= 0);

/** A reducer bound to one puzzle's rules (peers, legal candidates). */
export function makeGameReducer(rules: DigitRules) {
  return (s: GameState, a: GameAction): GameState => reduce(rules, s, a);
}

export const gameReducer = makeGameReducer(CLASSIC_RULES);

function reduce(rules: DigitRules, s: GameState, a: GameAction): GameState {
  if (a.type === 'load') return a.state;
  if (a.type === 'setElapsed') return { ...s, elapsedMs: a.ms };
  if (a.type === 'hintShown') return { ...s, hintsUsed: s.hintsUsed + 1 };
  if (s.completed) return s; // a finished game is final

  switch (a.type) {
    case 'input': {
      const { cell, digit } = a;
      if (s.givens[cell] || !rules.playable[cell]) return s;
      const before = snap(s);
      const values = s.values.slice();
      const pencil = s.pencil.slice();
      if (a.pencil) {
        if (values[cell]) return s;
        const had = has(pencil[cell], digit);
        pencil[cell] ^= bit(digit);
        const mistakes: Mistake[] =
          had && digit === s.solution[cell] ? [{ kind: 'candidate', cell, digit }] : [];
        return commit(s, before, values, pencil, mistakes);
      }
      const old = values[cell];
      if (old === digit) {
        // tapping the same digit again clears it
        values[cell] = 0;
        restoreToPeers(rules, s, values, pencil, cell, old);
        return commit(s, before, values, pencil, []);
      }
      const mistakes = placeInto(rules, values, pencil, s.solution, cell, digit);
      if (old) restoreToPeers(rules, s, values, pencil, cell, old);
      return commit(s, before, values, pencil, mistakes);
    }

    case 'erase': {
      const { cell } = a;
      if (s.givens[cell] || !rules.playable[cell]) return s;
      if (!s.values[cell] && !s.pencil[cell]) return s;
      const before = snap(s);
      const values = s.values.slice();
      const pencil = s.pencil.slice();
      const old = values[cell];
      if (old) {
        values[cell] = 0;
        restoreToPeers(rules, s, values, pencil, cell, old);
        if (a.autoCandidates) {
          const legal = rules.legalCandidates(values);
          pencil[cell] = legal[cell];
          // give the erased digit back to peers that can hold it again
          for (const p of rules.peers[cell]) if (!values[p] && has(legal[p], old)) pencil[p] |= bit(old);
        }
      } else {
        pencil[cell] = 0;
      }
      return commit(s, before, values, pencil, []);
    }

    case 'undo': {
      const last = s.history[s.history.length - 1];
      if (!last) return s;
      return {
        ...s,
        values: last.before.values,
        pencil: last.before.pencil,
        history: s.history.slice(0, -1),
        completed: false,
      };
    }

    case 'rewind': {
      const idx = firstMistakeIndex(s);
      if (idx < 0) return s;
      const target = s.history[idx].before;
      return { ...s, values: target.values, pencil: target.pencil, history: s.history.slice(0, idx), completed: false };
    }

    case 'applyStep': {
      const before = snap(s);
      const values = s.values.slice();
      const eff = rules.legalCandidates(s.values);
      const pencil = s.pencil.slice();
      // Start from the candidates the hint reasoned about: a cell whose marks
      // were incomplete was treated as holding every legal candidate, so only
      // removing the digit from its own marks would change nothing and the
      // same hint would come back.
      const touched = new Set<number>();
      for (const e of a.step.eliminations) {
        if (values[e.cell]) continue;
        if (!touched.has(e.cell)) pencil[e.cell] = a.cands?.[e.cell] ?? (pencil[e.cell] || eff[e.cell]);
        touched.add(e.cell);
        pencil[e.cell] &= ~bit(e.digit);
      }
      const mistakes: Mistake[] = [];
      for (const p of a.step.placements) mistakes.push(...placeInto(rules, values, pencil, s.solution, p.cell, p.digit));
      return commit(s, before, values, pencil, mistakes);
    }

    case 'autoPlace': {
      const { cell, digit } = a.placement;
      if (s.values[cell]) return s;
      const before = snap(s);
      const values = s.values.slice();
      const pencil = s.pencil.slice();
      const mistakes = placeInto(rules, values, pencil, s.solution, cell, digit);
      return commit(s, before, values, pencil, mistakes);
    }

    case 'fillCandidates': {
      const before = snap(s);
      const legal = rules.legalCandidates(s.values);
      const pencil = s.pencil.map((m, i) => (s.values[i] ? 0 : m ? m & legal[i] : legal[i]));
      if (pencil.every((m, i) => m === s.pencil[i])) return s;
      return commit(s, before, s.values.slice(), pencil, []);
    }
  }
  return s;
}
