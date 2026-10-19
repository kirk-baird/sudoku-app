// Shared types for every puzzle engine (sudoku variants, Calcudoku, Kakuro,
// Tents, Pips). Engines are pure TypeScript: no React, no storage.
//
// Candidate sets are bitmasks: digit d (1..16) is bit (1 << d).

export type Difficulty = 'medium' | 'hard' | 'extraHard' | 'extreme';

export interface CellDigit {
  cell: number;
  digit: number;
}

/** A highlighted "reason" candidate. color 0 = primary (green), 1 = alternate (orange). */
export interface KeyCandidate extends CellDigit {
  color?: 0 | 1;
}

/** One logical deduction, explained. */
export interface PuzzleStep {
  technique: string; // stable id, e.g. 'nakedSingle', 'cageCombination'
  name: string; // display name, e.g. 'Naked Single'
  tier: number; // 0 basic, 1 medium, 2 hard, 3 extra hard, 4 extreme (shown as a chip)
  placements: CellDigit[]; // digits to place
  eliminations: CellDigit[]; // candidates to remove
  pattern: number[]; // cells forming the pattern (tinted yellow)
  keys: KeyCandidate[]; // candidates that justify the deduction
  unitCells: number[]; // cells of the rows/columns/cages/runs involved (tinted lightly)
  explanation: string; // plain-English explanation; refer to cells as R3C5 (1-based)
}

export type PuzzleHint =
  | { kind: 'wrongValue'; cells: number[]; message: string }
  | { kind: 'missingCandidate'; cells: number[]; message: string }
  | { kind: 'step'; step: PuzzleStep; cands?: number[] } // cands: candidate sets the step reasoned about
  | { kind: 'solved'; message: string }
  | { kind: 'reveal'; cell: number; digit: number; message: string };

/**
 * What the shared digit-entry game screen needs from a digit puzzle
 * (Calcudoku, Kakuro, and the sudoku variants).
 */
export interface DigitRules {
  cellCount: number;
  maxDigit: number; // digits run 1..maxDigit
  playable: boolean[]; // false for clue/black cells
  peers: number[][]; // cells that may not share a digit with this one (used for highlighting and auto-removing candidates)
  /** Candidates allowed by the placed digits and the puzzle's constraints (bitmask per cell; 0 if filled or not playable). */
  legalCandidates(values: number[]): number[];
  /**
   * Calcudoku and Kakuro: candidates allowed by the placed peers alone,
   * without the cage or run arithmetic. Auto candidates use these unless the
   * player turns that arithmetic on.
   */
  basicCandidates?(values: number[]): number[];
}

export interface DifficultyInfo {
  label: string; // 'Medium'
  description: string; // one short line, e.g. '6×6 grid, all four operations'
}

export const DIFFICULTY_ORDER: Difficulty[] = ['medium', 'hard', 'extraHard', 'extreme'];

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  medium: 'Medium',
  hard: 'Hard',
  extraHard: 'Extra Hard',
  extreme: 'Extreme',
};

export const bit = (d: number) => 1 << d;
export const hasBit = (m: number, d: number) => (m & (1 << d)) !== 0;

export function popcount(m: number): number {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

export function digitsOf(m: number, max = 16): number[] {
  const out: number[] = [];
  for (let d = 1; d <= max; d++) if (m & (1 << d)) out.push(d);
  return out;
}

/** 'R3C5' style name for a cell in a grid with `cols` columns. */
export const rcName = (cell: number, cols: number) => `R${Math.floor(cell / cols) + 1}C${(cell % cols) + 1}`;
