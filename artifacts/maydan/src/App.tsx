import { useEffect } from "react";
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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

// When the app loads inside a Google OAuth popup, detect the session and close the popup
function PopupAuthCloser() {
  useEffect(() => {
    const isPopup = window.opener && window.opener !== window;
    if (!isPopup) return;
    // Listen for session; once set, close popup so main window's onAuthStateChange fires
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) { setTimeout(() => window.close(), 300); }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) { setTimeout(() => window.close(), 300); }
    });
    return () => subscription.unsubscribe();
  }, []);
  return null;
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
  const { session, dbUser, isGuest, isLoading, needsUsername } = useAuth();

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
        <Route component={NotFound} />
      </Switch>
    </OnboardingGuard>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <PopupAuthCloser />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <div className="max-w-md mx-auto min-h-screen">
              <AppRoutes />
            </div>
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
