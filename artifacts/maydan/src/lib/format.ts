/**
 * Arabic-Indic digit + number formatting helpers.
 *
 * - `toArabicDigits` converts ASCII digits in any string to Arabic-Indic digits.
 * - `formatNumberAr` formats a number using the Arabic locale (so 1000 → ١٬٠٠٠).
 * - Both helpers are SSR-safe and never throw.
 */

const ARABIC_INDIC = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

export function toArabicDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

export function formatNumberAr(value: number, opts?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) return "";
  try {
    return new Intl.NumberFormat("ar-EG", opts).format(value);
  } catch {
    return toArabicDigits(value);
  }
}

/** Compact form: 1.2K → ١٫٢ ألف (best-effort, falls back gracefully). */
export function formatCompactAr(value: number): string {
  if (!Number.isFinite(value)) return "";
  try {
    return new Intl.NumberFormat("ar-EG", { notation: "compact" }).format(value);
  } catch {
    return toArabicDigits(value);
  }
}
