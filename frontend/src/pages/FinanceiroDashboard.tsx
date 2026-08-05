import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout, FilterBar } from "../components/AppLayout";
import { KpiCard } from "../components/KpiCard";
import { BarChart } from "../components/BarChart";
import { useAuth } from "../context/AuthContext";
import { fetchFinanceiro, fetchLockedAccounts, unlockAccount, fetchEmployees, createEmployee, setEmployeeActive, type Employee, type UnitKey } from "../lib/api";
import { COLORS, monthKeyNow, UNIT_LABELS } from "../lib/utils";

export function FinanceiroDashboard() {
  const { user, loading, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [mes, setMes] = useState(monthKeyNow());
  const [unidade, setUnidade] = useState("Todas");
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [unlockMessage, setUnlockMessage] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeUnit, setEmployeeUnit] = useState<UnitKey>("campinas");
  const [employeeMessage, setEmployeeMessage] = useState("");
  const [employeeError, setEmployeeError] = useState("");
  const [employeeSubmitting, setEmployeeSubmitting] = useState(false);
  const [togglingEmployeeId, setTogglingEmployeeId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["financeiro", mes, unidade],
    queryFn: () => fetchFinanceiro(mes, unidade),
    refetchInterval: 10000,
    enabled: !!user && hasRole("financeiro"),
  });

  const { data: lockedAccounts = [], refetch: refetchLocked } = useQuery({
    queryKey: ["locked-accounts"],
    queryFn: fetchLockedAccounts,
    refetchInterval: 15000,
    enabled: !!user && hasRole("financeiro"),
  });

  const { data: employees = [], refetch: refetchEmployees } = useQuery({
    queryKey: ["employees-all"],
    queryFn: () => fetchEmployees(undefined, true),
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

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmployeeError("");
    setEmployeeMessage("");
    setEmployeeSubmitting(true);
    try {
      await createEmployee(employeeName, employeeUnit);
      setEmployeeName("");
      setEmployeeMessage("Funcionário cadastrado com sucesso.");
      await refetchEmployees();
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: unknown) {
      setEmployeeError(err instanceof Error ? err.message : "Erro ao cadastrar funcionário.");
    } finally {
      setEmployeeSubmitting(false);
    }
  };

  const handleToggleEmployee = async (employee: Employee) => {
    setTogglingEmployeeId(employee.id);
    setEmployeeError("");
    setEmployeeMessage("");
    try {
      const result = await setEmployeeActive(employee.id, !employee.active);
      queryClient.setQueryData<Employee[]>(["employees-all"], (old) =>
        (old ?? []).map((e) => (e.id === employee.id ? { ...e, active: !employee.active } : e)),
      );
      setEmployeeMessage(result.message);
      await refetchEmployees();
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: unknown) {
      setEmployeeError(err instanceof Error ? err.message : "Erro ao atualizar funcionário.");
    } finally {
      setTogglingEmployeeId(null);
    }
  };

  if (!loading && !user) return <Navigate to="/login" replace />;

  return (
    <AppLayout
      title="Financeiro SkoobPet"
      emoji="💰"
      caption={data ? `Total de registros: ${data.total}` : undefined}
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
        <div className="bg-white rounded-2xl shadow-md p-5 mb-4 border border-slate-100">
          <div className="font-black text-slate-900 mb-1">👩‍💼 Funcionários</div>
          <p className="text-sm text-slate-500 mb-4">
            Cadastre vendedoras/funcionários por unidade. Ao desativar, o funcionário permanece na lista em cinza para reativação — o histórico na planilha é preservado.
          </p>

          {employeeMessage && (
            <div className="mb-3 text-sm text-green-700 bg-green-50 rounded-lg p-3">{employeeMessage}</div>
          )}
          {employeeError && (
            <div className="mb-3 text-sm text-red-700 bg-red-50 rounded-lg p-3">{employeeError}</div>
          )}

          <form onSubmit={handleAddEmployee} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 mb-5">
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Nome do funcionário</span>
              <input
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Ex: Maria Silva"
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Unidade</span>
              <select
                value={employeeUnit}
                onChange={(e) => setEmployeeUnit(e.target.value as UnitKey)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-white min-w-[140px]"
              >
                {(Object.entries(UNIT_LABELS) as [UnitKey, string][]).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={employeeSubmitting}
                className="w-full md:w-auto px-5 py-2.5 rounded-xl text-white font-semibold disabled:opacity-60"
                style={{ background: COLORS.navy }}
              >
                {employeeSubmitting ? "Salvando..." : "Adicionar"}
              </button>
            </div>
          </form>

          {employees.length === 0 ? (
            <div className="text-sm text-slate-500">Nenhum funcionário cadastrado ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="pb-2 pr-4">Nome</th>
                    <th className="pb-2 pr-4">Unidade</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr
                      key={employee.id}
                      className={`border-b transition-colors ${
                        employee.active
                          ? "border-slate-50 bg-white"
                          : "border-slate-200 bg-slate-200/70 text-slate-500"
                      }`}
                    >
                      <td className={`py-2.5 pr-4 font-medium ${employee.active ? "text-slate-900" : "text-slate-500"}`}>
                        {employee.name}
                      </td>
                      <td className="py-2.5 pr-4">{employee.unitLabel}</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            employee.active ? "bg-green-100 text-green-800" : "bg-slate-300 text-slate-600"
                          }`}
                        >
                          {employee.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          onClick={() => handleToggleEmployee(employee)}
                          disabled={togglingEmployeeId === employee.id}
                          className={`px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-60 ${
                            employee.active ? "" : "ring-2 ring-white/80"
                          }`}
                          style={{ background: employee.active ? COLORS.wine : COLORS.navy2 }}
                        >
                          {togglingEmployeeId === employee.id
                            ? "Aguarde..."
                            : employee.active
                              ? "Desativar"
                              : "Reativar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
