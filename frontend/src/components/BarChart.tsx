import Plot from "react-plotly.js";
import { COLORS } from "../lib/utils";

interface BarChartProps {
  data: { name: string; total: number }[];
  title?: string;
  subtitle?: string;
  emoji?: string;
  money?: boolean;
  height?: number;
}

export function BarChart({ data, title, subtitle, emoji = "📊", money = false, height = 360 }: BarChartProps) {
  if (!data.length) {
    return (
      <Panel title={title} subtitle={subtitle} emoji={emoji}>
        <p className="text-slate-500 text-sm py-8 text-center">Sem registros para o filtro selecionado.</p>
      </Panel>
    );
  }

  const text = money ? data.map((d) => formatMoney(d.total)) : data.map((d) => String(d.total));

  return (
    <Panel title={title} subtitle={subtitle} emoji={emoji}>
      <Plot
        data={[
          {
            type: "bar",
            x: data.map((d) => d.name),
            y: data.map((d) => d.total),
            marker: { color: COLORS.palette.slice(0, data.length) },
            text,
            textposition: "outside",
            cliponaxis: false,
            hovertemplate: money
              ? "<b>%{x}</b><br>Faturamento: %{text}<extra></extra>"
              : "<b>%{x}</b><br>Total: %{y}<extra></extra>",
          },
        ]}
        layout={{
          height,
          paper_bgcolor: "#ffffff",
          plot_bgcolor: "#ffffff",
          margin: { t: 8, b: 80, l: 10, r: 10 },
          font: { color: "#0f172a" },
          showlegend: false,
          bargap: 0.18,
          xaxis: { tickangle: -28, showgrid: false, tickfont: { size: 11, color: COLORS.grayText } },
          yaxis: { showgrid: true, gridcolor: "rgba(100,116,139,0.12)", tickfont: { size: 11, color: COLORS.grayText } },
        }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: "100%" }}
        useResizeHandler
      />
    </Panel>
  );
}

function formatMoney(v: number) {
  const s = v.toFixed(2).replace(".", ",");
  const [int, dec] = s.split(",");
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

function Panel({ title, subtitle, emoji, children }: { title?: string; subtitle?: string; emoji?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-md overflow-hidden">
      {(title || subtitle) && (
        <div className="px-5 pt-4 pb-2 border-b border-slate-100">
          {title && <div className="font-black text-slate-900">{emoji} {title}</div>}
          {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}
