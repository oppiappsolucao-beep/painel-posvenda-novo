import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";
import {
  createBreed,
  fetchBreeds,
  setBreedActive,
  type Breed,
  type PetSpecies,
} from "../lib/api";
import { COLORS } from "../lib/utils";

const SPECIES: { key: PetSpecies; label: string; emoji: string }[] = [
  { key: "CANINA", label: "Cachorro", emoji: "🐶" },
  { key: "FELINA", label: "Gato", emoji: "🐱" },
];

export function RacasPage() {
  const { user, loading, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [species, setSpecies] = useState<PetSpecies>("CANINA");
  const [breedName, setBreedName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);

  const { data: breeds = [], refetch } = useQuery({
    queryKey: ["breeds-all"],
    queryFn: () => fetchBreeds(),
    enabled: !!user && hasRole("financeiro"),
  });

  const filtered = breeds.filter((b) => b.species === species);
  const currentSpecies = SPECIES.find((s) => s.key === species)!;

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      await createBreed(breedName, species);
      setBreedName("");
      setMessage(`Raça cadastrada para ${currentSpecies.label.toLowerCase()}.`);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["breeds"] });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar raça.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (breed: Breed) => {
    setDeactivatingId(breed.id);
    setError("");
    setMessage("");
    try {
      const result = await setBreedActive(breed.id, false);
      queryClient.setQueryData<Breed[]>(["breeds-all"], (old) =>
        (old ?? []).filter((b) => b.id !== breed.id),
      );
      setMessage(result.message);
      queryClient.invalidateQueries({ queryKey: ["breeds"] });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao desativar raça.");
    } finally {
      setDeactivatingId(null);
    }
  };

  if (!loading && !user) return <Navigate to="/login" replace />;

  return (
    <AppLayout
      title="Raças"
      emoji="🐾"
      caption={`${currentSpecies.emoji} ${filtered.length} raça(s) ativa(s)`}
      requireFinance
    >
      {hasRole("financeiro") && (
        <div className="bg-white rounded-2xl shadow-md p-5 border border-slate-100">
          <p className="text-sm text-slate-500 mb-4">
            Cadastre raças de cachorro ou gato. Ao desativar, a raça some da lista — contratos antigos na planilha são preservados.
          </p>

          <div className="flex flex-wrap gap-2 mb-5">
            {SPECIES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSpecies(s.key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  species === s.key ? "text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                style={species === s.key ? { background: COLORS.navy } : undefined}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>

          {message && (
            <div className="mb-3 text-sm text-green-700 bg-green-50 rounded-lg p-3">{message}</div>
          )}
          {error && (
            <div className="mb-3 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</div>
          )}

          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mb-6">
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">
                Nova raça ({currentSpecies.label.toLowerCase()})
              </span>
              <input
                type="text"
                value={breedName}
                onChange={(e) => setBreedName(e.target.value)}
                placeholder="Ex: Golden Retriever"
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5"
                required
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full md:w-auto px-5 py-2.5 rounded-xl text-white font-semibold disabled:opacity-60"
                style={{ background: COLORS.navy }}
              >
                {submitting ? "Salvando..." : "Adicionar raça"}
              </button>
            </div>
          </form>

          {filtered.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">
              Nenhuma raça cadastrada para {currentSpecies.label.toLowerCase()}.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b bg-slate-50">
                    <th className="px-4 py-3">Raça</th>
                    <th className="px-4 py-3">Espécie</th>
                    <th className="px-4 py-3">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((breed) => (
                    <tr key={breed.id} className="border-b border-slate-50 bg-white">
                      <td className="px-4 py-3 font-medium text-slate-900">{breed.name}</td>
                      <td className="px-4 py-3">
                        {breed.species === "CANINA" ? "🐶 Cachorro" : "🐱 Gato"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleDeactivate(breed)}
                          disabled={deactivatingId === breed.id}
                          className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-60"
                          style={{ background: COLORS.wine }}
                        >
                          {deactivatingId === breed.id ? "Aguarde..." : "Desativar"}
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
