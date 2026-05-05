import { useState, useEffect } from "react";
import { Play, Trophy, Users, Mail, X, ChevronRight } from "lucide-react";
import "./_group.css";
import { LogoIcon } from "./_LogoIcon";

type AuthView = "none" | "login" | "signup" | "forgot";

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

export function GameFirst() {
  const [authView, setAuthView] = useState<AuthView>("none");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [username, setUsername] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [timer, setTimer] = useState(15);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(t => (t > 0 ? t - 1 : 15));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const inputCls = "w-full h-12 rounded-xl border border-border bg-card/80 px-4 text-sm text-right text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition backdrop-blur-md";

  const renderAuthModal = () => {
    if (authView === "none") return null;

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4 pb-0 sm:pb-4 animate-in fade-in duration-200">
        <div className="w-full max-w-sm bg-card border border-border/50 shadow-2xl rounded-t-3xl sm:rounded-3xl p-6 relative animate-in slide-in-from-bottom-8 duration-300">
          <button 
            onClick={() => setAuthView("none")}
            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground transition-colors bg-background/50 rounded-full"
          >
            <X size={20} />
          </button>

          {authView === "login" && (
            <div className="space-y-4 pt-4">
              <h2 className="text-xl font-bold text-foreground">تسجيل الدخول</h2>
              <div className="flex rounded-xl border border-border overflow-hidden mb-2">
                <button onClick={() => setAuthView("login")} className="flex-1 py-2 text-sm font-bold gradient-gold text-background">الدخول</button>
                <button onClick={() => setAuthView("signup")} className="flex-1 py-2 text-sm font-bold text-muted-foreground bg-background/50">حساب جديد</button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); setAuthView("none"); }} className="space-y-3">
                <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} dir="ltr" />
                <div className="relative">
                  <input type={showPass ? "text" : "password"} placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls + " pl-10"} dir="ltr" />
                  <button type="button" onClick={() => setShowPass(p => !p)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs hover:text-foreground">{showPass ? "إخفاء" : "إظهار"}</button>
                </div>
                <button type="button" onClick={() => setAuthView("forgot")} className="text-xs text-primary hover:text-primary/80 text-right w-full block transition-colors">نسيت كلمة المرور؟</button>
                <button type="submit" className="w-full h-12 rounded-xl gradient-gold text-background font-bold text-sm shadow-[0_0_15px_rgba(234,179,8,0.3)] hover:shadow-[0_0_20px_rgba(234,179,8,0.5)] transition-all">دخول</button>
              </form>
            </div>
          )}

          {authView === "signup" && (
            <div className="space-y-4 pt-4">
              <h2 className="text-xl font-bold text-foreground">إنشاء حساب</h2>
              <div className="flex rounded-xl border border-border overflow-hidden mb-2">
                <button onClick={() => setAuthView("login")} className="flex-1 py-2 text-sm font-bold text-muted-foreground bg-background/50">الدخول</button>
                <button onClick={() => setAuthView("signup")} className="flex-1 py-2 text-sm font-bold gradient-gold text-background">حساب جديد</button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); setAuthView("none"); }} className="space-y-3">
                <input type="text" placeholder="الاسم المستعار" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
                <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} dir="ltr" />
                <input type={showPass ? "text" : "password"} placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} dir="ltr" />
                <button type="submit" className="w-full h-12 rounded-xl gradient-gold text-background font-bold text-sm shadow-[0_0_15px_rgba(234,179,8,0.3)] hover:shadow-[0_0_20px_rgba(234,179,8,0.5)] transition-all">إنشاء حساب</button>
              </form>
            </div>
          )}

          {authView === "forgot" && (
            <div className="space-y-4 pt-4">
              <button onClick={() => setAuthView("login")} className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground transition-colors mb-2">
                <ChevronRight size={16} /> العودة
              </button>
              <h2 className="text-xl font-bold text-foreground">إعادة تعيين المرور</h2>
              <p className="text-muted-foreground text-sm">أدخل بريدك الإلكتروني لتلقي رابط إعادة التعيين.</p>
              <form onSubmit={(e) => { e.preventDefault(); setAuthView("login"); }} className="space-y-3 pt-2">
                <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} dir="ltr" />
                <button type="submit" className="w-full h-12 rounded-xl gradient-gold text-background font-bold text-sm shadow-[0_0_15px_rgba(234,179,8,0.3)]">إرسال الرابط</button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="maydan-root min-h-screen gradient-hero star-bg flex flex-col relative overflow-x-hidden">
      
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 pt-12 pb-8 z-10">
        <div className="gold-glow mb-6 mx-auto w-fit rounded-3xl transform scale-110">
          <LogoIcon size={80} />
        </div>
        
        <h1 className="text-5xl font-black text-primary tracking-tight mb-2 drop-shadow-md">ميدان</h1>
        <p className="text-foreground/80 font-medium mb-8 text-lg">اختبر معلوماتك وتحدى أصدقاءك</p>

        {/* Primary CTA - Guest Play */}
        <button 
          className="w-full max-w-sm h-16 rounded-2xl gradient-gold text-background font-black text-xl flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(234,179,8,0.4)] hover:shadow-[0_0_40px_rgba(234,179,8,0.6)] transform transition-all hover:scale-[1.02] active:scale-95"
          onClick={() => console.log("Play Guest")}
        >
          <Play size={24} fill="currentColor" />
          <span>ابدأ اللعب الآن</span>
        </button>

        {/* Social Proof Strip */}
        <div className="flex items-center gap-4 mt-6 text-sm font-medium bg-card/40 backdrop-blur-sm border border-border/50 py-2 px-5 rounded-full text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="text-orange-500">🔥</span> 12,847 لاعب اليوم</span>
          <span className="w-1 h-1 rounded-full bg-border"></span>
          <span className="flex items-center gap-1.5"><span className="text-yellow-400">⭐</span> 4.8/5</span>
        </div>
      </div>

      {/* Gameplay Teaser */}
      <div className="w-full px-4 mb-8 z-10">
        <div className="max-w-sm mx-auto bg-card/60 backdrop-blur-md border border-border/50 rounded-2xl p-5 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
          
          <div className="flex justify-between items-center mb-4 text-xs font-bold text-muted-foreground relative z-10">
            <span className="bg-background/50 px-2 py-1 rounded text-primary">جغرافيا</span>
            <div className="flex items-center gap-1.5 text-foreground">
              <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span className={timer <= 5 ? "text-red-400" : ""}>00:{timer.toString().padStart(2, '0')}</span>
            </div>
          </div>
          
          <h3 className="text-xl font-bold text-foreground mb-5 relative z-10 leading-snug">ما هي عاصمة المملكة المغربية؟</h3>
          
          <div className="grid grid-cols-2 gap-2 relative z-10">
            {["الدار البيضاء", "الرباط", "مراكش", "فاس"].map((ans, i) => (
              <div key={i} className={`p-3 rounded-xl text-sm font-semibold text-center transition-all duration-300 border
                ${i === 1 
                  ? "bg-primary/20 border-primary/50 text-primary shadow-[0_0_10px_rgba(234,179,8,0.2)] transform -translate-y-0.5" 
                  : "bg-background/40 border-border/50 text-foreground/80 hover:bg-background hover:border-border"}`}
              >
                {ans}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Categories Carousel */}
      <div className="w-full mb-10 overflow-hidden z-10">
        <div className="flex gap-2 px-4 overflow-x-auto pb-4 pt-2 snap-x scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {[
            { n: "تاريخ", e: "🏛️" }, 
            { n: "رياضة", e: "⚽" }, 
            { n: "علوم", e: "🔬" }, 
            { n: "أدب", e: "📚" }, 
            { n: "جغرافيا", e: "🌍" }, 
            { n: "فن", e: "🎨" }
          ].map((cat, i) => (
            <div key={i} className="snap-center shrink-0 bg-card/40 backdrop-blur-sm border border-border/50 rounded-2xl px-5 py-3 flex items-center gap-2 hover:bg-card/80 transition-colors whitespace-nowrap">
              <span className="text-xl">{cat.e}</span>
              <span className="font-bold text-sm text-foreground/90">{cat.n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Auth Section */}
      <div className="bg-card/90 backdrop-blur-xl border-t border-border p-6 rounded-t-[2.5rem] z-20 mt-auto relative shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-full p-2 text-primary shadow-lg">
          <Trophy size={20} />
        </div>
        
        <div className="text-center mb-5 mt-2">
          <h4 className="text-lg font-bold text-foreground mb-1">احفظ تقدمك وتنافس</h4>
          <p className="text-xs text-muted-foreground flex justify-center items-center gap-1.5">
            <span>احتفظ بالنقاط</span>
            <span className="w-1 h-1 rounded-full bg-border"></span>
            <span>لوحة المتصدرين</span>
          </p>
        </div>

        <div className="flex gap-3 justify-center max-w-sm mx-auto">
          <button className="flex-1 h-12 rounded-xl flex items-center justify-center bg-[#18181b] border border-border hover:bg-white/10 transition-colors" title="Google">
            <GoogleIcon />
          </button>
          <button className="flex-1 h-12 rounded-xl flex items-center justify-center bg-black border border-border hover:bg-white/10 transition-colors" title="Apple">
            <AppleIcon />
          </button>
          <button 
            onClick={() => setAuthView("login")}
            className="flex-1 h-12 rounded-xl flex items-center justify-center bg-card border border-border text-foreground hover:bg-border/50 transition-colors" 
            title="البريد الإلكتروني"
          >
            <Mail size={20} />
          </button>
        </div>
      </div>

      {renderAuthModal()}
      
      <style dangerouslySetInline={{__html: `
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}} />
    </div>
  );
}
