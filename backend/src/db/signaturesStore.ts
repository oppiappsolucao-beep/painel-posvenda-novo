import { UnitKey } from "../config.js";
import type { SignatureRecord } from "../services/signatures.js";
import { query } from "./client.js";

interface SignatureRow {
  unit_key: UnitKey;
  sheet_index: number;
  client_token: string;
  created_at: string;
  sent_at: string;
  cliente_nome: string;
  cliente_email: string;
  cliente_telefone: string;
  cliente_signed_at: string | null;
  cliente_signature: string | null;
  loja_signed_at: string | null;
  loja_signature: string | null;
  loja_signed_by: string | null;
}

function mapRow(row: SignatureRow): SignatureRecord {
  return {
    unitKey: row.unit_key,
    sheetIndex: row.sheet_index,
    clientToken: row.client_token,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    clienteNome: row.cliente_nome,
    clienteEmail: row.cliente_email,
    clienteTelefone: row.cliente_telefone,
    clienteSignedAt: row.cliente_signed_at || undefined,
    clienteSignature: row.cliente_signature || undefined,
    lojaSignedAt: row.loja_signed_at || undefined,
    lojaSignature: row.loja_signature || undefined,
    lojaSignedBy: row.loja_signed_by || undefined,
  };
}

export async function dbLoadSignaturesMap(): Promise<Map<string, SignatureRecord>> {
  const { rows } = await query<SignatureRow>("SELECT * FROM contract_signatures");
  return new Map(rows.map((row) => [`${row.unit_key}:${row.sheet_index}`, mapRow(row)]));
}

export async function dbGetSignature(unitKey: UnitKey, sheetIndex: number): Promise<SignatureRecord | null> {
  const { rows } = await query<SignatureRow>(
    "SELECT * FROM contract_signatures WHERE unit_key = $1 AND sheet_index = $2",
    [unitKey, sheetIndex],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function dbGetSignatureByToken(token: string): Promise<SignatureRecord | null> {
  const { rows } = await query<SignatureRow>(
    "SELECT * FROM contract_signatures WHERE client_token = $1",
    [token],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function dbInsertSignature(record: SignatureRecord): Promise<void> {
  await query(
    `INSERT INTO contract_signatures (
      unit_key, sheet_index, client_token, created_at, sent_at,
      cliente_nome, cliente_email, cliente_telefone,
      cliente_signed_at, cliente_signature, loja_signed_at, loja_signature, loja_signed_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      record.unitKey,
      record.sheetIndex,
      record.clientToken,
      record.createdAt,
      record.sentAt,
      record.clienteNome,
      record.clienteEmail,
      record.clienteTelefone,
      record.clienteSignedAt || null,
      record.clienteSignature || null,
      record.lojaSignedAt || null,
      record.lojaSignature || null,
      record.lojaSignedBy || null,
    ],
  );
}

export async function dbUpdateSignature(record: SignatureRecord): Promise<void> {
  await query(
    `UPDATE contract_signatures SET
      sent_at = $3,
      cliente_nome = $4,
      cliente_email = $5,
      cliente_telefone = $6,
      cliente_signed_at = $7,
      cliente_signature = $8,
      loja_signed_at = $9,
      loja_signature = $10,
      loja_signed_by = $11
    WHERE unit_key = $1 AND sheet_index = $2`,
    [
      record.unitKey,
      record.sheetIndex,
      record.sentAt,
      record.clienteNome,
      record.clienteEmail,
      record.clienteTelefone,
      record.clienteSignedAt || null,
      record.clienteSignature || null,
      record.lojaSignedAt || null,
      record.lojaSignature || null,
      record.lojaSignedBy || null,
    ],
  );
}
