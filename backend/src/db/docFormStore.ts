import { UnitKey } from "../config.js";
import { formatDateBr, todaySaoPaulo } from "../utils/formatters.js";
import { query } from "./client.js";
import type { DocFormKind } from "../services/contractAttachments.js";

export interface ZapsignKindSyncRecord {
  hash: string;
  extraDocToken: string;
  syncedAt: string;
}

export async function dbGetDocFormEmailSentAt(
  unitKey: UnitKey,
  sheetIndex: number,
): Promise<string | null> {
  const { rows } = await query<{ email_sent_at: string | null }>(
    "SELECT email_sent_at FROM contract_doc_form WHERE unit_key = $1 AND sheet_index = $2",
    [unitKey, sheetIndex],
  );
  return rows[0]?.email_sent_at ?? null;
}

export async function dbSetDocFormEmailSentAt(unitKey: UnitKey, sheetIndex: number): Promise<string> {
  const sentAt = formatDateBr(todaySaoPaulo());
  await query(
    `INSERT INTO contract_doc_form (unit_key, sheet_index, email_sent_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (unit_key, sheet_index) DO UPDATE SET email_sent_at = EXCLUDED.email_sent_at`,
    [unitKey, sheetIndex, sentAt],
  );
  return sentAt;
}

export async function dbLoadDocFormEmailMap(
  keys: Array<{ unitKey: UnitKey; sheetIndex: number }>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!keys.length) return map;

  const placeholders = keys.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
  const params = keys.flatMap((k) => [k.unitKey, k.sheetIndex]);
  const { rows } = await query<{ unit_key: UnitKey; sheet_index: number; email_sent_at: string | null }>(
    `SELECT unit_key, sheet_index, email_sent_at FROM contract_doc_form
     WHERE (unit_key, sheet_index) IN (${placeholders}) AND email_sent_at IS NOT NULL`,
    params,
  );

  for (const row of rows) {
    if (row.email_sent_at) {
      map.set(`${row.unit_key}:${row.sheet_index}`, row.email_sent_at);
    }
  }
  return map;
}

export async function dbListDocFormSheetIndices(unitKey: UnitKey): Promise<number[]> {
  const { rows } = await query<{ sheet_index: number }>(
    `SELECT sheet_index FROM contract_doc_form
     WHERE unit_key = $1 AND (email_sent_at IS NOT NULL OR zapsign_sync_json IS NOT NULL)
     ORDER BY sheet_index`,
    [unitKey],
  );
  return rows.map((row) => row.sheet_index);
}

export async function dbRelocateDocForm(
  fromUnit: UnitKey,
  fromIndex: number,
  toUnit: UnitKey,
  toIndex: number,
): Promise<boolean> {
  if (fromUnit === toUnit && fromIndex === toIndex) return false;
  const result = await query(
    `UPDATE contract_doc_form
     SET unit_key = $3, sheet_index = $4
     WHERE unit_key = $1 AND sheet_index = $2
       AND NOT EXISTS (
         SELECT 1 FROM contract_doc_form other
         WHERE other.unit_key = $3 AND other.sheet_index = $4
       )`,
    [fromUnit, fromIndex, toUnit, toIndex],
  );
  return (result.rowCount || 0) > 0;
}

export async function dbListAllDocFormLocations(): Promise<Array<{ unitKey: UnitKey; sheetIndex: number }>> {
  const { rows } = await query<{ unit_key: UnitKey; sheet_index: number }>(
    `SELECT unit_key, sheet_index FROM contract_doc_form
     WHERE email_sent_at IS NOT NULL OR zapsign_sync_json IS NOT NULL
     ORDER BY unit_key, sheet_index`,
  );
  return rows.map((row) => ({ unitKey: row.unit_key, sheetIndex: row.sheet_index }));
}

function parseZapsignSyncJson(raw: string | null | undefined): Partial<Record<DocFormKind, ZapsignKindSyncRecord>> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<Record<DocFormKind, ZapsignKindSyncRecord>>;
  } catch {
    return {};
  }
}

export async function dbGetZapsignSyncMap(
  unitKey: UnitKey,
  sheetIndex: number,
): Promise<Partial<Record<DocFormKind, ZapsignKindSyncRecord>>> {
  const { rows } = await query<{ zapsign_sync_json: string | null }>(
    "SELECT zapsign_sync_json FROM contract_doc_form WHERE unit_key = $1 AND sheet_index = $2",
    [unitKey, sheetIndex],
  );
  return parseZapsignSyncJson(rows[0]?.zapsign_sync_json);
}

export async function dbSetZapsignSyncKind(
  unitKey: UnitKey,
  sheetIndex: number,
  kind: DocFormKind,
  record: ZapsignKindSyncRecord,
): Promise<void> {
  const current = await dbGetZapsignSyncMap(unitKey, sheetIndex);
  current[kind] = record;
  await query(
    `INSERT INTO contract_doc_form (unit_key, sheet_index, zapsign_sync_json)
     VALUES ($1, $2, $3)
     ON CONFLICT (unit_key, sheet_index) DO UPDATE SET zapsign_sync_json = EXCLUDED.zapsign_sync_json`,
    [unitKey, sheetIndex, JSON.stringify(current)],
  );
}
