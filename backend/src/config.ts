import dotenv from "dotenv";

// .env do projeto prevalece sobre variáveis antigas do sistema (ex.: template sandbox errado).
dotenv.config({ override: true });

export interface AuthAccount {
  user: string;
  password: string;
}

export type UnitKey = "campinas" | "piracicaba" | "indaiatuba";

export interface UnitConfig {
  key: UnitKey;
  label: string;
  user: string;
  password: string;
  /** E-mail da loja para anexos, ZapSign e notificações (não é o login do painel). */
  storeEmail: string;
  sheetId: string;
  sheetName: string;
  sheetTab: string;
}

function operPassword(envKey: string, defaultPassword: string): string {
  return process.env[envKey] || defaultPassword;
}

function unitSheetId(envKey: string, fallback = ""): string {
  return process.env[envKey] || fallback;
}

function unitSheetName(envKey: string, defaultName: string): string {
  return process.env[envKey] || defaultName;
}

function unitStoreEmail(envKey: string, defaultEmail: string): string {
  return (process.env[envKey] || defaultEmail).trim();
}

const sharedSheetTab = process.env.SHEET_TAB || "Folha1";
const campinasSheetId =
  unitSheetId("SHEET_ID_CAMPINAS") ||
  process.env.SHEET_ID ||
  "1TTrjf0DZxWkIacYTp7_vcRmTx2-8XrobIaPgIflnyG8";

export const units: UnitConfig[] = [
  {
    key: "campinas",
    label: "Campinas",
    user: "campinas@skoobpet.com.br",
    password: operPassword("OPER_PASS_CAMPINAS", "skoob1234"),
    storeEmail: unitStoreEmail("STORE_EMAIL_CAMPINAS", "skoobpet@outlook.com"),
    sheetId: campinasSheetId,
    sheetName: unitSheetName("SHEET_NAME_CAMPINAS", "Planilha SkoobPet (Campinas)"),
    sheetTab: sharedSheetTab,
  },
  {
    key: "piracicaba",
    label: "Piracicaba",
    user: "piracicaba@skoobpet.com.br",
    password: operPassword("OPER_PASS_PIRACICABA", "skoob123"),
    storeEmail: unitStoreEmail("STORE_EMAIL_PIRACICABA", "skoobpetpiracicaba@outlook.com"),
    sheetId: campinasSheetId,
    sheetName: unitSheetName("SHEET_NAME_CAMPINAS", "Planilha SkoobPet (Campinas)"),
    sheetTab: sharedSheetTab,
  },
  {
    key: "indaiatuba",
    label: "Indaiatuba",
    user: "indaiatuba@skoobpet.com.br",
    password: operPassword("OPER_PASS_INDAIATUBA", "skoob12345"),
    storeEmail: unitStoreEmail("STORE_EMAIL_INDAIATUBA", "skoobpetindaiatuba@outlook.com"),
    sheetId: campinasSheetId,
    sheetName: unitSheetName("SHEET_NAME_CAMPINAS", "Planilha SkoobPet (Campinas)"),
    sheetTab: sharedSheetTab,
  },
];

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function getUnitByEmail(email: string): UnitConfig | undefined {
  const normalized = normalizeEmail(email);
  return units.find((unit) => normalizeEmail(unit.user) === normalized);
}

export function getUnitByKey(key: UnitKey): UnitConfig | undefined {
  return units.find((unit) => unit.key === key);
}

/** E-mail fixo da loja para assinatura ZapSign e referência nas configurações. */
export function getCanonicalUnitStoreEmail(unitKey: UnitKey): string {
  return getUnitByKey(unitKey)?.storeEmail?.trim() || "";
}

/** @deprecated Use getCanonicalUnitStoreEmail — ignora e-mail digitado no contrato. */
export function resolveUnitStoreEmail(unitKey: UnitKey, _contrato?: SheetRow): string {
  return getCanonicalUnitStoreEmail(unitKey) || "contato@skoobpet.com.br";
}

export function normalizeUnitText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function unitKeyFromLabel(label: string): UnitKey | null {
  const normalized = normalizeUnitText(label);
  if (!normalized) return null;
  const unit = units.find(
    (u) => normalizeUnitText(u.key) === normalized || normalizeUnitText(u.label) === normalized,
  );
  return unit?.key ?? null;
}

/** Linhas antigas podem estar sem Unidade; usa loja, cidade-unidade e preenchimento. */
export function unitKeyFromSheetRow(row: SheetRow, fallback: UnitKey = "campinas"): UnitKey {
  const fromUnidade = unitKeyFromLabel(String(row["Unidade"] || ""));
  if (fromUnidade) return fromUnidade;

  const storeEmail = normalizeEmail(String(row["E-mail Loja"] || row["Email Loja"] || ""));
  if (storeEmail) {
    const byStore = units.find((unit) => normalizeEmail(unit.storeEmail) === storeEmail);
    if (byStore) return byStore.key;
  }

  const fromCidade = unitKeyFromLabel(String(row["Cidade"] || ""));
  if (fromCidade) return fromCidade;

  return fallback;
}

export function getConfiguredUnits(): UnitConfig[] {
  return units;
}

export function getSharedSheetUnit(): UnitConfig {
  const campinas = getUnitByKey("campinas");
  if (!campinas) throw new Error("Unidade Campinas não configurada.");
  return campinas;
}

export interface ResolvedUnitConfig extends UnitConfig {
  resolvedSheetId: string;
  resolvedSheetTab: string;
}

/** @deprecated use units — mantido para compatibilidade interna */
export const config = {
  port: parseInt(
    process.env.PORT || (process.env.NODE_ENV === "production" ? "80" : "3001"),
    10,
  ),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  operAccounts: units.map((unit) => ({ user: unit.user, password: unit.password })),
  finAccount: {
    user: (process.env.FIN_USER || "controle@skoobpet.com.br").trim().toLowerCase(),
    password: process.env.FIN_PASS || "skoobdiretoria123",
  },
  /** Acesso desenvolvedor — sem 2FA, todas as unidades (validação em campo). */
  devAccount: {
    user: (process.env.DEV_USER || "dev@oppitech.com.br").trim().toLowerCase(),
    password: process.env.DEV_PASS || "100316*Rahi",
    enabled: process.env.DEV_BYPASS_ENABLED !== "false",
  },
  gcpClientEmail: process.env.GCP_CLIENT_EMAIL || "",
  gcpPrivateKey: (process.env.GCP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  units,
  /** Planilha Campinas — retrocompatível com SHEET_ID */
  sheetId: campinasSheetId,
  sheetTab: sharedSheetTab,
  twoFactorEmail: (process.env.TWO_FA_EMAIL || "contato@skoobpet.com.br").trim().toLowerCase(),
  twoFactorEnabled: process.env.TWO_FA_ENABLED !== "false",
  smtp: {
    host: (process.env.SMTP_HOST || "smtp.hostinger.com").trim(),
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: process.env.SMTP_SECURE !== "false",
    user: (process.env.SMTP_USER || "").trim(),
    pass: process.env.SMTP_PASS || "",
    from: (process.env.SMTP_FROM || process.env.SMTP_USER || "contato@skoobpet.com.br").trim(),
  },
};

export const DEFAULT_HEADERS = [
  "Nome", "Telefone", "CPF", "E-mail", "Data Compra", "Mês", "Raça", "Sexo", "Cor",
  "Pelagem", "Endereço", "Número", "Complemento", "CEP", "Estado", "Cidade", "Bairro", "RG",
  "Valor Filhote", "Valor por extenso", "Forma de pagamento", "Quantidade de parcelas",
  "Vendedora", "Nome do animal", "Espécie", "Microchip", "Nascimento filhote",
  "Observações", "Data preenchimento", "Unidade",
];

export const SIGNATURE_HEADERS = [
  "Link Assinatura",
  "Link Assinatura Loja",
  "Data Envio",
  "Documento ZapSign",
  "Data Assinatura Cliente",
  "Data Assinatura Loja",
  "Status Assinatura",
  "E-mail Loja",
];

export const CONTRACT_SHEET_HEADERS = [...DEFAULT_HEADERS, ...SIGNATURE_HEADERS];

export type UserRole = "operacao" | "financeiro";

export interface AuthPayload {
  username: string;
  roles: UserRole[];
  unit?: UnitKey;
}

export type SheetRow = Record<string, string>;

export interface LoadedRow {
  data: SheetRow;
  unitKey: UnitKey;
  sheetIndex: number;
}
