import JSZip from "jszip";
import type { UnitKey } from "../config.js";
import {
  CAMPINAS_VENDOR_BLOCK_DOCX,
  getUnitVendorDocxConfig,
} from "../config/unitVendorDocx.js";

const SHADING_PATTERN = /<w:(?:highlight|shd)\b/gi;
/** Placeholder quebrado no DOCX (faltava "{{" no início). Não altera {{contratante-nome-completo}}. */
const BROKEN_NOME_PLACEHOLDER_PATTERN = /(?<![\{-])nome-completo\}\}/g;

const DOC_ACK_TEMPLATE_VARS = [
  "carteirinha",
  "certificado",
  "transferencia",
  "pedigree",
  "atestado",
] as const;

/**
 * Na cláusula 3.1, remove só a numeração ("1. ", "2. ", …) e mantém rótulo + {{var}}.
 * O cliente preenche a resposta ao assinar; antes disso o rótulo continua visível no PDF.
 */
export function fixDocumentacaoFilhoteParagraphsInXml(xml: string): string {
  return xml.replace(/<w:p[\s\S]*?<\/w:p>/g, (paragraph) => {
    const hasDocAckVar = DOC_ACK_TEMPLATE_VARS.some((variable) =>
      paragraph.includes(`{{${variable}}}`),
    );
    if (!hasDocAckVar) return paragraph;

    return paragraph.replace(/(<w:t(?:\s[^>]*)?>)\d+\.\s*/g, "$1");
  });
}

/** Corrige placeholder quebrado no DOCX original (faltava "{{" no início). */
export function fixCampinasPlaceholdersInXml(xml: string): string {
  let result = xml.replace(BROKEN_NOME_PLACEHOLDER_PATTERN, "{{nome-completo}}");
  result = fixDocumentacaoFilhoteParagraphsInXml(result);
  return result;
}

/** Substitui rótulo da unidade-fonte (Campinas) pelo nome da unidade de destino no DOCX. */
export function localizeUnitLabelInXml(xml: string, unitLabel: string, sourceLabel = "Campinas"): string {
  if (!unitLabel.trim() || unitLabel.trim().toLowerCase() === sourceLabel.toLowerCase()) {
    return xml;
  }
  const escaped = sourceLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return xml.replace(new RegExp(escaped, "gi"), unitLabel);
}

/**
 * Localiza o contrato para a unidade: bloco VENDEDOR, CNPJ no rodapé e referências à cidade (foro, assinatura).
 */
export function localizeUnitVendorInXml(xml: string, unitKey: UnitKey): string {
  if (unitKey === "campinas") return xml;

  const vendor = getUnitVendorDocxConfig(unitKey);
  let result = xml;

  if (result.includes(CAMPINAS_VENDOR_BLOCK_DOCX)) {
    result = result.replace(CAMPINAS_VENDOR_BLOCK_DOCX, vendor.introBlock);
  }

  result = result.replace(/47\.945\.634\/0002-61/g, vendor.cnpjFormatted);
  result = result.replace(/CAMPINAS/gi, vendor.cityUpper);

  return result;
}

export function countBrokenCampinasPlaceholders(docxXml: string): number {
  return docxXml.match(BROKEN_NOME_PLACEHOLDER_PATTERN)?.length ?? 0;
}

function countShadingTags(xml: string): number {
  return xml.match(SHADING_PATTERN)?.length ?? 0;
}

/**
 * Troca destaque/sombreamento por branco e texto claro por preto.
 * Só altera formatação de cor — conteúdo e layout permanecem iguais.
 */
function neutralizeHighlightFromXml(xml: string): string {
  let result = xml;

  // Fundo: branco (invisível no papel)
  result = result.replace(/<w:highlight\b[^/>]*\/>/gi, '<w:highlight w:val="white"/>');
  result = result.replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/gi, '<w:highlight w:val="white"/>');
  result = result.replace(
    /<w:shd\b[^/>]*\/>/gi,
    '<w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>',
  );
  result = result.replace(
    /<w:shd\b[^>]*>[\s\S]*?<\/w:shd>/gi,
    '<w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>',
  );

  // Texto branco (legível em fundo azul) → preto
  result = result.replace(
    /<w:color\b[^>]*w:val="(?:FFFFFF|ffffff)"[^>]*\/>/gi,
    '<w:color w:val="000000"/>',
  );

  return result;
}

function isNeutralShading(xml: string): boolean {
  const bad = [
    ...xml.matchAll(/<w:highlight\b(?![^>]*w:val="white")[^>]*>/gi),
    ...xml.matchAll(/<w:shd\b(?![^>]*w:fill="FFFFFF")[^>]*>/gi),
  ];
  return bad.length === 0;
}

export async function localizeUnitLabelInDocx(
  docxBuffer: Buffer,
  unitLabel: string,
  sourceLabel = "Campinas",
): Promise<Buffer> {
  if (!unitLabel.trim() || unitLabel.trim().toLowerCase() === sourceLabel.toLowerCase()) {
    return docxBuffer;
  }

  const zip = await JSZip.loadAsync(docxBuffer);
  let changed = false;

  for (const name of Object.keys(zip.files)) {
    const file = zip.files[name];
    if (!file || file.dir || !/\.xml$/i.test(name)) continue;
    const content = await file.async("string");
    const localized = localizeUnitLabelInXml(content, unitLabel, sourceLabel);
    if (localized !== content) {
      zip.file(name, localized);
      changed = true;
    }
  }

  if (!changed) return docxBuffer;
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

export async function localizeUnitVendorInDocx(
  docxBuffer: Buffer,
  unitKey: UnitKey,
): Promise<Buffer> {
  if (unitKey === "campinas") return docxBuffer;

  const zip = await JSZip.loadAsync(docxBuffer);
  let changed = false;

  for (const name of Object.keys(zip.files)) {
    const file = zip.files[name];
    if (!file || file.dir || !/\.xml$/i.test(name)) continue;
    const content = await file.async("string");
    const localized = localizeUnitVendorInXml(content, unitKey);
    if (localized !== content) {
      zip.file(name, localized);
      changed = true;
    }
  }

  if (!changed) return docxBuffer;
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

export async function fixCampinasDocxPlaceholders(docxBuffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBuffer);
  let changed = false;

  for (const name of Object.keys(zip.files)) {
    const file = zip.files[name];
    if (!file || file.dir || !/\.xml$/i.test(name)) continue;
    const content = await file.async("string");
    const fixed = fixCampinasPlaceholdersInXml(content);
    if (fixed !== content) {
      zip.file(name, fixed);
      changed = true;
    }
  }

  if (!changed) return docxBuffer;
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

export async function countDocxShadingTags(docxBuffer: Buffer): Promise<number> {
  const zip = await JSZip.loadAsync(docxBuffer);
  let total = 0;

  for (const name of Object.keys(zip.files)) {
    const file = zip.files[name];
    if (!file || file.dir || !/\.xml$/i.test(name)) continue;
    total += countShadingTags(await file.async("string"));
  }

  return total;
}

export async function countDocxNonNeutralShading(docxBuffer: Buffer): Promise<number> {
  const zip = await JSZip.loadAsync(docxBuffer);
  let total = 0;

  for (const name of Object.keys(zip.files)) {
    const file = zip.files[name];
    if (!file || file.dir || !/\.xml$/i.test(name)) continue;
    const xml = await file.async("string");
    if (!isNeutralShading(xml)) {
      total += countShadingTags(xml);
    }
  }

  return total;
}

/** Gera cópia do DOCX com campos em fundo branco e texto preto. */
export async function stripDocxHighlights(docxBuffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBuffer);

  for (const name of Object.keys(zip.files)) {
    const file = zip.files[name];
    if (!file || file.dir || !/\.xml$/i.test(name)) continue;

    const content = await file.async("string");
    const cleaned = fixCampinasPlaceholdersInXml(neutralizeHighlightFromXml(content));
    if (cleaned !== content) {
      zip.file(name, cleaned);
    }
  }

  return Buffer.from(
    await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
  );
}

export async function stripDocxHighlightsVerified(docxBuffer: Buffer): Promise<{
  buffer: Buffer;
  before: number;
  after: number;
  fixed: boolean;
}> {
  const before = await countDocxNonNeutralShading(docxBuffer);
  const buffer = await stripDocxHighlights(docxBuffer);
  const after = await countDocxNonNeutralShading(buffer);

  return {
    buffer,
    before,
    after,
    fixed: before === 0 || after < before,
  };
}
