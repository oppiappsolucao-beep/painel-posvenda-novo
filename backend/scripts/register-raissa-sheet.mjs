/**
 * Registra contrato Raissa na planilha Campinas (painel Status Assinatura).
 * node scripts/register-raissa-sheet.mjs
 */
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const DEFAULT_HEADERS = [
  "Nome", "Telefone", "CPF", "E-mail", "Data Compra", "Mês", "Raça", "Sexo", "Cor",
  "Pelagem", "Endereço", "Número", "Complemento", "CEP", "Estado", "Cidade", "RG",
  "Valor Filhote", "Valor por extenso", "Forma de pagamento", "Quantidade de parcelas",
  "Vendedora", "Nome do animal", "Espécie", "Microchip", "Nascimento filhote",
  "Observações", "Data preenchimento", "Unidade",
];

const SIGNATURE_HEADERS = [
  "Link Assinatura",
  "Link Assinatura Loja",
  "Data Envio",
  "Documento ZapSign",
  "Data Assinatura Cliente",
  "Data Assinatura Loja",
  "Status Assinatura",
  "E-mail Loja",
];

const sheetId = process.env.SHEET_ID_CAMPINAS || process.env.SHEET_ID || "1TTrjf0DZxWkIacYTp7_vcRmTx2-8XrobIaPgIflnyG8";
const sheetTab = process.env.SHEET_NAME_CAMPINAS || process.env.SHEET_TAB || "Folha1";

const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(",", "");

const contrato = {
  Nome: "Raissa",
  Telefone: "(19) 98765-4321",
  CPF: "529.982.247-25",
  "E-mail": "kaineenetwork@gmail.com",
  Endereço: "Rua das Flores",
  Número: "100",
  Complemento: "",
  Bairro: "Cambuí",
  CEP: "13025-320",
  Cidade: "Campinas",
  Estado: "SP",
  RG: "12.345.678-9",
  "Nome do animal": "Luna",
  Espécie: "CANINA",
  Raça: "Shih Tzu",
  Sexo: "FÊMEA",
  Cor: "Branco",
  Pelagem: "LONGA",
  Microchip: "985112004567891",
  "Nascimento filhote": "10/02/2026",
  Observações: "Contrato teste assinatura Raissa + Oppi",
  "Data Compra": "07/08/2026",
  Mês: "2026-08",
  "Valor Filhote": "4.500,00",
  "Valor por extenso": "quatro mil e quinhentos reais",
  "Forma de pagamento": "PIX",
  "Quantidade de parcelas": "1",
  Vendedora: "Oppi",
  "E-mail Loja": "oppiappsolucao@gmail.com",
  "Telefone Loja": "11942157917",
  Unidade: "Campinas",
  "Data preenchimento": now,
  "Link Assinatura": "https://app.zapsign.com.br/verificar/779a6643-b9b9-4a2a-9a76-aa1eaed765dc",
  "Link Assinatura Loja": "https://app.zapsign.com.br/verificar/691f343d-7f1a-44eb-8163-4b68f5082227",
  "Documento ZapSign": "9632eb35-0943-4b38-b382-48ba44e6d215",
  "Data Envio": now,
  "Status Assinatura": "Aguardando cliente (ZapSign)",
};

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
if (!headers.length) headers = [...DEFAULT_HEADERS, ...SIGNATURE_HEADERS];

const required = [...DEFAULT_HEADERS, ...SIGNATURE_HEADERS];
const missing = required.filter((h) => !headers.includes(h));
if (missing.length) {
  headers = [...headers, ...missing];
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${sheetTab}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] },
  });
}

const existing = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: `'${sheetTab}'!A:ZZ`,
});
const rows = existing.data.values || [];
const already = rows.slice(1).some((row) => {
  const nomeIdx = headers.indexOf("Nome");
  const docIdx = headers.indexOf("Documento ZapSign");
  const nome = nomeIdx >= 0 ? String(row[nomeIdx] || "").trim() : "";
  const doc = docIdx >= 0 ? String(row[docIdx] || "").trim() : "";
  return nome.toLowerCase() === "raissa" && doc === contrato["Documento ZapSign"];
});

if (already) {
  console.log("Raissa já está na planilha — nada a fazer.");
  process.exit(0);
}

const row = headers.map((h) => contrato[h] ?? "");
await sheets.spreadsheets.values.append({
  spreadsheetId: sheetId,
  range: `'${sheetTab}'!A:A`,
  valueInputOption: "USER_ENTERED",
  insertDataOption: "INSERT_ROWS",
  requestBody: { values: [row] },
});

console.log("OK — Raissa registrada na planilha Campinas.");
