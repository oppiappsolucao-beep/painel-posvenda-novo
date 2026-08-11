import { buildCampinasTemplateData } from "../config/zapsignCampinas.js";
import type { SheetRow, UnitKey } from "../config.js";
import { getUnitByKey } from "../config.js";
import {
  getZapSignApiBase,
  getZapSignApiToken,
  getZapSignProductionTemplateId,
  getZapSignTemplateId,
  isZapSignEnabled,
  isZapSignSandbox,
  zapSignEnvironmentLabel,
  zapsignFolderPath,
  ZAPSIGN_UNIT_KEYS,
} from "../config/zapsignEnv.js";
import { getUnitStoreEmailsForNotifications } from "./unitEmails.js";
import { formatDateTimeBr, todaySaoPaulo } from "../utils/formatters.js";
import { isSmtpConfigured, sendContractSignEmail } from "./email.js";
import { readCachedCleanTemplateId, resolveProductionTemplateId, resetCleanTemplateCache } from "./zapsignCleanTemplate.js";
import {
  applyCampinasClientForm,
  campinasClientAuthMode,
  campinasStoreAuthMode,
  ensureUnitTemplateStoreSigner,
  findClientSigner,
  findStoreSigner,
  syncCampinasStoreSignerFromSource,
  templateHasLegacyStoreUploadFields,
  templateHasStoreUploadWorkflow,
  zapsignStoreSignerName,
  zapsignTemplateStoreSignerPanelUrl,
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

interface ZapSignSigner {
  token: string;
  sign_url?: string;
  signing_link?: string;
  name: string;
  email?: string;
  phone_number?: string;
  qualification?: string;
}

export interface ZapSignDocResponse {
  token: string;
  status: string;
  original_file?: string;
  signers?: ZapSignSigner[];
}

function getConfig(unitKey: UnitKey = "campinas"): ZapSignConfig {
  const apiToken = getZapSignApiToken();
  const templateId = getZapSignTemplateId(unitKey);
  const enabled = isZapSignEnabled(unitKey);

  return {
    enabled,
    apiToken,
    templateId,
    sandbox: isZapSignSandbox(),
  };
}

export function isZapSignCampinasEnabled(): boolean {
  return getConfig("campinas").enabled;
}

export { isZapSignEnabled };

const cachedProductionTemplateIds = new Map<UnitKey, string>();
const formConfiguredForTemplateId = new Map<string, string>();

export async function resetProductionTemplateCache(unitKey?: UnitKey): Promise<void> {
  if (unitKey) {
    cachedProductionTemplateIds.delete(unitKey);
    for (const [templateId, configuredFor] of formConfiguredForTemplateId.entries()) {
      if (configuredFor === unitKey) formConfiguredForTemplateId.delete(templateId);
    }
    await resetCleanTemplateCache(unitKey);
    return;
  }

  cachedProductionTemplateIds.clear();
  formConfiguredForTemplateId.clear();
  await resetCleanTemplateCache();
}

/** @deprecated Use resetProductionTemplateCache */
export async function resetCampinasProductionTemplateCache(): Promise<void> {
  return resetProductionTemplateCache("campinas");
}

function shouldAutoConfigureForm(): boolean {
  if (process.env.ZAPSIGN_CONFIGURE_FORM === "false") return false;
  if (isZapSignSandbox()) return false;
  return process.env.ZAPSIGN_CONFIGURE_FORM === "true";
}

/** @deprecated */
function shouldAutoConfigureCampinasForm(): boolean {
  return shouldAutoConfigureForm();
}

async function ensureClientFormConfigured(unitKey: UnitKey, templateId: string): Promise<void> {
  if (!templateId || formConfiguredForTemplateId.get(templateId) === unitKey) return;
  if (!shouldAutoConfigureForm()) return;
  await applyCampinasClientForm(templateId, zapsignRequest);
  formConfiguredForTemplateId.set(templateId, unitKey);
}

function sourceTemplateIdForUnit(unitKey: UnitKey): string {
  return getZapSignTemplateId(unitKey);
}

function isSourceTemplateId(unitKey: UnitKey, templateId: string): boolean {
  const sourceId = sourceTemplateIdForUnit(unitKey);
  return Boolean(sourceId && templateId && templateId === sourceId);
}

async function resolveCleanProductionTemplateId(
  unitKey: UnitKey,
  allowRetry = true,
): Promise<string> {
  const sourceTemplateId = sourceTemplateIdForUnit(unitKey);
  if (!sourceTemplateId) return "";

  await resetProductionTemplateCache(unitKey);
  const resolved = await resolveProductionTemplateId(unitKey, sourceTemplateId, zapsignRequest);
  if (isSourceTemplateId(unitKey, resolved)) {
    if (allowRetry) {
      console.warn(
        `[zapsign] Template limpo (${unitKey}) ainda apontava para o modelo-fonte ${resolved}; tentando novamente.`,
      );
      return resolveCleanProductionTemplateId(unitKey, false);
    }
    throw new Error(
      `ZapSign (${unitKey}): não foi possível obter template limpo (modelo-fonte=${sourceTemplateId}).`,
    );
  }

  cachedProductionTemplateIds.set(unitKey, resolved);
  console.log(`[zapsign] Template limpo de produção (${unitKey}): ${resolved}`);
  return resolved;
}

async function getProductionTemplateId(unitKey: UnitKey, allowRetry = true): Promise<string> {
  const sourceTemplateId = sourceTemplateIdForUnit(unitKey);
  const productionOverride = getZapSignProductionTemplateId(unitKey);

  if (productionOverride && !isSourceTemplateId(unitKey, productionOverride)) {
    cachedProductionTemplateIds.set(unitKey, productionOverride);
    return productionOverride;
  }

  if (productionOverride && isSourceTemplateId(unitKey, productionOverride)) {
    console.warn(
      `[zapsign] ZAPSIGN_PRODUCTION_TEMPLATE_ID_${unitKey.toUpperCase()} aponta para o modelo-fonte; ignorando.`,
    );
  }

  const cachedClean = await readCachedCleanTemplateId(unitKey);
  if (cachedClean && !isSourceTemplateId(unitKey, cachedClean)) {
    const cachedDetail = await zapsignRequest<{ inputs?: Array<{ input_type?: string; label?: string; variable?: string }> }>(
      `/templates/${cachedClean}/`,
    ).catch(() => null);
    if (cachedDetail && !templateHasLegacyStoreUploadFields(cachedDetail)) {
      cachedProductionTemplateIds.set(unitKey, cachedClean);
      return cachedClean;
    }
  }

  if (!sourceTemplateId) return "";

  const cached = cachedProductionTemplateIds.get(unitKey);
  if (cached && !isSourceTemplateId(unitKey, cached)) {
    const cachedDetail = await zapsignRequest<{ inputs?: Array<{ input_type?: string; label?: string; variable?: string }> }>(
      `/templates/${cached}/`,
    ).catch(() => null);
    if (cachedDetail && templateHasLegacyStoreUploadFields(cachedDetail)) {
      console.warn(`[zapsign] Cache (${unitKey}) apontava template legado ${cached}; recriando template limpo.`);
      cachedProductionTemplateIds.delete(unitKey);
    } else if (cachedDetail) {
      return cached;
    }
  } else if (cached && isSourceTemplateId(unitKey, cached)) {
    cachedProductionTemplateIds.delete(unitKey);
  }

  const resolved = await resolveCleanProductionTemplateId(unitKey, allowRetry);
  const detail = await zapsignRequest<{ inputs?: Array<{ input_type?: string; label?: string; variable?: string }> }>(
    `/templates/${resolved}/`,
  ).catch(() => null);

  if (detail && templateHasLegacyStoreUploadFields(detail)) {
    if (allowRetry) {
      console.warn(
        `[zapsign] Template ${resolved} (${unitKey}) ainda contém anexos legados da loja; recriando template limpo.`,
      );
      return getProductionTemplateId(unitKey, false);
    }
    console.error(
      `[zapsign] Template ${resolved} (${unitKey}) ainda contém anexos legados após recriação. ` +
        `Contratos novos podem exibir uploads da loja no link do cliente.`,
    );
  }

  return resolved;
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
  sign_url?: string;
  signing_link?: string;
  qualification?: string;
  email?: string;
}

function signerResponseUrl(signer?: Pick<ZapSignSignerResponse, "sign_url" | "signing_link">): string {
  return String(signer?.sign_url || signer?.signing_link || "").trim();
}

/** Campos aceitos em POST /signers/{token}/ (atualizar signatário). */
const SIGNER_UPDATE_KEYS = new Set([
  "redirect_link",
  "name",
  "email",
  "phone_country",
  "phone_number",
  "auth_mode",
  "lock_name",
  "lock_email",
  "lock_phone",
  "qualification",
  "external_id",
  "send_automatic_whatsapp",
  "send_automatic_email",
  "send_automatic_whatsapp_signed_file",
  "selfie_validation_type",
  "require_document_photo",
  "require_selfie_photo",
  "require_cpf",
  "cpf",
  "validate_cpf",
  "signature_placement",
  "custom_message",
]);

function sanitizeSignerUpdatePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SIGNER_UPDATE_KEYS.has(key) && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function isSignerNoChangeError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("Nenhuma alteração efetuada") || msg.includes("mutáveis de modelo");
}

async function updateSigner(
  signerToken: string,
  payload: Record<string, unknown>,
  fallback?: Pick<ZapSignSignerResponse, "sign_url" | "signing_link" | "token">,
): Promise<ZapSignSignerResponse> {
  try {
    return await zapsignRequest<ZapSignSignerResponse>(`/signers/${signerToken}/`, {
      method: "POST",
      json: sanitizeSignerUpdatePayload(payload),
    });
  } catch (error) {
    if (isSignerNoChangeError(error)) {
      const fallbackUrl = signerResponseUrl(fallback);
      if (fallbackUrl) {
        return {
          token: fallback?.token || signerToken,
          sign_url: fallbackUrl,
          signing_link: fallback?.signing_link,
        };
      }
      try {
        const current = await zapsignRequest<ZapSignSignerResponse>(`/signers/${signerToken}/`, {
          method: "GET",
        });
        const currentUrl = signerResponseUrl(current);
        if (currentUrl) {
          return { ...current, sign_url: currentUrl };
        }
      } catch {
        /* signatário já existe; link virá do documento */
      }
      return { token: signerToken, sign_url: "" };
    }
    throw error;
  }
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
  } else {
    payload.lock_phone = false;
  }

  return payload;
}

async function addClientSignerToDocument(
  docToken: string,
  contrato: SheetRow,
  sendAutomaticEmail: boolean,
  sendAutomaticWhatsapp: boolean,
): Promise<ZapSignSignerResponse> {
  const telefone = String(contrato.Telefone || "").replace(/\D/g, "");
  const email = String(contrato["E-mail"] || "").trim();
  const nome = String(contrato.Nome || "").trim() || "Cliente";

  const payload: Record<string, unknown> = {
    name: nome,
    email: email || undefined,
    qualification: "cliente",
    ...buildClientSignerPayload(telefone, email, sendAutomaticEmail, sendAutomaticWhatsapp),
  };

  if (sendAutomaticWhatsapp && telefone) {
    payload.custom_message = zapsignCustomMessage(nome);
    payload.send_automatic_whatsapp = true;
    payload.send_automatic_email = false;
  }

  return zapsignRequest<ZapSignSignerResponse>(`/docs/${docToken}/add-signer/`, {
    method: "POST",
    json: payload,
  });
}

async function ensureClientSigner(
  docToken: string,
  contrato: SheetRow,
  sendAutomaticEmail: boolean,
  sendAutomaticWhatsapp: boolean,
): Promise<{ signUrl?: string }> {
  const telefone = String(contrato.Telefone || "").replace(/\D/g, "");
  const email = String(contrato["E-mail"] || "").trim();
  const nome = String(contrato.Nome || "").trim() || "Cliente";

  const detail = await zapsignRequest<{ signers?: ZapSignSignerResponse[] }>(`/docs/${docToken}/`);
  const signers = detail.signers || [];
  let clientSigner = findClientSigner(signers);

  if (!clientSigner?.token && signers.length <= 1) {
    clientSigner = await addClientSignerToDocument(
      docToken,
      contrato,
      sendAutomaticEmail,
      sendAutomaticWhatsapp,
    );
    return { signUrl: signerResponseUrl(clientSigner) };
  }

  if (!clientSigner?.token) return {};

  const existingUrl = signerResponseUrl(clientSigner);
  if (!sendAutomaticEmail && !sendAutomaticWhatsapp) {
    return { signUrl: existingUrl };
  }

  const payload = {
    name: nome,
    email: email || undefined,
    ...buildClientSignerPayload(telefone, email, sendAutomaticEmail, sendAutomaticWhatsapp),
    qualification: "cliente",
  };

  if (sendAutomaticWhatsapp && telefone) {
    (payload as Record<string, unknown>).custom_message = zapsignCustomMessage(nome);
    (payload as Record<string, unknown>).send_automatic_whatsapp = true;
    (payload as Record<string, unknown>).send_automatic_email = false;
  }

  const updated = await updateSigner(clientSigner.token, payload as Record<string, unknown>, {
    token: clientSigner.token,
    sign_url: clientSigner.sign_url,
    signing_link: clientSigner.signing_link,
  });

  return { signUrl: signerResponseUrl(updated) || signerResponseUrl(clientSigner) };
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
  authMode: string,
  sendAutomaticEmail: boolean,
  sendAutomaticWhatsapp: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: lojaNome,
    email: lojaEmail,
    send_automatic_email: sendAutomaticEmail,
    send_automatic_whatsapp: sendAutomaticWhatsapp,
    auth_mode: authMode,
    qualification: "lojista",
    lock_email: true,
    lock_name: true,
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
  unitKey: UnitKey,
  docToken: string,
  templateId: string,
  contrato: SheetRow,
  sendAutomaticEmail: boolean,
): Promise<{ signUrl?: string; emailSent: boolean; email?: string; whatsappLinkSent: boolean }> {
  const lojaNome = zapsignStoreSignerName(unitKey);
  const configuredEmails = await getUnitStoreEmailsForNotifications(unitKey, contrato);
  const lojaEmail = String(
    contrato["E-mail Loja"] || process.env.ZAPSIGN_LOJA_EMAIL || configuredEmails[0] || "",
  ).trim();
  const lojaPhone = String(
    contrato["Telefone Loja"] || process.env.ZAPSIGN_LOJA_PHONE || "",
  ).replace(/\D/g, "");
  if (!lojaEmail) return { emailSent: false, whatsappLinkSent: false };

  const storeWhatsapp = isWhatsappDeliveryEnabled(lojaPhone);

  const templateDetail = templateId
    ? await zapsignRequest<{ signers?: Array<{ auth_mode?: string; qualification?: string; name?: string }> }>(
        `/templates/${templateId}/`,
      )
    : { signers: [] };
  const templateStoreAuth =
    findStoreSigner(templateDetail.signers || [])?.auth_mode?.trim() || campinasStoreAuthMode();

  const detail = await zapsignRequest<{
    signers?: ZapSignSignerResponse[];
    template?: { token?: string };
  }>(`/docs/${docToken}/`);
  const signers = detail.signers || [];
  const lojaSigner = findStoreSigner(signers);

  if (!lojaSigner?.token) {
    throw new Error(
      `Template ZapSign sem signatário lojista (1º signatário). Configure: ${zapsignTemplateStoreSignerPanelUrl(templateId)} → Signatário 1`,
    );
  }

  const existingUrl = signerResponseUrl(lojaSigner);
  if (!sendAutomaticEmail && !storeWhatsapp && existingUrl) {
    return {
      signUrl: existingUrl,
      emailSent: false,
      email: lojaEmail,
      whatsappLinkSent: false,
    };
  }

  const signerPayload = buildStoreSignerPayload(
    lojaNome,
    lojaEmail,
    lojaPhone,
    templateStoreAuth,
    sendAutomaticEmail,
    storeWhatsapp,
  );
  if (storeWhatsapp) {
    (signerPayload as Record<string, unknown>).custom_message = zapsignCustomMessage(lojaNome);
  }

  const updated = await updateSigner(lojaSigner.token, signerPayload, {
    token: lojaSigner.token,
    sign_url: lojaSigner.sign_url,
    signing_link: lojaSigner.signing_link,
  });

  const whatsappLinkSent = storeWhatsapp && Boolean(lojaPhone);
  return {
    signUrl: signerResponseUrl(updated) || signerResponseUrl(lojaSigner),
    emailSent: sendAutomaticEmail,
    email: lojaEmail,
    whatsappLinkSent,
  };
}

export async function ensureProductionTemplate(unitKey: UnitKey): Promise<string> {
  return getProductionTemplateId(unitKey);
}

/** @deprecated Use ensureProductionTemplate("campinas") */
export async function ensureCampinasProductionTemplate(): Promise<string> {
  return getProductionTemplateId("campinas");
}

export async function configureUnitTemplateForm(unitKey: UnitKey): Promise<void> {
  if (!shouldAutoConfigureForm()) return;

  const templateId = await getProductionTemplateId(unitKey);
  if (!templateId) return;

  const sourceTemplateId = getConfig(unitKey).templateId;
  if (sourceTemplateId && sourceTemplateId !== templateId) {
    await syncCampinasStoreSignerFromSource(sourceTemplateId, templateId, zapsignRequest);
  }

  await applyCampinasClientForm(templateId, zapsignRequest);
  formConfiguredForTemplateId.set(templateId, unitKey);
}

/** @deprecated Use configureUnitTemplateForm("campinas") */
export async function configureCampinasTemplateForm(): Promise<void> {
  return configureUnitTemplateForm("campinas");
}

export async function createUnitContractDocument(
  unitKey: UnitKey,
  contrato: SheetRow,
  externalId: string,
): Promise<ZapSignCreatedDocument> {
  const { sandbox } = getConfig(unitKey);
  let templateId = await getProductionTemplateId(unitKey);
  if (!templateId) {
    throw new Error(`Template ZapSign não configurado para ${unitKey}.`);
  }
  if (isSourceTemplateId(unitKey, templateId)) {
    console.warn(
      `[zapsign] create-doc (${unitKey}) recebeu modelo-fonte ${templateId}; forçando template limpo.`,
    );
    templateId = await resolveCleanProductionTemplateId(unitKey);
  }
  console.log(`[zapsign] create-doc (${unitKey}) template_id=${templateId}`);
  if (sandbox) {
    console.log(
      `[zapsign] Ambiente ${zapSignEnvironmentLabel()} (${getZapSignApiBase()}) — ${unitKey}.`,
    );
  }
  await ensureClientFormConfigured(unitKey, templateId).catch((error) => {
    console.warn(
      `[zapsign] Formulário do template ignorado (${unitKey}):`,
      error instanceof Error ? error.message : error,
    );
  });
  await ensureUnitTemplateStoreSigner(templateId, zapsignRequest);

  const templateDetail = await zapsignRequest<{
    signers?: Array<{ qualification?: string }>;
    inputs?: Array<{ input_type?: string; label?: string }>;
  }>(`/templates/${templateId}/`);
  if (!templateHasStoreUploadWorkflow(templateDetail)) {
    console.warn(
      `[zapsign] Template sem 2 signatários (${unitKey}). Configure: ${zapsignTemplateStoreSignerPanelUrl(templateId)}`,
    );
  }

  const nome = String(contrato.Nome || "").trim() || "Cliente";
  const email = String(contrato["E-mail"] || "").trim();
  const telefone = String(contrato.Telefone || "").replace(/\D/g, "");
  const lojaNome = zapsignStoreSignerName(unitKey);
  const configuredEmails = await getUnitStoreEmailsForNotifications(unitKey, contrato);
  const lojaEmail = String(
    contrato["E-mail Loja"] || process.env.ZAPSIGN_LOJA_EMAIL || configuredEmails[0] || "",
  ).trim();
  const lojaPhone = String(
    contrato["Telefone Loja"] || process.env.ZAPSIGN_LOJA_PHONE || "",
  ).replace(/\D/g, "");
  const whatsappEnabled = isWhatsappDeliveryEnabled(telefone);
  const emailEnabled = shouldSendSignEmails() && Boolean(email);
  const emailViaSmtp = shouldUseSmtpForSignEmails() && !whatsappEnabled;
  const sendViaZapSign = emailEnabled && !emailViaSmtp && !whatsappEnabled;
  const sendWhatsapp = whatsappEnabled;

  const templateData = buildCampinasTemplateData(contrato);
  const petVars = ["{{nome-animal}}", "{{raca}}", "{{cor}}", "{{sexo}}", "{{microchip}}", "{{especie}}", "{{pelagem}}", "{{data-nasc}}"];
  const missingPet = petVars.filter((v) => !templateData.some((d) => d.de === v));
  if (missingPet.length > 0) {
    console.warn(
      `[zapsign] Dados do filhote incompletos (${unitKey}) (${missingPet.join(", ")}).`,
    );
  }

  const unit = getUnitByKey(unitKey);
  const brandName = unit ? `SkoobPet ${unit.label}` : (process.env.ZAPSIGN_BRAND_NAME || "SkoobPet").trim();

  const payload = {
    template_id: templateId,
    signer_name: lojaNome,
    signer_email: lojaEmail || undefined,
    signer_phone_country: "55",
    signer_phone_number: lojaPhone || undefined,
    lang: "pt-br",
    sandbox,
    external_id: externalId,
    folder_path: zapsignFolderPath(unitKey),
    signer_has_incomplete_fields: true,
    signature_order_active: true,
    brand_name: brandName,
    created_by: (process.env.ZAPSIGN_CREATED_BY || "contato@skoobpet.com.br").trim().toLowerCase(),
    send_automatic_email: false,
    send_automatic_whatsapp: false,
    custom_message: "",
    data: templateData,
  };

  const doc = await zapsignRequest<ZapSignDocResponse>("/models/create-doc/", {
    method: "POST",
    json: payload,
  });

  const docDetail = await zapsignRequest<{ signers?: ZapSignSigner[] }>(`/docs/${doc.token}/`);

  const storeSendViaZapSign =
    shouldSendSignEmails() && !emailViaSmtp && !isWhatsappDeliveryEnabled(lojaPhone);
  const store = await ensureStoreSigner(unitKey, doc.token, templateId, contrato, storeSendViaZapSign);

  const client = await ensureClientSigner(doc.token, contrato, sendViaZapSign, sendWhatsapp);
  const docSigners = docDetail.signers || doc.signers || [];
  const clientSignUrl =
    client.signUrl ||
    signerResponseUrl(findClientSigner(docSigners));

  if (!clientSignUrl) {
    throw new Error("ZapSign não retornou link de assinatura do cliente.");
  }

  let clientEmailSent = sendViaZapSign;
  if (emailViaSmtp && email) {
    await sendContractSignEmail({
      to: email,
      nome,
      signUrl: clientSignUrl,
      papel: "cliente",
      brand: brandName,
    });
    clientEmailSent = true;
  }

  let storeEmailSent = store.emailSent;
  if (shouldUseSmtpForSignEmails() && store.signUrl && store.email) {
    await sendContractSignEmail({
      to: store.email,
      nome: lojaNome,
      signUrl: store.signUrl,
      papel: "loja",
      brand: brandName,
    });
    storeEmailSent = true;
  }

  return {
    docToken: doc.token,
    signUrl: clientSignUrl,
    status: doc.status,
    originalFile: doc.original_file,
    emailSent: clientEmailSent,
    clientEmail: email || undefined,
    storeSignUrl: store.signUrl,
    storeEmailSent,
    storeEmail: store.email,
  };
}

/** @deprecated Use createUnitContractDocument("campinas", ...) */
export async function createCampinasContractDocument(
  contrato: SheetRow,
  externalId: string,
): Promise<ZapSignCreatedDocument> {
  return createUnitContractDocument("campinas", contrato, externalId);
}

export async function warmUpZapSignTemplates(): Promise<void> {
  for (const unitKey of ZAPSIGN_UNIT_KEYS) {
    if (!isZapSignEnabled(unitKey)) continue;
    await getProductionTemplateId(unitKey);
    await configureUnitTemplateForm(unitKey);
    console.log(`[zapsign] Template de produção e formulário prontos (${unitKey}).`);
  }
}

export async function uploadZapSignExtraDoc(
  docToken: string,
  name: string,
  base64Pdf: string,
): Promise<{ token: string; name: string }> {
  return zapsignRequest<{ token: string; name: string }>(`/docs/${docToken}/upload-extra-doc/`, {
    method: "POST",
    json: { name, base64_pdf: base64Pdf },
  });
}

/** PDF gerado pelo ZapSign (original ou assinado) para pré-visualização no painel. */
export async function fetchZapSignDocumentPdf(docToken: string): Promise<Buffer | null> {
  const token = docToken.trim();
  if (!token) return null;

  try {
    const doc = await zapsignRequest<{ original_file?: string; signed_file?: string }>(`/docs/${token}/`);
    const fileUrl = String(doc.signed_file || doc.original_file || "").trim();
    if (!fileUrl) return null;

    const response = await fetch(fileUrl);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length ? buffer : null;
  } catch (error) {
    console.warn(
      "[zapsign] Não foi possível baixar PDF para pré-visualização:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
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
    "Status Assinatura": "Aguardando loja (ZapSign)",
  };
  if (doc.storeSignUrl) patch["Link Assinatura Loja"] = doc.storeSignUrl;
  if (doc.storeEmail) patch["E-mail Loja"] = doc.storeEmail;
  else if (contrato?.["E-mail Loja"]) patch["E-mail Loja"] = String(contrato["E-mail Loja"]);
  return patch;
}
