"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { ChevronDown, Download, Upload, HardDrive } from "lucide-react";
import { parseBackup, type BrowserData } from "@/lib/browserStorage";
import { useNotification } from "./Notifications";

interface Props {
  ready: boolean;
  historyLoaded: boolean;
  persistent: boolean;
  count: number;
  exportBackup: () => Promise<string>;
  restoreBackup: (data: BrowserData) => Promise<void>;
}

export default function LocalDataPanel({ ready, historyLoaded, persistent, count, exportBackup, restoreBackup }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; data: BrowserData } | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const isExpanded = expanded || pending !== null;
  const status = !historyLoaded ? "Local history is not loaded" : persistent ? "Saved in this browser" : "Temporary history";
  const notify = useNotification();

  async function download() {
    setBusy(true);
    try {
      const text = await exportBackup();
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `signal-analyzer-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify({ title: "Backup exported", description: "Keep this file to restore your history on another browser or device.", kind: "success" });
    } catch (error) {
      notify({ title: "Could not export backup", description: error instanceof Error ? error.message : "Please try again.", kind: "error" });
    } finally { setBusy(false); }
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a backup smaller than 5 MB.");
      const data = parseBackup(await file.text());
      setPending({ name: file.name, data });
      setExpanded(true);
    } catch (error) {
      setPending(null);
      notify({ title: "Backup could not be read", description: error instanceof Error ? error.message : "Choose a SignalAnalyzer JSON backup.", kind: "error" });
    } finally { setBusy(false); }
  }

  async function restore() {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending.data);
      setPending(null);
      notify({ title: "History restored", description: "The backup is now the history for this browser. Market data is refreshing.", kind: "success" });
    } catch (error) {
      notify({ title: "Could not restore backup", description: error instanceof Error ? error.message : "Your saved history has not been replaced.", kind: "error" });
    } finally { setBusy(false); }
  }

  return <section className="local-data-panel" aria-label="Local history and backups" data-expanded={isExpanded} data-status={!historyLoaded ? "unloaded" : persistent ? "persistent" : "temporary"}>
    <button
      type="button"
      className="local-data-toggle"
      aria-expanded={isExpanded}
      aria-controls={bodyId}
      aria-disabled={pending !== null}
      aria-label={`${isExpanded ? "Hide" : "Show"} history and backup controls. ${status}`}
      onClick={() => { if (!pending) setExpanded(value => !value); }}
    >
      <HardDrive size={19} aria-hidden="true" />
      <span className="local-data-toggle-title">{status}</span>
      <ChevronDown size={18} className="local-data-toggle-chevron" aria-hidden="true" />
    </button>
    <div id={bodyId} className="local-data-body">
    <div className="local-data-copy">
      <HardDrive size={19} aria-hidden="true" />
      <div><h2>{status}</h2>
        <p>{historyLoaded ? `${count} saved signals. ` : ""}History and learning stay on this device. Tracking runs while the app is open.</p>
        <p className="local-data-note">Clearing site data removes history. Use a backup to move it to another browser or website address.</p>
      </div>
    </div>
    <div className="local-data-actions">
      <button className="app-control" type="button" onClick={download} disabled={!historyLoaded || busy}><Download size={14} aria-hidden="true" />Export backup</button>
      <button className="app-control" type="button" onClick={() => input.current?.click()} disabled={!ready || busy}><Upload size={14} aria-hidden="true" />Import backup</button>
      <input ref={input} className="sr-only" type="file" accept=".json,application/json" aria-label="Choose history backup" tabIndex={-1} onChange={selectFile} />
    </div>
    {pending && <div className="backup-preview" role="region" aria-label="Review backup import">
      <div><strong>Restore {pending.data.history.entries.length} signals from {pending.name}?</strong>
        <p>This replaces this browser&apos;s current history and learning data. Export the current history first if you want to keep it.</p></div>
      <div className="local-data-actions"><button type="button" className="app-control" onClick={() => setPending(null)} disabled={busy}>Cancel</button>
        <button type="button" className="app-control backup-restore" onClick={restore} disabled={busy}>{busy ? "Restoring…" : "Replace local history"}</button></div>
    </div>}
    </div>
  </section>;
}
