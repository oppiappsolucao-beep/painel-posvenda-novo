/**
 * Garante 2 signatários no modelo + 5 radios do cliente (produção, 3 unidades).
 * Uso: node --use-system-ca scripts/fix-production-client-radios.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyCampinasClientForm,
  ensureTemplateTwoSigners,
} from "../dist/services/zapsignFormConfig.js";
import { getZapSignProductionTemplateId, ZAPSIGN_UNIT_KEYS } from "../dist/config/zapsignEnv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../data/easypanel-env-restore.txt");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const token = process.env.ZAPSIGN_API_TOKEN?.trim();
if (!token) {
  console.error("ZAPSIGN_API_TOKEN ausente");
  process.exit(1);
}

const base = "https://api.zapsign.com.br/api/v1";

async function zapsignRequest(pathname, init = {}) {
  const res = await fetch(`${base}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.json ? { "Content-Type": "application/json" } : {}),
    },
    body: init.json ? JSON.stringify(init.json) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : text || `HTTP ${res.status}`);
  }
  return data;
}

for (const unitKey of ZAPSIGN_UNIT_KEYS) {
  const templateId = getZapSignProductionTemplateId(unitKey);
  if (!templateId) {
    console.warn(`Sem template de produção para ${unitKey}`);
    continue;
  }

  console.log(`\n=== ${unitKey} (${templateId}) ===`);
  const before = await zapsignRequest(`/templates/${templateId}/`);
  console.log(
    "Antes:",
    (before.signers || []).map((s) => `${s.name} [${s.qualification || "-"}]`).join(" → ") ||
      "(sem signatários)",
  );

  await ensureTemplateTwoSigners(templateId, unitKey, zapsignRequest);
  await applyCampinasClientForm(templateId, unitKey, zapsignRequest);

  const after = await zapsignRequest(`/templates/${templateId}/`);
  const radios = (after.inputs || []).filter((i) => i.input_type === "radio");
  console.log(
    "Depois:",
    (after.signers || []).map((s) => `${s.name} [${s.qualification || "-"}]`).join(" → "),
  );
  console.log(`Radios cliente: ${radios.length}`);
  for (const r of radios) {
    console.log(`  • ${r.label}`);
  }
  console.log(`Painel: https://app.zapsign.com.br/conta/modelos/${templateId}`);
}

console.log("\nOK — gere um contrato NOVO para testar as 5 perguntas do cliente.");
