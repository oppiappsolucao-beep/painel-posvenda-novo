import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const base = "https://sandbox.api.zapsign.com.br/api/v1";
const token =
  process.env.ZAPSIGN_SANDBOX_API_TOKEN?.trim() || process.env.ZAPSIGN_API_TOKEN?.trim();
const templateId = process.env.ZAPSIGN_SANDBOX_TEMPLATE_ID_CAMPINAS?.trim();

const t = await (
  await fetch(`${base}/templates/${templateId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
).json();

const { default: JSZip } = await import("jszip");
const docx = await (await fetch(t.template_file)).arrayBuffer();
const zip = await JSZip.loadAsync(docx);
const xml = (await zip.file("word/document.xml")?.async("string")) || "";

const terms = [
  "nome-animal",
  "nome-completo",
  "raca",
  "microchip",
  "especie",
  "pelagem",
  "data-nasc",
  "sexo",
  "cor",
  "valor",
  "Raissa",
  "Luna",
];

for (const term of terms) {
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  console.log(term, (xml.match(re) || []).length);
}

// show all {{...}} placeholders
const placeholders = [...xml.matchAll(/\{\{[^}]+\}\}/g)].map((m) => m[0]);
const unique = [...new Set(placeholders)];
console.log("\nUnique placeholders:", unique.length);
for (const p of unique.sort()) console.log(p);
