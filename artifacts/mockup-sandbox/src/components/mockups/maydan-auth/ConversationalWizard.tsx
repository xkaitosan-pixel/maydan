import { useState } from "react";
import { Mail, Check, User, ChevronRight } from "lucide-react";
import "./_group.css";
import { LogoIcon } from "./_LogoIcon";

const GoogleIcon = () => (
  <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const AppleIcon = () => (
  <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

export function ConversationalWizard() {
  const [step, setStep] = useState(2);
  const [method, setMethod] = useState<"none" | "email" | "google" | "apple">("none");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const inputCls = "w-full h-14 rounded-2xl border border-border bg-card/80 px-5 text-base text-right text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all";

  return (
    <div className="maydan-root min-h-screen gradient-hero star-bg flex flex-col relative overflow-hidden" dir="rtl">
      
      {/* Top Bar */}
      <div className="flex items-center justify-between p-6 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg border border-border/50">
            <LogoIcon size={40} />
          </div>
          <span className="font-bold text-lg text-primary tracking-wide">ميدان</span>
        </div>
        
        {/* Step Indicator */}
        <div className="flex items-center gap-2 bg-card/60 backdrop-blur-sm px-4 py-2 rounded-full border border-border/50">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
            <Check size={12} strokeWidth={3} />
          </div>
          <div className="w-3 h-px bg-primary/50" />
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary border border-primary/50 text-xs font-bold ring-2 ring-primary/20">
            2
          </div>
          <div className="w-3 h-px bg-border" />
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-bold">
            3
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col px-6 pt-8 pb-24 z-10 w-full max-w-md mx-auto relative">
        
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
          {/* Previous step summary (Mocked) */}
          <div className="flex items-center gap-3 mb-10 opacity-60">
            <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border shrink-0">
              <User size={18} className="text-muted-foreground" />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-tr-sm px-4 py-3 text-sm">
              <span className="text-muted-foreground block text-xs mb-1">اسمك المستعار:</span>
              <span className="font-bold text-foreground">صقر الصحراء</span>
            </div>
            <button className="mr-auto text-primary text-xs hover:underline">تعديل</button>
          </div>

          {/* Current Step */}
          <h2 className="text-3xl font-black mb-8 leading-tight">
            كيف تريد الدخول<br/>إلى الميدان؟
          </h2>

          <div className="space-y-4">
            <button 
              onClick={() => setMethod("google")}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${method === 'google' ? 'bg-card border-primary ring-1 ring-primary shadow-lg shadow-primary/10' : 'bg-card/40 border-border hover:bg-card/80'}`}
            >
              <div className="w-12 h-12 rounded-xl bg-white text-[#4285F4] flex items-center justify-center shrink-0">
                <GoogleIcon />
              </div>
              <div className="text-right flex-1">
                <div className="font-bold text-lg">حساب Google</div>
                <div className="text-xs text-muted-foreground">الدخول السريع والآمن</div>
              </div>
              <ChevronRight size={20} className={method === 'google' ? 'text-primary' : 'text-muted-foreground'} />
            </button>

            <button 
              onClick={() => setMethod("apple")}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${method === 'apple' ? 'bg-card border-primary ring-1 ring-primary shadow-lg shadow-primary/10' : 'bg-card/40 border-border hover:bg-card/80'}`}
            >
              <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center shrink-0">
                <AppleIcon />
              </div>
              <div className="text-right flex-1">
                <div className="font-bold text-lg">حساب Apple</div>
                <div className="text-xs text-muted-foreground">باستخدام بصمة الوجه</div>
              </div>
              <ChevronRight size={20} className={method === 'apple' ? 'text-primary' : 'text-muted-foreground'} />
            </button>

            <div className="relative pt-2">
              <button 
                onClick={() => setMethod("email")}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${method === 'email' ? 'bg-card border-primary rounded-b-none border-b-0' : 'bg-card/40 border-border hover:bg-card/80'}`}
              >
                <div className="w-12 h-12 rounded-xl gradient-purple flex items-center justify-center shrink-0 text-white">
                  <Mail size={24} />
                </div>
                <div className="text-right flex-1">
                  <div className="font-bold text-lg">البريد الإلكتروني</div>
                  <div className="text-xs text-muted-foreground">تسجيل الدخول أو حساب جديد</div>
                </div>
                <ChevronRight size={20} className={`transition-transform duration-300 ${method === 'email' ? 'text-primary rotate-90' : 'text-muted-foreground'}`} />
              </button>

              {/* Inline Expansion for Email */}
              <div className={`overflow-hidden transition-all duration-500 ease-in-out ${method === 'email' ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="bg-card border border-primary border-t-0 rounded-b-2xl p-5 pt-2 space-y-3">
                  <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} dir="ltr" />
                  <input type="password" placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} dir="ltr" />
                  <div className="flex items-center justify-between pt-1">
                    <button className="text-xs text-muted-foreground hover:text-primary transition-colors">نسيت كلمة المرور؟</button>
                    <button className="gradient-gold text-primary-foreground font-bold px-6 py-2.5 rounded-xl text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform">متابعة</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Floating Guest Chip */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center z-20">
        <button className="bg-card/90 backdrop-blur-md border border-border/60 hover:border-primary/50 text-muted-foreground hover:text-foreground text-sm font-medium px-6 py-3 rounded-full flex items-center gap-2 transition-all shadow-xl">
          <span className="text-lg">🎮</span>
          العب كضيف بدون حساب
        </button>
      </div>

    </div>
  );
}
