import dotenv from "dotenv";

dotenv.config();

export interface AuthAccount {
  user: string;
  password: string;
}

function operAccount(user: string, envKey: string, defaultPassword: string): AuthAccount {
  return {
    user,
    password: process.env[envKey] || defaultPassword,
  };
}

/** Planilha única: Planilha SkoobPet (Campinas) */
export const config = {
  port: parseInt(
    process.env.PORT || (process.env.NODE_ENV === "production" ? "80" : "3001"),
    10,
  ),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  operAccounts: [
    operAccount("Piracicaba@skoobpet.com.br", "OPER_PASS_PIRACICABA", "skoob123"),
    operAccount("Campinas@skoobpet.com.br", "OPER_PASS_CAMPINAS", "skoob1234"),
    operAccount("Indaiatuba@skoobpet.com.br", "OPER_PASS_INDAIATUBA", "skoob12345"),
  ],
  finAccount: {
    user: process.env.FIN_USER || "Controle@skoobpet.com.br",
    password: process.env.FIN_PASS || "skoobdiretoria123",
  },
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
