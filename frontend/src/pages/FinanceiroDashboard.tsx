import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout, FilterBar } from "../components/AppLayout";
import { KpiCard } from "../components/KpiCard";
import { BarChart } from "../components/BarChart";
import { useAuth } from "../context/AuthContext";
import { fetchFinanceiro } from "../lib/api";
import { COLORS, monthKeyNow } from "../lib/utils";

export function FinanceiroDashboard() {
  const { user, loading, hasRole } = useAuth();
  const [mes, setMes] = useState(monthKeyNow());
  const [unidade, setUnidade] = useState("Todas");

  const { data, isLoading, error } = useQuery({
    queryKey: ["financeiro", mes, unidade],
    queryFn: () => fetchFinanceiro(mes, unidade),
    refetchInterval: 10000,
    enabled: !!user && hasRole("financeiro"),
  });

  if (!loading && !user) return <Navigate to="/login" replace />;

  return (
    <AppLayout
      title="Financeiro SkoobPet"
      emoji="💰"
      caption={data ? `Total de registros: ${data.total}` : undefined}
      requireFinance
    >
      {hasRole("financeiro") && data && (
        <FilterBar
          meses={data.meses}
          unidades={data.unidades}
          mes={mes}
          unidade={unidade}
          onMesChange={setMes}
          onUnidadeChange={setUnidade}
        />
      )}

      {hasRole("financeiro") && isLoading && <div className="text-center py-12 text-slate-500">Carregando...</div>}
      {hasRole("financeiro") && error && <div className="bg-red-50 text-red-700 rounded-xl p-4">Erro ao carregar dados.</div>}

      {hasRole("financeiro") && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KpiCard title="💰 Faturamento total" value={data.kpis.faturamentoTotalFmt} subtitle={mes} accent={COLORS.navy} valueSize={22} />
            <KpiCard title="🛍️ Vendas no mês" value={data.kpis.totalVendas} subtitle={mes} accent={COLORS.wine2} />
            <KpiCard title="📊 Ticket médio" value={data.kpis.ticketMedioFmt} subtitle="por venda" accent={COLORS.wine} valueSize={22} />
            <KpiCard title="🐶 Raças vendidas" value={data.kpis.totalRacas} subtitle="no mês" accent={COLORS.navy2} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <BarChart data={data.charts.faturamentoUnidade} title="Faturamento por Unidade" emoji="🏬" money />
            <BarChart data={data.charts.faturamentoRaca} title="Valor por raça" emoji="💵" money />
            <BarChart data={data.charts.faturamentoVendedor} title="Vendedoras que mais faturaram" emoji="🏆" money />
            <div className="bg-white rounded-2xl shadow-md overflow-hidden">
              <div className="px-5 pt-4 pb-2 border-b border-slate-100">
                <div className="font-black">🧾 Faturamento por vendedora</div>
              </div>
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="pb-2">Vendedora</th>
                      <th className="pb-2">Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tabelaVendedor.map((v: { vendedora: string; faturamento: string }) => (
                      <tr key={v.vendedora} className="border-b border-slate-50">
                        <td className="py-2 font-medium">{v.vendedora}</td>
                        <td className="py-2">{v.faturamento}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {data.charts.faturamentoAnual?.length > 0 && (
            <BarChart
              data={data.charts.faturamentoAnual.map((d: { mes: string; faturamento: number }) => ({ name: d.mes, total: d.faturamento }))}
              title="Faturamento total do ano"
              emoji="📈"
              subtitle="Mensal conforme crescimento da planilha"
              money
              height={420}
            />
          )}
        </>
      )}
    </AppLayout>
  );
}
