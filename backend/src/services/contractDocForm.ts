import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getUnitByKey, SheetRow, UnitKey } from "../config.js";
import { getUnitStoreEmailsForNotifications } from "./unitEmails.js";
import {
  dbGetDocFormEmailSentAt,
  dbLoadDocFormEmailMap,
  dbListAllDocFormLocations,
  dbRelocateDocForm,
  dbSetDocFormEmailSentAt,
} from "../db/docFormStore.js";
import { dbListAllAttachmentLocations, dbRelocateAttachments } from "../db/attachmentsStore.js";
import { dbListSignatureIdentities } from "../db/signaturesStore.js";
import { isTodaysTestContractRow, norm } from "../utils/formatters.js";
import { isDatabaseEnabled, tryReconnectDatabase } from "../db/client.js";
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
): DocFormStatus {
  const anexos = {} as Record<DocFormKind, DocFormKindStatus>;
  const pendentes: DocFormKind[] = [];

  for (const kind of DOC_FORM_KINDS) {
    const enviado = Boolean(buffers[kind]?.length);
    anexos[kind] = { enviado };
    if (!enviado) pendentes.push(kind);
  }

  const enviados = DOC_FORM_KINDS.length - pendentes.length;
  const completo = pendentes.length === 0;
  const emailEnviado = completo && Boolean(emailSentAt);

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

type ResolvedLoc = { unitKey: UnitKey; sheetIndex: number };

function storedLocKey(loc: ResolvedLoc): string {
  return `${loc.unitKey}:${loc.sheetIndex}`;
}

async function moveDocFormData(from: ResolvedLoc, to: ResolvedLoc): Promise<ResolvedLoc> {
  if (from.unitKey === to.unitKey && from.sheetIndex === to.sheetIndex) return to;
  const movedAttach = await dbRelocateAttachments(from.unitKey, from.sheetIndex, to.unitKey, to.sheetIndex).catch(
    () => false,
  );
  const movedForm = await dbRelocateDocForm(from.unitKey, from.sheetIndex, to.unitKey, to.sheetIndex).catch(
    () => false,
  );
  return movedAttach || movedForm ? to : from;
}

async function resolveDocFormIndexMap(
  items: Array<{ unitKey: UnitKey; sheetIndex: number; contrato?: SheetRow }>,
): Promise<Map<string, ResolvedLoc>> {
  const resolved = new Map<string, ResolvedLoc>();
  for (const item of items) {
    resolved.set(recordKey(item.unitKey, item.sheetIndex), { unitKey: item.unitKey, sheetIndex: item.sheetIndex });
  }
  if (!isDatabaseEnabled() || !items.length) return resolved;

  const signatures = await dbListSignatureIdentities();
  const storedLocs = [
    ...(await dbListAllAttachmentLocations()),
    ...(await dbListAllDocFormLocations()),
  ];
  const storedByKey = new Map<string, ResolvedLoc>();
  for (const loc of storedLocs) storedByKey.set(storedLocKey(loc), loc);

  const claimedStored = new Set<string>();
  const claimedLive = new Set<string>();

  const liveByUnit = new Map<UnitKey, typeof items>();
  for (const item of items) {
    const list = liveByUnit.get(item.unitKey) || [];
    list.push(item);
    liveByUnit.set(item.unitKey, list);
  }

  for (const item of items) {
    const liveKey = recordKey(item.unitKey, item.sheetIndex);
    const nome = norm(item.contrato?.Nome || "");
    const email = norm(item.contrato?.["E-mail"] || item.contrato?.Email || "");
    if (!nome && !email) continue;

    const match = signatures.find((sig) => {
      const sigKey = `${sig.unitKey}:${sig.sheetIndex}`;
      if (claimedStored.has(sigKey)) return false;
      if (!storedByKey.has(sigKey)) return false;
      const sameUnit = sig.unitKey === item.unitKey;
      const nomeOk = Boolean(nome) && norm(sig.nome) === nome;
      const emailOk = Boolean(email) && norm(sig.email) === email;
      return (nomeOk || emailOk) && (sameUnit || nomeOk);
    });
    if (!match) continue;

    const from = { unitKey: match.unitKey, sheetIndex: match.sheetIndex };
    const to = { unitKey: item.unitKey, sheetIndex: item.sheetIndex };
    resolved.set(liveKey, await moveDocFormData(from, to));
    claimedStored.add(storedLocKey(from));
    claimedLive.add(liveKey);
  }

  for (const [unitKey, unitItems] of liveByUnit.entries()) {
    const leftoverLive = unitItems
      .filter((item) => !claimedLive.has(recordKey(item.unitKey, item.sheetIndex)))
      .filter((item) => !isTodaysTestContractRow(item.contrato || {}))
      .sort((a, b) => a.sheetIndex - b.sheetIndex);

    const leftoverStored = [...storedByKey.values()]
      .filter((loc) => loc.unitKey === unitKey && !claimedStored.has(storedLocKey(loc)))
      .sort((a, b) => a.sheetIndex - b.sheetIndex);

    const limit = Math.min(leftoverLive.length, leftoverStored.length);
    for (let i = 0; i < limit; i++) {
      const live = leftoverLive[i];
      const from = leftoverStored[i];
      const liveKey = recordKey(live.unitKey, live.sheetIndex);
      const to = { unitKey: live.unitKey, sheetIndex: live.sheetIndex };
      resolved.set(liveKey, await moveDocFormData(from, to));
      claimedStored.add(storedLocKey(from));
      claimedLive.add(liveKey);
    }
  }

  return resolved;
}

export async function getDocFormStatus(
  unitKey: UnitKey,
  sheetIndex: number,
  contrato?: SheetRow,
): Promise<DocFormStatus> {
  const buffers = await getContractAttachmentBuffers(unitKey, sheetIndex);
  const emailSentAt = await getEmailSentAt(unitKey, sheetIndex);
  const zapsign = contrato
    ? await getZapsignAttachmentSyncStatus(unitKey, sheetIndex, contrato)
    : undefined;
  return buildStatusFromBuffers(
    buffers as Partial<Record<DocFormKind, Buffer>>,
    emailSentAt,
    zapsign,
  );
}

export async function loadDocFormStatusMap(
  items: Array<{ unitKey: UnitKey; sheetIndex: number; contrato?: SheetRow }>,
): Promise<Map<string, DocFormStatus>> {
  const map = new Map<string, DocFormStatus>();
  if (!items.length) return map;

  if (!isDatabaseEnabled()) {
    await tryReconnectDatabase();
  }

  const indexMap = await resolveDocFormIndexMap(items);

  const lookupItems = items.map((item) => {
    const loc = indexMap.get(recordKey(item.unitKey, item.sheetIndex)) || {
      unitKey: item.unitKey,
      sheetIndex: item.sheetIndex,
    };
    return loc;
  });

  const emailMap = isDatabaseEnabled()
    ? await dbLoadDocFormEmailMap(lookupItems)
    : await (async () => {
        const store = await readFileMetaStore();
        const out = new Map<string, string>();
        for (const loc of lookupItems) {
          const key = recordKey(loc.unitKey, loc.sheetIndex);
          const sent = store[key]?.emailSentAt;
          if (sent) out.set(key, sent);
        }
        return out;
      })();

  await Promise.all(
    items.map(async (item) => {
      const key = recordKey(item.unitKey, item.sheetIndex);
      const loc = indexMap.get(key) || { unitKey: item.unitKey, sheetIndex: item.sheetIndex };
      const resolvedKey = recordKey(loc.unitKey, loc.sheetIndex);
      const buffers = await getContractAttachmentBuffers(loc.unitKey, loc.sheetIndex);
      const emailSentAt = emailMap.get(resolvedKey) ?? emailMap.get(key) ?? null;
      const zapsign = item.contrato
        ? await getZapsignAttachmentSyncStatus(loc.unitKey, loc.sheetIndex, item.contrato)
        : undefined;
      map.set(
        key,
        buildStatusFromBuffers(
          buffers as Partial<Record<DocFormKind, Buffer>>,
          emailSentAt,
          zapsign,
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
