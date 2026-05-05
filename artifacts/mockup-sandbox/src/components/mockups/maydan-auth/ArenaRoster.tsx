import { useState } from "react";
import "./_group.css";
import { LogoIcon } from "./_LogoIcon";
import { Trophy, ChevronRight, User } from "lucide-react";

type AuthView = "roster" | "email" | "forgot";

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const AppleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

const FLAGS = ["🇸🇦", "🇦🇪", "🇪🇬", "🇯🇴", "🇲🇦", "🌍"];

export function ArenaRoster() {
  const [view, setView] = useState<AuthView>("roster");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [selectedFlag, setSelectedFlag] = useState("🇸🇦");

  const renderRoster = () => (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Player Card */}
      <div className="relative group">
        {/* Glow effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-br from-primary/50 to-purple-500/30 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
        
        <div className="relative bg-[#151720] border border-white/10 rounded-2xl p-5 shadow-2xl overflow-hidden">
          {/* Scanline overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:10px_10px] opacity-20 pointer-events-none mix-blend-overlay"></div>
          
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="text-xs font-black tracking-widest text-white/40 font-mono">#----</div>
            <div className="bg-primary/20 text-primary border border-primary/30 text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
              متحدي 🗡️
            </div>
          </div>

          <div className="space-y-4 relative z-10">
            <div>
              <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider mb-1 block">الدولة / المنطقة</label>
              <div className="flex gap-2 bg-black/40 p-1.5 rounded-lg border border-white/5 overflow-x-auto no-scrollbar">
                {FLAGS.map(flag => (
                  <button 
                    key={flag} 
                    onClick={() => setSelectedFlag(flag)}
                    className={`text-xl p-1 rounded-md transition-all ${selectedFlag === flag ? 'bg-primary/20 scale-110' : 'opacity-50 hover:opacity-100'}`}
                  >
                    {flag}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider mb-1 block">الاسم المستعار (اختياري)</label>
              <input 
                type="text" 
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                placeholder="أدخل اسم اللاعب..."
                className="w-full bg-black/50 border-b-2 border-white/10 focus:border-primary px-3 py-2 text-xl font-black text-white placeholder:text-white/20 outline-none transition-colors rounded-t-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main CTA */}
      <button onClick={() => setView("email")} className="w-full relative group mt-2">
        <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-xl blur opacity-40 group-hover:opacity-75 transition duration-200"></div>
        <div className="relative w-full bg-gradient-to-r from-primary to-[#d4af37] text-[#1a0d2e] h-14 rounded-xl flex items-center justify-center gap-2 font-black text-lg shadow-[0_0_20px_rgba(212,175,55,0.3)] border border-white/20">
          🗡️ انضم للميدان
        </div>
      </button>

      {/* Live Leaderboard Teaser */}
      <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-3 shadow-inner">
        <div className="flex items-center gap-2 mb-2 text-white/60 text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          اليوم في الميدان
        </div>
        <div className="space-y-2">
          {[
            { name: "أحمد", score: "2,450", flag: "🇸🇦", rank: 1, avatar: "🦅" },
            { name: "فاطمة", score: "2,100", flag: "🇪🇬", rank: 2, avatar: "👑" },
            { name: "يوسف", score: "1,980", flag: "🇦🇪", rank: 3, avatar: "⚡" },
          ].map(p => (
            <div key={p.rank} className="flex items-center justify-between bg-black/30 rounded-lg p-1.5 border border-white/5">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${p.rank === 1 ? 'bg-primary text-black' : 'bg-white/10 text-white/70'}`}>
                  {p.rank}
                </div>
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-sm">{p.avatar}</div>
                <span className="text-sm font-bold text-white/90">{p.name} {p.flag}</span>
              </div>
              <span className="text-xs font-mono font-bold text-primary mr-2">{p.score} 🏆</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Auth Row */}
      <div className="flex gap-3 justify-center mt-2">
        <button className="h-12 flex-1 rounded-xl bg-[#2a2d3a] border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
          <GoogleIcon />
        </button>
        <button className="h-12 flex-1 rounded-xl bg-[#2a2d3a] border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
          <AppleIcon />
        </button>
        <button className="h-12 flex-1 rounded-xl bg-[#2a2d3a] border border-white/10 flex items-center justify-center gap-1.5 text-white hover:bg-white/10 transition-colors text-sm font-bold">
          <User className="w-4 h-4" /> ضيف
        </button>
      </div>
    </div>
  );

  const renderEmailForm = () => (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300 w-full">
      <button onClick={() => setView("roster")} className="flex items-center gap-1 text-white/50 hover:text-white mb-2 self-start transition-colors">
        <ChevronRight className="w-5 h-5" />
        <span className="text-sm font-bold">العودة للبطاقة</span>
      </button>

      <div className="bg-[#151720] border border-white/10 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:10px_10px] opacity-20 pointer-events-none mix-blend-overlay"></div>
        
        <h2 className="text-xl font-black text-white mb-4 relative z-10">تسجيل الدخول / إنشاء حساب</h2>
        
        <form onSubmit={e => e.preventDefault()} className="space-y-4 relative z-10">
          <div>
            <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider mb-1 block">البريد الإلكتروني</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-primary outline-none transition-colors"
              dir="ltr"
            />
          </div>
          <div>
            <div className="flex justify-between items-end mb-1">
              <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider block">كلمة المرور</label>
              <button type="button" onClick={() => setView("forgot")} className="text-[10px] text-primary/80 hover:text-primary">نسيت؟</button>
            </div>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-primary outline-none transition-colors"
              dir="ltr"
            />
          </div>

          <button className="w-full bg-primary hover:bg-primary/90 text-black h-12 rounded-lg font-black text-sm transition-colors mt-2">
            متابعة ⚔️
          </button>
        </form>
      </div>
    </div>
  );

  const renderForgot = () => (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300 w-full">
      <button onClick={() => setView("email")} className="flex items-center gap-1 text-white/50 hover:text-white mb-2 self-start transition-colors">
        <ChevronRight className="w-5 h-5" />
        <span className="text-sm font-bold">العودة</span>
      </button>

      <div className="bg-[#151720] border border-white/10 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:10px_10px] opacity-20 pointer-events-none mix-blend-overlay"></div>
        
        <h2 className="text-xl font-black text-white mb-2 relative z-10">استعادة الوصول</h2>
        <p className="text-white/50 text-xs mb-4 relative z-10 leading-relaxed">
          أدخل بريدك الإلكتروني المسجل في الميدان وسنرسل لك تعليمات استعادة كلمة المرور.
        </p>
        
        <form onSubmit={e => e.preventDefault()} className="space-y-4 relative z-10">
          <div>
            <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider mb-1 block">البريد الإلكتروني</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-primary outline-none transition-colors"
              dir="ltr"
            />
          </div>

          <button className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/10 h-12 rounded-lg font-bold text-sm transition-colors mt-2">
            إرسال التعليمات
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="maydan-root min-h-screen bg-[#0a0a0f] flex flex-col items-center p-4 sm:p-6 overflow-hidden relative selection:bg-primary/30">
      {/* Ambient background noise/glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary/10 rounded-full blur-[100px]"></div>
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] opacity-20 mask-image-[radial-gradient(circle,black,transparent_70%)]"></div>
      </div>

      <div className="w-full max-w-[400px] relative z-10 pt-4 pb-8 flex flex-col items-center justify-center min-h-screen">
        
        {/* Header/Stadium Banner */}
        <div className="w-full flex justify-between items-center mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full"></div>
              <LogoIcon size={56} />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">الميدان</span>
              <span className="text-[10px] text-primary font-bold tracking-widest uppercase">ARENA</span>
            </div>
          </div>
          
          {/* Rank Badge Silhouette */}
          <div className="w-12 h-14 bg-white/5 border border-white/10 rounded-lg flex flex-col items-center justify-center transform rotate-3 shadow-lg">
            <Trophy className="w-4 h-4 text-white/30 mb-1" />
            <span className="text-[10px] font-black text-white/30 font-mono">UNRANKED</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="w-full">
          {view === "roster" && renderRoster()}
          {view === "email" && renderEmailForm()}
          {view === "forgot" && renderForgot()}
        </div>

        <div className="mt-8 text-center">
          <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">SEASON 1 • ARABIC KNOWLEDGE LEAGUE</p>
        </div>
      </div>
    </div>
  );
}
