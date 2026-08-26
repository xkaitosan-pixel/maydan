import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import { syncPremiumFromServer } from "./storage";
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
  gender: string | null;
  onboarding_completed: boolean | null;
  favorite_categories: string[] | null;
}

interface AuthContextType {
  session: Session | null;
  dbUser: DbUser | null;
  isGuest: boolean;
  isLoading: boolean;
  isProfileLoading: boolean;
  profileError: string | null;
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
const OPTIONAL_CALL_TIMEOUT_MS = 5_000;
const PROFILE_CACHE_TTL_MS = 30_000;
export const DB_USER_COLUMNS = "id,auth_id,username,avatar_url,total_wins,total_losses,streak_count,longest_streak,last_played,is_premium,total_points,created_at,xp,level,coins,rank_title,achievements,season_points,display_name,country,bio,gender,onboarding_completed,favorite_categories";

interface ProfileLoadResult {
  user: DbUser | null;
  created: boolean;
}

const profileCache = new Map<string, { user: DbUser; expiresAt: number }>();
const profileRequests = new Map<string, Promise<ProfileLoadResult>>();
const profileRequestVersions = new Map<string, number>();

/** Race a promise against a timeout so a hung network call can never block the app forever. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

async function fetchOrCreateDbUser(authUser: User): Promise<ProfileLoadResult> {
  const { data, error } = await withTimeout(
    Promise.resolve(
      supabase.from("users").select(DB_USER_COLUMNS).eq("auth_id", authUser.id).maybeSingle()
    ),
    OPTIONAL_CALL_TIMEOUT_MS,
    "load user",
  );

  if (data && !error) {
    return { user: data as DbUser, created: false };
  }
  if (error) throw error;

  const fullName: string = authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? "";
  const providerAvatar: string = authUser.user_metadata?.avatar_url ?? "";
  const existingUsername: string = authUser.user_metadata?.username ?? "";
  const nameForAvatar = fullName || existingUsername || authUser.id;
  const encodedSeed = encodeURIComponent(nameForAvatar);
  const generatedAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodedSeed}&backgroundColor=9333ea`;
  const avatarUrl = providerAvatar || generatedAvatar;
  const { data: newUser, error: insertError } = await withTimeout(
    Promise.resolve(
      supabase
        .from("users")
        .insert({ auth_id: authUser.id, avatar_url: avatarUrl, username: existingUsername || null })
        .select(DB_USER_COLUMNS)
        .single()
    ),
    OPTIONAL_CALL_TIMEOUT_MS,
    "create user",
  );

  if (newUser && !insertError) {
    return { user: newUser as DbUser, created: true };
  }

  return { user: null, created: false };
}

function getDbUser(authUser: User, force = false): Promise<ProfileLoadResult> {
  if (!force) {
    const cached = profileCache.get(authUser.id);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve({ user: cached.user, created: false });
    }
    if (cached) profileCache.delete(authUser.id);
  }

  const inFlight = profileRequests.get(authUser.id);
  if (!force && inFlight) return inFlight;

  const requestVersion = (profileRequestVersions.get(authUser.id) ?? 0) + 1;
  profileRequestVersions.set(authUser.id, requestVersion);
  const request = fetchOrCreateDbUser(authUser)
    .then(result => {
      if (result.user && profileRequestVersions.get(authUser.id) === requestVersion) {
        profileCache.set(authUser.id, {
          user: result.user,
          expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
        });
      }
      return result;
    })
    .finally(() => {
      if (profileRequests.get(authUser.id) === request) {
        profileRequests.delete(authUser.id);
      }
    });

  profileRequests.set(authUser.id, request);
  return request;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [googleDisplayName, setGoogleDisplayName] = useState("");
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const activeAuthIdRef = useRef<string | null>(null);
  const profileLoadGenerationRef = useRef(0);

  const loadOrCreateDbUser = useCallback(async (authUser: User, force = false) => {
    const generation = ++profileLoadGenerationRef.current;
    setIsProfileLoading(true);
    setProfileError(null);
    try {
      const fullName: string = authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? "";
      setGoogleDisplayName(fullName);

      const existingUsername: string = authUser.user_metadata?.username ?? "";
      const result = await getDbUser(authUser, force);
      if (
        generation !== profileLoadGenerationRef.current ||
        activeAuthIdRef.current !== authUser.id
      ) return;

      if (result.user) {
        setDbUser(result.user);
        syncPremiumFromServer(!!result.user.is_premium);
        setNeedsUsername(!result.user.username);
        if (result.created) {
          setNeedsUsername(!existingUsername);
          setIsFirstLogin(true);
        }
      } else {
        setProfileError("تعذر تحميل ملفك الشخصي. تحقق من الاتصال ثم حاول مجدداً.");
      }
    } catch (e) {
      if (
        generation !== profileLoadGenerationRef.current ||
        activeAuthIdRef.current !== authUser.id
      ) return;
      console.error("loadOrCreateDbUser error", e);
      setProfileError("تعذر تحميل ملفك الشخصي. تحقق من الاتصال ثم حاول مجدداً.");
    } finally {
      if (
        generation === profileLoadGenerationRef.current &&
        activeAuthIdRef.current === authUser.id
      ) {
        setIsProfileLoading(false);
      }
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!session?.user) return;
    profileCache.delete(session.user.id);
    await loadOrCreateDbUser(session.user, true);
  }, [session, loadOrCreateDbUser]);

  useEffect(() => {
    if (localStorage.getItem(GUEST_KEY)) {
      activeAuthIdRef.current = null;
      setIsGuest(true);
      setIsLoading(false);
      return;
    }

    // Hard safety net: never show the loading spinner for more than 5 seconds,
    // even if every network call below hangs. The app renders in whatever auth
    // state we have at that point (worst case: the login screen).
    const maxLoadTimer = setTimeout(() => {
      console.warn("[auth] init exceeded 5s — rendering app anyway");
      setIsLoading(false);
    }, OPTIONAL_CALL_TIMEOUT_MS);

    withTimeout(supabase.auth.getSession(), OPTIONAL_CALL_TIMEOUT_MS, "getSession")
      .then(({ data: { session: s } }) => {
        clearTimeout(maxLoadTimer);
        const nextAuthId = s?.user.id ?? null;
        if (activeAuthIdRef.current !== nextAuthId) {
          profileLoadGenerationRef.current += 1;
          setDbUser(null);
          setNeedsUsername(false);
          setProfileError(null);
        }
        activeAuthIdRef.current = nextAuthId;
        setSession(s);
        setIsLoading(false);
        if (s) {
          void loadOrCreateDbUser(s.user);
        }
      })
      .catch(e => {
        clearTimeout(maxLoadTimer);
        console.error("[auth] getSession failed", e);
        setIsLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      const nextAuthId = s?.user.id ?? null;
      if (activeAuthIdRef.current !== nextAuthId) {
        profileLoadGenerationRef.current += 1;
        setDbUser(null);
        setNeedsUsername(false);
        setProfileError(null);
      }
      activeAuthIdRef.current = nextAuthId;
      setSession(s);
      if (s) {
        localStorage.removeItem(GUEST_KEY);
        setIsGuest(false);
        void loadOrCreateDbUser(s.user);
      } else {
        setIsProfileLoading(false);
        setDbUser(null);
        setNeedsUsername(false);
        setGoogleDisplayName("");
      }
    });

    return () => {
      clearTimeout(maxLoadTimer);
      subscription.unsubscribe();
    };
  }, [loadOrCreateDbUser]);

  async function signInWithGoogle() {
    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  async function signInWithApple() {
    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo },
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
      const encodedSeed = encodeURIComponent(trimmedUsername);
      const avatarUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodedSeed}&backgroundColor=9333ea`;
      await supabase.from("users").insert({
        auth_id: data.user.id,
        username: trimmedUsername,
        avatar_url: avatarUrl,
      });
    }

    return null;
  }

  async function resetPassword(email: string): Promise<string | null> {
    const appBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("reset-password", appBaseUrl).href,
    });
    if (error) return error.message;
    return null;
  }

  function playAsGuest() {
    profileLoadGenerationRef.current += 1;
    activeAuthIdRef.current = null;
    localStorage.setItem(GUEST_KEY, "1");
    setSession(null);
    setDbUser(null);
    setIsProfileLoading(false);
    setProfileError(null);
    setIsGuest(true);
  }

  async function signOut() {
    profileLoadGenerationRef.current += 1;
    activeAuthIdRef.current = null;
    if (session?.user) profileCache.delete(session.user.id);
    localStorage.removeItem(GUEST_KEY);
    setIsGuest(false);
    setSession(null);
    setDbUser(null);
    setIsProfileLoading(false);
    setProfileError(null);
    setNeedsUsername(false);
    setGoogleDisplayName("");
    setIsFirstLogin(false);
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{
      session, dbUser, isGuest, isLoading, isProfileLoading, profileError, needsUsername,
      googleDisplayName, isFirstLogin,
      signInWithGoogle, signInWithApple,
      signInWithEmail, signUpWithEmail, resetPassword,
      playAsGuest, signOut,
      setDbUser: (u: DbUser) => {
        setDbUser(u);
        setIsProfileLoading(false);
        setProfileError(null);
        profileCache.set(u.auth_id, { user: u, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
        syncPremiumFromServer(!!u.is_premium);
      },
      setIsFirstLogin, refreshUser,
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
