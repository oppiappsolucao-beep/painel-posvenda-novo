/**
 * Registra contrato Raissa na planilha via API de produção (sem criar novo doc ZapSign).
 *
 * Uso:
 *   FIN_USER=controle@skoobpet.com.br FIN_PASS=... node scripts/register-raissa-production.mjs
 *
 * Requer deploy com POST /api/dashboard/contracts/register-zapsign
 */
const BASE = (process.env.PRODUCTION_API_URL || "https://skoobpet.oppitech.com.br/api").replace(/\/$/, "");
const FIN_USER = process.env.FIN_USER || "controle@skoobpet.com.br";
const FIN_PASS = process.env.FIN_PASS || "";

if (!FIN_PASS) {
  console.error("Defina FIN_PASS (senha financeiro) no ambiente.");
  process.exit(1);
}

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

const zapsign = {
  docToken: "9632eb35-0943-4b38-b382-48ba44e6d215",
  signUrl: "https://app.zapsign.com.br/verificar/779a6643-b9b9-4a2a-9a76-aa1eaed765dc",
  storeSignUrl: "https://app.zapsign.com.br/verificar/691f343d-7f1a-44eb-8163-4b68f5082227",
  storeEmail: "silvaphigo@gmail.com",
};

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
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
    data = { error: text };
  }
  if (!res.ok) throw new Error(data.error || text || res.statusText);
  return { data, cookies: res.headers.getSetCookie?.() || [] };
}

console.log("Login financeiro em", BASE);
const login = await api("/auth/login", {
  method: "POST",
  body: { username: FIN_USER, password: FIN_PASS, role: "financeiro" },
});

const cookie = login.cookies.map((c) => c.split(";")[0]).join("; ");
if (!cookie) {
  console.warn("Sem cookie de sessão — tentando mesmo assim.");
}

console.log("Registrando Raissa na planilha Campinas...");
const result = await api("/dashboard/contracts/register-zapsign", {
  method: "POST",
  headers: cookie ? { Cookie: cookie } : {},
  body: { unitKey: "campinas", contrato, zapsign },
});

console.log("OK:", result.data);
