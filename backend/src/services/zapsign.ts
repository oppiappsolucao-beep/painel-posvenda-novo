import { buildCampinasTemplateData } from "../config/zapsignCampinas.js";
import {
  getZapSignApiBase,
  getZapSignApiToken,
  getZapSignTemplateIdCampinas,
  isZapSignSandbox,
  zapSignEnvironmentLabel,
} from "../config/zapsignEnv.js";
import type { SheetRow } from "../config.js";
import { formatDateTimeBr, todaySaoPaulo } from "../utils/formatters.js";
import { isSmtpConfigured, sendContractSignEmail } from "./email.js";
import { resolveCampinasProductionTemplateId, resetCleanTemplateCache } from "./zapsignCleanTemplate.js";
import {
  applyCampinasClientForm,
  campinasClientAuthMode,
  campinasStoreAuthMode,
  syncCampinasStoreSignerFromSource,
} from "./zapsignFormConfig.js";

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
  const apiToken = getZapSignApiToken();
  const templateId = getZapSignTemplateIdCampinas();
  const enabled =
    process.env.ZAPSIGN_ENABLED !== "false" && Boolean(apiToken && templateId);

  return {
    enabled,
    apiToken,
    templateId,
    sandbox: isZapSignSandbox(),
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

  const response = await fetch(`${getZapSignApiBase()}${path}`, {
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

function isWhatsappDeliveryEnabled(telefone: string): boolean {
  return process.env.ZAPSIGN_SEND_WHATSAPP === "true" && Boolean(telefone);
}

function buildClientSignerPayload(
  telefone: string,
  email: string,
  sendAutomaticEmail: boolean,
  sendAutomaticWhatsapp: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    auth_mode: campinasClientAuthMode(),
    send_automatic_email: sendAutomaticEmail,
    send_automatic_whatsapp: sendAutomaticWhatsapp,
    lock_name: true,
    blank_email: false,
    phone_country: "55",
    require_selfie_photo: false,
    require_document_photo: false,
  };

  if (email) {
    payload.email = email;
    payload.lock_email = true;
  } else {
    payload.lock_email = false;
  }

  if (telefone) {
    payload.phone_number = telefone;
    payload.lock_phone = true;
    payload.blank_phone = false;
  } else {
    payload.lock_phone = false;
    payload.blank_phone = true;
  }

  return payload;
}

async function ensureClientSigner(
  docToken: string,
  contrato: SheetRow,
  sendAutomaticEmail: boolean,
  sendAutomaticWhatsapp: boolean,
): Promise<void> {
  const telefone = String(contrato.Telefone || "").replace(/\D/g, "");
  const email = String(contrato["E-mail"] || "").trim();
  const nome = String(contrato.Nome || "").trim() || "Cliente";

  const detail = await zapsignRequest<{ signers?: ZapSignSignerResponse[] }>(`/docs/${docToken}/`);
  const clientSigner = detail.signers?.[0];
  if (!clientSigner?.token) return;

  if (sendAutomaticWhatsapp && telefone) {
    await zapsignRequest<ZapSignSignerResponse>(`/signers/${clientSigner.token}/`, {
      method: "POST",
      json: {
        ...buildClientSignerPayload(telefone, email, false, true),
        custom_message: zapsignCustomMessage(nome),
      },
    });
    return;
  }

  await zapsignRequest<ZapSignSignerResponse>(`/signers/${clientSigner.token}/`, {
    method: "POST",
    json: buildClientSignerPayload(telefone, email, sendAutomaticEmail, false),
  });
}

function zapsignBrandSettings(): { brand_name: string; created_by: string } {
  return {
    brand_name: (process.env.ZAPSIGN_BRAND_NAME || "SkoobPet").trim(),
    created_by: (process.env.ZAPSIGN_CREATED_BY || "contato@skoobpet.com.br").trim().toLowerCase(),
  };
}

function zapsignCustomMessage(nome: string): string {
  const brand = (process.env.ZAPSIGN_BRAND_NAME || "SkoobPet").trim();
  return [
    `Olá ${nome},`,
    "",
    `Seu contrato de compra do filhote está pronto para revisão e assinatura.`,
    "",
    `Abra o link abaixo, confirme seus dados e responda sobre a documentação do filhote.`,
    "",
    `Abraços,`,
    `Equipe ${brand}`,
  ].join("\n");
}

function buildStoreSignerPayload(
  lojaNome: string,
  lojaEmail: string,
  lojaPhone: string,
  sendAutomaticEmail: boolean,
  sendAutomaticWhatsapp: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: lojaNome,
    email: lojaEmail,
    send_automatic_email: sendAutomaticEmail,
    send_automatic_whatsapp: sendAutomaticWhatsapp,
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
): Promise<{ signUrl?: string; emailSent: boolean; email?: string; whatsappLinkSent: boolean }> {
  const lojaNome = String(contrato.Vendedora || process.env.ZAPSIGN_LOJA_NAME || "Loja Campinas").trim();
  const lojaEmail = String(contrato["E-mail Loja"] || process.env.ZAPSIGN_LOJA_EMAIL || "").trim();
  const lojaPhone = String(
    contrato["Telefone Loja"] || process.env.ZAPSIGN_LOJA_PHONE || "",
  ).replace(/\D/g, "");
  if (!lojaEmail) return { emailSent: false, whatsappLinkSent: false };

  const storeWhatsapp = isWhatsappDeliveryEnabled(lojaPhone);
  const signerPayload = buildStoreSignerPayload(
    lojaNome,
    lojaEmail,
    lojaPhone,
    sendAutomaticEmail,
    storeWhatsapp,
  );
  if (storeWhatsapp) {
    (signerPayload as Record<string, unknown>).custom_message = zapsignCustomMessage(lojaNome);
  }

  const detail = await zapsignRequest<{ signers?: ZapSignSignerResponse[] }>(`/docs/${docToken}/`);
  const signers = detail.signers || [];
  const lojaSigner =
    signers.find((s) => s.qualification === "lojista") ||
    signers.find((s) => s.email === lojaEmail) ||
    signers[1];

  let updated: ZapSignSignerResponse;
  if (lojaSigner?.token) {
    updated = await zapsignRequest<ZapSignSignerResponse>(`/signers/${lojaSigner.token}/`, {
      method: "POST",
      json: signerPayload,
    });
  } else {
    updated = await zapsignRequest<ZapSignSignerResponse>(`/docs/${docToken}/add-signer/`, {
      method: "POST",
      json: signerPayload,
    });
  }

  let whatsappLinkSent = storeWhatsapp && Boolean(lojaPhone);
  return {
    signUrl: updated.sign_url,
    emailSent: sendAutomaticEmail,
    email: lojaEmail,
    whatsappLinkSent,
  };
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
  if (sandbox) {
    console.log(
      `[zapsign] Ambiente ${zapSignEnvironmentLabel()} (${getZapSignApiBase()}) — testes sem validade jurídica.`,
    );
  }
  await ensureCampinasClientFormConfigured(templateId);

  const nome = String(contrato.Nome || "").trim() || "Cliente";
  const email = String(contrato["E-mail"] || "").trim();
  const telefone = String(contrato.Telefone || "").replace(/\D/g, "");
  const whatsappEnabled = isWhatsappDeliveryEnabled(telefone);
  const emailEnabled = shouldSendSignEmails() && Boolean(email);
  const emailViaSmtp = shouldUseSmtpForSignEmails() && !whatsappEnabled;
  const sendViaZapSign = emailEnabled && !emailViaSmtp && !whatsappEnabled;
  const sendWhatsapp = whatsappEnabled;

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
    // WhatsApp só após ensureClientSigner configurar tokenWhatsapp + brand_name.
    send_automatic_whatsapp: false,
    custom_message:
      sendViaZapSign || sendWhatsapp ? zapsignCustomMessage(nome) : "",
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

  await ensureClientSigner(doc.token, contrato, sendViaZapSign, sendWhatsapp);

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

  const storeSendViaZapSign =
    shouldSendSignEmails() && !emailViaSmtp && !isWhatsappDeliveryEnabled(
      String(contrato["Telefone Loja"] || process.env.ZAPSIGN_LOJA_PHONE || "").replace(/\D/g, ""),
    );
  const store = await ensureStoreSigner(doc.token, contrato, storeSendViaZapSign);

  let storeEmailSent = store.emailSent;
  if (shouldUseSmtpForSignEmails() && store.signUrl && store.email) {
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
