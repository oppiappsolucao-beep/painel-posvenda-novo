import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "../components/AppLayout";
import { KpiCard } from "../components/KpiCard";
import { useAuth } from "../context/AuthContext";
import { fetchStatusAssinatura, fetchContractPreview, StatusAssinaturaItem, SignatureProgress, SignatarioItem, initSignatureSession, signContractAsStore } from "../lib/api";
import { SignaturePad } from "../components/SignaturePad";
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
  const [previewItem, setPreviewItem] = useState<StatusAssinaturaItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [signItem, setSignItem] = useState<StatusAssinaturaItem | null>(null);
  const [storeSignature, setStoreSignature] = useState<string | null>(null);
  const [signSubmitting, setSignSubmitting] = useState(false);
  const [signError, setSignError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [applied, setApplied] = useState({ nome: "", dataInicio: "", dataFim: "", status: "todos" });

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
    refetchInterval: 10000,
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

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewItem(null);
    setPreviewError(null);
    setPreviewLoading(false);
  };

  const openPreview = async (item: StatusAssinaturaItem) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewItem(item);
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const blob = await fetchContractPreview(item.unitKey, item.sheetIndex);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Erro ao carregar contrato.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const copyClientLink = async (item: StatusAssinaturaItem, e: ReactMouseEvent) => {
    e.stopPropagation();
    let link = item.linkAssinatura || item.assinatura.clientSignUrl;
    if (!link && item.inAppSignature) {
      try {
        const result = await initSignatureSession(item.unitKey, item.sheetIndex);
        link = result.clientSignUrl;
        await refetch();
      } catch (err) {
        setCopyFeedback(err instanceof Error ? err.message : "Erro ao gerar link.");
        setTimeout(() => setCopyFeedback(""), 3000);
        return;
      }
    }
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopyFeedback("Link copiado!");
    setTimeout(() => setCopyFeedback(""), 2000);
  };

  const openStoreSign = (item: StatusAssinaturaItem, e: ReactMouseEvent) => {
    e.stopPropagation();
    setSignItem(item);
    setStoreSignature(null);
    setSignError("");
  };

  const closeStoreSign = () => {
    setSignItem(null);
    setStoreSignature(null);
    setSignError("");
  };

  const submitStoreSign = async () => {
    if (!signItem || !storeSignature) {
      setSignError("Desenhe a assinatura da loja.");
      return;
    }
    setSignSubmitting(true);
    setSignError("");
    try {
      await signContractAsStore(signItem.unitKey, signItem.sheetIndex, storeSignature);
      closeStoreSign();
      await refetch();
    } catch (err) {
      setSignError(err instanceof Error ? err.message : "Erro ao assinar.");
    } finally {
      setSignSubmitting(false);
    }
  };

  return (
    <AppLayout
      title="Status De Assinatura"
      emoji="✍️"
      caption={data ? `Total de registros: ${data.total}` : undefined}
    >
      {copyFeedback && (
        <div className="mb-3 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
          {copyFeedback}
        </div>
      )}
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
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 hover:bg-slate-50/80 cursor-pointer transition-colors"
                        onClick={() => openPreview(item)}
                        title="Clique para visualizar o contrato"
                      >
                        <td className="px-4 py-4 text-sm text-slate-700">{item.id}</td>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-800">{item.nome}</div>
                          <span className="text-sm text-slate-500">{item.identificador}</span>
                        </td>
                        <td className="px-4 py-4 text-center align-top min-w-[280px]">
                          <div className={`font-bold mb-2 ${item.status === "assinado" ? "text-green-700" : "text-slate-900"}`}>
                            {item.statusLabel}
                          </div>
                          <SignatureProgressPanel assinatura={item.assinatura} />
                          {item.inAppSignature && item.status !== "assinado" && (
                            <div className="mt-2 flex flex-wrap gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => copyClientLink(item, e)}
                                className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold"
                                style={{ background: COLORS.navy2 }}
                              >
                                Copiar link do cliente
                              </button>
                              {item.podeAssinarLoja && (
                                <button
                                  type="button"
                                  onClick={(e) => openStoreSign(item, e)}
                                  className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold"
                                  style={{ background: COLORS.wine }}
                                >
                                  Assinar como loja
                                </button>
                              )}
                            </div>
                          )}
                          {!item.inAppSignature && item.linkAssinatura && (
                            <a
                              href={item.linkAssinatura}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block mt-2 text-xs text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Acompanhar documento
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

      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closePreview}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 py-4 text-white"
              style={{ background: COLORS.navy }}
            >
              <div>
                <div className="text-xs uppercase tracking-wide opacity-80">Pré-visualização do contrato</div>
                <div className="font-bold text-lg">{previewItem.nome}</div>
                <div className="text-sm opacity-90">{previewItem.identificador}</div>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-xl font-bold"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="flex-1 bg-slate-100">
              {previewLoading && (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Carregando contrato...
                </div>
              )}
              {previewError && (
                <div className="h-full flex items-center justify-center text-red-600 px-6 text-center">
                  {previewError}
                </div>
              )}
              {previewUrl && !previewLoading && !previewError && (
                <iframe
                  src={previewUrl}
                  title={`Contrato ${previewItem.nome}`}
                  className="w-full h-full border-0 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {signItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeStoreSign}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Assinatura da loja</div>
              <div className="text-xl font-bold text-slate-900">{signItem.nome}</div>
            </div>
            <p className="text-sm text-slate-600">
              O cliente já assinou. Desenhe a assinatura da unidade para concluir o contrato.
            </p>
            <SignaturePad onChange={setStoreSignature} />
            {signError && <div className="text-sm text-red-600">{signError}</div>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeStoreSign}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitStoreSign}
                disabled={signSubmitting || !storeSignature}
                className="flex-1 py-2.5 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: COLORS.navy }}
              >
                {signSubmitting ? "Salvando..." : "Confirmar assinatura"}
              </button>
            </div>
          </div>
        </div>
      )}
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

function signatureStatusColor(status: SignatarioItem["status"]): string {
  switch (status) {
    case "assinado":
      return "#16a34a";
    case "pendente":
      return "#dc2626";
    case "aguardando":
      return "#d97706";
    default:
      return "#94a3b8";
  }
}

function SignatureProgressPanel({ assinatura }: { assinatura: SignatureProgress }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Assinaturas
        </span>
        <span className="text-xs font-bold text-slate-700">{assinatura.progresso}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${assinatura.progresso}%`,
            background: assinatura.progresso === 100 ? "#16a34a" : `linear-gradient(90deg, ${COLORS.navy}, ${COLORS.wine})`,
          }}
        />
      </div>
      <div className="space-y-2">
        {assinatura.signatarios.map((signatario) => (
          <div key={signatario.papel} className="flex items-start gap-2">
            <span
              className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: signatureStatusColor(signatario.status) }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-800 truncate">
                {signatario.papel}: {signatario.nome}
              </div>
              <div className="text-xs text-slate-500">{signatario.statusLabel}</div>
              {signatario.linkAssinatura && signatario.status !== "assinado" && signatario.papel === "Cliente" && (
                <span className="text-xs text-slate-500 block mt-0.5">Link disponível para envio</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
