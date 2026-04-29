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
  xp: number;
  level: number;
  coins: number;
  rank_title: string | null;
  achievements: unknown;
  season_points: number;
  display_name: string | null;
  country: string | null;
  bio: string | null;
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
  signInWithApple: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
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

      const providerAvatar: string = authUser.user_metadata?.avatar_url ?? "";
      const existingUsername: string = authUser.user_metadata?.username ?? "";
      const nameForAvatar = fullName || existingUsername || "م";
      const encodedName = encodeURIComponent(nameForAvatar);
      const generatedAvatar = `https://ui-avatars.com/api/?name=${encodedName}&background=9333ea&color=fff&size=128&bold=true&font-size=0.5`;
      const avatarUrl = providerAvatar || generatedAvatar;
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({ auth_id: authUser.id, avatar_url: avatarUrl, username: existingUsername || null })
        .select()
        .single();

      if (newUser && !insertError) {
        setDbUser(newUser);
        setNeedsUsername(!existingUsername);
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
        localStorage.removeItem(GUEST_KEY);
        setIsGuest(false);
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
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }

  async function signInWithApple() {
    await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: window.location.origin },
    });
  }

  async function signInWithEmail(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes("Invalid login credentials")) return "البريد الإلكتروني أو كلمة المرور غير صحيحة";
      if (error.message.includes("Email not confirmed")) return "يرجى تأكيد بريدك الإلكتروني أولاً";
      return error.message;
    }
    return null;
  }

  async function signUpWithEmail(email: string, password: string, username: string): Promise<string | null> {
    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 2) return "الاسم يجب أن يكون حرفين على الأقل";
    if (password.length < 6) return "كلمة المرور يجب أن تكون 6 أحرف على الأقل";

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      if (error.message.includes("already registered")) return "هذا البريد الإلكتروني مسجّل مسبقاً";
      return error.message;
    }

    if (data.user) {
      const encodedName = encodeURIComponent(trimmedUsername);
      const avatarUrl = `https://ui-avatars.com/api/?name=${encodedName}&background=9333ea&color=fff&size=128&bold=true&font-size=0.5`;
      await supabase.from("users").insert({
        auth_id: data.user.id,
        username: trimmedUsername,
        avatar_url: avatarUrl,
      });
    }

    return null;
  }

  async function resetPassword(email: string): Promise<string | null> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return error.message;
    return null;
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
      signInWithGoogle, signInWithApple,
      signInWithEmail, signUpWithEmail, resetPassword,
      playAsGuest, signOut, setDbUser, setIsFirstLogin, refreshUser,
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
