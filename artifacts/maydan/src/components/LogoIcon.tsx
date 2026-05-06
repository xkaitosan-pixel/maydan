interface LogoIconProps {
  size?: number;
}

const LogoIcon = ({ size = 80 }: LogoIconProps) => (
  <img
    src={`${import.meta.env.BASE_URL}logo.png`}
    width={size}
    height={size}
    alt="ميدان"
    loading="eager"
    decoding="async"
    style={{ width: size, height: size, objectFit: "contain", display: "block" }}
  />
);

export default LogoIcon;
