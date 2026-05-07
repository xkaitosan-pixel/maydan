import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import {
  FRAMES, TITLES, POWER_CARD_ITEMS,
  parseAchievementsData, purchaseItem,
} from "@/lib/gamification";

type Tab = "frames" | "titles" | "power_cards";

export default function Store() {
  const [, navigate] = useLocation();
  const { dbUser, refreshUser } = useAuth();
  const [tab, setTab] = useState<Tab>("frames");
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  if (!dbUser) return null;

  const aData    = parseAchievementsData(dbUser.achievements);
  const coins    = dbUser.coins ?? 0;
  const frame    = aData.avatar_frame;
  const title    = dbUser.rank_title ?? null;
  const powerBag = aData.power_cards_store;

  async function buy(itemType: Parameters<typeof purchaseItem>[1], itemId: string, cost: number) {
    if (!dbUser || buying) return;
    setBuying(itemId);
    try {
      const result = await purchaseItem(dbUser.id, itemType, itemId, cost, coins, dbUser.achievements);
      setMessage({ text: result.message, ok: result.success });
      if (result.success) await refreshUser();
    } catch {
      setMessage({ text: "حدث خطأ، حاول مجدداً", ok: false });
    } finally {
      setBuying(null);
      setTimeout(() => setMessage(null), 2500);
    }
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "frames",      label: "الإطارات",    icon: "🖼️" },
    { key: "titles",      label: "الألقاب",     icon: "📛" },
    { key: "power_cards", label: "بطاقات القوة", icon: "🃏" },
  ];

  return (
    <div className="min-h-screen gradient-hero star-bg flex flex-col">
      {/* Toast */}
      {message && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-full px-6 py-3 font-bold text-sm text-white shadow-xl transition-all ${
            message.ok ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Header */}
      <header className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-border/30">
        <button onClick={() => navigate("/")} className="text-muted-foreground text-xl hover:text-foreground transition-colors">←</button>
        <h1 className="text-lg font-black text-foreground flex-1">🛍️ المتجر</h1>
        <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3 py-1.5">
          <span className="text-base">🪙</span>
          <span className="text-sm font-black text-yellow-400">{coins.toLocaleString()}</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 p-3 border-b border-border/30">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              tab === t.key
                ? "text-background"
                : "text-muted-foreground bg-card border border-border hover:text-foreground"
            }`}
            style={tab === t.key ? { background: "linear-gradient(135deg,#d97706,#f59e0b)" } : {}}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* FRAMES TAB */}
        {tab === "frames" && FRAMES.map((f) => {
          const owned   = frame === f.id;
          const canAfford = coins >= f.cost;
          return (
            <div
              key={f.id}
              className="rounded-2xl p-4 border border-white/10 flex items-center gap-4"
              style={{ background: "hsl(220 20% 12%)" }}
            >
              {/* Preview avatar */}
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl flex-shrink-0 ${f.className ?? ""}`}
                style={{ border: f.border, boxShadow: f.shadow, background: "hsl(220 20% 18%)" }}
              >
                👤
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-white">{f.name}</p>
                {f.premium ? (
                  <p className="text-xs text-yellow-400 mt-0.5">👑 للأعضاء المميزين فقط</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">🪙 {f.cost} قرش</p>
                )}
              </div>
              {f.premium ? (
                <button
                  onClick={() => navigate("/premium")}
                  className="text-xs px-3 py-2 rounded-xl font-bold border border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 transition-all"
                >
                  برو 👑
                </button>
              ) : owned ? (
                <span className="text-xs px-3 py-2 rounded-xl font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                  مفعّل ✓
                </span>
              ) : (
                <button
                  onClick={() => buy("frame", f.id, f.cost)}
                  disabled={!canAfford || buying === f.id}
                  className={`text-xs px-3 py-2 rounded-xl font-bold transition-all ${
                    canAfford
                      ? "text-background hover:opacity-90"
                      : "bg-white/5 text-muted-foreground border border-white/10 cursor-not-allowed"
                  }`}
                  style={canAfford ? { background: "linear-gradient(135deg,#d97706,#f59e0b)" } : {}}
                >
                  {buying === f.id ? "⌛" : "شراء"}
                </button>
              )}
            </div>
          );
        })}

        {/* TITLES TAB */}
        {tab === "titles" && TITLES.map((t) => {
          const owned     = title === t.name;
          const canAfford = coins >= t.cost;
          return (
            <div
              key={t.id}
              className="rounded-2xl p-4 border border-white/10 flex items-center gap-4"
              style={{ background: "hsl(220 20% 12%)" }}
            >
              <div
                className="flex-1 px-3 py-2 rounded-xl border border-purple-500/20 text-center"
                style={{ background: "rgba(139,92,246,0.08)" }}
              >
                <p className="text-sm font-black text-purple-300">{t.name}</p>
              </div>
              <p className="text-xs text-muted-foreground">🪙 {t.cost}</p>
              {owned ? (
                <span className="text-xs px-3 py-2 rounded-xl font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                  مفعّل ✓
                </span>
              ) : (
                <button
                  onClick={() => buy("title", t.id, t.cost)}
                  disabled={!canAfford || buying === t.id}
                  className={`text-xs px-3 py-2 rounded-xl font-bold transition-all ${
                    canAfford
                      ? "text-background hover:opacity-90"
                      : "bg-white/5 text-muted-foreground border border-white/10 cursor-not-allowed"
                  }`}
                  style={canAfford ? { background: "linear-gradient(135deg,#d97706,#f59e0b)" } : {}}
                >
                  {buying === t.id ? "⌛" : "شراء"}
                </button>
              )}
            </div>
          );
        })}

        {/* POWER CARDS TAB */}
        {tab === "power_cards" && (
          <>
            <div className="rounded-2xl p-3 border border-blue-500/20 bg-blue-500/5 text-center text-xs text-blue-300">
              🃏 تُضاف البطاقات لبطاقاتك في وضع البقاء والتحديات
            </div>
            {POWER_CARD_ITEMS.map((card) => {
              const owned     = powerBag[card.id] ?? 0;
              const canAfford = coins >= card.cost;
              return (
                <div
                  key={card.id}
                  className="rounded-2xl p-4 border border-white/10 flex items-center gap-4"
                  style={{ background: "hsl(220 20% 12%)" }}
                >
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl border border-white/10 flex-shrink-0"
                    style={{ background: "hsl(220 20% 18%)" }}
                  >
                    {card.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-white">{card.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">🪙 {card.cost} • لديك: {owned}</p>
                  </div>
                  <button
                    onClick={() => buy("power_card", card.id, card.cost)}
                    disabled={!canAfford || buying === card.id}
                    className={`text-xs px-3 py-2 rounded-xl font-bold transition-all ${
                      canAfford
                        ? "text-background hover:opacity-90"
                        : "bg-white/5 text-muted-foreground border border-white/10 cursor-not-allowed"
                    }`}
                    style={canAfford ? { background: "linear-gradient(135deg,#d97706,#f59e0b)" } : {}}
                  >
                    {buying === card.id ? "⌛" : "+1"}
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
