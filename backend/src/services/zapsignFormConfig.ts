import { getUnitByKey, type UnitKey } from "../config.js";
import {
  CAMPINAS_CLIENT_DOC_ACK_FIELDS,
  CAMPINAS_CLIENT_FORM_LABELS,
  CAMPINAS_CLIENT_FORM_VARIABLES,
  CAMPINAS_CLIENT_UPLOAD_FIELDS,
  CAMPINAS_STORE_CNPJ_FIELD,
  CAMPINAS_STORE_FORM_LABELS,
  CAMPINAS_STORE_PREFILLED_VARIABLES,
  campinasClientFormFields,
  campinasStoreZapSignFormFields,
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
  selfie_validation_type?: string;
  hide_phone?: boolean;
  hide_email?: boolean;
}

interface ZapSignTemplateDetail {
  inputs?: ZapSignTemplateInput[];
  signers?: ZapSignTemplateSigner[];
}

export function campinasStoreAuthMode(): string {
  return (process.env.ZAPSIGN_LOJA_AUTH_MODE || "assinaturaTela").trim();
}

/** Índices preferenciais quando o template segue loja→cliente. */
export const CAMPINAS_STORE_SIGNER_INDEX = 0;
export const CAMPINAS_CLIENT_SIGNER_INDEX = 1;

const STORE_FORM_ORDER_BASE = 1;
const CLIENT_FORM_ORDER_BASE = 20;

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

function mapSignerForTemplateApi(signer: ZapSignTemplateSigner) {
  return {
    name: signer.name ?? "",
    auth_mode: signer.auth_mode ?? campinasStoreAuthMode(),
    email: signer.email ?? "",
    phone_country: signer.phone_country ?? "55",
    phone_number: signer.phone_number ?? "",
    qualification: signer.qualification ?? "",
    blank_email: signer.blank_email ?? false,
    blank_phone: signer.blank_phone ?? false,
    lock_name: signer.lock_name ?? false,
    lock_email: signer.lock_email ?? false,
    lock_phone: signer.lock_phone ?? false,
    hide_phone: signer.hide_phone ?? false,
    hide_email: signer.hide_email ?? false,
    require_selfie_photo: signer.require_selfie_photo ?? false,
    require_document_photo: signer.require_document_photo ?? false,
    selfie_validation_type: signer.selfie_validation_type ?? "none",
  };
}

/** Signatários loja→cliente para template limpo (fallback se source não tiver 2). */
export function buildCleanTemplateSigners(unitKey: UnitKey) {
  return [
    {
      name: zapsignStoreSignerName(unitKey),
      auth_mode: campinasStoreAuthMode(),
      qualification: "lojista",
      blank_email: false,
      blank_phone: false,
      lock_name: true,
    },
    {
      name: "{{contratante-nome-completo}}",
      email: "{{e-mail}}",
      phone_country: "55",
      phone_number: "{{celular}}",
      auth_mode: campinasClientAuthMode(),
      qualification: "cliente",
      blank_email: false,
      blank_phone: false,
      lock_name: true,
      require_document_photo: true,
    },
  ];
}

function isStoreSigner(signer: { qualification?: string; name?: string }): boolean {
  return (
    String(signer.qualification || "").toLowerCase() === "lojista" ||
    String(signer.name || "").toLowerCase().includes("loja")
  );
}

export function findStoreSigner<T extends { qualification?: string; name?: string }>(
  signers: T[] = [],
): T | undefined {
  return (
    signers.find((signer) => String(signer.qualification || "").toLowerCase() === "lojista") ||
    signers.find(isStoreSigner) ||
    signers[CAMPINAS_STORE_SIGNER_INDEX]
  );
}

export function findClientSigner<T extends { qualification?: string; name?: string }>(
  signers: T[] = [],
): T | undefined {
  return (
    signers.find((signer) => String(signer.qualification || "").toLowerCase() === "cliente") ||
    signers.find((signer) => !isStoreSigner(signer)) ||
    signers[CAMPINAS_CLIENT_SIGNER_INDEX]
  );
}

export function resolveTemplateSignerIndexes(signers: ZapSignTemplateSigner[] = []) {
  const storeIndex = signers.findIndex(isStoreSigner);
  const clientIndex = signers.findIndex((signer) => !isStoreSigner(signer));
  return {
    storeIndex: storeIndex >= 0 ? storeIndex : CAMPINAS_STORE_SIGNER_INDEX,
    clientIndex: clientIndex >= 0 ? clientIndex : CAMPINAS_CLIENT_SIGNER_INDEX,
  };
}

/** Signatário com índice menor no template recebe order 1+; o outro recebe order 20+. */
function orderBaseForRole(role: "client" | "store", signers: ZapSignTemplateSigner[] = []): number {
  if (signers.length < 2) {
    return role === "store" ? STORE_FORM_ORDER_BASE : CLIENT_FORM_ORDER_BASE;
  }
  const { storeIndex, clientIndex } = resolveTemplateSignerIndexes(signers);
  const roleIndex = role === "store" ? storeIndex : clientIndex;
  const otherIndex = role === "store" ? clientIndex : storeIndex;
  return roleIndex < otherIndex ? STORE_FORM_ORDER_BASE : CLIENT_FORM_ORDER_BASE;
}

/** Monta inputs reordenando campos já existentes no DOCX (update-form só altera variáveis do modelo). */
export function buildTemplateFormInputs(detail?: ZapSignTemplateDetail) {
  const sourceInputs = detail?.inputs || [];
  const signers = detail?.signers || [];
  const singleSignerTemplate = signers.length < 2;
  const clientOrderBase = orderBaseForRole("client", signers);
  const storeOrderBase = orderBaseForRole("store", signers);

  if (sourceInputs.length === 0) {
    const storeInputs = campinasStoreZapSignFormFields().map(mapFormField);
    const clientInputs = campinasClientFormFields().map(mapFormField);
    return [
      ...storeInputs.map((input, index) => ({ ...input, order: storeOrderBase + index })),
      ...clientInputs.map((input, index) => ({ ...input, order: clientOrderBase + index })),
    ];
  }

  let clientInputs = resolveClientDocAckFields(sourceInputs);
  clientInputs.push(...sourceInputs.filter((input) => isClientUploadInput(input)));
  let storeInputs = sourceInputs.filter((input) => isStoreCnpjInput(input));

  if (storeInputs.length === 0) {
    storeInputs = campinasStoreZapSignFormFields().map((field) => ({
      variable: field.variable,
      input_type: field.input_type,
      label: field.label,
      help_text: field.help_text,
      options: field.options,
      required: field.required,
      order: field.order,
    }));
  }

  const existingClientLabels = new Set(
    clientInputs.map((input) => String(input.label || "").trim().toLowerCase()),
  );
  for (const field of CAMPINAS_CLIENT_UPLOAD_FIELDS) {
    if (!existingClientLabels.has(field.label.trim().toLowerCase())) {
      clientInputs.push({
        variable: field.variable,
        input_type: field.input_type,
        label: field.label,
        help_text: field.help_text,
        options: field.options,
        required: field.required,
        order: field.order,
      });
    }
  }

  const orderFields = (inputs: ZapSignTemplateInput[], base: number, role: "client" | "store") =>
    inputs.map((input, index) => ({
      ...mapExistingTemplateInput(input),
      order: base + index,
      required: isPrefilledContractField(input)
        ? false
        : role === "store"
          ? true
          : (input.required ?? true),
    }));

  const clientFieldsForSingleSigner = clientInputs.map((input, index) => ({
    ...mapExistingTemplateInput(input),
    order: CLIENT_FORM_ORDER_BASE + index,
    required: input.required ?? true,
  }));

  // Template com 1 signatário no modelo: loja preenche CNPJ (order 1+); cliente (adicionado ao doc) usa order 20+.
  if (singleSignerTemplate) {
    return [
      ...orderFields(storeInputs, STORE_FORM_ORDER_BASE, "store"),
      ...clientFieldsForSingleSigner,
    ];
  }

  // Dois signatários no modelo: separar por índice (cliente order baixo/alto conforme template).
  return [
    ...orderFields(clientInputs, clientOrderBase, "client"),
    ...orderFields(storeInputs, storeOrderBase, "store"),
  ];
}

function templateInputKey(input: ZapSignTemplateInput): string {
  const variable = String(input.variable || "").trim();
  if (variable) return `v:${variable}`;
  return `l:${String(input.label || "").trim().toLowerCase()}|${String(input.input_type || "").trim().toLowerCase()}`;
}

function dedupeTemplateInputs(inputs: ZapSignTemplateInput[]): ZapSignTemplateInput[] {
  const seen = new Set<string>();
  const unique: ZapSignTemplateInput[] = [];
  for (const input of inputs) {
    const key = templateInputKey(input);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(input);
  }
  return unique;
}

const PREFILLED_VARIABLE_NAMES = new Set(
  CAMPINAS_STORE_PREFILLED_VARIABLES.map((variable) => normalizeTemplateVariable(variable)),
);

function normalizeTemplateVariable(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^\{\{+/, "")
    .replace(/\}\}+$/, "");
}

function isPrefilledContractField(input: ZapSignTemplateInput): boolean {
  const variable = normalizeTemplateVariable(input.variable || "");
  const label = normalizeTemplateVariable(input.label || "");
  if (variable && PREFILLED_VARIABLE_NAMES.has(variable)) return true;
  if (label && PREFILLED_VARIABLE_NAMES.has(label)) return true;
  if (Number(input.order || 0) >= 500) return true;
  if (String(input.input_type || "").trim().toLowerCase() === "signer_fullname") return true;
  return isLegacyClientField(input);
}

function shouldExposeInSignerForm(input: ZapSignTemplateInput): boolean {
  return !isStoreUploadInput(input) && !isPrefilledContractField(input) && !isLegacyClientField(input);
}

function mapStoreSignerFromSource(signer: ZapSignTemplateSigner, unitKey: UnitKey) {
  const mapped = mapSignerForTemplateApi(signer);
  return {
    ...mapped,
    name: zapsignStoreSignerName(unitKey),
    auth_mode: campinasStoreAuthMode(),
    qualification: "lojista",
    blank_email: false,
    blank_phone: false,
    lock_name: true,
  };
}

function mapClientSignerFromSource(signer: ZapSignTemplateSigner) {
  const mapped = mapSignerForTemplateApi(signer);
  return {
    ...mapped,
    name: "{{contratante-nome-completo}}",
    email: "{{e-mail}}",
    phone_country: "55",
    phone_number: "{{celular}}",
    auth_mode: campinasClientAuthMode(),
    qualification: "cliente",
    blank_email: false,
    blank_phone: false,
    lock_name: true,
    require_document_photo: true,
  };
}

/** Preserva config do modelo-fonte, mas sempre loja (1º) → cliente (2º). */
export function buildSignersFromSource(sourceSigners: ZapSignTemplateSigner[], unitKey: UnitKey) {
  const fallback = buildCleanTemplateSigners(unitKey);
  const storeSource = sourceSigners.find(isStoreSigner);
  const clientSource = sourceSigners.find((signer) => !isStoreSigner(signer));

  return [
    storeSource ? mapStoreSignerFromSource(storeSource, unitKey) : fallback[0],
    clientSource ? mapClientSignerFromSource(clientSource) : fallback[1],
  ];
}

function isDocAckRadioInput(input: ZapSignTemplateInput): boolean {
  const variable = normalizeTemplateVariable(input.variable || "");
  const label = normalizeTemplateVariable(input.label || "");
  for (const fieldVar of CAMPINAS_CLIENT_FORM_VARIABLES) {
    const key = normalizeTemplateVariable(fieldVar);
    if (key === variable || key === label) return true;
  }
  return false;
}

function resolveClientDocAckFields(sourceInputs: ZapSignTemplateInput[]): ZapSignTemplateInput[] {
  const configByVar = new Map(
    CAMPINAS_CLIENT_DOC_ACK_FIELDS.map((field) => [normalizeTemplateVariable(field.variable), field]),
  );
  const resolved: ZapSignTemplateInput[] = [];
  const seen = new Set<string>();

  for (const input of sourceInputs.filter(isDocAckRadioInput)) {
    const key = normalizeTemplateVariable(input.variable || input.label || "");
    const config = configByVar.get(key);
    if (!config || seen.has(key)) continue;
    resolved.push({
      variable: config.variable,
      input_type: "radio",
      label: config.label,
      help_text: config.help_text,
      options: config.options,
      required: config.required,
      order: config.order,
    });
    seen.add(key);
  }

  for (const field of CAMPINAS_CLIENT_DOC_ACK_FIELDS) {
    const key = normalizeTemplateVariable(field.variable);
    if (seen.has(key)) continue;
    resolved.push({ ...field });
    seen.add(key);
  }

  return resolved;
}

/** Campos visíveis no formulário (somente CNPJ loja + radios/RG cliente). */
export function buildTemplateFormUpdatePayload(detail: ZapSignTemplateDetail) {
  return buildTemplateFormInputs(detail).filter(shouldExposeInSignerForm);
}

/** Modelo-fonte com anexos da loja embutidos (Foto filhote, Atestado, etc.). */
export function templateHasLegacyStoreUploadFields(detail: ZapSignTemplateDetail): boolean {
  return (detail.inputs || []).some(isStoreUploadInput);
}

function isLegacyClientField(input: ZapSignTemplateInput): boolean {
  const variable = String(input.variable || "").trim().toLowerCase();
  const label = String(input.label || "").trim().toLowerCase();
  return (
    variable.includes("contratante-cpf") ||
    variable.includes("celular") ||
    variable.includes("e-mail") ||
    label.includes("contratante cpf") ||
    label === "celular" ||
    label === "e-mail"
  );
}

function isClientUploadInput(input: ZapSignTemplateInput): boolean {
  if (String(input.input_type || "").trim().toLowerCase() !== "upload") return false;
  const label = String(input.label || "").trim().toLowerCase();
  return CAMPINAS_CLIENT_FORM_LABELS.has(label);
}

/** Copia formulário curado (CNPJ loja + radios/RG cliente) com order por signatário. */
export function pickFormInputsFromSource(detail: ZapSignTemplateDetail) {
  return buildTemplateFormInputs(detail);
}

const FORM_INTRO =
  "Loja: informe o CNPJ da loja para continuar. Cliente: confirme o que recebeu e anexe fotos do RG (frente e verso).";

export async function syncFormFromSourceTemplate(
  sourceTemplateId: string,
  cleanTemplateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  const cleanDetail = await zapsignRequest<ZapSignTemplateDetail>(`/templates/${cleanTemplateId}/`);
  const inputs = buildTemplateFormUpdatePayload(cleanDetail);

  await zapsignRequest("/templates/update-form/", {
    method: "POST",
    json: {
      template_id: cleanTemplateId,
      custom_intro: FORM_INTRO,
      youtube_video_code: "",
      hide_prefilled_fields: true,
      inputs,
    },
  }).catch((error) => {
    if (isZapSignNoChangeError(error)) {
      console.warn("[zapsign] Formulário do template limpo já configurado; ignorando update-form.");
      return;
    }
    throw error;
  });
}

function isStoreUploadInput(input: ZapSignTemplateInput): boolean {
  if (isDocAckRadioInput(input) || isClientUploadInput(input)) return false;
  const label = String(input.label || "").trim().toLowerCase();
  if (CAMPINAS_STORE_FORM_LABELS.has(label)) return true;
  if (
    label.includes("vacina") ||
    label.includes("atestado") ||
    label.includes("filhote") ||
    label.includes("comprovante") ||
    (label.includes("carteirinha") && String(input.input_type || "").toLowerCase() === "upload")
  ) {
    return true;
  }
  return String(input.input_type || "").trim().toLowerCase() === "upload";
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
  const storeSigner = findStoreSigner(source.signers || []);
  const clientSigner = findClientSigner(source.signers || []);
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

/** Formulário: loja = só CNPJ (anexos pelo painel). Cliente = radios + RG. */
export async function applyCampinasClientForm(
  templateId: string,
  zapsignRequest: ZapSignRequest,
): Promise<void> {
  if (!templateId) return;

  const detail = await zapsignRequest<ZapSignTemplateDetail>(`/templates/${templateId}/`);
  const inputs = buildTemplateFormUpdatePayload(detail);

  await zapsignRequest("/templates/update-form/", {
    method: "POST",
    json: {
      template_id: templateId,
      custom_intro: FORM_INTRO,
      youtube_video_code: "",
      hide_prefilled_fields: true,
      inputs,
    },
  }).catch((error) => {
    if (isZapSignNoChangeError(error)) {
      console.warn("[zapsign] Formulário do template já configurado; ignorando update-form.");
      return;
    }
    throw error;
  });
}
