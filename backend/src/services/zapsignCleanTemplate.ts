import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { UnitKey } from "../config.js";
import { isZapSignSandbox, zapsignFolderPath, getZapSignTemplateId } from "../config/zapsignEnv.js";
import { getUnitByKey } from "../config.js";
import { stripDocxHighlightsVerified, countBrokenCampinasPlaceholders, fixCampinasDocxPlaceholders, localizeUnitVendorInDocx, insertImageTermPageBreakInDocx, fixContractTextAlignmentInDocx } from "../utils/docxStripHighlights.js";
import {
  applyCampinasClientForm,
  buildCleanTemplateSigners,
  syncFormFromSourceTemplate,
  templateHasStoreUploadWorkflow,
} from "./zapsignFormConfig.js";

const CACHE_VERSION = 31;

/** Só reescreve endereço no DOCX quando a unidade ainda usa o modelo-fonte de Campinas. */
function shouldLocalizeVendorFromCampinas(unitKey: UnitKey, sourceTemplateId: string): boolean {
  if (unitKey === "campinas") return false;
  const campinasSource = getZapSignTemplateId("campinas");
  return Boolean(campinasSource && sourceTemplateId === campinasSource);
}

export interface ZapSignTemplateDetail {
  token: string;
  template_file?: string;
  last_update_at?: string;
  name?: string;
  signers?: Array<{ name?: string; qualification?: string; auth_mode?: string }>;
  inputs?: Array<{ input_type?: string; label?: string; required?: boolean; order?: number; variable?: string }>;
}

interface CleanTemplateCache {
  version: number;
  sandbox: boolean;
  unitKey: UnitKey;
  sourceToken: string;
  sourceUpdatedAt: string;
  sourceFileHash: string;
  cleanToken: string;
  shadingRemoved?: number;
  /** Modelo-fonte com 2 signatários (formulário loja/cliente separado). */
  useSourceForSigners?: boolean;
  /** Template limpo com DOCX corrigido (referência; nome do cliente). */
  fixedDocxTemplateToken?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function cacheFileForUnit(unitKey: UnitKey): string {
  const suffix = isZapSignSandbox() ? "sandbox" : "v2";
  return path.join(__dirname, "../../data", `zapsign-clean-template-${unitKey}-${suffix}.json`);
}

const memoryCleanTokens = new Map<UnitKey, string>();

export async function resetCleanTemplateCache(unitKey?: UnitKey): Promise<void> {
  if (unitKey) {
    memoryCleanTokens.delete(unitKey);
    try {
      await fs.unlink(cacheFileForUnit(unitKey));
    } catch {
      /* cache inexistente */
    }
    return;
  }

  memoryCleanTokens.clear();
  for (const key of ["campinas", "piracicaba", "indaiatuba"] as UnitKey[]) {
    try {
      await fs.unlink(cacheFileForUnit(key));
    } catch {
      /* cache inexistente */
    }
  }
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function downloadTemplateDocx(templateFile: string): Promise<Buffer> {
  const docxRes = await fetch(templateFile);
  if (!docxRes.ok) {
    throw new Error(`Falha ao baixar template ZapSign (${docxRes.status}).`);
  }
  return Buffer.from(await docxRes.arrayBuffer());
}

async function readCache(unitKey: UnitKey): Promise<CleanTemplateCache | null> {
  try {
    const raw = await fs.readFile(cacheFileForUnit(unitKey), "utf8");
    return JSON.parse(raw) as CleanTemplateCache;
  } catch {
    return null;
  }
}

async function writeCache(cache: CleanTemplateCache): Promise<void> {
  const file = cacheFileForUnit(cache.unitKey);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(cache, null, 2), "utf8");
  memoryCleanTokens.set(cache.unitKey, cache.cleanToken);
}

/** Token do template limpo em cache (sem anexos legados da loja). */
export async function readCachedCleanTemplateId(unitKey: UnitKey): Promise<string | null> {
  const cache = await readCache(unitKey);
  if (!cache?.cleanToken || cache.useSourceForSigners === true) return null;
  return cache.cleanToken;
}

/**
 * Deriva um template ZapSign sem destaque a partir do modelo de exemplo (colorido).
 * O Google Doc / template original permanece intacto; só contratos gerados usam a cópia limpa.
 */
export async function resolveProductionTemplateId(
  unitKey: UnitKey,
  sourceTemplateId: string,
  zapsignRequest: <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>,
): Promise<string> {
  const skipHighlights = process.env.ZAPSIGN_STRIP_HIGHLIGHTS === "false";

  if (isZapSignSandbox()) {
    return sourceTemplateId;
  }

  const memoryCleanToken = memoryCleanTokens.get(unitKey);
  const cache = await readCache(unitKey);
  if (
    memoryCleanToken &&
    cache?.sandbox === isZapSignSandbox() &&
    cache?.unitKey === unitKey &&
    cache?.sourceToken === sourceTemplateId &&
    cache.cleanToken === memoryCleanToken
  ) {
    return memoryCleanToken;
  }

  const detail = await zapsignRequest<ZapSignTemplateDetail>(`/templates/${sourceTemplateId}/`);
  const templateFile = detail.template_file?.trim();
  if (!templateFile) {
    console.warn(`[zapsign] template_file ausente (${unitKey}); usando template original.`);
    return sourceTemplateId;
  }

  const docxBuffer = await downloadTemplateDocx(templateFile);
  const fileHash = sha256(docxBuffer);

  const zipPreview = await (await import("jszip")).default.loadAsync(docxBuffer);
  const previewXml = (await zipPreview.file("word/document.xml")?.async("string")) || "";
  const brokenPlaceholders = countBrokenCampinasPlaceholders(previewXml);
  if (brokenPlaceholders > 0) {
    console.log(
      `[zapsign] Corrigindo ${brokenPlaceholders} placeholder(s) quebrado(s) nome-completo}} no template (${unitKey}).`,
    );
  }

  if (
    cache &&
    cache.version === CACHE_VERSION &&
    cache.sandbox === isZapSignSandbox() &&
    cache.unitKey === unitKey &&
    cache.sourceToken === sourceTemplateId &&
    cache.sourceFileHash === fileHash &&
    cache.cleanToken &&
    cache.useSourceForSigners !== true
  ) {
    memoryCleanTokens.set(unitKey, cache.cleanToken);
    return cache.cleanToken;
  }

  const unitLabel = getUnitByKey(unitKey)?.label || unitKey;

  const { buffer: cleanDocx, before, after, fixed } = skipHighlights
    ? {
        buffer: await fixCampinasDocxPlaceholders(docxBuffer),
        before: 0,
        after: 0,
        fixed: true,
      }
    : await stripDocxHighlightsVerified(docxBuffer);
  const fixedDocx = await fixCampinasDocxPlaceholders(cleanDocx);
  const localizedDocx = shouldLocalizeVendorFromCampinas(unitKey, sourceTemplateId)
    ? await localizeUnitVendorInDocx(fixedDocx, unitKey)
    : fixedDocx;
  const { buffer: pagedDocx, inserted: pageBreakInserted } = await insertImageTermPageBreakInDocx(localizedDocx);
  if (pageBreakInserted) {
    console.log(`[zapsign] Quebra de página antes do termo de imagem/voz (${unitKey}).`);
  }
  const { buffer: alignedDocx, bulletsFixed, justified } = await fixContractTextAlignmentInDocx(pagedDocx);
  if (bulletsFixed > 0 || justified > 0) {
    console.log(
      `[zapsign] Alinhamento do texto (${unitKey}): bullets=${bulletsFixed} justificado=${justified}`,
    );
  }
  if (!skipHighlights) {
    console.log(`[zapsign] neutralizar destaque (${unitKey}): before=${before} after=${after} fixed=${fixed}`);
  }

  if (!skipHighlights && before > 0 && !fixed) {
    console.warn(
      `[zapsign] Destaque parcial no DOCX (${unitKey}); continuando com placeholder corrigido.`,
    );
  }

  const shadingRemoved = Math.max(0, before - after);
  const base64Docx = alignedDocx.toString("base64");
  const templateDisplayName = `Contrato Filhotes ${unitLabel} — assinatura`;
  const signersForCreate = buildCleanTemplateSigners(unitKey);

  const created = await zapsignRequest<ZapSignTemplateDetail>("/templates/create/", {
    method: "POST",
    json: {
      name: templateDisplayName,
      base64_docx: base64Docx,
      lang: "pt-br",
      folder_path: zapsignFolderPath(unitKey),
      signers: signersForCreate,
    },
  });

  const cleanToken = created.token?.trim();
  if (!cleanToken) {
    throw new Error(`ZapSign não retornou token do template de produção (${unitKey}).`);
  }

  try {
    await syncFormFromSourceTemplate(sourceTemplateId, cleanToken, zapsignRequest);
    const verified = await zapsignRequest<ZapSignTemplateDetail>(`/templates/${cleanToken}/`);
    if (!templateHasStoreUploadWorkflow(verified)) {
      await applyCampinasClientForm(cleanToken, unitKey, zapsignRequest);
      await writeCache({
        version: CACHE_VERSION,
        sandbox: isZapSignSandbox(),
        unitKey,
        sourceToken: sourceTemplateId,
        sourceUpdatedAt: detail.last_update_at || "",
        sourceFileHash: fileHash,
        cleanToken,
        fixedDocxTemplateToken: cleanToken,
        useSourceForSigners: false,
        shadingRemoved,
      });
      console.warn(
        `[zapsign] Template limpo (${unitKey}) com ${(verified.signers || []).length} signatário(s) no modelo; ` +
          `cliente será adicionado ao criar o documento. Sem anexos legados da loja no formulário. ` +
          `Token: ${cleanToken}`,
      );
      return cleanToken;
    }

    await applyCampinasClientForm(cleanToken, unitKey, zapsignRequest);
    await writeCache({
      version: CACHE_VERSION,
      sandbox: isZapSignSandbox(),
      unitKey,
      sourceToken: sourceTemplateId,
      sourceUpdatedAt: detail.last_update_at || "",
      sourceFileHash: fileHash,
      cleanToken,
      fixedDocxTemplateToken: cleanToken,
      shadingRemoved,
    });
    console.log(`[zapsign] Formulário aplicado ao template limpo ${unitKey}: ${cleanToken}`);
  } catch (e) {
    console.warn(
      `[zapsign] Falha ao configurar formulário no template limpo (${unitKey}):`,
      e instanceof Error ? e.message : e,
    );
    await applyCampinasClientForm(cleanToken, unitKey, zapsignRequest).catch(() => undefined);
    await writeCache({
      version: CACHE_VERSION,
      sandbox: isZapSignSandbox(),
      unitKey,
      sourceToken: sourceTemplateId,
      sourceUpdatedAt: detail.last_update_at || "",
      sourceFileHash: fileHash,
      cleanToken,
      fixedDocxTemplateToken: cleanToken,
      shadingRemoved,
    }).catch(() => undefined);
    console.log(`[zapsign] Template limpo (${unitKey}) com DOCX corrigido: ${cleanToken}`);
    return cleanToken;
  }

  console.log(
    `[zapsign] Template de produção (${unitKey}) criado: ${cleanToken} ← ${sourceTemplateId}`,
  );

  return cleanToken;
}

/** @deprecated Use resolveProductionTemplateId("campinas", ...) */
export async function resolveCampinasProductionTemplateId(
  sourceTemplateId: string,
  zapsignRequest: <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>,
): Promise<string> {
  return resolveProductionTemplateId("campinas", sourceTemplateId, zapsignRequest);
}
