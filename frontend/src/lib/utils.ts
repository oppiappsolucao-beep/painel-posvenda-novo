export const COLORS = {
  navy: "#1B1D6D",
  navy2: "#2E3192",
  wine: "#9B0033",
  wine2: "#C00040",
  grayBg: "#D4D4D4",
  grayText: "#64748b",
  palette: [
    "#1B1D6D", "#9B0033", "#2E3192", "#C00040", "#3B4A64", "#94A3B8",
    "#23267F", "#B00045", "#3A3F9F", "#C00040", "#42526E", "#A0AEC0",
  ],
};

export function moneyBr(v: number): string {
  const s = v.toFixed(2).replace(".", ",");
  const [int, dec] = s.split(",");
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${intFmt},${dec}`;
}

export function monthKeyNow(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${mm}/${now.getFullYear()}`;
}

const PT_MONTH_NUM: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, "março": 3, abril: 4, maio: 5,
  junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10,
  novembro: 11, dezembro: 12,
};

function extractMonthNumFromKey(monthKey: string): number | null {
  const s = String(monthKey).trim();
  const m = s.match(/^\s*(\d{1,2})\s*\/\s*\d{4}\s*$/);
  if (m) {
    const mm = parseInt(m[1], 10);
    if (mm >= 1 && mm <= 12) return mm;
  }
  const low = s.toLowerCase();
  for (const [nome, num] of Object.entries(PT_MONTH_NUM)) {
    if (low.includes(nome)) return num;
  }
  return null;
}

/** Normaliza "8/2026" / "Agosto/2026" → "08/2026" para alinhar com a planilha. */
export function normalizeMonthKey(monthKey: string): string {
  const s = String(monthKey || "").trim();
  const m = s.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
  if (m) {
    const mm = String(parseInt(m[1], 10)).padStart(2, "0");
    return `${mm}/${m[2]}`;
  }
  const monthNum = extractMonthNumFromKey(s);
  const yearMatch = s.match(/(\d{4})/);
  if (monthNum && yearMatch) {
    return `${String(monthNum).padStart(2, "0")}/${yearMatch[1]}`;
  }
  return s;
}

function monthKeySortValue(monthKey: string): number {
  const normalized = normalizeMonthKey(monthKey);
  const match = normalized.match(/^(\d{2})\/(\d{4})$/);
  if (!match) return 0;
  return parseInt(match[2], 10) * 100 + parseInt(match[1], 10);
}

export function pickBestMonthOption(meses: string[], preferred?: string): string {
  if (!meses.length) return monthKeyNow();
  const normalizedPreferred = normalizeMonthKey(preferred || monthKeyNow());
  const exact = meses.find((m) => normalizeMonthKey(m) === normalizedPreferred);
  if (exact) return exact;
  const sorted = [...meses].sort((a, b) => monthKeySortValue(a) - monthKeySortValue(b));
  return sorted[sorted.length - 1];
}

export function formatDateInput(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export const ESTADOS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export const RACAS_CANINA = [
  "Spitz Alemão", "Shih Tzu", "Maltês", "Teckel", "Dachshund", "Lulu da Pomerânia",
  "Yorkshire", "Bulldogue", "Bulldogue Francês", "Pug", "Biewer Terrier", "Chihuahua", "Outro",
];

export const RACAS_FELINA = ["Persa", "Maine Coon", "British Shorthair", "Outro"];

export const CIDADES = ["Campinas", "Indaiatuba", "Piracicaba", "Outro"];

export const UNIT_LABELS: Record<string, string> = {
  campinas: "Campinas",
  piracicaba: "Piracicaba",
  indaiatuba: "Indaiatuba",
};

export function defaultUnitFilter(unit?: string): string {
  if (unit && UNIT_LABELS[unit]) return UNIT_LABELS[unit];
  return "Todas";
}

export function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function isCpfComplete(value: string): boolean {
  return /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value.trim());
}

/** Máscara celular BR: (11) 98765-4321 */
export function formatPhoneBrInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function isPhoneBrComplete(value: string): boolean {
  return /^\(\d{2}\) \d{4,5}-\d{4}$/.test(value.trim());
}

/** Máscara data: DD/MM/AAAA */
export function formatDateBrInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function isDateBrComplete(value: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(value.trim());
}

/** Valor monetário: 4.500,00 */
export function formatMoneyInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  const formatted = (cents / 100).toFixed(2).replace(".", ",");
  const [intPart, decPart] = formatted.split(",");
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${intFmt},${decPart}`;
}

/** Cópia síncrona — funciona dentro do gesto de clique do usuário. */
export function copyToClipboardSync(text: string): boolean {
  if (!text) return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText =
      "position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;background:transparent;";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (copyToClipboardSync(text)) return true;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback abaixo
  }
  return copyToClipboardSync(text);
}
