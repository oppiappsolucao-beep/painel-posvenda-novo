import { Router } from "express";
import { getUnitByKey, UnitKey } from "../config.js";
import { authMiddleware, AuthRequest, requireRole } from "../middleware/auth.js";
import { generateContractPdf } from "../services/pdf.js";
import { getContractRow } from "../services/sheets.js";
import {
  clientSignUrl,
  createSignatureSession,
  getSignature,
  getSignatureByToken,
  isSignatureComplete,
  signAsClient,
  signAsStore,
  signatureImages,
} from "../services/signatures.js";
import { buildSignatureProgress } from "../services/signatureStatus.js";
import { getContractAttachmentBuffers } from "../services/contractAttachments.js";
import { limparNomeArquivo } from "../utils/formatters.js";

const router = Router();

router.get("/public/:token", async (req, res) => {
  try {
    const record = await getSignatureByToken(String(req.params.token));
    if (!record) {
      res.status(404).json({ error: "Link de assinatura inválido ou expirado." });
      return;
    }

    const canSign = !record.clienteSignedAt;
    res.json({
      nome: record.clienteNome,
      email: record.clienteEmail,
      telefone: record.clienteTelefone,
      canSign,
      concluido: isSignatureComplete(record),
      assinatura: buildSignatureProgress({}, record.unitKey, record),
      clientSignUrl: clientSignUrl(record.clientToken),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/public/:token/pdf", async (req, res) => {
  try {
    const record = await getSignatureByToken(String(req.params.token));
    if (!record) {
      res.status(404).json({ error: "Link de assinatura inválido ou expirado." });
      return;
    }

    const contrato = await getContractRow(record.unitKey, record.sheetIndex);
    if (!contrato) {
      res.status(404).json({ error: "Contrato não encontrado." });
      return;
    }

    const pdf = await generateContractPdf(contrato, signatureImages(record), await getContractAttachmentBuffers(record.unitKey, record.sheetIndex));
    const nome = limparNomeArquivo(record.clienteNome);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="contrato_${nome}.pdf"`);
    res.send(pdf);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/public/:token/sign", async (req, res) => {
  try {
    const signatureImage = String(req.body?.signatureImage || "");
    const record = await signAsClient(String(req.params.token), signatureImage);
    res.json({
      ok: true,
      message: "Assinatura registrada com sucesso!",
      concluido: isSignatureComplete(record),
      assinatura: buildSignatureProgress({}, record.unitKey, record),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

router.get("/:unitKey/:sheetIndex", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const unitKey = String(req.params.unitKey) as UnitKey;
    const sheetIndex = parseInt(String(req.params.sheetIndex), 10);
    if (!getUnitByKey(unitKey) || !Number.isFinite(sheetIndex) || sheetIndex < 0) {
      res.status(400).json({ error: "Parâmetros inválidos." });
      return;
    }

    const userUnit = req.user?.unit;
    if (userUnit && userUnit !== unitKey) {
      res.status(403).json({ error: "Acesso negado para esta unidade." });
      return;
    }

    let record = await getSignature(unitKey, sheetIndex);
    if (!record && unitKey === "campinas") {
      const contrato = await getContractRow(unitKey, sheetIndex);
      if (contrato) record = await createSignatureSession(unitKey, sheetIndex, contrato);
    }

    if (!record) {
      res.status(404).json({ error: "Sessão de assinatura não encontrada." });
      return;
    }

    res.json({
      record,
      clientSignUrl: clientSignUrl(record.clientToken),
      concluido: isSignatureComplete(record),
      assinatura: buildSignatureProgress({}, unitKey, record),
      podeAssinarLoja: Boolean(record.clienteSignedAt && !record.lojaSignedAt),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/:unitKey/:sheetIndex/init", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const unitKey = String(req.params.unitKey) as UnitKey;
    const sheetIndex = parseInt(String(req.params.sheetIndex), 10);
    if (unitKey !== "campinas" || !getUnitByKey(unitKey) || !Number.isFinite(sheetIndex) || sheetIndex < 0) {
      res.status(400).json({ error: "Parâmetros inválidos." });
      return;
    }

    const userUnit = req.user?.unit;
    if (userUnit && userUnit !== unitKey) {
      res.status(403).json({ error: "Acesso negado para esta unidade." });
      return;
    }

    const contrato = await getContractRow(unitKey, sheetIndex);
    if (!contrato) {
      res.status(404).json({ error: "Contrato não encontrado." });
      return;
    }

    const record = await createSignatureSession(unitKey, sheetIndex, contrato);
    res.json({
      ok: true,
      clientSignUrl: clientSignUrl(record.clientToken),
      assinatura: buildSignatureProgress(contrato, unitKey, record),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/:unitKey/:sheetIndex/loja-sign", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const unitKey = String(req.params.unitKey) as UnitKey;
    const sheetIndex = parseInt(String(req.params.sheetIndex), 10);
    const signatureImage = String(req.body?.signatureImage || "");

    if (!getUnitByKey(unitKey) || !Number.isFinite(sheetIndex) || sheetIndex < 0) {
      res.status(400).json({ error: "Parâmetros inválidos." });
      return;
    }

    const userUnit = req.user?.unit;
    if (userUnit && userUnit !== unitKey) {
      res.status(403).json({ error: "Acesso negado para esta unidade." });
      return;
    }

    const record = await signAsStore(unitKey, sheetIndex, signatureImage, req.user?.username || "Loja");
    res.json({
      ok: true,
      message: "Assinatura da loja registrada!",
      concluido: isSignatureComplete(record),
      assinatura: buildSignatureProgress({}, unitKey, record),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

export default router;
