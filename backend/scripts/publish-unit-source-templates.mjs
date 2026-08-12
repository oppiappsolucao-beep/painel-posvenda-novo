/**
 * Publica em PRODUÇÃO os modelos-fonte de Piracicaba e Indaiatuba
 * (copia o DOCX do sandbox, onde cada unidade já tem endereço/CNPJ corretos).
 *
 * Uso: node --use-system-ca scripts/publish-unit-source-templates.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../data/easypanel-env-restore.txt");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const PROD_API = "https://api.zapsign.com.br/api/v1";
const SANDBOX_API = "https://sandbox.api.zapsign.com.br/api/v1";

const prodToken = process.env.ZAPSIGN_API_TOKEN?.trim();
const sandboxToken = process.env.ZAPSIGN_SANDBOX_API_TOKEN?.trim();

const UNITS = {
  piracicaba: {
    sandboxId: process.env.ZAPSIGN_SANDBOX_TEMPLATE_ID_PIRACICABA?.trim() || "170e545f-91b7-4969-a653-a3bf2bc74460",
    prodName: "Contrato Filhotes Piracicaba",
    folder: "/piracicaba/",
  },
  indaiatuba: {
    sandboxId: process.env.ZAPSIGN_SANDBOX_TEMPLATE_ID_INDAIATUBA?.trim() || "de559b08-e3aa-4a73-88e0-0f49911cc922",
    prodName: "Contrato Filhotes Indaiatuba",
    folder: "/indaiatuba/",
  },
};

async function api(base, token, pathname, init = {}) {
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

async function main() {
  if (!prodToken || !sandboxToken) {
    console.error("Defina ZAPSIGN_API_TOKEN e ZAPSIGN_SANDBOX_API_TOKEN");
    process.exit(1);
  }

  const results = {};
  for (const [unitKey, config] of Object.entries(UNITS)) {
    console.log(`\n=== ${unitKey} (sandbox ${config.sandboxId}) ===`);
    const sandbox = await api(SANDBOX_API, sandboxToken, `/templates/${config.sandboxId}/`);
    if (!sandbox.template_file) throw new Error(`template_file ausente no sandbox (${unitKey})`);

    const docx = await downloadDocx(sandbox.template_file);
    const created = await api(PROD_API, prodToken, "/templates/create/", {
      method: "POST",
      json: {
        name: config.prodName,
        base64_docx: docx.toString("base64"),
        lang: "pt-br",
        folder_path: config.folder,
        signers: [
          {
            name: "{{nome-completo}}",
            email: "{{e-mail}}",
            phone_country: "55",
            phone_number: "{{celular}}",
            auth_mode: "tokenEmail",
            qualification: "cliente",
            blank_email: false,
            blank_phone: false,
            lock_name: true,
          },
          {
            name: "SkoobPet",
            auth_mode: "assinaturaTela",
            qualification: "lojista",
            blank_email: false,
            blank_phone: false,
            lock_name: true,
          },
        ],
      },
    });

    const templateId = String(created.token || "").trim();
    if (!templateId) throw new Error(`create não retornou token (${unitKey})`);
    results[unitKey] = templateId;

    const verified = await api(PROD_API, prodToken, `/templates/${templateId}/`);
    console.log("Modelo-fonte produção:", templateId);
    console.log("Nome:", verified.name);
    console.log(`Env: ZAPSIGN_TEMPLATE_ID_${unitKey.toUpperCase()}=${templateId}`);
    console.log(`Painel: https://app.zapsign.com.br/conta/modelos/${templateId}`);
  }

  console.log("\n--- Cole no EasyPanel (Ambiente) ---");
  console.log(`ZAPSIGN_TEMPLATE_ID_PIRACICABA=${results.piracicaba}`);
  console.log(`ZAPSIGN_TEMPLATE_ID_INDAIATUBA=${results.indaiatuba}`);
  console.log("\nDepois rode: node --use-system-ca scripts/fix-unit-zapsign-templates.mjs");
}

main().catch((e) => {
  console.error("Erro:", e.message || e);
  process.exit(1);
});
