import type { CSSProperties } from "react";

interface LogoProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function Logo({ size = 72, className = "", style }: LogoProps) {
  return (
    <img
      src="/skoobpet-logo.png"
      alt="SkoobPet"
      className={`object-contain select-none ${className}`}
      style={style ?? { height: size, width: "auto", maxWidth: Math.round(size * 2.8) }}
      draggable={false}
    />
  );
}
