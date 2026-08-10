/**
 * Preenche o formulário Novo Contrato e pausa para você clicar em Salvar.
 * Uso: node scripts/fill-contrato-teste.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.PAINEL_URL || "https://skoobpet.oppitech.com.br";

const DATA = {
  nome: "Ana Clara Mendes",
  email: "ana.clara.teste@email.com",
  endereco: "Rua das Palmeiras",
  cpf: "529.982.247-25",
  numero: "128",
  telefone: "(19) 99887-7665",
  complemento: "Apto 12",
  rg: "45.678.901-2",
  cep: "13087-654",
  estado: "SP",
  cidade: "Campinas",
  nomeAnimal: "Mel",
  sexo: "FÊMEA",
  especie: "CANINA",
  pelagem: "LONGA",
  raca: "Shih Tzu",
  microchip: "985112004567890",
  nascimento: "15/03/2026",
  cor: "Branco e marrom",
  observacoes: "Filhote teste ZapSign — sem valor comercial",
  valorFilhote: "4.500,00",
  valorExtenso: "quatro mil e quinhentos reais",
  formaPagamento: "Cartão de crédito",
  parcelas: "3",
};

async function fillIfVisible(page, label, value) {
  const field = page.getByLabel(label, { exact: false }).first();
  if (await field.isVisible({ timeout: 2000 }).catch(() => false)) {
    await field.fill(value);
  }
}

async function selectIfVisible(page, label, value) {
  const field = page.getByLabel(label, { exact: false }).first();
  if (await field.isVisible({ timeout: 2000 }).catch(() => false)) {
    await field.selectOption({ label: value }).catch(async () => {
      await field.selectOption(value);
    });
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 120,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log("Abrindo login...");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });

  console.log("\n>>> FAÇA LOGIN na janela que abriu (Campinas + 2FA se pedir).");
  console.log(">>> Quando estiver logado, volte aqui e pressione ENTER no terminal...\n");

  await new Promise((resolve) => {
    process.stdin.once("data", resolve);
  });

  await page.goto(`${BASE}/novo-contrato`, { waitUntil: "networkidle" });
  await page.waitForSelector("form", { timeout: 120_000 });

  console.log("Preenchendo formulário...");

  await fillIfVisible(page, "Nome do comprador", DATA.nome);
  await fillIfVisible(page, "E-mail", DATA.email);
  await fillIfVisible(page, "Endereço", DATA.endereco);
  await fillIfVisible(page, "CPF", DATA.cpf);
  await fillIfVisible(page, "Nº da residência", DATA.numero);
  await fillIfVisible(page, "Contato (WhatsApp)", DATA.telefone);
  await fillIfVisible(page, "Complemento", DATA.complemento);
  await fillIfVisible(page, "RG", DATA.rg);
  await fillIfVisible(page, "CEP", DATA.cep);
  await selectIfVisible(page, "Estado", DATA.estado);
  await selectIfVisible(page, "Cidade", DATA.cidade);

  await fillIfVisible(page, "Nome do animal", DATA.nomeAnimal);
  await page.getByRole("radio", { name: DATA.sexo, exact: true }).check({ timeout: 15_000 });
  await page.getByRole("radio", { name: DATA.especie, exact: true }).check({ timeout: 15_000 });
  await page.getByRole("radio", { name: DATA.pelagem, exact: true }).check({ timeout: 15_000 });

  await page.waitForTimeout(800);
  await selectIfVisible(page, "Raça", DATA.raca);

  await fillIfVisible(page, "Microchip", DATA.microchip);
  await fillIfVisible(page, "Nascimento", DATA.nascimento);
  await fillIfVisible(page, "Cor", DATA.cor);
  await fillIfVisible(page, "Observações", DATA.observacoes);

  await fillIfVisible(page, "Valor do filhote", DATA.valorFilhote);
  await fillIfVisible(page, "Valor por extenso", DATA.valorExtenso);
  await fillIfVisible(page, "Forma de pagamento", DATA.formaPagamento);
  await fillIfVisible(page, "Quantidade de parcelas", DATA.parcelas);

  const vendedora = page.getByLabel("Vendedora", { exact: false }).first();
  if (await vendedora.isVisible().catch(() => false)) {
    const options = await vendedora.locator("option").allTextContents();
    const pick = options.find((o) => o.trim() && o !== "Selecione a vendedora" && o !== "Selecione");
    if (pick) await vendedora.selectOption({ label: pick.trim() });
  }

  console.log("\n✅ Formulário preenchido!");
  console.log(">>> Revise na janela do navegador e clique em SALVAR CONTRATO.\n");
  console.log(">>> Feche a janela ou pressione Ctrl+C aqui quando terminar.\n");

  await page.waitForTimeout(600_000);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
