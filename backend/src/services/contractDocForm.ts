import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getUnitByKey, SheetRow, UnitKey } from "../config.js";
import { getUnitStoreEmailsForNotifications } from "./unitEmails.js";
import {
  dbGetDocFormEmailSentAt,
  dbLoadDocFormEmailMap,
  dbListDocFormSheetIndices,
  dbRelocateDocForm,
  dbSetDocFormEmailSentAt,
} from "../db/docFormStore.js";
import { dbListAttachmentSheetIndices, dbRelocateAttachments } from "../db/attachmentsStore.js";
import { fetchZapSignSignatureSnapshot } from "./zapsignSignatureSync.js";
import { isDatabaseEnabled } from "../db/client.js";
import { sendDocFormAttachmentsEmail, sendDocFormRectificationEmail } from "./email.js";
import {
  DOC_FORM_KINDS,
  DOC_FORM_LABELS,
  DocFormKind,
  docFormAttachmentFilename,
  getContractAttachmentBuffers,
  saveContractAttachments,
} from "./contractAttachments.js";
import {
  getZapsignAttachmentSyncStatus,
  syncDocFormAttachmentsToZapSign,
  ZapsignAttachmentSyncStatus,
} from "./zapsignAttachmentSync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const DOC_FORM_META_FILE = path.join(DATA_DIR, "doc-form-meta.json");

type DocFormMetaStore = Record<string, { emailSentAt?: string }>;

export interface DocFormKindStatus {
  enviado: boolean;
}

export interface DocFormStatus {
  anexos: Record<DocFormKind, DocFormKindStatus>;
  completo: boolean;
  pendentes: DocFormKind[];
  total: number;
  enviados: number;
  emailEnviado: boolean;
  emailEnviadoEm?: string;
  statusLabel: string;
  zapsign?: ZapsignAttachmentSyncStatus;
}

function recordKey(unitKey: UnitKey, sheetIndex: number): string {
  return `${unitKey}:${sheetIndex}`;
}

async function readFileMetaStore(): Promise<DocFormMetaStore> {
  try {
    const raw = await fs.readFile(DOC_FORM_META_FILE, "utf8");
    return JSON.parse(raw) as DocFormMetaStore;
  } catch {
    return {};
  }
}

async function writeFileMetaStore(store: DocFormMetaStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DOC_FORM_META_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function getEmailSentAt(unitKey: UnitKey, sheetIndex: number): Promise<string | null> {
  if (isDatabaseEnabled()) {
    return dbGetDocFormEmailSentAt(unitKey, sheetIndex);
  }
  const store = await readFileMetaStore();
  return store[recordKey(unitKey, sheetIndex)]?.emailSentAt ?? null;
}

async function setEmailSentAt(unitKey: UnitKey, sheetIndex: number): Promise<string> {
  if (isDatabaseEnabled()) {
    return dbSetDocFormEmailSentAt(unitKey, sheetIndex);
  }
  const store = await readFileMetaStore();
  const key = recordKey(unitKey, sheetIndex);
  const sentAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  store[key] = { ...(store[key] || {}), emailSentAt: sentAt };
  await writeFileMetaStore(store);
  return sentAt;
}

export function resolveClientEmail(contrato: SheetRow): string {
  return String(contrato["E-mail"] || contrato["Email"] || "").trim();
}

function buildStatusFromBuffers(
  buffers: Partial<Record<DocFormKind, Buffer>>,
  emailSentAt: string | null,
  zapsign?: ZapsignAttachmentSyncStatus,
  extraDocs = 0,
): DocFormStatus {
  const anexos = {} as Record<DocFormKind, DocFormKindStatus>;
  const pendentes: DocFormKind[] = [];

  const extrasCompletos = extraDocs >= DOC_FORM_KINDS.length;
  const emailEnviado = Boolean(emailSentAt) || extrasCompletos;

  for (const kind of DOC_FORM_KINDS) {
    const enviado = Boolean(buffers[kind]?.length) || extrasCompletos || emailEnviado;
    anexos[kind] = { enviado };
    if (!enviado) pendentes.push(kind);
  }

  const enviados = extrasCompletos || emailEnviado
    ? DOC_FORM_KINDS.length
    : Math.max(DOC_FORM_KINDS.length - pendentes.length, extraDocs);
  const completo = pendentes.length === 0 || extrasCompletos || emailEnviado;

  let statusLabel = "Pendente";
  if (completo && emailEnviado) statusLabel = "Anexos enviados";
  else if (completo) statusLabel = "Completo — aguardando e-mail";
  else if (enviados > 0) statusLabel = `Pendente (${enviados}/${DOC_FORM_KINDS.length})`;

  return {
    anexos,
    completo,
    pendentes: completo ? [] : pendentes,
    total: DOC_FORM_KINDS.length,
    enviados: completo ? DOC_FORM_KINDS.length : enviados,
    emailEnviado,
    emailEnviadoEm: emailSentAt || undefined,
    statusLabel,
    zapsign,
  };
}

function mapStoredIndicesToLive(liveIndices: number[], storedIndices: number[]): Map<number, number> {
  const mapping = new Map<number, number>();
  const usedStored = new Set<number>();
  const liveSet = new Set(liveIndices);

  for (const live of liveIndices) {
    if (storedIndices.includes(live)) {
      mapping.set(live, live);
      usedStored.add(live);
    }
  }

  const leftoverStored = storedIndices.filter((index) => !usedStored.has(index) && !liveSet.has(index));
  const leftoverLive = liveIndices.filter((index) => !mapping.has(index));

  leftoverStored.sort((a, b) => a - b);
  leftoverLive.sort((a, b) => a - b);

  const limit = Math.min(leftoverStored.length, leftoverLive.length);
  for (let i = 0; i < limit; i++) {
    if (Math.abs(leftoverStored[i] - leftoverLive[i]) <= 25) {
      mapping.set(leftoverLive[i], leftoverStored[i]);
    }
  }

  return mapping;
}

async function resolveDocFormIndexMap(
  items: Array<{ unitKey: UnitKey; sheetIndex: number }>,
): Promise<Map<string, number>> {
  const resolved = new Map<string, number>();
  if (!isDatabaseEnabled() || !items.length) {
    for (const item of items) {
      resolved.set(recordKey(item.unitKey, item.sheetIndex), item.sheetIndex);
    }
    return resolved;
  }

  const byUnit = new Map<UnitKey, number[]>();
  for (const item of items) {
    const list = byUnit.get(item.unitKey) || [];
    list.push(item.sheetIndex);
    byUnit.set(item.unitKey, list);
  }

  for (const [unitKey, liveIndices] of byUnit.entries()) {
    const uniqueLive = [...new Set(liveIndices)].sort((a, b) => a - b);
    const storedAttachments = await dbListAttachmentSheetIndices(unitKey);
    const storedDocForm = await dbListDocFormSheetIndices(unitKey);
    const stored = [...new Set([...storedAttachments, ...storedDocForm])].sort((a, b) => a - b);
    const mapping = mapStoredIndicesToLive(uniqueLive, stored);

    for (const live of uniqueLive) {
      const storedIndex = mapping.get(live) ?? live;
      if (storedIndex !== live) {
        const movedAttach = await dbRelocateAttachments(unitKey, storedIndex, live).catch(() => false);
        const movedForm = await dbRelocateDocForm(unitKey, storedIndex, live).catch(() => false);
        resolved.set(recordKey(unitKey, live), movedAttach || movedForm ? live : storedIndex);
      } else {
        resolved.set(recordKey(unitKey, live), live);
      }
    }
  }

  return resolved;
}

async function extraDocsForContrato(contrato?: SheetRow): Promise<number> {
  const docToken = String(contrato?.["Documento ZapSign"] || "").trim();
  if (!docToken) return 0;
  const snapshot = await fetchZapSignSignatureSnapshot(docToken);
  return snapshot?.extraDocs || 0;
}

export async function getDocFormStatus(
  unitKey: UnitKey,
  sheetIndex: number,
  contrato?: SheetRow,
): Promise<DocFormStatus> {
  const buffers = await getContractAttachmentBuffers(unitKey, sheetIndex);
  const emailSentAt = await getEmailSentAt(unitKey, sheetIndex);
  const extraDocs = await extraDocsForContrato(contrato);
  const zapsign = contrato
    ? await getZapsignAttachmentSyncStatus(unitKey, sheetIndex, contrato)
    : undefined;
  return buildStatusFromBuffers(
    buffers as Partial<Record<DocFormKind, Buffer>>,
    emailSentAt,
    zapsign,
    extraDocs,
  );
}

export async function loadDocFormStatusMap(
  items: Array<{ unitKey: UnitKey; sheetIndex: number; contrato?: SheetRow }>,
): Promise<Map<string, DocFormStatus>> {
  const map = new Map<string, DocFormStatus>();
  if (!items.length) return map;

  const indexMap = await resolveDocFormIndexMap(items);

  const lookupItems = items.map((item) => ({
    unitKey: item.unitKey,
    sheetIndex: indexMap.get(recordKey(item.unitKey, item.sheetIndex)) ?? item.sheetIndex,
  }));

  const emailMap = isDatabaseEnabled()
    ? await dbLoadDocFormEmailMap(lookupItems)
    : await (async () => {
        const store = await readFileMetaStore();
        const out = new Map<string, string>();
        for (const item of lookupItems) {
          const key = recordKey(item.unitKey, item.sheetIndex);
          const sent = store[key]?.emailSentAt;
          if (sent) out.set(key, sent);
        }
        return out;
      })();

  await Promise.all(
    items.map(async (item) => {
      const key = recordKey(item.unitKey, item.sheetIndex);
      const resolvedIndex = indexMap.get(key) ?? item.sheetIndex;
      const resolvedKey = recordKey(item.unitKey, resolvedIndex);
      const buffers = await getContractAttachmentBuffers(item.unitKey, resolvedIndex);
      const emailSentAt = emailMap.get(resolvedKey) ?? emailMap.get(key) ?? null;
      const extraDocs = await extraDocsForContrato(item.contrato);
      const zapsign = item.contrato
        ? await getZapsignAttachmentSyncStatus(item.unitKey, resolvedIndex, item.contrato)
        : undefined;
      map.set(
        key,
        buildStatusFromBuffers(
          buffers as Partial<Record<DocFormKind, Buffer>>,
          emailSentAt,
          zapsign,
          extraDocs,
        ),
      );
    }),
  );

  return map;
}

async function trySendDocFormEmails(
  unitKey: UnitKey,
  sheetIndex: number,
  contrato: SheetRow,
): Promise<{ sent: boolean; sentAt?: string; error?: string }> {
  const status = await getDocFormStatus(unitKey, sheetIndex);
  if (!status.completo || status.emailEnviado) {
    return { sent: false };
  }

  const storeEmails = await getUnitStoreEmailsForNotifications(unitKey, contrato);
  const clientEmail = resolveClientEmail(contrato);
  if (!storeEmails.length) {
    return { sent: false, error: "Nenhum e-mail da loja configurado. Acesse Configurações no menu." };
  }
  if (!clientEmail) {
    return { sent: false, error: "E-mail do cliente não informado no contrato." };
  }

  const buffers = await getContractAttachmentBuffers(unitKey, sheetIndex);
  const attachments = DOC_FORM_KINDS.filter((kind) => buffers[kind]).map((kind) => ({
    filename: docFormAttachmentFilename(DOC_FORM_LABELS[kind]),
    label: DOC_FORM_LABELS[kind],
    content: buffers[kind]!,
  }));

  const unitLabel = getUnitByKey(unitKey)?.label || unitKey;
  const clienteNome = String(contrato["Nome"] || "Cliente").trim();

  await sendDocFormAttachmentsEmail({
    storeEmails,
    clientEmail,
    clienteNome,
    unitLabel,
    attachments,
  });

  const sentAt = await setEmailSentAt(unitKey, sheetIndex);
  return { sent: true, sentAt };
}

export async function saveDocFormAttachments(
  unitKey: UnitKey,
  sheetIndex: number,
  contrato: SheetRow,
  anexos: Partial<Record<DocFormKind, string>>,
): Promise<{ status: DocFormStatus; emailSent: boolean; emailError?: string; zapsignSync?: ZapsignAttachmentSyncStatus }> {
  const entries = Object.entries(anexos).filter(
    ([kind, value]) =>
      DOC_FORM_KINDS.includes(kind as DocFormKind) && String(value || "").startsWith("data:image/"),
  ) as Array<[DocFormKind, string]>;

  if (!entries.length) {
    throw new Error("Nenhuma imagem válida enviada.");
  }

  const existingBuffers = await getContractAttachmentBuffers(unitKey, sheetIndex);
  const replacedKinds = entries
    .filter(([kind]) => Boolean(existingBuffers[kind as DocFormKind]?.length))
    .map(([kind]) => kind as DocFormKind);

  await saveContractAttachments(unitKey, sheetIndex, Object.fromEntries(entries));

  if (replacedKinds.length) {
    const clientEmail = resolveClientEmail(contrato);
    if (clientEmail) {
      try {
        const unitLabel = getUnitByKey(unitKey)?.label || unitKey;
        const clienteNome = String(contrato["Nome"] || "Cliente").trim();
        await sendDocFormRectificationEmail({
          clientEmail,
          clienteNome,
          unitLabel,
          documentLabels: replacedKinds.map((kind) => DOC_FORM_LABELS[kind]),
        });
      } catch (e) {
        console.warn("[doc-form] e-mail de retificação:", e instanceof Error ? e.message : e);
      }
    }
  }

  let zapsignSync: ZapsignAttachmentSyncStatus | undefined;
  try {
    zapsignSync = await syncDocFormAttachmentsToZapSign(unitKey, sheetIndex, contrato);
  } catch (e) {
    zapsignSync = {
      disponivel: true,
      sincronizados: 0,
      total: DOC_FORM_KINDS.length,
      completo: false,
      erro: e instanceof Error ? e.message : String(e),
    };
  }

  let emailSent = false;
  let emailError: string | undefined;
  try {
    const result = await trySendDocFormEmails(unitKey, sheetIndex, contrato);
    emailSent = result.sent;
    emailError = result.error;
  } catch (e) {
    emailError = e instanceof Error ? e.message : String(e);
  }

  const status = await getDocFormStatus(unitKey, sheetIndex, contrato);
  return { status, emailSent, emailError, zapsignSync };
}
