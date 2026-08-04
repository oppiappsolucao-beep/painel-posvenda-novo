import { isDatabaseEnabled, markDatabaseReady, markDatabaseUnavailable, query } from "./client.js";
import { importLegacyFileDataIfNeeded } from "./importLegacy.js";
import { migrateSchema } from "./migrate.js";

export async function initDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    markDatabaseUnavailable();
    console.log("[db] DATABASE_URL não definida — usando arquivos locais em backend/data/");
    return;
  }

  try {
    await migrateSchema();
    await importLegacyFileDataIfNeeded();
    await query("SELECT 1");
    markDatabaseReady();
    console.log("[db] PostgreSQL conectado — assinaturas e anexos persistidos no banco.");
  } catch (e) {
    markDatabaseUnavailable();
    throw e;
  }
}

export async function getDatabaseHealth(): Promise<{ enabled: boolean; ok: boolean }> {
  if (!process.env.DATABASE_URL?.trim()) return { enabled: false, ok: true };
  if (!isDatabaseEnabled()) return { enabled: true, ok: false };
  try {
    await query("SELECT 1");
    return { enabled: true, ok: true };
  } catch {
    return { enabled: true, ok: false };
  }
}
