// F9 — integration tests for the real IndexedDB-backed outbox, run against
// fake-indexeddb (registered by vitest.config setupFiles). Proves the queue
// actually persists a SOS, dedupes on client_uuid, and survives a "reload".

import { beforeEach, describe, expect, it } from "vitest";
import type { CreateSos } from "../types";
import { createIndexedDbOutbox } from "./sosOutbox";

const sos = (client_uuid?: string): CreateSos => ({
  lat: 27.6,
  lon: 88.64,
  trapped: true,
  client_uuid,
});

// Isolate tests: empty the shared database before each.
beforeEach(async () => {
  await createIndexedDbOutbox().clear();
});

describe("sosOutbox (IndexedDB)", () => {
  it("persists a queued SOS as QUEUED_OFFLINE, retrievable by list/count", async () => {
    const outbox = createIndexedDbOutbox();
    const rec = await outbox.enqueue(sos("evt-1"));

    expect(rec.status).toBe("QUEUED_OFFLINE");
    expect(rec.client_uuid).toBe("evt-1");
    expect(rec.payload.client_uuid).toBe("evt-1"); // payload carries the id to POST
    expect(await outbox.count()).toBe(1);

    const list = await outbox.list();
    expect(list).toHaveLength(1);
    expect(list[0].payload.lat).toBe(27.6);
  });

  it("generates a client_uuid when the payload lacks one", async () => {
    const outbox = createIndexedDbOutbox();
    const rec = await outbox.enqueue(sos(undefined));

    expect(rec.client_uuid).toBeTruthy();
    expect(rec.payload.client_uuid).toBe(rec.client_uuid);
  });

  it("re-enqueuing the same client_uuid overwrites in place (no duplicate)", async () => {
    const outbox = createIndexedDbOutbox();
    await outbox.enqueue(sos("evt-dup"));
    await outbox.enqueue(sos("evt-dup"));

    expect(await outbox.count()).toBe(1); // keyed on client_uuid
  });

  it("removes an item only when asked (i.e. after the server confirms)", async () => {
    const outbox = createIndexedDbOutbox();
    await outbox.enqueue(sos("evt-x"));
    await outbox.remove("evt-x");

    expect(await outbox.count()).toBe(0);
  });

  it("markAttempt increments attempts and records the last error", async () => {
    const outbox = createIndexedDbOutbox();
    await outbox.enqueue(sos("evt-e"));
    await outbox.markAttempt("evt-e", "network down");

    const [rec] = await outbox.list();
    expect(rec.attempts).toBe(1);
    expect(rec.last_error).toBe("network down");
    expect(rec.last_attempt_at).toBeTruthy();
  });

  it("lists items oldest-first", async () => {
    const outbox = createIndexedDbOutbox();
    await outbox.enqueue({ lat: 1, lon: 1, client_uuid: "a" });
    await new Promise((r) => setTimeout(r, 5)); // ensure distinct queued_at
    await outbox.enqueue({ lat: 2, lon: 2, client_uuid: "b" });

    const list = await outbox.list();
    expect(list.map((r) => r.client_uuid)).toEqual(["a", "b"]);
  });

  it("survives a 'reload' — a fresh outbox instance still sees the queued SOS", async () => {
    await createIndexedDbOutbox().enqueue(sos("evt-persist"));

    // Simulate a page reload: a brand-new store object over the same database.
    const reopened = createIndexedDbOutbox();
    expect(await reopened.count()).toBe(1);
    const [rec] = await reopened.list();
    expect(rec.client_uuid).toBe("evt-persist");
  });
});
