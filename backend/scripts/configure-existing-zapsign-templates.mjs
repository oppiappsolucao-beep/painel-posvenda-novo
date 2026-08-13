/**
 * Configura os 3 modelos ZapSign já cadastrados (sem criar novos):
 * loja 1º, cliente 2º, radios + RG frente/verso, CNPJ na loja.
 *
 * Uso:
 *   node --use-system-ca scripts/configure-existing-zapsign-templates.mjs
 *   ZAPSIGN_SANDBOX=true node --use-system-ca scripts/configure-existing-zapsign-templates.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { configureAllExistingUnitTemplates } from "../dist/services/zapsign.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envRestore = path.join(__dirname, "../data/easypanel-env-restore.txt");
if (fs.existsSync(envRestore)) {
  for (const line of fs.readFileSync(envRestore, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}
dotenv.config({ path: path.join(__dirname, "../.env"), override: true });

process.env.ZAPSIGN_CONFIGURE_FORM = "true";

if (!process.env.ZAPSIGN_API_TOKEN?.trim() && process.env.ZAPSIGN_SANDBOX_API_TOKEN?.trim()) {
  process.env.ZAPSIGN_API_TOKEN = process.env.ZAPSIGN_SANDBOX_API_TOKEN;
}

if (!process.env.ZAPSIGN_API_TOKEN?.trim()) {
  console.error("ZAPSIGN_API_TOKEN ausente");
  process.exit(1);
}

const sandbox = process.env.ZAPSIGN_SANDBOX === "true";
console.log(`Ambiente: ${sandbox ? "sandbox" : "produção"}`);

const results = await configureAllExistingUnitTemplates();
for (const item of results) {
  const status = item.ok ? "OK" : "ERRO";
  console.log(`[${status}] ${item.unitKey}: ${item.templateId}${item.error ? ` — ${item.error}` : ""}`);
}

if (results.some((item) => !item.ok)) process.exit(1);
console.log("\nConcluído — modelos existentes configurados (nenhum template novo criado).");
