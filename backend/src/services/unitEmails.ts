import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getUnitByKey, normalizeEmail, SheetRow, UnitKey } from "../config.js";
import { isDatabaseEnabled } from "../db/client.js";
import {
  dbCountUnitEmails,
  dbDeleteUnitEmail,
  dbInsertUnitEmail,
  dbListUnitEmails,
} from "../db/unitEmailsStore.js";
import { formatDateTimeBr } from "../utils/formatters.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "unit-emails.json");

export interface UnitEmailRecord {
  id: number;
  unitKey: UnitKey;
  email: string;
  createdAt: string;
}

interface FileStore {
  nextId: number;
  items: UnitEmailRecord[];
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function readFileStore(): Promise<FileStore> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as FileStore;
  } catch {
    const empty: FileStore = { nextId: 1, items: [] };
    await fs.writeFile(DATA_FILE, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function writeFileStore(store: FileStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function ensureDefaultEmails(unitKey: UnitKey): Promise<void> {
  const count = isDatabaseEnabled()
    ? await dbCountUnitEmails(unitKey)
    : (await readFileStore()).items.filter((item) => item.unitKey === unitKey).length;

  if (count > 0) return;

  const defaultEmail = getUnitByKey(unitKey)?.storeEmail?.trim();
  if (!defaultEmail) return;

  await addUnitEmail(unitKey, defaultEmail);
}

export async function listUnitEmails(unitKey: UnitKey): Promise<UnitEmailRecord[]> {
  await ensureDefaultEmails(unitKey);

  if (isDatabaseEnabled()) {
    const rows = await dbListUnitEmails(unitKey);
    return rows.map((row) => ({
      id: row.id,
      unitKey: row.unit_key,
      email: row.email,
      createdAt: row.created_at,
    }));
  }

  const store = await readFileStore();
  return store.items
    .filter((item) => item.unitKey === unitKey)
    .sort((a, b) => a.id - b.id);
}

export async function addUnitEmail(unitKey: UnitKey, rawEmail: string): Promise<UnitEmailRecord> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    throw new Error("Informe um e-mail válido.");
  }

  const createdAt = formatDateTimeBr(new Date());

  if (isDatabaseEnabled()) {
    const row = await dbInsertUnitEmail(unitKey, email, createdAt);
    return {
      id: row.id,
      unitKey: row.unit_key,
      email: row.email,
      createdAt: row.created_at,
    };
  }

  const store = await readFileStore();
  const duplicate = store.items.find((item) => item.unitKey === unitKey && item.email === email);
  if (duplicate) {
    throw new Error("Este e-mail já está cadastrado para esta unidade.");
  }

  const record: UnitEmailRecord = {
    id: store.nextId++,
    unitKey,
    email,
    createdAt,
  };
  store.items.push(record);
  await writeFileStore(store);
  return record;
}

export async function removeUnitEmail(unitKey: UnitKey, id: number): Promise<void> {
  const items = await listUnitEmails(unitKey);
  if (items.length <= 1) {
    throw new Error("Mantenha ao menos um e-mail cadastrado para esta unidade.");
  }

  if (isDatabaseEnabled()) {
    const deleted = await dbDeleteUnitEmail(id, unitKey);
    if (!deleted) throw new Error("E-mail não encontrado.");
    return;
  }

  const store = await readFileStore();
  const index = store.items.findIndex((item) => item.id === id && item.unitKey === unitKey);
  if (index < 0) throw new Error("E-mail não encontrado.");
  store.items.splice(index, 1);
  await writeFileStore(store);
}

/** E-mails da loja para notificações (anexos, etc.). */
export async function getUnitStoreEmailsForNotifications(
  unitKey: UnitKey,
  contrato?: SheetRow,
): Promise<string[]> {
  const fromSheet = contrato ? String(contrato["E-mail Loja"] || "").trim() : "";
  if (fromSheet) return [fromSheet];

  const items = await listUnitEmails(unitKey);
  if (items.length) return items.map((item) => item.email);

  const fallback = getUnitByKey(unitKey)?.storeEmail?.trim();
  return fallback ? [fallback] : [];
}

export function getPrimaryUnitStoreEmail(unitKey: UnitKey): string {
  return getUnitByKey(unitKey)?.storeEmail?.trim() || "";
}
