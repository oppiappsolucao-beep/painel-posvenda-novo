import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { stripDocxHighlightsVerified } from "../utils/docxStripHighlights.js";
import { applyCampinasClientForm, syncCampinasStoreSignerFromSource } from "./zapsignFormConfig.js";

const CACHE_VERSION = 3;

export interface ZapSignTemplateDetail {
  token: string;
  template_file?: string;
  last_update_at?: string;
  name?: string;
}

interface CleanTemplateCache {
  version: number;
  sourceToken: string;
  sourceUpdatedAt: string;
  sourceFileHash: string;
  cleanToken: string;
  shadingRemoved?: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "../../data/zapsign-clean-template-v2.json");

let memoryCleanToken: string | null = null;

export async function resetCleanTemplateCache(): Promise<void> {
  memoryCleanToken = null;
  try {
    await fs.unlink(CACHE_FILE);
  } catch {
    /* cache inexistente */
  }
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function readCache(): Promise<CleanTemplateCache | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    return JSON.parse(raw) as CleanTemplateCache;
  } catch {
    return null;
  }
}

async function writeCache(cache: CleanTemplateCache): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  memoryCleanToken = cache.cleanToken;
}

/**
 * Deriva um template ZapSign sem destaque a partir do modelo de exemplo (colorido).
 * O Google Doc / template original permanece intacto; só contratos gerados usam a cópia limpa.
 */
export async function resolveCampinasProductionTemplateId(
  sourceTemplateId: string,
  zapsignRequest: <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>,
): Promise<string> {
  if (process.env.ZAPSIGN_STRIP_HIGHLIGHTS === "false") {
    return sourceTemplateId;
  }

  const cache = await readCache();
  if (
    memoryCleanToken &&
    cache?.sourceToken === sourceTemplateId &&
    cache.cleanToken === memoryCleanToken
  ) {
    return memoryCleanToken;
  }

  const detail = await zapsignRequest<ZapSignTemplateDetail>(`/templates/${sourceTemplateId}/`);
  const templateFile = detail.template_file?.trim();
  if (!templateFile) {
    console.warn("[zapsign] template_file ausente; usando template original.");
    return sourceTemplateId;
  }

  const docxRes = await fetch(templateFile);
  if (!docxRes.ok) {
    throw new Error(`Falha ao baixar template ZapSign (${docxRes.status}).`);
  }

  const docxBuffer = Buffer.from(await docxRes.arrayBuffer());
  const fileHash = sha256(docxBuffer);

  if (
    cache &&
    cache.version === CACHE_VERSION &&
    cache.sourceToken === sourceTemplateId &&
    cache.sourceFileHash === fileHash &&
    cache.cleanToken
  ) {
    memoryCleanToken = cache.cleanToken;
    return cache.cleanToken;
  }

  const { buffer: cleanDocx, before, after, fixed } = await stripDocxHighlightsVerified(docxBuffer);
  console.log(`[zapsign] neutralizar destaque: before=${before} after=${after} fixed=${fixed}`);

  if (before > 0 && !fixed) {
    console.warn("[zapsign] Não foi possível neutralizar destaque do template; usando original.");
    return sourceTemplateId;
  }

  const shadingRemoved = Math.max(0, before - after);
  const base64Docx = cleanDocx.toString("base64");

  const created = await zapsignRequest<ZapSignTemplateDetail>("/templates/create/", {
    method: "POST",
    json: {
      name: `${detail.name || "Campinas"} — assinatura`,
      base64_docx: base64Docx,
      lang: "pt-br",
      folder_path: "/campinas/",
      first_signer: {
        blank_email: false,
        blank_phone: false,
        auth_mode: "assinaturaTela",
      },
    },
  });

  const cleanToken = created.token?.trim();
  if (!cleanToken) {
    throw new Error("ZapSign não retornou token do template de produção.");
  }

  await writeCache({
    version: CACHE_VERSION,
    sourceToken: sourceTemplateId,
    sourceUpdatedAt: detail.last_update_at || "",
    sourceFileHash: fileHash,
    cleanToken,
    shadingRemoved,
  });

  try {
    await syncCampinasStoreSignerFromSource(sourceTemplateId, cleanToken, zapsignRequest);
    await applyCampinasClientForm(cleanToken, zapsignRequest);
    console.log(`[zapsign] Formulário e signatário loja aplicados ao template limpo ${cleanToken}`);
  } catch (e) {
    console.warn(
      "[zapsign] Falha ao configurar formulário no template limpo:",
      e instanceof Error ? e.message : e,
    );
  }

  console.log(
    `[zapsign] Template de produção (sem destaque) criado: ${cleanToken} ← ${sourceTemplateId}`,
  );

  return cleanToken;
}
