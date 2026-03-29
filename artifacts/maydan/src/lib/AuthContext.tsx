import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "./supabase";
import type { Session, User } from "@supabase/supabase-js";

export interface DbUser {
  id: string;
  auth_id: string;
  username: string | null;
  avatar_url: string | null;
  total_wins: number;
  total_losses: number;
  streak_count: number;
  longest_streak: number;
  last_played: string | null;
  is_premium: boolean;
  total_points: number;
  created_at: string;
}

interface AuthContextType {
  session: Session | null;
  dbUser: DbUser | null;
  isGuest: boolean;
  isLoading: boolean;
  needsUsername: boolean;
  googleDisplayName: string;
  isFirstLogin: boolean;
  signInWithGoogle: () => Promise<void>;
  playAsGuest: () => void;
  signOut: () => Promise<void>;
  setDbUser: (user: DbUser) => void;
  setIsFirstLogin: (v: boolean) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const GUEST_KEY = "maydan_guest_mode";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [googleDisplayName, setGoogleDisplayName] = useState("");
  const [isFirstLogin, setIsFirstLogin] = useState(false);

  const loadOrCreateDbUser = useCallback(async (authUser: User) => {
    try {
      const fullName: string = authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? "";
      setGoogleDisplayName(fullName);

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("auth_id", authUser.id)
        .single();

      if (data && !error) {
        setDbUser(data);
        setNeedsUsername(!data.username);
        return;
      }

      // New user — create record
      const avatarUrl: string = authUser.user_metadata?.avatar_url ?? "";
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({ auth_id: authUser.id, avatar_url: avatarUrl })
        .select()
        .single();

      if (newUser && !insertError) {
        setDbUser(newUser);
        setNeedsUsername(true);
        setIsFirstLogin(true);
      }
    } catch (e) {
      console.error("loadOrCreateDbUser error", e);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!session?.user) return;
    await loadOrCreateDbUser(session.user);
  }, [session, loadOrCreateDbUser]);

  useEffect(() => {
    // Guest short-circuit
    if (localStorage.getItem(GUEST_KEY)) {
      setIsGuest(true);
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        loadOrCreateDbUser(s.user).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        loadOrCreateDbUser(s.user);
      } else {
        setDbUser(null);
        setNeedsUsername(false);
        setGoogleDisplayName("");
      }
    });

    return () => subscription.unsubscribe();
  }, [loadOrCreateDbUser]);

  async function signInWithGoogle() {
    const redirectTo = "https://maydan.replit.app/";
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) throw error ?? new Error("No OAuth URL");
    // Open as popup
    const w = 500, h = 620;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    window.open(data.url, "GoogleLogin", `width=${w},height=${h},left=${left},top=${top},popup=yes`);
  }

  function playAsGuest() {
    localStorage.setItem(GUEST_KEY, "1");
    setIsGuest(true);
  }

  async function signOut() {
    localStorage.removeItem(GUEST_KEY);
    setIsGuest(false);
    setSession(null);
    setDbUser(null);
    setNeedsUsername(false);
    setGoogleDisplayName("");
    setIsFirstLogin(false);
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{
      session, dbUser, isGuest, isLoading, needsUsername,
      googleDisplayName, isFirstLogin,
      signInWithGoogle, playAsGuest, signOut, setDbUser, setIsFirstLogin, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
