// Unit tests for the pure i18n layer — dictionary completeness (Hindi mirrors
// English exactly), interpolation, English fallback, and initial-language
// resolution. No React/DOM, runs under the node `src/**/*.test.ts` runner.

import { describe, expect, it } from "vitest";
import { en } from "./en";
import { hi } from "./hi";
import { resolveInitialLang, translate } from "./translate";

describe("dictionaries", () => {
  it("Hindi covers exactly the same keys as English (no missing / extra)", () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  });

  it("has no empty Hindi translations", () => {
    for (const [key, value] of Object.entries(hi)) {
      expect(value, `hi["${key}"] should be non-empty`).toBeTruthy();
    }
  });

  it("keeps every {placeholder} present in English also present in Hindi", () => {
    const holders = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(holders(hi[key]), `placeholders for "${key}"`).toEqual(holders(en[key]));
    }
  });
});

describe("translate", () => {
  it("returns the requested language's string", () => {
    expect(translate("en", "nav.command")).toBe("Command Center");
    expect(translate("hi", "nav.command")).toBe("कमांड सेंटर");
  });

  it("interpolates a single placeholder", () => {
    expect(translate("en", "map.activeSos", { count: 3 })).toBe("3 active SOS");
    expect(translate("hi", "map.activeSos", { count: 3 })).toBe("3 सक्रिय SOS");
  });

  it("interpolates multiple placeholders", () => {
    expect(translate("en", "citizen.hazard.reported", { label: "Flood", id: 7 })).toBe(
      "Flood reported (#7). Thank you — authorities notified.",
    );
  });

  it("falls back to the raw key for an unknown key", () => {
    const t = translate as unknown as (l: string, k: string) => string;
    expect(t("hi", "does.not.exist")).toBe("does.not.exist");
  });
});

describe("resolveInitialLang", () => {
  it("prefers a valid persisted choice over the browser language", () => {
    expect(resolveInitialLang("hi", "en-US")).toBe("hi");
    expect(resolveInitialLang("en", "hi-IN")).toBe("en");
  });

  it("uses the browser language when nothing is persisted", () => {
    expect(resolveInitialLang(null, "hi-IN")).toBe("hi");
    expect(resolveInitialLang(null, "en-US")).toBe("en");
    expect(resolveInitialLang(null, undefined)).toBe("en");
  });

  it("ignores an invalid persisted value", () => {
    expect(resolveInitialLang("fr", "hi-IN")).toBe("hi");
    expect(resolveInitialLang("", "en-US")).toBe("en");
  });
});
