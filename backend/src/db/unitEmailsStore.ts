import { UnitKey } from "../config.js";
import { query } from "./client.js";

export interface UnitEmailRow {
  id: number;
  unit_key: UnitKey;
  email: string;
  created_at: string;
}

export async function dbListUnitEmails(unitKey: UnitKey): Promise<UnitEmailRow[]> {
  const { rows } = await query<UnitEmailRow>(
    "SELECT id, unit_key, email, created_at FROM unit_notification_emails WHERE unit_key = $1 ORDER BY id ASC",
    [unitKey],
  );
  return rows;
}

export async function dbInsertUnitEmail(unitKey: UnitKey, email: string, createdAt: string): Promise<UnitEmailRow> {
  const { rows } = await query<UnitEmailRow>(
    `INSERT INTO unit_notification_emails (unit_key, email, created_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (unit_key, email) DO NOTHING
     RETURNING id, unit_key, email, created_at`,
    [unitKey, email, createdAt],
  );
  if (rows[0]) return rows[0];

  const existing = await query<UnitEmailRow>(
    "SELECT id, unit_key, email, created_at FROM unit_notification_emails WHERE unit_key = $1 AND email = $2",
    [unitKey, email],
  );
  if (!existing.rows[0]) throw new Error("Não foi possível salvar o e-mail.");
  return existing.rows[0];
}

export async function dbDeleteUnitEmail(id: number, unitKey: UnitKey): Promise<boolean> {
  const { rowCount } = await query("DELETE FROM unit_notification_emails WHERE id = $1 AND unit_key = $2", [
    id,
    unitKey,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function dbCountUnitEmails(unitKey: UnitKey): Promise<number> {
  const { rows } = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM unit_notification_emails WHERE unit_key = $1",
    [unitKey],
  );
  return parseInt(rows[0]?.count || "0", 10);
}
