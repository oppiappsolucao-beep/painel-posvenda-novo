import { getUnitByKey, UnitKey } from "../config.js";
import type { EmployeeRecord } from "../services/employees.js";
import { query } from "./client.js";

interface EmployeeRow {
  id: number;
  name: string;
  unit_key: UnitKey;
  active: boolean;
  created_at: string;
}

function mapRow(row: EmployeeRow): EmployeeRecord {
  return {
    id: row.id,
    name: row.name,
    unitKey: row.unit_key,
    unitLabel: getUnitByKey(row.unit_key)?.label || row.unit_key,
    active: row.active,
    createdAt: row.created_at,
  };
}

export async function dbListEmployees(opts?: {
  unitKey?: UnitKey;
  activeOnly?: boolean;
}): Promise<EmployeeRecord[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (opts?.unitKey) {
    params.push(opts.unitKey);
    clauses.push(`unit_key = $${params.length}`);
  }
  if (opts?.activeOnly) {
    clauses.push("active = true");
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await query<EmployeeRow>(
    `SELECT * FROM employees ${where} ORDER BY active DESC, name ASC`,
    params,
  );
  return rows.map(mapRow);
}

export async function dbInsertEmployee(
  name: string,
  unitKey: UnitKey,
  createdAt: string,
): Promise<EmployeeRecord> {
  const { rows } = await query<EmployeeRow>(
    `INSERT INTO employees (name, unit_key, active, created_at)
     VALUES ($1, $2, true, $3)
     RETURNING *`,
    [name, unitKey, createdAt],
  );
  return mapRow(rows[0]);
}

export async function dbSetEmployeeActive(id: number, active: boolean): Promise<EmployeeRecord | null> {
  const { rows } = await query<EmployeeRow>(
    `UPDATE employees SET active = $2 WHERE id = $1 RETURNING *`,
    [id, active],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function dbFindEmployeeByNameUnit(
  name: string,
  unitKey: UnitKey,
): Promise<EmployeeRecord | null> {
  const { rows } = await query<EmployeeRow>(
    `SELECT * FROM employees WHERE lower(trim(name)) = lower(trim($1)) AND unit_key = $2`,
    [name, unitKey],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
