import { COLORS } from "../lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  accent?: string;
  valueColor?: string;
  valueSize?: number;
}

export function KpiCard({
  title,
  value,
  subtitle,
  accent = COLORS.navy,
  valueColor = "#0f172a",
  valueSize = 38,
}: KpiCardProps) {
  return (
    <div
      className="bg-white rounded-2xl p-4 shadow-md min-h-[120px] overflow-hidden"
      style={{ borderLeft: `8px solid ${accent}` }}
    >
      <div className="text-sm font-black text-slate-600">{title}</div>
      <div
        className="font-black leading-tight mt-1.5 break-words"
        style={{ fontSize: valueSize, color: valueColor }}
      >
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-1.5">{subtitle}</div>
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  accent: string;
  valueColor?: string;
}

export function SummaryCard({ title, value, subtitle, accent, valueColor = "#0f172a" }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-[18px] p-[18px] border border-slate-100 shadow-lg min-h-[116px] relative">
      <div className="absolute left-0 top-3 bottom-3 w-2 rounded-lg" style={{ background: accent }} />
      <div className="pl-[18px]">
        <div className="text-[15px] font-black text-slate-900 mb-2.5">{title}</div>
        <div className="text-[42px] font-black leading-none mb-2.5" style={{ color: valueColor }}>
          {value}
        </div>
        <div className="text-[13px] text-slate-500">{subtitle}</div>
      </div>
    </div>
  );
}
