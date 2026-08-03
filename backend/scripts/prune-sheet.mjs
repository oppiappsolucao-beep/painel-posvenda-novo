import { google } from "googleapis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const sheetId = process.env.SHEET_ID || "1TTrjf0DZxWkIacYTp7_vcRmTx2-8XrobIaPgIflnyG8";
const sheetTab = process.env.SHEET_TAB || "Folha1";

const TARGET_CITIES = ["campinas", "piracicaba", "indaiatuba"];

const auth = new google.auth.JWT({
  email: process.env.GCP_CLIENT_EMAIL,
  key: (process.env.GCP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function cityFromRow(row) {
  const unidade = norm(row["Unidade"]);
  const cidade = norm(row["Cidade"]);
  for (const target of TARGET_CITIES) {
    if (unidade.includes(target) || cidade.includes(target)) return target;
  }
  return "";
}

const res = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: `'${sheetTab}'!A:ZZ`,
});

const values = res.data.values || [];
if (!values.length) {
  console.log("Planilha vazia.");
  process.exit(0);
}

const headers = values[0].map((h) => String(h).replace(/\u00a0/g, " ").trim());
const rows = [];

for (let i = 1; i < values.length; i++) {
  const rowValues = values[i];
  const row = {};
  headers.forEach((h, idx) => {
    row[h] = rowValues[idx] ?? "";
  });
  if (Object.values(row).some((v) => String(v).trim())) rows.push(row);
}

const kept = [];
const keptNames = [];

for (const target of TARGET_CITIES) {
  const match = rows.find((row) => cityFromRow(row) === target);
  if (match) {
    kept.push(match);
    keptNames.push(`${match["Nome"] || "Sem nome"} (${target})`);
  }
}

if (kept.length !== TARGET_CITIES.length) {
  const found = kept.map((row) => cityFromRow(row));
  console.error("Nao foi possivel encontrar 1 cliente para cada cidade.");
  console.error("Encontrados:", found.join(", ") || "nenhum");
  process.exit(1);
}

const outputRows = kept.map((row) => headers.map((h) => row[h] ?? ""));

await sheets.spreadsheets.values.clear({
  spreadsheetId: sheetId,
  range: `'${sheetTab}'!A2:ZZ`,
});

await sheets.spreadsheets.values.update({
  spreadsheetId: sheetId,
  range: `'${sheetTab}'!A2`,
  valueInputOption: "USER_ENTERED",
  requestBody: { values: outputRows },
});

console.log(`Planilha atualizada: ${rows.length} -> ${kept.length} registros.`);
console.log("Mantidos:");
for (const name of keptNames) console.log(`- ${name}`);
