import dotenv from "dotenv";

dotenv.config();

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
    sheetId: campinasSheetId,
    sheetName: unitSheetName("SHEET_NAME_CAMPINAS", "Planilha SkoobPet (Campinas)"),
    sheetTab: sharedSheetTab,
  },
  {
    key: "piracicaba",
    label: "Piracicaba",
    user: "piracicaba@skoobpet.com.br",
    password: operPassword("OPER_PASS_PIRACICABA", "skoob123"),
    sheetId: unitSheetId("SHEET_ID_PIRACICABA"),
    sheetName: unitSheetName("SHEET_NAME_PIRACICABA", "Planilha SkoobPet (Piracicaba)"),
    sheetTab: sharedSheetTab,
  },
  {
    key: "indaiatuba",
    label: "Indaiatuba",
    user: "indaiatuba@skoobpet.com.br",
    password: operPassword("OPER_PASS_INDAIATUBA", "skoob12345"),
    sheetId: unitSheetId("SHEET_ID_INDAIATUBA"),
    sheetName: unitSheetName("SHEET_NAME_INDAIATUBA", "Planilha SkoobPet (Indaiatuba)"),
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

export function getConfiguredUnits(): UnitConfig[] {
  return units;
}

export interface ResolvedUnitConfig extends UnitConfig {
  resolvedSheetId: string;
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
  gcpClientEmail: process.env.GCP_CLIENT_EMAIL || "",
  gcpPrivateKey: (process.env.GCP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  units,
  /** Planilha Campinas — retrocompatível com SHEET_ID */
  sheetId: campinasSheetId,
  sheetTab: sharedSheetTab,
};

export const DEFAULT_HEADERS = [
  "Nome", "Telefone", "CPF", "E-mail", "Data Compra", "Mês", "Raça", "Sexo", "Cor",
  "Pelagem", "Endereço", "Número", "Complemento", "CEP", "Estado", "Cidade", "RG",
  "Valor Filhote", "Valor por extenso", "Forma de pagamento", "Quantidade de parcelas",
  "Vendedora", "Nome do animal", "Espécie", "Microchip", "Nascimento filhote",
  "Observações", "Data preenchimento", "Unidade",
];

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
