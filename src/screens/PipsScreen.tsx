import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Animated, AppState, Platform, Pressable, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ToolButton } from '../components/Controls';
import { Clock, CompletionDialog, GameHeader, RulesSheet, SafeModal } from '../components/GameChrome';
import { HintPanel } from '../components/HintPanel';
import { DRAG_SLOP, DominoTray, PipsBoard, PipsSpin, TrayDrag, TurnedDomino, pipsBoardSize, pipsGeometry } from '../components/PipsBoard';
import { Difficulty, PuzzleHint } from '../engine/common';
import { Spot, findHint, hintMove } from '../engine/pips';
import {
  PipsGameState,
  Turn,
  nextTurn,
  occupancy,
  pipsReducer,
  quarterTurns,
  spotTurn,
  tapSpot,
  turnSpot,
  turnedSpot,
} from '../game/pipsState';
import { GAMES } from '../games/registry';
import { GameType } from '../games/types';
import { useSettings } from '../settings';
import { recordCompletion } from '../stats';
import { remove, saveJSON } from '../storage';
import { useTheme } from '../theme';
import { SettingsScreen } from './SettingsScreen';

const MAX_CELL = 64;

// Web: no text selection. Dragging the mouse over a stray selection starts the
// browser's own drag-and-drop, which cancels ours.
const NO_SELECT = Platform.OS === 'web' ? ({ userSelect: 'none' } as ViewStyle) : null;

/** A domino under the finger: how it lies, where it came from, and where the finger holds it. */
interface Lift {
  k: number;
  o: Turn;
  from: 'tray' | 'board';
  gx: number; // finger offset from the top-left of its first cell
  gy: number;
}

export function PipsScreen({
  initial,
  onExit,
  onNewGame,
}: {
  initial: PipsGameState;
  onExit: () => void;
  onNewGame: (type: GameType, d: Difficulty) => void;
}) {
  const t = useTheme();
  const { settings } = useSettings();
  const { width, height } = useWindowDimensions();
  const def = GAMES.pips;
  const [game, dispatch] = useReducer(pipsReducer, initial);
  const [held, setHeld] = useState<number | null>(null); // tray domino picked up
  const [turns, setTurns] = useState<Turn[]>(() => initial.payload.dominoes.map(() => 0 as Turn)); // how each tray domino lies
  const [lift, setLift] = useState<Lift | null>(null); // domino being dragged
  const [target, setTarget] = useState<Spot | null>(null); // where it would land
  const longPressed = useRef<{ k: number; spot: Spot } | null>(null); // taken off the board by a long press during this touch
  const [raised, setRaised] = useState<number | null>(null); // board domino picked up: tap to turn it, drag to move it
  const [spin, setSpin] = useState<PipsSpin | null>(null); // its last turn, animated
  const [traySpin, setTraySpin] = useState<{ k: number; id: number } | null>(null); // the last tray domino turned
  const spins = useRef(0);
  const [hint, setHint] = useState<PuzzleHint | null>(null);
  const [paused, setPaused] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [result, setResult] = useState<{ ms: number; isBest: boolean } | null>(null);
  const [clock] = useState(() => new Clock(initial.elapsedMs));
  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  const p = game.payload;

  const buzz = useCallback(
    (kind: 'tap' | 'success' | 'error') => {
      if (!settings.haptics || Platform.OS === 'web') return;
      try {
        if (kind === 'tap') Haptics.selectionAsync();
        else if (kind === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // haptics unavailable
      }
    },
    [settings.haptics],
  );

  const running = !paused && !settingsOpen && !helpOpen && appActive && !game.completed;
  useEffect(() => {
    if (running) clock.start();
    else clock.stop();
  }, [running, clock]);

  const save = useCallback(() => {
    const g = gameRef.current;
    if (g.completed) return;
    saveJSON('game.pips', { ...g, elapsedMs: clock.ms, savedAt: Date.now() });
  }, [clock]);

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

  const recorded = useRef(false);
  useEffect(() => {
    if (!game.completed || recorded.current) return;
    recorded.current = true;
    clock.stop();
    const ms = clock.ms;
    buzz('success');
    remove('game.pips');
    recordCompletion('pips', game.difficulty, ms, game.hintsUsed).then(({ isBest }) => setResult({ ms, isBest }));
  }, [game.completed, game.difficulty, game.hintsUsed, clock, buzz]);

  const busy = paused || game.completed;
  // Bumped back to the tray by another domino: no longer raised.
  const raisedOn = raised !== null && game.place[raised] ? raised : null;

  const onPressCell = useCallback(
    (cell: number) => {
      if (busy) return;
      setHint(null);
      const g = gameRef.current;
      if (held !== null) {
        const spot = tapSpot(g, held, cell, turns[held]);
        if (!spot) return;
        dispatch({ type: 'put', k: held, spot });
        setHeld(null);
        setRaised(null);
        buzz('tap');
        return;
      }
      const k = occupancy(g.place).get(cell);
      if (k === undefined) {
        setRaised(null); // an empty cell puts the raised domino down
        return;
      }
      // The first tap picks a placed domino up; tapping it again turns it.
      if (raised !== k) {
        setRaised(k);
        setSpin(null);
        buzz('tap');
        return;
      }
      const cur = g.place[k]!;
      const spot = turnSpot(g, k, cell); // around the half that was tapped
      if (spot) {
        dispatch({ type: 'put', k, spot });
        setSpin({ k, pivot: cell, deg: 90 * quarterTurns(g.payload, cell, cur, spot), id: ++spins.current });
      }
      buzz('tap');
    },
    [busy, held, raised, turns, buzz],
  );

  /** A tap on empty space puts down whatever is picked up. */
  const putDown = () => {
    setHeld(null);
    setRaised(null);
  };

  const onLongPressCell = useCallback(
    (cell: number) => {
      if (busy) return;
      const g = gameRef.current;
      const k = occupancy(g.place).get(cell);
      if (k === undefined) return;
      const spot = g.place[k]!;
      // Still under the finger: moving it now drags it on from where it was.
      longPressed.current = { k, spot };
      setTurns((ts) => withTurn(ts, k, spotTurn(g.payload, spot)));
      setHint(null);
      dispatch({ type: 'put', k, spot: null });
      setRaised(null);
      buzz('tap');
    },
    [busy, buzz],
  );

  // The first tap picks a domino up; tapping it again turns it a quarter turn.
  const onPressTray = (k: number) => {
    if (busy) return;
    setHint(null);
    setRaised(null);
    if (held === k) {
      setTurns((ts) => withTurn(ts, k, nextTurn(ts[k])));
      setTraySpin({ k, id: ++spins.current });
    } else setHeld(k);
    buzz('tap');
  };

  const showHint = () => {
    if (busy) return;
    setHeld(null);
    setRaised(null);
    const h = findHint(p, game.place);
    setHint(h);
    if (h.kind !== 'solved') dispatch({ type: 'hintShown' });
  };

  const applyHint = () => {
    if (hint?.kind === 'step') {
      const mv = hintMove(p, hint.step);
      if (mv) dispatch({ type: 'put', k: mv.k, spot: mv.spot });
    }
    setHint(null);
  };

  // Board: as big as fits in the width and about half the height.
  const availW = Math.min(width - 24, 560);
  const availH = height * 0.46;
  let cellSize = Math.min(MAX_CELL, Math.floor(Math.min(availW / (p.cols + 0.35), availH / (p.rows + 0.35))));
  while (cellSize > 20 && pipsBoardSize(p, cellSize).width > availW) cellSize--;
  // Tray: two or three rows of square slots (room to turn a domino) across the width.
  const trayRows = p.dominoes.length > 9 ? 3 : 2;
  const perRow = Math.ceil(p.dominoes.length / trayRows);
  const trayHalf = Math.max(16, Math.min(30, Math.floor((availW - 8) / (perRow * 2.4)), Math.floor((height * 0.25) / (trayRows * 2.15))));

  // ---------- dragging ----------
  // Finger positions are window coordinates; the board and the screen are
  // measured in the window so they can be compared.
  const geom = pipsGeometry(cellSize);
  const [pan] = useState(() => new Animated.ValueXY());
  const rootRef = useRef<View>(null);
  const boardRef = useRef<View>(null);
  const rootAt = useRef({ x: 0, y: 0 });
  const boardAt = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const liftRef = useRef<Lift | null>(null);
  const targetRef = useRef<Spot | null>(null);
  const touchStart = useRef({ x: 0, y: 0 });
  const measure = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => (rootAt.current = { x, y }));
    boardRef.current?.measureInWindow((x, y, w, h) => (boardAt.current = { x, y, w, h }));
  }, []);

  /** Where the lifted domino lands if let go with the finger at (x, y): its first cell is the one nearest its top-left corner. */
  const landing = (l: Lift, x: number, y: number): Spot | null => {
    const col = Math.round((x - l.gx - boardAt.current.x) / geom.pitch);
    const row = Math.round((y - l.gy - boardAt.current.y) / geom.pitch);
    if (row < 0 || col < 0 || row >= p.rows || col >= p.cols) return null;
    return turnedSpot(p, row * p.cols + col, l.o);
  };
  const offBoard = (x: number, y: number) => {
    const b = boardAt.current;
    const m = geom.pitch * 0.5;
    return x < b.x - m || y < b.y - m || x > b.x + b.w + m || y > b.y + b.h + m;
  };
  const follow = (x: number, y: number) => {
    const l = liftRef.current;
    if (!l) return;
    pan.setValue({ x: x - l.gx - rootAt.current.x, y: y - l.gy - rootAt.current.y });
    const spot = landing(l, x, y);
    if (spot?.join() !== targetRef.current?.join()) {
      targetRef.current = spot;
      setTarget(spot);
    }
  };
  const begin = (l: Lift, x: number, y: number) => {
    liftRef.current = l;
    setLift(l);
    setHeld(null);
    setHint(null);
    setRaised(null);
    measure();
    follow(x, y);
    buzz('tap');
  };
  const end = (drop: { x: number; y: number } | null) => {
    const l = liftRef.current;
    liftRef.current = null;
    targetRef.current = null;
    longPressed.current = null;
    setLift(null);
    setTarget(null);
    if (!l || !drop) return;
    const spot = landing(l, drop.x, drop.y);
    if (spot) {
      dispatch({ type: 'put', k: l.k, spot });
      buzz('tap');
    } else if (l.from === 'board' && offBoard(drop.x, drop.y)) {
      // Dragged off the board: back to the tray, lying the way it was.
      dispatch({ type: 'put', k: l.k, spot: null });
      setTurns((ts) => withTurn(ts, l.k, l.o));
      buzz('tap');
    }
  };
  /** The domino under the touch that started on the board, if any. */
  const pickOnBoard = () => {
    const col = Math.floor((touchStart.current.x - boardAt.current.x) / geom.pitch);
    const row = Math.floor((touchStart.current.y - boardAt.current.y) / geom.pitch);
    if (row < 0 || col < 0 || row >= p.rows || col >= p.cols) return null;
    const cell = row * p.cols + col;
    const place = gameRef.current.place;
    const k = occupancy(place).get(cell);
    if (k !== undefined) return { k, spot: place[k]!, from: 'board' as const };
    const lp = longPressed.current;
    return lp && lp.spot.includes(cell) ? { ...lp, from: 'tray' as const } : null;
  };

  const trayDrag: TrayDrag = {
    start: (k, x, y) => {
      if (busy) return;
      const o = turns[k];
      // Held by its middle, at board size.
      const long = 2 * cellSize + geom.gap;
      begin({ k, o, from: 'tray', gx: (o % 2 ? cellSize : long) / 2, gy: (o % 2 ? long : cellSize) / 2 }, x, y);
    },
    move: follow,
    end: (x, y) => end({ x, y }),
    cancel: () => end(null),
  };
  const liftFromBoard = (x: number, y: number) => {
    const pick = pickOnBoard();
    if (!pick) return;
    const anchor = Math.min(...pick.spot);
    const ax = boardAt.current.x + (anchor % p.cols) * geom.pitch;
    const ay = boardAt.current.y + Math.floor(anchor / p.cols) * geom.pitch;
    begin({ k: pick.k, o: spotTurn(p, pick.spot), from: pick.from, gx: touchStart.current.x - ax, gy: touchStart.current.y - ay }, x, y);
  };

  const problemCells = hint?.kind === 'wrongValue' ? hint.cells : undefined;
  const hintStep = hint?.kind === 'step' ? hint.step : null;
  const holding = held !== null;

  return (
    // Taps that no domino, cell or button takes land here and put things down.
    <View ref={rootRef} style={[styles.root, NO_SELECT]} onLayout={measure} onStartShouldSetResponder={() => true} onResponderRelease={putDown}>
      <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top', 'bottom', 'left', 'right']}>
        <GameHeader
          def={def}
          difficulty={game.difficulty}
          mistakes={null} // no error detection in Pips: a red domino would give the answer away
          hintsUsed={game.hintsUsed}
          clock={clock}
          paused={paused}
          onBack={onExit}
          onTogglePause={() => !game.completed && setPaused((x) => !x)}
          onHelp={() => setHelpOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          theme={t}
        />

        <View style={styles.boardWrap}>
          {/* Taps and long presses go to the cells; once the finger moves on a domino, the drag takes over. */}
          <View
            ref={boardRef}
            collapsable={false}
            onLayout={measure}
            onStartShouldSetResponderCapture={(e) => {
              touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
              longPressed.current = null;
              return false;
            }}
            onMoveShouldSetResponderCapture={(e) =>
              !busy &&
              !liftRef.current &&
              Math.hypot(e.nativeEvent.pageX - touchStart.current.x, e.nativeEvent.pageY - touchStart.current.y) > DRAG_SLOP &&
              !!pickOnBoard()
            }
            onResponderGrant={(e) => liftFromBoard(e.nativeEvent.pageX, e.nativeEvent.pageY)}
            onResponderMove={(e) => follow(e.nativeEvent.pageX, e.nativeEvent.pageY)}
            onResponderRelease={(e) => end({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
            onResponderTerminate={() => end(null)}
            onResponderTerminationRequest={() => false}
          >
            <PipsBoard
              puzzle={p}
              place={game.place}
              cellSize={cellSize}
              raised={holding ? null : raisedOn}
              spin={spin}
              hintStep={hintStep}
              problemCells={problemCells}
              hidden={paused}
              lifted={lift?.k ?? null}
              dropTarget={target}
              theme={t}
              onPressCell={onPressCell}
              onLongPressCell={onLongPressCell}
            />
          </View>
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
              onApply={applyHint}
              onClose={() => setHint(null)}
              bodyMaxHeight={Math.max(130, height * 0.26)}
              theme={t}
            />
          ) : (
            <View style={{ gap: 10 }}>
              {!paused ? (
                <DominoTray
                  puzzle={p}
                  place={game.place}
                  turns={turns}
                  spin={traySpin}
                  selected={held}
                  lifted={lift?.k ?? null}
                  half={trayHalf}
                  disabled={busy}
                  theme={t}
                  onPress={onPressTray}
                  drag={trayDrag}
                />
              ) : null}
              <Text style={[styles.help, { color: t.textMuted }]}>
                {holding
                  ? 'Tap it again to turn it, then tap a cell, or drag it onto the board.'
                  : raisedOn !== null
                    ? 'Picked up: tap a half to turn the domino around it, drag it to move it or off the board to put it back. Tap anywhere else to set it down.'
                    : 'Drag a domino onto the board, or tap it and then a cell. Tap a placed domino to pick it up and turn it; hold it to take it back.'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.tools}>
          <ToolButton
            icon="undo-variant"
            label="Undo"
            onPress={() => {
              setHint(null);
              putDown();
              dispatch({ type: 'undo' });
            }}
            disabled={!game.history.length || busy}
            theme={t}
          />
          <ToolButton
            icon="broom"
            label="Clear"
            onPress={() => {
              setHint(null);
              putDown();
              dispatch({ type: 'clear' }); // undoable, so no need to ask
            }}
            disabled={game.place.every((sp) => !sp) || busy}
            theme={t}
          />
          <ToolButton icon="lightbulb-on-outline" label="Hint" onPress={showHint} disabled={busy} theme={t} />
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
          mistakes={null} // trial and error is how Pips is played
          hintsUsed={game.hintsUsed}
          onHome={onExit}
          onNewGame={() => onNewGame('pips', game.difficulty)}
          theme={t}
        />
      </SafeAreaView>
      {lift ? (
        <Animated.View style={[styles.lifted, { transform: pan.getTranslateTransform(), opacity: target ? 1 : 0.85 }]}>
          <View style={{ margin: geom.inset, borderRadius: (cellSize - 2 * geom.inset) * 0.18, boxShadow: '0px 6px 14px rgba(0, 0, 0, 0.3)' }}>
            <TurnedDomino
              a={p.dominoes[lift.k][0]}
              b={p.dominoes[lift.k][1]}
              o={lift.o}
              half={cellSize - 2 * geom.inset}
              length={2 * cellSize + geom.gap - 2 * geom.inset}
              edge={t.accent}
              edgeWidth={Math.max(2.5, cellSize * 0.07)}
              theme={t}
            />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const withTurn = (ts: Turn[], k: number, o: Turn) => ts.map((x, i) => (i === k ? o : x));

const styles = StyleSheet.create({
  root: { flex: 1 },
  boardWrap: { alignItems: 'center', marginTop: 8 },
  pausedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8 },
  pausedText: { fontSize: 16, fontWeight: '600' },
  middle: { flex: 1, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 6, minHeight: 60 },
  help: { textAlign: 'center', fontSize: 13 },
  lifted: { position: 'absolute', left: 0, top: 0, pointerEvents: 'none' },
  tools: { flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 12 },
});
