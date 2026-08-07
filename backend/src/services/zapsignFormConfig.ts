import { CAMPINAS_CLIENT_FORM_FIELDS } from "../config/zapsignCampinas.js";

type ZapSignRequest = <T>(
  path: string,
  init?: RequestInit & { json?: unknown },
) => Promise<T>;

/** Aplica radios/cpf/email do formulário cliente no template ZapSign. */
export async function applyCampinasClientForm(
  templateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  if (!templateId) return;

  await zapsignRequest("/templates/update-form/", {
    method: "POST",
    json: {
      template_id: templateId,
      custom_intro:
        "Confirme seus dados e responda sobre a documentação do filhote antes de assinar o contrato.",
      youtube_video_code: "",
      inputs: CAMPINAS_CLIENT_FORM_FIELDS.map((field) => ({
        variable: field.variable,
        input_type: field.input_type,
        label: field.label,
        help_text: field.help_text ?? "",
        options: field.options ?? "",
        required: field.required ?? true,
        order: field.order,
      })),
    },
  });
}
