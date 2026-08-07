/**
 * Cria contrato teste Raissa: ZapSign + e-mails (SMTP produção) + planilha.
 *
 * Uso:
 *   node scripts/create-raissa-test-production.mjs
 *
 * Requer SMTP_* no ambiente (ou backend/.env) para disparar e-mails.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const BASE = (process.env.PRODUCTION_API_URL || "https://skoobpet.oppitech.com.br/api").replace(/\/$/, "");
const FIN_USER = process.env.FIN_USER || "controle@skoobpet.com.br";
const FIN_PASS = process.env.FIN_PASS || "skoobdiretoria123";

const contrato = {
  Nome: "Raissa",
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
  Observações: "Contrato teste assinatura Raissa + Higo",
  "Data Compra": "07/08/2026",
  Mês: "2026-08",
  "Valor Filhote": "4.500,00",
  "Valor por extenso": "quatro mil e quinhentos reais",
  "Forma de pagamento": "PIX",
  "Quantidade de parcelas": "1",
  Vendedora: "Higo",
  "E-mail Loja": "silvaphigo@gmail.com",
  "Telefone Loja": process.env.ZAPSIGN_LOJA_PHONE || "19991833826",
  Unidade: "Campinas",
};

process.env.ZAPSIGN_SEND_EMAIL = process.env.ZAPSIGN_SEND_EMAIL || "true";
process.env.ZAPSIGN_EMAIL_VIA_SMTP = process.env.ZAPSIGN_EMAIL_VIA_SMTP || "true";

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

async function main() {
  if (!process.env.ZAPSIGN_API_TOKEN?.trim()) {
    throw new Error("ZAPSIGN_API_TOKEN ausente no .env");
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("Configure SMTP_HOST, SMTP_USER e SMTP_PASS para disparar e-mails.");
  }

  const { createCampinasContractDocument } = await import("../dist/services/zapsign.js");
  const externalId = `campinas:raissa-test-${Date.now()}`;

  console.log("Criando documento ZapSign e disparando e-mails...");
  const doc = await createCampinasContractDocument(contrato, externalId);

  console.log("Login financeiro para registrar na planilha...");
  const login = await api("/auth/login", {
    method: "POST",
    body: { username: FIN_USER, password: FIN_PASS, role: "financeiro" },
  });

  console.log("Registrando na planilha Campinas...");
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

  console.log("\n=== Contrato teste Raissa ===");
  console.log("Planilha:", registered.data.message || registered.data);
  console.log("Documento:", doc.docToken);
  console.log("Cliente (Raissa):", doc.signUrl);
  console.log("E-mail cliente:", doc.emailSent ? doc.clientEmail : "não");
  console.log("Loja (Higo):", doc.storeSignUrl || "(ver ZapSign)");
  console.log("E-mail loja:", doc.storeEmailSent ? doc.storeEmail : "não");
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : err);
  process.exit(1);
});
