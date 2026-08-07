import {
  CAMPINAS_CLIENT_FORM_FIELDS,
  CAMPINAS_CLIENT_FORM_VARIABLES,
  CAMPINAS_STORE_FORM_FIELDS,
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

function mapStorePrefilledInput(input: ZapSignTemplateInput) {
  const variable = String(input.variable || "").trim();
  return {
    variable,
    input_type: input.input_type || "input",
    label: input.label || variable.replace(/[{}]/g, ""),
    help_text: input.help_text ?? "",
    options: input.options ?? "",
    required: false,
    order: (input.order ?? 0) + 100,
  };
}

function isStoreFormInput(input: ZapSignTemplateInput): boolean {
  const label = String(input.label || "").trim().toLowerCase();
  if (label && CAMPINAS_STORE_FORM_LABELS.has(label)) return true;
  return input.input_type === "upload";
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

/** Formulário cliente + anexos/CNPJ da loja; campos da planilha ficam opcionais. */
export async function applyCampinasClientForm(
  templateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  if (!templateId) return;

  const template = await zapsignRequest<ZapSignTemplateDetail>(`/templates/${templateId}/`);
  const existing = template.inputs || [];

  const clientInputs = CAMPINAS_CLIENT_FORM_FIELDS.map(mapFormField);
  const storeInputs = CAMPINAS_STORE_FORM_FIELDS.map(mapFormField);
  const clientVariables = new Set(CAMPINAS_CLIENT_FORM_VARIABLES);

  const prefilledInputs = existing
    .filter((input) => {
      const variable = String(input.variable || "").trim();
      if (!variable) return false;
      if (clientVariables.has(variable)) return false;
      if (isStoreFormInput(input)) return false;
      return true;
    })
    .map(mapStorePrefilledInput);

  await zapsignRequest("/templates/update-form/", {
    method: "POST",
    json: {
      template_id: templateId,
      custom_intro:
        "Confirme seus dados e responda sobre a documentação do filhote antes de assinar o contrato.",
      youtube_video_code: "",
      inputs: [...clientInputs, ...storeInputs, ...prefilledInputs],
    },
  });
}
