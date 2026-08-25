// Theme logic, kept pure (no React, no DOM) so it is unit-testable in isolation.
// The provider in ./index.tsx wires these into React state + <html data-theme>.

export type Theme = "dark" | "light";

// localStorage key for the persisted choice. Namespaced like bhumi.lang.
export const THEME_STORAGE_KEY = "bhumi.theme";

export function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light";
}

// Resolve the theme to use at startup: a valid persisted choice always wins;
// otherwise follow the OS preference; default to dark (the app's native look,
// and the palette the MapLibre basemap is tuned for).
export function resolveInitialTheme(stored: string | null, prefersLight: boolean): Theme {
  if (isTheme(stored)) return stored;
  return prefersLight ? "light" : "dark";
}
