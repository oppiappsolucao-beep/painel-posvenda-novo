import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout, FilterBar } from "../components/AppLayout";
import { KpiCard, SummaryCard } from "../components/KpiCard";
import { BarChart } from "../components/BarChart";
import { useAuth } from "../context/AuthContext";
import { fetchOperacao } from "../lib/api";
import { COLORS, defaultUnitFilter, monthKeyNow } from "../lib/utils";

export function OperacaoDashboard() {
  const { user, loading } = useAuth();
  const [mes, setMes] = useState(monthKeyNow());
  const [unidade, setUnidade] = useState(() => defaultUnitFilter(user?.unit));

  const { data, isLoading, error } = useQuery({
    queryKey: ["operacao", mes, unidade],
    queryFn: () => fetchOperacao(mes, unidade),
    refetchInterval: 10000,
    enabled: !!user,
  });

  if (!loading && !user) return <Navigate to="/login" replace />;

  return (
    <AppLayout title="Operação SkoobPet" emoji="⚙️" caption={data ? `Total de registros: ${data.total}` : undefined}>
      {data && (
        <FilterBar
          meses={data.meses}
          unidades={data.unidades}
          mes={mes}
          unidade={unidade}
          onMesChange={setMes}
          onUnidadeChange={setUnidade}
        />
      )}

      {isLoading && <Loading />}
      {error && <ErrorMsg error={error} />}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <KpiCard title="💬 1º contato hoje" value={data.kpis.primeiroHoje} subtitle="registros de hoje" accent={COLORS.navy} />
            <KpiCard title="💬 2º contato hoje" value={data.kpis.segundoHoje} subtitle="registros de hoje" accent={COLORS.navy2} />
            <KpiCard title="💬 3º contato hoje" value={data.kpis.terceiroHoje} subtitle="registros de hoje" accent={COLORS.wine2} />
            <KpiCard title="🧾 Primeiro Contato Mês" value={data.kpis.primeiroMes} subtitle={mes} accent={COLORS.navy} valueSize={30} />
            <KpiCard title="🧾 Segundo Contato Mês" value={data.kpis.segundoMes} subtitle={mes} accent={COLORS.wine} valueSize={30} />
            <KpiCard title="🧾 Terceiro Contato Mês" value={data.kpis.terceiroMes} subtitle={mes} accent={COLORS.wine2} valueSize={30} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <SummaryCard
              title="Status com erro"
              value={data.kpis.erroMes}
              subtitle={`Mês selecionado: ${mes}`}
              accent="#ef4444"
              valueColor={data.kpis.erroMes ? "#ef4444" : "#0f172a"}
            />
            <SummaryCard
              title="Vendas registradas no mês"
              value={data.kpis.vendasMes}
              subtitle={`Mês Venda: ${mes}`}
              accent={COLORS.wine}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BarChart data={data.charts.contatosMes} title="Contatos por mês" emoji="📞" subtitle="Distribuição mensal dos 3 contatos" />
            <BarChart data={data.charts.vendasUnidade} title="Vendas por unidade no mês" emoji="🏬" subtitle="Quantidade por unidade" />
            <BarChart data={data.charts.topRacas} title="Top 10 raças" emoji="🐶" subtitle="Raças mais vendidas no mês" />
            <BarChart data={data.charts.vendasVendedor} title="Vendas por vendedora" emoji="👩‍💼" subtitle="Ranking no mês" />
          </div>
        </>
      )}
    </AppLayout>
  );
}

function Loading() {
  return <div className="text-center py-12 text-slate-500">Carregando dados...</div>;
}

function ErrorMsg({ error }: { error: unknown }) {
  let msg = "Erro ao carregar planilha.";
  if (error && typeof error === "object" && "response" in error) {
    const ax = error as { response?: { data?: { error?: string } } };
    if (ax.response?.data?.error) msg = ax.response.data.error;
  }
  return (
    <div className="bg-red-50 text-red-700 rounded-xl p-4">
      <strong>{msg}</strong>
      <p className="text-sm mt-2">Confira se o arquivo <code>backend/.env</code> existe e reinicie o servidor (Ctrl+C → npm run dev).</p>
    </div>
  );
}
