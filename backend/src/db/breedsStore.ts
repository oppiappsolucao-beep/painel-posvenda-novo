import { PetSpecies } from "../config/breeds.js";
import type { BreedRecord } from "../services/breeds.js";
import { query } from "./client.js";

interface BreedRow {
  id: number;
  species: PetSpecies;
  name: string;
  active: boolean;
  created_at: string;
}

function mapRow(row: BreedRow): BreedRecord {
  return {
    id: row.id,
    species: row.species,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
  };
}

export async function dbListBreeds(opts?: {
  species?: PetSpecies;
  activeOnly?: boolean;
}): Promise<BreedRecord[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (opts?.species) {
    params.push(opts.species);
    clauses.push(`species = $${params.length}`);
  }
  if (opts?.activeOnly) {
    clauses.push("active = true");
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await query<BreedRow>(
    `SELECT * FROM breeds ${where} ORDER BY species ASC, active DESC, name ASC`,
    params,
  );
  return rows.map(mapRow);
}

export async function dbCountBreeds(): Promise<number> {
  const { rows } = await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM breeds");
  return parseInt(rows[0]?.count || "0", 10);
}

export async function dbInsertBreed(
  species: PetSpecies,
  name: string,
  createdAt: string,
): Promise<BreedRecord> {
  const { rows } = await query<BreedRow>(
    `INSERT INTO breeds (species, name, active, created_at)
     VALUES ($1, $2, true, $3)
     RETURNING *`,
    [species, name, createdAt],
  );
  return mapRow(rows[0]);
}

export async function dbSetBreedActive(id: number, active: boolean): Promise<BreedRecord | null> {
  const { rows } = await query<BreedRow>(
    `UPDATE breeds SET active = $2 WHERE id = $1 RETURNING *`,
    [id, active],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function dbFindBreedByNameSpecies(
  name: string,
  species: PetSpecies,
): Promise<BreedRecord | null> {
  const { rows } = await query<BreedRow>(
    `SELECT * FROM breeds WHERE lower(trim(name)) = lower(trim($1)) AND species = $2`,
    [name, species],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
