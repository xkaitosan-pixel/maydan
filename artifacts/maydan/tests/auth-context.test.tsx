import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

type AuthListener = (event: string, session: Session | null) => void;
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const {
  listeners,
  profileLoads,
  authState,
  supabaseMock,
} = vi.hoisted(() => {
  const hoistedListeners = new Set<AuthListener>();
  const hoistedProfileLoads = new Map<
    string,
    Array<Deferred<{ data: unknown; error: unknown }>>
  >();
  const hoistedAuthState = { initialSession: null as Session | null };
  const mock = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: hoistedAuthState.initialSession } })),
      onAuthStateChange: vi.fn((listener: AuthListener) => {
        hoistedListeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => hoistedListeners.delete(listener),
            },
          },
        };
      }),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((_column: string, authId: string) => ({
          maybeSingle: vi.fn(() => {
            const queue = hoistedProfileLoads.get(authId);
            const request = queue?.shift();
            if (!request) throw new Error(`No queued profile response for ${authId}`);
            return request.promise;
          }),
        })),
      })),
    })),
  };
  return {
    listeners: hoistedListeners,
    profileLoads: hoistedProfileLoads,
    authState: hoistedAuthState,
    supabaseMock: mock,
  };
});

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function nextProfileLoad(authId: string) {
  const request = deferred<{ data: unknown; error: unknown }>();
  const queue = profileLoads.get(authId) ?? [];
  queue.push(request);
  profileLoads.set(authId, queue);
  return request;
}

function makeUser(id: string): User {
  return {
    id,
    app_metadata: {},
    user_metadata: { full_name: `User ${id}` },
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00.000Z",
  } as User;
}

function makeSession(id: string): Session {
  return {
    access_token: `token-${id}`,
    refresh_token: `refresh-${id}`,
    expires_in: 3600,
    token_type: "bearer",
    user: makeUser(id),
  } as Session;
}

function makeProfile(authId: string, username = authId) {
  return {
    id: `db-${authId}`,
    auth_id: authId,
    username,
    avatar_url: null,
    total_wins: 0,
    total_losses: 0,
    streak_count: 0,
    longest_streak: 0,
    last_played: null,
    is_premium: false,
    total_points: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    xp: 0,
    level: 1,
    coins: 0,
    rank_title: null,
    achievements: null,
    season_points: 0,
    display_name: null,
    country: null,
    bio: null,
    gender: null,
    onboarding_completed: true,
    favorite_categories: null,
  };
}

vi.mock("@/lib/supabase", () => ({ supabase: supabaseMock }));
vi.mock("@/lib/storage", () => ({ syncPremiumFromServer: vi.fn() }));

import { AuthProvider, useAuth } from "@/lib/AuthContext";

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="session">{auth.session?.user.id ?? "none"}</span>
      <span data-testid="profile">{auth.dbUser?.auth_id ?? "none"}</span>
      <span data-testid="session-loading">{String(auth.isLoading)}</span>
      <span data-testid="profile-loading">{String(auth.isProfileLoading)}</span>
      <span data-testid="profile-error">{auth.profileError ?? "none"}</span>
      <button onClick={() => void auth.refreshUser()}>retry</button>
      <button onClick={() => void auth.signOut()}>sign-out</button>
    </div>
  );
}

function Wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

async function emitSession(session: Session | null) {
  await act(async () => {
    listeners.forEach((listener) => listener("SIGNED_IN", session));
  });
}

beforeEach(() => {
  listeners.clear();
  profileLoads.clear();
  authState.initialSession = null;
  vi.clearAllMocks();
});

describe("AuthProvider profile readiness", () => {
  it("makes the session ready while a delayed profile remains loading", async () => {
    const session = makeSession("delayed");
    const profile = nextProfileLoad("delayed");
    authState.initialSession = session;
    render(<Probe />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId("session").textContent).toBe("delayed"));
    expect(screen.getByTestId("session-loading").textContent).toBe("false");
    expect(screen.getByTestId("profile").textContent).toBe("none");
    expect(screen.getByTestId("profile-loading").textContent).toBe("true");

    profile.resolve({ data: makeProfile("delayed"), error: null });
    await waitFor(() => expect(screen.getByTestId("profile").textContent).toBe("delayed"));
  });

  it("shows a profile error and recovers when retry succeeds", async () => {
    authState.initialSession = makeSession("retry");
    const failed = nextProfileLoad("retry");
    render(<Probe />, { wrapper: Wrapper });
    failed.reject(new Error("offline"));

    await waitFor(() => expect(screen.getByTestId("profile-error").textContent).not.toBe("none"));
    const retried = nextProfileLoad("retry");
    await act(async () => screen.getByRole("button", { name: "retry" }).click());
    retried.resolve({ data: makeProfile("retry"), error: null });

    await waitFor(() => expect(screen.getByTestId("profile").textContent).toBe("retry"));
    expect(screen.getByTestId("profile-error").textContent).toBe("none");
  });

  it("ignores an in-flight profile response after sign-out", async () => {
    authState.initialSession = makeSession("signed-out");
    const profile = nextProfileLoad("signed-out");
    render(<Probe />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId("session").textContent).toBe("signed-out"));

    await act(async () => screen.getByRole("button", { name: "sign-out" }).click());
    profile.resolve({ data: makeProfile("signed-out"), error: null });

    await waitFor(() => expect(screen.getByTestId("session").textContent).toBe("none"));
    expect(screen.getByTestId("profile").textContent).toBe("none");
    expect(screen.getByTestId("profile-loading").textContent).toBe("false");
  });

  it("keeps the new user's profile when the previous user's request finishes last", async () => {
    authState.initialSession = makeSession("first");
    const first = nextProfileLoad("first");
    render(<Probe />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId("session").textContent).toBe("first"));

    const second = nextProfileLoad("second");
    await emitSession(makeSession("second"));
    second.resolve({ data: makeProfile("second"), error: null });
    await waitFor(() => expect(screen.getByTestId("profile").textContent).toBe("second"));

    first.resolve({ data: makeProfile("first"), error: null });
    await act(async () => { await first.promise; });
    expect(screen.getByTestId("session").textContent).toBe("second");
    expect(screen.getByTestId("profile").textContent).toBe("second");
  });
});