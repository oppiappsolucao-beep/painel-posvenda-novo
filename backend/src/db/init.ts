import { isDatabaseEnabled, query } from "./client.js";
import { importLegacyFileDataIfNeeded } from "./importLegacy.js";
import { migrateSchema } from "./migrate.js";

export async function initDatabase(): Promise<void> {
  if (!isDatabaseEnabled()) {
    console.log("[db] DATABASE_URL não definida — usando arquivos locais em backend/data/");
    return;
  }

  await migrateSchema();
  await importLegacyFileDataIfNeeded();
  await query("SELECT 1");
  console.log("[db] PostgreSQL conectado — assinaturas e anexos persistidos no banco.");
}

export async function getDatabaseHealth(): Promise<{ enabled: boolean; ok: boolean }> {
  if (!isDatabaseEnabled()) return { enabled: false, ok: true };
  try {
    await query("SELECT 1");
    return { enabled: true, ok: true };
  } catch {
    return { enabled: true, ok: false };
  }
}
