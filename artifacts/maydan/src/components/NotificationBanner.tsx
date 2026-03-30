import { useState } from "react";
import { useLocation } from "wouter";
import { AppNotification } from "@/lib/storage";

interface Props {
  notifications: AppNotification[];
}

export default function NotificationBanner({ notifications }: Props) {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = notifications.filter(n => !dismissed.has(n.id));
  if (visible.length === 0) return null;

  const n = visible[0]; // show one at a time

  return (
    <div
      className="mx-4 mt-3 rounded-xl p-3 flex items-center gap-3 fade-in-up"
      style={{ background: `${n.color}18`, border: `1px solid ${n.color}35` }}
    >
      <span className="text-xl shrink-0">{n.icon}</span>
      <p className="flex-1 text-xs font-medium leading-tight" style={{ color: n.color }}>{n.message}</p>
      <div className="flex items-center gap-1.5 shrink-0">
        {n.cta && n.ctaRoute && (
          <button
            onClick={() => navigate(n.ctaRoute!)}
            className="text-xs font-bold px-2.5 py-1 rounded-lg text-white"
            style={{ backgroundColor: n.color }}
          >
            {n.cta}
          </button>
        )}
        <button
          onClick={() => setDismissed(prev => new Set([...prev, n.id]))}
          className="text-muted-foreground hover:text-foreground text-sm w-5 h-5 flex items-center justify-center"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
