export function brlToFloat(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "boolean") return 0;

  let s = String(v).replace(/\u00a0/g, " ").trim();
  if (!s || ["nan", "none", "-"].includes(s.toLowerCase())) return 0;

  s = s.replace("R$", "").trim();
  s = s.replace(/[^0-9,.\-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

export function moneyBr(v: unknown): string {
  const n = brlToFloat(v);
  const s = n.toFixed(2).replace(".", ",");
  const [int, dec] = s.split(",");
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${intFmt},${dec}`;
}

export function norm(x: unknown): string {
  if (x === null || x === undefined) return "";
  return String(x).trim().toLowerCase();
}

export function isError(status: unknown): boolean {
  const s = norm(status);
  return s.includes("erro") || s.includes("atras") || s.includes("pendenc");
}

export function isCpfComplete(value: unknown): boolean {
  return /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(String(value || "").trim());
}

export function pickFirstExisting(
  columns: string[],
  candidates: string[],
): string | null {
  const exact = new Map(columns.map((c) => [c.replace(/\u00a0/g, " ").trim(), c]));
  const lower = new Map(columns.map((c) => [c.replace(/\u00a0/g, " ").trim().toLowerCase(), c]));

  for (const c of candidates) {
    const key = c.replace(/\u00a0/g, " ").trim();
    if (exact.has(key)) return exact.get(key)!;
    if (lower.has(key.toLowerCase())) return lower.get(key.toLowerCase())!;
  }
  return null;
}

export function limparNomeArquivo(texto: string): string {
  return (
    String(texto || "contrato")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúâêôãõç\s_-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "contrato"
  );
}

export function extractYearFromMonthKey(monthKey: string): string | null {
  const m = String(monthKey).trim().match(/(\d{4})$/);
  return m ? m[1] : null;
}

export function extractMonthNumFromMonthKey(monthKey: string): number | null {
  const s = String(monthKey).trim();
  const iso = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (iso) {
    const mm = parseInt(iso[2], 10);
    if (mm >= 1 && mm <= 12) return mm;
  }
  const m = s.match(/^\s*(\d{1,2})\s*\/\s*\d{4}\s*$/);
  if (m) {
    const mm = parseInt(m[1], 10);
    if (mm >= 1 && mm <= 12) return mm;
  }

  const meses: Record<string, number> = {
    janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5,
    junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10,
    novembro: 11, dezembro: 12,
  };
  const low = s.toLowerCase();
  for (const [nome, num] of Object.entries(meses)) {
    if (low.includes(nome)) return num;
  }
  return null;
}

export function monthLabelPt(monthNum: number): string {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return labels[monthNum - 1] || String(monthNum);
}

export function monthKeyFromDate(dateValue: unknown): string {
  const d = parseDate(dateValue);
  if (!d) return todayMonthKey();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${mm}/${d.getFullYear()}`;
}

export function todayMonthKey(): string {
  const now = todaySaoPaulo();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${mm}/${now.getFullYear()}`;
}

/** Normaliza "8/2026", "2026-08", "Agosto/2026" → "08/2026" para bater com a planilha e o filtro da UI. */
export function normalizeMonthKey(monthKey: string): string {
  const s = String(monthKey || "").trim();
  const iso = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (iso) {
    const mm = String(parseInt(iso[2], 10)).padStart(2, "0");
    return `${mm}/${iso[1]}`;
  }
  const m = s.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
  if (m) {
    const mm = String(parseInt(m[1], 10)).padStart(2, "0");
    return `${mm}/${m[2]}`;
  }
  const monthNum = extractMonthNumFromMonthKey(s);
  const yearMatch = s.match(/(\d{4})/);
  if (monthNum && yearMatch) {
    return `${String(monthNum).padStart(2, "0")}/${yearMatch[1]}`;
  }
  return s;
}

function yearFromDataCompra(row: Record<string, string>, dataCompraCol?: string | null): string | null {
  const dateCols = dataCompraCol
    ? [dataCompraCol]
    : ["Data Compra", "Data compra", "Data da compra"];
  for (const col of dateCols) {
    const val = row[col];
    if (!val) continue;
    const parsed = parseDate(val);
    if (parsed) return String(parsed.getFullYear());
  }
  return null;
}

/** Mês efetivo da linha: coluna Mês ou fallback pela Data Compra. */
export function getRowMonthKey(
  row: Record<string, string>,
  mesCol: string | null,
  dataCompraCol?: string | null,
): string {
  if (mesCol) {
    const raw = String(row[mesCol] || "").trim();
    if (raw) {
      const fromDate = parseDate(raw);
      if (fromDate) {
        const key = monthKeyFromDate(fromDate);
        if (/^\d{2}\/\d{4}$/.test(key)) return key;
      }
      const normalized = normalizeMonthKey(raw);
      if (/^\d{2}\/\d{4}$/.test(normalized)) return normalized;
      const monthNum = extractMonthNumFromMonthKey(raw);
      const year = extractYearFromMonthKey(raw) || yearFromDataCompra(row, dataCompraCol) || extractYearFromMonthKey(todayMonthKey());
      if (monthNum && year) {
        return `${String(monthNum).padStart(2, "0")}/${year}`;
      }
    }
  }
  const dateCols = dataCompraCol
    ? [dataCompraCol]
    : ["Data Compra", "Data compra", "Data da compra"];
  for (const col of dateCols) {
    const val = row[col];
    if (!val) continue;
    const normalized = normalizeMonthKey(monthKeyFromDate(parseDate(val)));
    if (/^\d{2}\/\d{4}$/.test(normalized)) return normalized;
  }
  return "";
}

function monthKeySortValue(monthKey: string): number {
  const normalized = normalizeMonthKey(monthKey);
  const m = normalized.match(/^(\d{2})\/(\d{4})$/);
  if (!m) return 0;
  return parseInt(m[2], 10) * 100 + parseInt(m[1], 10);
}

export function todaySaoPaulo(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

/** Serial de data Google Sheets/Excel → Date local (sem deslocar o dia por fuso). */
function sheetSerialToDate(serial: number): Date | null {
  const utc = new Date((serial - 25569) * 86400 * 1000);
  if (Number.isNaN(utc.getTime())) return null;
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

export function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;

  if (typeof v === "number" && Number.isFinite(v)) {
    const serial = Math.floor(v);
    if (serial >= 20000 && serial <= 60000) {
      const d = sheetSerialToDate(serial);
      if (d) return d;
    }
  }

  const s = String(v).replace(/\u00a0/g, " ").trim();
  if (!s || ["nan", "none"].includes(s.toLowerCase())) return null;

  if (/^\d{4,5}$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial >= 20000 && serial <= 60000) {
      const d = sheetSerialToDate(serial);
      if (d) return d;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [yyyy, mm, dd] = s.split("-").map((part) => parseInt(part, 10));
    const d = new Date(yyyy, mm - 1, dd);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (s.includes("-") && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (s.includes("/")) {
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/);
    if (br) {
      const dd = parseInt(br[1], 10);
      const mm = parseInt(br[2], 10);
      let year = parseInt(br[3], 10);
      if (year < 100) year += 2000;
      const d = new Date(year, mm - 1, dd);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateBr(d: Date | null): string {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function formatDateTimeBr(d: Date): string {
  const date = formatDateBr(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${date} ${hh}:${mi}:${ss}`;
}

export function countTodayAll(rows: Record<string, string>[], dateCol: string | null): number {
  if (!dateCol) return 0;
  const today = todaySaoPaulo();
  const todayStr = formatDateBr(today);
  return rows.filter((r) => {
    const d = parseDate(r[dateCol]);
    return d && formatDateBr(d) === todayStr;
  }).length;
}

export function countMonthAll(
  rows: Record<string, string>[],
  dateCol: string | null,
  selectedMonth: string,
): number {
  if (!dateCol) return 0;
  return rows.filter((r) => {
    const d = parseDate(r[dateCol]);
    if (!d) return false;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const key = `${mm}/${d.getFullYear()}`;
    return normalizeMonthKey(key) === normalizeMonthKey(selectedMonth);
  }).length;
}

export function groupCount(rows: Record<string, string>[], col: string): { name: string; total: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = String(r[col] || "Sem dado").trim() || "Sem dado";
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}

export function groupSum(
  rows: Record<string, string>[],
  groupCol: string,
  valueCol: string,
): { name: string; total: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = String(r[groupCol] || "Sem dado").trim() || "Sem dado";
    map.set(k, (map.get(k) || 0) + brlToFloat(r[valueCol]));
  }
  return [...map.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}

export function filterRows(
  rows: Record<string, string>[],
  mesCol: string | null,
  mes: string,
  unidadeCol: string | null,
  unidade: string,
  dataCompraCol?: string | null,
): Record<string, string>[] {
  let result = rows;
  if (mesCol && mes) {
    const target = normalizeMonthKey(mes);
    result = result.filter((r) => getRowMonthKey(r, mesCol, dataCompraCol) === target);
  }
  if (unidadeCol && unidade && unidade !== "Todas") {
    const targetUnit = unidade.trim().toLowerCase();
    result = result.filter((r) => {
      const fields = [unidadeCol, "Unidade", "Cidade", "Cidade do comprador"];
      return fields.some((col) => col && String(r[col] || "").trim().toLowerCase() === targetUnit);
    });
  }
  return result;
}

export function getUniqueMonths(
  rows: Record<string, string>[],
  mesCol: string | null,
  dataCompraCol?: string | null,
): string[] {
  if (!mesCol) return [todayMonthKey()];
  const set = new Set<string>();
  for (const r of rows) {
    const key = getRowMonthKey(r, mesCol, dataCompraCol);
    if (key) set.add(key);
  }
  const months = [...set]
    .map((m) => normalizeMonthKey(m))
    .filter((m, i, arr) => arr.indexOf(m) === i);
  const current = todayMonthKey();
  if (!months.some((m) => normalizeMonthKey(m) === current)) {
    months.push(current);
  }
  months.sort((a, b) => monthKeySortValue(a) - monthKeySortValue(b));
  return months.length ? months : [current];
}

export function isTodaysTestContractRow(row: Record<string, string>, today = todaySaoPaulo()): boolean {
  const dataCompra = String(row["Data Compra"] || "");
  const preenchimento = String(row["Data preenchimento"] || "");
  const fromToday =
    (parseDate(dataCompra) && formatDateBr(parseDate(dataCompra)) === formatDateBr(today)) ||
    (parseDate(preenchimento) && formatDateBr(parseDate(preenchimento)) === formatDateBr(today));
  if (!fromToday) return false;

  const nome = String(row["Nome"] || "").trim().toLowerCase();
  const email = String(row["E-mail"] || row["Email"] || "").trim().toLowerCase();
  const obs = String(row["Observações"] || row["Observacoes"] || "").toLowerCase();
  return (
    obs.includes("teste") ||
    email.includes("teste") ||
    nome.includes("ana clara mendes") ||
    nome.includes("filhote teste")
  );
}

export function getUniqueUnits(rows: Record<string, string>[], unidadeCol: string | null): string[] {
  if (!unidadeCol) return ["Todas"];
  const set = new Set<string>();
  for (const r of rows) {
    const u = String(r[unidadeCol] || "").trim();
    if (u) set.add(u);
  }
  return ["Todas", ...[...set].sort()];
}
