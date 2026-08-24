// F9 — offline SOS outbox (IndexedDB).
//
// A citizen SOS must never be lost, even with no connection. When we can't
// reach the server the complete POST payload is persisted here, keyed by its
// `client_uuid` (the idempotency/event id the backend dedupes on). The sync
// engine (see sosSync.ts) drains this store when connectivity returns and
// removes an item ONLY after the server confirms — so nothing is dropped and
// nothing is duplicated.
//
// Keying on `client_uuid` means re-queuing the same SOS overwrites in place
// rather than creating a second copy. The store is a plain interface so the
// sync engine can be unit-tested against an in-memory fake (see the tests).

import type { CreateSos } from "../types";

// A SOS waiting to be synced. `status` is intentionally the single literal
// QUEUED_OFFLINE so the UI can label it unambiguously.
export interface QueuedSos {
  client_uuid: string;
  payload: CreateSos; // the exact body to POST (already carries client_uuid)
  status: "QUEUED_OFFLINE";
  queued_at: string; // ISO timestamp
  attempts: number;
  last_error?: string;
  last_attempt_at?: string;
}

// The operations the sync engine and UI need. Implemented by IndexedDB in the
// app and by a trivial in-memory object in tests.
export interface SosOutbox {
  enqueue(payload: CreateSos): Promise<QueuedSos>;
  list(): Promise<QueuedSos[]>;
  remove(clientUuid: string): Promise<void>;
  markAttempt(clientUuid: string, error?: string): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

const DB_NAME = "bhumi-raksha";
const STORE = "sos_outbox";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "client_uuid" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

// Run a write and resolve only when the whole transaction commits — so callers
// (and the sync engine's "remove only after success") can trust durability.
function writeDone(
  db: IDBDatabase,
  op: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    op(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
  });
}

function makeUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback id (older/insecure contexts): still unique enough to dedupe on.
  return `sos-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

// The real, IndexedDB-backed outbox used by the app.
export function createIndexedDbOutbox(): SosOutbox {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDb());

  return {
    async enqueue(payload) {
      const clientUuid = payload.client_uuid ?? makeUuid();
      const record: QueuedSos = {
        client_uuid: clientUuid,
        payload: { ...payload, client_uuid: clientUuid },
        status: "QUEUED_OFFLINE",
        queued_at: new Date().toISOString(),
        attempts: 0,
      };
      await writeDone(await db(), (s) => s.put(record));
      return record;
    },
    async list() {
      const store = (await db())
        .transaction(STORE, "readonly")
        .objectStore(STORE);
      const all = (await promisify(store.getAll())) as QueuedSos[];
      // Oldest first — synced in the order the citizen raised them.
      return all.sort((a, b) => a.queued_at.localeCompare(b.queued_at));
    },
    async remove(clientUuid) {
      await writeDone(await db(), (s) => s.delete(clientUuid));
    },
    async markAttempt(clientUuid, error) {
      const database = await db();
      const store = database.transaction(STORE, "readonly").objectStore(STORE);
      const existing = (await promisify(store.get(clientUuid))) as
        | QueuedSos
        | undefined;
      if (!existing) return;
      existing.attempts += 1;
      existing.last_error = error;
      existing.last_attempt_at = new Date().toISOString();
      await writeDone(database, (s) => s.put(existing));
    },
    async count() {
      const store = (await db())
        .transaction(STORE, "readonly")
        .objectStore(STORE);
      return await promisify(store.count());
    },
    async clear() {
      await writeDone(await db(), (s) => s.clear());
    },
  };
}
