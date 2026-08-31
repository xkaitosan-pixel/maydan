import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { hapticTap } from "@/lib/haptics";
import {
  flushOfflineActions,
  getPendingOfflineActionCount,
  OFFLINE_QUEUE_EVENT,
} from "@/lib/offlineQueue";

const PROTECTED_GAME_PATHS = ["/quiz", "/survival", "/ranked", "/party/", "/daily", "/training"];

export default function PwaRuntime() {
  const [location] = useLocation();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(getPendingOfflineActionCount);
  const [reconnected, setReconnected] = useState(false);
  const wasOffline = useRef(!navigator.onLine);

  useEffect(() => {
    const updateQueue = () => setPending(getPendingOfflineActionCount());
    const handleOffline = () => {
      wasOffline.current = true;
      setOnline(false);
      setReconnected(false);
    };
    const handleOnline = () => {
      setOnline(true);
      if (wasOffline.current) setReconnected(true);
      wasOffline.current = false;
      void flushOfflineActions().then(updateQueue);
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener(OFFLINE_QUEUE_EVENT, updateQueue);
    if (navigator.onLine) void flushOfflineActions().then(updateQueue);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(OFFLINE_QUEUE_EVENT, updateQueue);
    };
  }, []);

  useEffect(() => {
    if (!reconnected) return;
    const timer = window.setTimeout(() => setReconnected(false), 3000);
    return () => window.clearTimeout(timer);
  }, [reconnected]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest("button, a, [role='button']")
        : null;
      if (target && !target.matches("[disabled], [aria-disabled='true'], [data-no-haptic]")) {
        hapticTap();
      }
    };
    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  useEffect(() => {
    const key = `maydan_scroll:${location}`;
    const saved = Number(sessionStorage.getItem(key)) || 0;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: "instant" }));
    return () => {
      cancelAnimationFrame(frame);
      sessionStorage.setItem(key, String(window.scrollY));
    };
  }, [location]);

  useEffect(() => {
    if (!PROTECTED_GAME_PATHS.some((prefix) => location.startsWith(prefix))) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [location]);

  if (online && !reconnected && pending === 0) return null;

  return (
    <div
      className={`pwa-network-banner ${online ? "is-online" : "is-offline"}`}
      role="status"
      aria-live="polite"
    >
      <span className="pwa-network-dot" />
      <span>
        {!online
          ? `أنت غير متصل${pending ? ` · ${pending} بانتظار المزامنة` : ""}`
          : pending
            ? `عاد الاتصال · جارٍ مزامنة ${pending}`
            : "عاد الاتصال وتمت المزامنة"}
      </span>
    </div>
  );
}