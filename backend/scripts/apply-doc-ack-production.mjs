import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resetProductionTemplateCache,
  warmUpZapSignTemplates,
} from "../dist/services/zapsign.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../data/easypanel-env-restore.txt");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

console.log("Resetando cache de templates limpos...");
await resetProductionTemplateCache();

console.log("Recriando templates de produção + formulários (3 unidades)...");
await warmUpZapSignTemplates();

console.log("OK — cláusula 3.1 atualizada: só aparece a resposta assinalada pelo cliente.");
