import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../data/zapsign-sandbox-env.txt");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const token = process.env.ZAPSIGN_SANDBOX_API_TOKEN;
const templateId = process.env.ZAPSIGN_SANDBOX_TEMPLATE_ID_CAMPINAS;
if (!token || !templateId) {
  console.error("Missing ZAPSIGN_SANDBOX_API_TOKEN or ZAPSIGN_SANDBOX_TEMPLATE_ID_CAMPINAS");
  process.exit(1);
}

const API = "https://sandbox.api.zapsign.com.br/api/v1";
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function req(pathname, init = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
    body: init.json ? JSON.stringify(init.json) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

const clientFields = [
  {
    variable: "{{carteirinha}}",
    input_type: "radio",
    label: "Você recebeu a carteirinha de vacinação?",
    help_text: "Carteira de Vacinação atualizada",
    options: "Sim, recebi !;Não recebi !",
    required: true,
    order: 20,
  },
  {
    variable: "{{certificado}}",
    input_type: "radio",
    label: "Você recebeu o certificado do microchip?",
    help_text: "Certificado de Microchip",
    options: "Sim, recebi !;Não recebi !",
    required: true,
    order: 21,
  },
  {
    variable: "{{transferencia}}",
    input_type: "radio",
    label: "Deseja transferir o documento para o seu nome? (vem no nome da loja)",
    help_text: "Pedigree com transferência — taxa R$ 249,90",
    options:
      "Sim, desejo o Pedigree com transferência para o meu nome.;Não desejo o Pedigree com transferência para o meu nome.;Vou pensar !",
    required: true,
    order: 22,
  },
  {
    variable: "{{pedigree}}",
    input_type: "radio",
    label: "O pedigree será entregue via correios pela taxa de 35,00 reais",
    help_text: "AR — Carta Registrada via Correios",
    options: "Sim, aceito pagar pela taxa !;Não aceito pagar pela taxa !;Vou pensar !",
    required: true,
    order: 23,
  },
  {
    variable: "{{atestado}}",
    input_type: "radio",
    label: "Você recebeu o atestado de saúde do filhote?",
    help_text: "Atestado de Saúde",
    options: "Sim, recebi !;Não recebi !",
    required: true,
    order: 24,
  },
];

const detail = await req(`/templates/${templateId}/`);
console.log("Signatários antes:", (detail.signers || []).map((s) => s.name));

await req("/templates/update-form/", {
  method: "POST",
  json: {
    template_id: templateId,
    custom_intro:
      "Loja: informe o CNPJ e anexe os documentos do filhote. Cliente: confirme abaixo o que recebeu.",
    hide_prefilled_fields: true,
    inputs: clientFields,
  },
});

try {
  await req(`/templates/${templateId}/`, {
    method: "PUT",
    json: {
      signers: [
        {
          name: "SkoobPet",
          email: "contato@skoobpet.com.br",
          phone_country: "55",
          phone_number: "11942157917",
          auth_mode: "assinaturaTela",
          qualification: "lojista",
        },
        {
          name: "{{contratante-nome-completo}}",
          email: "{{e-mail}}",
          phone_country: "55",
          phone_number: "{{celular}}",
          auth_mode: "tokenEmail",
          qualification: "cliente",
          require_document_photo: true,
        },
      ],
    },
  });
} catch (e) {
  console.warn("PUT signers falhou (configure no painel Editar modelo):", e.message);
}

const after = await req(`/templates/${templateId}/`);
console.log("Signatários depois:", (after.signers || []).map((s) => s.name));
console.log(
  "Radios:",
  (after.inputs || [])
    .filter((i) =>
      ["carteirinha", "certificado", "transferencia", "pedigree", "atestado"].some((v) =>
        String(i.variable || "").includes(v),
      ),
    )
    .map((i) => ({ v: i.variable, type: i.input_type, label: i.label })),
);
