import { google } from "googleapis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DEFAULT_HEADERS = [
  "Nome", "Telefone", "CPF", "E-mail", "Data Compra", "Mês", "Raça", "Sexo", "Cor",
  "Pelagem", "Endereço", "Número", "Complemento", "CEP", "Estado", "Cidade", "RG",
  "Valor Filhote", "Valor por extenso", "Forma de pagamento", "Quantidade de parcelas",
  "Vendedora", "Nome do animal", "Espécie", "Microchip", "Nascimento filhote",
  "Observações", "Data preenchimento", "Unidade",
];

const sheetId = process.argv[2] || process.env.SHEET_ID || "1TTrjf0DZxWkIacYTp7_vcRmTx2-8XrobIaPgIflnyG8";
const sheetTab = process.argv[3] || process.env.SHEET_TAB || "Folha1";
const contrato = JSON.parse(process.argv[4] || "{}");

const auth = new google.auth.JWT({
  email: process.env.GCP_CLIENT_EMAIL,
  key: (process.env.GCP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const headerRes = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: `'${sheetTab}'!1:1`,
});

let headers = (headerRes.data.values?.[0] || []).map((h) => String(h).trim()).filter(Boolean);
if (!headers.length) headers = DEFAULT_HEADERS;

const missing = DEFAULT_HEADERS.filter((h) => !headers.includes(h));
if (missing.length) headers = [...headers, ...missing];

const row = headers.map((h) => contrato[h] ?? "");
await sheets.spreadsheets.values.append({
  spreadsheetId: sheetId,
  range: `'${sheetTab}'!A:A`,
  valueInputOption: "USER_ENTERED",
  insertDataOption: "INSERT_ROWS",
  requestBody: { values: [row] },
});

console.log("OK");
