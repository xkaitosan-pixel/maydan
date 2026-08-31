import { useState } from "react";

interface QuestionImageProps {
  url: string;
  maxHeight?: number;
  className?: string;
  alt?: string;
}

export default function QuestionImage({
  url,
  maxHeight = 200,
  className = "",
  alt = "صورة توضيحية للسؤال",
}: QuestionImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (!url) return null;
  if (errored) {
    return (
      <div className={`w-full rounded-xl bg-white/5 p-3 text-center text-xs text-muted-foreground ${className}`} role="status">
        تعذّر تحميل صورة السؤال
      </div>
    );
  }

  return (
    <div className={`w-full flex justify-center ${className}`}>
      {!loaded && (
        <div
          className="w-full rounded-xl bg-white/5 animate-pulse"
          style={{ height: Math.min(maxHeight, 160) }}
        />
      )}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className="rounded-xl object-contain w-full"
        style={{
          maxHeight,
          display: loaded ? "block" : "none",
        }}
      />
    </div>
  );
}
