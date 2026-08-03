import { getUnitByKey, SheetRow, UnitKey } from "../config.js";

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

function statusLabel(status: SignatarioStatus): string {
  switch (status) {
    case "assinado":
      return "Assinado";
    case "pendente":
      return "Aguardando assinatura";
    case "aguardando":
      return "Aguardando turno";
    default:
      return "Não enviado";
  }
}

function inferStatusFromDate(dateValue: string, enviado: boolean): SignatarioStatus {
  if (String(dateValue || "").trim()) return "assinado";
  if (enviado) return "pendente";
  return "nao_enviado";
}

function lojaSignatario(unitKey: UnitKey): { nome: string; email: string } {
  const unit = getUnitByKey(unitKey);
  return {
    nome: unit ? `SkoobPet ${unit.label}` : "Loja",
    email: unit?.user || "",
  };
}

export function buildSignatureProgress(row: SheetRow, unitKey: UnitKey): SignatureProgress {
  const enviado = Boolean(String(row["Data Envio"] || row["Documento ZapSign"] || "").trim());
  const dataCliente = String(row["Data Assinatura Cliente"] || "").trim();
  const dataLoja = String(row["Data Assinatura Loja"] || "").trim();
  const linkGeral = String(row["Link Assinatura"] || "").trim();
  const loja = lojaSignatario(unitKey);

  const clienteStatus = inferStatusFromDate(dataCliente, enviado);
  const lojaStatus = dataCliente
    ? inferStatusFromDate(dataLoja, enviado)
    : enviado
      ? "aguardando"
      : "nao_enviado";

  const signatarios: SignatarioItem[] = [
    {
      papel: "Cliente",
      nome: String(row["Nome"] || "Cliente").trim() || "Cliente",
      email: String(row["E-mail"] || "").trim(),
      status: clienteStatus,
      statusLabel: statusLabel(clienteStatus),
      assinadoEm: dataCliente || "—",
      linkAssinatura: linkGeral || undefined,
    },
    {
      papel: "Loja",
      nome: loja.nome,
      email: loja.email,
      status: lojaStatus,
      statusLabel: statusLabel(lojaStatus),
      assinadoEm: dataLoja || "—",
    },
  ];

  const assinados = signatarios.filter((s) => s.status === "assinado").length;

  return {
    signatarios,
    progresso: Math.round((assinados / signatarios.length) * 100),
  };
}
