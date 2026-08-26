import { UnitKey } from "../config.js";
import {
  AttachmentKind,
  ATTACHMENT_KINDS,
  ContractAttachmentImages,
} from "../services/contractAttachments.js";
import { formatDateBr, parseDate, todaySaoPaulo } from "../utils/formatters.js";
import { query } from "./client.js";

interface AttachmentRow {
  kind: AttachmentKind;
  image_data: Buffer;
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!match) throw new Error("Formato de imagem inválido.");
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

export async function dbSaveContractAttachments(
  unitKey: UnitKey,
  sheetIndex: number,
  anexos: Partial<Record<AttachmentKind, string>>,
): Promise<void> {
  const updatedAt = formatDateBr(todaySaoPaulo());
  const entries = Object.entries(anexos).filter(([, v]) => String(v || "").startsWith("data:image/")) as Array<
    [AttachmentKind, string]
  >;

  for (const [kind, dataUrl] of entries) {
    const { buffer, mime } = parseDataUrl(dataUrl);
    await query(
      `INSERT INTO contract_attachments (unit_key, sheet_index, kind, mime_type, image_data, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (unit_key, sheet_index, kind) DO UPDATE SET
         mime_type = EXCLUDED.mime_type,
         image_data = EXCLUDED.image_data,
         updated_at = EXCLUDED.updated_at`,
      [unitKey, sheetIndex, kind, mime, buffer, updatedAt],
    );
  }
}

export async function dbGetAttachmentsUpdatedAt(
  unitKey: UnitKey,
  sheetIndex: number,
): Promise<string | null> {
  const { rows } = await query<{ updated_at: string | null }>(
    "SELECT updated_at FROM contract_attachments WHERE unit_key = $1 AND sheet_index = $2",
    [unitKey, sheetIndex],
  );
  let latest: Date | null = null;
  let latestRaw: string | null = null;
  for (const row of rows) {
    const parsed = parseDate(row.updated_at || "");
    if (!parsed) continue;
    if (!latest || parsed.getTime() > latest.getTime()) {
      latest = parsed;
      latestRaw = row.updated_at;
    }
  }
  return latestRaw;
}

export async function dbGetContractAttachmentBuffers(
  unitKey: UnitKey,
  sheetIndex: number,
): Promise<ContractAttachmentImages> {
  const { rows } = await query<AttachmentRow>(
    "SELECT kind, image_data FROM contract_attachments WHERE unit_key = $1 AND sheet_index = $2",
    [unitKey, sheetIndex],
  );

  const result: ContractAttachmentImages = {};
  for (const row of rows) {
    const kind = row.kind;
    if (ATTACHMENT_KINDS.includes(kind)) {
      result[kind] = row.image_data;
    }
  }
  return result;
}

export async function dbListAttachmentSheetIndices(unitKey: UnitKey): Promise<number[]> {
  const { rows } = await query<{ sheet_index: number }>(
    `SELECT DISTINCT sheet_index FROM contract_attachments
     WHERE unit_key = $1
     ORDER BY sheet_index`,
    [unitKey],
  );
  return rows.map((row) => row.sheet_index);
}

export async function dbRelocateAttachments(
  fromUnit: UnitKey,
  fromIndex: number,
  toUnit: UnitKey,
  toIndex: number,
): Promise<boolean> {
  if (fromUnit === toUnit && fromIndex === toIndex) return false;
  const existing = await dbGetContractAttachmentBuffers(toUnit, toIndex);
  if (Object.keys(existing).length > 0) return false;

  const result = await query(
    `UPDATE contract_attachments
     SET unit_key = $3, sheet_index = $4
     WHERE unit_key = $1 AND sheet_index = $2
       AND NOT EXISTS (
         SELECT 1 FROM contract_attachments other
         WHERE other.unit_key = $3 AND other.sheet_index = $4
       )`,
    [fromUnit, fromIndex, toUnit, toIndex],
  );
  return (result.rowCount || 0) > 0;
}

export async function dbListAllAttachmentLocations(): Promise<Array<{ unitKey: UnitKey; sheetIndex: number }>> {
  const { rows } = await query<{ unit_key: UnitKey; sheet_index: number }>(
    `SELECT DISTINCT unit_key, sheet_index FROM contract_attachments
     ORDER BY unit_key, sheet_index`,
  );
  return rows.map((row) => ({ unitKey: row.unit_key, sheetIndex: row.sheet_index }));
}
