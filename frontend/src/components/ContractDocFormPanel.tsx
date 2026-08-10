import { useEffect, useState } from "react";
import { ImageUploadField } from "./ImageUploadField";
import {
  DocFormKind,
  DocFormStatus,
  StatusAssinaturaItem,
  submitDocFormAttachments,
} from "../lib/api";
import { COLORS } from "../lib/utils";

const DOC_FORM_FIELDS: Array<{ kind: DocFormKind; label: string }> = [
  { kind: "carteirinhaFrente", label: "Carteirinha de vacina — Frente" },
  { kind: "carteirinhaVerso", label: "Carteirinha de vacina — Verso" },
  { kind: "atestado", label: "Atestado de saúde" },
  { kind: "fotoFilhote", label: "Foto do filhote" },
];

interface ContractDocFormPanelProps {
  item: StatusAssinaturaItem;
  initialStatus?: DocFormStatus;
  onSaved?: (status: DocFormStatus) => void;
  compact?: boolean;
}

export function ContractDocFormPanel({
  item,
  initialStatus,
  onSaved,
  compact = false,
}: ContractDocFormPanelProps) {
  const [status, setStatus] = useState<DocFormStatus | undefined>(initialStatus || item.docForm);
  const [files, setFiles] = useState<Partial<Record<DocFormKind, string | null>>>({});
  const [replacing, setReplacing] = useState<Partial<Record<DocFormKind, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus(initialStatus || item.docForm);
  }, [initialStatus, item.docForm, item.sheetIndex, item.unitKey]);

  const pendingKinds = DOC_FORM_FIELDS.filter(({ kind }) => !status?.anexos[kind]?.enviado && !files[kind]);

  const handleSubmit = async () => {
    setError("");
    setMessage("");

    const payload: Partial<Record<DocFormKind, string>> = {};
    for (const { kind } of DOC_FORM_FIELDS) {
      const value = files[kind];
      if (value?.startsWith("data:image/")) payload[kind] = value;
    }

    if (!Object.keys(payload).length) {
      setError("Selecione ao menos um documento para enviar.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitDocFormAttachments(item.unitKey, item.sheetIndex, payload);
      setStatus(result.status);
      setFiles({});
      setReplacing({});
      setMessage(result.message);
      if (result.emailError) {
        setError(`Anexos salvos, mas o e-mail falhou: ${result.emailError}`);
      }
      onSaved?.(result.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar anexos.");
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor =
    status?.completo && status.emailEnviado
      ? "#16a34a"
      : status?.enviados
        ? "#d97706"
        : "#dc2626";

  return (
    <div className={`${compact ? "" : "border-t border-slate-200"} bg-white`}>
      <div className={`${compact ? "px-4 py-3 border-b border-slate-100" : "px-5 py-4 border-b border-slate-100"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Documentação do filhote</div>
            <div className="font-bold text-slate-900">Formulário de anexos</div>
          </div>
          <span
            className="text-xs font-bold px-3 py-1 rounded-full text-white"
            style={{ background: statusColor }}
          >
            {status?.statusLabel || "Pendente"}
          </span>
        </div>
        {status && !status.completo && (
          <p className="text-sm text-slate-600 mt-2">
            Envie os 4 documentos abaixo. Enquanto faltar algum, o status permanece pendente.
          </p>
        )}
        {status?.completo && status.emailEnviado && (
          <p className="text-sm text-green-700 mt-2">
            Documentação completa. E-mail enviado para a loja e o cliente
            {status.emailEnviadoEm ? ` em ${status.emailEnviadoEm}` : ""}.
          </p>
        )}
        {status?.zapsign?.disponivel && (
          <p className={`text-sm mt-2 ${status.zapsign.completo ? "text-green-700" : "text-slate-600"}`}>
            ZapSign:{" "}
            {status.zapsign.completo
              ? "todos os anexos foram incluídos no contrato para assinatura."
              : `${status.zapsign.sincronizados}/${status.zapsign.total} anexo(s) já enviado(s) ao ZapSign.`}
            {status.zapsign.erro ? ` (${status.zapsign.erro})` : ""}
          </p>
        )}
      </div>

      <div className={`${compact ? "px-4 py-3" : "px-5 py-4"} space-y-3 max-h-[42vh] overflow-y-auto`}>
        {DOC_FORM_FIELDS.map(({ kind, label }) => {
          const alreadySent = status?.anexos[kind]?.enviado && !replacing[kind];
          return (
            <div key={kind}>
              {alreadySent && !files[kind] ? (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-green-800">{label}</div>
                    <div className="text-xs text-green-700">Enviado</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplacing((prev) => ({ ...prev, [kind]: true }))}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline shrink-0"
                  >
                    Substituir
                  </button>
                </div>
              ) : (
                <ImageUploadField
                  label={label}
                  hint={pendingKinds.some((p) => p.kind === kind) ? "Obrigatório" : undefined}
                  value={files[kind] ?? null}
                  onChange={(value) => setFiles((prev) => ({ ...prev, [kind]: value }))}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className={`${compact ? "px-4 py-3 border-t border-slate-100" : "px-5 py-4 border-t border-slate-100"} flex flex-col gap-2`}>
        {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2">{message}</div>}
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</div>}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting || !Object.values(files).some((v) => v?.startsWith("data:image/"))}
          className="w-full py-3 rounded-xl text-white font-bold disabled:opacity-50"
          style={{ background: COLORS.navy }}
        >
          {submitting
            ? "Enviando..."
            : status?.completo && !status.emailEnviado
              ? "Salvar e enviar e-mail"
              : "Salvar anexos"}
        </button>
        <p className="text-xs text-slate-500 text-center">
          Ao completar os 4 documentos, um e-mail sai de contato@skoobpet.com.br para a loja e o cliente com os anexos.
          Contratos ZapSign também recebem os PDFs automaticamente.
        </p>
      </div>
    </div>
  );
}

export function DocFormStatusBadge({ docForm }: { docForm: DocFormStatus }) {
  const color =
    docForm.completo && docForm.emailEnviado
      ? "text-green-700 bg-green-50 border-green-200"
      : docForm.enviados > 0
        ? "text-amber-800 bg-amber-50 border-amber-200"
        : "text-red-700 bg-red-50 border-red-200";

  return (
    <div className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${color}`}>
      <span aria-hidden>📎</span>
      Anexos: {docForm.statusLabel}
    </div>
  );
}
