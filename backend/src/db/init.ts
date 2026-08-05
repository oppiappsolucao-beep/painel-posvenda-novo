import { isDatabaseEnabled, markDatabaseReady, markDatabaseUnavailable, query } from "./client.js";
import { importLegacyFileDataIfNeeded } from "./importLegacy.js";
import { migrateSchema } from "./migrate.js";
import { seedDefaultBreedsIfEmpty } from "../services/breeds.js";
import { deactivateExampleEmployees, reactivateEmployeeByName } from "../services/employees.js";

export async function initDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    markDatabaseUnavailable();
    await seedDefaultBreedsIfEmpty();
    await deactivateExampleEmployees();
    console.log("[db] DATABASE_URL não definida — usando arquivos locais em backend/data/");
    return;
  }

  try {
    await migrateSchema();
    await importLegacyFileDataIfNeeded();
    await seedDefaultBreedsIfEmpty();
    const deactivatedExamples = await deactivateExampleEmployees();
    if (deactivatedExamples) {
      console.log(`[db] Desativados ${deactivatedExamples} funcionário(s) de exemplo/teste.`);
    }
    const restoredFran = await reactivateEmployeeByName("Fran");
    if (restoredFran) {
      console.log(`[db] Reativado(s) ${restoredFran} cadastro(s) de Fran.`);
    }
    await query("SELECT 1");
    markDatabaseReady();
    console.log("[db] PostgreSQL conectado — assinaturas, anexos e funcionários persistidos no banco.");
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
