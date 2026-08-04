import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { config, SheetRow, UnitKey } from "../config.js";
import { isDatabaseEnabled } from "../db/client.js";
import {
  dbGetSignature,
  dbGetSignatureByToken,
  dbInsertSignature,
  dbLoadSignaturesMap,
  dbUpdateSignature,
} from "../db/signaturesStore.js";
import { formatDateBr, todaySaoPaulo } from "../utils/formatters.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "signatures.json");

export interface SignatureRecord {
  unitKey: UnitKey;
  sheetIndex: number;
  clientToken: string;
  createdAt: string;
  sentAt: string;
  clienteNome: string;
  clienteEmail: string;
  clienteTelefone: string;
  clienteSignedAt?: string;
  clienteSignature?: string;
  lojaSignedAt?: string;
  lojaSignature?: string;
  lojaSignedBy?: string;
}

type SignatureStore = Record<string, SignatureRecord>;

function recordKey(unitKey: UnitKey, sheetIndex: number): string {
  return `${unitKey}:${sheetIndex}`;
}

function formatDateTimeBr(d: Date): string {
  const date = formatDateBr(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${date} ${hh}:${mi}:${ss}`;
}

async function ensureFileStore(): Promise<SignatureStore> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as SignatureStore;
  } catch {
    const empty: SignatureStore = {};
    await fs.writeFile(DATA_FILE, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function writeFileStore(store: SignatureStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

export function clientSignUrl(token: string): string {
  const base = config.frontendUrl.replace(/\/$/, "");
  return `${base}/assinar/${token}`;
}

export async function loadSignaturesMap(): Promise<Map<string, SignatureRecord>> {
  if (isDatabaseEnabled()) return dbLoadSignaturesMap();
  const store = await ensureFileStore();
  return new Map(Object.entries(store));
}

export async function getSignature(unitKey: UnitKey, sheetIndex: number): Promise<SignatureRecord | null> {
  if (isDatabaseEnabled()) return dbGetSignature(unitKey, sheetIndex);
  const store = await ensureFileStore();
  return store[recordKey(unitKey, sheetIndex)] || null;
}

export async function getSignatureByToken(token: string): Promise<SignatureRecord | null> {
  if (isDatabaseEnabled()) return dbGetSignatureByToken(token);
  const store = await ensureFileStore();
  return Object.values(store).find((r) => r.clientToken === token) || null;
}

export function isSignatureComplete(record: SignatureRecord): boolean {
  return Boolean(record.clienteSignedAt && record.lojaSignedAt);
}

export async function createSignatureSession(
  unitKey: UnitKey,
  sheetIndex: number,
  row: SheetRow,
): Promise<SignatureRecord> {
  const existing = await getSignature(unitKey, sheetIndex);
  if (existing) return existing;

  const now = todaySaoPaulo();
  const record: SignatureRecord = {
    unitKey,
    sheetIndex,
    clientToken: crypto.randomBytes(24).toString("hex"),
    createdAt: formatDateTimeBr(now),
    sentAt: formatDateTimeBr(now),
    clienteNome: String(row["Nome"] || "").trim() || "Cliente",
    clienteEmail: String(row["E-mail"] || "").trim(),
    clienteTelefone: String(row["Telefone"] || "").trim(),
  };

  if (isDatabaseEnabled()) {
    await dbInsertSignature(record);
    return record;
  }

  const store = await ensureFileStore();
  store[recordKey(unitKey, sheetIndex)] = record;
  await writeFileStore(store);
  return record;
}

export async function signAsClient(token: string, signatureImage: string): Promise<SignatureRecord> {
  if (!signatureImage?.startsWith("data:image/")) throw new Error("Assinatura inválida.");

  const record = await getSignatureByToken(token);
  if (!record) throw new Error("Link de assinatura inválido ou expirado.");
  if (record.clienteSignedAt) throw new Error("Este contrato já foi assinado pelo cliente.");

  record.clienteSignedAt = formatDateTimeBr(todaySaoPaulo());
  record.clienteSignature = signatureImage;

  if (isDatabaseEnabled()) {
    await dbUpdateSignature(record);
    return record;
  }

  const store = await ensureFileStore();
  store[recordKey(record.unitKey, record.sheetIndex)] = record;
  await writeFileStore(store);
  return record;
}

export async function signAsStore(
  unitKey: UnitKey,
  sheetIndex: number,
  signatureImage: string,
  signedBy: string,
): Promise<SignatureRecord> {
  if (!signatureImage?.startsWith("data:image/")) throw new Error("Assinatura inválida.");

  const record = await getSignature(unitKey, sheetIndex);
  if (!record) throw new Error("Sessão de assinatura não encontrada. Gere o link primeiro.");
  if (!record.clienteSignedAt) throw new Error("Aguardando assinatura do cliente.");
  if (record.lojaSignedAt) throw new Error("A loja já assinou este contrato.");

  record.lojaSignedAt = formatDateTimeBr(todaySaoPaulo());
  record.lojaSignature = signatureImage;
  record.lojaSignedBy = signedBy.trim() || "Loja";

  if (isDatabaseEnabled()) {
    await dbUpdateSignature(record);
    return record;
  }

  const store = await ensureFileStore();
  store[recordKey(unitKey, sheetIndex)] = record;
  await writeFileStore(store);
  return record;
}

export function signatureImages(record: SignatureRecord | null): { cliente?: string; loja?: string } | undefined {
  if (!record) return undefined;
  return {
    cliente: record.clienteSignature,
    loja: record.lojaSignature,
  };
}
