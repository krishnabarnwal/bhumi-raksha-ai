// F9 — unit tests for the pure offline-sync engine (no browser, in-memory
// outbox + scripted poster). Covers submit-online, submit-offline, network vs
// HTTP error handling, flush success/removal, failed-stays-queued, and the
// retry-without-duplication property.

import { describe, expect, it } from "vitest";
import type { CreateSos, SosFeature } from "../types";
import type { QueuedSos, SosOutbox } from "./sosOutbox";
import {
  flushOutbox,
  isNetworkError,
  submitOrQueueSos,
  type SosPoster,
} from "./sosSync";

// A trivial in-memory outbox. Map insertion order == oldest-first, matching the
// real store's list() contract, so the engine behaves identically here.
function makeFakeOutbox(): SosOutbox & { store: Map<string, QueuedSos> } {
  const store = new Map<string, QueuedSos>();
  let seq = 0;
  return {
    store,
    async enqueue(payload) {
      seq += 1;
      const client_uuid = payload.client_uuid ?? `gen-${seq}`;
      const rec: QueuedSos = {
        client_uuid,
        payload: { ...payload, client_uuid },
        status: "QUEUED_OFFLINE",
        queued_at: new Date(1700000000000 + seq).toISOString(),
        attempts: 0,
      };
      store.set(client_uuid, rec); // keyed on client_uuid → re-queue overwrites
      return rec;
    },
    async list() {
      return [...store.values()];
    },
    async remove(id) {
      store.delete(id);
    },
    async markAttempt(id, error) {
      const e = store.get(id);
      if (!e) return;
      e.attempts += 1;
      e.last_error = error;
      e.last_attempt_at = new Date(1700000000000 + ++seq).toISOString();
    },
    async count() {
      return store.size;
    },
    async clear() {
      store.clear();
    },
  };
}

function feature(id: number, client_uuid?: string): SosFeature {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [88.64, 27.6] },
    properties: { id, priority: "P2", client_uuid },
  } as unknown as SosFeature;
}

const sos = (client_uuid: string): CreateSos => ({
  lat: 27.6,
  lon: 88.64,
  trapped: true,
  client_uuid,
});

describe("isNetworkError", () => {
  it("treats a fetch TypeError as a network error (queue + retry)", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });
  it("does NOT treat an HTTP/validation Error as a network error", () => {
    expect(isNetworkError(new Error("400: bad request"))).toBe(false);
  });
});

describe("submitOrQueueSos", () => {
  it("queues without posting when offline", async () => {
    const outbox = makeFakeOutbox();
    let posted = 0;
    const post: SosPoster = async () => {
      posted += 1;
      return feature(1);
    };

    const result = await submitOrQueueSos(outbox, post, sos("evt-1"), false);

    expect(result.status).toBe("queued");
    expect(posted).toBe(0); // never hit the network while offline
    expect(await outbox.count()).toBe(1);
  });

  it("sends immediately when online", async () => {
    const outbox = makeFakeOutbox();
    const post: SosPoster = async (p) => feature(7, p.client_uuid);

    const result = await submitOrQueueSos(outbox, post, sos("evt-2"), true);

    expect(result.status).toBe("sent");
    if (result.status === "sent") expect(result.feature.id).toBe(7);
    expect(await outbox.count()).toBe(0); // nothing queued
  });

  it("queues when online but the network drops mid-request (TypeError)", async () => {
    const outbox = makeFakeOutbox();
    const post: SosPoster = async () => {
      throw new TypeError("Failed to fetch");
    };

    const result = await submitOrQueueSos(outbox, post, sos("evt-3"), true);

    expect(result.status).toBe("queued");
    expect(await outbox.count()).toBe(1); // saved for retry, not lost
  });

  it("re-throws a genuine server/validation error and does NOT queue it", async () => {
    const outbox = makeFakeOutbox();
    const post: SosPoster = async () => {
      throw new Error("422: invalid payload");
    };

    await expect(
      submitOrQueueSos(outbox, post, sos("evt-4"), true),
    ).rejects.toThrow("422");
    expect(await outbox.count()).toBe(0); // a rejected payload must not loop forever
  });
});

describe("flushOutbox", () => {
  it("posts each item oldest-first and removes only after success", async () => {
    const outbox = makeFakeOutbox();
    await outbox.enqueue(sos("a"));
    await outbox.enqueue(sos("b"));
    const seen: string[] = [];
    const post: SosPoster = async (p) => {
      seen.push(p.client_uuid!);
      return feature(seen.length, p.client_uuid);
    };

    const result = await flushOutbox(outbox, post);

    expect(seen).toEqual(["a", "b"]); // oldest-first
    expect(result.synced).toEqual(["a", "b"]);
    expect(result.features).toHaveLength(2);
    expect(await outbox.count()).toBe(0); // both removed after confirmation
  });

  it("keeps a failed item queued and bumps its attempt count", async () => {
    const outbox = makeFakeOutbox();
    await outbox.enqueue(sos("ok"));
    await outbox.enqueue(sos("bad"));
    const post: SosPoster = async (p) => {
      if (p.client_uuid === "bad") throw new TypeError("network down");
      return feature(1, p.client_uuid);
    };

    const result = await flushOutbox(outbox, post);

    expect(result.synced).toEqual(["ok"]);
    expect(result.failed).toEqual(["bad"]);
    expect(await outbox.count()).toBe(1); // "bad" still queued
    expect(outbox.store.get("bad")!.attempts).toBe(1);
    expect(outbox.store.get("bad")!.last_error).toContain("network down");
  });

  it("retries a failed item on the next flush without duplicating it", async () => {
    const outbox = makeFakeOutbox();
    await outbox.enqueue(sos("evt-retry"));
    let calls = 0;
    const flaky: SosPoster = async (p) => {
      calls += 1;
      if (calls === 1) throw new TypeError("network down");
      return feature(101, p.client_uuid);
    };

    const first = await flushOutbox(outbox, flaky);
    expect(first.failed).toEqual(["evt-retry"]);
    expect(await outbox.count()).toBe(1); // stays queued after the failure

    const second = await flushOutbox(outbox, flaky);
    expect(second.synced).toEqual(["evt-retry"]);
    expect(await outbox.count()).toBe(0); // removed after the retry succeeds
    expect(calls).toBe(2); // posted once per flush — same client_uuid, never duplicated
  });
});
