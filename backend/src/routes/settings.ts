import { Router } from "express";
import { getConfiguredUnits, getUnitByKey, unitKeyFromLabel, UnitKey } from "../config.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { addUnitEmail, listUnitEmails, removeUnitEmail } from "../services/unitEmails.js";

const router = Router();

function resolveUnitKey(value: string | undefined, userUnit?: UnitKey): UnitKey | null {
  if (value) {
    const fromLabel = unitKeyFromLabel(value);
    if (fromLabel) return fromLabel;
    const lower = value.trim().toLowerCase() as UnitKey;
    if (getConfiguredUnits().some((u) => u.key === lower)) return lower;
  }
  return userUnit ?? null;
}

function assertUnitAccess(req: AuthRequest, unitKey: UnitKey): boolean {
  const isFinanceiro = req.user!.roles.includes("financeiro");
  if (isFinanceiro) return true;
  return req.user!.unit === unitKey;
}

router.get("/units", authMiddleware, requireRole("operacao"), (_req, res) => {
  res.json({
    items: getConfiguredUnits().map((unit) => ({
      key: unit.key,
      label: unit.label,
    })),
  });
});

router.get("/emails", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const unitParam = typeof req.query.unit === "string" ? req.query.unit : undefined;
    const unitKey = resolveUnitKey(unitParam, req.user!.unit);
    if (!unitKey) {
      res.status(400).json({ error: "Selecione a unidade." });
      return;
    }
    if (!assertUnitAccess(req, unitKey)) {
      res.status(403).json({ error: "Acesso negado para esta unidade." });
      return;
    }

    const unit = getUnitByKey(unitKey);
    const items = await listUnitEmails(unitKey);
    res.json({
      unitKey,
      unitLabel: unit?.label || unitKey,
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/emails", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const { email, unit, unitKey: unitKeyBody } = req.body as {
      email?: string;
      unit?: string;
      unitKey?: string;
    };

    const unitKey = resolveUnitKey(unitKeyBody || unit, req.user!.unit);
    if (!unitKey) {
      res.status(400).json({ error: "Selecione a unidade." });
      return;
    }
    if (!assertUnitAccess(req, unitKey)) {
      res.status(403).json({ error: "Acesso negado para esta unidade." });
      return;
    }
    if (!email?.trim()) {
      res.status(400).json({ error: "Informe o e-mail." });
      return;
    }

    const item = await addUnitEmail(unitKey, email);
    res.status(201).json({ ok: true, item, message: "E-mail adicionado." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

router.delete("/emails/:id", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const unitParam = typeof req.query.unit === "string" ? req.query.unit : undefined;
    const unitKey = resolveUnitKey(unitParam, req.user!.unit);
    if (!unitKey || !Number.isFinite(id)) {
      res.status(400).json({ error: "Parâmetros inválidos." });
      return;
    }
    if (!assertUnitAccess(req, unitKey)) {
      res.status(403).json({ error: "Acesso negado para esta unidade." });
      return;
    }

    await removeUnitEmail(unitKey, id);
    const items = await listUnitEmails(unitKey);
    res.json({ ok: true, items, message: "E-mail removido." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

export default router;
