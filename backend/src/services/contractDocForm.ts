import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getUnitByKey, SheetRow, UnitKey } from "../config.js";
import { getUnitStoreEmailsForNotifications } from "./unitEmails.js";
import {
  dbGetDocFormEmailSentAt,
  dbLoadDocFormEmailMap,
  dbSetDocFormEmailSentAt,
} from "../db/docFormStore.js";
import { isDatabaseEnabled } from "../db/client.js";
import { sendDocFormAttachmentsEmail } from "./email.js";
import {
  DOC_FORM_KINDS,
  DOC_FORM_LABELS,
  DocFormKind,
  getContractAttachmentBuffers,
  saveContractAttachments,
} from "./contractAttachments.js";

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
  const emailEnviado = Boolean(emailSentAt);

  let statusLabel = "Pendente";
  if (completo && emailEnviado) statusLabel = "Anexos enviados";
  else if (completo) statusLabel = "Completo — aguardando e-mail";
  else if (enviados > 0) statusLabel = `Pendente (${enviados}/${DOC_FORM_KINDS.length})`;

  return {
    anexos,
    completo,
    pendentes,
    total: DOC_FORM_KINDS.length,
    enviados,
    emailEnviado,
    emailEnviadoEm: emailSentAt || undefined,
    statusLabel,
  };
}

export async function getDocFormStatus(unitKey: UnitKey, sheetIndex: number): Promise<DocFormStatus> {
  const buffers = await getContractAttachmentBuffers(unitKey, sheetIndex);
  const emailSentAt = await getEmailSentAt(unitKey, sheetIndex);
  return buildStatusFromBuffers(buffers as Partial<Record<DocFormKind, Buffer>>, emailSentAt);
}

export async function loadDocFormStatusMap(
  items: Array<{ unitKey: UnitKey; sheetIndex: number }>,
): Promise<Map<string, DocFormStatus>> {
  const map = new Map<string, DocFormStatus>();
  if (!items.length) return map;

  const emailMap = isDatabaseEnabled()
    ? await dbLoadDocFormEmailMap(items)
    : await (async () => {
        const store = await readFileMetaStore();
        const out = new Map<string, string>();
        for (const item of items) {
          const key = recordKey(item.unitKey, item.sheetIndex);
          const sent = store[key]?.emailSentAt;
          if (sent) out.set(key, sent);
        }
        return out;
      })();

  await Promise.all(
    items.map(async (item) => {
      const key = recordKey(item.unitKey, item.sheetIndex);
      const buffers = await getContractAttachmentBuffers(item.unitKey, item.sheetIndex);
      const emailSentAt = emailMap.get(key) ?? null;
      map.set(key, buildStatusFromBuffers(buffers as Partial<Record<DocFormKind, Buffer>>, emailSentAt));
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
    filename: `${DOC_FORM_LABELS[kind].replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")}.jpg`,
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
): Promise<{ status: DocFormStatus; emailSent: boolean; emailError?: string }> {
  const entries = Object.entries(anexos).filter(
    ([kind, value]) =>
      DOC_FORM_KINDS.includes(kind as DocFormKind) && String(value || "").startsWith("data:image/"),
  ) as Array<[DocFormKind, string]>;

  if (!entries.length) {
    throw new Error("Nenhuma imagem válida enviada.");
  }

  await saveContractAttachments(unitKey, sheetIndex, Object.fromEntries(entries));

  let emailSent = false;
  let emailError: string | undefined;
  try {
    const result = await trySendDocFormEmails(unitKey, sheetIndex, contrato);
    emailSent = result.sent;
    emailError = result.error;
  } catch (e) {
    emailError = e instanceof Error ? e.message : String(e);
  }

  const status = await getDocFormStatus(unitKey, sheetIndex);
  return { status, emailSent, emailError };
}
