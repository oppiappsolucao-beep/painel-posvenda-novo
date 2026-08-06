import {
  buildCampinasTemplateData,
  CAMPINAS_CLIENT_FORM_FIELDS,
} from "../config/zapsignCampinas.js";
import type { SheetRow } from "../config.js";
import { formatDateTimeBr, todaySaoPaulo } from "../utils/formatters.js";

const API_BASE = "https://api.zapsign.com.br/api/v1";

export interface ZapSignConfig {
  enabled: boolean;
  apiToken: string;
  templateId: string;
  sandbox: boolean;
}

export interface ZapSignCreatedDocument {
  docToken: string;
  signUrl: string;
  status: string;
  originalFile?: string;
}

export interface ZapSignSigner {
  token: string;
  sign_url: string;
  name: string;
  email?: string;
  phone_number?: string;
}

export interface ZapSignDocResponse {
  token: string;
  status: string;
  original_file?: string;
  signers?: ZapSignSigner[];
}

function getConfig(): ZapSignConfig {
  const apiToken = process.env.ZAPSIGN_API_TOKEN?.trim() || "";
  const templateId = process.env.ZAPSIGN_TEMPLATE_ID_CAMPINAS?.trim() || "";
  const enabled =
    process.env.ZAPSIGN_ENABLED !== "false" && Boolean(apiToken && templateId);

  return {
    enabled,
    apiToken,
    templateId,
    sandbox: process.env.ZAPSIGN_SANDBOX === "true",
  };
}

export function isZapSignCampinasEnabled(): boolean {
  return getConfig().enabled;
}

async function zapsignRequest<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { apiToken } = getConfig();
  if (!apiToken) {
    throw new Error("ZAPSIGN_API_TOKEN não configurado.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    ...(init.json ? { "Content-Type": "application/json" } : {}),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    body: init.json ? JSON.stringify(init.json) : init.body,
  });

  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text };
    }
  }

  if (!response.ok) {
    const detail =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      payload.detail
        ? String(payload.detail)
        : text || `Erro ZapSign (${response.status})`;
    throw new Error(detail);
  }

  return payload as T;
}

export async function configureCampinasTemplateForm(): Promise<void> {
  const { templateId } = getConfig();
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

export async function createCampinasContractDocument(
  contrato: SheetRow,
  externalId: string,
): Promise<ZapSignCreatedDocument> {
  const { templateId, sandbox } = getConfig();
  if (!templateId) {
    throw new Error("ZAPSIGN_TEMPLATE_ID_CAMPINAS não configurado.");
  }

  const nome = String(contrato.Nome || "").trim() || "Cliente";
  const email = String(contrato["E-mail"] || "").trim();
  const telefone = String(contrato.Telefone || "").replace(/\D/g, "");

  const payload = {
    template_id: templateId,
    signer_name: nome,
    signer_email: email || undefined,
    signer_phone_country: "55",
    signer_phone_number: telefone || undefined,
    lang: "pt-br",
    sandbox,
    external_id: externalId,
    folder_path: "/campinas/",
    signer_has_incomplete_fields: true,
    send_automatic_email: process.env.ZAPSIGN_SEND_EMAIL === "true",
    send_automatic_whatsapp: process.env.ZAPSIGN_SEND_WHATSAPP === "true",
    data: buildCampinasTemplateData(contrato),
  };

  const doc = await zapsignRequest<ZapSignDocResponse>("/models/create-doc/", {
    method: "POST",
    json: payload,
  });

  const signer = doc.signers?.[0];
  if (!signer?.sign_url) {
    throw new Error("ZapSign não retornou link de assinatura.");
  }

  return {
    docToken: doc.token,
    signUrl: signer.sign_url,
    status: doc.status,
    originalFile: doc.original_file,
  };
}

export function buildZapSignSheetPatch(doc: ZapSignCreatedDocument): Record<string, string> {
  const now = formatDateTimeBr(todaySaoPaulo());
  return {
    "Link Assinatura": doc.signUrl,
    "Documento ZapSign": doc.docToken,
    "Data Envio": now,
    "Status Assinatura": "Aguardando cliente (ZapSign)",
  };
}
