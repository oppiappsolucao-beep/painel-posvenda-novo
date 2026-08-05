import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getUnitByKey, UnitKey } from "../config.js";
import { isDatabaseEnabled } from "../db/client.js";
import {
  dbFindEmployeeByNameUnit,
  dbInsertEmployee,
  dbListEmployees,
  dbSetEmployeeActive,
} from "../db/employeesStore.js";
import { formatDateTimeBr } from "../utils/formatters.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "employees.json");

export interface EmployeeRecord {
  id: number;
  name: string;
  unitKey: UnitKey;
  unitLabel: string;
  active: boolean;
  createdAt: string;
}

interface FileStore {
  nextId: number;
  items: EmployeeRecord[];
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

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function listEmployees(opts?: {
  unitKey?: UnitKey;
  activeOnly?: boolean;
}): Promise<EmployeeRecord[]> {
  if (isDatabaseEnabled()) {
    return dbListEmployees(opts);
  }

  const store = await readFileStore();
  let items = [...store.items];
  if (opts?.unitKey) items = items.filter((e) => e.unitKey === opts.unitKey);
  if (opts?.activeOnly) items = items.filter((e) => e.active);
  return items.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

export async function createEmployee(name: string, unitKey: UnitKey): Promise<EmployeeRecord> {
  const normalized = normalizeName(name);
  if (!normalized) throw new Error("Informe o nome do funcionário.");
  if (!getUnitByKey(unitKey)) throw new Error("Unidade inválida.");

  const existing = await findEmployeeByNameUnit(normalized, unitKey);
  if (existing) {
    if (!existing.active) {
      return setEmployeeActive(existing.id, true);
    }
    throw new Error("Já existe um funcionário ativo com este nome nesta unidade.");
  }

  const createdAt = formatDateTimeBr(new Date());

  if (isDatabaseEnabled()) {
    return dbInsertEmployee(normalized, unitKey, createdAt);
  }

  const store = await readFileStore();
  const record: EmployeeRecord = {
    id: store.nextId++,
    name: normalized,
    unitKey,
    unitLabel: getUnitByKey(unitKey)!.label,
    active: true,
    createdAt,
  };
  store.items.push(record);
  await writeFileStore(store);
  return record;
}

export async function setEmployeeActive(id: number, active: boolean): Promise<EmployeeRecord> {
  if (isDatabaseEnabled()) {
    const updated = await dbSetEmployeeActive(id, active);
    if (!updated) throw new Error("Funcionário não encontrado.");
    return updated;
  }

  const store = await readFileStore();
  const idx = store.items.findIndex((e) => e.id === id);
  if (idx < 0) throw new Error("Funcionário não encontrado.");
  store.items[idx] = { ...store.items[idx], active };
  await writeFileStore(store);
  return store.items[idx];
}

async function findEmployeeByNameUnit(name: string, unitKey: UnitKey): Promise<EmployeeRecord | null> {
  if (isDatabaseEnabled()) {
    return dbFindEmployeeByNameUnit(name, unitKey);
  }
  const store = await readFileStore();
  const normalized = normalizeName(name).toLowerCase();
  return (
    store.items.find(
      (e) => e.unitKey === unitKey && e.name.trim().toLowerCase() === normalized,
    ) ?? null
  );
}
