import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { sanitizeNickname } from "@/lib/sanitize";
import { friendlyErrorText } from "@/lib/errors";

const USERNAME_REGEX = /^[\u0600-\u06FF\w]{3,15}$/;

function sanitizeForUsername(name: string): string {
  const cleaned = name.replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, "").slice(0, 15);
  return cleaned.length >= 3 ? cleaned : "";
}

export default function UsernameSetup() {
  const { dbUser, setDbUser, googleDisplayName } = useAuth();
  const firstName = googleDisplayName.split(" ")[0] ?? "";
  const [username, setUsername] = useState(sanitizeForUsername(firstName));
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-check the pre-filled username on mount
  useEffect(() => {
    if (username && USERNAME_REGEX.test(username)) {
      setStatus("checking");
      debounceRef.current = setTimeout(async () => {
        const { data } = await supabase
          .from("users")
          .select("id")
          .eq("username", username)
          .neq("id", dbUser?.id ?? "")
          .maybeSingle();
        setStatus(data ? "taken" : "available");
      }, 400);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!username.trim()) { setStatus("idle"); return; }
    if (!USERNAME_REGEX.test(username)) { setStatus("invalid"); return; }
    setStatus("checking");
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("users")
        .select("id")
        .eq("username", username.trim())
        .neq("id", dbUser?.id ?? "")
        .maybeSingle();
      setStatus(data ? "taken" : "available");
    }, 600);
  }, [username, dbUser?.id]);

  async function handleSave() {
    if (status !== "available") return;
    setSaving(true);
    setError("");

    const { data, error: err } = await supabase
      .from("users")
      .update({ username: username.trim() })
      .eq("id", dbUser!.id)
      .select()
      .single();

    if (err || !data) {
      setError(friendlyErrorText(err));
      setSaving(false);
      return;
    }

    setDbUser(data);
  }

  const avatarUrl = dbUser?.avatar_url;

  return (
    <div className="min-h-screen gradient-hero flex flex-col items-center justify-center p-6">

      {/* Welcome hero */}
      <div className="mb-8 text-center">
        {avatarUrl ? (
          <div className="relative w-28 h-28 mx-auto mb-4">
            <img
              src={avatarUrl}
              alt="صورتك"
              className="w-28 h-28 rounded-full border-4 border-primary object-cover gold-glow"
            />
            <span className="absolute -bottom-1 -right-1 text-2xl">👑</span>
          </div>
        ) : (
          <div className="w-28 h-28 rounded-full gradient-gold flex items-center justify-center mx-auto gold-glow mb-4">
            <span className="text-5xl">👤</span>
          </div>
        )}

        {googleDisplayName ? (
          <>
            <h1 className="text-2xl font-black text-foreground mt-1">
              أهلاً {googleDisplayName}! 👑
            </h1>
            <p className="text-muted-foreground text-sm mt-1">مرحباً بك في ميدان 🎉</p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm mt-3">مرحباً بك في ميدان! 🎉</p>
        )}
      </div>

      <div className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-black text-foreground">اختر اسم المستخدم</h2>
          <p className="text-muted-foreground text-xs mt-1">بالعربي أو الإنجليزي، 3-15 حرف</p>
        </div>

        {/* Input */}
        <div className="relative">
          <input
            value={username}
            onChange={(e) => setUsername(sanitizeNickname(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            maxLength={15}
            placeholder="اسم المستخدم..."
            className="w-full h-14 bg-card border-2 rounded-2xl px-4 text-center text-lg font-bold text-foreground placeholder:text-muted-foreground outline-none transition-colors"
            style={{
              borderColor:
                status === "available" ? "#22c55e" :
                status === "taken" || status === "invalid" ? "#ef4444" :
                status === "checking" ? "hsl(var(--primary))" :
                "hsl(var(--border))",
              direction: "rtl",
            }}
            disabled={saving}
          />
          {status !== "idle" && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg">
              {status === "checking" && <span className="w-5 h-5 border-2 border-primary/40 border-t-primary rounded-full animate-spin inline-block" />}
              {status === "available" && "✅"}
              {status === "taken" && "❌"}
              {status === "invalid" && "⚠️"}
            </span>
          )}
        </div>

        <p className={`text-center text-sm min-h-[20px] ${
          status === "available" ? "text-green-400" :
          status === "taken" ? "text-red-400" :
          status === "invalid" ? "text-yellow-400" :
          "text-transparent"
        }`}>
          {status === "available" && "✓ الاسم متاح"}
          {status === "taken" && "✗ الاسم مأخوذ، جرّب آخر"}
          {status === "invalid" && "⚠️ 3-15 حرف عربي أو إنجليزي فقط"}
          {status === "checking" && "..."}
          {error && <span className="text-red-400">{error}</span>}
        </p>

        <button
          onClick={handleSave}
          disabled={status !== "available" || saving}
          className="w-full h-14 rounded-2xl font-black text-lg text-background transition-opacity disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)" }}
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              جاري الحفظ...
            </span>
          ) : "ادخل الميدان ⚔️"}
        </button>
      </div>
    </div>
  );
}
