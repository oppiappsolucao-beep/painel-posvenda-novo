import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { google } from "googleapis";
import { config, DEFAULT_HEADERS, SheetRow } from "../config.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const loadScript = join(__dirname, "../../scripts/load-sheet.mjs");

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

function getAuth() {
  if (!config.gcpClientEmail || !config.gcpPrivateKey) {
    throw new Error("Credenciais GCP não configuradas. Verifique backend/.env");
  }
  return new google.auth.JWT({
    email: config.gcpClientEmail,
    key: config.gcpPrivateKey,
    scopes: SCOPES,
  });
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

/** Carrega via subprocess no Windows (contorna erro SSL do Node/tsx) */
async function loadMainSheetWindows(): Promise<SheetRow[]> {
  const node = join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe");
  const { stdout } = await execFileAsync(
    node,
    ["--use-system-ca", loadScript],
    { maxBuffer: 30 * 1024 * 1024, encoding: "utf8", cwd: join(__dirname, "../..") },
  );
  return JSON.parse(stdout.trim() || "[]");
}

/** Carrega via API direta (Linux/Mac ou fallback) */
async function loadMainSheetDirect(): Promise<SheetRow[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: `'${config.sheetTab}'!A:ZZ`,
  });

  const values = res.data.values || [];
  if (values.length <= 1) return [];

  const headers = values[0].map((h) => String(h).replace(/\u00a0/g, " ").trim());
  const rows: SheetRow[] = [];

  for (let i = 1; i < values.length; i++) {
    const rowValues = values[i] as string[];
    const row: SheetRow = {};
    headers.forEach((h, idx) => {
      row[h] = rowValues[idx] ?? "";
    });
    if (Object.values(row).some((v) => String(v).trim())) rows.push(row);
  }
  return rows;
}

export async function loadMainSheet(): Promise<SheetRow[]> {
  if (process.platform === "win32") {
    return loadMainSheetWindows();
  }
  return loadMainSheetDirect();
}

async function ensureHeaders(): Promise<string[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: `'${config.sheetTab}'!1:1`,
  });

  const current = (res.data.values?.[0] || [])
    .map((h) => String(h).trim())
    .filter(Boolean);

  if (!current.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: `'${config.sheetTab}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [DEFAULT_HEADERS] },
    });
    return DEFAULT_HEADERS;
  }

  const missing = DEFAULT_HEADERS.filter((h) => !current.includes(h));
  if (missing.length) {
    const newHeaders = [...current, ...missing];
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: `'${config.sheetTab}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newHeaders] },
    });
    return newHeaders;
  }
  return current;
}

export async function saveContract(contrato: SheetRow): Promise<void> {
  if (process.platform === "win32") {
    await saveContractWindows(contrato);
    return;
  }
  const sheets = getSheets();
  const headers = await ensureHeaders();
  const row = headers.map((h) => contrato[h] ?? "");
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.sheetId,
    range: `'${config.sheetTab}'!A:A`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

async function saveContractWindows(contrato: SheetRow): Promise<void> {
  const node = join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe");
  const saveScript = join(__dirname, "../../scripts/save-contract.mjs");
  await execFileAsync(
    node,
    ["--use-system-ca", saveScript, JSON.stringify(contrato)],
    { maxBuffer: 5 * 1024 * 1024, encoding: "utf8", cwd: join(__dirname, "../..") },
  );
}

const DEMO_CITIES = ["campinas", "piracicaba", "indaiatuba"] as const;

function normCity(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function cityFromRow(row: SheetRow): string {
  const unidade = normCity(row["Unidade"] || "");
  const cidade = normCity(row["Cidade"] || "");
  for (const target of DEMO_CITIES) {
    if (unidade.includes(target) || cidade.includes(target)) return target;
  }
  return "";
}

async function loadSheetValues(): Promise<{ headers: string[]; rows: SheetRow[] }> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: `'${config.sheetTab}'!A:ZZ`,
  });

  const values = res.data.values || [];
  if (!values.length) return { headers: [], rows: [] };

  const headers = values[0].map((h) => String(h).replace(/\u00a0/g, " ").trim());
  const rows: SheetRow[] = [];

  for (let i = 1; i < values.length; i++) {
    const rowValues = values[i] as string[];
    const row: SheetRow = {};
    headers.forEach((h, idx) => {
      row[h] = rowValues[idx] ?? "";
    });
    if (Object.values(row).some((v) => String(v).trim())) rows.push(row);
  }

  return { headers, rows };
}

export async function pruneMainSheetToDemo(): Promise<{
  before: number;
  after: number;
  kept: Array<{ city: string; nome: string }>;
}> {
  const sheets = getSheets();
  const { headers, rows } = await loadSheetValues();

  if (!headers.length) {
    throw new Error("Planilha sem cabeçalho.");
  }

  const keptRows: SheetRow[] = [];
  const kept: Array<{ city: string; nome: string }> = [];

  for (const target of DEMO_CITIES) {
    const match = rows.find((row) => cityFromRow(row) === target);
    if (!match) {
      throw new Error(`Nenhum cliente encontrado para ${target}.`);
    }
    keptRows.push(match);
    kept.push({
      city: target,
      nome: String(match["Nome"] || "Sem nome"),
    });
  }

  const outputRows = keptRows.map((row) => headers.map((h) => row[h] ?? ""));

  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.sheetId,
    range: `'${config.sheetTab}'!A2:ZZ`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.sheetId,
    range: `'${config.sheetTab}'!A2`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: outputRows },
  });

  return { before: rows.length, after: keptRows.length, kept };
}
