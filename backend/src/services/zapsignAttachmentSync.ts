import crypto from "crypto";
import { SheetRow, UnitKey } from "../config.js";
import {
  dbGetZapsignSyncMap,
  dbSetZapsignSyncKind,
  ZapsignKindSyncRecord,
} from "../db/docFormStore.js";
import { isDatabaseEnabled } from "../db/client.js";
import {
  DOC_FORM_KINDS,
  DOC_FORM_LABELS,
  DocFormKind,
  getContractAttachmentBuffers,
} from "./contractAttachments.js";
import { imageBufferToPdfBase64 } from "./imageToPdf.js";
import { getZapSignApiBase, getZapSignApiToken, isZapSignEnabled } from "../config/zapsignEnv.js";
import { uploadZapSignExtraDoc } from "./zapsign.js";
import { findClientSigner } from "./zapsignFormConfig.js";
import { formatDateBr, todaySaoPaulo } from "../utils/formatters.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_FORM_META_FILE = path.join(__dirname, "../../data/doc-form-meta.json");

type DocFormMetaStore = Record<
  string,
  {
    emailSentAt?: string;
    zapsignSync?: Partial<Record<DocFormKind, ZapsignKindSyncRecord>>;
  }
>;

export interface ZapsignAttachmentSyncStatus {
  disponivel: boolean;
  sincronizados: number;
  total: number;
  completo: boolean;
  erro?: string;
}

function recordKey(unitKey: UnitKey, sheetIndex: number): string {
  return `${unitKey}:${sheetIndex}`;
}

function bufferHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

interface ZapSignDocSigner {
  token?: string;
  status?: string;
  qualification?: string;
  name?: string;
}

async function fetchDocSigners(docToken: string): Promise<ZapSignDocSigner[]> {
  const apiToken = getZapSignApiToken();
  if (!apiToken) return [];
  const res = await fetch(`${getZapSignApiBase()}/docs/${docToken}/`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { signers?: ZapSignDocSigner[] };
  return data.signers || [];
}

/** Evita upload de anexos enquanto o cliente está preenchendo/assinando (invalida o formulário). */
function clientIsActivelySigning(signers: ZapSignDocSigner[]): boolean {
  const client = findClientSigner(signers);
  if (!client) return false;
  const status = String(client.status || "").trim().toLowerCase();
  return status === "link-opened" || status === "viewed" || status === "signed_part";
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
  await fs.mkdir(path.dirname(DOC_FORM_META_FILE), { recursive: true });
  await fs.writeFile(DOC_FORM_META_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function loadZapsignSyncMap(
  unitKey: UnitKey,
  sheetIndex: number,
): Promise<Partial<Record<DocFormKind, ZapsignKindSyncRecord>>> {
  if (isDatabaseEnabled()) {
    return dbGetZapsignSyncMap(unitKey, sheetIndex);
  }
  const store = await readFileMetaStore();
  return store[recordKey(unitKey, sheetIndex)]?.zapsignSync || {};
}

async function saveZapsignSyncKind(
  unitKey: UnitKey,
  sheetIndex: number,
  kind: DocFormKind,
  record: ZapsignKindSyncRecord,
): Promise<void> {
  if (isDatabaseEnabled()) {
    await dbSetZapsignSyncKind(unitKey, sheetIndex, kind, record);
    return;
  }
  const store = await readFileMetaStore();
  const key = recordKey(unitKey, sheetIndex);
  const entry = store[key] || {};
  entry.zapsignSync = { ...(entry.zapsignSync || {}), [kind]: record };
  store[key] = entry;
  await writeFileMetaStore(store);
}

export function buildZapsignSyncStatus(
  contrato: SheetRow,
  unitKey: UnitKey,
  syncMap: Partial<Record<DocFormKind, ZapsignKindSyncRecord>>,
  buffers: Partial<Record<DocFormKind, Buffer>>,
  lastError?: string,
): ZapsignAttachmentSyncStatus {
  const docToken = String(contrato["Documento ZapSign"] || "").trim();
  const lojaAssinou = Boolean(String(contrato["Data Assinatura Loja"] || "").trim());
  const disponivel =
    isZapSignEnabled(unitKey) && Boolean(docToken) && !lojaAssinou;

  let sincronizados = 0;
  for (const kind of DOC_FORM_KINDS) {
    const buffer = buffers[kind];
    const synced = syncMap[kind];
    if (buffer?.length && synced?.hash === bufferHash(buffer)) {
      sincronizados += 1;
    }
  }

  return {
    disponivel,
    sincronizados,
    total: DOC_FORM_KINDS.length,
    completo: sincronizados === DOC_FORM_KINDS.length,
    erro: lastError,
  };
}

export async function getZapsignAttachmentSyncStatus(
  unitKey: UnitKey,
  sheetIndex: number,
  contrato: SheetRow,
): Promise<ZapsignAttachmentSyncStatus> {
  const buffers = await getContractAttachmentBuffers(unitKey, sheetIndex);
  const syncMap = await loadZapsignSyncMap(unitKey, sheetIndex);
  return buildZapsignSyncStatus(
    contrato,
    unitKey,
    syncMap,
    buffers as Partial<Record<DocFormKind, Buffer>>,
  );
}

export async function syncDocFormAttachmentsToZapSign(
  unitKey: UnitKey,
  sheetIndex: number,
  contrato: SheetRow,
): Promise<ZapsignAttachmentSyncStatus> {
  const docToken = String(contrato["Documento ZapSign"] || "").trim();
  const lojaAssinou = Boolean(String(contrato["Data Assinatura Loja"] || "").trim());

  if (!isZapSignEnabled(unitKey) || !docToken) {
    return buildZapsignSyncStatus(contrato, unitKey, {}, {});
  }

  if (lojaAssinou) {
    const syncMap = await loadZapsignSyncMap(unitKey, sheetIndex);
    const buffers = await getContractAttachmentBuffers(unitKey, sheetIndex);
    return buildZapsignSyncStatus(
      contrato,
      unitKey,
      syncMap,
      buffers as Partial<Record<DocFormKind, Buffer>>,
      "A loja já assinou no ZapSign — anexos não podem mais ser sincronizados.",
    );
  }

  const buffers = await getContractAttachmentBuffers(unitKey, sheetIndex);
  const syncMap = await loadZapsignSyncMap(unitKey, sheetIndex);
  let lastError: string | undefined;

  const signers = await fetchDocSigners(docToken);
  if (clientIsActivelySigning(signers)) {
    return buildZapsignSyncStatus(
      contrato,
      unitKey,
      syncMap,
      buffers as Partial<Record<DocFormKind, Buffer>>,
      "Cliente em assinatura — anexos serão enviados após concluir o formulário.",
    );
  }

  for (const kind of DOC_FORM_KINDS) {
    const buffer = buffers[kind];
    if (!buffer?.length) continue;

    const hash = bufferHash(buffer);
    if (syncMap[kind]?.hash === hash) continue;

    try {
      const base64Pdf = await imageBufferToPdfBase64(buffer, DOC_FORM_LABELS[kind]);
      const clienteNome = String(contrato.Nome || "Cliente").trim();
      const uploaded = await uploadZapSignExtraDoc(
        docToken,
        `${DOC_FORM_LABELS[kind]} — ${clienteNome}`.slice(0, 255),
        base64Pdf,
      );
      await saveZapsignSyncKind(unitKey, sheetIndex, kind, {
        hash,
        extraDocToken: uploaded.token,
        syncedAt: formatDateBr(todaySaoPaulo()),
      });
      syncMap[kind] = { hash, extraDocToken: uploaded.token, syncedAt: formatDateBr(todaySaoPaulo()) };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`[zapsign-sync] ${kind} ${unitKey}:${sheetIndex}:`, lastError);
    }
  }

  return buildZapsignSyncStatus(
    contrato,
    unitKey,
    syncMap,
    buffers as Partial<Record<DocFormKind, Buffer>>,
    lastError,
  );
}
