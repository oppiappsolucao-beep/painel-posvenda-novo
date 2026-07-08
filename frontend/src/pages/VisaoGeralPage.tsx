import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout, FilterBar } from "../components/AppLayout";
import { KpiCard } from "../components/KpiCard";
import { BarChart } from "../components/BarChart";
import { useAuth } from "../context/AuthContext";
import { fetchVisaoGeral } from "../lib/api";
import { COLORS, monthKeyNow } from "../lib/utils";

export function VisaoGeralPage() {
  const { user, loading } = useAuth();
  const [mes, setMes] = useState(monthKeyNow());
  const [unidade, setUnidade] = useState("Todas");

  const { data, isLoading, error } = useQuery({
    queryKey: ["visao-geral", mes, unidade],
    queryFn: () => fetchVisaoGeral(mes, unidade),
    refetchInterval: 10000,
    enabled: !!user,
  });

  if (!loading && !user) return <Navigate to="/login" replace />;

  return (
    <AppLayout title="Visão Geral" emoji="📊" caption={data ? `Total de registros: ${data.total}` : undefined}>
      {data && (
        <FilterBar meses={data.meses} unidades={data.unidades} mes={mes} unidade={unidade} onMesChange={setMes} onUnidadeChange={setUnidade} />
      )}

      {isLoading && <div className="text-center py-12 text-slate-500">Carregando...</div>}
      {error && <div className="bg-red-50 text-red-700 rounded-xl p-4">Erro ao carregar planilha.</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <KpiCard title="💬 1º contato hoje" value={data.kpis.primeiroHoje} subtitle="hoje" accent={COLORS.navy} />
            <KpiCard title="💬 2º contato hoje" value={data.kpis.segundoHoje} subtitle="hoje" accent={COLORS.navy2} />
            <KpiCard title="💬 3º contato hoje" value={data.kpis.terceiroHoje} subtitle="hoje" accent={COLORS.wine2} />
            <KpiCard title="📄 1º contato mês" value={data.kpis.primeiroMes} subtitle={mes} accent={COLORS.navy} valueSize={28} />
            <KpiCard title="📄 2º contato mês" value={data.kpis.segundoMes} subtitle={mes} accent={COLORS.wine} valueSize={28} />
            <KpiCard title="📄 3º contato mês" value={data.kpis.terceiroMes} subtitle={mes} accent={COLORS.wine2} valueSize={28} />
          </div>

          {data.financeiro && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <KpiCard title="💰 Faturamento" value={data.financeiro.faturamentoTotalFmt} subtitle={mes} accent={COLORS.navy} valueSize={22} />
              <KpiCard title="🛍️ Vendas" value={data.financeiro.totalVendas} subtitle={mes} accent={COLORS.wine2} />
              <KpiCard title="📊 Ticket médio" value={data.financeiro.ticketMedioFmt} subtitle="por venda" accent={COLORS.wine} valueSize={22} />
              <KpiCard title="⚠️ Erros" value={data.kpis.erroMes} subtitle="status com erro" accent="#ef4444" />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BarChart data={data.charts.vendasUnidade} title="Vendas por loja" emoji="🏬" />
            <BarChart data={data.charts.vendasVendedor} title="Vendas por vendedor" emoji="👩‍💼" />
            <BarChart data={data.charts.topRacas} title="Top raças" emoji="🐶" />
            {data.finCharts?.faturamentoAnual?.length > 0 && (
              <BarChart
                data={data.finCharts.faturamentoAnual.map((d: { mes: string; faturamento: number }) => ({ name: d.mes, total: d.faturamento }))}
                title="Faturamento anual"
                emoji="📈"
                money
              />
            )}
          </div>
        </>
      )}
    </AppLayout>
  );
}
