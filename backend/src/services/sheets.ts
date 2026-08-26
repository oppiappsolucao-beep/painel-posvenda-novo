import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { google } from "googleapis";
import {
  AuthPayload,
  config,
  CONTRACT_SHEET_HEADERS,
  getSharedSheetUnit,
  getUnitByEmail,
  getUnitByKey,
  LoadedRow,
  ResolvedUnitConfig,
  SheetRow,
  UnitConfig,
  unitKeyFromLabel,
  unitKeyFromSheetRow,
  UnitKey,
} from "../config.js";
import {
  hydrateCanonicalKeys,
  missingCanonicalHeaders,
  valuesForSheetHeaders,
} from "./sheetHeaders.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const loadScript = join(__dirname, "../../scripts/load-sheet.mjs");
const saveScript = join(__dirname, "../../scripts/save-contract.mjs");

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

function getDrive() {
  return google.drive({ version: "v3", auth: getAuth() });
}

const resolvedSheetCache = new Map<string, ResolvedUnitConfig>();

const SHEET_ROWS_CACHE_TTL_MS = 45_000;
let sheetRowsCache: { loadedAt: number; rows: LoadedRow[] } | null = null;

export function invalidateSheetRowsCache(): void {
  sheetRowsCache = null;
}

const TAB_CANDIDATES = ["Folha1", "Página1", "Pagina1"];

async function resolveSheetTab(sheetId: string, preferredTab: string): Promise<string> {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabs = (meta.data.sheets || [])
    .map((sheet) => sheet.properties?.title)
    .filter((title): title is string => Boolean(title));

  if (tabs.includes(preferredTab)) return preferredTab;
  for (const candidate of TAB_CANDIDATES) {
    if (tabs.includes(candidate)) return candidate;
  }
  return tabs[0] || preferredTab;
}

async function findSheetIdByName(name: string, unitKey: UnitKey): Promise<string> {
  const drive = getDrive();
  const escapedName = name.replace(/'/g, "\\'");
  const exact = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.spreadsheet' and name='${escapedName}'`,
    fields: "files(id, name)",
    pageSize: 5,
  });
  const exactMatch = exact.data.files?.[0];
  if (exactMatch?.id) return exactMatch.id;

  const fuzzy = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet'",
    fields: "files(id, name)",
    pageSize: 100,
  });
  const files = fuzzy.data.files || [];
  const normalizedTarget = name.trim().toLowerCase();
  const keyword = unitKey.toLowerCase();

  const byKeywordAndBrand = files.find((file) => {
    const sheetName = String(file.name || "").trim().toLowerCase();
    return sheetName.includes(keyword) && (sheetName.includes("skoob") || sheetName.includes("planilha"));
  });
  if (byKeywordAndBrand?.id) return byKeywordAndBrand.id;

  const byFullName = files.find((file) =>
    String(file.name || "").trim().toLowerCase().includes(normalizedTarget),
  );
  if (byFullName?.id) return byFullName.id;

  const byKeyword = files.find((file) =>
    String(file.name || "").trim().toLowerCase().includes(keyword),
  );
  if (byKeyword?.id) return byKeyword.id;

  throw new Error(
    `Planilha de ${unitKey} não encontrada (${name}). Compartilhe a planilha com ${config.gcpClientEmail} ou defina SHEET_ID_${unitKey.toUpperCase()} no EasyPanel.`,
  );
}

export async function resolveUnitSheet(unit: UnitConfig): Promise<ResolvedUnitConfig> {
  const shared = getSharedSheetUnit();
  const cached = resolvedSheetCache.get("shared");
  if (cached) {
    return { ...unit, resolvedSheetId: cached.resolvedSheetId, resolvedSheetTab: cached.resolvedSheetTab };
  }

  const resolvedSheetId = shared.sheetId.trim() || await findSheetIdByName(shared.sheetName, shared.key);
  const resolvedSheetTab = await resolveSheetTab(resolvedSheetId, shared.sheetTab);
  const resolvedShared = { ...shared, resolvedSheetId, resolvedSheetTab };
  resolvedSheetCache.set("shared", resolvedShared);
  return { ...unit, resolvedSheetId, resolvedSheetTab };
}

function assertUnitSheet(unit: ResolvedUnitConfig): void {
  if (!unit.resolvedSheetId.trim()) {
    throw new Error(`Planilha não configurada para ${unit.label}.`);
  }
}

function withUnitLabel(row: SheetRow, unit: UnitConfig): SheetRow {
  const fromRow = String(row["Unidade"] || "").trim();
  return {
    ...row,
    Unidade: fromRow || unit.label,
  };
}

function valuesForHeaders(contrato: SheetRow, headers: string[]): string[] {
  return valuesForSheetHeaders(contrato, headers);
}

function isBlankSheetRow(row: SheetRow): boolean {
  return !Object.values(row).some((v) => String(v || "").trim());
}

function toLoadedRows(rows: SheetRow[]): LoadedRow[] {
  return rows.flatMap((data, sheetIndex) => {
    if (isBlankSheetRow(data)) return [];
    const unitKey = unitKeyFromSheetRow(data, "campinas");
    const unit = getUnitByKey(unitKey);
    return [{
      data: withUnitLabel(data, unit || getSharedSheetUnit()),
      unitKey,
      sheetIndex,
    }];
  });
}

function parseSheetValues(values: string[][]): { headers: string[]; rows: SheetRow[] } {
  if (!values.length) return { headers: [], rows: [] };

  const headers = values[0].map((h) => String(h).replace(/\u00a0/g, " ").trim());
  const rows: SheetRow[] = [];

  for (let i = 1; i < values.length; i++) {
    const rowValues = values[i] as string[];
    const row: SheetRow = {};
    headers.forEach((h, idx) => {
      row[h] = rowValues[idx] ?? "";
    });
    rows.push(hydrateCanonicalKeys(row));
  }

  return { headers, rows };
}

let sheetWriteChain: Promise<void> = Promise.resolve();

function withSheetWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = sheetWriteChain.then(fn, fn);
  sheetWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function loadSheetWindows(unit: ResolvedUnitConfig): Promise<SheetRow[]> {
  assertUnitSheet(unit);
  const node = join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe");
  const { stdout } = await execFileAsync(
    node,
    ["--use-system-ca", loadScript, unit.resolvedSheetId, unit.resolvedSheetTab],
    { maxBuffer: 30 * 1024 * 1024, encoding: "utf8", cwd: join(__dirname, "../..") },
  );
  return JSON.parse(stdout.trim() || "[]");
}

async function loadSheetDirect(unit: ResolvedUnitConfig): Promise<SheetRow[]> {
  assertUnitSheet(unit);
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: unit.resolvedSheetId,
    range: `'${unit.resolvedSheetTab}'!A:ZZ`,
  });

  const { rows } = parseSheetValues(res.data.values || []);
  return rows;
}

export async function loadUnitSheet(unit: UnitConfig): Promise<SheetRow[]> {
  const resolved = await resolveUnitSheet(unit);
  if (process.platform === "win32") {
    return loadSheetWindows(resolved);
  }
  return loadSheetDirect(resolved);
}

export async function loadUnitRows(unit: UnitConfig): Promise<LoadedRow[]> {
  const rows = await loadUnitSheet(unit);
  return toLoadedRows(rows).filter((item) => item.unitKey === unit.key);
}

export async function loadAllUnitRows(): Promise<LoadedRow[]> {
  const now = Date.now();
  if (sheetRowsCache && now - sheetRowsCache.loadedAt < SHEET_ROWS_CACHE_TTL_MS) {
    return sheetRowsCache.rows;
  }

  const shared = getSharedSheetUnit();
  const rows = toLoadedRows(await loadUnitSheet(shared));
  sheetRowsCache = { loadedAt: now, rows };
  return rows;
}

export async function loadAllUnitRowsWithWarnings(): Promise<{ rows: LoadedRow[]; warnings: string[] }> {
  try {
    const rows = await loadAllUnitRows();
    return { rows, warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Nenhuma planilha carregada. Verifique SHEET_ID_CAMPINAS e credenciais GCP (GCP_CLIENT_EMAIL / GCP_PRIVATE_KEY). Detalhes: ${message}`,
    );
  }
}

export async function loadRowsForUser(user: AuthPayload): Promise<LoadedRow[]> {
  if (user.roles.includes("financeiro")) {
    return loadAllUnitRows();
  }

  const unitKey = user.unit || getUnitByEmail(user.username)?.key;
  if (!unitKey) {
    throw new Error("Unidade não configurada para este usuário.");
  }

  const unit = getUnitByKey(unitKey);
  if (!unit) {
    throw new Error("Unidade inválida.");
  }

  return loadUnitRows(unit);
}

/** @deprecated use loadRowsForUser */
export async function loadMainSheet(): Promise<SheetRow[]> {
  const campinas = getUnitByKey("campinas");
  if (!campinas) return [];
  const rows = await loadUnitSheet(campinas);
  return rows.map((row) => withUnitLabel(row, campinas));
}

async function ensureHeaders(unit: ResolvedUnitConfig): Promise<string[]> {
  assertUnitSheet(unit);
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: unit.resolvedSheetId,
    range: `'${unit.resolvedSheetTab}'!1:1`,
  });

  const current = (res.data.values?.[0] || [])
    .map((h) => String(h).replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  if (!current.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: unit.resolvedSheetId,
      range: `'${unit.resolvedSheetTab}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [CONTRACT_SHEET_HEADERS] },
    });
    return CONTRACT_SHEET_HEADERS;
  }

  const missing = missingCanonicalHeaders(current);
  if (missing.length) {
    const newHeaders = [...current, ...missing];
    await sheets.spreadsheets.values.update({
      spreadsheetId: unit.resolvedSheetId,
      range: `'${unit.resolvedSheetTab}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newHeaders] },
    });
    return newHeaders;
  }
  return current;
}

export async function saveContractForUser(contrato: SheetRow, user: AuthPayload): Promise<number> {
  const unitKey =
    user.unit ||
    unitKeyFromLabel(String(contrato["Unidade"] || "")) ||
    getUnitByEmail(user.username)?.key;
  if (!unitKey) {
    throw new Error("Unidade não configurada para salvar contrato.");
  }

  const unit = getUnitByKey(unitKey);
  if (!unit) {
    throw new Error("Unidade inválida.");
  }

  return saveContract(contrato, unit);
}

export async function saveContract(contrato: SheetRow, unit: UnitConfig): Promise<number> {
  return withSheetWrite(async () => {
    const payload: SheetRow = {
      ...contrato,
      Unidade: unit.label,
    };
    const resolved = await resolveUnitSheet(unit);
    const { rows } = await loadSheetValues(resolved);
    let lastUsed = -1;
    for (let i = 0; i < rows.length; i++) {
      if (!isBlankSheetRow(rows[i])) lastUsed = i;
    }
    const sheetIndex = lastUsed + 1;

    if (process.platform === "win32") {
      await saveContractWindows(payload, resolved, sheetIndex);
      invalidateSheetRowsCache();
      return sheetIndex;
    }

    assertUnitSheet(resolved);
    const sheets = getSheets();
    const headers = await ensureHeaders(resolved);
    const row = valuesForHeaders(payload, headers);
    const rowNumber = sheetIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: resolved.resolvedSheetId,
      range: `'${resolved.resolvedSheetTab}'!A${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
    invalidateSheetRowsCache();
    return sheetIndex;
  });
}

export async function updateContractRow(
  unitKey: UnitKey,
  sheetIndex: number,
  updates: SheetRow,
): Promise<void> {
  await withSheetWrite(async () => {
    const unit = getUnitByKey(unitKey);
    if (!unit) throw new Error("Unidade inválida.");

    const resolved = await resolveUnitSheet(unit);
    assertUnitSheet(resolved);
    const headers = await ensureHeaders(resolved);
    const { rows } = await loadSheetValues(resolved);
    if (sheetIndex < 0) {
      throw new Error("Contrato não encontrado na planilha.");
    }
    const existing = rows[sheetIndex] || {};
    if (rows[sheetIndex] && !isBlankSheetRow(existing) && unitKeyFromSheetRow(existing, "campinas") !== unitKey) {
      throw new Error("Contrato não encontrado na planilha.");
    }

    const merged = {
      ...existing,
      ...updates,
      Unidade: existing["Unidade"] || updates["Unidade"] || unit.label,
    };
    const rowNumber = sheetIndex + 2;
    const values = [valuesForHeaders(merged, headers)];

    const sheets = getSheets();
    await sheets.spreadsheets.values.update({
      spreadsheetId: resolved.resolvedSheetId,
      range: `'${resolved.resolvedSheetTab}'!A${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
    invalidateSheetRowsCache();
  });
}

async function saveContractWindows(
  contrato: SheetRow,
  unit: ResolvedUnitConfig,
  sheetIndex: number,
): Promise<void> {
  assertUnitSheet(unit);
  const node = join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe");
  await execFileAsync(
    node,
    [
      "--use-system-ca",
      saveScript,
      unit.resolvedSheetId,
      unit.resolvedSheetTab,
      JSON.stringify(contrato),
      String(sheetIndex),
    ],
    { maxBuffer: 5 * 1024 * 1024, encoding: "utf8", cwd: join(__dirname, "../..") },
  );
}

export async function getContractRow(unitKey: UnitKey, sheetIndex: number): Promise<SheetRow | null> {
  const unit = getUnitByKey(unitKey);
  if (!unit) return null;

  const rows = await loadUnitSheet(unit);
  const row = rows[sheetIndex];
  if (!row || isBlankSheetRow(row)) return null;
  if (unitKeyFromSheetRow(row, "campinas") !== unitKey) return null;
  return withUnitLabel(row, unit);
}

export async function deleteContractRows(unitKey: UnitKey, sheetIndices: number[]): Promise<number> {
  const unit = getUnitByKey(unitKey);
  if (!unit) throw new Error("Unidade inválida.");

  const resolved = await resolveUnitSheet(unit);
  assertUnitSheet(resolved);
  const { rows } = await loadSheetValues(resolved);
  const unique = [...new Set(sheetIndices.filter((i) => Number.isFinite(i) && i >= 0))]
    .filter((sheetIndex) => rows[sheetIndex] && unitKeyFromSheetRow(rows[sheetIndex], "campinas") === unitKey);
  if (!unique.length) return 0;

  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: resolved.resolvedSheetId });
  const tab = meta.data.sheets?.find((s) => s.properties?.title === resolved.resolvedSheetTab);
  const sheetGid = tab?.properties?.sheetId;
  if (sheetGid == null) throw new Error(`Aba "${resolved.resolvedSheetTab}" não encontrada.`);

  const requests = unique
    .sort((a, b) => b - a)
    .map((sheetIndex) => ({
      deleteDimension: {
        range: {
          sheetId: sheetGid,
          dimension: "ROWS" as const,
          startIndex: sheetIndex + 1,
          endIndex: sheetIndex + 2,
        },
      },
    }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: resolved.resolvedSheetId,
    requestBody: { requests },
  });

  invalidateSheetRowsCache();
  return unique.length;
}

async function loadSheetValues(unit: ResolvedUnitConfig): Promise<{ headers: string[]; rows: SheetRow[] }> {
  assertUnitSheet(unit);
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: unit.resolvedSheetId,
    range: `'${unit.resolvedSheetTab}'!A:ZZ`,
  });
  return parseSheetValues(res.data.values || []);
}

export async function pruneUnitSheetToDemo(unit: UnitConfig): Promise<{
  unitKey: UnitKey;
  label: string;
  sheetName: string;
  before: number;
  after: number;
  kept: Array<{ city: string; nome: string }>;
  missing: string[];
}> {
  const resolved = await resolveUnitSheet(unit);
  assertUnitSheet(resolved);
  const sheets = getSheets();
  const { headers, rows } = await loadSheetValues(resolved);

  if (!headers.length) {
    throw new Error(`Planilha ${unit.label} sem cabeçalho.`);
  }

  const keptRows: SheetRow[] = [];
  const kept: Array<{ city: string; nome: string }> = [];
  const missing: string[] = [];

  const matchIndex = rows.findIndex((row) => {
    const label = normCity(row["Unidade"] || row["Cidade"] || unit.label);
    return label.includes(unit.key);
  });

  if (matchIndex < 0 && rows.length > 0) {
    keptRows.push(rows[0]);
    kept.push({ city: unit.key, nome: String(rows[0]["Nome"] || "Sem nome") });
  } else if (matchIndex >= 0) {
    keptRows.push(rows[matchIndex]);
    kept.push({ city: unit.key, nome: String(rows[matchIndex]["Nome"] || "Sem nome") });
  } else {
    missing.push(unit.key);
  }

  const outputRows = keptRows.map((row) => headers.map((h) => row[h] ?? ""));

  await sheets.spreadsheets.values.clear({
    spreadsheetId: resolved.resolvedSheetId,
    range: `'${resolved.resolvedSheetTab}'!A2:ZZ`,
  });

  if (outputRows.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: resolved.resolvedSheetId,
      range: `'${resolved.resolvedSheetTab}'!A2`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: outputRows },
    });
  }

  return {
    unitKey: unit.key,
    label: unit.label,
    sheetName: unit.sheetName,
    before: rows.length,
    after: keptRows.length,
    kept,
    missing,
  };
}

export async function pruneAllSheetsToDemo(): Promise<Array<Awaited<ReturnType<typeof pruneUnitSheetToDemo>>>> {
  return [await pruneUnitSheetToDemo(getSharedSheetUnit())];
}

/** @deprecated use pruneAllSheetsToDemo */
export async function pruneMainSheetToDemo() {
  const campinas = getUnitByKey("campinas");
  if (!campinas) throw new Error("Campinas não configurada.");
  const result = await pruneUnitSheetToDemo(campinas);
  return {
    before: result.before,
    after: result.after,
    kept: result.kept,
    missing: result.missing,
  };
}

function normCity(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
