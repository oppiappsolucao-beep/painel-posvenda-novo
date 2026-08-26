import { google } from "googleapis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DEFAULT_HEADERS = [
  "Nome", "Telefone", "CPF", "E-mail", "Data Compra", "Mês", "Raça", "Sexo", "Cor",
  "Pelagem", "Endereço", "Número", "Complemento", "CEP", "Estado", "Cidade", "Bairro", "RG",
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

const REQUIRED_HEADERS = [...DEFAULT_HEADERS, ...SIGNATURE_HEADERS];

function foldHeader(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ºª°]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function lookup(contrato, wanted) {
  if (Object.prototype.hasOwnProperty.call(contrato, wanted) && contrato[wanted] != null) {
    return contrato[wanted];
  }
  const wantedFold = foldHeader(wanted);
  const match = Object.keys(contrato).find((key) => foldHeader(key) === wantedFold);
  return match ? contrato[match] ?? "" : "";
}

const HEADER_ALIASES = {
  Nome: ["Nome do comprador", "Nome cliente", "Cliente"],
  Telefone: ["WhatsApp", "Whatsapp", "Celular", "Telefone WhatsApp"],
  "E-mail": ["Email", "E mail", "Mail"],
  "Data Compra": ["Data da Compra", "Data da compra", "Data compra", "Dt Compra"],
  Mês: ["Mes", "Mes da compra", "Mês da compra"],
  Endereço: ["Endereco", "Logradouro"],
  Número: ["Numero", "N", "Nro", "N da residencia"],
  Cidade: ["Cidade do comprador"],
  "Valor Filhote": ["Valor filhote", "Valor de filhote", "Valor do filhote", "Valor"],
  "Valor por extenso": ["Valor extenso", "Valor por Extenso"],
  "Forma de pagamento": ["Forma pagamento", "Pagamento"],
  "Quantidade de parcelas": ["Parcelas", "Qtd parcelas", "Quantidade parcelas"],
  Vendedora: ["Vendedor", "Atendente"],
  "Nome do animal": ["Nome animal", "Nome do filhote"],
  "Nascimento filhote": ["Nascimento do filhote", "Data nascimento filhote", "Nascimento"],
  Observações: ["Observacoes", "Obs"],
  "Data preenchimento": ["Data do preenchimento", "Preenchimento"],
  Unidade: ["Unidade da loja", "Loja", "Filial"],
  "E-mail Loja": ["Email Loja", "E-mail da loja"],
};

const foldToCanonical = new Map();
for (const name of REQUIRED_HEADERS) {
  foldToCanonical.set(foldHeader(name), name);
  for (const alias of HEADER_ALIASES[name] || []) {
    const folded = foldHeader(alias);
    if (!foldToCanonical.has(folded)) foldToCanonical.set(folded, name);
  }
}

function canonicalOf(header) {
  return foldToCanonical.get(foldHeader(header)) || null;
}

function valuesForHeaders(contrato, headers) {
  return headers.map((header) => {
    const direct = lookup(contrato, header);
    if (String(direct).length) return direct;
    const canonical = canonicalOf(header);
    if (canonical && canonical !== header) return lookup(contrato, canonical);
    return direct;
  });
}

function missingHeaders(headers) {
  return REQUIRED_HEADERS.filter((canonical) => !headers.some((header) => canonicalOf(header) === canonical));
}

const sheetId = process.argv[2] || process.env.SHEET_ID || "1TTrjf0DZxWkIacYTp7_vcRmTx2-8XrobIaPgIflnyG8";
const sheetTab = process.argv[3] || process.env.SHEET_TAB || "Folha1";
const contrato = JSON.parse(process.argv[4] || "{}");
const sheetIndexArg = process.argv[5];

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

let headers = (headerRes.data.values?.[0] || []).map((h) => String(h).replace(/\u00a0/g, " ").trim()).filter(Boolean);
if (!headers.length) headers = [...DEFAULT_HEADERS];

const missing = missingHeaders(headers);
if (missing.length) {
  headers = [...headers, ...missing];
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${sheetTab}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] },
  });
}

const row = valuesForHeaders(contrato, headers);
const rowNumber = Number.isFinite(Number(sheetIndexArg))
  ? Number(sheetIndexArg) + 2
  : null;

if (rowNumber && rowNumber >= 2) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${sheetTab}'!A${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
} else {
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `'${sheetTab}'!A:A`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "OVERWRITE",
    requestBody: { values: [row] },
  });
}

console.log("OK");
