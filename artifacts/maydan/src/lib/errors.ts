/**
 * Map any thrown value (Supabase error, fetch error, plain Error, string)
 * to a short, user-friendly Arabic message.
 *
 * Never expose stack traces, SQL fragments, JWT errors, or status codes
 * to end users — those are logged to the console, not the UI.
 */
export type ErrorKind = "network" | "server" | "auth" | "notfound" | "ratelimit" | "validation" | "unknown";

export interface FriendlyError {
  kind: ErrorKind;
  message: string;
  emoji: string;
}

const MESSAGES: Record<ErrorKind, FriendlyError> = {
  network:    { kind: "network",    message: "تحقق من اتصالك بالإنترنت",        emoji: "📶" },
  server:     { kind: "server",     message: "حدث خطأ، حاول مجدداً",            emoji: "🔄" },
  auth:       { kind: "auth",       message: "انتهت جلستك، سجل دخولك مجدداً",   emoji: "🔐" },
  notfound:   { kind: "notfound",   message: "العنصر غير موجود",                emoji: "🔍" },
  ratelimit:  { kind: "ratelimit",  message: "حاولت كثيراً، انتظر قليلاً",      emoji: "⏳" },
  validation: { kind: "validation", message: "المعلومات غير صحيحة",             emoji: "⚠️" },
  unknown:    { kind: "unknown",    message: "حدث خطأ، حاول مجدداً",            emoji: "🔄" },
};

export function classifyError(err: unknown): ErrorKind {
  if (!err) return "unknown";

  // Browser offline
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";

  // String form
  const raw =
    typeof err === "string" ? err :
    err instanceof Error ? `${err.name}: ${err.message}` :
    (() => { try { return JSON.stringify(err); } catch { return String(err); } })();

  const s = raw.toLowerCase();

  if (s.includes("failed to fetch") || s.includes("networkerror") || s.includes("network request")
      || s.includes("err_internet") || s.includes("err_network") || s.includes("offline")) {
    return "network";
  }
  if (s.includes("jwt") || s.includes("expired") || s.includes("invalid_token")
      || s.includes("not authenticated") || s.includes("401") || s.includes("auth session")) {
    return "auth";
  }
  if (s.includes("rate limit") || s.includes("429") || s.includes("too many")) {
    return "ratelimit";
  }
  if (s.includes("not found") || s.includes("404") || s.includes("pgrst116")) {
    return "notfound";
  }
  if (s.includes("invalid") || s.includes("required") || s.includes("must be")) {
    return "validation";
  }
  if (s.includes("500") || s.includes("502") || s.includes("503") || s.includes("server")) {
    return "server";
  }
  return "unknown";
}

export function friendlyError(err: unknown): FriendlyError {
  // Always log the raw error so devs can debug, even when we hide it from the user.
  if (err) console.warn("[ميدان] error:", err);
  return MESSAGES[classifyError(err)];
}

/** Convenience: returns just the Arabic string with its emoji ready for a toast/inline message. */
export function friendlyErrorText(err: unknown): string {
  const f = friendlyError(err);
  return `${f.message} ${f.emoji}`;
}
