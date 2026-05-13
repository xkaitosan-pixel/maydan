interface CircularTimerProps {
  timeLeft: number;
  totalTime: number;
  size?: number;
  strokeWidth?: number;
}

export default function CircularTimer({ timeLeft, totalTime, size = 80, strokeWidth = 6 }: CircularTimerProps) {
  const safeTotal = totalTime > 0 ? totalTime : 1;
  const clamped = Math.max(0, Math.min(timeLeft, safeTotal));
  const ratio = clamped / safeTotal;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ratio * circumference;

  const color = ratio > 0.6 ? "#22c55e" : ratio > 0.3 ? "#f59e0b" : "#ef4444";
  const isDanger = clamped <= 5;

  return (
    <div className={`relative inline-flex items-center justify-center ${isDanger ? "ring-danger" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s ease" }}
        />
      </svg>
      <span
        className={`absolute font-black tabular-nums text-white ${isDanger ? "animate-pulse" : ""}`}
        style={{ fontSize: size / 3 }}
      >
        {clamped}
      </span>
    </div>
  );
}
