import { getUnitByKey, type UnitKey } from "../config.js";
import {
  CAMPINAS_CLIENT_DOC_ACK_FIELDS,
  CAMPINAS_STORE_CNPJ_FIELD,
  CAMPINAS_STORE_FORM_LABELS,
  campinasStoreFirstFormFields,
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
  return (process.env.ZAPSIGN_LOJA_AUTH_MODE || "assinaturaTela").trim();
}

/** Índice do signatário loja (0 = primeiro) e cliente (1 = segundo). */
export const CAMPINAS_STORE_SIGNER_INDEX = 0;
export const CAMPINAS_CLIENT_SIGNER_INDEX = 1;

/** Nome do signatário lojista no ZapSign (não confundir com Vendedora no contrato). */
export function campinasStoreSignerName(): string {
  return (process.env.ZAPSIGN_LOJA_NAME || "SkoobPet").trim();
}

/** Nome da loja no ZapSign por unidade. */
export function zapsignStoreSignerName(unitKey: UnitKey): string {
  const envKey = `ZAPSIGN_LOJA_NAME_${unitKey.toUpperCase()}`;
  const perUnit = process.env[envKey]?.trim();
  if (perUnit) return perUnit;
  const unit = getUnitByKey(unitKey);
  if (unit) return `SkoobPet ${unit.label}`;
  return campinasStoreSignerName();
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

/** Modelo com loja (1º) e cliente (2º). */
export function templateHasStoreUploadWorkflow(detail: ZapSignTemplateDetail): boolean {
  return (detail.signers || []).length >= 2;
}

function isZapSignNoChangeError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("Nenhuma alteração efetuada") || msg.includes("mutáveis de modelo");
}

export { isZapSignNoChangeError };

export function campinasTemplateStoreSignerPanelUrl(templateId: string): string {
  const base = process.env.ZAPSIGN_SANDBOX === "true"
    ? "https://sandbox.app.zapsign.com.br"
    : "https://app.zapsign.com.br";
  return `${base}/conta/modelos/${templateId}`;
}

export function zapsignTemplateStoreSignerPanelUrl(templateId: string): string {
  return campinasTemplateStoreSignerPanelUrl(templateId);
}

/** Garante ordem loja (1º) → cliente (2º) no template. */
export async function ensureUnitTemplateStoreSigner(
  templateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  if (!templateId) return;

  const detail = await zapsignRequest<ZapSignTemplateDetail>(`/templates/${templateId}/`);
  const signers = detail.signers || [];

  if (signers.length >= 2) return;

  console.warn(
    `[zapsign] Template ${templateId} com ${signers.length} signatário(s). ` +
      `Configure loja (1º) e cliente (2º) no painel ZapSign: ${zapsignTemplateStoreSignerPanelUrl(templateId)}`,
  );
}

/** @deprecated Use ensureUnitTemplateStoreSigner */
export async function ensureCampinasTemplateStoreSigner(
  templateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  return ensureUnitTemplateStoreSigner(templateId, zapsignRequest);
}

/** Copia ordem loja→cliente do template original. */
export async function syncCampinasStoreSignerFromSource(
  sourceTemplateId: string,
  cleanTemplateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  const source = await zapsignRequest<ZapSignTemplateDetail>(`/templates/${sourceTemplateId}/`);
  const storeSigner = source.signers?.[CAMPINAS_STORE_SIGNER_INDEX] || source.signers?.[1];
  const clientSigner = source.signers?.[CAMPINAS_CLIENT_SIGNER_INDEX] || source.signers?.[0];
  if (!storeSigner || !clientSigner) return;

  try {
    await zapsignRequest(`/templates/${cleanTemplateId}/`, {
      method: "PUT",
      json: {
        signers: [
          {
            ...storeSigner,
            auth_mode: campinasStoreAuthMode(),
            qualification: "lojista",
            blank_phone: false,
          },
          {
            ...clientSigner,
            auth_mode: campinasClientAuthMode(),
            qualification: "cliente",
          },
        ],
      },
    });
  } catch (e) {
    console.warn(
      "[zapsign] Não foi possível copiar signatários loja/cliente para template limpo:",
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Formulário: signatário 1 (loja) = CNPJ + anexos.
 * Cliente (signatário 2) responde só radios de documentação — configure no painel ZapSign.
 */
export async function applyCampinasClientForm(
  templateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  if (!templateId) return;

  const storeInputs = campinasStoreFirstFormFields().map(mapFormField);
  const clientDocInputs = CAMPINAS_CLIENT_DOC_ACK_FIELDS.map((field, index) =>
    mapFormField({ ...field, order: 20 + index }),
  );

  await zapsignRequest("/templates/update-form/", {
    method: "POST",
    json: {
      template_id: templateId,
      custom_intro:
        "Loja: informe o CNPJ e anexe os documentos do filhote. Cliente: confirme abaixo o que recebeu.",
      youtube_video_code: "",
      hide_prefilled_fields: true,
      inputs: [...storeInputs, ...clientDocInputs],
    },
  }).catch((error) => {
    if (isZapSignNoChangeError(error)) {
      console.warn("[zapsign] Formulário do template já configurado; ignorando update-form.");
      return;
    }
    throw error;
  });
}
