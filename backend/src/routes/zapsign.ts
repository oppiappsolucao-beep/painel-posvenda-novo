import { Router } from "express";
import { UnitKey } from "../config.js";
import {
  configureCampinasTemplateForm,
  isZapSignCampinasEnabled,
} from "../services/zapsign.js";
import { updateContractRow } from "../services/sheets.js";
import { formatDateTimeBr, todaySaoPaulo } from "../utils/formatters.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();

router.post("/configure-campinas", authMiddleware, requireRole("financeiro"), async (_req, res) => {
  if (!isZapSignCampinasEnabled()) {
    res.status(400).json({ error: "ZapSign Campinas não está configurado (token + template)." });
    return;
  }

  try {
    await configureCampinasTemplateForm();
    res.json({ ok: true, message: "Formulário do template Campinas configurado no ZapSign." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/webhook", async (req, res) => {
  try {
    const event = req.body as {
      event?: string;
      status?: string;
      token?: string;
      external_id?: string;
      signers?: Array<{ status?: string; signed_at?: string }>;
    };

    const docToken = String(event.token || "").trim();
    const externalId = String(event.external_id || "").trim();
    const status = String(event.status || "").trim().toLowerCase();

    if (!externalId.startsWith("campinas:")) {
      res.json({ ok: true, ignored: true });
      return;
    }

    const sheetIndex = parseInt(externalId.split(":")[1] || "", 10);
    if (!Number.isFinite(sheetIndex) || sheetIndex < 0) {
      res.json({ ok: true, ignored: true });
      return;
    }

    if (status === "assinado" || status === "signed") {
      const signedAt =
        event.signers?.find((s) => s.signed_at)?.signed_at ||
        formatDateTimeBr(todaySaoPaulo());

      await updateContractRow("campinas" as UnitKey, sheetIndex, {
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
