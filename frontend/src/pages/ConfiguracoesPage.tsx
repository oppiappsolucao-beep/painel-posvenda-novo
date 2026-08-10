import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";
import {
  addUnitEmail,
  fetchSettingsUnits,
  fetchUnitEmails,
  removeUnitEmail,
  UnitKey,
} from "../lib/api";
import { COLORS } from "../lib/utils";

export function ConfiguracoesPage() {
  const { user, loading, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const isFinanceiro = hasRole("financeiro");

  const [selectedUnit, setSelectedUnit] = useState<UnitKey>(user?.unit || "campinas");
  const [newEmail, setNewEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    if (user?.unit) setSelectedUnit(user.unit);
  }, [user?.unit]);

  const { data: units = [] } = useQuery({
    queryKey: ["settings-units"],
    queryFn: fetchSettingsUnits,
    enabled: !!user && isFinanceiro,
  });

  const queryUnit = isFinanceiro && !user?.unit ? selectedUnit : (user?.unit || selectedUnit);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["settings-emails", queryUnit],
    queryFn: () => fetchUnitEmails(queryUnit),
    enabled: !!user,
  });

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const unit = isFinanceiro && !user?.unit ? selectedUnit : user?.unit || selectedUnit;
      const result = await addUnitEmail(newEmail, unit);
      setNewEmail("");
      setMessage(result.message);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["settings-emails"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar e-mail.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: number) => {
    setError("");
    setMessage("");
    setRemovingId(id);
    try {
      const unit = isFinanceiro && !user?.unit ? selectedUnit : user?.unit || selectedUnit;
      const result = await removeUnitEmail(id, unit);
      setMessage(result.message);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["settings-emails"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover e-mail.");
    } finally {
      setRemovingId(null);
    }
  };

  if (!loading && !user) return <Navigate to="/login" replace />;

  const unitLabel = data?.unitLabel || queryUnit;

  return (
    <AppLayout
      title="Configurações"
      emoji="⚙️"
      caption={`E-mails de notificação — ${unitLabel}`}
    >
      <div className="bg-white rounded-2xl shadow-md p-6 border border-slate-100 max-w-4xl w-full mx-auto">
        <p className="text-sm text-slate-600 mb-4">
          Gerencie os e-mails que recebem a documentação do filhote e outras notificações da unidade.
          Os e-mails saem de <strong>contato@skoobpet.com.br</strong>; aqui você define quem recebe.
        </p>

        {isFinanceiro && !user?.unit && (
          <label className="block mb-4">
            <span className="text-sm font-semibold text-slate-600">Unidade</span>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value as UnitKey)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-white"
            >
              {(units.length ? units : [{ key: "campinas" as UnitKey, label: "Campinas" }]).map((unit) => (
                <option key={unit.key} value={unit.key}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {!isFinanceiro && user?.unit && (
          <div className="mb-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
            Unidade: <strong>{unitLabel}</strong>
          </div>
        )}

        {message && (
          <div className="mb-3 text-sm text-green-700 bg-green-50 rounded-lg p-3 border border-green-200">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 rounded-lg p-3 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6">
          <label className="block flex-1 min-w-0">
            <span className="text-sm font-semibold text-slate-600">Adicionar e-mail</span>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="exemplo@outlook.com"
              className="mt-2 w-full rounded-xl border border-slate-200 px-5 py-4 text-base sm:text-lg"
              required
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto shrink-0 px-8 py-4 rounded-xl text-white font-bold text-base disabled:opacity-50"
            style={{ background: COLORS.navy }}
          >
            {submitting ? "Salvando..." : "Adicionar"}
          </button>
        </form>

        <div className="border-t border-slate-100 pt-4">
          <div className="text-sm font-bold text-slate-800 mb-3">E-mails cadastrados</div>
          {isLoading && <div className="text-sm text-slate-500">Carregando...</div>}
          {!isLoading && (data?.items.length ?? 0) === 0 && (
            <div className="text-sm text-slate-500">Nenhum e-mail cadastrado.</div>
          )}
          <ul className="space-y-2">
            {(data?.items || []).map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-5 py-4 bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 text-base sm:text-lg break-all">{item.email}</div>
                  <div className="text-xs text-slate-500">Cadastrado em {item.createdAt}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemove(item.id)}
                  disabled={removingId === item.id || (data?.items.length ?? 0) <= 1}
                  className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40 disabled:no-underline shrink-0"
                  title={(data?.items.length ?? 0) <= 1 ? "Mantenha ao menos um e-mail" : "Excluir"}
                >
                  {removingId === item.id ? "..." : "Excluir"}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 mt-3">
            É necessário manter pelo menos um e-mail por unidade.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
