import { lazy, Suspense, useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { hasCompletedOnboarding } from "@/lib/storage";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import NotificationSystem from "@/components/NotificationSystem";
import ErrorBoundary from "@/components/ErrorBoundary";
import InstallPrompt from "@/components/InstallPrompt";
import BottomNav from "@/components/BottomNav";

// Eager: critical auth-flow + landing pages
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import UsernameSetup from "@/pages/UsernameSetup";
import Onboarding from "@/pages/Onboarding";
import NotFound from "@/pages/not-found";

// Lazy: heavier / less-frequently-used pages
const CreateChallenge = lazy(() => import("@/pages/CreateChallenge"));
const Quiz = lazy(() => import("@/pages/Quiz"));
const Results = lazy(() => import("@/pages/Results"));
const AcceptChallenge = lazy(() => import("@/pages/AcceptChallenge"));
const Survival = lazy(() => import("@/pages/Survival"));
const Stats = lazy(() => import("@/pages/Stats"));
const Premium = lazy(() => import("@/pages/Premium"));
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const Profile = lazy(() => import("@/pages/Profile"));
const Admin = lazy(() => import("@/pages/Admin"));
const Party = lazy(() => import("@/pages/Party"));
const PartyHost = lazy(() => import("@/pages/PartyHost"));
const PartyGuest = lazy(() => import("@/pages/PartyGuest"));
const RankedMode = lazy(() => import("@/pages/RankedMode"));
const Achievements = lazy(() => import("@/pages/Achievements"));
const Store = lazy(() => import("@/pages/Store"));
const DailyChallenge = lazy(() => import("@/pages/DailyChallenge"));
const Settings = lazy(() => import("@/pages/Settings"));
const PublicProfile = lazy(() => import("@/pages/PublicProfile"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const About = lazy(() => import("@/pages/About"));

const queryClient = new QueryClient();

// Detect if this page load is an OAuth callback (hash or query params from Supabase/Google)
function detectAuthCallback(): boolean {
  const hash = window.location.hash;
  const search = window.location.search;
  const path = window.location.pathname;

  // Party routes use ?code= for 4-digit room codes — never treat as an OAuth callback
  if (path.startsWith("/party")) return false;

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
      <div className="gold-glow rounded-3xl">
        <img src="/logo.png" alt="ميدان" className="app-logo" style={{ width: 100, height: "auto" }} />
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
      <div className="gold-glow rounded-3xl">
        <img src="/logo.png" alt="ميدان" className="app-logo" style={{ width: 100, height: "auto" }} />
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
  const { dbUser, isGuest } = useAuth();
  useEffect(() => {
    if (location !== "/") return;
    // Logged-in users: trust DB flag, but also accept local flag as bridge
    // (the DB save is fire-and-forget, so we may navigate home before it lands).
    if (dbUser) {
      if (!dbUser.onboarding_completed && !hasCompletedOnboarding()) {
        navigate("/onboarding");
      }
      return;
    }
    // Guests: localStorage only
    if (isGuest && !hasCompletedOnboarding()) {
      navigate("/onboarding");
    }
  }, [location, dbUser, isGuest, navigate]);
  return <>{children}</>;
}

function RedirectHome() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/", { replace: true }); }, []);
  return <LoadingScreen />;
}

// Wraps a child route so it re-mounts (and re-plays the page-enter animation) on path change.
function PageTransition({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <div key={location} className="page-enter">
      {children}
    </div>
  );
}

function AppRoutes() {
  const [location] = useLocation();
  const { session, isGuest, isLoading, needsUsername } = useAuth();

  // Party + Ranked routes are public — no login required
  const isPartyRoute = location.startsWith("/party");
  const isRankedRoute = location.startsWith("/ranked");
  // Challenge / quiz / results routes are also public so anyone with a link
  // can play without an account (we ask for a nickname inside the quiz).
  const isPublicChallengeRoute =
    location.startsWith("/challenge/") ||
    location.startsWith("/quiz/") ||
    location.startsWith("/results/");
  // Static info pages — accessible to anyone with no auth required.
  // Normalize trailing slash so /terms, /terms/, /terms?utm=x all match.
  // (wouter's `location` already excludes the query string, but we strip it
  //  again defensively in case a future router change re-introduces it.)
  const normalizedPath = location.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  const isPublicInfoRoute =
    normalizedPath === "/terms" ||
    normalizedPath === "/privacy" ||
    normalizedPath === "/about";
  if (isPartyRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Switch>
          <Route path="/party/host" component={PartyHost} />
          <Route path="/party/guest" component={PartyGuest} />
          <Route path="/party" component={Party} />
        </Switch>
      </Suspense>
    );
  }

  if (isRankedRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Switch>
          <Route path="/ranked" component={RankedMode} />
        </Switch>
      </Suspense>
    );
  }

  if (isLoading) return <LoadingScreen />;

  // Static info routes — render before auth checks so guests + visitors can read them.
  if (isPublicInfoRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <PageTransition>
          <Switch>
            <Route path="/terms" component={Terms} />
            <Route path="/privacy" component={Privacy} />
            <Route path="/about" component={About} />
          </Switch>
        </PageTransition>
      </Suspense>
    );
  }

  // Public challenge routes — render without forcing the auth screen.
  if (isPublicChallengeRoute && !session && !isGuest) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <PageTransition>
          <Switch>
            <Route path="/quiz/:id/:role" component={Quiz} />
            <Route path="/results/:id/:role" component={Results} />
            <Route path="/challenge/:id" component={AcceptChallenge} />
          </Switch>
        </PageTransition>
      </Suspense>
    );
  }

  // Not authenticated and not a guest → show login screen
  if (!session && !isGuest) return <Auth />;

  // Authenticated but no username yet → show username setup
  if (session && needsUsername) return <UsernameSetup />;

  return (
    <OnboardingGuard>
      <Suspense fallback={<LoadingScreen />}>
        <PageTransition>
          <Switch>
            <Route path="/onboarding" component={Onboarding} />
            <Route path="/" component={Home} />
            <Route path="/create" component={CreateChallenge} />
            <Route path="/quiz/:id/:role" component={Quiz} />
            <Route path="/results/:id/:role" component={Results} />
            <Route path="/challenge/:id" component={AcceptChallenge} />
            <Route path="/survival" component={Survival} />
            <Route path="/stats" component={Stats} />
            <Route path="/room" component={RedirectHome} />
            <Route path="/tournament" component={RedirectHome} />
            <Route path="/premium" component={Premium} />
            <Route path="/leaderboard" component={Leaderboard} />
            <Route path="/profile" component={Profile} />
            <Route path="/profile/:userId" component={PublicProfile} />
            <Route path="/settings" component={Settings} />
            <Route path="/admin" component={Admin} />
            <Route path="/ranked" component={RankedMode} />
            <Route path="/achievements" component={Achievements} />
            <Route path="/store" component={Store} />
            <Route path="/daily" component={DailyChallenge} />
            <Route path="/terms" component={Terms} />
            <Route path="/privacy" component={Privacy} />
            <Route path="/about" component={About} />
            <Route component={NotFound} />
          </Switch>
        </PageTransition>
      </Suspense>
    </OnboardingGuard>
  );
}

function App() {
  // If this page load is an OAuth callback, bypass all routing and handle it directly.
  // This prevents Wouter from misinterpreting #access_token= as a hash route.
  const isCallback = detectAuthCallback();

  return (
    <ErrorBoundary>
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
                  <NotificationSystem />
                  <BottomNav />
                  <InstallPrompt />
                </div>
              </WouterRouter>
            </AuthProvider>
          )}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
