// F9 — offline SOS sync engine (pure logic, no browser/React).
//
// Kept free of `navigator`, `window` and IndexedDB so it can be unit-tested
// against an in-memory outbox and a fake poster. The React hook
// (useOfflineSos) wires these to the real outbox, `api.createSos` and the
// online/offline events.

import type { CreateSos, SosFeature } from "../types";
import type { QueuedSos, SosOutbox } from "./sosOutbox";

// Posts an SOS and returns the created (or, on a re-sync, the existing)
// incident. In the app this is `api.createSos`; the backend is idempotent on
// `client_uuid`, so calling it twice with the same payload is always safe.
export type SosPoster = (payload: CreateSos) => Promise<SosFeature>;

export type SubmitResult =
  | { status: "sent"; feature: SosFeature }
  | { status: "queued"; item: QueuedSos };

// True when an error means the request never reached the server (offline, DNS,
// connection refused) — safe to queue and retry. `fetch` rejects with a
// TypeError on network failure; an HTTP 4xx/5xx surfaces as a plain Error,
// which we must NOT queue (retrying a rejected payload would loop forever).
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError;
}

// Submit an SOS now, or save it to the outbox if we're offline or the network
// drops mid-request. Returns whether it was sent or queued.
export async function submitOrQueueSos(
  outbox: SosOutbox,
  post: SosPoster,
  payload: CreateSos,
  online: boolean,
): Promise<SubmitResult> {
  if (!online) {
    const item = await outbox.enqueue(payload);
    return { status: "queued", item };
  }
  try {
    const feature = await post(payload);
    return { status: "sent", feature };
  } catch (e) {
    if (isNetworkError(e)) {
      const item = await outbox.enqueue(payload);
      return { status: "queued", item };
    }
    throw e; // genuine validation/server error — let the caller surface it
  }
}

export interface FlushResult {
  synced: string[]; // client_uuids the server accepted (created or deduped)
  failed: string[]; // still queued — will retry
  features: SosFeature[];
}

// Drain the outbox: POST each queued SOS oldest-first and remove it ONLY after
// the server confirms. On failure the item stays queued (its attempt count is
// bumped) for the next retry. Sequential on purpose — a burst of retries can't
// race the same event, and the server dedupes on client_uuid regardless, so a
// given SOS can never become two incidents.
export async function flushOutbox(
  outbox: SosOutbox,
  post: SosPoster,
): Promise<FlushResult> {
  const items = await outbox.list();
  const synced: string[] = [];
  const failed: string[] = [];
  const features: SosFeature[] = [];
  for (const item of items) {
    try {
      const feature = await post(item.payload); // idempotent server-side
      await outbox.remove(item.client_uuid); // remove only after success
      synced.push(item.client_uuid);
      features.push(feature);
    } catch (e) {
      await outbox.markAttempt(
        item.client_uuid,
        e instanceof Error ? e.message : String(e),
      );
      failed.push(item.client_uuid);
    }
  }
  return { synced, failed, features };
}
