import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_BREEDS, PetSpecies } from "../config/breeds.js";
import { isDatabaseEnabled } from "../db/client.js";
import {
  dbCountBreeds,
  dbFindBreedByNameSpecies,
  dbInsertBreed,
  dbListBreeds,
  dbSetBreedActive,
} from "../db/breedsStore.js";
import { formatDateTimeBr } from "../utils/formatters.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "breeds.json");

export interface BreedRecord {
  id: number;
  species: PetSpecies;
  name: string;
  active: boolean;
  createdAt: string;
}

interface FileStore {
  nextId: number;
  items: BreedRecord[];
  seeded: boolean;
}

async function readFileStore(): Promise<FileStore> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as FileStore;
  } catch {
    const empty: FileStore = { nextId: 1, items: [], seeded: false };
    await fs.writeFile(DATA_FILE, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function writeFileStore(store: FileStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function seedDefaultBreedsIfEmpty(): Promise<void> {
  if (isDatabaseEnabled()) {
    const count = await dbCountBreeds();
    if (count > 0) return;
    const createdAt = formatDateTimeBr(new Date());
    for (const species of ["CANINA", "FELINA"] as PetSpecies[]) {
      for (const name of DEFAULT_BREEDS[species]) {
        await dbInsertBreed(species, name, createdAt);
      }
    }
    return;
  }

  const store = await readFileStore();
  if (store.seeded && store.items.length > 0) return;

  const createdAt = formatDateTimeBr(new Date());
  for (const species of ["CANINA", "FELINA"] as PetSpecies[]) {
    for (const name of DEFAULT_BREEDS[species]) {
      store.items.push({
        id: store.nextId++,
        species,
        name,
        active: true,
        createdAt,
      });
    }
  }
  store.seeded = true;
  await writeFileStore(store);
}

export async function listBreeds(opts?: {
  species?: PetSpecies;
  activeOnly?: boolean;
}): Promise<BreedRecord[]> {
  await seedDefaultBreedsIfEmpty();

  if (isDatabaseEnabled()) {
    return dbListBreeds(opts);
  }

  const store = await readFileStore();
  let items = [...store.items];
  if (opts?.species) items = items.filter((b) => b.species === opts.species);
  if (opts?.activeOnly) items = items.filter((b) => b.active);
  return items.sort((a, b) => {
    if (a.species !== b.species) return a.species.localeCompare(b.species);
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

export async function createBreed(name: string, species: PetSpecies): Promise<BreedRecord> {
  const normalized = normalizeName(name);
  if (!normalized) throw new Error("Informe o nome da raça.");
  if (normalized.toLowerCase() === "outro") {
    throw new Error('"Outro" é reservado para digitação manual no contrato.');
  }

  await seedDefaultBreedsIfEmpty();

  const existing = await findBreedByNameSpecies(normalized, species);
  if (existing) {
    throw new Error(
      existing.active
        ? `Já existe uma raça ativa com este nome para ${species === "CANINA" ? "cachorro" : "gato"}.`
        : "Esta raça já está cadastrada (inativa). Reative-a em vez de criar outra.",
    );
  }

  const createdAt = formatDateTimeBr(new Date());

  if (isDatabaseEnabled()) {
    return dbInsertBreed(species, normalized, createdAt);
  }

  const store = await readFileStore();
  const record: BreedRecord = {
    id: store.nextId++,
    species,
    name: normalized,
    active: true,
    createdAt,
  };
  store.items.push(record);
  await writeFileStore(store);
  return record;
}

export async function setBreedActive(id: number, active: boolean): Promise<BreedRecord> {
  if (isDatabaseEnabled()) {
    const updated = await dbSetBreedActive(id, active);
    if (!updated) throw new Error("Raça não encontrada.");
    return updated;
  }

  const store = await readFileStore();
  const idx = store.items.findIndex((b) => b.id === id);
  if (idx < 0) throw new Error("Raça não encontrada.");
  store.items[idx] = { ...store.items[idx], active };
  await writeFileStore(store);
  return store.items[idx];
}

async function findBreedByNameSpecies(name: string, species: PetSpecies): Promise<BreedRecord | null> {
  if (isDatabaseEnabled()) {
    return dbFindBreedByNameSpecies(name, species);
  }
  const store = await readFileStore();
  const normalized = normalizeName(name).toLowerCase();
  return (
    store.items.find(
      (b) => b.species === species && b.name.trim().toLowerCase() === normalized,
    ) ?? null
  );
}
