import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "../components/AppLayout";
import { KpiCard } from "../components/KpiCard";
import { useAuth } from "../context/AuthContext";
import { fetchStatusAssinatura, fetchContractPreview, StatusAssinaturaItem, SignatureProgress, SignatarioItem, initSignatureSession, signContractAsStore } from "../lib/api";
import { SignaturePad } from "../components/SignaturePad";
import { ContractDocFormPanel, DocFormStatusBadge } from "../components/ContractDocFormPanel";
import { COLORS, copyToClipboard, copyToClipboardSync } from "../lib/utils";

type SortMode = "ultimo_enviado" | "alfabetica";

function todayIsoDate(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatIsoDateBr(iso: string): string {
  const [yyyy, mm, dd] = iso.split("-");
  if (!yyyy || !mm || !dd) return iso;
  return `${dd}/${mm}/${yyyy}`;
}

export function StatusAssinaturaPage() {
  const { user, loading } = useAuth();
  const [nome, setNome] = useState("");
  const [dataInicio, setDataInicio] = useState(todayIsoDate);
  const [dataFim, setDataFim] = useState(todayIsoDate);
  const [sortMode, setSortMode] = useState<SortMode>("alfabetica");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [previewItem, setPreviewItem] = useState<StatusAssinaturaItem | null>(null);
  const [attachmentsItem, setAttachmentsItem] = useState<StatusAssinaturaItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [signItem, setSignItem] = useState<StatusAssinaturaItem | null>(null);
  const [storeSignature, setStoreSignature] = useState<string | null>(null);
  const [signSubmitting, setSignSubmitting] = useState(false);
  const [signError, setSignError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [linkModal, setLinkModal] = useState<{ url: string; copied: boolean } | null>(null);
  const [copyingKey, setCopyingKey] = useState<string | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const queryParams = useMemo(
    () => ({ nome: nome.trim(), dataInicio, dataFim, status: "todos" as const }),
    [nome, dataInicio, dataFim],
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["status-assinatura", queryParams],
    queryFn: () => fetchStatusAssinatura(queryParams),
    refetchInterval: 10000,
    enabled: !!user,
  });

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    return sortItems(data.items, sortMode);
  }, [data?.items, sortMode]);

  const assinadosCount = filteredItems.filter((item) => item.status === "assinado").length;
  const pendentesLojaCount = filteredItems.filter((item) =>
    item.assinatura.signatarios.find((s) => s.papel === "Loja")?.status !== "assinado",
  ).length;
  const pendentesClienteCount = filteredItems.filter((item) =>
    item.assinatura.signatarios.find((s) => s.papel === "Cliente")?.status !== "assinado",
  ).length;
  const anexosPendentesContratos = filteredItems.filter((item) => !item.docForm.completo).length;
  const anexosPendentesArquivos = filteredItems.reduce((sum, item) => sum + item.docForm.pendentes.length, 0);

  useEffect(() => {
    if (!linkModal || !linkInputRef.current) return;
    linkInputRef.current.focus();
    linkInputRef.current.select();
  }, [linkModal]);

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

  if (!loading && !user) return <Navigate to="/login" replace />;

  const clearFilters = () => {
    setNome("");
    const hoje = todayIsoDate();
    setDataInicio(hoje);
    setDataFim(hoje);
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewItem(null);
    setPreviewError(null);
    setPreviewLoading(false);
  };

  const openAttachments = (item: StatusAssinaturaItem, e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setAttachmentsItem(item);
  };

  const closeAttachments = () => setAttachmentsItem(null);

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

  const resolveClientLink = (item: StatusAssinaturaItem): string =>
    item.linkAssinatura ||
    item.assinatura.clientSignUrl ||
    item.assinatura.signatarios.find((s) => s.papel === "Cliente")?.linkAssinatura ||
    "";

  const showClientLink = async (item: StatusAssinaturaItem, e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const itemKey = `${item.unitKey}-${item.sheetIndex}`;
    setCopyingKey(itemKey);

    try {
      let link = resolveClientLink(item);

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

      if (!link) {
        setCopyFeedback("Link indisponível para este contrato.");
        setTimeout(() => setCopyFeedback(""), 3000);
        return;
      }

      const copied =
        copyToClipboardSync(link) ||
        (await copyToClipboard(link).catch(() => false));

      setLinkModal({ url: link, copied: Boolean(copied) });
      if (copied) {
        setCopyFeedback("Link copiado!");
        setTimeout(() => setCopyFeedback(""), 2000);
      }
    } finally {
      setCopyingKey(null);
    }
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
      caption={
        data
          ? `${formatIsoDateBr(dataInicio)}${dataInicio !== dataFim ? ` — ${formatIsoDateBr(dataFim)}` : ""} • ${filteredItems.length} contrato(s)`
          : undefined
      }
    >
      {copyFeedback && (
        <div className="mb-3 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
          {copyFeedback}
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          title="✅ Contratos assinados"
          value={isLoading ? "—" : assinadosCount}
          subtitle="loja e cliente concluídos"
          accent="#16a34a"
          valueColor="#16a34a"
          valueSize={32}
        />
        <KpiCard
          title="🏬 Pendentes loja"
          value={isLoading ? "—" : pendentesLojaCount}
          subtitle="aguardando assinatura da loja"
          accent="#c2410c"
          valueColor="#c2410c"
          valueSize={32}
        />
        <KpiCard
          title="👤 Pendentes clientes"
          value={isLoading ? "—" : pendentesClienteCount}
          subtitle="aguardando assinatura do cliente"
          accent="#dc2626"
          valueColor="#dc2626"
          valueSize={32}
        />
        <KpiCard
          title="📎 Anexos pendentes"
          value={isLoading ? "—" : anexosPendentesContratos}
          subtitle={
            isLoading
              ? "aguardando envio de documentos"
              : `${anexosPendentesArquivos} arquivo(s) em ${anexosPendentesContratos} contrato(s)`
          }
          accent={COLORS.wine}
          valueColor={COLORS.wine}
          valueSize={32}
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-end">
          <label className="block sm:w-40 shrink-0">
            <span className="text-sm font-semibold text-slate-600">Data início</span>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B1D6D]/20"
            />
          </label>
          <label className="block sm:w-40 shrink-0">
            <span className="text-sm font-semibold text-slate-600">Data fim</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B1D6D]/20"
            />
          </label>
          <label className="block flex-1 min-w-0">
            <span className="text-sm font-semibold text-slate-600">Nome do cliente</span>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Pesquisar pelo nome"
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B1D6D]/20"
            />
          </label>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => refetch()}
              className="px-4 py-2.5 rounded-xl text-white font-semibold"
              style={{ background: COLORS.navy }}
              title="Atualizar"
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-600"
            >
              Hoje
            </button>
          </div>
        </div>

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
                <span>Contratos do dia</span>
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
              <table className="w-full">
                <thead>
                  <tr className="text-white text-sm" style={{ background: COLORS.navy2 }}>
                    <th className="text-left px-4 py-3 font-bold">Cliente</th>
                    <th className="text-left px-4 py-3 font-bold w-[220px]">Assinaturas</th>
                    <th className="text-left px-4 py-3 font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-16 text-center text-slate-400">
                        Nenhum contrato entre {formatIsoDateBr(dataInicio)} e {formatIsoDateBr(dataFim)}
                        {nome.trim() ? ` para "${nome.trim()}"` : ""}.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr
                        key={`${item.unitKey}-${item.sheetIndex}`}
                        className="border-b border-slate-100 hover:bg-slate-50/80 cursor-pointer transition-colors align-top"
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("[data-no-preview]")) return;
                          openPreview(item);
                        }}
                        title="Clique para visualizar o contrato"
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{item.nome}</div>
                          <div className="text-xs text-slate-500 mt-0.5">Compra: {item.dataCompra}</div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openPreview(item);
                            }}
                            className="mt-1 text-xs font-semibold text-blue-700 hover:underline"
                          >
                            Ver contrato
                          </button>
                        </td>
                        <td className="px-4 py-3" data-no-preview>
                          <div className={`text-sm font-bold mb-1 ${overallStatusClass(item)}`}>
                            {item.statusLabel}
                          </div>
                          <SignatureProgressCompact assinatura={item.assinatura} />
                          <DocFormStatusBadge docForm={item.docForm} />
                        </td>
                        <td className="px-4 py-3 text-sm" data-no-preview>
                          <div className="flex flex-col gap-2 max-w-xs">
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => openAttachments(item, e)}
                              className="w-full text-sm px-3 py-2 rounded-xl text-white font-bold shadow-sm"
                              style={{
                                background: item.docForm.completo && item.docForm.emailEnviado
                                  ? "#16a34a"
                                  : `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.wine})`,
                              }}
                            >
                              {item.docForm.completo && item.docForm.emailEnviado
                                ? "📎 Anexos"
                                : "📎 Enviar anexos"}
                            </button>
                            {item.inAppSignature && item.status !== "assinado" && (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => showClientLink(item, e)}
                                  disabled={copyingKey === `${item.unitKey}-${item.sheetIndex}`}
                                  className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold disabled:opacity-60"
                                  style={{ background: COLORS.navy2 }}
                                >
                                  {copyingKey === `${item.unitKey}-${item.sheetIndex}` ? "..." : "Link cliente"}
                                </button>
                                {item.podeAssinarLoja && (
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => openStoreSign(item, e)}
                                    className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold"
                                    style={{ background: COLORS.wine }}
                                  >
                                    Assinar loja
                                  </button>
                                )}
                              </div>
                            )}
                            {!item.inAppSignature && item.linkAssinatura && (
                              <div className="flex flex-col gap-1">
                                <a
                                  href={item.linkAssinatura}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-blue-600 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Acompanhar ZapSign
                                </a>
                                {item.linkAssinaturaLoja && (
                                  item.docForm.completo ? (
                                    <a
                                      href={item.linkAssinaturaLoja}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold text-center"
                                      style={{ background: COLORS.wine }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Assinar loja (ZapSign)
                                    </a>
                                  ) : (
                                    <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                                      Envie os anexos antes de assinar
                                    </span>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 text-center text-xs text-slate-500 border-t border-slate-100 bg-white rounded-b-2xl">
              {filteredItems.length} contrato(s) entre {formatIsoDateBr(dataInicio)} e {formatIsoDateBr(dataFim)}
              {sortMode === "alfabetica" ? " • ordem alfabética" : " • último enviado"}
            </div>
          </div>
        )}
      </div>

      {attachmentsItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
          onClick={closeAttachments}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            data-no-preview
          >
            <div
              className="flex items-center justify-between px-5 py-4 text-white shrink-0"
              style={{ background: COLORS.navy }}
            >
              <div>
                <div className="text-xs uppercase tracking-wide opacity-80">Documentação do filhote</div>
                <div className="font-bold text-lg">{attachmentsItem.nome}</div>
              </div>
              <button
                type="button"
                onClick={closeAttachments}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-xl font-bold"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
              <ContractDocFormPanel
                item={attachmentsItem}
                onSaved={async () => {
                  await refetch();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closePreview}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 py-4 text-white shrink-0"
              style={{ background: COLORS.navy }}
            >
              <div>
                <div className="text-xs uppercase tracking-wide opacity-80">Contrato e documentação</div>
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

            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
              <div className="lg:w-[58%] min-h-[240px] lg:min-h-0 bg-slate-100 border-b lg:border-b-0 lg:border-r border-slate-200">
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
                    className="w-full h-full min-h-[240px] border-0 bg-white"
                  />
                )}
              </div>

              <div className="lg:w-[42%] min-h-0 overflow-y-auto bg-slate-50 p-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <ContractDocFormPanel
                    item={previewItem}
                    compact
                    onSaved={async () => {
                      await refetch();
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {linkModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setLinkModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
            data-no-preview
          >
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Link de assinatura</div>
              <div className="text-lg font-bold text-slate-900">
                {linkModal.copied ? "Link copiado!" : "Envie este link ao cliente"}
              </div>
            </div>
            <p className="text-sm text-slate-600">
              {linkModal.copied
                ? "O link já está na área de transferência. Você também pode copiar novamente abaixo."
                : "Selecione o link abaixo e use Ctrl+C (ou Cmd+C), ou toque em Copiar."}
            </p>
            <input
              ref={linkInputRef}
              readOnly
              value={linkModal.url}
              onFocus={(e) => e.target.select()}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm bg-slate-50 text-slate-800"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLinkModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 font-semibold text-slate-600"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok =
                    copyToClipboardSync(linkModal.url) ||
                    (await copyToClipboard(linkModal.url).catch(() => false));
                  if (ok) {
                    setCopyFeedback("Link copiado!");
                    setLinkModal({ ...linkModal, copied: true });
                    setTimeout(() => setCopyFeedback(""), 2000);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl text-white font-bold"
                style={{ background: COLORS.navy }}
              >
                Copiar link
              </button>
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

function overallStatusClass(item: StatusAssinaturaItem): string {
  if (item.status === "assinado") return "text-green-700";
  if (item.statusLabel === "Aguardando loja") return "text-orange-700";
  if (item.statusLabel === "Aguardando cliente") return "text-red-700";
  if (item.statusLabel === "Não enviado") return "text-slate-500";
  return "text-slate-800";
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

function SignatureProgressCompact({ assinatura }: { assinatura: SignatureProgress }) {
  return (
    <div>
      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden mb-1.5">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${assinatura.progresso}%`,
            background: assinatura.progresso === 100 ? "#16a34a" : `linear-gradient(90deg, ${COLORS.navy}, ${COLORS.wine})`,
          }}
        />
      </div>
      <div className="space-y-0.5">
        {assinatura.signatarios.map((signatario) => (
          <div key={signatario.papel} className="text-xs text-slate-600 truncate">
            <span className="font-semibold">{signatario.papel}:</span>{" "}
            <span style={{ color: signatureStatusColor(signatario.status) }}>{signatario.statusLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
