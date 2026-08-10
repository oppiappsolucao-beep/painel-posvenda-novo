/**
 * Diagnóstico local: baixa template ZapSign e inspeciona tags de destaque no DOCX.
 * Uso: ZAPSIGN_API_TOKEN=... ZAPSIGN_TEMPLATE_ID_CAMPINAS=... node scripts/zapsign-inspect-template.mjs
 */
import fs from "fs/promises";
import JSZip from "jszip";

const API_BASE = "https://api.zapsign.com.br/api/v1";
const token = process.env.ZAPSIGN_API_TOKEN?.trim();
const templateId = process.env.ZAPSIGN_TEMPLATE_ID_CAMPINAS?.trim();

if (!token || !templateId) {
  console.error("Defina ZAPSIGN_API_TOKEN e ZAPSIGN_TEMPLATE_ID_CAMPINAS");
  process.exit(1);
}

const res = await fetch(`${API_BASE}/templates/${templateId}/`, {
  headers: { Authorization: `Bearer ${token}` },
});
const detail = await res.json();
console.log("Template:", detail.name, detail.token);

const fileUrl = detail.template_file;
const docxRes = await fetch(fileUrl);
const buf = Buffer.from(await docxRes.arrayBuffer());
await fs.writeFile("template-source.docx", buf);

const zip = await JSZip.loadAsync(buf);
for (const name of Object.keys(zip.files).filter((n) => n.endsWith(".xml"))) {
  const xml = await zip.file(name).async("string");
  const hits = [
    ...xml.matchAll(/<w:highlight\b[^>]*>/gi),
    ...xml.matchAll(/<w:shd\b[^>]*>/gi),
    ...xml.matchAll(/<w:color\b[^>]*>/gi),
  ];
  if (hits.length) {
    console.log(`\n--- ${name} (${hits.length} tags) ---`);
    hits.slice(0, 8).forEach((m) => console.log(m[0]));
    if (hits.length > 8) console.log(`... +${hits.length - 8}`);
  }
}
