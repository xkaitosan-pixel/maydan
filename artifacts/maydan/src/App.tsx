import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { hasCompletedOnboarding } from "@/lib/storage";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import UsernameSetup from "@/pages/UsernameSetup";
import CreateChallenge from "@/pages/CreateChallenge";
import Quiz from "@/pages/Quiz";
import Results from "@/pages/Results";
import AcceptChallenge from "@/pages/AcceptChallenge";
import Survival from "@/pages/Survival";
import Stats from "@/pages/Stats";
import FriendsRoom from "@/pages/FriendsRoom";
import Tournament from "@/pages/Tournament";
import Premium from "@/pages/Premium";
import Onboarding from "@/pages/Onboarding";
import Leaderboard from "@/pages/Leaderboard";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import Party from "@/pages/Party";
import PartyHost from "@/pages/PartyHost";
import PartyGuest from "@/pages/PartyGuest";
import RankedMode from "@/pages/RankedMode";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

// Detect if this page load is an OAuth callback (hash or query params from Supabase/Google)
function detectAuthCallback(): boolean {
  const hash = window.location.hash;
  const search = window.location.search;
  return (
    hash.includes("access_token=") ||
    hash.includes("error_description=") ||
    search.includes("code=") ||
    search.includes("error=")
  );
}

// Shown when the popup (or main window) lands on the OAuth redirect URL.
// Supabase automatically exchanges the token (detectSessionInUrl: true).
// We wait for the session, then close the popup or clean the URL.
function AuthCallbackHandler() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    let closed = false;

    function finish(hasSession: boolean) {
      if (closed) return;
      if (!hasSession) { setStatus("error"); return; }
      setStatus("success");

      const isPopup = !!(window.opener && window.opener !== window);
      if (isPopup) {
        // Close popup — main window's onAuthStateChange (via storage event) will fire
        setTimeout(() => window.close(), 400);
      } else {
        // Standalone tab — strip the hash/code and reload cleanly
        setTimeout(() => {
          window.history.replaceState(null, "", window.location.pathname);
          window.location.reload();
        }, 600);
      }
    }

    // Supabase processes the URL tokens automatically; we just poll for the result
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(true);
    });

    // Also check immediately in case it was already processed
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish(true);
    });

    // Timeout fallback
    const timer = setTimeout(() => {
      setStatus("error");
    }, 10_000);

    return () => {
      closed = true;
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="min-h-screen gradient-hero star-bg flex flex-col items-center justify-center gap-5 p-6 text-center"
      style={{ background: "hsl(220 20% 8%)" }}>
      <div className="w-24 h-24 rounded-full flex items-center justify-center gold-glow"
        style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
        <span className="text-5xl">⚔️</span>
      </div>

      {status === "loading" && (
        <>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-foreground font-bold text-lg">جاري تسجيل الدخول...</p>
          <p className="text-muted-foreground text-sm">يرجى الانتظار</p>
        </>
      )}

      {status === "success" && (
        <>
          <p className="text-green-400 font-bold text-lg">✓ تم تسجيل الدخول بنجاح</p>
          <p className="text-muted-foreground text-sm">جاري إغلاق النافذة...</p>
        </>
      )}

      {status === "error" && (
        <>
          <p className="text-destructive font-bold text-lg">حدث خطأ أثناء تسجيل الدخول</p>
          <button
            onClick={() => { window.location.href = "/"; }}
            className="mt-2 px-6 py-3 rounded-2xl font-bold text-background"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
          >
            العودة للرئيسية
          </button>
        </>
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen gradient-hero flex flex-col items-center justify-center gap-4">
      <div className="w-20 h-20 rounded-full gradient-gold flex items-center justify-center gold-glow">
        <span className="text-4xl">⚔️</span>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <p className="text-muted-foreground text-sm">جاري التحميل...</p>
    </div>
  );
}

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  useEffect(() => {
    if (!hasCompletedOnboarding() && location === "/") {
      navigate("/onboarding");
    }
  }, [location]);
  return <>{children}</>;
}

function AppRoutes() {
  const [location] = useLocation();
  const { session, isGuest, isLoading, needsUsername } = useAuth();

  // Party + Ranked routes are public — no login required
  const isPartyRoute = location.startsWith("/party");
  const isRankedRoute = location.startsWith("/ranked");
  if (isPartyRoute) {
    return (
      <Switch>
        <Route path="/party/host" component={PartyHost} />
        <Route path="/party/guest" component={PartyGuest} />
        <Route path="/party" component={Party} />
      </Switch>
    );
  }

  if (isRankedRoute) {
    return (
      <Switch>
        <Route path="/ranked" component={RankedMode} />
      </Switch>
    );
  }

  if (isLoading) return <LoadingScreen />;

  // Not authenticated and not a guest → show login screen
  if (!session && !isGuest) return <Auth />;

  // Authenticated but no username yet → show username setup
  if (session && needsUsername) return <UsernameSetup />;

  return (
    <OnboardingGuard>
      <Switch>
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/" component={Home} />
        <Route path="/create" component={CreateChallenge} />
        <Route path="/quiz/:id/:role" component={Quiz} />
        <Route path="/results/:id/:role" component={Results} />
        <Route path="/challenge/:id" component={AcceptChallenge} />
        <Route path="/survival" component={Survival} />
        <Route path="/stats" component={Stats} />
        <Route path="/room" component={FriendsRoom} />
        <Route path="/tournament" component={Tournament} />
        <Route path="/premium" component={Premium} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/profile" component={Profile} />
        <Route path="/admin" component={Admin} />
        <Route path="/ranked" component={RankedMode} />
        <Route component={NotFound} />
      </Switch>
    </OnboardingGuard>
  );
}

function App() {
  // If this page load is an OAuth callback, bypass all routing and handle it directly.
  // This prevents Wouter from misinterpreting #access_token= as a hash route.
  const isCallback = detectAuthCallback();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {isCallback ? (
          // Standalone callback handler — no AuthProvider needed, just Supabase client
          <div className="min-h-screen w-full">
            <AuthCallbackHandler />
          </div>
        ) : (
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <div className="min-h-screen w-full">
                <AppRoutes />
              </div>
            </WouterRouter>
          </AuthProvider>
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
