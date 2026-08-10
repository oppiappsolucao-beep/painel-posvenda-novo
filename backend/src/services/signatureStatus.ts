import { getUnitByKey, SheetRow, UnitKey } from "../config.js";
import { isZapSignEnabled } from "../config/zapsignEnv.js";
import { getPrimaryUnitStoreEmail } from "./unitEmails.js";
import { zapsignStoreSignerName } from "./zapsignFormConfig.js";
import { SignatureRecord, clientSignUrl, isSignatureComplete } from "./signatures.js";

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
    email: getPrimaryUnitStoreEmail(unitKey),
  };
}

function buildFromRecord(record: SignatureRecord, row: SheetRow, unitKey: UnitKey): SignatureProgress {
  const loja = lojaSignatario(unitKey);
  const link = clientSignUrl(record.clientToken);

  const clienteStatus: SignatarioStatus = record.clienteSignedAt ? "assinado" : "pendente";
  const lojaStatus: SignatarioStatus = record.lojaSignedAt
    ? "assinado"
    : record.clienteSignedAt
      ? "pendente"
      : "aguardando";

  const signatarios: SignatarioItem[] = [
    {
      papel: "Cliente",
      nome: record.clienteNome || String(row["Nome"] || "Cliente").trim() || "Cliente",
      email: record.clienteEmail || String(row["E-mail"] || "").trim(),
      status: clienteStatus,
      statusLabel: statusLabel(clienteStatus),
      assinadoEm: record.clienteSignedAt || "—",
      linkAssinatura: clienteStatus !== "assinado" ? link : undefined,
    },
    {
      papel: "Loja",
      nome: loja.nome,
      email: loja.email,
      status: lojaStatus,
      statusLabel: statusLabel(lojaStatus),
      assinadoEm: record.lojaSignedAt || "—",
    },
  ];

  const assinados = signatarios.filter((s) => s.status === "assinado").length;

  return {
    signatarios,
    progresso: Math.round((assinados / signatarios.length) * 100),
    inApp: true,
    clientSignUrl: link,
  };
}

function buildZapSignEmpty(row: SheetRow, unitKey: UnitKey): SignatureProgress {
  const loja = lojaSignatario(unitKey);
  const signatarios: SignatarioItem[] = [
    {
      papel: "Loja",
      nome: zapsignStoreSignerName(unitKey) || loja.nome,
      email: String(row["E-mail Loja"] || loja.email).trim(),
      status: "nao_enviado",
      statusLabel: statusLabel("nao_enviado"),
      assinadoEm: "—",
    },
    {
      papel: "Cliente",
      nome: String(row["Nome"] || "Cliente").trim() || "Cliente",
      email: String(row["E-mail"] || "").trim(),
      status: "nao_enviado",
      statusLabel: statusLabel("nao_enviado"),
      assinadoEm: "—",
    },
  ];

  return { signatarios, progresso: 0, inApp: false };
}

function buildFromZapSignRow(row: SheetRow, unitKey: UnitKey): SignatureProgress {
  const enviado = Boolean(String(row["Data Envio"] || row["Documento ZapSign"] || "").trim());
  const dataCliente = String(row["Data Assinatura Cliente"] || "").trim();
  const dataLoja = String(row["Data Assinatura Loja"] || "").trim();
  const linkCliente = String(row["Link Assinatura"] || "").trim();
  const linkLoja = String(row["Link Assinatura Loja"] || "").trim();
  const loja = lojaSignatario(unitKey);
  const lojaNome = zapsignStoreSignerName(unitKey) || loja.nome;
  const lojaEmail = String(row["E-mail Loja"] || loja.email).trim();

  const clienteStatus = dataLoja
    ? inferStatusFromDate(dataCliente, enviado)
    : enviado
      ? "aguardando"
      : "nao_enviado";
  const lojaStatus = inferStatusFromDate(dataLoja, enviado);

  const signatarios: SignatarioItem[] = [
    {
      papel: "Loja",
      nome: lojaNome,
      email: lojaEmail,
      status: lojaStatus,
      statusLabel: statusLabel(lojaStatus),
      assinadoEm: dataLoja || "—",
      linkAssinatura: linkLoja || undefined,
    },
    {
      papel: "Cliente",
      nome: String(row["Nome"] || "Cliente").trim() || "Cliente",
      email: String(row["E-mail"] || "").trim(),
      status: clienteStatus,
      statusLabel: statusLabel(clienteStatus),
      assinadoEm: dataCliente || "—",
      linkAssinatura: linkCliente || undefined,
    },
  ];

  const assinados = signatarios.filter((s) => s.status === "assinado").length;

  return {
    signatarios,
    progresso: Math.round((assinados / signatarios.length) * 100),
    inApp: false,
  };
}

export function buildSignatureProgress(
  row: SheetRow,
  unitKey: UnitKey,
  record?: SignatureRecord | null,
): SignatureProgress {
  if (record) return buildFromRecord(record, row, unitKey);

  if (isZapSignEnabled(unitKey)) {
    const zapsignDoc = String(row["Documento ZapSign"] || "").trim();
    const linkZapSign = String(row["Link Assinatura"] || "").trim();
    if (zapsignDoc || linkZapSign) {
      return buildFromZapSignRow(row, unitKey);
    }
    return buildZapSignEmpty(row, unitKey);
  }

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

export function isContratoAssinadoInApp(record: SignatureRecord | null | undefined): boolean {
  return Boolean(record && isSignatureComplete(record));
}
