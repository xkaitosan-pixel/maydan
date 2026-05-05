import { CSSProperties } from "react";

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  rounded?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
}

const roundedClass: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  full: "rounded-full",
};

export function Skeleton({ className = "", style, rounded = "md" }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`maydan-skeleton ${roundedClass[rounded]} ${className}`}
      style={style}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className = "",
}: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: `${85 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonStatsGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border/40 bg-card/40 p-3 flex flex-col items-center gap-2"
        >
          <Skeleton className="h-5 w-10" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonListRow() {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-border/40 bg-card/40">
      <Skeleton className="h-6 w-6" rounded="full" />
      <Skeleton className="h-10 w-10" rounded="full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2.5 w-16" />
      </div>
      <Skeleton className="h-5 w-10" />
    </div>
  );
}

export function SkeletonLeaderboard({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonListRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonProfileHeader() {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 p-4 flex items-center gap-3">
      <Skeleton className="h-16 w-16" rounded="full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-2.5 w-24" />
      </div>
    </div>
  );
}

export function SkeletonDailyChallenge() {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10" rounded="full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-11 w-full" rounded="xl" />
    </div>
  );
}
