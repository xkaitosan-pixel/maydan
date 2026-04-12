interface LogoIconProps {
  size?: number;
}

const LogoIcon = ({ size = 80 }: LogoIconProps) => (
  <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="120" height="120" rx="24" fill="#0D0D1A"/>

    <defs>
      <linearGradient id="gold1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f5d98a"/>
        <stop offset="100%" stopColor="#b8960e"/>
      </linearGradient>
      <linearGradient id="gold2" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#f5d98a"/>
        <stop offset="100%" stopColor="#b8960e"/>
      </linearGradient>
    </defs>

    <path d="M28 22 L78 82" stroke="url(#gold1)" strokeWidth="5" strokeLinecap="round"/>
    <polygon points="78,82 86,94 73,84" fill="#D4AF37"/>
    <rect x="16" y="40" width="26" height="5" rx="2.5" fill="#9333ea"
      transform="rotate(-52 29 42)"/>
    <circle cx="22" cy="17" r="6" fill="#7c3aed"/>

    <path d="M92 22 L42 82" stroke="url(#gold2)" strokeWidth="5" strokeLinecap="round"/>
    <polygon points="42,82 34,94 47,84" fill="#D4AF37"/>
    <rect x="78" y="40" width="26" height="5" rx="2.5" fill="#9333ea"
      transform="rotate(52 91 42)"/>
    <circle cx="98" cy="17" r="6" fill="#7c3aed"/>

    <circle cx="60" cy="54" r="10" fill="#0D0D1A"/>
    <circle cx="60" cy="54" r="7" fill="#9333ea"/>
    <circle cx="60" cy="54" r="3.5" fill="#D4AF37"/>
    <circle cx="60" cy="54" r="1" fill="white" opacity="0.8"/>
  </svg>
);

export default LogoIcon;
