import JSZip from "jszip";

/** Remove destaque e sombreamento do XML Word (campos coloridos no template). */
function stripHighlightFromXml(xml: string): string {
  let result = xml;
  result = result.replace(/<w:highlight\b[^>]*\/>/g, "");
  result = result.replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, "");
  result = result.replace(/<w:shd\b[^>]*\/>/g, "");
  result = result.replace(/<w:shd\b[^>]*>[\s\S]*?<\/w:shd>/g, "");
  return result;
}

/** Gera cópia do DOCX sem cores de fundo/destaque — texto permanece igual. */
export async function stripDocxHighlights(docxBuffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBuffer);

  for (const name of Object.keys(zip.files)) {
    const file = zip.files[name];
    if (!file || file.dir || !/\.xml$/i.test(name)) continue;

    const content = await file.async("string");
    const cleaned = stripHighlightFromXml(content);
    if (cleaned !== content) {
      zip.file(name, cleaned);
    }
  }

  return Buffer.from(
    await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
  );
}
