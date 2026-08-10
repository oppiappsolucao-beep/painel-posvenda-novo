import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const API = "https://api.zapsign.com.br/api/v1";
const token = process.env.ZAPSIGN_API_TOKEN?.trim();
if (!token) {
  console.error("ZAPSIGN_API_TOKEN ausente");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function api(pathname, init = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { ...headers, ...init.headers },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }
  if (!res.ok) throw new Error(data.detail || text || res.statusText);
  return data;
}

// Import compiled service after env loaded
const { createCampinasContractDocument } = await import("../dist/services/zapsign.js");

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
  Observações: "Contrato teste assinatura Raissa + Oppi",
  "Data Compra": "07/08/2026",
  "Valor Filhote": "4.500,00",
  "Valor por extenso": "quatro mil e quinhentos reais",
  "Forma de pagamento": "PIX",
  "Quantidade de parcelas": "1",
  Vendedora: "Oppi",
  "E-mail Loja": "oppiappsolucao@gmail.com",
  "Telefone Loja": "11942157917",
  Unidade: "Campinas",
};

const externalId = `campinas:test-raissa-${Date.now()}`;
console.log("Criando contrato ZapSign...");
const doc = await createCampinasContractDocument(contrato, externalId);

const detail = await api(`/docs/${doc.docToken}/`);
const signers = detail.signers || [];

console.log("\n=== Contrato criado ===");
console.log("Documento:", doc.docToken);
console.log("Cliente (Raissa):", doc.signUrl);
console.log("E-mail enviado:", doc.emailSent ? doc.clientEmail : "não");

const lojaSigner = signers.find((s) => s.qualification === "lojista") || signers[1];
if (lojaSigner?.token) {
  const updated = await api(`/signers/${lojaSigner.token}/`, {
    method: "POST",
    body: {
      name: "Oppi",
      email: "oppiappsolucao@gmail.com",
      send_automatic_email: true,
      auth_mode: "assinaturaTela",
    },
  });
  console.log("Loja (Oppi):", updated.sign_url || lojaSigner.sign_url);
} else {
  console.warn("Signatário loja não encontrado; signers:", signers.length);
}

for (const s of signers) {
  console.log(`- ${s.name} (${s.qualification || "cliente"}): ${s.sign_url}`);
}
