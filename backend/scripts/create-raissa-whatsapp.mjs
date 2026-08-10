/**
 * Cria contrato Raissa no ZapSign (WhatsApp) e registra na planilha de produção.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const ZAPSIGN_API = "https://api.zapsign.com.br/api/v1";
const token = process.env.ZAPSIGN_API_TOKEN?.trim();
if (!token) {
  console.error("ZAPSIGN_API_TOKEN ausente");
  process.exit(1);
}

process.env.ZAPSIGN_SANDBOX = "false";
process.env.ZAPSIGN_SEND_WHATSAPP = "false";
process.env.ZAPSIGN_SEND_EMAIL = "true";
process.env.ZAPSIGN_EMAIL_VIA_SMTP = "true";
process.env.ZAPSIGN_CLIENT_AUTH_MODE = "tokenEmail";
process.env.ZAPSIGN_LOJA_AUTH_MODE = "tokenEmail";
process.env.ZAPSIGN_BRAND_NAME = process.env.ZAPSIGN_BRAND_NAME || "SkoobPet";
process.env.ZAPSIGN_EMAIL_VIA_SMTP = "true";

const contrato = {
  Nome: "Raissa",
  Telefone: "(11) 96848-2180",
  CPF: "529.982.247-25",
  "E-mail": "kaineenetwork@gmail.com",
  Endereço: "Rua das Flores",
  Número: "100",
  Bairro: "Cambuí",
  CEP: "13025-320",
  Cidade: "Campinas",
  Estado: "SP",
  RG: "12.345.678-9",
  "Nome do animal": "Luna",
  Espécie: "CANINA",
  Raça: "Shih Tzu",
  Sexo: "FÊMEA",
  Cor: "Branco",
  Pelagem: "LONGA",
  Microchip: "985112004567891",
  "Nascimento filhote": "10/02/2026",
  Observações: "Teste por e-mail — Raissa + Oppi",
  "Data Compra": "07/08/2026",
  Mês: "2026-08",
  "Valor Filhote": "4.500,00",
  "Valor por extenso": "quatro mil e quinhentos reais",
  "Forma de pagamento": "PIX",
  "Quantidade de parcelas": "1",
  Vendedora: "Oppi",
  "E-mail Loja": "oppiappsolucao@gmail.com",
  "Telefone Loja": "11942157917",
  Unidade: "Campinas",
};

const OLD_DOCS = ["1e19b0ac-1779-4392-b8c4-a94be483d0a9"];

async function zapsign(pathname, init = {}) {
  const res = await fetch(`${ZAPSIGN_API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }
  return { ok: res.ok, status: res.status, data, text };
}

for (const docId of OLD_DOCS) {
  console.log(`Apagando doc anterior ${docId}...`);
  const del = await zapsign(`/docs/${docId}/`, { method: "DELETE" });
  console.log(`  ${del.ok || del.status === 404 ? "ok" : del.text}`);
}

console.log("Criando contrato ZapSign (envio por e-mail SMTP)...");
const { createCampinasContractDocument } = await import("../dist/services/zapsign.js");
const externalId = `campinas:raissa-wa-${Date.now()}`;
const doc = await createCampinasContractDocument(contrato, externalId);

const detail = await zapsign(`/docs/${doc.docToken}/`);
const signers = detail.data.signers || [];

console.log("\n=== Contrato criado ===");
console.log("Documento:", doc.docToken);
console.log("Sandbox:", detail.data.sandbox);
for (const s of signers) {
  console.log(`\n${s.name}:`);
  console.log("  Telefone:", s.phone_number);
  console.log("  Auth:", s.auth_mode);
  console.log("  Link:", s.sign_url || `https://app.zapsign.com.br/verificar/${s.token}`);
}

console.log("\nE-mail: kaineenetwork@gmail.com (Raissa) e oppiappsolucao@gmail.com (Oppi).");
console.log("Código de verificação por e-mail ao abrir o link (tokenEmail).");

const BASE = (process.env.PRODUCTION_API_URL || "https://skoobpet.oppitech.com.br/api").replace(/\/$/, "");
const FIN_USER = process.env.FIN_USER || "controle@skoobpet.com.br";
const FIN_PASS = process.env.FIN_PASS || "skoobdiretoria123";

try {
  console.log("\nRegistrando no painel de produção...");
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: FIN_USER, password: FIN_PASS, role: "financeiro" }),
  });
  const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];

  const statusRes = await fetch(`${BASE}/dashboard/status-assinatura?nome=Raissa`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  if (statusRes.ok) {
    const status = await statusRes.json();
    const items = (status.items || []).filter((i) => i.unitKey === "campinas");
    for (const item of items) {
      console.log(`Apagando linha planilha index ${item.sheetIndex}...`);
      await fetch(`${BASE}/dashboard/contracts/campinas/${item.sheetIndex}`, {
        method: "DELETE",
        headers: cookie ? { Cookie: cookie } : {},
      });
    }
  }

  const regRes = await fetch(`${BASE}/dashboard/contracts/register-zapsign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({
      unitKey: "campinas",
      contrato,
      zapsign: {
        docToken: doc.docToken,
        signUrl: doc.signUrl,
        storeSignUrl: doc.storeSignUrl,
        storeEmail: contrato["E-mail Loja"],
      },
    }),
  });
  const regText = await regRes.text();
  console.log(regRes.ok ? "Planilha:" : "Planilha (erro):", regText.slice(0, 200));
} catch (err) {
  console.warn("Não foi possível registrar na planilha:", err instanceof Error ? err.message : err);
}
