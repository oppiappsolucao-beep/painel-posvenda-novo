import {
  CAMPINAS_CLIENT_FORM_FIELDS,
  CAMPINAS_STORE_CNPJ_FIELD,
  CAMPINAS_STORE_FORM_LABELS,
} from "../config/zapsignCampinas.js";

type ZapSignRequest = <T>(
  path: string,
  init?: RequestInit & { json?: unknown },
) => Promise<T>;

interface ZapSignTemplateInput {
  variable?: string;
  input_type?: string;
  label?: string;
  help_text?: string;
  options?: string;
  required?: boolean;
  order?: number;
}

interface ZapSignTemplateSigner {
  name?: string;
  auth_mode?: string;
  email?: string;
  phone_country?: string;
  phone_number?: string;
  qualification?: string;
  blank_phone?: boolean;
  blank_email?: boolean;
  lock_name?: boolean;
  lock_phone?: boolean;
  lock_email?: boolean;
  require_selfie_photo?: boolean;
  require_document_photo?: boolean;
}

interface ZapSignTemplateDetail {
  inputs?: ZapSignTemplateInput[];
  signers?: ZapSignTemplateSigner[];
}

export function campinasStoreAuthMode(): string {
  return (process.env.ZAPSIGN_LOJA_AUTH_MODE || "tokenWhatsapp").trim();
}

/** Autenticação do cliente ao assinar (token do código). */
export function campinasClientAuthMode(): string {
  const explicit = process.env.ZAPSIGN_CLIENT_AUTH_MODE?.trim();
  if (explicit) return explicit;
  if (process.env.ZAPSIGN_SEND_WHATSAPP === "true") return "tokenWhatsapp";
  return "tokenEmail";
}

function mapFormField(field: {
  variable: string;
  input_type: string;
  label: string;
  help_text?: string;
  options?: string;
  required?: boolean;
  order: number;
}) {
  return {
    variable: field.variable,
    input_type: field.input_type,
    label: field.label,
    help_text: field.help_text ?? "",
    options: field.options ?? "",
    required: field.required ?? true,
    order: field.order,
  };
}

function mapExistingTemplateInput(input: ZapSignTemplateInput) {
  return {
    variable: input.variable ?? "",
    input_type: input.input_type ?? "input",
    label: input.label ?? "",
    help_text: input.help_text ?? "",
    options: input.options ?? "",
    required: input.required ?? true,
    order: input.order ?? 0,
  };
}

function isStoreUploadInput(input: ZapSignTemplateInput): boolean {
  if (String(input.input_type || "").trim().toLowerCase() === "upload") return true;
  const label = String(input.label || "").trim().toLowerCase();
  return CAMPINAS_STORE_FORM_LABELS.has(label) && label !== CAMPINAS_STORE_CNPJ_FIELD.label.trim().toLowerCase();
}

function isStoreCnpjInput(input: ZapSignTemplateInput): boolean {
  const type = String(input.input_type || "").trim().toLowerCase();
  if (type === "cnpj") return true;
  return String(input.label || "").trim().toLowerCase() === CAMPINAS_STORE_CNPJ_FIELD.label.trim().toLowerCase();
}

/** Anexos (fotos) da loja — só configuráveis no painel ZapSign; não via update-form. */
export function getPreservedStoreUploads(detail: ZapSignTemplateDetail) {
  return (detail.inputs || []).filter(isStoreUploadInput).map(mapExistingTemplateInput);
}

/** @deprecated Use getPreservedStoreUploads — CNPJ não é anexo. */
export function getPreservedStoreInputs(detail: ZapSignTemplateDetail) {
  return getPreservedStoreUploads(detail);
}

export function templateHasStoreUploadWorkflow(detail: ZapSignTemplateDetail): boolean {
  const uploads = (detail.inputs || []).some((input) => input.input_type === "upload");
  const lojista =
    (detail.signers || []).length >= 2 ||
    (detail.signers || []).some((signer) => signer.qualification === "lojista");
  return uploads && lojista;
}

/** Copia signatário lojista do template original (sem assinatura na tela). */
export async function syncCampinasStoreSignerFromSource(
  sourceTemplateId: string,
  cleanTemplateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  const source = await zapsignRequest<ZapSignTemplateDetail>(`/templates/${sourceTemplateId}/`);
  const storeSigner = source.signers?.[1];
  if (!storeSigner) return;

  try {
    await zapsignRequest(`/templates/${cleanTemplateId}/`, {
      method: "PUT",
      json: {
        signers: [
          source.signers?.[0],
          {
            ...storeSigner,
            auth_mode: campinasStoreAuthMode(),
            qualification: "lojista",
            blank_phone: false,
          },
        ],
      },
    });
  } catch (e) {
    console.warn(
      "[zapsign] Não foi possível copiar signatário lojista para template limpo:",
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Formulário exclusivo do cliente (orders 1–8).
 * CNPJ e fotos da loja ficam no signatário lojista via painel ZapSign (Opções avançadas),
 * para não repetir no link do cliente nem misturar com os radios do comprador.
 */
export async function applyCampinasClientForm(
  templateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  if (!templateId) return;

  const clientInputs = CAMPINAS_CLIENT_FORM_FIELDS.map(mapFormField);

  await zapsignRequest("/templates/update-form/", {
    method: "POST",
    json: {
      template_id: templateId,
      custom_intro:
        "Confirme seus dados e responda sobre a documentação do filhote antes de assinar o contrato.",
      youtube_video_code: "",
      inputs: clientInputs,
    },
  });
}
