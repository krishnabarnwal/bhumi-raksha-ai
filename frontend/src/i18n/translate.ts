// Pure i18n helpers — no React, no DOM, so they unit-test cleanly under the
// existing `src/**/*.test.ts` runner (see i18n.test.ts). The React provider in
// index.tsx is a thin wrapper over these.

import { en } from "./en";
import type { Lang, TranslationKey } from "./en";
import { hi } from "./hi";

export type { Lang, TranslationKey } from "./en";

export const LANGS: Lang[] = ["en", "hi"];

// Interpolation params for `{name}` placeholders in a string.
export type TParams = Record<string, string | number>;

const DICTS: Record<Lang, Record<string, string>> = { en, hi };

export const STORAGE_KEY = "bhumi.lang";

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "hi";
}

// Look up `key` in the language's dictionary (falling back to English, then to
// the raw key), then substitute any `{param}` placeholders. Placeholder
// substitution uses split/join so every occurrence is replaced without needing
// String.prototype.replaceAll.
export function translate(lang: Lang, key: TranslationKey, params?: TParams): string {
  const dict = DICTS[lang] ?? en;
  let out = dict[key] ?? (en as Record<string, string>)[key] ?? String(key);
  if (params) {
    for (const name of Object.keys(params)) {
      out = out.split(`{${name}}`).join(String(params[name]));
    }
  }
  return out;
}

// Decide the starting language: a valid persisted choice wins; otherwise fall
// back to the browser language (Hindi only when it explicitly asks for it);
// English otherwise. Pure — the caller supplies the stored value and nav lang so
// this is trivially testable.
export function resolveInitialLang(
  stored: string | null,
  navLang: string | undefined,
): Lang {
  if (isLang(stored)) return stored;
  if (navLang && navLang.toLowerCase().startsWith("hi")) return "hi";
  return "en";
}
