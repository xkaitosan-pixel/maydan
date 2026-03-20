import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { hasCompletedOnboarding } from "@/lib/storage";
import Home from "@/pages/Home";
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

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!hasCompletedOnboarding() && location === "/") {
      navigate("/onboarding");
    }
  }, [location]);

  return <>{children}</>;
}

function Router() {
  return (
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
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="max-w-md mx-auto min-h-screen">
            <OnboardingGuard>
              <Router />
            </OnboardingGuard>
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
