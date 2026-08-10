/**
 * Deploy em produção: apaga contratos Raissa (planilha + ZapSign) e cria um novo.
 *
 * Uso:
 *   node scripts/reset-raissa-production.mjs
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const BASE = (process.env.PRODUCTION_API_URL || "https://skoobpet.oppitech.com.br/api").replace(/\/$/, "");
const FIN_USER = process.env.FIN_USER || "controle@skoobpet.com.br";
const FIN_PASS = process.env.FIN_PASS || "skoobdiretoria123";
const ZAPSIGN_API = "https://api.zapsign.com.br/api/v1";
const zapsignToken = process.env.ZAPSIGN_API_TOKEN?.trim();

process.env.ZAPSIGN_SEND_EMAIL = process.env.ZAPSIGN_SEND_EMAIL || "true";
process.env.ZAPSIGN_EMAIL_VIA_SMTP = process.env.ZAPSIGN_EMAIL_VIA_SMTP || "true";
process.env.ZAPSIGN_SEND_WHATSAPP = process.env.ZAPSIGN_SEND_WHATSAPP || "true";
process.env.ZAPSIGN_CLIENT_AUTH_MODE = process.env.ZAPSIGN_CLIENT_AUTH_MODE || "tokenWhatsapp";
process.env.ZAPSIGN_LOJA_AUTH_MODE = process.env.ZAPSIGN_LOJA_AUTH_MODE || "tokenWhatsapp";

const contrato = {
  Nome: "Raissa",
  Telefone: "(11) 96848-2180",
  CPF: "529.982.247-25",
  "E-mail": "kaineenetwork@gmail.com",
  Endereço: "Rua das Flores",
  Número: "100",
  Complemento: "",
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
  Observações: "Contrato teste assinatura Raissa + Oppi",
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

function parseCookies(setCookie) {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.map((c) => String(c).split(";")[0]).join("; ");
}

async function api(path, init = {}, cookie = "") {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers || {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new Error(data.error || text || res.statusText);
  return { data, cookie: parseCookies(res.headers.getSetCookie?.() || res.headers.get("set-cookie")) };
}

async function zapsignDelete(docToken) {
  if (!zapsignToken) throw new Error("ZAPSIGN_API_TOKEN ausente");
  const res = await fetch(`${ZAPSIGN_API}/docs/${docToken}/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${zapsignToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
}

console.log("Login financeiro...");
const login = await api("/auth/login", {
  method: "POST",
  body: { username: FIN_USER, password: FIN_PASS, role: "financeiro" },
});
const cookie = login.cookie;
if (!cookie) console.warn("Sem cookie — continuando.");

console.log("Buscando contratos Raissa...");
const status = await api("/dashboard/status-assinatura?nome=Raissa", {}, cookie);
const items = (status.data.items || []).filter(
  (item) => String(item.nome || "").trim().toLowerCase() === "raissa" && item.unitKey === "campinas",
);
console.log(`Encontrados: ${items.length}`);

for (const item of items) {
  if (item.docToken) {
    console.log(`Apagando ZapSign ${item.docToken}...`);
    await zapsignDelete(item.docToken);
  }
}

const indices = [...items.map((i) => i.sheetIndex)].sort((a, b) => b - a);
for (const sheetIndex of indices) {
  console.log(`Apagando planilha linha index ${sheetIndex}...`);
  try {
    await api(`/dashboard/contracts/campinas/${sheetIndex}`, { method: "DELETE" }, cookie);
  } catch (e) {
    console.warn(`  DELETE falhou: ${e instanceof Error ? e.message : e}`);
  }
}

if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.warn("SMTP não configurado localmente — link da loja pode ir só por WhatsApp.");
}

console.log("Criando novo contrato ZapSign...");
const { createCampinasContractDocument } = await import("../dist/services/zapsign.js");
const externalId = `campinas:raissa-${Date.now()}`;
const doc = await createCampinasContractDocument(contrato, externalId);

console.log("Registrando na planilha via produção...");
const registered = await api(
  "/dashboard/contracts/register-zapsign",
  {
    method: "POST",
    body: {
      unitKey: "campinas",
      contrato,
      zapsign: {
        docToken: doc.docToken,
        signUrl: doc.signUrl,
        storeSignUrl: doc.storeSignUrl,
        storeEmail: doc.storeEmail || contrato["E-mail Loja"],
      },
    },
  },
  cookie,
);

console.log("\n=== Pronto ===");
console.log("Planilha:", registered.data.message || registered.data);
console.log("Documento:", doc.docToken);
console.log("Cliente (Raissa):", doc.signUrl);
console.log("WhatsApp cliente:", contrato.Telefone);
console.log("Loja (Oppi):", doc.storeSignUrl);
console.log("WhatsApp loja:", contrato["Telefone Loja"]);
console.log("E-mail loja backup:", doc.storeEmailSent ? doc.storeEmail : "não");
