import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { AttachmentKind, ATTACHMENT_KINDS } from "../services/contractAttachments.js";
import type { EmployeeRecord } from "../services/employees.js";
import type { SignatureRecord } from "../services/signatures.js";
import { UnitKey } from "../config.js";
import { query } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const SIGNATURES_FILE = path.join(DATA_DIR, "signatures.json");
const ATTACHMENTS_META_FILE = path.join(DATA_DIR, "attachments.json");
const EMPLOYEES_FILE = path.join(DATA_DIR, "employees.json");

export async function importLegacyFileDataIfNeeded(): Promise<void> {
  const { rows } = await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM contract_signatures");
  if (parseInt(rows[0]?.count || "0", 10) > 0) return;

  try {
    const raw = await fs.readFile(SIGNATURES_FILE, "utf8");
    const store = JSON.parse(raw) as Record<string, SignatureRecord>;
    for (const record of Object.values(store)) {
      await query(
        `INSERT INTO contract_signatures (
          unit_key, sheet_index, client_token, created_at, sent_at,
          cliente_nome, cliente_email, cliente_telefone,
          cliente_signed_at, cliente_signature, loja_signed_at, loja_signature, loja_signed_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (unit_key, sheet_index) DO NOTHING`,
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
    if (Object.keys(store).length) {
      console.log(`[db] Importados ${Object.keys(store).length} registro(s) de assinatura do arquivo local.`);
    }
  } catch {
    /* sem arquivo legado */
  }

  try {
    const raw = await fs.readFile(ATTACHMENTS_META_FILE, "utf8");
    const metaStore = JSON.parse(raw) as Record<
      string,
      { unitKey: UnitKey; sheetIndex: number; files: Partial<Record<AttachmentKind, string>>; updatedAt: string }
    >;

    let imported = 0;
    for (const meta of Object.values(metaStore)) {
      for (const kind of ATTACHMENT_KINDS) {
        const rel = meta.files[kind];
        if (!rel) continue;
        try {
          const fullPath = path.join(DATA_DIR, rel);
          const buffer = await fs.readFile(fullPath);
          const ext = path.extname(rel).slice(1).toLowerCase();
          const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
          await query(
            `INSERT INTO contract_attachments (unit_key, sheet_index, kind, mime_type, image_data, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (unit_key, sheet_index, kind) DO NOTHING`,
            [meta.unitKey, meta.sheetIndex, kind, mime, buffer, meta.updatedAt],
          );
          imported += 1;
        } catch {
          /* arquivo ausente */
        }
      }
    }
    if (imported) {
      console.log(`[db] Importados ${imported} anexo(s) do armazenamento local.`);
    }
  } catch {
    /* sem metadados legados */
  }

  await importLegacyEmployeesIfNeeded();
}

async function importLegacyEmployeesIfNeeded(): Promise<void> {
  try {
    const raw = await fs.readFile(EMPLOYEES_FILE, "utf8");
    const store = JSON.parse(raw) as { items?: EmployeeRecord[] };
    const items = store.items ?? [];
    if (!items.length) return;

    let imported = 0;
    for (const item of items) {
      const { rowCount } = await query(
        `INSERT INTO employees (name, unit_key, active, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name, unit_key) DO NOTHING`,
        [item.name, item.unitKey, item.active, item.createdAt],
      );
      if (rowCount) imported += 1;
    }
    if (imported) {
      console.log(`[db] Importados ${imported} funcionário(s) do arquivo local employees.json.`);
    }
  } catch {
    /* sem arquivo legado */
  }
}
