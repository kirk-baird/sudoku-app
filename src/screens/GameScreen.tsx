// Game screen for every digit puzzle: classic, jigsaw, windoku, 16×16,
// samurai, calcudoku and kakuro. Everything puzzle-specific (rules, layout,
// hints, auto-finish) comes from the game type's adapter.

import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Board, HintMarks, boardPixelSize } from '../components/Board';
import { NumberPad, ToolButton } from '../components/Controls';
import { Clock, CompletionDialog, GameHeader, RulesSheet, SafeModal } from '../components/GameChrome';
import { HintPanel } from '../components/HintPanel';
import { Difficulty, PuzzleHint } from '../engine/common';
import { GameState, candidateRules, firstMistakeIndex, makeGameReducer, removedCorrectCells, wrongCells } from '../game/gameState';
import { GAMES, SudokuPayload } from '../games/registry';
import { GameType } from '../games/types';
import { useSettings } from '../settings';
import { recordCompletion } from '../stats';
import { remove, saveJSON } from '../storage';
import { useTheme } from '../theme';
import { SettingsScreen } from './SettingsScreen';

interface Props {
  initial: GameState;
  onExit: () => void;
  onNewGame: (type: GameType, d: Difficulty) => void;
}

/** Games saved before game types existed carry no type or payload. */
export function resolveGame(g: GameState): GameState {
  if (g.type && g.payload) return g;
  const payload: SudokuPayload = { variant: 'classic', givens: g.givens, solution: g.solution };
  return { ...g, type: 'classic', payload };
}

const MIN_CELL = 30; // below this, offer zoom
const ZOOM_CELL = 40;

export function GameScreen({ initial, onExit, onNewGame }: Props) {
  const t = useTheme();
  const { settings } = useSettings();
  const { width, height } = useWindowDimensions();
  const type = initial.type ?? 'classic';
  const def = GAMES[type];
  const adapter = useMemo(() => def.adapter!(initial.payload), [def, initial.payload]);
  // Cage/run arithmetic only counts with auto candidates on: marks you make yourself are yours.
  const cageMath = settings.autoCandidates && settings.cageMath;
  const rules = useMemo(() => candidateRules(adapter.rules, cageMath), [adapter, cageMath]);
  const reducer = useMemo(() => makeGameReducer(rules), [rules]);
  const [game, dispatch] = useReducer(reducer, initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [lastDigit, setLastDigit] = useState(0);
  const [pencilMode, setPencilMode] = useState(false);
  const [hint, setHint] = useState<PuzzleHint | null>(null);
  const [paused, setPaused] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const [autoFilling, setAutoFilling] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [result, setResult] = useState<{ ms: number; isBest: boolean } | null>(null);
  const [clock] = useState(() => new Clock(initial.elapsedMs));
  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const buzz = useCallback(
    (kind: 'tap' | 'error' | 'success') => {
      if (!settings.haptics || Platform.OS === 'web') return;
      try {
        if (kind === 'tap') Haptics.selectionAsync();
        else Haptics.notificationAsync(kind === 'error' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success);
      } catch {
        // haptics unavailable
      }
    },
    [settings.haptics],
  );

  // ---- clock ----
  const running = !paused && !settingsOpen && !helpOpen && appActive && !game.completed;
  useEffect(() => {
    if (running) clock.start();
    else clock.stop();
  }, [running, clock]);

  // ---- persistence ----
  const save = useCallback(() => {
    const g = gameRef.current;
    if (g.completed) return;
    saveJSON(`game.${type}`, { ...g, elapsedMs: clock.ms, savedAt: Date.now() });
  }, [clock, type]);

  useEffect(() => {
    const id = setTimeout(save, 400);
    return () => clearTimeout(id);
  }, [game, save]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      setAppActive(st === 'active');
      if (st !== 'active') save();
    });
    return () => {
      sub.remove();
      save();
    };
  }, [save]);

  // ---- auto candidate mode (or cage arithmetic) switched on mid-game ----
  useEffect(() => {
    if (settings.autoCandidates) dispatch({ type: 'fillCandidates' });
  }, [settings.autoCandidates, cageMath]);

  // ---- completion ----
  const recorded = useRef(false);
  useEffect(() => {
    if (!game.completed || recorded.current) return;
    recorded.current = true;
    clock.stop();
    const ms = clock.ms;
    buzz('success');
    remove(`game.${type}`);
    recordCompletion(type, game.difficulty, ms, game.hintsUsed).then(({ isBest }) => setResult({ ms, isBest }));
  }, [game.completed, game.difficulty, game.hintsUsed, clock, buzz, type]);

  // ---- derived ----
  const wrong = useMemo(() => wrongCells(game), [game]);
  const candidateErrors = useMemo(() => (settings.errorDetection ? removedCorrectCells(game) : []), [game, settings.errorDetection]);
  const mistakeIdx = useMemo(() => firstMistakeIndex(game), [game]);
  const counts = useMemo(() => {
    const c = new Array(adapter.rules.maxDigit + 1).fill(0);
    game.values.forEach((v, i) => {
      if (v && v === game.solution[i]) c[v]++;
    });
    return c;
  }, [game.values, game.solution, adapter]);

  const finish = useMemo(() => {
    if (game.completed || wrong.length) return null;
    const f = adapter.finish(game.values);
    return f && f.length ? f : null;
  }, [game.values, game.completed, wrong.length, adapter]);

  const hintMarks: HintMarks | null = useMemo(() => {
    if (!hint) return null;
    switch (hint.kind) {
      case 'step':
        return { step: hint.step, effective: hint.cands };
      case 'wrongValue':
      case 'missingCandidate':
        return { cells: hint.cells };
      case 'reveal':
        return {
          step: {
            technique: 'reveal',
            name: 'Reveal',
            tier: 0,
            placements: [{ cell: hint.cell, digit: hint.digit }],
            eliminations: [],
            pattern: [hint.cell],
            keys: [],
            unitCells: [],
            explanation: hint.message,
          },
        };
      default:
        return null;
    }
  }, [hint]);

  // ---- input handlers ----
  const busy = paused || autoFilling || game.completed;

  const onPressCell = useCallback(
    (i: number) => {
      if (paused || autoFilling || !adapter.rules.playable[i]) return;
      setHint(null);
      const v = gameRef.current.values[i];
      if (i === selected) {
        // Tap the selected cell again to let go of it (an empty one also clears
        // the highlight); the number pad then highlights digits instead.
        if (!v) setLastDigit(0);
        setSelected(null);
        return;
      }
      if (v) setLastDigit(v);
      setSelected(i);
    },
    [paused, autoFilling, selected, adapter],
  );

  const input = (d: number, asPencil: boolean) => {
    if (busy) return;
    if (selected == null) {
      // No cell selected: the pad highlights a digit, placed or not.
      setHint(null);
      setLastDigit((x) => (x === d ? 0 : d));
      buzz('tap');
      return;
    }
    setHint(null);
    const g = gameRef.current;
    if (g.givens[selected] || !adapter.rules.playable[selected]) return;
    if (asPencil && g.values[selected]) return;
    dispatch({ type: 'input', cell: selected, digit: d, pencil: asPencil });
    if (!asPencil) setLastDigit(d);
    const wrongDigit = !asPencil && g.values[selected] !== d && d !== g.solution[selected];
    const removedCorrect = asPencil && d === g.solution[selected] && ((g.pencil[selected] >> d) & 1) === 1;
    if ((wrongDigit || removedCorrect) && settings.errorDetection) buzz('error');
    else buzz('tap');
  };

  const erase = () => {
    if (busy || selected == null) return;
    setHint(null);
    dispatch({ type: 'erase', cell: selected, autoCandidates: settings.autoCandidates });
    buzz('tap');
  };

  const undo = () => {
    if (busy) return;
    setHint(null);
    dispatch({ type: 'undo' });
    buzz('tap');
  };

  const rewind = () => {
    if (busy) return;
    setHint(null);
    dispatch({ type: 'rewind' });
    buzz('tap');
  };

  const showHint = () => {
    if (busy) return;
    const h = adapter.hint(game.values, game.pencil, removedCorrectCells(game), cageMath);
    setHint(h);
    setSelected(null);
    if (h.kind !== 'solved') dispatch({ type: 'hintShown' });
  };

  const applyHint = () => {
    if (!hint) return;
    if (hint.kind === 'step') dispatch({ type: 'applyStep', step: hint.step, cands: hint.cands });
    if (hint.kind === 'reveal') dispatch({ type: 'applyStep', step: { placements: [{ cell: hint.cell, digit: hint.digit }], eliminations: [] } });
    setHint(null);
    buzz('tap');
  };

  const autoFinish = () => {
    if (!finish || busy) return;
    setHint(null);
    setSelected(null);
    setAutoFilling(true);
    const queue = finish.slice();
    const delay = Math.max(15, Math.min(60, 3000 / queue.length));
    const id = setInterval(() => {
      const p = queue.shift();
      if (!p) {
        clearInterval(id);
        setAutoFilling(false);
        return;
      }
      dispatch({ type: 'autoPlace', placement: p });
    }, delay);
  };

  // ---- layout ----
  const { layout } = adapter;
  const availW = Math.min(width - 16, 640);
  const availH = height * 0.52;
  const fitCell = Math.floor(Math.min((availW - 1) / layout.gridCols - 1, (availH - 1) / layout.gridRows - 1));
  const canZoom = fitCell < MIN_CELL;
  const cellSize = canZoom && zoomed ? ZOOM_CELL : fitCell;
  const px = boardPixelSize(layout, cellSize);
  const highlightDigit = (selected != null && game.values[selected]) || lastDigit;

  const board = (
    <Board
      layout={layout}
      cellSize={cellSize}
      maxDigit={adapter.rules.maxDigit}
      givens={game.givens}
      values={game.values}
      pencil={game.pencil}
      solution={game.solution}
      playable={adapter.rules.playable}
      peers={adapter.rules.peers}
      selected={selected}
      highlightDigit={highlightDigit}
      errorDetection={settings.errorDetection}
      highlightCandidates={settings.highlightCandidates}
      candidateErrors={candidateErrors}
      hint={hintMarks}
      hidden={paused}
      theme={t}
      onPressCell={onPressCell}
    />
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top', 'bottom', 'left', 'right']}>
      <GameHeader
        def={def}
        difficulty={game.difficulty}
        mistakes={settings.errorDetection ? game.mistakes : null}
        hintsUsed={game.hintsUsed}
        clock={clock}
        paused={paused}
        onBack={onExit}
        onTogglePause={() => !game.completed && setPaused((p) => !p)}
        onHelp={() => setHelpOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        theme={t}
      />

      <View style={styles.boardWrap}>
        {canZoom && zoomed ? (
          <ScrollView style={{ maxHeight: height * 0.6, width: availW }} nestedScrollEnabled>
            <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{ width: px.width }}>
              {board}
            </ScrollView>
          </ScrollView>
        ) : (
          board
        )}
        {paused ? (
          <Pressable style={styles.pausedOverlay} onPress={() => setPaused(false)}>
            <MaterialCommunityIcons name="play-circle-outline" size={64} color={t.accent} />
            <Text style={[styles.pausedText, { color: t.text }]}>Paused — tap to resume</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.middle}>
        {hint ? (
          <HintPanel
            hint={hint}
            canRewind={mistakeIdx >= 0}
            onApply={applyHint}
            onRewind={rewind}
            onClose={() => setHint(null)}
            theme={t}
          />
        ) : finish && !autoFilling ? (
          <Pressable onPress={autoFinish} style={[styles.finish, { backgroundColor: t.accent }]} accessibilityRole="button">
            <MaterialCommunityIcons name="flash" size={20} color={t.accentText} />
            <Text style={[styles.finishText, { color: t.accentText }]}>Only singles left — Auto-finish</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.tools}>
        <ToolButton icon="undo-variant" label="Undo" onPress={undo} disabled={!game.history.length || busy} theme={t} />
        <ToolButton icon="backup-restore" label="Rewind" onPress={rewind} disabled={mistakeIdx < 0 || busy} theme={t} />
        <ToolButton icon="eraser" label="Erase" onPress={erase} disabled={busy} theme={t} />
        <ToolButton
          icon="pencil-outline"
          label="Pencil"
          onPress={() => setPencilMode((p) => !p)}
          active={pencilMode}
          badge={pencilMode ? 'ON' : 'OFF'}
          theme={t}
        />
        {canZoom ? (
          <ToolButton
            icon={zoomed ? 'magnify-minus-outline' : 'magnify-plus-outline'}
            label={zoomed ? 'Fit' : 'Zoom'}
            onPress={() => setZoomed((z) => !z)}
            theme={t}
          />
        ) : null}
        <ToolButton icon="lightbulb-on-outline" label="Hint" onPress={showHint} disabled={busy} theme={t} />
      </View>

      <View style={styles.padWrap}>
        <NumberPad
          maxDigit={adapter.rules.maxDigit}
          symbols={layout.symbols}
          counts={counts}
          totals={adapter.digitTotals}
          pencilMode={pencilMode}
          highlighted={selected == null ? highlightDigit : 0}
          onDigit={(d) => input(d, pencilMode)}
          onLongDigit={(d) => input(d, !pencilMode)}
          disabled={busy}
          theme={t}
        />
      </View>

      <SafeModal visible={settingsOpen} onRequestClose={() => setSettingsOpen(false)}>
        <SettingsScreen onBack={() => setSettingsOpen(false)} />
      </SafeModal>
      <RulesSheet visible={helpOpen} def={def} onClose={() => setHelpOpen(false)} theme={t} />

      <CompletionDialog
        visible={!!result}
        isBest={!!result?.isBest}
        difficulty={game.difficulty}
        ms={result?.ms ?? 0}
        mistakes={game.mistakes}
        hintsUsed={game.hintsUsed}
        onHome={onExit}
        onNewGame={() => onNewGame(type, game.difficulty)}
        theme={t}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  boardWrap: { alignItems: 'center', marginTop: 4 },
  pausedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8 },
  pausedText: { fontSize: 16, fontWeight: '600' },
  middle: { flex: 1, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 6, minHeight: 60 },
  finish: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 12 },
  finishText: { fontSize: 15, fontWeight: '700' },
  tools: { flexDirection: 'row', paddingHorizontal: 8 },
  padWrap: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 10 },
});
