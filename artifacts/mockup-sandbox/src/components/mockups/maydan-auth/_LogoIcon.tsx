interface LogoIconProps { size?: number; }

export const LogoIcon = ({ size = 80 }: LogoIconProps) => (
  <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-label="ميدان">
    <defs>
      <linearGradient id="mdLogoBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1a0d2e" />
        <stop offset="100%" stopColor="#0D0D1A" />
      </linearGradient>
      <linearGradient id="mdBladeL" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff5d4" />
        <stop offset="35%" stopColor="#f5d98a" />
        <stop offset="70%" stopColor="#d4af37" />
        <stop offset="100%" stopColor="#8a6d0f" />
      </linearGradient>
      <linearGradient id="mdBladeR" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#fff5d4" />
        <stop offset="35%" stopColor="#f5d98a" />
        <stop offset="70%" stopColor="#d4af37" />
        <stop offset="100%" stopColor="#8a6d0f" />
      </linearGradient>
      <radialGradient id="mdGem" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#f3e8ff" />
        <stop offset="45%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#581c87" />
      </radialGradient>
      <filter id="mdSwordGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.6" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="mdGemGlow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="3.2" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <rect width="120" height="120" rx="24" fill="url(#mdLogoBg)" />
    <circle cx="60" cy="62" r="42" fill="#9333ea" opacity="0.08" />
    <g filter="url(#mdSwordGlow)">
      <polygon points="26,20 32,20 92,84 86,90" fill="url(#mdBladeL)" stroke="#8a6d0f" strokeWidth="0.5" />
      <polygon points="88,88 95,82 92,95" fill="#d4af37" />
      <rect x="13" y="36" width="28" height="6" rx="2" fill="#9333ea" stroke="#6b21a8" strokeWidth="0.6" transform="rotate(45 27 39)" />
      <rect x="17" y="22" width="11" height="14" rx="2" fill="#3b1d59" stroke="#6b21a8" strokeWidth="0.5" transform="rotate(45 22.5 29)" />
      <circle cx="20" cy="16" r="5.5" fill="#d4af37" stroke="#8a6d0f" strokeWidth="0.7" />
      <circle cx="20" cy="16" r="2" fill="#fff5d4" opacity="0.9" />
    </g>
    <g filter="url(#mdSwordGlow)">
      <polygon points="94,20 88,20 28,84 34,90" fill="url(#mdBladeR)" stroke="#8a6d0f" strokeWidth="0.5" />
      <polygon points="32,88 25,82 28,95" fill="#d4af37" />
      <rect x="79" y="36" width="28" height="6" rx="2" fill="#9333ea" stroke="#6b21a8" strokeWidth="0.6" transform="rotate(-45 93 39)" />
      <rect x="92" y="22" width="11" height="14" rx="2" fill="#3b1d59" stroke="#6b21a8" strokeWidth="0.5" transform="rotate(-45 97.5 29)" />
      <circle cx="100" cy="16" r="5.5" fill="#d4af37" stroke="#8a6d0f" strokeWidth="0.7" />
      <circle cx="100" cy="16" r="2" fill="#fff5d4" opacity="0.9" />
    </g>
    <g filter="url(#mdGemGlow)">
      <circle cx="60" cy="55" r="12" fill="#0D0D1A" />
      <circle cx="60" cy="55" r="9.5" fill="url(#mdGem)" />
      <polygon points="60,47 67,55 60,63 53,55" fill="#c084fc" opacity="0.55" />
      <circle cx="57" cy="52" r="2.4" fill="white" opacity="0.85" />
    </g>
  </svg>
);
