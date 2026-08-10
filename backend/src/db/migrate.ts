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

  await query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      unit_key TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      UNIQUE (name, unit_key)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_employees_unit_active
    ON employees (unit_key, active)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS breeds (
      id SERIAL PRIMARY KEY,
      species TEXT NOT NULL CHECK (species IN ('CANINA', 'FELINA')),
      name TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      UNIQUE (species, name)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_breeds_species_active
    ON breeds (species, active)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS contract_doc_form (
      unit_key TEXT NOT NULL,
      sheet_index INTEGER NOT NULL,
      email_sent_at TEXT,
      PRIMARY KEY (unit_key, sheet_index)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS unit_notification_emails (
      id SERIAL PRIMARY KEY,
      unit_key TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (unit_key, email)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_unit_notification_emails_unit
    ON unit_notification_emails (unit_key)
  `);
}
