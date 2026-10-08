"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, AlertTriangle, X } from "lucide-react";
import { createNotificationTimer } from "@/lib/notificationTimer";

type Notification = { title: string; description: string; kind: "success" | "error" };
type Notice = Notification & { id: number; trigger: HTMLElement | null };
const NotificationContext = createContext<((notice: Notification) => void) | null>(null);
const LIFETIME = 4500;
const EXIT_DURATION = 180;

export function useNotification() {
  const notify = useContext(NotificationContext);
  if (!notify) throw new Error("Notifications require NotificationProvider");
  return notify;
}

function Toast({ notice, remove }: { notice: Notice; remove: (id: number) => void }) {
  const [closing, setClosing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const timer = useRef<ReturnType<typeof createNotificationTimer> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const paused = hovered || focused || hidden;
  const dismiss = useCallback(() => setClosing(true), []);

  useEffect(() => {
    const onVisibilityChange = () => setHidden(document.hidden);
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    timer.current = createNotificationTimer(dismiss, LIFETIME);
    return () => {
      timer.current?.cancel();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [dismiss]);

  useEffect(() => {
    if (closing) timer.current?.cancel();
    else if (paused) timer.current?.pause();
    else timer.current?.resume();
  }, [paused, closing]);

  useEffect(() => {
    if (!closing) return;
    const timeout = setTimeout(() => remove(notice.id), EXIT_DURATION);
    return () => clearTimeout(timeout);
  }, [closing, notice.id, remove]);

  function closeFromControl() {
    if (container.current?.contains(document.activeElement) && notice.trigger?.isConnected) {
      notice.trigger.focus({ preventScroll: true });
    }
    dismiss();
  }

  return (
    <div ref={container} className="toast" data-kind={notice.kind} data-state={closing ? "closing" : "open"}
      data-paused={paused} style={{ "--toast-duration": `${LIFETIME}ms` } as CSSProperties}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }} onKeyDown={event => { if (event.key === "Escape") closeFromControl(); }}>
      <span className="toast-icon" aria-hidden="true">{notice.kind === "success" ? <Check size={18} /> : <AlertTriangle size={18} />}</span>
      <div className="toast-content"><p className="toast-title">{notice.title}</p><p className="toast-description">{notice.description}</p></div>
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={closeFromControl}><X size={16} aria-hidden="true" /></button>
      <span className="toast-progress" aria-hidden="true" />
    </div>
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [announcement, setAnnouncement] = useState<{ id: number; text: string } | null>(null);
  const sequence = useRef(0);
  const notify = useCallback((notification: Notification) => {
    const id = ++sequence.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotices(current => [{ ...notification, id, trigger }, ...current].slice(0, 3));
    setAnnouncement({ id, text: `${notification.title}. ${notification.description}` });
  }, []);
  const remove = useCallback((id: number) => setNotices(current => current.filter(notice => notice.id !== id)), []);

  return <NotificationContext.Provider value={notify}>
    {children}
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement && <span key={announcement.id}>{announcement.text}</span>}
    </div>
    <div className="toast-viewport" role="region" aria-label="Notifications">
      {notices.map(notice => <Toast key={notice.id} notice={notice} remove={remove} />)}
    </div>
  </NotificationContext.Provider>;
}
