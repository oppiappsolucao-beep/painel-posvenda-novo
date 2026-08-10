/**
 * Cria contrato teste Campinas: ZapSign (sandbox) + planilha produção SkoobPet.
 * Uso: node scripts/create-campinas-test-via-api.mjs
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const sandboxEnvPath = path.join(__dirname, "../data/zapsign-sandbox-env.txt");
if (fs.existsSync(sandboxEnvPath)) {
  for (const line of fs.readFileSync(sandboxEnvPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

process.env.ZAPSIGN_SANDBOX = "true";
process.env.ZAPSIGN_LOJA_AUTH_MODE = process.env.ZAPSIGN_LOJA_AUTH_MODE || "assinaturaTela";
process.env.ZAPSIGN_SEND_EMAIL = "false";
process.env.ZAPSIGN_CONFIGURE_FORM = "false";

const BASE = (process.env.API_BASE || "https://skoobpet.oppitech.com.br/api").replace(/\/$/, "");
const FIN_USER = process.env.FIN_USER || "controle@skoobpet.com.br";
const FIN_PASS = process.env.FIN_PASS || "skoobdiretoria123";

const contrato = {
  Nome: "Raissa Teste",
  Telefone: "(19) 98765-4321",
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
  Observações: "Contrato teste anexos loja — Cursor",
  "Data Compra": "10/08/2026",
  Mês: "2026-08",
  "Valor Filhote": "4.500,00",
  "Valor por extenso": "quatro mil e quinhentos reais",
  "Forma de pagamento": "PIX",
  "Quantidade de parcelas": "1",
  Vendedora: "Oppi",
  "E-mail Loja": "contato@skoobpet.com.br",
  Unidade: "Campinas",
};

function parseCookies(res) {
  if (typeof res.headers.getSetCookie === "function") {
    const list = res.headers.getSetCookie();
    if (list.length) return list.map((c) => String(c).split(";")[0]).join("; ");
  }
  const single = res.headers.get("set-cookie");
  if (!single) return "";
  return String(single)
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.trim().split(";")[0])
    .join("; ");
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
  return { ok: res.ok, status: res.status, data, cookie: parseCookies(res) };
}

async function main() {
  const { createCampinasContractDocument } = await import("../dist/services/zapsign.js");
  const externalId = `campinas:cursor-test-${Date.now()}`;

  console.log("1/3 Criando documento ZapSign (sandbox)...");
  const doc = await createCampinasContractDocument(contrato, externalId);

  console.log("2/3 Login financeiro (planilha produção)...");
  const login = await api("/auth/login", {
    method: "POST",
    body: { username: FIN_USER, password: FIN_PASS, role: "financeiro" },
  });
  if (!login.ok || !login.cookie) {
    throw new Error(`Login falhou (${login.status}): ${JSON.stringify(login.data)}`);
  }

  console.log("3/3 Registrando na planilha Campinas...");
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
    login.cookie,
  );
  if (!registered.ok) {
    throw new Error(`Registro falhou (${registered.status}): ${registered.data.error || JSON.stringify(registered.data)}`);
  }

  console.log("\n=== Contrato cadastrado no SkoobPet ===");
  console.log("Planilha:", registered.data.message || registered.data);
  console.log("Linha (sheetIndex):", registered.data.sheetIndex);
  console.log("Documento ZapSign:", doc.docToken);
  console.log("\n--- Links ---");
  console.log("Cliente (Raissa):", doc.signUrl);
  console.log("Loja (contato@skoobpet.com.br):", doc.storeSignUrl || "(não retornado)");
  console.log("\nVeja também na planilha: Link Assinatura + Link Assinatura Loja");
}

main().catch((err) => {
  console.error("Erro:", err.message || err);
  process.exit(1);
});
