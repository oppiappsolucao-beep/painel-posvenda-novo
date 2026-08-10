import { Router } from "express";
import { UnitKey, getUnitByKey } from "../config.js";
import { ZAPSIGN_UNIT_KEYS } from "../config/zapsignEnv.js";
import {
  configureUnitTemplateForm,
  ensureProductionTemplate,
  isZapSignEnabled,
  resetProductionTemplateCache,
} from "../services/zapsign.js";
import { updateContractRow } from "../services/sheets.js";
import { formatDateTimeBr, todaySaoPaulo } from "../utils/formatters.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();

function parseUnitKey(value: string): UnitKey | null {
  const key = value.trim().toLowerCase() as UnitKey;
  return ZAPSIGN_UNIT_KEYS.includes(key) ? key : null;
}

async function configureUnit(unitKey: UnitKey, res: import("express").Response): Promise<void> {
  if (!isZapSignEnabled(unitKey)) {
    res.status(400).json({ error: `ZapSign não configurado para ${unitKey} (token + template).` });
    return;
  }

  try {
    await resetProductionTemplateCache(unitKey);
    const templateId = await ensureProductionTemplate(unitKey);
    await configureUnitTemplateForm(unitKey);
    res.json({
      ok: true,
      unitKey,
      templateId,
      message: `Template de produção (${unitKey}) recriado e formulário configurado.`,
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

router.post("/webhook", async (req, res) => {
  try {
    const event = req.body as {
      event?: string;
      status?: string;
      token?: string;
      external_id?: string;
      signers?: Array<{ status?: string; signed_at?: string; qualification?: string }>;
    };

    const docToken = String(event.token || "").trim();
    const externalId = String(event.external_id || "").trim();
    const status = String(event.status || "").trim().toLowerCase();

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

    if (status === "assinado" || status === "signed") {
      const signedAt =
        event.signers?.find((s) => s.signed_at)?.signed_at ||
        formatDateTimeBr(todaySaoPaulo());

      await updateContractRow(unitKey, sheetIndex, {
        "Status Assinatura": "Assinado (ZapSign)",
        "Data Assinatura Cliente": signedAt,
        "Documento ZapSign": docToken,
      });
    }

    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[zapsign] webhook:", msg);
    res.status(200).json({ ok: true });
  }
});

export default router;
