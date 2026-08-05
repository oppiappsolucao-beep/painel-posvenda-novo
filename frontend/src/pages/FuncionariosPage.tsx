import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";
import {
  createEmployee,
  fetchEmployees,
  setEmployeeActive,
  type Employee,
  type UnitKey,
} from "../lib/api";
import { COLORS, UNIT_LABELS } from "../lib/utils";

export function FuncionariosPage() {
  const { user, loading, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [employeeName, setEmployeeName] = useState("");
  const [employeeUnit, setEmployeeUnit] = useState<UnitKey>("campinas");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);

  const { data: employees = [], refetch } = useQuery({
    queryKey: ["employees-all"],
    queryFn: () => fetchEmployees(),
    enabled: !!user && hasRole("financeiro"),
  });

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      await createEmployee(employeeName, employeeUnit);
      setEmployeeName("");
      setMessage("Funcionário cadastrado com sucesso.");
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar funcionário.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (employee: Employee) => {
    setDeactivatingId(employee.id);
    setError("");
    setMessage("");
    try {
      const result = await setEmployeeActive(employee.id, false);
      queryClient.setQueryData<Employee[]>(["employees-all"], (old) =>
        (old ?? []).filter((e) => e.id !== employee.id),
      );
      setMessage(result.message);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao desativar funcionário.");
    } finally {
      setDeactivatingId(null);
    }
  };

  if (!loading && !user) return <Navigate to="/login" replace />;

  return (
    <AppLayout
      title="Funcionários"
      emoji="👩‍💼"
      caption={`${employees.length} funcionário(s) ativo(s)`}
      requireFinance
    >
      {hasRole("financeiro") && (
        <div className="bg-white rounded-2xl shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500 mb-4">
            Vendedoras das planilhas entram automaticamente aqui. Você também pode cadastrar manualmente por unidade.
            Ao desativar, o funcionário some da lista — o histórico na planilha é preservado.
          </p>

          {message && (
            <div className="mb-3 text-sm text-green-700 bg-green-50 rounded-lg p-3">{message}</div>
          )}
          {error && (
            <div className="mb-3 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</div>
          )}

          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 mb-6">
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
                disabled={submitting}
                className="w-full md:w-auto px-5 py-2.5 rounded-xl text-white font-semibold disabled:opacity-60"
                style={{ background: COLORS.navy }}
              >
                {submitting ? "Salvando..." : "Adicionar"}
              </button>
            </div>
          </form>

          {employees.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Nenhum funcionário cadastrado ainda.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b bg-slate-50">
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Unidade</th>
                    <th className="px-4 py-3">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id} className="border-b border-slate-50 bg-white">
                      <td className="px-4 py-3 font-medium text-slate-900">{employee.name}</td>
                      <td className="px-4 py-3">{employee.unitLabel}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleDeactivate(employee)}
                          disabled={deactivatingId === employee.id}
                          className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-60"
                          style={{ background: COLORS.wine }}
                        >
                          {deactivatingId === employee.id ? "Aguarde..." : "Desativar"}
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
    </AppLayout>
  );
}
