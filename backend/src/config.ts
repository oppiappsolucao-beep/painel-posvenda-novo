import dotenv from "dotenv";

dotenv.config();

function parseOperUsers(raw: string | undefined): string[] {
  if (raw?.trim()) {
    return raw.split(",").map((u) => u.trim()).filter(Boolean);
  }
  return [
    "Piracicaba@skoobpet.com.br",
    "Campinas@skoobpet.com.br",
    "Indaiatuba@skoobpet.com.br",
  ];
}

/** Planilha única: Planilha SkoobPet (Campinas) */
export const config = {
  port: parseInt(
    process.env.PORT || (process.env.NODE_ENV === "production" ? "80" : "3001"),
    10,
  ),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  operUsers: parseOperUsers(process.env.OPER_USERS),
  operPass: process.env.OPER_PASS || "100316",
  finUser: process.env.FIN_USER || "Controle@skoobpet.com.br",
  finPass: process.env.FIN_PASS || "100316",
  gcpClientEmail: process.env.GCP_CLIENT_EMAIL || "",
  gcpPrivateKey: (process.env.GCP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  sheetId: process.env.SHEET_ID || "1TTrjf0DZxWkIacYTp7_vcRmTx2-8XrobIaPgIflnyG8",
  sheetTab: process.env.SHEET_TAB || "Folha1",
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
}

export type SheetRow = Record<string, string>;
