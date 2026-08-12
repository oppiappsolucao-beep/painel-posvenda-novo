import JSZip from "jszip";
import type { UnitKey } from "../config.js";
import {
  CAMPINAS_VENDOR_BLOCK_DOCX,
  getUnitVendorDocxConfig,
} from "../config/unitVendorDocx.js";

const SHADING_PATTERN = /<w:(?:highlight|shd)\b/gi;
/** Recuo pendente para parágrafos com bullet manual (•). */
const BULLET_HANGING_IND = '<w:ind w:left="360" w:hanging="360"/>';
const JUSTIFY_BOTH = '<w:jc w:val="both"/>';
/** Quebra de página OOXML antes do termo de imagem/voz (página separada). */
const PAGE_BREAK_PARAGRAPH = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const IMAGE_TERM_TITLE = /TERMO DE AUTORIZA(?:Ç|c)(?:Ã|A)O DE USO DE IMAGEM E VOZ/i;
/** Placeholders quebrados no DOCX (faltava "{{" no início ou tag partida). */
const BROKEN_PLACEHOLDER_FIXES: Array<[RegExp, string]> = [
  [/(?<![\{-])nome-completo\}\}/g, "{{nome-completo}}"],
  [/(?<!\{)\{celular\}\}/g, "{{celular}}"],
  [/\{\{e-mai\}\}l/g, "{{e-mail}}"],
  [/\{\{\{\{nome-completo\}\}/g, "{{nome-completo}}"],
];

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

/** Remove run órfão "{{" imediatamente antes de outro placeholder no mesmo parágrafo. */
function fixOrphanOpenBraceRunsInXml(xml: string): string {
  return xml.replace(
    /<w:t(\s[^>]*)>\{\{<\/w:t><\/w:r>(<w:r[\s\S]*?)<w:t(\s[^>]*)>\{\{([a-z0-9-]+)\}\}<\/w:t>/gi,
    (_match, _tAttr1, _middle, tAttr2, varName) => `<w:t${tAttr2}>{{${varName}}}</w:t>`,
  );
}

/** No bloco PELO COMPRADOR, usa variável dedicada (como CPF/e-mail) para não conflitar com {{celular}} do corpo. */
export function renameCompradorBlockCelularInXml(xml: string): string {
  return xml.replace(/<w:p[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = (paragraph.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((x) => x.replace(/<[^>]+>/g, ""))
      .join("")
      .trim();
    if (text !== "{{celular}}" && text !== "{celular}}") return paragraph;
    return paragraph
      .replace(/\{\{celular\}\}/g, "{{contratante-celular}}")
      .replace(/\{celular\}\}/g, "{{contratante-celular}}");
  });
}

/** Corrige placeholders quebrados no DOCX original. */
export function fixCampinasPlaceholdersInXml(xml: string): string {
  let result = xml;
  for (const [pattern, replacement] of BROKEN_PLACEHOLDER_FIXES) {
    result = result.replace(pattern, replacement);
  }
  result = fixOrphanOpenBraceRunsInXml(result);
  result = renameCompradorBlockCelularInXml(result);
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
  return BROKEN_PLACEHOLDER_FIXES.reduce(
    (total, [pattern]) => total + (docxXml.match(pattern)?.length ?? 0),
    0,
  );
}

function paragraphPlainText(paragraph: string): string {
  return (paragraph.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((x) => x.replace(/<[^>]+>/g, ""))
    .join("");
}

function ensureParagraphProperties(paragraph: string): string {
  if (paragraph.includes("<w:pPr>")) return paragraph;
  return paragraph.replace(/<w:p([^>]*)>/, "<w:p$1><w:pPr></w:pPr>");
}

function upsertIndent(paragraph: string, indentXml: string): string {
  const withPPr = ensureParagraphProperties(paragraph);
  if (/<w:ind[^/>]*\/>/.test(withPPr)) {
    return withPPr.replace(/<w:ind[^/>]*\/>/, indentXml);
  }
  return withPPr.replace(/<w:pPr>/, `<w:pPr>${indentXml}`);
}

function upsertJustify(paragraph: string): string {
  const withPPr = ensureParagraphProperties(paragraph);
  if (/<w:jc w:val="both"/.test(withPPr)) return withPPr;
  if (/<w:jc w:val="[^"]+"/.test(withPPr)) {
    return withPPr.replace(/<w:jc w:val="[^"]+"/, JUSTIFY_BOTH);
  }
  return withPPr.replace(/<w:pPr>/, `<w:pPr>${JUSTIFY_BOTH}`);
}

/**
 * Ajusta alinhamento do corpo do contrato: justificado e recuo pendente nos bullets (•).
 * Preserva parágrafos centralizados ou explicitamente alinhados à esquerda.
 */
export function fixContractTextAlignmentInXml(xml: string): {
  xml: string;
  bulletsFixed: number;
  justified: number;
} {
  let bulletsFixed = 0;
  let justified = 0;

  const result = xml.replace(/<w:p[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = paragraphPlainText(paragraph).trim();
    if (!text) return paragraph;

    let updated = paragraph;
    const isCenter = /<w:jc w:val="center"/.test(updated);
    const isLeft = /<w:jc w:val="left"/.test(updated);

    if (/^•\s/.test(text)) {
      const before = updated;
      updated = upsertIndent(updated, BULLET_HANGING_IND);
      if (updated !== before) bulletsFixed += 1;
    }

    if (!isCenter && !isLeft) {
      const before = updated;
      updated = upsertJustify(updated);
      if (updated !== before) justified += 1;
    }

    return updated;
  });

  return { xml: result, bulletsFixed, justified };
}

export async function fixContractTextAlignmentInDocx(
  docxBuffer: Buffer,
): Promise<{ buffer: Buffer; bulletsFixed: number; justified: number }> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const docPath = "word/document.xml";
  const file = zip.file(docPath);
  if (!file) return { buffer: docxBuffer, bulletsFixed: 0, justified: 0 };

  const content = await file.async("string");
  const { xml, bulletsFixed, justified } = fixContractTextAlignmentInXml(content);
  if (bulletsFixed === 0 && justified === 0) {
    return { buffer: docxBuffer, bulletsFixed, justified };
  }

  zip.file(docPath, xml);
  return {
    buffer: Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })),
    bulletsFixed,
    justified,
  };
}

function paragraphBounds(xml: string, indexInside: number): { start: number; end: number } | null {
  const start = xml.lastIndexOf("<w:p", indexInside);
  if (start < 0) return null;
  const end = xml.indexOf("</w:p>", start);
  if (end < 0) return null;
  return { start, end: end + 6 };
}

function previousParagraphBounds(xml: string, paraStart: number): { start: number; end: number } | null {
  const before = xml.slice(0, paraStart).trimEnd();
  const start = before.lastIndexOf("<w:p");
  if (start < 0) return null;
  const end = before.indexOf("</w:p>", start);
  if (end < 0) return null;
  return { start, end: end + 6 };
}

function paragraphHasImage(para: string): boolean {
  return /<w:drawing|<w:pict|<wp:inline|<wp:anchor|<v:imagedata/i.test(para);
}

function hasPageBreakBefore(xml: string, position: number): boolean {
  const window = xml.slice(Math.max(0, position - 1200), position);
  return /<w:br[^>]*w:type="page"/i.test(window) || /<w:pageBreakBefore\b/i.test(window);
}

/** Insere quebra de página antes do termo de autorização de imagem/voz (logo + título). */
export function insertImageTermPageBreakInXml(xml: string): { xml: string; inserted: boolean } {
  const match = IMAGE_TERM_TITLE.exec(xml);
  if (!match || match.index === undefined) {
    return { xml, inserted: false };
  }

  const termPara = paragraphBounds(xml, match.index);
  if (!termPara) return { xml, inserted: false };

  let breakAt = termPara.start;
  const prevPara = previousParagraphBounds(xml, breakAt);
  if (prevPara) {
    const prevContent = xml.slice(prevPara.start, prevPara.end);
    if (paragraphHasImage(prevContent) && !IMAGE_TERM_TITLE.test(prevContent)) {
      breakAt = prevPara.start;
    }
  }

  if (hasPageBreakBefore(xml, breakAt)) {
    return { xml, inserted: false };
  }

  return {
    xml: xml.slice(0, breakAt) + PAGE_BREAK_PARAGRAPH + xml.slice(breakAt),
    inserted: true,
  };
}

export async function insertImageTermPageBreakInDocx(
  docxBuffer: Buffer,
): Promise<{ buffer: Buffer; inserted: boolean }> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const docPath = "word/document.xml";
  const file = zip.file(docPath);
  if (!file) return { buffer: docxBuffer, inserted: false };

  const content = await file.async("string");
  const { xml, inserted } = insertImageTermPageBreakInXml(content);
  if (!inserted) return { buffer: docxBuffer, inserted: false };

  zip.file(docPath, xml);
  return {
    buffer: Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })),
    inserted: true,
  };
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
