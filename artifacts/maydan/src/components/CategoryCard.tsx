import type { Category } from "@/lib/questions";

interface CategoryCardProps {
  cat: Category & { gFrom?: string; gTo?: string };
  isSelected?: boolean;
  isLocked?: boolean;
  questionCount?: number;
  onClick: () => void;
  size?: "default" | "small";
}

export default function CategoryCard({
  cat,
  isSelected = false,
  isLocked = false,
  questionCount = 15,
  onClick,
  size = "default",
}: CategoryCardProps) {
  const gFrom = cat.gFrom ?? cat.gradientFrom;
  const gTo = cat.gTo ?? cat.gradientTo;

  const isSmall = size === "small";

  return (
    <button
      onClick={onClick}
      disabled={isLocked}
      className={`relative rounded-2xl overflow-hidden text-center transition-all select-none
        ${isLocked ? "opacity-60 cursor-not-allowed" : "hover:scale-[1.03] active:scale-[0.97] cursor-pointer"}
        ${isSelected ? "ring-2 ring-white/60 ring-offset-1 ring-offset-transparent" : ""}
      `}
      style={{
        background: `linear-gradient(160deg, ${gFrom} 0%, ${gTo} 100%)`,
        border: isSelected
          ? `2px solid rgba(255,255,255,0.5)`
          : `1px solid rgba(255,255,255,0.08)`,
        boxShadow: isSelected
          ? `0 0 20px ${gFrom}88, inset 0 1px 0 rgba(255,255,255,0.15)`
          : `0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.10)`,
        minHeight: isSmall ? "110px" : "140px",
      }}
    >
      {/* Gloss shine overlay */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none rounded-t-2xl"
        style={{
          height: "45%",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 100%)",
        }}
      />

      {/* Selected checkmark */}
      {isSelected && (
        <div
          className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-black"
          style={{ background: "rgba(255,255,255,0.9)" }}
        >
          ✓
        </div>
      )}

      {/* Lock icon */}
      {isLocked && (
        <div
          className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          🔒
        </div>
      )}

      {/* Premium badge */}
      {cat.isPremium && !isLocked && (
        <div
          className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold"
          style={{ background: "rgba(0,0,0,0.45)", color: "#fbbf24" }}
        >
          👑 برو
        </div>
      )}

      <div className={`relative flex flex-col items-center justify-center gap-2 ${isSmall ? "p-3" : "p-4"}`}>
        {/* Large icon */}
        <span
          className="block leading-none drop-shadow-lg"
          style={{ fontSize: isSmall ? "2rem" : "2.6rem" }}
        >
          {cat.icon}
        </span>

        {/* Category name */}
        <p
          className="font-black text-white leading-tight"
          style={{
            fontSize: isSmall ? "0.72rem" : "0.85rem",
            textShadow: "0 1px 4px rgba(0,0,0,0.6)",
          }}
        >
          {cat.name}
        </p>

        {/* Question count badge */}
        {!isSmall && (
          <span
            className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
            style={{
              background: "rgba(0,0,0,0.35)",
              color: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {questionCount} سؤال
          </span>
        )}

        {/* Difficulty dots */}
        {!isSmall && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: "#4ade80", boxShadow: "0 0 4px #4ade8088" }}
            />
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: "#facc15", boxShadow: "0 0 4px #facc1588" }}
            />
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: "#f87171", boxShadow: "0 0 4px #f8717188" }}
            />
          </div>
        )}
      </div>
    </button>
  );
}
