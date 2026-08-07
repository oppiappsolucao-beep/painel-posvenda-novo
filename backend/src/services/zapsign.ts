import { buildCampinasTemplateData } from "../config/zapsignCampinas.js";
import type { SheetRow } from "../config.js";
import { formatDateTimeBr, todaySaoPaulo } from "../utils/formatters.js";
import { isSmtpConfigured, sendContractSignEmail } from "./email.js";
import { resolveCampinasProductionTemplateId, resetCleanTemplateCache } from "./zapsignCleanTemplate.js";
import { applyCampinasClientForm, campinasStoreAuthMode, syncCampinasStoreSignerFromSource } from "./zapsignFormConfig.js";

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
  emailSent: boolean;
  clientEmail?: string;
  storeSignUrl?: string;
  storeEmailSent?: boolean;
  storeEmail?: string;
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

let cachedProductionTemplateId: string | null = null;
let formConfiguredForTemplateId: string | null = null;

export async function resetCampinasProductionTemplateCache(): Promise<void> {
  cachedProductionTemplateId = null;
  formConfiguredForTemplateId = null;
  await resetCleanTemplateCache();
}

async function ensureCampinasClientFormConfigured(templateId: string): Promise<void> {
  if (!templateId || formConfiguredForTemplateId === templateId) return;
  await applyCampinasClientForm(templateId, zapsignRequest);
  formConfiguredForTemplateId = templateId;
}

async function getCampinasProductionTemplateId(): Promise<string> {
  const { templateId } = getConfig();
  if (!templateId) return "";
  if (cachedProductionTemplateId) return cachedProductionTemplateId;

  cachedProductionTemplateId = await resolveCampinasProductionTemplateId(
    templateId,
    zapsignRequest,
  );
  return cachedProductionTemplateId;
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

interface ZapSignSignerResponse {
  token: string;
  sign_url: string;
  qualification?: string;
  email?: string;
}

function shouldSendSignEmails(): boolean {
  return process.env.ZAPSIGN_SEND_EMAIL !== "false";
}

function shouldUseSmtpForSignEmails(): boolean {
  return (
    shouldSendSignEmails() &&
    process.env.ZAPSIGN_EMAIL_VIA_SMTP !== "false" &&
    isSmtpConfigured()
  );
}

function zapsignBrandSettings(): { brand_name: string; created_by: string } {
  return {
    brand_name: (process.env.ZAPSIGN_BRAND_NAME || "SkoobPet Campinas").trim(),
    created_by: (process.env.ZAPSIGN_CREATED_BY || "contato@skoobpet.com.br").trim().toLowerCase(),
  };
}

function buildStoreSignerPayload(
  lojaNome: string,
  lojaEmail: string,
  lojaPhone: string,
  sendAutomaticEmail: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: lojaNome,
    email: lojaEmail,
    send_automatic_email: sendAutomaticEmail,
    auth_mode: campinasStoreAuthMode(),
    qualification: "lojista",
    lock_email: true,
    lock_name: true,
    blank_phone: false,
    blank_email: false,
    phone_country: "55",
    require_selfie_photo: false,
    require_document_photo: false,
  };

  if (lojaPhone) {
    payload.phone_number = lojaPhone;
    payload.lock_phone = true;
  } else {
    payload.lock_phone = false;
  }

  return payload;
}

async function ensureStoreSigner(
  docToken: string,
  contrato: SheetRow,
  sendAutomaticEmail: boolean,
): Promise<{ signUrl?: string; emailSent: boolean; email?: string }> {
  const lojaNome = String(contrato.Vendedora || process.env.ZAPSIGN_LOJA_NAME || "Loja Campinas").trim();
  const lojaEmail = String(contrato["E-mail Loja"] || process.env.ZAPSIGN_LOJA_EMAIL || "").trim();
  const lojaPhone = String(
    contrato["Telefone Loja"] || process.env.ZAPSIGN_LOJA_PHONE || "",
  ).replace(/\D/g, "");
  if (!lojaEmail) return { emailSent: false };

  const signerPayload = buildStoreSignerPayload(lojaNome, lojaEmail, lojaPhone, sendAutomaticEmail);

  const detail = await zapsignRequest<{ signers?: ZapSignSignerResponse[] }>(`/docs/${docToken}/`);
  const signers = detail.signers || [];
  const lojaSigner =
    signers.find((s) => s.qualification === "lojista") ||
    signers.find((s) => s.email === lojaEmail) ||
    signers[1];

  if (lojaSigner?.token) {
    const updated = await zapsignRequest<ZapSignSignerResponse>(`/signers/${lojaSigner.token}/`, {
      method: "POST",
      json: signerPayload,
    });
    return { signUrl: updated.sign_url, emailSent: sendAutomaticEmail, email: lojaEmail };
  }

  const added = await zapsignRequest<ZapSignSignerResponse>(`/docs/${docToken}/add-signer/`, {
    method: "POST",
    json: signerPayload,
  });

  return { signUrl: added.sign_url, emailSent: sendAutomaticEmail, email: lojaEmail };
}

export async function ensureCampinasProductionTemplate(): Promise<string> {
  return getCampinasProductionTemplateId();
}

export async function configureCampinasTemplateForm(): Promise<void> {
  const templateId = await getCampinasProductionTemplateId();
  if (!templateId) return;

  const sourceTemplateId = getConfig().templateId;
  if (sourceTemplateId && sourceTemplateId !== templateId) {
    await syncCampinasStoreSignerFromSource(sourceTemplateId, templateId, zapsignRequest);
  }

  await applyCampinasClientForm(templateId, zapsignRequest);
  formConfiguredForTemplateId = templateId;
}

export async function createCampinasContractDocument(
  contrato: SheetRow,
  externalId: string,
): Promise<ZapSignCreatedDocument> {
  const { sandbox } = getConfig();
  const templateId = await getCampinasProductionTemplateId();
  if (!templateId) {
    throw new Error("ZAPSIGN_TEMPLATE_ID_CAMPINAS não configurado.");
  }
  await ensureCampinasClientFormConfigured(templateId);

  const nome = String(contrato.Nome || "").trim() || "Cliente";
  const email = String(contrato["E-mail"] || "").trim();
  const telefone = String(contrato.Telefone || "").replace(/\D/g, "");
  const emailEnabled = shouldSendSignEmails() && Boolean(email);
  const emailViaSmtp = shouldUseSmtpForSignEmails();
  const sendViaZapSign = emailEnabled && !emailViaSmtp;
  const sendWhatsapp =
    process.env.ZAPSIGN_SEND_WHATSAPP === "true" && Boolean(telefone);

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
    ...zapsignBrandSettings(),
    send_automatic_email: sendViaZapSign,
    send_automatic_whatsapp: sendWhatsapp,
    custom_message: sendViaZapSign
      ? `Olá ${nome},\n\nSeu contrato de compra do filhote está pronto para revisão e assinatura.\n\nAbra o link abaixo, confirme seus dados e responda sobre a documentação do filhote.\n\nAbraços,\nEquipe SkoobPet Campinas`
      : "",
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

  let clientEmailSent = sendViaZapSign;
  if (emailViaSmtp && email) {
    await sendContractSignEmail({
      to: email,
      nome,
      signUrl: signer.sign_url,
      papel: "cliente",
    });
    clientEmailSent = true;
  }

  const storeSendViaZapSign = shouldSendSignEmails() && !emailViaSmtp;
  const store = await ensureStoreSigner(doc.token, contrato, storeSendViaZapSign);

  let storeEmailSent = store.emailSent;
  if (emailViaSmtp && store.signUrl && store.email) {
    const lojaNome = String(contrato.Vendedora || process.env.ZAPSIGN_LOJA_NAME || "Loja Campinas").trim();
    await sendContractSignEmail({
      to: store.email,
      nome: lojaNome,
      signUrl: store.signUrl,
      papel: "loja",
    });
    storeEmailSent = true;
  }

  return {
    docToken: doc.token,
    signUrl: signer.sign_url,
    status: doc.status,
    originalFile: doc.original_file,
    emailSent: clientEmailSent,
    clientEmail: email || undefined,
    storeSignUrl: store.signUrl,
    storeEmailSent,
    storeEmail: store.email,
  };
}

export function buildZapSignSheetPatch(
  doc: ZapSignCreatedDocument,
  contrato?: SheetRow,
): Record<string, string> {
  const now = formatDateTimeBr(todaySaoPaulo());
  const patch: Record<string, string> = {
    "Link Assinatura": doc.signUrl,
    "Documento ZapSign": doc.docToken,
    "Data Envio": now,
    "Status Assinatura": "Aguardando cliente (ZapSign)",
  };
  if (doc.storeSignUrl) patch["Link Assinatura Loja"] = doc.storeSignUrl;
  if (doc.storeEmail) patch["E-mail Loja"] = doc.storeEmail;
  else if (contrato?.["E-mail Loja"]) patch["E-mail Loja"] = String(contrato["E-mail Loja"]);
  return patch;
}
