import { Router } from "express";
import { UnitKey, getUnitByKey } from "../config.js";
import { ZAPSIGN_UNIT_KEYS } from "../config/zapsignEnv.js";
import {
  configureAllExistingUnitTemplates,
  configureExistingUnitTemplate,
  isZapSignEnabled,
} from "../services/zapsign.js";
import { updateContractRow } from "../services/sheets.js";
import { formatDateTimeBr, todaySaoPaulo } from "../utils/formatters.js";
import { findClientSigner, findStoreSigner } from "../services/zapsignFormConfig.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();

function parseUnitKey(value: string): UnitKey | null {
  const key = value.trim().toLowerCase() as UnitKey;
  return ZAPSIGN_UNIT_KEYS.includes(key) ? key : null;
}

function formatSignedAt(iso: string | null | undefined): string {
  const raw = String(iso || "").trim();
  if (!raw) return formatDateTimeBr(todaySaoPaulo());
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return formatDateTimeBr(d);
}

function isSignerSigned(signer?: { status?: string; signed_at?: string | null } | null): boolean {
  if (!signer) return false;
  if (String(signer.signed_at || "").trim()) return true;
  const status = String(signer.status || "").trim().toLowerCase();
  return status === "signed" || status === "assinado";
}

function buildStatusAssinaturaLabel(dataCliente: string, dataLoja: string, docStatus: string): string {
  if (docStatus === "signed" || docStatus === "assinado") return "Assinado (ZapSign)";
  if (dataCliente && dataLoja) return "Assinado (ZapSign)";
  if (dataLoja) return "Loja assinou (ZapSign)";
  if (dataCliente) return "Cliente assinou (ZapSign)";
  return "Aguardando cliente (ZapSign)";
}

async function configureUnit(unitKey: UnitKey, res: import("express").Response): Promise<void> {
  if (!isZapSignEnabled(unitKey)) {
    res.status(400).json({ error: `ZapSign não configurado para ${unitKey} (token + template).` });
    return;
  }

  try {
    const templateId = await configureExistingUnitTemplate(unitKey);
    res.json({
      ok: true,
      unitKey,
      templateId,
      message: `Modelo existente (${unitKey}) configurado: loja 1º, cliente 2º, radios + RG.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
}

router.post("/configure-campinas", authMiddleware, requireRole("financeiro"), async (_req, res) => {
  await configureUnit("campinas", res);
});

router.post("/configure/:unitKey", authMiddleware, requireRole("financeiro"), async (req, res) => {
  const unitKey = parseUnitKey(String(req.params.unitKey || ""));
  if (!unitKey) {
    res.status(400).json({ error: "Unidade inválida." });
    return;
  }
  await configureUnit(unitKey, res);
});

router.post("/configure-all", authMiddleware, requireRole("financeiro"), async (_req, res) => {
  try {
    const results = await configureAllExistingUnitTemplates();
    const failed = results.filter((item) => !item.ok);
    res.json({
      ok: failed.length === 0,
      results,
      message:
        failed.length === 0
          ? "Três modelos configurados: loja 1º, cliente 2º, radios + RG (sem criar modelos novos)."
          : `${failed.length} unidade(s) com erro.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/webhook", async (req, res) => {
  try {
    const event = req.body as {
      event_type?: string;
      event?: string;
      status?: string;
      token?: string;
      external_id?: string;
      signers?: Array<{ status?: string; signed_at?: string | null; qualification?: string; name?: string }>;
    };

    const docToken = String(event.token || "").trim();
    const externalId = String(event.external_id || "").trim();
    const docStatus = String(event.status || "").trim().toLowerCase();

    const colonIndex = externalId.indexOf(":");
    if (colonIndex <= 0) {
      res.json({ ok: true, ignored: true });
      return;
    }

    const unitKey = parseUnitKey(externalId.slice(0, colonIndex));
    if (!unitKey || !getUnitByKey(unitKey)) {
      res.json({ ok: true, ignored: true });
      return;
    }

    const sheetIndex = parseInt(externalId.slice(colonIndex + 1) || "", 10);
    if (!Number.isFinite(sheetIndex) || sheetIndex < 0) {
      res.json({ ok: true, ignored: true });
      return;
    }

    const signers = event.signers || [];
    const clientSigner = findClientSigner(signers);
    const storeSigner = findStoreSigner(signers);

    const patch: Record<string, string> = {};
    if (docToken) patch["Documento ZapSign"] = docToken;

    if (isSignerSigned(clientSigner)) {
      patch["Data Assinatura Cliente"] = formatSignedAt(clientSigner?.signed_at);
    }
    if (isSignerSigned(storeSigner)) {
      patch["Data Assinatura Loja"] = formatSignedAt(storeSigner?.signed_at);
    }

    const dataCliente = patch["Data Assinatura Cliente"] || "";
    const dataLoja = patch["Data Assinatura Loja"] || "";
    if (dataCliente || dataLoja || docStatus === "signed" || docStatus === "assinado") {
      patch["Status Assinatura"] = buildStatusAssinaturaLabel(dataCliente, dataLoja, docStatus);
    }

    if (Object.keys(patch).length > 0) {
      await updateContractRow(unitKey, sheetIndex, patch);
    }

    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[zapsign] webhook:", msg);
    res.status(200).json({ ok: true });
  }
});

export default router;
