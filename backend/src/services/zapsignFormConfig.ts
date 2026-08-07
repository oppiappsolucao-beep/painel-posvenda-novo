import {
  CAMPINAS_CLIENT_FORM_FIELDS,
  CAMPINAS_CLIENT_FORM_VARIABLES,
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

interface ZapSignTemplateDetail {
  inputs?: ZapSignTemplateInput[];
}

function mapClientInput(field: (typeof CAMPINAS_CLIENT_FORM_FIELDS)[number]) {
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

function mapStoreInput(input: ZapSignTemplateInput) {
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

/** Aplica formulário cliente e libera campos já preenchidos pela loja. */
export async function applyCampinasClientForm(
  templateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  if (!templateId) return;

  const template = await zapsignRequest<ZapSignTemplateDetail>(`/templates/${templateId}/`);
  const existing = template.inputs || [];

  const clientInputs = CAMPINAS_CLIENT_FORM_FIELDS.map(mapClientInput);
  const clientVariables = new Set(CAMPINAS_CLIENT_FORM_VARIABLES);

  const storeInputs = existing
    .filter((input) => {
      const variable = String(input.variable || "").trim();
      if (!variable) return false;
      return !clientVariables.has(variable);
    })
    .map(mapStoreInput);

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
