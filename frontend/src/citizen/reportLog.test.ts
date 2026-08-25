import { describe, expect, it } from "vitest";
import { addReport, parseReports } from "./reportLog";
import type { MyReport } from "./reportLog";

const sample = (over: Partial<MyReport> = {}): MyReport => ({
  kind: "hazard",
  id: "42",
  at: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("addReport", () => {
  it("prepends the newest entry", () => {
    const list = addReport(addReport([], sample({ id: "1" })), sample({ id: "2" }));
    expect(list.map((r) => r.id)).toEqual(["2", "1"]);
  });

  it("caps the list at 50 entries, keeping the newest", () => {
    let list: MyReport[] = [];
    for (let i = 0; i < 60; i++) {
      list = addReport(list, sample({ id: String(i) }));
    }
    expect(list).toHaveLength(50);
    expect(list[0].id).toBe("59"); // newest kept
    expect(list.some((r) => r.id === "9")).toBe(false); // oldest dropped
  });
});

describe("parseReports", () => {
  it("returns [] for null / empty / non-JSON input", () => {
    expect(parseReports(null)).toEqual([]);
    expect(parseReports("")).toEqual([]);
    expect(parseReports("{not json")).toEqual([]);
  });

  it("returns [] when the payload is not an array", () => {
    expect(parseReports(JSON.stringify({ id: "1" }))).toEqual([]);
  });

  it("keeps well-formed entries and drops malformed ones", () => {
    const raw = JSON.stringify([
      sample({ id: "ok" }),
      { kind: "bogus", id: "x", at: "t" }, // bad kind
      { kind: "sos", at: "t" }, // missing id
      { kind: "sos", id: 5, at: "t" }, // id not a string
      "nope",
    ]);
    const out = parseReports(raw);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("ok");
  });

  it("round-trips an entry through addReport + JSON", () => {
    const list = addReport(
      [],
      sample({ kind: "sos", id: "7", priority: "P1", offline: true }),
    );
    expect(parseReports(JSON.stringify(list))).toEqual(list);
  });
});
