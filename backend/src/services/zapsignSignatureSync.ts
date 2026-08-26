import { UnitKey, SheetRow } from "../config.js";
import { getZapSignApiBase, getZapSignApiToken, isZapSignEnabled } from "../config/zapsignEnv.js";
import { findClientSigner, findStoreSigner } from "./zapsignFormConfig.js";
import { updateContractRow } from "./sheets.js";
import { formatDateTimeBr } from "../utils/formatters.js";

interface ZapSignDocSigner {
  token?: string;
  status?: string;
  qualification?: string;
  name?: string;
  signed_at?: string | null;
}

export interface ZapSignSignatureSnapshot {
  dataCliente: string;
  dataLoja: string;
  statusAssinatura: string;
  extraDocs: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { snapshot: ZapSignSignatureSnapshot; expiresAt: number }>();

function formatSignedAt(iso: string | null | undefined): string {
  const raw = String(iso || "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return formatDateTimeBr(d);
}

function isSignerSigned(signer?: ZapSignDocSigner | null): boolean {
  if (!signer) return false;
  if (String(signer.signed_at || "").trim()) return true;
  const status = String(signer.status || "").trim().toLowerCase();
  return status === "signed" || status === "assinado";
}

function buildStatusAssinaturaLabel(dataCliente: string, dataLoja: string): string {
  if (dataCliente && dataLoja) return "Assinado (ZapSign)";
  if (dataLoja) return "Loja assinou (ZapSign)";
  if (dataCliente) return "Cliente assinou (ZapSign)";
  return "Aguardando cliente (ZapSign)";
}

export function invalidateZapSignSignatureCache(): void {
  cache.clear();
}

export async function fetchZapSignSignatureSnapshot(
  docToken: string,
): Promise<ZapSignSignatureSnapshot | null> {
  const token = String(docToken || "").trim();
  if (!token) return null;

  const cached = cache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.snapshot;
  }

  const apiToken = getZapSignApiToken();
  if (!apiToken) return null;

  const res = await fetch(`${getZapSignApiBase()}/docs/${token}/`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    signers?: ZapSignDocSigner[];
    status?: string;
    extra_docs?: unknown[];
    extraDocs?: unknown[];
    extra_documents?: unknown[];
  };
  const signers = data.signers || [];
  const clientSigner = findClientSigner(signers);
  const storeSigner = findStoreSigner(signers);

  const dataCliente = isSignerSigned(clientSigner) ? formatSignedAt(clientSigner?.signed_at) : "";
  const dataLoja = isSignerSigned(storeSigner) ? formatSignedAt(storeSigner?.signed_at) : "";
  const extraList = data.extra_docs || data.extraDocs || data.extra_documents;
  const extraDocs = Array.isArray(extraList) ? extraList.length : 0;

  const snapshot: ZapSignSignatureSnapshot = {
    dataCliente,
    dataLoja,
    statusAssinatura: buildStatusAssinaturaLabel(dataCliente, dataLoja),
    extraDocs,
  };

  cache.set(token, { snapshot, expiresAt: Date.now() + CACHE_TTL_MS });
  return snapshot;
}

function rowNeedsSync(row: SheetRow, snapshot: ZapSignSignatureSnapshot): boolean {
  const currentCliente = String(row["Data Assinatura Cliente"] || "").trim();
  const currentLoja = String(row["Data Assinatura Loja"] || "").trim();
  if (snapshot.dataCliente && !currentCliente) return true;
  if (snapshot.dataLoja && !currentLoja) return true;
  return false;
}

function mergeSnapshotIntoRow(row: SheetRow, snapshot: ZapSignSignatureSnapshot): SheetRow {
  const merged = { ...row };
  if (snapshot.dataCliente) merged["Data Assinatura Cliente"] = snapshot.dataCliente;
  if (snapshot.dataLoja) merged["Data Assinatura Loja"] = snapshot.dataLoja;
  if (snapshot.dataCliente || snapshot.dataLoja) {
    merged["Status Assinatura"] = snapshot.statusAssinatura;
  }
  return merged;
}

function shouldPollZapSign(row: SheetRow): boolean {
  const docToken = String(row["Documento ZapSign"] || "").trim();
  if (!docToken) return false;
  const dataCliente = String(row["Data Assinatura Cliente"] || "").trim();
  const dataLoja = String(row["Data Assinatura Loja"] || "").trim();
  return !dataCliente || !dataLoja;
}

export async function syncZapSignSignatureRow(
  unitKey: UnitKey,
  sheetIndex: number,
  row: SheetRow,
): Promise<SheetRow> {
  if (!isZapSignEnabled(unitKey) || !shouldPollZapSign(row)) return row;

  const docToken = String(row["Documento ZapSign"] || "").trim();
  const snapshot = await fetchZapSignSignatureSnapshot(docToken);
  if (!snapshot) return row;

  if (rowNeedsSync(row, snapshot)) {
    const patch: Record<string, string> = {};
    if (snapshot.dataCliente && !String(row["Data Assinatura Cliente"] || "").trim()) {
      patch["Data Assinatura Cliente"] = snapshot.dataCliente;
    }
    if (snapshot.dataLoja && !String(row["Data Assinatura Loja"] || "").trim()) {
      patch["Data Assinatura Loja"] = snapshot.dataLoja;
    }
    if (Object.keys(patch).length > 0) {
      patch["Status Assinatura"] = snapshot.statusAssinatura;
      await updateContractRow(unitKey, sheetIndex, patch).catch((e) => {
        console.warn(
          `[zapsign] sync assinatura ${unitKey}:${sheetIndex}:`,
          e instanceof Error ? e.message : e,
        );
      });
    }
  }

  return mergeSnapshotIntoRow(row, snapshot);
}

export async function syncZapSignRowsForStatus<T extends { unitKey: UnitKey; sheetIndex: number; data: SheetRow }>(
  rows: T[],
): Promise<T[]> {
  const targets = rows.filter((item) => isZapSignEnabled(item.unitKey) && shouldPollZapSign(item.data));
  if (targets.length === 0) return rows;

  const syncedByKey = new Map<string, SheetRow>();
  const concurrency = 5;

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (item) => {
        const key = `${item.unitKey}:${item.sheetIndex}`;
        const synced = await syncZapSignSignatureRow(item.unitKey, item.sheetIndex, item.data);
        syncedByKey.set(key, synced);
      }),
    );
  }

  return rows.map((item) => {
    const key = `${item.unitKey}:${item.sheetIndex}`;
    const synced = syncedByKey.get(key);
    return synced ? { ...item, data: synced } : item;
  });
}
