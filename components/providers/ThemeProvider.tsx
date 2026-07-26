"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeState | undefined>(undefined);
const STORAGE_KEY = "contractor-app-v2-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    // Deliberately NOT a useState lazy initializer: localStorage isn't
    // available during server rendering, so the client's first
    // (hydration) render must start from the same "system" default the
    // server rendered, then correct itself here — reading the stored
    // preference synchronously during render would produce a
    // server/client mismatch instead.
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setThemeState(stored);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function applyResolvedTheme() {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      root.setAttribute("data-theme", resolved);
    }

    applyResolvedTheme();

    // Only matters while theme === "system" — a user with an explicit
    // light/dark choice shouldn't have the page repaint under them
    // because their OS setting changed, but "system" should track it
    // live, not just at the moment it was selected.
    if (theme === "system") {
      media.addEventListener("change", applyResolvedTheme);
      return () => media.removeEventListener("change", applyResolvedTheme);
    }
  }, [theme]);

  function setTheme(next: Theme) {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider.");
  return ctx;
}
