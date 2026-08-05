import { Router } from "express";
import { PET_SPECIES_LABELS, PetSpecies } from "../config/breeds.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { createBreed, listBreeds, setBreedActive } from "../services/breeds.js";

const router = Router();

function parseSpecies(value: string | undefined): PetSpecies | null {
  const v = (value || "").trim().toUpperCase();
  if (v === "CANINA" || v === "CACHORRO") return "CANINA";
  if (v === "FELINA" || v === "GATO") return "FELINA";
  return null;
}

router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  const isFinanceiro = req.user!.roles.includes("financeiro");
  const species = parseSpecies(typeof req.query.species === "string" ? req.query.species : undefined);

  try {
    const includeInactive = req.query.includeInactive === "true" || isFinanceiro;
    const items = await listBreeds({
      species: species ?? undefined,
      activeOnly: !includeInactive,
    });
    res.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/", authMiddleware, requireRole("financeiro"), async (req, res) => {
  const { name, species: speciesBody } = req.body as { name?: string; species?: string };
  const species = parseSpecies(speciesBody);
  if (!species) {
    res.status(400).json({ error: "Informe a espécie: CANINA (cachorro) ou FELINA (gato)." });
    return;
  }

  try {
    const item = await createBreed(name || "", species);
    res.status(201).json({ item });
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
    const item = await setBreedActive(id, active);
    res.json({
      item,
      message: active ? "Raça reativada." : "Raça desativada (histórico preservado).",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

router.get("/species", authMiddleware, (_req, res) => {
  res.json({
    items: (Object.entries(PET_SPECIES_LABELS) as [PetSpecies, string][]).map(([key, label]) => ({
      key,
      label,
    })),
  });
});

export default router;
