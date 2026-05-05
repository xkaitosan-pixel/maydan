/**
 * Input sanitization helpers for any user-provided text rendered into the UI
 * or persisted to the database.
 *
 * React already escapes string children, so XSS via `<div>{name}</div>` is not
 * a concern. These helpers exist to:
 *   1) strip out HTML tags / control characters that could pollute rendered text
 *   2) collapse whitespace and enforce length caps
 *   3) make sure usernames/nicknames cannot be empty after trimming
 */

const HTML_TAG_RE = /<[^>]*>/g;
const CONTROL_RE = /[\u0000-\u001F\u007F\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g;
const ZALGO_RE = /[\u0300-\u036F\u0488-\u0489]/g; // combining marks (anti-zalgo)

export function sanitizeText(input: unknown, maxLength = 200): string {
  if (typeof input !== "string") return "";
  return input
    .replace(HTML_TAG_RE, "")
    .replace(CONTROL_RE, "")
    .replace(ZALGO_RE, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeNickname(input: unknown): string {
  // Tighter limits + reject things that look like URLs/emails so nicknames
  // can't impersonate links in the leaderboard.
  const cleaned = sanitizeText(input, 20);
  if (!cleaned) return "";
  if (/https?:\/\//i.test(cleaned)) return "";
  if (/[<>{}\\]/.test(cleaned)) return "";
  return cleaned;
}

export function sanitizeBio(input: unknown): string {
  return sanitizeText(input, 200);
}

/** Strip HTML for use as plain text inside attributes (titles, alts, etc.). */
export function plainText(input: unknown, maxLength = 500): string {
  return sanitizeText(input, maxLength);
}
