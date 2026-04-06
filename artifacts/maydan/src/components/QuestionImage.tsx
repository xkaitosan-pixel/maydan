import { useState } from "react";

interface QuestionImageProps {
  url: string;
  maxHeight?: number;
  className?: string;
}

export default function QuestionImage({ url, maxHeight = 200, className = "" }: QuestionImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (!url || errored) return null;

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
        alt=""
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
