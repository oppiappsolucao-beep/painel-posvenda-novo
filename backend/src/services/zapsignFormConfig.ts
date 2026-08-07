import {
  CAMPINAS_CLIENT_FORM_FIELDS,
  CAMPINAS_STORE_FORM_LABELS,
  CAMPINAS_STORE_FORM_FIELDS,
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

function isStoreTemplateInput(input: ZapSignTemplateInput): boolean {
  const type = String(input.input_type || "").trim().toLowerCase();
  if (type === "upload" || type === "cnpj") return true;
  const label = String(input.label || "").trim().toLowerCase();
  return CAMPINAS_STORE_FORM_LABELS.has(label);
}

/** Anexos/CNPJ da loja já configurados no modelo ZapSign (via painel web). */
export function getPreservedStoreInputs(detail: ZapSignTemplateDetail) {
  return (detail.inputs || []).filter(isStoreTemplateInput).map(mapExistingTemplateInput);
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

/** Formulário do cliente; preserva anexos/CNPJ da loja já existentes no modelo. */
export async function applyCampinasClientForm(
  templateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  if (!templateId) return;

  const detail = await zapsignRequest<ZapSignTemplateDetail>(`/templates/${templateId}/`);
  const clientInputs = CAMPINAS_CLIENT_FORM_FIELDS.map(mapFormField);
  const preservedStoreInputs = getPreservedStoreInputs(detail);
  // upload não é suportado em update-form — só reaplicamos o que já existe no modelo.
  const storeInputs =
    preservedStoreInputs.length > 0
      ? preservedStoreInputs
      : CAMPINAS_STORE_FORM_FIELDS.filter((field) => field.input_type === "cnpj").map(mapFormField);

  // Campos da planilha (endereço, complemento, bairro, etc.) vêm preenchidos via
  // buildCampinasTemplateData ao criar o documento — não entram no form do cliente.

  await zapsignRequest("/templates/update-form/", {
    method: "POST",
    json: {
      template_id: templateId,
      custom_intro:
        "Confirme seus dados e responda sobre a documentação do filhote antes de assinar o contrato.",
      youtube_video_code: "",
      inputs: [...clientInputs, ...storeInputs],
    },
  });
}
