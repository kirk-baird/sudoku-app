import React, { createContext, useContext, useEffect, useState } from 'react';
import { loadJSON, saveJSON } from './storage';

export interface Settings {
  errorDetection: boolean; // show wrong digits in red + mistakes counter
  autoCandidates: boolean; // keep every empty cell filled with legal candidates
  cageMath: boolean; // calcudoku/kakuro: auto candidates also apply the cage/run sums
  highlightCandidates: boolean; // selecting an 8 also highlights 8 pencil marks
  haptics: boolean;
  theme: 'system' | 'light' | 'dark';
}

export const DEFAULT_SETTINGS: Settings = {
  errorDetection: true,
  autoCandidates: true,
  cageMath: false,
  highlightCandidates: true,
  haptics: true,
  theme: 'system',
};

interface Ctx {
  settings: Settings;
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<Ctx>({ settings: DEFAULT_SETTINGS, loaded: false, update: () => {} });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadJSON('settings', DEFAULT_SETTINGS).then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const update = (patch: Partial<Settings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveJSON('settings', next);
      return next;
    });

  return <SettingsContext.Provider value={{ settings, loaded, update }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
