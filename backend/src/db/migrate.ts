import { query } from "./client.js";

export async function migrateSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS contract_signatures (
      unit_key TEXT NOT NULL,
      sheet_index INTEGER NOT NULL,
      client_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      cliente_nome TEXT NOT NULL,
      cliente_email TEXT NOT NULL DEFAULT '',
      cliente_telefone TEXT NOT NULL DEFAULT '',
      cliente_signed_at TEXT,
      cliente_signature TEXT,
      loja_signed_at TEXT,
      loja_signature TEXT,
      loja_signed_by TEXT,
      PRIMARY KEY (unit_key, sheet_index)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_contract_signatures_token
    ON contract_signatures (client_token)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS contract_attachments (
      unit_key TEXT NOT NULL,
      sheet_index INTEGER NOT NULL,
      kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      image_data BYTEA NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (unit_key, sheet_index, kind)
    )
  `);
}
