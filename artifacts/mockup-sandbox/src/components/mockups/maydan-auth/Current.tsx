import { useState } from "react";
import "./_group.css";
import { LogoIcon } from "./_LogoIcon";

type AuthView = "login" | "signup" | "forgot";

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
    <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);
const AppleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="white">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

export function Current() {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [username, setUsername] = useState("");
  const [showPass, setShowPass] = useState(false);

  const inputCls = "w-full h-12 rounded-xl border border-border bg-card/60 px-4 text-sm text-right text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition";

  return (
    <div className="maydan-root min-h-screen gradient-hero star-bg flex flex-col items-center justify-center p-5 text-center">
      <div className="gold-glow mb-4 mx-auto w-fit rounded-3xl">
        <LogoIcon size={96} />
      </div>
      <h1 className="text-4xl font-black text-primary">ميدان</h1>
      <p className="text-secondary font-semibold mt-0.5 mb-6 text-sm">ساحة المعرفة العربية</p>

      <div className="w-full max-w-xs">
        {view === "login" && (
          <div className="space-y-3">
            <div className="flex rounded-xl border border-border overflow-hidden mb-1">
              <button onClick={() => setView("login")} className="flex-1 py-2 text-sm font-bold gradient-gold text-background">تسجيل الدخول</button>
              <button onClick={() => setView("signup")} className="flex-1 py-2 text-sm font-bold text-muted-foreground">حساب جديد</button>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="space-y-2.5">
              <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} dir="ltr" />
              <div className="relative">
                <input type={showPass ? "text" : "password"} placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls + " pl-10"} dir="ltr" />
                <button type="button" onClick={() => setShowPass(p => !p)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{showPass ? "إخفاء" : "إظهار"}</button>
              </div>
              <button type="button" onClick={() => setView("forgot")} className="text-xs text-primary/80 text-right w-full block">نسيت كلمة المرور؟</button>
              <button type="submit" className="w-full h-12 rounded-xl gradient-gold text-background font-bold text-sm">تسجيل الدخول</button>
            </form>

            <div className="flex items-center gap-2 text-muted-foreground text-xs py-1">
              <div className="flex-1 h-px bg-border/60" /><span>أو سجّل بـ</span><div className="flex-1 h-px bg-border/60" />
            </div>

            <div className="flex gap-2">
              <button className="flex-1 h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-white text-sm" style={{ background: "linear-gradient(135deg,#4285F4,#2563eb)" }}>
                <GoogleIcon /><span>Google</span>
              </button>
              <button className="flex-1 h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-white text-sm" style={{ background: "#000" }}>
                <AppleIcon /><span>Apple</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <div className="flex-1 h-px bg-border/60" /><span>أو</span><div className="flex-1 h-px bg-border/60" />
            </div>

            <button className="w-full h-11 rounded-xl border border-border text-foreground font-bold bg-card/70 text-sm">👤 العب كضيف</button>
          </div>
        )}

        {view === "signup" && (
          <div className="space-y-3">
            <div className="flex rounded-xl border border-border overflow-hidden mb-1">
              <button onClick={() => setView("login")} className="flex-1 py-2 text-sm font-bold text-muted-foreground">تسجيل الدخول</button>
              <button onClick={() => setView("signup")} className="flex-1 py-2 text-sm font-bold gradient-gold text-background">حساب جديد</button>
            </div>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-2.5">
              <input type="text" placeholder="الاسم المستعار (يظهر في اللوحة)" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} maxLength={20} />
              <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} dir="ltr" />
              <input type={showPass ? "text" : "password"} placeholder="كلمة المرور (6 أحرف على الأقل)" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} dir="ltr" />
              <input type={showPass ? "text" : "password"} placeholder="تأكيد كلمة المرور" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} className={inputCls} dir="ltr" />
              <button type="submit" className="w-full h-12 rounded-xl gradient-gold text-background font-bold text-sm">إنشاء الحساب</button>
            </form>
          </div>
        )}

        {view === "forgot" && (
          <div className="space-y-3">
            <button onClick={() => setView("login")} className="flex items-center gap-1 text-muted-foreground text-sm mb-2">← العودة</button>
            <p className="font-bold text-foreground text-base mb-1">إعادة تعيين كلمة المرور</p>
            <p className="text-muted-foreground text-xs leading-relaxed mb-3">أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.</p>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
              <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} dir="ltr" />
              <button type="submit" className="w-full h-12 rounded-xl gradient-gold text-background font-bold text-sm">إرسال رابط إعادة التعيين</button>
            </form>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-2 mt-7">
        {["تحدي الأصدقاء", "لوحة المتصدرين"].map(f => (
          <span key={f} className="bg-card/50 border border-border text-muted-foreground text-xs px-3 py-1.5 rounded-full">{f}</span>
        ))}
      </div>
    </div>
  );
}
