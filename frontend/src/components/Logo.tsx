import { COLORS } from "../lib/utils";

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 72, className = "" }: LogoProps) {
  const fontSize = Math.round(size * 0.44);

  return (
    <div
      className={`rounded-full flex items-center justify-center shadow-lg text-white select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize,
        background: `linear-gradient(135deg, ${COLORS.navy} 0%, ${COLORS.wine} 100%)`,
      }}
      aria-hidden
    >
      🐾
    </div>
  );
}
