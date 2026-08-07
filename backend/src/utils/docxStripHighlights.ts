import JSZip from "jszip";

const SHADING_PATTERN = /<w:(?:highlight|shd)\b/gi;

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
    const cleaned = neutralizeHighlightFromXml(content);
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
