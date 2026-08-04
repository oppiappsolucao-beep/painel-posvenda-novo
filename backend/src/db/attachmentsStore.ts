import { UnitKey } from "../config.js";
import {
  AttachmentKind,
  ATTACHMENT_KINDS,
  ContractAttachmentImages,
} from "../services/contractAttachments.js";
import { formatDateBr, todaySaoPaulo } from "../utils/formatters.js";
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
