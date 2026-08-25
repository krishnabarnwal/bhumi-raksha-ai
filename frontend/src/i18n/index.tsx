import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { resolveInitialLang, STORAGE_KEY, translate } from "./translate";
import type { Lang, TParams, TranslationKey } from "./translate";

export type { Lang, TranslationKey, TParams } from "./translate";

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey, params?: TParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readStored(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

// App-wide language provider. Initial language: persisted choice → browser
// language → English. The chosen language is persisted and mirrored onto
// <html lang> for accessibility. `t` is memoised per language so consumers only
// re-render when the language actually changes.
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    resolveInitialLang(
      readStored(),
      typeof navigator !== "undefined" ? navigator.language : undefined,
    ),
  );

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* persistence is best-effort; ignore quota/availability errors */
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: TParams) => translate(lang, key, params),
    [lang],
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within an <I18nProvider>");
  return ctx;
}
