import { describe, expect, it } from "vitest";
import { isTheme, resolveInitialTheme } from "./theme";

describe("isTheme", () => {
  it("accepts the two known themes", () => {
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("light")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isTheme("blue")).toBe(false);
    expect(isTheme("")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe("resolveInitialTheme", () => {
  it("prefers a valid persisted choice over the OS preference", () => {
    expect(resolveInitialTheme("light", false)).toBe("light");
    expect(resolveInitialTheme("dark", true)).toBe("dark");
  });
  it("falls back to the OS preference when nothing is persisted", () => {
    expect(resolveInitialTheme(null, true)).toBe("light");
    expect(resolveInitialTheme(null, false)).toBe("dark");
  });
  it("ignores an invalid persisted value and uses the OS preference", () => {
    expect(resolveInitialTheme("purple", true)).toBe("light");
    expect(resolveInitialTheme("", false)).toBe("dark");
  });
});
