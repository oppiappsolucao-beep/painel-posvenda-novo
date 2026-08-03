import type { CSSProperties } from "react";

interface LogoProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  variant?: "default" | "circle";
}

export function Logo({ size = 72, className = "", style, variant = "default" }: LogoProps) {
  if (variant === "circle") {
    return (
      <div
        className={`rounded-full overflow-hidden shadow-xl bg-white ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <img
          src="/skoobpet-logo.png"
          alt="SkoobPet"
          className="w-full h-full object-contain select-none"
          draggable={false}
        />
      </div>
    );
  }

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
