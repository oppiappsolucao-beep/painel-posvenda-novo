import { Router } from "express";
import { getConfiguredUnits, unitKeyFromLabel, UnitKey } from "../config.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { createEmployee, listEmployees, setEmployeeActive } from "../services/employees.js";
import { maybeSyncEmployeesFromSheets, syncEmployeesFromSheets } from "../services/syncEmployeesFromSheets.js";

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

router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  const isFinanceiro = req.user!.roles.includes("financeiro");
  const unitParam = typeof req.query.unit === "string" ? req.query.unit : undefined;

  let unitKey: UnitKey | undefined;
  if (isFinanceiro) {
    unitKey = resolveUnitKey(unitParam) ?? undefined;
  } else {
    unitKey = resolveUnitKey(unitParam, req.user!.unit) ?? req.user!.unit ?? undefined;
  }

  try {
    await maybeSyncEmployeesFromSheets(req.query.sync === "true");
    const includeInactive = req.query.includeInactive === "true";
    const items = await listEmployees({
      unitKey,
      activeOnly: !includeInactive,
    });
    res.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/sync-from-sheets", authMiddleware, requireRole("financeiro"), async (_req, res) => {
  try {
    const result = await syncEmployeesFromSheets();
    res.json({
      ok: true,
      message: `Sincronizado com a planilha: ${result.created} novo(s), ${result.reactivated} reativado(s).`,
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/", authMiddleware, requireRole("financeiro"), async (req, res) => {
  const { name, unitKey: unitKeyBody, unit } = req.body as {
    name?: string;
    unitKey?: string;
    unit?: string;
  };

  const unitKey = resolveUnitKey(unitKeyBody || unit);
  if (!unitKey) {
    res.status(400).json({ error: "Informe a unidade do funcionário." });
    return;
  }

  try {
    const employee = await createEmployee(name || "", unitKey);
    res.status(201).json({ item: employee });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

router.post("/deactivate", authMiddleware, requireRole("financeiro"), async (req, res) => {
  const { id, active } = req.body as { id?: number | string; active?: boolean };
  const parsedId = parseInt(String(id), 10);
  if (!Number.isFinite(parsedId) || parsedId <= 0) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  if (typeof active !== "boolean") {
    res.status(400).json({ error: "Informe active: true ou false." });
    return;
  }

  try {
    const item = await setEmployeeActive(parsedId, active);
    res.json({
      item,
      message: active ? "Funcionário reativado." : "Funcionário desativado (histórico preservado).",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

router.post("/:id/set-active", authMiddleware, requireRole("financeiro"), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const { active } = req.body as { active?: boolean };
  if (typeof active !== "boolean") {
    res.status(400).json({ error: "Informe active: true ou false." });
    return;
  }

  try {
    const item = await setEmployeeActive(id, active);
    res.json({
      item,
      message: active ? "Funcionário reativado." : "Funcionário desativado (histórico preservado).",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

router.patch("/:id", authMiddleware, requireRole("financeiro"), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const { active } = req.body as { active?: boolean };
  if (typeof active !== "boolean") {
    res.status(400).json({ error: "Informe active: true ou false." });
    return;
  }

  try {
    const item = await setEmployeeActive(id, active);
    res.json({
      item,
      message: active ? "Funcionário reativado." : "Funcionário desativado (histórico preservado).",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

router.get("/units", authMiddleware, requireRole("financeiro"), (_req, res) => {
  res.json({
    items: getConfiguredUnits().map((u) => ({ key: u.key, label: u.label })),
  });
});

export default router;
