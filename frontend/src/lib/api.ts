import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

async function readBlobError(data: Blob): Promise<string> {
  const text = await data.text();
  try {
    const json = JSON.parse(text) as { error?: string };
    return json.error || text || "Erro na requisição.";
  } catch {
    return text || "Erro na requisição.";
  }
}

export type UserRole = "operacao" | "financeiro";
export type UnitKey = "campinas" | "piracicaba" | "indaiatuba";

export interface AuthUser {
  username: string;
  roles: UserRole[];
  unit?: UnitKey;
}

export interface LoginPending2fa {
  requires2fa: true;
  challengeId: string;
  message: string;
}

export type LoginResult = AuthUser | LoginPending2fa;

export function isLoginPending2fa(result: LoginResult): result is LoginPending2fa {
  return "requires2fa" in result && result.requires2fa === true;
}

export async function login(username: string, password: string, role?: "financeiro") {
  try {
    const { data } = await api.post<LoginResult>("/auth/login", { username, password, role });
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(err.response?.data?.error || "Não foi possível entrar.");
    }
    throw err;
  }
}

export async function verify2fa(challengeId: string, code: string) {
  try {
    const { data } = await api.post<AuthUser>("/auth/verify-2fa", { challengeId, code });
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(err.response?.data?.error || "Código inválido.");
    }
    throw err;
  }
}

export interface LockedAccount {
  email: string;
  unitLabel: string;
  attempts: number;
  lockedAt: string;
}

export async function fetchLockedAccounts() {
  const { data } = await api.get<{ items: LockedAccount[] }>("/auth/locked-accounts");
  return data.items;
}

export async function unlockAccount(email: string) {
  const { data } = await api.post<{ ok: boolean; message: string }>("/auth/unlock-account", { email });
  return data;
}

export async function logout() {
  await api.post("/auth/logout");
}

export async function getMe() {
  const { data } = await api.get<AuthUser>("/auth/me");
  return data;
}

export async function fetchOperacao(mes: string, unidade: string) {
  const { data } = await api.get("/dashboard/operacao", { params: { mes, unidade } });
  return data;
}

export async function fetchFinanceiro(mes: string, unidade: string) {
  const { data } = await api.get("/dashboard/financeiro", { params: { mes, unidade } });
  return data;
}

export async function fetchVisaoGeral(mes: string, unidade: string) {
  const { data } = await api.get("/dashboard/visao-geral", { params: { mes, unidade } });
  return data;
}

export type SignatarioStatus = "assinado" | "pendente" | "aguardando" | "nao_enviado";

export interface SignatarioItem {
  papel: string;
  nome: string;
  email: string;
  status: SignatarioStatus;
  statusLabel: string;
  assinadoEm: string;
  linkAssinatura?: string;
}

export interface SignatureProgress {
  signatarios: SignatarioItem[];
  progresso: number;
}

export interface StatusAssinaturaItem {
  id: number;
  sheetIndex: number;
  unitKey: UnitKey;
  nome: string;
  identificador: string;
  status: "assinado" | "pendente";
  statusLabel: string;
  disparoEm: string;
  atualizadoEm: string;
  dataCompra: string;
  linkAssinatura: string;
  email: string;
  telefone: string;
  assinatura: SignatureProgress;
}

export interface StatusAssinaturaResponse {
  total: number;
  resumo: { assinados: number; pendentes: number };
  items: StatusAssinaturaItem[];
}

export async function fetchStatusAssinatura(params: {
  nome?: string;
  dataInicio?: string;
  dataFim?: string;
  status?: string;
}) {
  const { data } = await api.get<StatusAssinaturaResponse>("/dashboard/status-assinatura", { params });
  return data;
}

export async function fetchContractPreview(unitKey: UnitKey, sheetIndex: number) {
  const response = await api.get(`/dashboard/contracts/preview/${unitKey}/${sheetIndex}`, {
    responseType: "blob",
    validateStatus: () => true,
  });

  const contentType = String(response.headers["content-type"] ?? "");
  if (response.status >= 400 || !contentType.includes("pdf")) {
    throw new Error(await readBlobError(response.data as Blob));
  }

  return response.data as Blob;
}

export async function saveContract(contrato: Record<string, string>) {
  const response = await api.post("/dashboard/contracts", contrato, {
    responseType: "blob",
    validateStatus: () => true,
  });

  const contentType = String(response.headers["content-type"] ?? "");
  if (response.status >= 400 || !contentType.includes("pdf")) {
    throw new Error(await readBlobError(response.data as Blob));
  }

  const disposition = response.headers["content-disposition"] as string | undefined;
  let filename = "contrato.pdf";
  const match = disposition?.match(/filename="(.+)"/);
  if (match) filename = match[1];

  const url = URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
