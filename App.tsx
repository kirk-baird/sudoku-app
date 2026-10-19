import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Dialog } from './src/components/Dialog';
import { SavedGame } from './src/components/HomeParts';
import { DIFFICULTY_NAMES, Difficulty } from './src/engine/common';
import { PipsPuzzle } from './src/engine/pips';
import { TentsPuzzle } from './src/engine/tents';
import { FONT_ASSETS } from './src/fonts';
import { GameState, candidateRules, newGame } from './src/game/gameState';
import { PipsGameState, newPipsGame } from './src/game/pipsState';
import { nextPuzzle } from './src/game/puzzleSource';
import { TentsGameState, newTentsGame } from './src/game/tentsState';
import { GAMES } from './src/games/registry';
import { GAME_TYPES, GameType } from './src/games/types';
import { GameScreen, resolveGame } from './src/screens/GameScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { PipsScreen } from './src/screens/PipsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TentsScreen } from './src/screens/TentsScreen';
import { TypeScreen } from './src/screens/TypeScreen';
import { SettingsProvider, useSettings } from './src/settings';
import { EMPTY_STATS, Stats, loadStats } from './src/stats';
import { loadRaw, migrateLegacy, remove } from './src/storage';
import { useTheme } from './src/theme';

type Screen = 'home' | 'type' | 'game' | 'settings';

function Root() {
  const t = useTheme();
  const { settings, loaded } = useSettings();
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');
  const [prevScreen, setPrevScreen] = useState<Screen>('home');
  const [type, setType] = useState<GameType>('classic');
  const [game, setGame] = useState<SavedGame | null>(null);
  const [saved, setSaved] = useState<Partial<Record<GameType, SavedGame>>>({});
  const [stats, setStats] = useState<Partial<Record<GameType, Stats>>>({});
  const [generating, setGenerating] = useState<{ type: GameType; d: Difficulty } | null>(null);
  const [confirmNew, setConfirmNew] = useState<{ type: GameType; d: Difficulty } | null>(null);

  const refresh = useCallback(async () => {
    const games = await Promise.all(GAME_TYPES.map((ty) => loadRaw<SavedGame>(`game.${ty}`)));
    const st = await Promise.all(GAME_TYPES.map((ty) => loadStats(ty)));
    const nextSaved: Partial<Record<GameType, SavedGame>> = {};
    const nextStats: Partial<Record<GameType, Stats>> = {};
    GAME_TYPES.forEach((ty, i) => {
      const g = games[i];
      if (g && !g.completed) nextSaved[ty] = ty === 'tents' || ty === 'pips' ? g : resolveGame(g as GameState);
      nextStats[ty] = st[i];
    });
    setSaved(nextSaved);
    setStats(nextStats);
  }, []);

  useEffect(() => {
    migrateLegacy()
      .then(refresh)
      .then(() => setReady(true));
  }, [refresh]);

  const leaveGame = useCallback(() => {
    setScreen('type');
    setGame(null);
    // let the game screen's unmount save land first
    setTimeout(refresh, 50);
  }, [refresh]);

  // Android hardware back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'game') {
        leaveGame();
        return true;
      }
      if (screen === 'type') {
        setScreen('home');
        return true;
      }
      if (screen === 'settings') {
        setScreen(prevScreen);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen, prevScreen, leaveGame]);

  const startNew = async (ty: GameType, d: Difficulty) => {
    setConfirmNew(null);
    setGenerating({ type: ty, d });
    setGame(null);
    setType(ty);
    setScreen('type');
    await remove(`game.${ty}`);
    const p = await nextPuzzle(ty, d);
    let g: SavedGame;
    if (ty === 'tents') {
      g = newTentsGame(p.id, d, p.payload as TentsPuzzle);
    } else if (ty === 'pips') {
      g = newPipsGame(p.id, d, p.payload as PipsPuzzle);
    } else {
      const a = GAMES[ty].adapter!(p.payload);
      const rules = candidateRules(a.rules, settings.cageMath);
      g = newGame(p.id, d, a.givens, a.solution, settings.autoCandidates, { type: ty, payload: p.payload, rules });
    }
    setGenerating(null);
    setGame(g);
    setScreen('game');
  };

  const requestNew = (ty: GameType, d: Difficulty) => {
    if (saved[ty]) setConfirmNew({ type: ty, d });
    else startNew(ty, d);
  };

  const resume = (ty: GameType) => {
    const g = saved[ty];
    if (!g) return;
    setType(ty);
    setGame(g);
    setScreen('game');
  };

  // fonts are bundled, so they load almost instantly; fall back to system fonts on error
  if (!loaded || !ready || (!fontsLoaded && !fontError)) {
    return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  }

  let body: React.ReactNode;
  if (screen === 'game' && game) {
    body =
      game.type === 'tents' ? (
        <TentsScreen key={game.id} initial={game as TentsGameState} onExit={leaveGame} onNewGame={startNew} />
      ) : game.type === 'pips' ? (
        <PipsScreen key={game.id} initial={game as PipsGameState} onExit={leaveGame} onNewGame={startNew} />
      ) : (
        <GameScreen key={game.id} initial={game as GameState} onExit={leaveGame} onNewGame={startNew} />
      );
  } else if (screen === 'settings') {
    body = <SettingsScreen onBack={() => setScreen(prevScreen)} />;
  } else if (screen === 'type') {
    body = (
      <TypeScreen
        type={type}
        saved={saved[type] ?? null}
        stats={stats[type] ?? EMPTY_STATS}
        onBack={() => setScreen('home')}
        onResume={() => resume(type)}
        onNew={(d) => requestNew(type, d)}
      />
    );
  } else {
    body = (
      <HomeScreen
        saved={saved}
        onResume={resume}
        onOpenType={(ty) => {
          setType(ty);
          setScreen('type');
        }}
        onSettings={() => {
          setPrevScreen('home');
          setScreen('settings');
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      {body}

      <Dialog
        visible={!!confirmNew}
        title="Start a new game?"
        theme={t}
        onRequestClose={() => setConfirmNew(null)}
        buttons={[
          { label: 'Cancel', onPress: () => setConfirmNew(null) },
          { label: 'Start new', onPress: () => confirmNew && startNew(confirmNew.type, confirmNew.d), primary: true },
        ]}
      >
        <Text style={{ color: t.textMuted, fontSize: 15, lineHeight: 21 }}>
          Your {confirmNew ? GAMES[confirmNew.type].name : ''} game in progress will be lost.
        </Text>
      </Dialog>

      <Dialog visible={!!generating} title="Preparing puzzle" theme={t} buttons={[]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={t.accent} />
          <Text style={{ color: t.textMuted, fontSize: 15, flex: 1 }}>
            Finding a {generating ? `${DIFFICULTY_NAMES[generating.d]} ${GAMES[generating.type].name}` : ''} puzzle…
          </Text>
        </View>
      </Dialog>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <Root />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
