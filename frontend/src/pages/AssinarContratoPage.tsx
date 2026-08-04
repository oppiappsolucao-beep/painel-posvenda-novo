import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Logo } from "../components/Logo";
import { SignaturePad } from "../components/SignaturePad";
import {
  fetchPublicSignature,
  fetchPublicSignaturePdf,
  signContractAsClient,
  SignatureProgress,
} from "../lib/api";
import { COLORS } from "../lib/utils";

export function AssinarContratoPage() {
  const { token = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nome, setNome] = useState("");
  const [canSign, setCanSign] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [assinatura, setAssinatura] = useState<SignatureProgress | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!token) {
      setError("Link de assinatura inválido.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const info = await fetchPublicSignature(token);
        if (cancelled) return;
        setNome(info.nome);
        setCanSign(info.canSign);
        setConcluido(info.concluido);
        setAssinatura(info.assinatura);

        const blob = await fetchPublicSignaturePdf(token);
        if (cancelled) return;
        setPdfUrl(URL.createObjectURL(blob));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar contrato.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!signatureImage) {
      setError("Desenhe sua assinatura antes de confirmar.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = await signContractAsClient(token, signatureImage);
      setSuccess(result.message);
      setCanSign(false);
      setConcluido(result.concluido);
      setAssinatura(result.assinatura);

      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      const blob = await fetchPublicSignaturePdf(token);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar assinatura.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header
        className="px-4 py-5 text-white shadow-md"
        style={{ background: `linear-gradient(135deg, ${COLORS.navy} 0%, ${COLORS.wine} 100%)` }}
      >
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Logo variant="circle" size={56} className="shrink-0 shadow-lg" />
          <div>
            <div className="text-xs uppercase tracking-wider opacity-80">Assinatura digital</div>
            <h1 className="text-xl font-bold">Contrato SkoobPet</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {loading && (
          <div className="bg-white rounded-2xl p-10 text-center text-slate-500 shadow-sm">
            Carregando contrato...
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-5">{error}</div>
        )}

        {!loading && !error && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="text-sm text-slate-500">Cliente</div>
              <div className="text-2xl font-bold text-slate-900">{nome}</div>
              {assinatura && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">Progresso das assinaturas</span>
                    <span className="font-bold">{assinatura.progresso}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${assinatura.progresso}%`,
                        background: assinatura.progresso === 100 ? "#16a34a" : COLORS.navy,
                      }}
                    />
                  </div>
                  <div className="mt-3 space-y-1">
                    {assinatura.signatarios.map((s) => (
                      <div key={s.papel} className="text-sm text-slate-600">
                        <span className="font-semibold text-slate-800">{s.papel}:</span> {s.statusLabel}
                        {s.assinadoEm !== "—" && <span className="text-slate-400"> • {s.assinadoEm}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-700">
                Pré-visualização do contrato
              </div>
              <div className="h-[420px] bg-slate-100">
                {pdfUrl ? (
                  <iframe src={pdfUrl} title="Contrato" className="w-full h-full border-0 bg-white" />
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500">PDF indisponível</div>
                )}
              </div>
            </div>

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-800 rounded-2xl p-5 font-medium">
                {success}
              </div>
            )}

            {canSign && (
              <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Sua assinatura</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Ao assinar, você confirma que leu e concorda com os termos do contrato.
                  </p>
                </div>
                <SignaturePad onChange={setSignatureImage} />
                <button
                  type="submit"
                  disabled={submitting || !signatureImage}
                  className="w-full py-3 rounded-xl text-white font-bold disabled:opacity-50"
                  style={{ background: COLORS.navy }}
                >
                  {submitting ? "Registrando..." : "Confirmar assinatura"}
                </button>
              </form>
            )}

            {!canSign && concluido && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center text-green-800">
                Contrato totalmente assinado. Obrigado!
              </div>
            )}

            {!canSign && !concluido && !success && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-amber-900">
                Sua assinatura já foi registrada. Aguardando assinatura da loja para concluir o processo.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
