import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../data/easypanel-env-restore.txt");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const token = process.env.ZAPSIGN_API_TOKEN?.trim();
const templateId = process.argv[2]?.trim() || process.env.ZAPSIGN_PRODUCTION_TEMPLATE_ID_CAMPINAS?.trim();
const base = "https://api.zapsign.com.br/api/v1";

if (!token || !templateId) {
  console.error("Missing token or template id");
  process.exit(1);
}

const t = await (
  await fetch(`${base}/templates/${templateId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
).json();

console.log("template:", t.name, t.token);

const docx = Buffer.from(await (await fetch(t.template_file)).arrayBuffer());
const zip = await JSZip.loadAsync(docx);
const xml = (await zip.file("word/document.xml")?.async("string")) || "";
const broken = (xml.match(/(?<![\{-])nome-completo\}\}/g) || []).length;
const good = (xml.match(/\{\{nome-completo\}\}/g) || []).length;
const highlight = (xml.match(/<w:(?:highlight|shd)\b/gi) || []).length;
const nonWhite = (xml.match(/<w:highlight\b(?![^>]*w:val="white")[^>]*>/gi) || []).length;
const nonWhiteShd = (xml.match(/<w:shd\b(?![^>]*w:fill="FFFFFF")[^>]*>/gi) || []).length;

console.log("broken nome-completo}}:", broken);
console.log("good {{nome-completo}}:", good);
console.log("highlight/shd tags:", highlight, "non-white highlight:", nonWhite, "non-white shd:", nonWhiteShd);

const idx = xml.indexOf("nome-completo");
if (idx >= 0) {
  console.log("context:", xml.slice(Math.max(0, idx - 120), idx + 120));
}
