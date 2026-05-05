import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { isSoundEnabled, toggleSound, playSound } from "@/lib/sound";
import { NOTIF_TYPES, getNotifPrefs, setNotifPref, type NotifType } from "@/lib/notifications";
import { ArrowRight, User, Bell, Volume2, VolumeX, LogOut, Trash2, Globe, Moon } from "lucide-react";

export default function Settings() {
  const [, navigate] = useLocation();
  const { dbUser, isGuest, signOut } = useAuth();

  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [notifPrefs, setNotifPrefsState] = useState<Record<NotifType, boolean>>(() => getNotifPrefs());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function handleSoundToggle() {
    const next = toggleSound();
    setSoundOn(next);
    if (next) playSound("correct");
  }

  function toggleNotif(type: NotifType) {
    const next = !notifPrefs[type];
    setNotifPref(type, next);
    setNotifPrefsState((prev) => ({ ...prev, [type]: next }));
  }

  async function handleDeleteAccount() {
    if (!dbUser?.id || isGuest) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const { error } = await supabase.from("users").delete().eq("id", dbUser.id);
      if (error) throw error;
      // Wipe local data and sign out
      try { localStorage.clear(); } catch {}
      await signOut();
      navigate("/");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "تعذّر حذف الحساب");
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen gradient-hero">
      <div className="rp-narrow">
        <header className="p-4 flex items-center gap-3 border-b border-border/30 sticky top-0 bg-background/95 backdrop-blur z-10">
          <button onClick={() => navigate("/profile")} className="text-muted-foreground hover:text-foreground">
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">الإعدادات ⚙️</h1>
        </header>

        <div className="p-4 space-y-4 pb-24">
          {/* Profile shortcuts */}
          <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-2">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <User className="w-4 h-4 text-primary" /> الحساب
            </h3>
            <button
              onClick={() => navigate("/profile")}
              className="w-full text-right text-sm py-2.5 px-3 rounded-xl border border-border/30 hover:border-primary/40 transition-colors"
            >
              تعديل الملف الشخصي (الاسم، البلد، النبذة، الفئات المفضلة) ←
            </button>
            {!isGuest && dbUser?.id && (
              <button
                onClick={() => navigate(`/profile/${dbUser.id}`)}
                className="w-full text-right text-sm py-2.5 px-3 rounded-xl border border-border/30 hover:border-primary/40 transition-colors"
              >
                عرض ملفي العام ←
              </button>
            )}
          </div>

          {/* Notifications */}
          {!isGuest && (
            <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-primary" /> الإشعارات
              </h3>
              <div className="space-y-1.5">
                {NOTIF_TYPES.map(({ type, icon, label }) => {
                  const enabled = notifPrefs[type] !== false;
                  return (
                    <button
                      key={type}
                      onClick={() => toggleNotif(type)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border/30 bg-background hover:border-primary/40 transition-colors text-right"
                    >
                      <span className="text-lg shrink-0">{icon}</span>
                      <span className="flex-1 text-sm font-bold">{label}</span>
                      <div
                        className="w-10 h-6 rounded-full p-0.5 transition-colors shrink-0"
                        style={{
                          background: enabled
                            ? "linear-gradient(135deg,#d97706,#f59e0b)"
                            : "rgba(255,255,255,0.1)",
                        }}
                        role="switch"
                        aria-checked={enabled}
                      >
                        <div
                          className="w-5 h-5 rounded-full bg-white shadow transition-transform"
                          style={{
                            transform: enabled ? "translateX(-16px)" : "translateX(0)",
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sound + Theme + Language */}
          <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
            <h3 className="font-bold text-sm">التطبيق</h3>
            <button
              onClick={handleSoundToggle}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border/30 bg-background hover:border-primary/40 transition-colors text-right"
            >
              {soundOn ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
              <span className="flex-1 text-sm font-bold">الصوت</span>
              <span className="text-xs text-muted-foreground">{soundOn ? "مفعّل" : "موقوف"}</span>
            </button>
            <div className="flex items-center gap-3 p-2.5 rounded-xl border border-border/30 bg-background opacity-70">
              <Moon className="w-4 h-4 text-muted-foreground" />
              <span className="flex-1 text-sm font-bold">الوضع الليلي</span>
              <span className="text-xs text-muted-foreground">دائماً (افتراضي)</span>
            </div>
            <div className="flex items-center gap-3 p-2.5 rounded-xl border border-border/30 bg-background opacity-70">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span className="flex-1 text-sm font-bold">اللغة</span>
              <span className="text-xs text-muted-foreground">العربية</span>
            </div>
          </div>

          {/* Account actions */}
          {!isGuest && (
            <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-2">
              <button
                onClick={async () => { await signOut(); navigate("/"); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-bold hover:bg-card/80 transition-colors"
              >
                <LogOut className="w-4 h-4" /> تسجيل الخروج
              </button>
            </div>
          )}

          {/* Danger zone */}
          {!isGuest && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
              <h3 className="font-bold text-sm text-red-400 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" /> منطقة الخطر
              </h3>
              <p className="text-xs text-muted-foreground">
                حذف حسابك يمسح جميع بياناتك (التحديات، الإحصائيات، الأصدقاء) نهائياً ولا يمكن التراجع.
              </p>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-2.5 rounded-xl border border-red-500/40 text-red-400 font-bold text-sm hover:bg-red-500/10 transition-colors"
                >
                  حذف الحساب
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-red-400 text-center">
                    هل أنت متأكد؟ لا يمكن التراجع.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50"
                    >
                      {deleting ? "جاري الحذف..." : "نعم، احذف"}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-card/80"
                    >
                      إلغاء
                    </button>
                  </div>
                  {deleteError && (
                    <p className="text-xs text-red-400 text-center">{deleteError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
