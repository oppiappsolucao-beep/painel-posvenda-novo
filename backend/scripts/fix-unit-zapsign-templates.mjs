/**
 * Recria templates limpos de Piracicaba/Indaiatuba com nome e DOCX da unidade correta.
 * Uso: node --use-system-ca scripts/fix-unit-zapsign-templates.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyCampinasClientForm,
  buildCleanTemplateSigners,
} from "../dist/services/zapsignFormConfig.js";
import { getZapSignTemplateId, zapsignFolderPath } from "../dist/config/zapsignEnv.js";
import { getUnitByKey } from "../dist/config.js";
import {
  fixCampinasDocxPlaceholders,
  fixContractTextAlignmentInDocx,
  insertImageTermPageBreakInDocx,
  localizeUnitVendorInDocx,
  stripDocxHighlightsVerified,
} from "../dist/utils/docxStripHighlights.js";

function shouldLocalizeVendorFromCampinas(unitKey, sourceTemplateId) {
  if (unitKey === "campinas") return false;
  const campinasSource = getZapSignTemplateId("campinas");
  return Boolean(campinasSource && sourceTemplateId === campinasSource);
}

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
const UNITS = ["campinas", "piracicaba", "indaiatuba"];

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

async function downloadDocx(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download DOCX ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

for (const unitKey of UNITS) {
  const unitLabel = getUnitByKey(unitKey)?.label || unitKey;
  const sourceTemplateId = getZapSignTemplateId(unitKey);
  console.log(`\n=== ${unitKey} (fonte ${sourceTemplateId}) ===`);

  const source = await zapsignRequest(`/templates/${sourceTemplateId}/`);
  const docxBuffer = await downloadDocx(source.template_file);
  const { buffer: cleanDocx } = await stripDocxHighlightsVerified(docxBuffer);
  const fixedDocx = await fixCampinasDocxPlaceholders(cleanDocx);
  const localizedDocx = shouldLocalizeVendorFromCampinas(unitKey, sourceTemplateId)
    ? await localizeUnitVendorInDocx(fixedDocx, unitKey)
    : fixedDocx;
  const { buffer: pagedDocx, inserted } = await insertImageTermPageBreakInDocx(localizedDocx);
  console.log("Quebra de página no termo:", inserted ? "inserida" : "já existia ou título não encontrado");
  const { buffer: alignedDocx, bulletsFixed, justified } = await fixContractTextAlignmentInDocx(pagedDocx);
  console.log("Alinhamento:", { bulletsFixed, justified });

  const templateDisplayName = `Contrato Filhotes ${unitLabel} — assinatura`;
  const created = await zapsignRequest("/templates/create/", {
    method: "POST",
    json: {
      name: templateDisplayName,
      base64_docx: alignedDocx.toString("base64"),
      lang: "pt-br",
      folder_path: zapsignFolderPath(unitKey),
      signers: buildCleanTemplateSigners(unitKey),
    },
  });

  const templateId = created.token;
  await applyCampinasClientForm(templateId, unitKey, zapsignRequest);

  const verified = await zapsignRequest(`/templates/${templateId}/`);
  console.log("Novo template:", templateId);
  console.log("Nome:", verified.name);
  console.log(`Env: ZAPSIGN_PRODUCTION_TEMPLATE_ID_${unitKey.toUpperCase()}=${templateId}`);
  console.log(`Painel: https://app.zapsign.com.br/conta/modelos/${templateId}`);
}

console.log("\nAtualize as env vars no EasyPanel e faça redeploy.");
