import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { getCountryFlag } from "@/lib/countryUtils";

const SITE_URL = "maydanapp.com";

const WA_ICON = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export interface ShareCardProps {
  playerName: string;
  avatarUrl?: string | null;
  countryCode?: string | null;
  score: number;
  total: number;
  xpEarned?: number;
  coinsEarned?: number;
  category: string;
  level?: string;
  levelIcon?: string;
  gameMode: "challenge" | "survival" | "ranked" | "daily";
  onDismiss?: () => void;
}

const MODE_LABEL: Record<ShareCardProps["gameMode"], string> = {
  challenge: "تحدي",
  survival: "وضع البقاء",
  ranked: "المتصدرون",
  daily: "تحدي اليوم",
};

// Single source of truth — all colors are explicit hex literals so html2canvas
// never has to resolve a CSS variable.
const C = {
  bg: "#0D0D1A",
  panel: "#1A1A2E",
  text: "#FFFFFF",
  muted: "#B8B8C8",
  gold: "#D4AF37",
  goldStrong: "#F59E0B",
  purple: "#A78BFA",
};

export default function ShareCard({
  playerName,
  avatarUrl,
  countryCode,
  score,
  total,
  xpEarned = 0,
  coinsEarned = 0,
  category,
  level = "فارس",
  levelIcon = "⚔️",
  gameMode,
  onDismiss,
}: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const flag = countryCode ? getCountryFlag(countryCode) : "";
  const modeLabel = MODE_LABEL[gameMode];

  const waMessage =
    `حصلت على ${score}/${total} في ميدان! 🏆\n` +
    `فئة: ${category}\n` +
    `مستواي: ${level}\n` +
    `تحداني إذا تجرأ 😏\n` +
    `👉 ${SITE_URL}`;

  function shareWhatsApp() {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(waMessage)}`,
      "_blank",
    );
  }

  async function captureCanvas(): Promise<HTMLCanvasElement> {
    const opts = {
      backgroundColor: C.bg,
      scale: 3,
      useCORS: true,
      allowTaint: false,
      foreignObjectRendering: false,
      logging: false,
      imageTimeout: 4000,
      onclone: (doc: Document) => {
        // html2canvas can render Arabic correctly with Arial; custom webfonts
        // (Tajawal) often fail because the font face isn't fetched into the
        // cloned document. Force Arial + dir=rtl on every node.
        doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
          el.style.fontFamily = "Arial, sans-serif";
          el.style.direction = "rtl";
        });
      },
    } as const;
    const canvas = await html2canvas(cardRef.current!, opts as Parameters<typeof html2canvas>[1]);
    // Probe taint: if reading pixels throws, redo with avatars hidden
    try {
      canvas.getContext("2d")!.getImageData(0, 0, 1, 1);
      return canvas;
    } catch {
      const imgs = cardRef.current!.querySelectorAll("img");
      imgs.forEach((img) => (img.style.visibility = "hidden"));
      try {
        return await html2canvas(cardRef.current!, opts);
      } finally {
        imgs.forEach((img) => (img.style.visibility = ""));
      }
    }
  }

  function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("blob conversion failed"))),
        "image/png",
      );
    });
  }

  async function shareImage() {
    if (!cardRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const canvas = await captureCanvas();
      const blob = await canvasToBlob(canvas);
      const fileName = `maydan-${gameMode}-${score}-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (
        typeof nav.share === "function" &&
        typeof nav.canShare === "function" &&
        nav.canShare({ files: [file] })
      ) {
        try {
          await nav.share({
            files: [file],
            title: "ميدان — نتيجتي",
            text: waMessage,
          });
          return;
        } catch (shareErr) {
          if ((shareErr as Error)?.name === "AbortError") return;
          console.warn("[ShareCard] Web Share failed, falling back to download", shareErr);
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = fileName;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("[ShareCard] capture failed", err);
      alert("تعذّر حفظ الصورة. حاول مرة أخرى.");
    } finally {
      setIsCapturing(false);
    }
  }

  return (
    <div className="space-y-3 fade-in-up">
      {/* ── Capturable card: 400x280, all explicit colors, Arial via onclone ── */}
      <div
        ref={cardRef}
        dir="rtl"
        className="mx-auto rounded-2xl overflow-hidden border-2"
        style={{
          width: 400,
          height: 280,
          maxWidth: "100%",
          backgroundColor: C.bg,
          borderColor: C.gold,
          padding: 16,
          color: C.text,
          fontFamily: "Arial, sans-serif",
          direction: "rtl",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          boxSizing: "border-box",
        }}
      >
        {/* Top: brand + mode */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 22 }}>⚔️</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: C.goldStrong }}>
              ميدان
            </span>
          </div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: C.gold,
              backgroundColor: C.panel,
              borderRadius: 999,
              padding: "4px 10px",
            }}
          >
            {modeLabel}
          </span>
        </div>

        {/* Player row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              crossOrigin="anonymous"
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                border: `2px solid ${C.gold}`,
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: C.panel,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 19,
                fontWeight: 900,
                color: C.text,
                border: `2px solid ${C.gold}`,
              }}
            >
              {(playerName || "م").charAt(0)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: 19,
                fontWeight: 900,
                color: C.text,
                margin: 0,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {playerName || "لاعب ميدان"}
            </p>
            {flag && (
              <span style={{ fontSize: 17 }}>{flag}</span>
            )}
          </div>
          <div style={{ textAlign: "left" }}>
            <p
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: C.gold,
                margin: 0,
                lineHeight: 1,
              }}
            >
              {score}
            </p>
            <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
              من {total}
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div
          style={{
            backgroundColor: C.panel,
            borderRadius: 12,
            padding: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
          }}
        >
          <Stat icon="⭐" label="XP" value={`+${xpEarned}`} color={C.purple} />
          <Stat icon="🪙" label="قروش" value={`+${coinsEarned}`} color={C.gold} />
          <Stat icon={levelIcon} label={level} value={category} color={C.text} small />
        </div>

        {/* Tagline + URL */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "auto",
          }}
        >
          <p
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: C.gold,
              margin: 0,
            }}
          >
            تحداني إذا تجرأ! 😏
          </p>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: C.muted,
            }}
          >
            {SITE_URL}
          </span>
        </div>
      </div>

      {/* ── Action buttons (NOT captured) ── */}
      <div className="grid grid-cols-2 gap-2 max-w-[400px] mx-auto">
        <button
          onClick={shareWhatsApp}
          className="h-11 rounded-xl text-white font-bold flex items-center justify-center gap-2 text-sm hover:opacity-90 active:scale-[0.98] transition-all"
          style={{ backgroundColor: "#25D366" }}
        >
          {WA_ICON}
          شارك على واتساب 💬
        </button>
        <button
          onClick={shareImage}
          disabled={isCapturing}
          className="h-11 rounded-xl text-white font-bold flex items-center justify-center gap-2 text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg,#7c3aed,#d97706)",
          }}
        >
          {isCapturing ? "جارٍ الحفظ..." : "🖼️ شارك الصورة"}
        </button>
      </div>
      {onDismiss && (
        <div className="text-center">
          <button
            onClick={onDismiss}
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            تخطي
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  color = "#FFFFFF",
  small = false,
}: {
  icon: string;
  label: string;
  value: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        minWidth: 0,
        textAlign: "center",
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
      <span
        style={{
          fontSize: small ? 13 : 16,
          fontWeight: 900,
          color,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 10, color: "#B8B8C8", fontWeight: 600 }}>
        {label}
      </span>
    </div>
  );
}
