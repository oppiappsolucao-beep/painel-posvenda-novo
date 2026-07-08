import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "../components/AppLayout";
import { KpiCard } from "../components/KpiCard";
import { useAuth } from "../context/AuthContext";
import { fetchStatusAssinatura } from "../lib/api";
import { COLORS } from "../lib/utils";

type SortMode = "ultimo_enviado" | "alfabetica";

export function StatusAssinaturaPage() {
  const { user, loading } = useAuth();
  const [search, setSearch] = useState("");
  const [nome, setNome] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [status, setStatus] = useState("todos");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("ultimo_enviado");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [applied, setApplied] = useState({ nome: "", dataInicio: "", dataFim: "", status: "todos" });

  useEffect(() => {
    if (!sortMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [sortMenuOpen]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["status-assinatura", applied],
    queryFn: () => fetchStatusAssinatura(applied),
    refetchInterval: 15000,
    enabled: !!user,
  });

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    const q = search.trim().toLowerCase();
    const items = !q
      ? data.items
      : data.items.filter(
          (item) =>
            item.nome.toLowerCase().includes(q) ||
            item.identificador.toLowerCase().includes(q) ||
            item.email.toLowerCase().includes(q),
        );

    return sortItems(items, sortMode);
  }, [data?.items, search, sortMode]);

  const assinadosCount = filteredItems.filter((item) => item.status === "assinado").length;
  const pendentesCount = filteredItems.filter((item) => item.status === "pendente").length;

  if (!loading && !user) return <Navigate to="/login" replace />;

  const applyFilters = () => {
    setApplied({ nome, dataInicio, dataFim, status });
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setNome("");
    setDataInicio("");
    setDataFim("");
    setStatus("todos");
    setSearch("");
    setApplied({ nome: "", dataInicio: "", dataFim: "", status: "todos" });
    setFiltersOpen(false);
  };

  return (
    <AppLayout
      title="Status De Assinatura"
      emoji="✍️"
      caption={data ? `Total de registros: ${data.total}` : undefined}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <KpiCard
          title="✅ Contratos assinados"
          value={isLoading ? "—" : assinadosCount}
          subtitle="documentos concluídos"
          accent="#16a34a"
          valueColor="#16a34a"
        />
        <KpiCard
          title="⏳ Contratos pendentes"
          value={isLoading ? "—" : pendentesCount}
          subtitle="aguardando assinatura"
          accent="#dc2626"
          valueColor="#dc2626"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar no relatório"
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B1D6D]/20"
            />
            <button
              type="button"
              onClick={() => refetch()}
              className="px-4 py-2.5 rounded-xl text-white font-semibold"
              style={{ background: COLORS.navy }}
              title="Atualizar"
            >
              🔍
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="px-4 py-2.5 rounded-xl text-white font-semibold flex items-center gap-2"
              style={{ background: COLORS.navy2 }}
              title="Filtros"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden>
                <path d="M3 4.5h18l-7.2 9.3V19l-3.6 2v-5.2L3 4.5z" />
              </svg>
            </button>
          </div>
        </div>

        {filtersOpen && (
          <div className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Nome</span>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Filtrar por nome"
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-white"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Data inicial</span>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-white"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Data final</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-white"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-white"
              >
                <option value="todos">Todos</option>
                <option value="assinado">Assinados</option>
                <option value="pendente">Pendentes</option>
              </select>
            </label>
            <div className="md:col-span-2 xl:col-span-4 flex gap-2">
              <button
                type="button"
                onClick={applyFilters}
                className="px-5 py-2.5 rounded-xl text-white font-bold"
                style={{ background: COLORS.navy }}
              >
                Aplicar filtros
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-600"
              >
                Limpar
              </button>
            </div>
          </div>
        )}

        {isLoading && <div className="p-8 text-center text-slate-500">Carregando contratos...</div>}
        {error && (
          <div className="p-8 text-center text-red-600">
            Erro ao carregar dados: {error instanceof Error ? error.message : "Erro desconhecido"}
          </div>
        )}

        {data && !isLoading && (
          <div className="mx-4 mb-4 rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
            <div className="overflow-x-auto">
              <div
                className="flex items-center justify-between px-4 py-3 text-white text-sm font-bold uppercase tracking-wide rounded-t-2xl"
                style={{ background: COLORS.navy }}
              >
                <span>Contratos cadastrados</span>
                <div className="relative" ref={sortMenuRef}>
                  <button
                    type="button"
                    onClick={() => setSortMenuOpen((v) => !v)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white shadow-md hover:opacity-90 transition-opacity"
                    style={{ background: `linear-gradient(135deg, ${COLORS.navy2} 0%, ${COLORS.wine} 100%)` }}
                    title="Organizar lista"
                    aria-label="Organizar lista"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className={`w-5 h-5 transition-transform ${sortMenuOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    >
                      <path d="M12 16l-6-6h12l-6 6z" />
                    </svg>
                  </button>
                  {sortMenuOpen && (
                    <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-100 z-20 overflow-hidden normal-case tracking-normal">
                      <button
                        type="button"
                        onClick={() => {
                          setSortMode("ultimo_enviado");
                          setSortMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 ${sortMode === "ultimo_enviado" ? "font-bold text-slate-900 bg-slate-50" : "text-slate-600"}`}
                      >
                        Último enviado
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSortMode("alfabetica");
                          setSortMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 border-t border-slate-100 ${sortMode === "alfabetica" ? "font-bold text-slate-900 bg-slate-50" : "text-slate-600"}`}
                      >
                        Ordem alfabética
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <table className="w-full min-w-[920px]">
                <thead>
                  <tr className="text-white text-sm" style={{ background: COLORS.navy2 }}>
                    <th className="text-left px-4 py-3 font-bold">Id</th>
                    <th className="text-left px-4 py-3 font-bold">Identificador do arquivo</th>
                    <th className="text-center px-4 py-3 font-bold">Status</th>
                    <th className="text-left px-4 py-3 font-bold">Mais informações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                        Nenhum contrato encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                        <td className="px-4 py-4 text-sm text-slate-700">{item.id}</td>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-800">{item.nome}</div>
                          <a
                            href={item.linkAssinatura || "#"}
                            target={item.linkAssinatura ? "_blank" : undefined}
                            rel={item.linkAssinatura ? "noreferrer" : undefined}
                            className={`text-sm ${item.linkAssinatura ? "text-blue-600 hover:underline" : "text-slate-500 cursor-default"}`}
                            onClick={(e) => !item.linkAssinatura && e.preventDefault()}
                          >
                            {item.identificador}
                          </a>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className={`font-bold ${item.status === "assinado" ? "text-green-700" : "text-slate-900"}`}>
                            {item.statusLabel}
                          </div>
                          {item.linkAssinatura && (
                            <a
                              href={item.linkAssinatura}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-slate-500 hover:text-blue-600 hover:underline"
                            >
                              [Acompanhar documento]
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600 leading-6">
                          <div>Disparo em: {item.disparoEm}</div>
                          <div>Atualizado em: {item.atualizadoEm}</div>
                          <div>Compra: {item.dataCompra}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 text-center text-sm text-slate-500 border-t border-slate-100 bg-white rounded-b-2xl">
              Mostrando de 1 a {filteredItems.length} de {filteredItems.length} documento(s)
              {sortMode === "ultimo_enviado" ? " • ordenado por último enviado" : " • ordenado alfabeticamente"}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function parseBrDate(value: string): number {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const [, dd, mm, yyyy] = m;
  return new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10)).getTime();
}

function parseBrDateTime(value: string): number {
  if (!value || value === "—") return 0;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return parseBrDate(value) === Number.MAX_SAFE_INTEGER ? 0 : parseBrDate(value);
  const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = m;
  return new Date(
    parseInt(yyyy, 10),
    parseInt(mm, 10) - 1,
    parseInt(dd, 10),
    parseInt(hh, 10),
    parseInt(mi, 10),
    parseInt(ss, 10),
  ).getTime();
}

function sortItems<T extends { nome: string; disparoEm: string; atualizadoEm: string }>(
  items: T[],
  mode: SortMode,
): T[] {
  const list = [...items];
  if (mode === "alfabetica") {
    return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  }
  return list.sort((a, b) => {
    const ta = parseBrDateTime(a.disparoEm) || parseBrDateTime(a.atualizadoEm);
    const tb = parseBrDateTime(b.disparoEm) || parseBrDateTime(b.atualizadoEm);
    return tb - ta;
  });
}
