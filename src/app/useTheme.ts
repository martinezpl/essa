import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
export type ThemeMode = Theme | "system";

const STORAGE_KEY = "essa.theme";

const readStoredMode = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }

  return "system";
};

const readSystemTheme = (): Theme => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
};

export const useTheme = () => {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredMode());
  const [systemTheme, setSystemTheme] = useState<Theme>(() => readSystemTheme());

  const resolved: Theme = mode === "system" ? systemTheme : mode;

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) =>
      setSystemTheme(event.matches ? "dark" : "light");

    media.addEventListener("change", handler);

    return () => media.removeEventListener("change", handler);
  }, []);

  const setThemeMode = useCallback((next: ThemeMode) => {
    setMode(next);

    if (next === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeMode(resolved === "dark" ? "light" : "dark");
  }, [resolved, setThemeMode]);

  return { mode, theme: resolved, setThemeMode, toggleTheme };
};
