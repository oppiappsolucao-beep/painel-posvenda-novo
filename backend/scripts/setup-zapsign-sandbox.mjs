/**
 * Copia o template Campinas de produção para o sandbox ZapSign e configura formulário.
 *
 * Uso:
 *   ZAPSIGN_SANDBOX_API_TOKEN=... node scripts/setup-zapsign-sandbox.mjs
 *
 * Requer no .env:
 *   ZAPSIGN_API_TOKEN (produção — só leitura do template)
 *   ZAPSIGN_TEMPLATE_ID_CAMPINAS
 *   ZAPSIGN_SANDBOX_API_TOKEN (token de https://sandbox.app.zapsign.com.br)
 */
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const PROD_API = "https://api.zapsign.com.br/api/v1";
const SANDBOX_API = "https://sandbox.api.zapsign.com.br/api/v1";

const prodToken = process.env.ZAPSIGN_API_TOKEN?.trim();
const sandboxToken = process.env.ZAPSIGN_SANDBOX_API_TOKEN?.trim();
const sourceTemplateId = process.env.ZAPSIGN_TEMPLATE_ID_CAMPINAS?.trim();

if (!prodToken || !sourceTemplateId) {
  console.error("Defina ZAPSIGN_API_TOKEN e ZAPSIGN_TEMPLATE_ID_CAMPINAS no .env");
  process.exit(1);
}
if (!sandboxToken) {
  console.error("Defina ZAPSIGN_SANDBOX_API_TOKEN (token do sandbox.app.zapsign.com.br)");
  process.exit(1);
}

const CLIENT_FORM = [
  { variable: "{{carteirinha}}", input_type: "radio", label: "Você recebeu a carteirinha de vacinação?", help_text: "Carteira de Vacinação atualizada", options: "Sim, recebi !;Não recebi !", required: true, order: 1 },
  { variable: "{{certificado}}", input_type: "radio", label: "Você recebeu o certificado do microchip?", help_text: "Certificado de Microchip", options: "Sim, recebi !;Não recebi !", required: true, order: 2 },
  { variable: "{{transferencia}}", input_type: "radio", label: "Deseja transferir o documento para o seu nome? (vem no nome da loja)", help_text: "Pedigree com transferência — taxa R$ 249,90", options: "Sim, desejo o Pedigree com transferência para o meu nome.;Não desejo o Pedigree com transferência para o meu nome.;Vou pensar !", required: true, order: 3 },
  { variable: "{{pedigree}}", input_type: "radio", label: "O pedigree será entregue via correios pela taxa de 35,00 reais", help_text: "AR — Carta Registrada via Correios", options: "Sim, aceito pagar pela taxa !;Não aceito pagar pela taxa !;Vou pensar !", required: true, order: 4 },
  { variable: "{{atestado}}", input_type: "radio", label: "Você recebeu o atestado de saúde do filhote?", help_text: "Atestado de Saúde", options: "Sim, recebi !;Não recebi !", required: true, order: 5 },
  { variable: "{{contratante-cpf}}", input_type: "cpf", label: "Contratante CPF", help_text: "Preencha seu CPF", required: true, order: 6 },
  { variable: "{{celular}}", input_type: "phone_br", label: "Celular", help_text: "Insira seu contato principal", required: true, order: 7 },
  { variable: "{{e-mail}}", input_type: "email", label: "E-mail", help_text: "Insira seu e-mail", required: true, order: 8 },
];

const STORE_FORM = [
  { variable: "", input_type: "cnpj", label: "CNPJ da loja", help_text: "Informe o CNPJ da loja", required: true, order: 49 },
  { variable: "", input_type: "upload", label: "Comprovante de vacina - frente", help_text: "Carteirinha de vacinação (frente)", required: true, order: 50 },
  { variable: "", input_type: "upload", label: "Comprovante de vacina - verso", help_text: "Carteirinha de vacinação (verso)", required: true, order: 51 },
  { variable: "", input_type: "upload", label: "Foto do filhote", help_text: "Foto do filhote adquirido", required: true, order: 52 },
  { variable: "", input_type: "upload", label: "Atestado de saúde", help_text: "Atestado de saúde do filhote", required: true, order: 53 },
];

async function api(base, token, pathname, init = {}) {
  const res = await fetch(`${base}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.json ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    body: init.json ? JSON.stringify(init.json) : init.body,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }
  if (!res.ok) throw new Error(data.detail || text || `HTTP ${res.status}`);
  return data;
}

async function downloadAndPrepareDocx(templateFileUrl) {
  const { default: JSZip } = await import("jszip");
  const res = await fetch(templateFileUrl);
  if (!res.ok) throw new Error(`Falha ao baixar DOCX (${res.status})`);
  let docx = Buffer.from(await res.arrayBuffer());

  const zip = await JSZip.loadAsync(docx);
  let fixedCount = 0;
  for (const name of Object.keys(zip.files)) {
    const file = zip.files[name];
    if (!file || file.dir || !/\.xml$/i.test(name)) continue;
    const xml = await file.async("string");
    const fixedXml = xml.replace(
      /(<w:t(?:\s[^>]*)?>)\s*nome-completo\}\}(\s*<\/w:t>)/g,
      "$1{{nome-completo}}$2",
    );
    if (fixedXml !== xml) {
      fixedCount += (xml.match(/(<w:t(?:\s[^>]*)?>)\s*nome-completo\}\}(\s*<\/w:t>)/g) || []).length;
      zip.file(name, fixedXml);
    }
  }
  if (fixedCount > 0) {
    docx = Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    console.log(
      `Corrigido placeholder nome-completo}} → {{nome-completo}} (${fixedCount}x)`,
    );
  }
  return docx;
}

async function main() {
  console.log("1) Baixando template de produção...");
  const source = await api(PROD_API, prodToken, `/templates/${sourceTemplateId}/`);
  if (!source.template_file) throw new Error("template_file ausente na produção");
  const docx = await downloadAndPrepareDocx(source.template_file);

  console.log("2) Criando template no sandbox...");
  const created = await api(SANDBOX_API, sandboxToken, "/templates/create/", {
    method: "POST",
    json: {
      name: source.name || "Contrato Filhotes Campinas",
      base64_docx: docx.toString("base64"),
      lang: "pt-br",
      folder_path: "/campinas/",
      signers: [
        {
          name: "{{nome-sobrenome}}",
          auth_mode: "assinaturaTela-tokenEmail",
          blank_email: false,
          blank_phone: false,
          lock_name: true,
          qualification: "",
        },
        {
          name: "Loja Campinas",
          auth_mode: "assinaturaTela-tokenEmail",
          blank_email: false,
          blank_phone: false,
          lock_name: true,
          qualification: "lojista",
        },
      ],
    },
  });

  const sandboxTemplateId = created.token;
  if (!sandboxTemplateId) throw new Error("Sandbox não retornou token do template");

  console.log("3) Configurando formulário do cliente...");
  await api(SANDBOX_API, sandboxToken, "/templates/update-form/", {
    method: "POST",
    json: {
      template_id: sandboxTemplateId,
      custom_intro:
        "Confirme seus dados e responda sobre a documentação do filhote antes de assinar o contrato.",
      youtube_video_code: "",
      hide_prefilled_fields: true,
      inputs: CLIENT_FORM,
    },
  });

  console.log("4) IMPORTANTE: anexos da loja ficam em Opções avançadas do SIGNATÁRIO 2 (lojista):");
  console.log("   https://sandbox.app.zapsign.com.br/conta/modelos/" + sandboxTemplateId);
  console.log("   → Configurar modelo → Editar modelo → Signatário 2 → Opções avançadas");
  console.log("   Adicione: Atestado de Saúde, Carteirinha frente/verso, Foto do filhote");

  const verified = await api(SANDBOX_API, sandboxToken, `/templates/${sandboxTemplateId}/`);
  const uploads = (verified.inputs || []).filter((i) => i.input_type === "upload").length;
  const signers = verified.signers?.length || 0;

  const outDir = path.dirname(fileURLToPath(import.meta.url));
  const envSnippet = [
    "ZAPSIGN_SANDBOX=true",
    `ZAPSIGN_SANDBOX_API_TOKEN=${sandboxToken}`,
    `ZAPSIGN_SANDBOX_TEMPLATE_ID_CAMPINAS=${sandboxTemplateId}`,
    "ZAPSIGN_SEND_EMAIL=true",
    "ZAPSIGN_EMAIL_VIA_SMTP=true",
    "ZAPSIGN_SEND_WHATSAPP=false",
    "ZAPSIGN_CLIENT_AUTH_MODE=tokenEmail",
    "ZAPSIGN_LOJA_AUTH_MODE=tokenEmail",
  ].join("\n");

  const outFile = path.join(outDir, "../data/zapsign-sandbox-env.txt");
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, envSnippet + "\n", "utf8");

  console.log("\n✓ Sandbox configurado!");
  console.log("  Template ID:", sandboxTemplateId);
  console.log("  Signatários:", signers);
  console.log("  Uploads:", uploads);
  console.log("\nCole no EasyPanel (.env):\n");
  console.log(envSnippet);
  console.log(`\nSalvo em: ${outFile}`);
}

main().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});
