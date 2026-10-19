// Every game type the app offers: names, rules text, difficulty lines, where
// puzzles come from (banks are require()d lazily so only the chosen game's bank
// is parsed), and (for digit puzzles) the adapters the shared board and
// game screen use.

import * as calc from '../engine/calcudoku';
import { CellDigit, DigitRules, Difficulty, PuzzleHint, PuzzleStep } from '../engine/common';
import { generateVariant } from '../engine/generator';
import { findHint as sudokuHint } from '../engine/hint';
import * as kakuro from '../engine/kakuro';
import { singlesFinish as sudokuFinish } from '../engine/logic';
import { Rng } from '../engine/rng';
import { solve } from '../engine/solver';
import { decodeValues, legalCandidates } from '../engine/sudoku/core';
import { Geometry, SudokuVariant, geometryFor } from '../engine/sudoku/geometry';
import { TECHNIQUE_BY_ID } from '../engine/techniques';
import * as pips from '../engine/pips';
import * as tents from '../engine/tents';
import { calcudokuSingles, kakuroSingles } from './finish';
import { GameType } from './types';

// ---------- board layout (rendering info for digit puzzles) ----------

export interface BoardLayout {
  gridRows: number;
  gridCols: number;
  pos: [number, number][]; // cell -> grid row/col
  regionOf?: number[]; // thick borders where neighbouring cells differ (-1 = none)
  shaded?: boolean[]; // windoku windows
  labels?: (string | undefined)[]; // calcudoku cage labels (top-left of a cage)
  clues?: Map<number, { across?: number; down?: number }>; // kakuro clue cells
  symbols: string; // digit -> glyph, index 0 unused
  candidateGrid: 3 | 4; // pencil marks drawn in a 3×3 or 4×4 grid
}

export interface DigitAdapter {
  rules: DigitRules;
  layout: BoardLayout;
  givens: number[];
  solution: number[];
  /** Expected count of each digit (index = digit) for the number pad, or null to hide counts. */
  digitTotals: number[] | null;
  /** cageMath (default on): auto candidates include the cage/run arithmetic (Calcudoku, Kakuro; see DigitRules.basicCandidates). */
  hint(values: number[], pencil: number[], removedCorrect: number[], cageMath?: boolean): PuzzleHint;
  finish(values: number[]): CellDigit[] | null;
}

// ---------- payloads ----------

export interface SudokuPayload {
  variant: SudokuVariant;
  givens: number[];
  solution: number[];
  regions?: number[];
}

type BankEntry = { p: string; s: string; r?: string };

// ---------- adapters ----------

const cap = (x: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);

/** Sentence-case hint text (samurai cell names start with a lowercase grid name). */
export function tidyHint(h: PuzzleHint): PuzzleHint {
  if (h.kind === 'step') return { ...h, step: { ...h.step, explanation: cap(h.step.explanation) } };
  return { ...h, message: cap(h.message) };
}

const SYMBOLS_9 = ' 123456789';
const SYMBOLS_16 = ' 123456789ABCDEFG';

function countDigits(solution: number[], n: number): number[] {
  const t = new Array(n + 1).fill(0);
  for (const v of solution) if (v) t[v]++;
  return t;
}

/** Normalise a sudoku-engine hint to the shared PuzzleHint shape. */
function normaliseSudokuHint(h: ReturnType<typeof sudokuHint>, g: Geometry): PuzzleHint {
  if (h.kind !== 'step') return h;
  const t = TECHNIQUE_BY_ID[h.step.technique];
  const unitCells = [...new Set(h.step.units.flatMap((u) => g.units[u]))];
  const step: PuzzleStep = {
    technique: h.step.technique,
    name: t.name,
    tier: t.tier,
    placements: h.step.placements,
    eliminations: h.step.eliminations,
    pattern: h.step.pattern,
    keys: h.step.keys,
    unitCells,
    explanation: h.step.explanation,
  };
  return { kind: 'step', step, cands: h.cands };
}

export function sudokuAdapter(p: SudokuPayload): DigitAdapter {
  const g = geometryFor(p.variant, p.regions);
  return {
    rules: {
      cellCount: g.cellCount,
      maxDigit: g.n,
      playable: new Array(g.cellCount).fill(true),
      peers: g.peers,
      legalCandidates: (values) => legalCandidates(g, values),
    },
    layout: {
      gridRows: g.gridRows,
      gridCols: g.gridCols,
      pos: g.pos,
      regionOf: g.regionOf,
      shaded: g.shaded.some(Boolean) ? g.shaded : undefined,
      symbols: g.n === 16 ? SYMBOLS_16 : SYMBOLS_9,
      candidateGrid: g.n === 16 ? 4 : 3,
    },
    givens: p.givens,
    solution: p.solution,
    digitTotals: countDigits(p.solution, g.n),
    hint: (values, pencil, removed) => tidyHint(normaliseSudokuHint(sudokuHint(values, pencil, p.solution, removed, g), g)),
    finish: (values) => sudokuFinish(values, g),
  };
}

export function calcudokuAdapter(p: calc.CalcudokuPuzzle): DigitAdapter {
  const n = p.size;
  const cageOf = new Array(n * n).fill(-1);
  const labels: (string | undefined)[] = new Array(n * n).fill(undefined);
  p.cages.forEach((c, k) => {
    c.cells.forEach((i) => (cageOf[i] = k));
    labels[Math.min(...c.cells)] = calc.cageLabel(c);
  });
  return {
    rules: calc.rulesFor(p),
    layout: {
      gridRows: n,
      gridCols: n,
      pos: Array.from({ length: n * n }, (_, i) => [Math.floor(i / n), i % n] as [number, number]),
      regionOf: cageOf,
      labels,
      symbols: SYMBOLS_9,
      candidateGrid: 3,
    },
    givens: new Array(n * n).fill(0),
    solution: p.solution,
    digitTotals: countDigits(p.solution, n),
    hint: (values, pencil, removed, cageMath) => tidyHint(calc.findHint(p, values, pencil, removed, cageMath)),
    finish: (values) => calcudokuSingles(p, values),
  };
}

export function kakuroAdapter(p: kakuro.KakuroPuzzle): DigitAdapter {
  return {
    rules: kakuro.rulesFor(p),
    layout: {
      gridRows: p.rows,
      gridCols: p.cols,
      pos: Array.from({ length: p.rows * p.cols }, (_, i) => [Math.floor(i / p.cols), i % p.cols] as [number, number]),
      clues: kakuro.clues(p),
      symbols: SYMBOLS_9,
      candidateGrid: 3,
    },
    givens: new Array(p.rows * p.cols).fill(0),
    solution: p.solution,
    digitTotals: null,
    hint: (values, pencil, removed, cageMath) => tidyHint(kakuro.findHint(p, values, pencil, removed, cageMath)),
    finish: (values) => kakuroSingles(p, values),
  };
}

// ---------- game definitions ----------

export type GameIcon =
  | { kind: 'icon'; name: 'grid' | 'puzzle-outline' | 'window-closed-variant' | 'hexadecimal' | 'calculator-variant-outline' | 'sigma' | 'tent' }
  | { kind: 'samurai' }
  | { kind: 'domino' };

export interface GameDef {
  type: GameType;
  name: string;
  short: string; // one line for the tile
  icon: GameIcon;
  kind: 'digits' | 'tents' | 'pips';
  rules: string[];
  tips: string[];
  levels: Record<Difficulty, string>; // one-line description per difficulty
  /** Bank of pre-generated puzzles (loaded lazily). */
  bank(): Record<Difficulty, unknown[]>;
  /** Turn a bank entry into a payload. */
  fromBank(entry: unknown): unknown;
  /** One on-device generation attempt; null if it missed the difficulty. */
  generate(d: Difficulty, rng: Rng): unknown | null;
  adapter?: (payload: unknown) => DigitAdapter;
}

const SUDOKU_LEVELS: Record<Difficulty, string> = {
  medium: 'Locked candidates and pairs',
  hard: 'Triples, X-Wings and XY-Wings',
  extraHard: 'Swordfish, W-Wings and colouring',
  extreme: 'Long chains of logic',
};

function variantBank(load: () => Record<Difficulty, BankEntry[]>) {
  return load;
}

function variantFromBank(variant: SudokuVariant) {
  return (e: unknown): SudokuPayload => {
    const b = e as BankEntry;
    return {
      variant,
      givens: decodeValues(b.p),
      solution: decodeValues(b.s),
      regions: b.r ? [...b.r].map(Number) : undefined,
    };
  };
}

function variantGenerate(variant: SudokuVariant) {
  return (d: Difficulty, rng: Rng): SudokuPayload | null => {
    const p = generateVariant(variant, d, rng);
    return p ? { variant, givens: p.puzzle, solution: p.solution, regions: p.regions } : null;
  };
}

const sudokuAdapterFn = (payload: unknown) => sudokuAdapter(payload as SudokuPayload);

export const GAMES: Record<GameType, GameDef> = {
  classic: {
    type: 'classic',
    name: 'Classic',
    short: 'The original 9×9',
    icon: { kind: 'icon', name: 'grid' },
    kind: 'digits',
    rules: [
      'Fill every empty cell with a digit from 1 to 9.',
      'Each row, each column and each of the nine 3×3 boxes must contain every digit exactly once.',
      'The starting digits (on the shaded cells) can’t be changed.',
    ],
    tips: [
      'Look for a digit that fits in only one place in a row, column or box.',
      'Turn on auto candidates in Settings to have every possibility pencilled in for you.',
    ],
    levels: SUDOKU_LEVELS,
    bank: () => {
      const b = require('../data/puzzleBank.json') as Record<Difficulty, string[]>;
      return b;
    },
    fromBank: (e) => {
      const givens = [...(e as string)].map(Number);
      return { variant: 'classic', givens, solution: solve(givens).solution! } satisfies SudokuPayload;
    },
    generate: variantGenerate('classic'),
    adapter: sudokuAdapterFn,
  },
  jigsaw: {
    type: 'jigsaw',
    name: 'Jigsaw',
    short: 'Irregular regions',
    icon: { kind: 'icon', name: 'puzzle-outline' },
    kind: 'digits',
    rules: [
      'Fill every empty cell with a digit from 1 to 9.',
      'Each row and each column must contain every digit exactly once.',
      'Instead of 3×3 boxes, the grid is split into nine irregular regions with bold outlines. Each region must also contain every digit exactly once.',
    ],
    tips: [
      'A region that pokes into a neighbouring row band leaves "leftover" cells: counting what the rows need versus what the regions supply can pin down digits.',
      'Pointing and box/line reduction work between a region and any row or column it overlaps.',
    ],
    levels: SUDOKU_LEVELS,
    bank: variantBank(() => require('../data/jigsawBank.json')),
    fromBank: variantFromBank('jigsaw'),
    generate: variantGenerate('jigsaw'),
    adapter: sudokuAdapterFn,
  },
  windoku: {
    type: 'windoku',
    name: 'Windoku',
    short: 'Four extra windows',
    icon: { kind: 'icon', name: 'window-closed-variant' },
    kind: 'digits',
    rules: [
      'Classic rules: each row, column and 3×3 box contains 1 to 9 exactly once.',
      'The four shaded 3×3 windows are extra regions: each window must also contain 1 to 9 exactly once.',
    ],
    tips: [
      'Each window overlaps four boxes, so a digit locked inside part of a window often clears it from a box (and the other way round).',
      'Hints treat a window just like a box.',
    ],
    levels: SUDOKU_LEVELS,
    bank: variantBank(() => require('../data/windokuBank.json')),
    fromBank: variantFromBank('windoku'),
    generate: variantGenerate('windoku'),
    adapter: sudokuAdapterFn,
  },
  sixteen: {
    type: 'sixteen',
    name: '16×16',
    short: 'Big grid, 1–9 and A–G',
    icon: { kind: 'icon', name: 'hexadecimal' },
    kind: 'digits',
    rules: [
      'Fill every empty cell with one of 16 symbols: the digits 1 to 9 and the letters A to G.',
      'Each row, each column and each 4×4 box must contain every symbol exactly once.',
    ],
    tips: [
      'Tap the magnifier to zoom in, then drag to move around the grid.',
      'With 16 symbols, scanning a box for the one symbol it is missing is often the fastest start.',
    ],
    levels: SUDOKU_LEVELS,
    bank: variantBank(() => require('../data/sixteenBank.json')),
    fromBank: variantFromBank('sixteen'),
    generate: variantGenerate('sixteen'),
    adapter: sudokuAdapterFn,
  },
  samurai: {
    type: 'samurai',
    name: 'Samurai',
    short: 'Five grids, overlapping',
    icon: { kind: 'samurai' },
    kind: 'digits',
    rules: [
      'Five classic 9×9 sudokus overlap: the centre grid shares one 3×3 corner box with each of the four outer grids.',
      'Every row, column and 3×3 box of each of the five grids must contain 1 to 9 exactly once.',
      'Digits in a shared box count for both grids they belong to.',
    ],
    tips: [
      'Start in the shared corner boxes: they get help from two grids at once.',
      'Tap the magnifier to zoom in, then drag to move around.',
    ],
    levels: SUDOKU_LEVELS,
    bank: variantBank(() => require('../data/samuraiBank.json')),
    fromBank: variantFromBank('samurai'),
    generate: variantGenerate('samurai'),
    adapter: sudokuAdapterFn,
  },
  calcudoku: {
    type: 'calcudoku',
    name: 'Calcudoku',
    short: 'Arithmetic cages',
    icon: { kind: 'icon', name: 'calculator-variant-outline' },
    kind: 'digits',
    rules: [
      'Fill an N×N grid with the digits 1 to N (5×5 uses 1–5, and so on).',
      'Each row and each column contains every digit exactly once. There are no boxes.',
      'Bold outlines mark cages. The label in a cage’s corner gives a target and an operation (+ − × ÷): the cage’s digits must make the target using that operation.',
      'For − and ÷ (always two cells), take the larger number minus, or divided by, the smaller.',
      'A cage of one cell just shows its digit.',
      'A digit may repeat inside a cage, as long as the repeats aren’t in the same row or column.',
    ],
    tips: [
      'List the combinations a cage allows: a two-cell 3÷ cage can only be 1 and 3, or 2 and 6.',
      'A whole row adds up to 1 + 2 + … + N, which can reveal a cage that sticks out of a row.',
    ],
    levels: calcLevels(),
    bank: () => require('../data/calcudokuBank.json'),
    fromBank: (e) => e,
    generate: (d, rng) => calc.generate(d, rng, 3),
    adapter: (payload) => calcudokuAdapter(payload as calc.CalcudokuPuzzle),
  },
  kakuro: {
    type: 'kakuro',
    name: 'Kakuro',
    short: 'Crossword of sums',
    icon: { kind: 'icon', name: 'sigma' },
    kind: 'digits',
    rules: [
      'Fill each white cell with a digit from 1 to 9.',
      'Each black clue cell gives the total of the white run beside it: the number above the diagonal is for the run going right, the number below it is for the run going down.',
      'A digit can’t repeat within a run.',
    ],
    tips: [
      'Some totals have only one combination: 3 in two cells is always 1 + 2, 17 in two cells is 8 + 9, and 6 in three cells is 1 + 2 + 3.',
      'Where an across run crosses a down run, the digit must suit both.',
    ],
    levels: kakuroLevels(),
    bank: () => require('../data/kakuroBank.json'),
    fromBank: (e) => e,
    generate: (d, rng) => kakuro.generate(d, rng, 3),
    adapter: (payload) => kakuroAdapter(payload as kakuro.KakuroPuzzle),
  },
  tents: {
    type: 'tents',
    name: 'Tents',
    short: 'Pair every tree with a tent',
    icon: { kind: 'icon', name: 'tent' },
    kind: 'tents',
    rules: [
      'Every tree gets exactly one tent, in a cell directly above, below, left or right of it. Each tent belongs to exactly one tree.',
      'Tents never touch each other, not even diagonally.',
      'The numbers beside the rows and above the columns say how many tents are in that row or column.',
      'Tap a cell to cycle through tent, grass (meaning “no tent here”) and empty.',
    ],
    tips: [
      'Start with cells that aren’t next to any tree: they’re always grass.',
      'When a row already has all its tents, the rest of that row is grass.',
      'Every cell around a tent, including diagonals, is grass.',
    ],
    levels: tentsLevels(),
    bank: () => require('../data/tentsBank.json'),
    fromBank: (e) => e,
    generate: (d, rng) => tents.generate(d, rng, 3),
  },
  pips: {
    type: 'pips',
    name: 'Pips',
    short: 'Lay dominoes to fit the rules',
    icon: { kind: 'domino' },
    kind: 'pips',
    rules: [
      'Cover every cell of the board with the dominoes in the tray. Each domino is used exactly once and covers two neighbouring cells; turn it any way you like.',
      'Coloured regions have a rule on their label: a number means the pips in the region add up to it, < and > mean the total is less or more than the number, = means every half in the region shows the same number, and ≠ means they are all different.',
      'Grey cells have no rule. A domino can lie across two regions.',
      'Drag a domino from the tray onto the board, or tap it and then a cell. Tap a tray domino again to turn it before you lay it. Tap a placed domino to pick it up, then tap either half to turn it clockwise around that half; tap anywhere else to set it down. Drag a placed domino to move it, or off the board (or press and hold) to put it back in the tray. Clear puts every domino back.',
    ],
    tips: [
      'Start with the tightest rules: a two-cell region that adds up to 12 needs two 6s, and one that adds up to 0 needs two blanks.',
      'Count the halves: if only one domino has a 6, at most one cell can be 6 (two, if it is the 6|6).',
      'A corner cell with only one free neighbour must share a domino with it.',
      'Leave no odd-sized pocket of cells behind: dominoes can only fill an even number.',
    ],
    levels: pipsLevels(),
    bank: () => require('../data/pipsBank.json'),
    fromBank: (e) => e,
    generate: (d, rng) => pips.generate(d, rng, 3),
  },
};

function calcLevels(): Record<Difficulty, string> {
  return mapLevels(calc.DIFFICULTY_INFO);
}
function kakuroLevels(): Record<Difficulty, string> {
  return mapLevels(kakuro.DIFFICULTY_INFO);
}
function tentsLevels(): Record<Difficulty, string> {
  return mapLevels(tents.DIFFICULTY_INFO);
}
function pipsLevels(): Record<Difficulty, string> {
  return mapLevels(pips.DIFFICULTY_INFO);
}
function mapLevels(info: Record<Difficulty, { description: string }>): Record<Difficulty, string> {
  const d = info;
  return { medium: cap(d.medium.description), hard: cap(d.hard.description), extraHard: cap(d.extraHard.description), extreme: cap(d.extreme.description) };
}
