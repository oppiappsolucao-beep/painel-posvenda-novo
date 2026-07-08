import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

export type UserRole = "operacao" | "financeiro";

export interface AuthUser {
  username: string;
  roles: UserRole[];
}

export async function login(username: string, password: string, role?: "financeiro") {
  const { data } = await api.post<AuthUser>("/auth/login", { username, password, role });
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

export interface StatusAssinaturaItem {
  id: number;
  sheetIndex: number;
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

export async function fetchContractPreview(sheetIndex: number) {
  const response = await api.get(`/dashboard/contracts/preview/${sheetIndex}`, {
    responseType: "blob",
    validateStatus: (s) => s < 500,
  });

  const contentType = String(response.headers["content-type"] ?? "");
  if (!contentType.includes("pdf")) {
    const text = await (response.data as Blob).text();
    try {
      const json = JSON.parse(text);
      throw new Error(json.error || "Erro ao carregar contrato.");
    } catch (e) {
      if (e instanceof Error && e.message !== "Erro ao carregar contrato.") throw e;
      throw new Error("Erro ao carregar contrato.");
    }
  }

  return response.data as Blob;
}

export async function saveContract(contrato: Record<string, string>) {
  const response = await api.post("/dashboard/contracts", contrato, {
    responseType: "blob",
    validateStatus: (s) => s < 500,
  });

  const contentType = String(response.headers["content-type"] ?? "");
  if (!contentType.includes("pdf")) {
    const text = await (response.data as Blob).text();
    try {
      const json = JSON.parse(text);
      throw new Error(json.error || "Erro ao salvar contrato.");
    } catch (e) {
      if (e instanceof Error && e.message !== "Erro ao salvar contrato.") throw e;
      throw new Error("Erro ao salvar contrato.");
    }
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
