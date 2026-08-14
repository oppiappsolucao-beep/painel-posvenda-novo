import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

function throwApiError(err: unknown, fallback: string): never {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const msg = (err.response?.data as { error?: string } | undefined)?.error;
    if (status === 401) {
      throw new Error("Sessão expirada. Entre novamente pelo login Controle (Financeiro).");
    }
    throw new Error(msg || fallback);
  }
  throw err instanceof Error ? err : new Error(fallback);
}

async function readBlobError(data: Blob): Promise<string> {
  const text = await data.text();
  try {
    const json = JSON.parse(text) as { error?: string };
    return json.error || text || "Erro na requisição.";
  } catch {
    return text || "Erro na requisição.";
  }
}

export interface HealthInfo {
  ok: boolean;
  version: string;
  build: string | null;
}

export async function fetchHealth(): Promise<HealthInfo> {
  const { data } = await axios.get<HealthInfo>("/api/health");
  return data;
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

export interface Employee {
  id: number;
  name: string;
  unitKey: UnitKey;
  unitLabel: string;
  active: boolean;
  createdAt: string;
}

export async function fetchEmployees(unit?: string, includeInactive = false) {
  const params: Record<string, string> = {};
  if (unit) params.unit = unit;
  if (includeInactive) params.includeInactive = "true";
  const { data } = await api.get<{ items: Employee[] }>("/employees", {
    params: Object.keys(params).length ? params : undefined,
  });
  return data.items;
}

export async function createEmployee(name: string, unitKey: UnitKey) {
  const { data } = await api.post<{ item: Employee }>("/employees", { name, unitKey });
  return data.item;
}

export async function setEmployeeActive(id: number, active: boolean) {
  try {
    const { data } = await api.post<{ item: Employee; message: string }>("/employees/deactivate", {
      id,
      active,
    });
    return data;
  } catch (err) {
    throwApiError(err, "Erro ao atualizar funcionário.");
  }
}

export type PetSpecies = "CANINA" | "FELINA";

export interface Breed {
  id: number;
  species: PetSpecies;
  name: string;
  active: boolean;
  createdAt: string;
}

export async function fetchBreeds(species?: PetSpecies, includeInactive = false) {
  const params: Record<string, string> = {};
  if (species) params.species = species;
  if (includeInactive) params.includeInactive = "true";
  const { data } = await api.get<{ items: Breed[] }>("/breeds", {
    params: Object.keys(params).length ? params : undefined,
  });
  return data.items;
}

export async function createBreed(name: string, species: PetSpecies) {
  const { data } = await api.post<{ item: Breed }>("/breeds", { name, species });
  return data.item;
}

export async function setBreedActive(id: number, active: boolean) {
  try {
    const { data } = await api.post<{ item: Breed; message: string }>("/breeds/deactivate", { id, active });
    return data;
  } catch (err) {
    throwApiError(err, "Erro ao atualizar raça.");
  }
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
  try {
    const { data } = await api.get("/dashboard/financeiro", { params: { mes, unidade } });
    return data;
  } catch (err) {
    throwApiError(err, "Erro ao carregar dados financeiros.");
  }
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
  inApp?: boolean;
  clientSignUrl?: string;
}

export type DocFormKind = "carteirinhaFrente" | "carteirinhaVerso" | "atestado" | "fotoFilhote";

export interface DocFormStatus {
  anexos: Record<DocFormKind, { enviado: boolean }>;
  completo: boolean;
  pendentes: DocFormKind[];
  total: number;
  enviados: number;
  emailEnviado: boolean;
  emailEnviadoEm?: string;
  statusLabel: string;
  zapsign?: {
    disponivel: boolean;
    sincronizados: number;
    total: number;
    completo: boolean;
    erro?: string;
  };
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
  linkAssinaturaLoja?: string;
  docToken?: string;
  email: string;
  telefone: string;
  assinatura: SignatureProgress;
  podeAssinarLoja?: boolean;
  inAppSignature?: boolean;
  docForm: DocFormStatus;
}

export interface StatusAssinaturaResponse {
  total: number;
  resumo: {
    assinados: number;
    pendentes: number;
    pendentesLoja?: number;
    pendentesCliente?: number;
  };
  items: StatusAssinaturaItem[];
}

export async function fetchStatusAssinatura(params: {
  nome?: string;
  data?: string;
  dataInicio?: string;
  dataFim?: string;
  status?: string;
}) {
  const { data } = await api.get<StatusAssinaturaResponse>("/dashboard/status-assinatura", { params });
  return data;
}

export async function fetchDocFormStatus(unitKey: UnitKey, sheetIndex: number) {
  const { data } = await api.get<{ ok: boolean; status: DocFormStatus }>(
    `/dashboard/contracts/${unitKey}/${sheetIndex}/doc-form`,
  );
  return data.status;
}

export async function submitDocFormAttachments(
  unitKey: UnitKey,
  sheetIndex: number,
  anexos: Partial<Record<DocFormKind, string>>,
) {
  const { data } = await api.post<{
    ok: boolean;
    message: string;
    status: DocFormStatus;
    emailSent: boolean;
    emailError?: string;
    zapsignSync?: DocFormStatus["zapsign"];
  }>(`/dashboard/contracts/${unitKey}/${sheetIndex}/doc-form`, { anexos });
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

export async function saveContract(
  contrato: Record<string, string>,
  anexos?: Record<string, string>,
): Promise<{
  clientSignUrl?: string;
  sheetIndex?: number;
  provider?: "zapsign" | "internal";
  message?: string;
}> {
  const response = await api.post("/dashboard/contracts", { contrato, anexos }, {
    responseType: "blob",
    validateStatus: () => true,
  });

  const contentType = String(response.headers["content-type"] ?? "");

  if (contentType.includes("application/json")) {
    const text = await (response.data as Blob).text();
    const payload = JSON.parse(text) as {
      ok?: boolean;
      error?: string;
      signUrl?: string;
      sheetIndex?: number;
      provider?: "zapsign";
      message?: string;
    };
    if (response.status >= 400 || !payload.ok) {
      throw new Error(payload.error || "Erro ao salvar contrato.");
    }
    return {
      clientSignUrl: payload.signUrl,
      sheetIndex: payload.sheetIndex,
      provider: payload.provider ?? "zapsign",
      message: payload.message,
    };
  }

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

  const clientSignUrl = response.headers["x-client-sign-url"] as string | undefined;
  const sheetIndexHeader = response.headers["x-sheet-index"] as string | undefined;

  return {
    clientSignUrl,
    sheetIndex: sheetIndexHeader ? parseInt(sheetIndexHeader, 10) : undefined,
    provider: "internal",
  };
}

export interface PublicSignatureInfo {
  nome: string;
  email: string;
  telefone: string;
  canSign: boolean;
  concluido: boolean;
  assinatura: SignatureProgress;
  clientSignUrl: string;
}

export async function fetchPublicSignature(token: string) {
  const { data } = await api.get<PublicSignatureInfo>(`/signatures/public/${token}`);
  return data;
}

export async function fetchPublicSignaturePdf(token: string) {
  const response = await api.get(`/signatures/public/${token}/pdf`, {
    responseType: "blob",
    validateStatus: () => true,
  });
  const contentType = String(response.headers["content-type"] ?? "");
  if (response.status >= 400 || !contentType.includes("pdf")) {
    throw new Error(await readBlobError(response.data as Blob));
  }
  return response.data as Blob;
}

export async function signContractAsClient(token: string, signatureImage: string) {
  try {
    const { data } = await api.post<{ ok: boolean; message: string; concluido: boolean; assinatura: SignatureProgress }>(
      `/signatures/public/${token}/sign`,
      { signatureImage },
    );
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(err.response?.data?.error || "Erro ao assinar.");
    }
    throw err;
  }
}

export async function initSignatureSession(unitKey: UnitKey, sheetIndex: number) {
  const { data } = await api.post<{ ok: boolean; clientSignUrl: string; assinatura: SignatureProgress }>(
    `/signatures/${unitKey}/${sheetIndex}/init`,
  );
  return data;
}

export async function signContractAsStore(unitKey: UnitKey, sheetIndex: number, signatureImage: string) {
  try {
    const { data } = await api.post<{ ok: boolean; message: string; assinatura: SignatureProgress }>(
      `/signatures/${unitKey}/${sheetIndex}/loja-sign`,
      { signatureImage },
    );
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(err.response?.data?.error || "Erro ao assinar.");
    }
    throw err;
  }
}

export interface UnitEmailItem {
  id: number;
  unitKey: UnitKey;
  email: string;
  createdAt: string;
}

export async function fetchSettingsUnits() {
  const { data } = await api.get<{ items: Array<{ key: UnitKey; label: string }> }>("/settings/units");
  return data.items;
}

export async function fetchUnitEmails(unit?: UnitKey) {
  const { data } = await api.get<{ unitKey: UnitKey; unitLabel: string; items: UnitEmailItem[] }>(
    "/settings/emails",
    { params: unit ? { unit } : undefined },
  );
  return data;
}

export async function addUnitEmail(email: string, unit?: UnitKey) {
  const { data } = await api.post<{ ok: boolean; item: UnitEmailItem; message: string }>(
    "/settings/emails",
    { email, unitKey: unit },
  );
  return data;
}

export async function removeUnitEmail(id: number, unit?: UnitKey) {
  const { data } = await api.delete<{ ok: boolean; items: UnitEmailItem[]; message: string }>(
    `/settings/emails/${id}`,
    { params: unit ? { unit } : undefined },
  );
  return data;
}
