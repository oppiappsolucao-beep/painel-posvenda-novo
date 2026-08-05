import { unitKeyFromLabel, UnitKey } from "../config.js";
import { isDemoSheetRow, isExampleEmployeeName } from "../config/employees.js";
import { pickFirstExisting } from "../utils/formatters.js";
import { createEmployee, findEmployeeByNameUnit } from "./employees.js";
import { loadAllUnitRows } from "./sheets.js";

export interface SyncEmployeesResult {
  created: number;
  reactivated: number;
  skipped: number;
}

let lastSyncAt = 0;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

function resolveRowUnitKey(row: Record<string, string>, sheetUnitKey: UnitKey): UnitKey {
  const cols = Object.keys(row);
  const unidadeCol = pickFirstExisting(cols, ["Unidade", "Cidade", "Cidade do comprador"]);
  if (unidadeCol) {
    const fromRow = unitKeyFromLabel(String(row[unidadeCol] || ""));
    if (fromRow) return fromRow;
  }
  return sheetUnitKey;
}

function normalizeSellerName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function syncEmployeesFromSheets(): Promise<SyncEmployeesResult> {
  const result: SyncEmployeesResult = { created: 0, reactivated: 0, skipped: 0 };

  let loaded;
  try {
    loaded = await loadAllUnitRows();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[employees] sync planilha ignorado: ${msg}`);
    return result;
  }

  const seen = new Set<string>();

  for (const item of loaded) {
    if (isDemoSheetRow(item.data)) continue;

    const cols = Object.keys(item.data);
    const vendedorCol = pickFirstExisting(cols, ["Vendedora", "Vendedor", "Atendente"]);
    if (!vendedorCol) continue;

    const rawName = String(item.data[vendedorCol] || "").trim();
    if (!rawName || isExampleEmployeeName(rawName)) {
      result.skipped += 1;
      continue;
    }

    const name = normalizeSellerName(rawName);
    const unitKey = resolveRowUnitKey(item.data, item.unitKey);
    const dedupeKey = `${unitKey}:${name.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    try {
      const existing = await findEmployeeByNameUnit(name, unitKey);
      if (existing?.active) {
        result.skipped += 1;
        continue;
      }

      await createEmployee(name, unitKey);
      if (existing) result.reactivated += 1;
      else result.created += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Já existe")) {
        result.skipped += 1;
      } else {
        console.warn(`[employees] sync ${name} (${unitKey}): ${msg}`);
      }
    }
  }

  return result;
}

export async function maybeSyncEmployeesFromSheets(force = false): Promise<SyncEmployeesResult | null> {
  const now = Date.now();
  if (!force && now - lastSyncAt < SYNC_INTERVAL_MS) return null;

  lastSyncAt = now;
  const result = await syncEmployeesFromSheets();
  if (result.created || result.reactivated) {
    console.log(
      `[employees] sync planilha: +${result.created} novo(s), ${result.reactivated} reativado(s).`,
    );
  }
  return result;
}
