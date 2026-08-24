// F9 — React hook binding the offline SOS outbox + sync engine to the browser.
//
// Owns: the online/offline state (from navigator + the window events), the
// queued-count for the UI, one-at-a-time sync, and an automatic retry loop.
// The heavy lifting lives in the pure functions in sosSync.ts; this only wires
// them to `api.createSos`, IndexedDB and the browser lifecycle.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { CreateSos, SosFeature } from "../types";
import { createIndexedDbOutbox } from "../offline/sosOutbox";
import type { SosOutbox } from "../offline/sosOutbox";
import { flushOutbox, submitOrQueueSos } from "../offline/sosSync";
import type { SubmitResult } from "../offline/sosSync";

// While anything is queued and we believe we're online, retry on this cadence
// (covers "server was still down when we reconnected"). Event-driven sync on
// the `online` event is the primary trigger; this is the safety net.
const RETRY_MS = 15000;

interface Options {
  // Called for each incident confirmed by the server during a sync, so the
  // command center can refresh immediately (it also polls every 5s).
  onSynced?: (feature: SosFeature) => void;
}

export interface OfflineSos {
  online: boolean;
  queuedCount: number;
  syncing: boolean;
  submit: (payload: CreateSos) => Promise<SubmitResult>;
  sync: () => Promise<void>;
}

const isBrowserOnline = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

export function useOfflineSos(options: Options = {}): OfflineSos {
  // One outbox instance for the component's lifetime.
  const outboxRef = useRef<SosOutbox | null>(null);
  if (outboxRef.current === null) outboxRef.current = createIndexedDbOutbox();
  const outbox = outboxRef.current;

  const [online, setOnline] = useState<boolean>(isBrowserOnline());
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Refs so the stable callbacks below never read stale state.
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const syncingRef = useRef(false);
  const onSyncedRef = useRef(options.onSynced);
  onSyncedRef.current = options.onSynced;

  const refreshCount = useCallback(async () => {
    try {
      setQueuedCount(await outbox.count());
    } catch {
      /* transient IndexedDB error — keep the last known count */
    }
  }, [outbox]);

  const sync = useCallback(async () => {
    if (syncingRef.current) return; // one flush at a time
    if (!isBrowserOnline()) return;
    if ((await outbox.count()) === 0) {
      setQueuedCount(0);
      return;
    }
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await flushOutbox(outbox, api.createSos);
      result.features.forEach((f) => onSyncedRef.current?.(f));
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refreshCount();
    }
  }, [outbox, refreshCount]);

  const submit = useCallback(
    async (payload: CreateSos): Promise<SubmitResult> => {
      const result = await submitOrQueueSos(
        outbox,
        api.createSos,
        payload,
        onlineRef.current,
      );
      await refreshCount();
      // Queued while nominally online (a transient drop) → try to drain now.
      if (result.status === "queued" && isBrowserOnline()) void sync();
      return result;
    },
    [outbox, refreshCount, sync],
  );

  useEffect(() => {
    void refreshCount();

    const goOnline = () => {
      onlineRef.current = true;
      setOnline(true);
      void sync(); // reconnect → drain the outbox
    };
    const goOffline = () => {
      onlineRef.current = false;
      setOnline(false);
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Reloaded with items still queued? Attempt a sync on mount.
    if (isBrowserOnline()) void sync();
    const timer = setInterval(() => {
      if (isBrowserOnline()) void sync();
    }, RETRY_MS);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(timer);
    };
  }, [refreshCount, sync]);

  return { online, queuedCount, syncing, submit, sync };
}
