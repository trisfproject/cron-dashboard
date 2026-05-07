'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'nyx-theme';
const ThemeContext = createContext({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {}
});

function getSystemTheme() {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = resolvedTheme;
  window.dispatchEvent(new CustomEvent('nyx-theme-change', { detail: { theme, resolvedTheme } }));
  return resolvedTheme;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('system');
  const [resolvedTheme, setResolvedTheme] = useState('light');

  useEffect(() => {
    const storedTheme = localStorage.getItem(STORAGE_KEY);
    const initialTheme = ['light', 'dark', 'system'].includes(storedTheme) ? storedTheme : 'system';

    setThemeState(initialTheme);
    setResolvedTheme(applyTheme(initialTheme));
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function onSystemChange() {
      setResolvedTheme(applyTheme(theme));
    }

    media.addEventListener('change', onSystemChange);
    return () => media.removeEventListener('change', onSystemChange);
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    resolvedTheme,
    setTheme(nextTheme) {
      const safeTheme = ['light', 'dark', 'system'].includes(nextTheme) ? nextTheme : 'system';
      localStorage.setItem(STORAGE_KEY, safeTheme);
      setThemeState(safeTheme);
      setResolvedTheme(applyTheme(safeTheme));
    }
  }), [resolvedTheme, theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
