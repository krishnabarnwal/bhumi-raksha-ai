import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { resolveInitialTheme, THEME_STORAGE_KEY } from "./theme";
import type { Theme } from "./theme";

export type { Theme } from "./theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(THEME_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

function prefersLight(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    );
  } catch {
    return false;
  }
}

// App-wide theme provider. Initial theme: persisted choice → OS preference →
// dark. The choice is mirrored onto <html data-theme> so the CSS-variable
// overrides in index.css take effect, and persisted so it survives reloads.
// (An inline script in index.html sets the same attribute before first paint to
// avoid a flash; this provider keeps it in sync once React mounts.)
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    resolveInitialTheme(readStored(), prefersLight()),
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* best-effort persistence — a blocked localStorage must not break theming */
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>");
  return ctx;
}
