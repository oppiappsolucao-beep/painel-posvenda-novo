import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let databaseReady = false;

export function isDatabaseEnabled(): boolean {
  return databaseReady;
}

export function markDatabaseReady(): void {
  databaseReady = true;
}

export function markDatabaseUnavailable(): void {
  databaseReady = false;
  if (pool) {
    void pool.end().catch(() => undefined);
    pool = null;
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error("DATABASE_URL não configurada.");
    }
    pool = new Pool({
      connectionString,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function tryReconnectDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL?.trim()) return false;
  try {
    await query("SELECT 1");
    markDatabaseReady();
    return true;
  } catch {
    markDatabaseUnavailable();
    try {
      await query("SELECT 1");
      markDatabaseReady();
      return true;
    } catch {
      return false;
    }
  }
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number | null }> {
  return getPool().query(text, params) as Promise<{ rows: T[]; rowCount: number | null }>;
}
