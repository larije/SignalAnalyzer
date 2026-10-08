"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserRuntime, type BrowserRuntimeSnapshot } from "@/lib/browserRuntime";
import { createMemoryBrowserStore, emptyBrowserData, openBrowserStore, serializeBackup, type BrowserData, type BrowserStore } from "@/lib/browserStorage";

function initialSnapshot(data = emptyBrowserData()): BrowserRuntimeSnapshot {
  const asset = () => ({ ticker: null, candles: [], signal: null, enhanced: null, indicators: null, stale: true });
  return { btc: asset(), xau: asset(), connected: false, loading: true, error: null, data };
}

export function useBrowserAnalysis() {
  const [snapshot, setSnapshot] = useState<BrowserRuntimeSnapshot>(initialSnapshot);
  const [ready, setReady] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [persistent, setPersistent] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [temporary, setTemporary] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const storeRef = useRef<BrowserStore | null>(null);
  const runtimeRef = useRef<ReturnType<typeof createBrowserRuntime> | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);

  const startRuntime = useCallback((store: BrowserStore) => {
    const current = ++generation.current;
    runtimeRef.current?.stop();
    const runtime = createBrowserRuntime(store, value => {
      if (mounted.current && generation.current === current) setSnapshot(value);
    });
    runtimeRef.current = runtime;
    runtime.start();
  }, []);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    setReady(false);
    setHistoryLoaded(false);
    setStorageError(null);
    setSnapshot(initialSnapshot());
    void (async () => {
      let store: BrowserStore;
      try {
        store = temporary ? createMemoryBrowserStore() : await openBrowserStore();
      } catch (error) {
        if (!cancelled) setStorageError(error instanceof Error ? error.message : "This browser could not open local history.");
        return;
      }
      if (cancelled) { store.close(); return; }
      storeRef.current = store;
      setPersistent(store.persistent);
      setReady(true);
      try {
        const data = await store.read();
        if (cancelled) return;
        setSnapshot(initialSnapshot(data));
        setHistoryLoaded(true);
        startRuntime(store);
      } catch (error) {
        if (!cancelled) setStorageError(error instanceof Error ? error.message : "Local history could not be read. Import a valid backup to restore it.");
      }
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
      generation.current++;
      runtimeRef.current?.stop();
      runtimeRef.current = null;
      storeRef.current?.close();
      storeRef.current = null;
    };
  }, [startRuntime, temporary, attempt]);

  const refresh = useCallback(async () => { await runtimeRef.current?.refresh(); }, []);
  const exportBackup = useCallback(async () => {
    if (!storeRef.current) throw new Error("Local history is still loading.");
    return serializeBackup(await storeRef.current.read());
  }, []);
  const restoreBackup = useCallback(async (data: BrowserData) => {
    const store = storeRef.current;
    if (!store) throw new Error("Local history is still loading.");
    const restoreGeneration = ++generation.current;
    runtimeRef.current?.stop();
    try {
      const saved = await store.replace(data);
      if (mounted.current && generation.current === restoreGeneration && storeRef.current === store) {
        setStorageError(null);
        setHistoryLoaded(true);
        setSnapshot(initialSnapshot(saved));
      }
    } finally {
      if (mounted.current && generation.current === restoreGeneration && storeRef.current === store) startRuntime(store);
    }
  }, [startRuntime]);

  const retryStorage = useCallback(() => { setTemporary(false); setAttempt(value => value + 1); }, []);
  const continueTemporarily = useCallback(() => setTemporary(true), []);
  const storageWarning = temporary ? "History is temporary and will be lost when this page closes. Export a backup to keep it." : null;
  return { ...snapshot, ready, historyLoaded, persistent, storageWarning, storageError, retryStorage, continueTemporarily, refresh, exportBackup, restoreBackup };
}
