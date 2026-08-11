import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fixCampinasPlaceholdersInXml,
  fixDocumentacaoFilhoteParagraphsInXml,
} from "../dist/utils/docxStripHighlights.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../data/easypanel-env-restore.txt");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const base = "https://api.zapsign.com.br/api/v1";
const token = process.env.ZAPSIGN_API_TOKEN;
const templateId = process.env.ZAPSIGN_TEMPLATE_ID_CAMPINAS;

const t = await (
  await fetch(`${base}/templates/${templateId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
).json();

const { default: JSZip } = await import("jszip");
const docx = await (await fetch(t.template_file)).arrayBuffer();
const zip = await JSZip.loadAsync(docx);
const xml = (await zip.file("word/document.xml")?.async("string")) || "";

function showLines(label, content) {
  console.log(`\n=== ${label} ===`);
  for (const p of content.split("</w:p>")) {
    if (/\{\{(carteirinha|certificado|transferencia|pedigree|atestado)\}\}/.test(p)) {
      console.log(p.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    }
  }
}

showLines("before", xml);
showLines("after fixDocumentacaoFilhoteParagraphsInXml", fixDocumentacaoFilhoteParagraphsInXml(xml));
showLines("after fixCampinasPlaceholdersInXml", fixCampinasPlaceholdersInXml(xml));
