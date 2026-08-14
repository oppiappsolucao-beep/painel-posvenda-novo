import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout, FilterBar } from "../components/AppLayout";
import { KpiCard } from "../components/KpiCard";
import { BarChart } from "../components/BarChart";
import { useAuth } from "../context/AuthContext";
import { fetchFinanceiro, fetchLockedAccounts, unlockAccount } from "../lib/api";
import { COLORS, monthKeyNow } from "../lib/utils";

type FinanceiroData = {
  total: number;
  meses: string[];
  unidades: string[];
  kpis: {
    faturamentoTotal: number;
    faturamentoTotalFmt: string;
    totalVendas: number;
    ticketMedio: number;
    ticketMedioFmt: string;
    totalRacas: number;
  };
  charts: {
    faturamentoUnidade: { name: string; total: number }[];
    faturamentoRaca: { name: string; total: number }[];
    faturamentoVendedor: { name: string; total: number }[];
    faturamentoAnual: { mes: string; faturamento: number }[];
  };
  tabelaVendedor: { vendedora: string; faturamento: string }[];
  warnings?: string[];
};

function emptyFinanceiroData(mes: string): FinanceiroData {
  return {
    total: 0,
    meses: [mes],
    unidades: ["Todas", "Campinas", "Piracicaba", "Indaiatuba"],
    kpis: {
      faturamentoTotal: 0,
      faturamentoTotalFmt: "R$ 0,00",
      totalVendas: 0,
      ticketMedio: 0,
      ticketMedioFmt: "R$ 0,00",
      totalRacas: 0,
    },
    charts: {
      faturamentoUnidade: [] as { name: string; total: number }[],
      faturamentoRaca: [] as { name: string; total: number }[],
      faturamentoVendedor: [] as { name: string; total: number }[],
      faturamentoAnual: [] as { mes: string; faturamento: number }[],
    },
    tabelaVendedor: [] as { vendedora: string; faturamento: string }[],
    warnings: [] as string[],
  };
}

export function FinanceiroDashboard() {
  const { user, loading, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [mes, setMes] = useState(monthKeyNow());
  const [unidade, setUnidade] = useState("Todas");
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [unlockMessage, setUnlockMessage] = useState("");

  const { data, isLoading, isFetching, error } = useQuery<FinanceiroData>({
    queryKey: ["financeiro", mes, unidade],
    queryFn: () => fetchFinanceiro(mes, unidade),
    refetchInterval: 10000,
    enabled: !!user && hasRole("financeiro"),
    placeholderData: (previous) => previous ?? emptyFinanceiroData(mes),
  });

  const financeiro = data ?? emptyFinanceiroData(mes);

  const { data: lockedAccounts = [], refetch: refetchLocked } = useQuery({
    queryKey: ["locked-accounts"],
    queryFn: fetchLockedAccounts,
    refetchInterval: 15000,
    enabled: !!user && hasRole("financeiro"),
  });

  const handleUnlock = async (email: string, unitLabel: string) => {
    setUnlocking(email);
    setUnlockMessage("");
    try {
      const result = await unlockAccount(email);
      setUnlockMessage(result.message || `${unitLabel} desbloqueada.`);
      await refetchLocked();
      queryClient.invalidateQueries({ queryKey: ["locked-accounts"] });
    } catch (err: unknown) {
      setUnlockMessage(err instanceof Error ? err.message : "Erro ao desbloquear.");
    } finally {
      setUnlocking(null);
    }
  };

  if (!loading && !user) return <Navigate to="/login" replace />;

  return (
    <AppLayout
      title="Financeiro SkoobPet"
      emoji="💰"
      caption={`Total de registros: ${financeiro.total}${isFetching && !isLoading ? " • atualizando…" : ""}`}
      requireFinance
    >
      {hasRole("financeiro") && (
        <div className="bg-white rounded-2xl shadow-md p-5 mb-4 border border-slate-100">
          <div className="font-black text-slate-900 mb-1">🔒 Contas bloqueadas</div>
          <p className="text-sm text-slate-500 mb-4">
            Após 3 tentativas incorretas de login, a unidade fica bloqueada até ser desbloqueada aqui.
          </p>
          {unlockMessage && (
            <div className="mb-3 text-sm text-green-700 bg-green-50 rounded-lg p-3">{unlockMessage}</div>
          )}
          {lockedAccounts.length === 0 ? (
            <div className="text-sm text-slate-500">Nenhuma unidade bloqueada no momento.</div>
          ) : (
            <div className="space-y-2">
              {lockedAccounts.map((item) => (
                <div
                  key={item.email}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-red-100 bg-red-50/60 px-4 py-3"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{item.unitLabel}</div>
                    <div className="text-sm text-slate-600">{item.email}</div>
                    <div className="text-xs text-slate-500">Bloqueado em {item.lockedAt}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnlock(item.email, item.unitLabel)}
                    disabled={unlocking === item.email}
                    className="px-4 py-2 rounded-xl text-white font-semibold disabled:opacity-60"
                    style={{ background: COLORS.navy }}
                  >
                    {unlocking === item.email ? "Desbloqueando..." : "Desbloquear"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {hasRole("financeiro") && (
        <FilterBar
          meses={financeiro.meses}
          unidades={financeiro.unidades}
          mes={mes}
          unidade={unidade}
          onMesChange={setMes}
          onUnidadeChange={setUnidade}
        />
      )}

      {hasRole("financeiro") && error && (
        <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm mb-4">
          Erro ao carregar dados: {error instanceof Error ? error.message : "Erro desconhecido"}
        </div>
      )}
      {hasRole("financeiro") && (financeiro.warnings?.length ?? 0) > 0 && (
        <div className="bg-amber-50 text-amber-900 rounded-xl p-4 text-sm mb-4">
          Algumas planilhas não carregaram: {financeiro.warnings?.join(" • ")}
        </div>
      )}
      {hasRole("financeiro") && financeiro.total === 0 && !error && (
        <div className="bg-slate-50 text-slate-600 rounded-xl p-4 text-sm mb-4">
          Nenhum contrato nas planilhas ainda — os indicadores abaixo ficam zerados até o primeiro cadastro.
        </div>
      )}

      {hasRole("financeiro") && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KpiCard title="💰 Faturamento total" value={financeiro.kpis.faturamentoTotalFmt} subtitle={mes} accent={COLORS.navy} valueSize={22} />
            <KpiCard title="🛍️ Vendas no mês" value={financeiro.kpis.totalVendas} subtitle={mes} accent={COLORS.wine2} />
            <KpiCard title="📊 Ticket médio" value={financeiro.kpis.ticketMedioFmt} subtitle="por venda" accent={COLORS.wine} valueSize={22} />
            <KpiCard title="🐶 Raças vendidas" value={financeiro.kpis.totalRacas} subtitle="no mês" accent={COLORS.navy2} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <BarChart data={financeiro.charts.faturamentoUnidade} title="Faturamento por Unidade" emoji="🏬" money />
            <BarChart data={financeiro.charts.faturamentoRaca} title="Valor por raça" emoji="💵" money />
            <BarChart data={financeiro.charts.faturamentoVendedor} title="Vendedoras que mais faturaram" emoji="🏆" money />
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
                    {financeiro.tabelaVendedor.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="py-4 text-center text-slate-500">
                          Sem vendas no filtro selecionado.
                        </td>
                      </tr>
                    ) : (
                      financeiro.tabelaVendedor.map((v) => (
                        <tr key={v.vendedora} className="border-b border-slate-50">
                          <td className="py-2 font-medium">{v.vendedora}</td>
                          <td className="py-2">{v.faturamento}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {financeiro.charts.faturamentoAnual.length > 0 ? (
            <BarChart
              data={financeiro.charts.faturamentoAnual.map((d) => ({ name: d.mes, total: d.faturamento }))}
              title="Faturamento total do ano"
              emoji="📈"
              subtitle="Mensal conforme crescimento da planilha"
              money
              height={420}
            />
          ) : (
            <BarChart
              data={[]}
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
