import { useState } from "react";
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

// ── Direct Canvas image generator ────────────────────────────────────────────
// Avoids html2canvas (which mis-renders Arabic + can't load cross-origin
// avatars). Draws everything pixel-by-pixel onto an 800x560 canvas.
async function loadImage(url: string): Promise<HTMLImageElement | null> {
  try {
    // SVG endpoints (DiceBear, etc.) need to be fetched as blob to bypass
    // cross-origin canvas tainting in Safari.
    if (url.includes("dicebear") || url.endsWith(".svg")) {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(null);
        };
        img.src = objectUrl;
      });
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } catch {
    return null;
  }
}

interface DrawCardArgs {
  playerName: string;
  avatarUrl?: string | null;
  score: number;
  total: number;
  category: string;
  level: string;
}

async function drawCard(args: DrawCardArgs): Promise<HTMLCanvasElement> {
  const { playerName, avatarUrl, score, total, category, level } = args;
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 560;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Background
  ctx.fillStyle = "#0D0D1A";
  ctx.fillRect(0, 0, 800, 560);

  // Gold border
  ctx.strokeStyle = "#D4AF37";
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 780, 540);

  // Avatar
  if (avatarUrl) {
    const img = await loadImage(avatarUrl);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(400, 130, 60, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 340, 70, 120, 120);
      ctx.restore();
      ctx.strokeStyle = "#D4AF37";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(400, 130, 62, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Fallback colored circle with initial
      ctx.fillStyle = "#9333ea";
      ctx.beginPath();
      ctx.arc(400, 130, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 48px Arial";
      ctx.textAlign = "center";
      ctx.fillText((playerName || "?").charAt(0), 400, 148);
    }
  } else {
    ctx.fillStyle = "#9333ea";
    ctx.beginPath();
    ctx.arc(400, 130, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.fillText((playerName || "?").charAt(0), 400, 148);
  }

  // Centered text helper defaults
  ctx.textAlign = "center";

  // App name
  ctx.fillStyle = "#D4AF37";
  ctx.font = "bold 40px Arial";
  ctx.fillText("⚔️ MAYDAN", 400, 230);

  // Player name
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px Arial";
  ctx.fillText(playerName || "لاعب", 400, 275);

  // Score
  ctx.fillStyle = "#D4AF37";
  ctx.font = "bold 80px Arial";
  ctx.fillText(`${score}/${total}`, 400, 370);

  // Category
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "26px Arial";
  ctx.fillText(category || "", 400, 420);

  // Level
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "26px Arial";
  ctx.fillText(level || "", 400, 460);

  // Tagline
  ctx.fillStyle = "#9333ea";
  ctx.font = "bold 28px Arial";
  ctx.fillText("تحداني إذا تجرأ! 😏", 400, 505);

  // Website
  ctx.fillStyle = "#666666";
  ctx.font = "22px Arial";
  ctx.fillText("maydanapp.com", 400, 540);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}

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
  const [isCapturing, setIsCapturing] = useState(false);
  const flag = countryCode ? getCountryFlag(countryCode) : "";
  const modeLabel = MODE_LABEL[gameMode];

  const waMessage =
    `حصلت على ${score}/${total} في ميدان! 🏆\n` +
    `فئة: ${category}\n` +
    `مستواي: ${level}\n` +
    `تحداني إذا تجرأ 😏\n` +
    `👉 ${SITE_URL}`;

  // WhatsApp share = text + link only (no image attached)
  function shareWhatsApp() {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(waMessage)}`,
      "_blank",
    );
  }

  // Image share = render canvas → PNG → Web Share API or download
  async function shareImage() {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const canvas = await drawCard({
        playerName,
        avatarUrl,
        score,
        total,
        category,
        level,
      });
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

  // ── Visible HTML preview (NOT captured — Canvas above is the source of truth)
  return (
    <div className="space-y-3 fade-in-up">
      <div
        dir="rtl"
        className="mx-auto rounded-2xl overflow-hidden border-2 max-w-[400px]"
        style={{
          backgroundColor: "#0D0D1A",
          borderColor: "#D4AF37",
          padding: 16,
          color: "#FFFFFF",
          fontFamily: "Arial, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          textAlign: "center",
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              border: "3px solid #D4AF37",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: "#9333ea",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 900,
              color: "#FFFFFF",
              border: "3px solid #D4AF37",
            }}
          >
            {(playerName || "م").charAt(0)}
          </div>
        )}
        <p style={{ fontSize: 22, fontWeight: 900, color: "#D4AF37", margin: 0 }}>
          ⚔️ MAYDAN
        </p>
        <p style={{ fontSize: 18, fontWeight: 900, color: "#FFFFFF", margin: 0 }}>
          {playerName || "لاعب"} {flag}
        </p>
        <p style={{ fontSize: 44, fontWeight: 900, color: "#D4AF37", margin: "4px 0" }}>
          {score}/{total}
        </p>
        <p style={{ fontSize: 14, color: "#aaaaaa", margin: 0 }}>
          {category} · {modeLabel}
        </p>
        <p style={{ fontSize: 14, color: "#aaaaaa", margin: 0 }}>
          {levelIcon} {level}
        </p>
        {(xpEarned > 0 || coinsEarned > 0) && (
          <p style={{ fontSize: 12, color: "#A78BFA", margin: 0 }}>
            +{xpEarned} XP · +{coinsEarned} 🪙
          </p>
        )}
        <p style={{ fontSize: 14, fontWeight: 700, color: "#9333ea", margin: 0 }}>
          تحداني إذا تجرأ! 😏
        </p>
        <p style={{ fontSize: 11, color: "#666666", margin: 0 }}>{SITE_URL}</p>
      </div>

      {/* Action buttons (NOT captured) */}
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
          style={{ background: "linear-gradient(135deg,#7c3aed,#d97706)" }}
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
