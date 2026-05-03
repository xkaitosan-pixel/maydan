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
  challenge: "⚔️ تحدي",
  survival: "🏃 وضع البقاء",
  ranked: "🏆 المتصدرون",
  daily: "📅 تحدي اليوم",
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
      backgroundColor: "#0D0D1A",
      scale: 2,
      useCORS: true,
      allowTaint: false,
      foreignObjectRendering: false,
      logging: false,
      imageTimeout: 4000,
    } as const;
    const canvas = await html2canvas(cardRef.current!, opts);
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

      // Try Web Share API first (mobile)
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
          // User cancelled or share failed — fall through to download
          if ((shareErr as Error)?.name === "AbortError") return;
          console.warn("[ShareCard] Web Share failed, falling back to download", shareErr);
        }
      }

      // Desktop / unsupported: download
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
      {/* ── Capturable card (400x300 logical, scaled by html2canvas) ── */}
      <div
        ref={cardRef}
        dir="rtl"
        className="mx-auto rounded-2xl overflow-hidden border-2 relative"
        style={{
          width: 400,
          maxWidth: "100%",
          minHeight: 300,
          background:
            "linear-gradient(135deg, #1a0b2e 0%, #0D0D1A 50%, #2a1810 100%)",
          borderColor: "rgba(217,119,6,0.45)",
          boxShadow:
            "0 10px 40px rgba(124,58,237,0.25), 0 0 0 1px rgba(217,119,6,0.15) inset",
          padding: 18,
          color: "#f5f5f5",
          fontFamily:
            "'Tajawal', 'Cairo', system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Decorative gradient blob */}
        <div
          style={{
            position: "absolute",
            top: -40,
            left: -40,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(217,119,6,0.35), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -50,
            right: -50,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(124,58,237,0.3), transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
            position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>⚔️</span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: "#f59e0b",
                letterSpacing: "-0.02em",
              }}
            >
              ميدان
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#c4b5fd",
              background: "rgba(124,58,237,0.18)",
              border: "1px solid rgba(124,58,237,0.4)",
              borderRadius: 999,
              padding: "3px 10px",
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
            marginBottom: 12,
            position: "relative",
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
                borderRadius: "50%",
                border: "2px solid #f59e0b",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg,#7c3aed,#d97706)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 900,
                color: "#fff",
                border: "2px solid #f59e0b",
              }}
            >
              {(playerName || "م").charAt(0)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: "#fff",
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
              <span style={{ fontSize: 18, lineHeight: 1 }}>{flag}</span>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px 14px",
            position: "relative",
          }}
        >
          <Stat icon="🏆" label="النتيجة" value={`${score}/${total}`} valueColor="#f59e0b" />
          <Stat icon="⭐" label="XP مكتسب" value={`+${xpEarned}`} valueColor="#c4b5fd" />
          <Stat icon="🪙" label="قروش" value={`+${coinsEarned}`} valueColor="#fbbf24" />
          <Stat icon="📊" label="الفئة" value={category} valueColor="#fff" small />
          <Stat
            icon={levelIcon}
            label="المستوى"
            value={level}
            valueColor="#a78bfa"
            colSpan={2}
          />
        </div>

        {/* Tagline + URL */}
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#fcd34d",
              margin: 0,
              fontStyle: "italic",
            }}
          >
            "تحداني إذا تجرأ! 😏"
          </p>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#94a3b8",
              letterSpacing: "0.04em",
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
  valueColor = "#fff",
  small = false,
  colSpan = 1,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
  small?: boolean;
  colSpan?: number;
}) {
  return (
    <div
      style={{
        gridColumn: colSpan === 2 ? "span 2" : undefined,
        display: "flex",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
      <span
        style={{
          fontSize: 12,
          color: "#cbd5e1",
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {label}:
      </span>
      <span
        style={{
          fontSize: small ? 12 : 14,
          fontWeight: 900,
          color: valueColor,
          marginInlineStart: "auto",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </span>
    </div>
  );
}
