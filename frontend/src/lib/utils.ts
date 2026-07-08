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
