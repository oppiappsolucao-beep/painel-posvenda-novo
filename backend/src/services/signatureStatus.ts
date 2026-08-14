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

function sheetField(row: SheetRow, ...names: string[]): string {
  for (const name of names) {
    const direct = String(row[name] || "").trim();
    if (direct) return direct;
  }
  const keys = Object.keys(row);
  for (const name of names) {
    const target = name.trim().toLowerCase();
    const key = keys.find((k) => k.replace(/\u00a0/g, " ").trim().toLowerCase() === target);
    if (key) {
      const value = String(row[key] || "").trim();
      if (value) return value;
    }
  }
  return "";
}

export function rowHasZapSignDispatch(row: SheetRow): boolean {
  if (
    sheetField(
      row,
      "Documento ZapSign",
      "Link Assinatura",
      "Link Assinatura Loja",
      "Data Envio",
    )
  ) {
    return true;
  }
  const status = sheetField(row, "Status Assinatura", "Status");
  return /zapsign|aguardando cliente|aguardando loja|cliente assinou|loja assinou/i.test(status);
}

export function findSignatario(progress: SignatureProgress, papel: string): SignatarioItem | undefined {
  const target = papel.trim().toLowerCase();
  return progress.signatarios.find((item) => item.papel.trim().toLowerCase() === target);
}

export function isSignatarioPendente(progress: SignatureProgress, papel: string): boolean {
  const signatario = findSignatario(progress, papel);
  return !signatario || signatario.status !== "assinado";
}

export function contractOverallStatus(progress: SignatureProgress): {
  status: "assinado" | "pendente";
  statusLabel: string;
} {
  const cliente = findSignatario(progress, "Cliente");
  const loja = findSignatario(progress, "Loja");
  const clienteOk = cliente?.status === "assinado";
  const lojaOk = loja?.status === "assinado";

  if (clienteOk && lojaOk) {
    return { status: "assinado", statusLabel: "Assinado" };
  }
  if (clienteOk) {
    return { status: "pendente", statusLabel: "Aguardando loja" };
  }
  if (lojaOk) {
    return { status: "pendente", statusLabel: "Aguardando cliente" };
  }
  if (cliente?.status === "pendente") {
    return { status: "pendente", statusLabel: "Aguardando cliente" };
  }
  if (cliente?.status === "nao_enviado" && loja?.status === "nao_enviado") {
    return { status: "pendente", statusLabel: "Não enviado" };
  }
  return { status: "pendente", statusLabel: "Não assinado" };
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
  const enviado = rowHasZapSignDispatch(row);
  const dataCliente = sheetField(row, "Data Assinatura Cliente");
  const dataLoja = sheetField(row, "Data Assinatura Loja");
  const linkCliente = sheetField(row, "Link Assinatura");
  const linkLoja = sheetField(row, "Link Assinatura Loja");
  const loja = lojaSignatario(unitKey);
  const lojaNome = zapsignStoreSignerName(unitKey) || loja.nome;
  const lojaEmail = sheetField(row, "E-mail Loja") || loja.email;

  const clienteStatus = inferStatusFromDate(dataCliente, enviado);
  const lojaStatus = dataCliente
    ? inferStatusFromDate(dataLoja, enviado)
    : enviado
      ? "aguardando"
      : "nao_enviado";

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
    if (rowHasZapSignDispatch(row)) {
      return buildFromZapSignRow(row, unitKey);
    }
    return buildZapSignEmpty(row, unitKey);
  }

  const enviado = rowHasZapSignDispatch(row);
  const dataCliente = sheetField(row, "Data Assinatura Cliente");
  const dataLoja = sheetField(row, "Data Assinatura Loja");
  const linkGeral = sheetField(row, "Link Assinatura");
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
