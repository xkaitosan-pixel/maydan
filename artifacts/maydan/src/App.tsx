import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import CreateChallenge from "@/pages/CreateChallenge";
import Quiz from "@/pages/Quiz";
import Results from "@/pages/Results";
import AcceptChallenge from "@/pages/AcceptChallenge";
import Survival from "@/pages/Survival";
import Stats from "@/pages/Stats";
import FriendsRoom from "@/pages/FriendsRoom";
import Tournament from "@/pages/Tournament";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/create" component={CreateChallenge} />
      <Route path="/quiz/:id/:role" component={Quiz} />
      <Route path="/results/:id/:role" component={Results} />
      <Route path="/challenge/:id" component={AcceptChallenge} />
      <Route path="/survival" component={Survival} />
      <Route path="/stats" component={Stats} />
      <Route path="/room" component={FriendsRoom} />
      <Route path="/tournament" component={Tournament} />
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
            <Router />
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
