interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 72, className = "" }: LogoProps) {
  return (
    <img
      src="/skoobpet-logo.png"
      alt="SkoobPet"
      className={`object-contain select-none ${className}`}
      style={{ height: size, width: "auto", maxWidth: Math.round(size * 2.8) }}
      draggable={false}
    />
  );
}
