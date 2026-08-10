import { UnitKey } from "../config.js";
import { formatDateBr, todaySaoPaulo } from "../utils/formatters.js";
import { query } from "./client.js";

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
