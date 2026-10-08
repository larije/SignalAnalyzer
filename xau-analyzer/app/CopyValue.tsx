"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Copy, AlertTriangle, LoaderCircle } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import { useNotification } from "./Notifications";

type CopyState = "idle" | "copying" | "copied" | "error";

export default function CopyValue({ label, copyText, displayValue, color, compact = false, contextLabel }: {
  label: string; copyText: string | null; displayValue: string; color: string; compact?: boolean; contextLabel?: string;
}) {
  const notify = useNotification();
  const [state, setState] = useState<CopyState>("idle");
  const generation = useRef(0);
  const pending = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    generation.current++;
    pending.current = false;
    setState("idle");
    return () => {
      generation.current++;
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, [copyText]);

  async function copy() {
    if (copyText === null || pending.current) return;
    pending.current = true;
    const request = generation.current;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setState("copying");
    let nextState: CopyState;
    try {
      await copyToClipboard(copyText);
      nextState = "copied";
      notify({ kind: "success", title: `${label} copied`, description: `${contextLabel ? `${contextLabel} · ` : ""}${copyText}` });
    } catch {
      nextState = "error";
      notify({ kind: "error", title: "Could not copy", description: `Allow clipboard access and tap ${label.toLowerCase()} again.` });
    }
    if (generation.current !== request) return;
    pending.current = false;
    setState(nextState);
    resetTimer.current = setTimeout(() => setState("idle"), 2000);
  }

  const Icon = state === "copied" ? Check : state === "error" ? AlertTriangle : state === "copying" ? LoaderCircle : Copy;
  const hint = copyText === null ? "Unavailable" : state === "copied" ? "Copied" : state === "error" ? "Tap to retry" : state === "copying" ? "Copying…" : "Tap to copy";

  return <button type="button" className={`copy-value copy-value--${compact ? "compact" : "price"}`} data-state={state}
    style={{ "--copy-color": color } as CSSProperties} onClick={copy}
    disabled={copyText === null} aria-busy={state === "copying"}
    aria-label={copyText === null ? `${label} unavailable` : `Copy ${contextLabel ? `${contextLabel} ` : ""}${label.toLowerCase()}: ${copyText}`}
    title={copyText === null ? `${label} unavailable` : `Copy ${label.toLowerCase()}`}>
    <span className="copy-value-label">{label}</span>
    <span className="copy-value-main"><span className="copy-value-text">{copyText === null ? "—" : displayValue}</span><span className="copy-value-icon" aria-hidden="true"><Icon size={15} /></span></span>
    <span className="copy-value-hint" aria-hidden="true">{hint}</span>
  </button>;
}
