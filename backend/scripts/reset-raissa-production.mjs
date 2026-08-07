/**
 * Deploy em produção: apaga contratos Raissa (planilha + ZapSign) e cria um novo.
 *
 * Uso:
 *   FIN_PASS=... node scripts/reset-raissa-production.mjs
 */
const BASE = (process.env.PRODUCTION_API_URL || "https://skoobpet.oppitech.com.br/api").replace(/\/$/, "");
const FIN_USER = process.env.FIN_USER || "controle@skoobpet.com.br";
const FIN_PASS = process.env.FIN_PASS || "skoobdiretoria123";
const ZAPSIGN_API = "https://api.zapsign.com.br/api/v1";
const zapsignToken = process.env.ZAPSIGN_API_TOKEN?.trim();

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

async function zapsign(pathname, init = {}) {
  if (!zapsignToken) throw new Error("ZAPSIGN_API_TOKEN ausente");
  const res = await fetch(`${ZAPSIGN_API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${zapsignToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok && res.status !== 404) {
    let detail = text;
    try {
      detail = JSON.parse(text).detail || text;
    } catch {
      /* ignore */
    }
    throw new Error(detail || res.statusText);
  }
  return res.ok;
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
    await zapsign(`/docs/${item.docToken}/`, { method: "DELETE" });
  }
}

const indices = [...items.map((i) => i.sheetIndex)].sort((a, b) => b - a);
for (const sheetIndex of indices) {
  console.log(`Apagando planilha linha index ${sheetIndex}...`);
  try {
    await api(`/dashboard/contracts/campinas/${sheetIndex}`, { method: "DELETE" }, cookie);
  } catch (e) {
    console.warn(`  DELETE falhou (deploy pendente?): ${e.message}`);
  }
}

console.log("Criando novo contrato ZapSign...");
const { createCampinasContractDocument } = await import("../dist/services/zapsign.js");
const externalId = `campinas:raissa-${Date.now()}`;
const doc = await createCampinasContractDocument(contrato, externalId);

const detailRes = await fetch(`${ZAPSIGN_API}/docs/${doc.docToken}/`, {
  headers: { Authorization: `Bearer ${zapsignToken}` },
});
const detail = await detailRes.json();
const lojaSigner = (detail.signers || []).find((s) => s.qualification === "lojista") || detail.signers?.[1];
if (lojaSigner?.token) {
  await fetch(`${ZAPSIGN_API}/signers/${lojaSigner.token}/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${zapsignToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Higo",
      email: "silvaphigo@gmail.com",
      send_automatic_email: true,
      auth_mode: "assinaturaTela",
      qualification: "lojista",
    }),
  });
}

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
        storeEmail: doc.storeEmail || "silvaphigo@gmail.com",
      },
    },
  },
  cookie,
);

console.log("\n=== Pronto ===");
console.log("Planilha:", registered.data);
console.log("Documento:", doc.docToken);
console.log("Cliente:", doc.signUrl);
console.log("E-mail:", doc.emailSent ? doc.clientEmail : "não enviado");
