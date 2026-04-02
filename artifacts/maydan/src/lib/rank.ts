export const RANKS = [
  { label: "برونز", icon: "🥉", min: 0, max: 99, color: "#cd7f32" },
  { label: "فضة", icon: "🥈", min: 100, max: 299, color: "#94a3b8" },
  { label: "ذهب", icon: "🥇", min: 300, max: 599, color: "#d97706" },
  { label: "بلاتين", icon: "💎", min: 600, max: 999, color: "#7c3aed" },
  { label: "أسطورة", icon: "👑", min: 1000, max: Infinity, color: "#f59e0b" },
];

export function getRankInfo(points: number) {
  return RANKS.find((r) => points >= r.min && points <= r.max) ?? RANKS[0];
}
