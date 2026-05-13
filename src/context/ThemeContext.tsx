// Theme preference + provider.
//
// Sources, in priority order:
//   1. Explicit user choice persisted in AsyncStorage under THEME_KEY
//   2. System appearance (Appearance.getColorScheme())
//   3. Fallback to 'dark' (the legacy default — the entire app was built dark-first)
//
// When the user toggles in Settings we persist their explicit choice; they
// then opt back into "follow system" by selecting it from the same screen.
// We expose all three states (light / dark / system) so the UI can reflect
// "Auto" without losing the underlying mode.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, type ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palettes, type Palette, type ThemeName } from '../theme/palettes';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  /** Current effective theme — never 'system'. Use this to look up colors. */
  theme: ThemeName;
  /** The user's chosen mode, including 'system' if they want OS-driven. */
  mode: ThemeMode;
  /** The full palette for the current theme. Bind your styles to this. */
  colors: Palette;
  /** Persist a new explicit mode. Pass 'system' to follow OS. */
  setMode: (mode: ThemeMode) => Promise<void>;
  /** Convenience flip between light <-> dark, ignoring 'system'. */
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = 'monmap.theme_mode';

function resolveTheme(mode: ThemeMode, system: ColorSchemeName): ThemeName {
  if (mode === 'system') return system === 'light' ? 'light' : 'dark';
  return mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [system, setSystem]  = useState<ColorSchemeName>(Appearance.getColorScheme());
  const [loaded, setLoaded]  = useState(false);

  // Hydrate the saved mode once on mount. We don't gate rendering on this —
  // the initial paint uses 'dark' (the legacy default) and flips ~immediately
  // if the user previously chose otherwise. This is preferable to showing a
  // splash because AsyncStorage reads are typically <50 ms.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_KEY).then(raw => {
      if (cancelled) return;
      if (raw === 'light' || raw === 'dark' || raw === 'system') {
        setModeState(raw);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, []);

  // Listen for OS-level appearance changes — only matters when mode==='system',
  // but the listener is cheap so we leave it on always. The Appearance API
  // fires on iOS Control Center toggles, Android Quick Settings, and on iPad
  // when the system theme changes mid-session.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme));
    return () => sub.remove();
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try { await AsyncStorage.setItem(THEME_KEY, next); } catch {}
  }, []);

  const toggleTheme = useCallback(async () => {
    const current = resolveTheme(mode, system);
    await setMode(current === 'dark' ? 'light' : 'dark');
  }, [mode, system, setMode]);

  const theme  = useMemo(() => resolveTheme(mode, system), [mode, system]);
  const colors = palettes[theme];

  // `loaded` is exposed implicitly via React's render cycle — consumers don't
  // need to know about it. The first frame may render in dark even if the
  // user picked light; one extra render later it's right.
  void loaded;

  const value: ThemeContextValue = useMemo(
    () => ({ theme, mode, colors, setMode, toggleTheme }),
    [theme, mode, colors, setMode, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Use the current palette + theme mode inside a component.
 *
 *   const { colors, theme, toggleTheme } = useTheme();
 *
 * Define your StyleSheet inside the component (or wrap with useMemo) so it
 * recomputes when the theme flips. The `colors` object is reference-stable
 * within a theme, so useMemo on it is safe and cheap.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Provider missing — fall back to the legacy dark palette so unmigrated
    // contexts (tests, storybook) don't crash. New code that needs theming
    // must be inside <ThemeProvider>.
    return {
      theme: 'dark',
      mode: 'dark',
      colors: palettes.dark,
      setMode: async () => {},
      toggleTheme: async () => {},
    };
  }
  return ctx;
}
