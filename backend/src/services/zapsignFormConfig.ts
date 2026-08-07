import {
  CAMPINAS_CLIENT_FORM_FIELDS,
  CAMPINAS_STORE_FORM_FIELDS,
  CAMPINAS_STORE_CNPJ_FIELD,
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

/** Formulário cliente + anexos/CNPJ da loja; campos da planilha não aparecem no form. */
export async function applyCampinasClientForm(
  templateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  if (!templateId) return;

  const sourceTemplateId = process.env.ZAPSIGN_TEMPLATE_ID_CAMPINAS?.trim();

  let sourceUploads: ZapSignTemplateInput[] = [];
  if (sourceTemplateId && sourceTemplateId !== templateId) {
    try {
      const source = await zapsignRequest<ZapSignTemplateDetail>(`/templates/${sourceTemplateId}/`);
      sourceUploads = (source.inputs || []).filter((input) => input.input_type === "upload");
    } catch {
      /* template original indisponível */
    }
  }

  const clientInputs = CAMPINAS_CLIENT_FORM_FIELDS.map(mapFormField);
  const storeInputs =
    sourceUploads.length > 0
      ? [mapFormField(CAMPINAS_STORE_CNPJ_FIELD)]
      : CAMPINAS_STORE_FORM_FIELDS.map(mapFormField);

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
