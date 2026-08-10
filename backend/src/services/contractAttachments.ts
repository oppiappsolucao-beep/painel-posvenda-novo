import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { UnitKey } from "../config.js";
import { dbGetContractAttachmentBuffers, dbSaveContractAttachments } from "../db/attachmentsStore.js";
import { isDatabaseEnabled } from "../db/client.js";
import { formatDateBr, todaySaoPaulo } from "../utils/formatters.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const META_FILE = path.join(DATA_DIR, "attachments.json");
const FILES_DIR = path.join(DATA_DIR, "attachments");

export type AttachmentKind =
  | "rgFrente"
  | "rgVerso"
  | "carteirinha"
  | "laudo"
  | "fotoAnimal"
  | "carteirinhaFrente"
  | "carteirinhaVerso"
  | "atestado"
  | "fotoFilhote";

/** Anexos obrigatórios no painel Status De Assinatura (formulário abaixo do contrato). */
export type DocFormKind = "carteirinhaFrente" | "carteirinhaVerso" | "atestado" | "fotoFilhote";

export const DOC_FORM_KINDS: DocFormKind[] = [
  "carteirinhaFrente",
  "carteirinhaVerso",
  "atestado",
  "fotoFilhote",
];

export const DOC_FORM_LABELS: Record<DocFormKind, string> = {
  carteirinhaFrente: "Carteirinha de vacina — Frente",
  carteirinhaVerso: "Carteirinha de vacina — Verso",
  atestado: "Atestado de saúde",
  fotoFilhote: "Foto do filhote",
};

export const ATTACHMENT_KINDS: AttachmentKind[] = [
  "rgFrente",
  "rgVerso",
  "carteirinha",
  "laudo",
  "fotoAnimal",
  ...DOC_FORM_KINDS,
];

export const ATTACHMENT_LABELS: Record<AttachmentKind, string> = {
  rgFrente: "Documento de identidade (RG) — Frente",
  rgVerso: "Documento de identidade (RG) — Verso",
  carteirinha: "Carteirinha de vacinação do filhote",
  laudo: "Laudo de saúde",
  fotoAnimal: "Foto do animal",
  ...DOC_FORM_LABELS,
};

export type ContractAttachmentImages = Partial<Record<AttachmentKind, Buffer>>;

interface AttachmentMeta {
  unitKey: UnitKey;
  sheetIndex: number;
  files: Partial<Record<AttachmentKind, string>>;
  updatedAt: string;
}

type AttachmentStore = Record<string, AttachmentMeta>;

function recordKey(unitKey: UnitKey, sheetIndex: number): string {
  return `${unitKey}:${sheetIndex}`;
}

function attachmentDir(unitKey: UnitKey, sheetIndex: number): string {
  return path.join(FILES_DIR, unitKey, String(sheetIndex));
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; ext: string } {
  const match = dataUrl.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
  if (!match) throw new Error("Formato de imagem inválido.");
  const rawExt = match[1].toLowerCase();
  const ext = rawExt === "jpeg" ? "jpg" : rawExt.replace("+xml", "");
  return { buffer: Buffer.from(match[2], "base64"), ext };
}

async function ensureMetaStore(): Promise<AttachmentStore> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(META_FILE, "utf8");
    return JSON.parse(raw) as AttachmentStore;
  } catch {
    const empty: AttachmentStore = {};
    await fs.writeFile(META_FILE, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function writeMetaStore(store: AttachmentStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(META_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function saveFileAttachments(
  unitKey: UnitKey,
  sheetIndex: number,
  anexos: Partial<Record<AttachmentKind, string>>,
): Promise<void> {
  const entries = Object.entries(anexos).filter(([, v]) => String(v || "").startsWith("data:image/")) as Array<
    [AttachmentKind, string]
  >;
  if (!entries.length) return;

  const store = await ensureMetaStore();
  const key = recordKey(unitKey, sheetIndex);
  const dir = attachmentDir(unitKey, sheetIndex);
  await fs.mkdir(dir, { recursive: true });

  const meta: AttachmentMeta = store[key] || {
    unitKey,
    sheetIndex,
    files: {},
    updatedAt: "",
  };

  for (const [kind, dataUrl] of entries) {
    const { buffer, ext } = dataUrlToBuffer(dataUrl);
    const filename = `${kind}.${ext}`;
    const fullPath = path.join(dir, filename);
    await fs.writeFile(fullPath, buffer);
    meta.files[kind] = path.relative(DATA_DIR, fullPath).replace(/\\/g, "/");
  }

  meta.unitKey = unitKey;
  meta.sheetIndex = sheetIndex;
  meta.updatedAt = formatDateBr(todaySaoPaulo());
  store[key] = meta;
  await writeMetaStore(store);
}

async function getFileAttachmentBuffers(
  unitKey: UnitKey,
  sheetIndex: number,
): Promise<ContractAttachmentImages> {
  const store = await ensureMetaStore();
  const meta = store[recordKey(unitKey, sheetIndex)];
  if (!meta?.files) return {};

  const result: ContractAttachmentImages = {};
  for (const kind of ATTACHMENT_KINDS) {
    const rel = meta.files[kind];
    if (!rel) continue;
    try {
      const fullPath = path.join(DATA_DIR, rel);
      result[kind] = await fs.readFile(fullPath);
    } catch {
      /* arquivo ausente */
    }
  }
  return result;
}

export async function saveContractAttachments(
  unitKey: UnitKey,
  sheetIndex: number,
  anexos: Partial<Record<AttachmentKind, string>>,
): Promise<void> {
  if (isDatabaseEnabled()) {
    await dbSaveContractAttachments(unitKey, sheetIndex, anexos);
    return;
  }
  await saveFileAttachments(unitKey, sheetIndex, anexos);
}

export async function getContractAttachmentBuffers(
  unitKey: UnitKey,
  sheetIndex: number,
): Promise<ContractAttachmentImages> {
  if (isDatabaseEnabled()) {
    return dbGetContractAttachmentBuffers(unitKey, sheetIndex);
  }
  return getFileAttachmentBuffers(unitKey, sheetIndex);
}

export async function hasContractAttachments(unitKey: UnitKey, sheetIndex: number): Promise<boolean> {
  const images = await getContractAttachmentBuffers(unitKey, sheetIndex);
  return Object.keys(images).length > 0;
}
