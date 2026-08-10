/**
 * Remove contratos Raissa da planilha + ZapSign e cria um novo com formulário correto.
 *
 * Uso: node scripts/reset-raissa-contracts.mjs
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const ZAPSIGN_API = "https://api.zapsign.com.br/api/v1";
const zapsignToken = process.env.ZAPSIGN_API_TOKEN?.trim();
const sheetId = process.env.SHEET_ID_CAMPINAS || process.env.SHEET_ID || "1TTrjf0DZxWkIacYTp7_vcRmTx2-8XrobIaPgIflnyG8";
const sheetTab = process.env.SHEET_NAME_CAMPINAS || process.env.SHEET_TAB || "Folha1";

if (!zapsignToken) {
  console.error("ZAPSIGN_API_TOKEN ausente");
  process.exit(1);
}
if (!process.env.GCP_CLIENT_EMAIL || !process.env.GCP_PRIVATE_KEY) {
  console.error("Credenciais GCP ausentes no .env");
  process.exit(1);
}

const contrato = {
  Nome: "Raissa",
  Telefone: "(11) 96848-2180",
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
};

async function zapsign(pathname, init = {}) {
  const res = await fetch(`${ZAPSIGN_API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${zapsignToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }
  if (!res.ok && res.status !== 404) {
    throw new Error(data.detail || text || res.statusText);
  }
  return { ok: res.ok, status: res.status, data };
}

const auth = new google.auth.JWT({
  email: process.env.GCP_CLIENT_EMAIL,
  key: (process.env.GCP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

console.log("1) Buscando contratos Raissa na planilha...");
const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetTab);
const sheetGid = sheet?.properties?.sheetId;
if (sheetGid == null) throw new Error(`Aba "${sheetTab}" não encontrada.`);

const valuesRes = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: `'${sheetTab}'!A:ZZ`,
});
const rows = valuesRes.data.values || [];
const headers = (rows[0] || []).map((h) => String(h).trim());
const nomeIdx = headers.indexOf("Nome");
const docIdx = headers.indexOf("Documento ZapSign");

const raissaRows = [];
for (let i = 1; i < rows.length; i++) {
  const nome = nomeIdx >= 0 ? String(rows[i][nomeIdx] || "").trim() : "";
  if (nome.toLowerCase() === "raissa") {
    raissaRows.push({
      sheetRow: i + 1,
      docToken: docIdx >= 0 ? String(rows[i][docIdx] || "").trim() : "",
    });
  }
}

console.log(`   Encontrados: ${raissaRows.length} registro(s)`);

console.log("2) Apagando documentos ZapSign...");
for (const row of raissaRows) {
  if (!row.docToken) {
    console.log(`   Linha ${row.sheetRow}: sem doc ZapSign`);
    continue;
  }
  const { ok, status } = await zapsign(`/docs/${row.docToken}/`, { method: "DELETE" });
  console.log(`   ${row.docToken}: ${ok ? "apagado" : `status ${status}`}`);
}

if (raissaRows.length) {
  console.log("3) Removendo linhas da planilha...");
  const deleteRequests = [...raissaRows]
    .sort((a, b) => b.sheetRow - a.sheetRow)
    .map((row) => ({
      deleteDimension: {
        range: {
          sheetId: sheetGid,
          dimension: "ROWS",
          startIndex: row.sheetRow - 1,
          endIndex: row.sheetRow,
        },
      },
    }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { requests: deleteRequests },
  });
  console.log(`   ${raissaRows.length} linha(s) removida(s)`);
} else {
  console.log("3) Nenhuma linha Raissa para remover.");
}

console.log("4) Criando novo contrato ZapSign...");
const { createCampinasContractDocument } = await import("../dist/services/zapsign.js");
const now = new Date();
contrato["Data preenchimento"] = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(",", "");

const externalId = `campinas:raissa-${Date.now()}`;
const doc = await createCampinasContractDocument(contrato, externalId);

console.log("5) Registrando na planilha...");
const headerRes = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: `'${sheetTab}'!1:1`,
});
let headersNow = (headerRes.data.values?.[0] || []).map((h) => String(h).trim()).filter(Boolean);
const extra = [
  "Link Assinatura",
  "Link Assinatura Loja",
  "Data Envio",
  "Documento ZapSign",
  "Status Assinatura",
  "E-mail Loja",
  "Bairro",
];
for (const h of extra) {
  if (!headersNow.includes(h)) headersNow.push(h);
}

const patch = {
  "Link Assinatura": doc.signUrl,
  "Documento ZapSign": doc.docToken,
  "Data Envio": now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  "Status Assinatura": "Aguardando cliente (ZapSign)",
  "E-mail Loja": "oppiappsolucao@gmail.com",
};
if (doc.storeSignUrl) patch["Link Assinatura Loja"] = doc.storeSignUrl;

const rowValues = headersNow.map((h) => contrato[h] ?? patch[h] ?? "");
await sheets.spreadsheets.values.append({
  spreadsheetId: sheetId,
  range: `'${sheetTab}'!A:A`,
  valueInputOption: "USER_ENTERED",
  insertDataOption: "INSERT_ROWS",
  requestBody: { values: [rowValues] },
});

console.log("\n=== Novo contrato Raissa ===");
console.log("Documento:", doc.docToken);
console.log("Cliente:", doc.signUrl);
console.log("WhatsApp cliente:", contrato.Telefone);
console.log("Auth cliente:", process.env.ZAPSIGN_CLIENT_AUTH_MODE || "tokenWhatsapp");
if (doc.storeSignUrl) {
  console.log("Loja:", doc.storeSignUrl);
  console.log("WhatsApp loja:", contrato["Telefone Loja"]);
}
