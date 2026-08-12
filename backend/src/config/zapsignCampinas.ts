import type { SheetRow } from "../config.js";
import { parseDate } from "../utils/formatters.js";

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export interface ZapSignTemplateField {
  variable: string;
  input_type: string;
  label: string;
  help_text?: string;
  options?: string;
  required?: boolean;
  order: number;
}

/** Cliente (signatário 2): só confirma recebimento de documentação. */
export const CAMPINAS_CLIENT_DOC_ACK_FIELDS: ZapSignTemplateField[] = [
  {
    variable: "{{carteirinha}}",
    input_type: "radio",
    label: "Você recebeu a carteirinha de vacinação?",
    help_text: "Carteira de Vacinação atualizada",
    options: "Sim, recebi !;Não recebi !",
    required: true,
    order: 1,
  },
  {
    variable: "{{certificado}}",
    input_type: "radio",
    label: "Você recebeu o certificado do microchip?",
    help_text: "Certificado de Microchip",
    options: "Sim, recebi !;Não recebi !",
    required: true,
    order: 2,
  },
  {
    variable: "{{transferencia}}",
    input_type: "radio",
    label: "Deseja transferir o documento para o seu nome? (vem no nome da loja)",
    help_text: "Pedigree com transferência — taxa R$ 249,90",
    options:
      "Sim, desejo o Pedigree com transferência para o meu nome.;Não desejo o Pedigree com transferência para o meu nome.;Vou pensar !",
    required: true,
    order: 3,
  },
  {
    variable: "{{pedigree}}",
    input_type: "radio",
    label: "O pedigree será entregue via correios pela taxa de 35,00 reais",
    help_text: "AR — Carta Registrada via Correios",
    options: "Sim, aceito pagar pela taxa !;Não aceito pagar pela taxa !;Vou pensar !",
    required: true,
    order: 4,
  },
  {
    variable: "{{atestado}}",
    input_type: "radio",
    label: "Você recebeu o atestado de saúde do filhote?",
    help_text: "Atestado de Saúde",
    options: "Sim, recebi !;Não recebi !",
    required: true,
    order: 5,
  },
];

/** Cliente (signatário 2): anexos na documentação do contrato. */
export const CAMPINAS_CLIENT_UPLOAD_FIELDS: ZapSignTemplateField[] = [
  {
    variable: "",
    input_type: "upload",
    label: "RG — Frente",
    help_text: "Tire uma foto nítida da frente do seu documento de identidade (RG)",
    required: true,
    order: 6,
  },
  {
    variable: "",
    input_type: "upload",
    label: "RG — Verso",
    help_text: "Tire uma foto nítida do verso do seu documento de identidade (RG)",
    required: true,
    order: 7,
  },
];

/** Radios + anexos do cliente na tela de assinatura. */
export function campinasClientFormFields(): ZapSignTemplateField[] {
  return [...CAMPINAS_CLIENT_DOC_ACK_FIELDS, ...CAMPINAS_CLIENT_UPLOAD_FIELDS].map((field, index) => ({
    ...field,
    order: index + 1,
  }));
}

export const CAMPINAS_CLIENT_FORM_LABELS = new Set(
  CAMPINAS_CLIENT_UPLOAD_FIELDS.map((field) => field.label.trim().toLowerCase()),
);

/** @deprecated Fluxo antigo (cliente signatário 1). Use CAMPINAS_CLIENT_DOC_ACK_FIELDS. */
export const CAMPINAS_CLIENT_FORM_FIELDS: ZapSignTemplateField[] = [
  ...CAMPINAS_CLIENT_DOC_ACK_FIELDS,
  {
    variable: "{{contratante-cpf}}",
    input_type: "cpf",
    label: "Contratante CPF",
    help_text: "Preencha seu CPF",
    required: true,
    order: 6,
  },
  {
    variable: "{{celular}}",
    input_type: "phone_br",
    label: "Celular",
    help_text: "Insira seu contato principal",
    required: true,
    order: 7,
  },
  {
    variable: "{{e-mail}}",
    input_type: "email",
    label: "E-mail",
    help_text: "Insira seu e-mail",
    required: true,
    order: 8,
  },
];

/** Anexos que somente a loja envia ao concluir o contrato. */
export const CAMPINAS_STORE_UPLOAD_FIELDS: ZapSignTemplateField[] = [
  {
    variable: "",
    input_type: "upload",
    label: "Atestado de Saúde",
    help_text: "Atestado de saúde do filhote",
    required: true,
    order: 50,
  },
  {
    variable: "",
    input_type: "upload",
    label: "Carteirinha de vacinas - frente",
    help_text: "Carteirinha de vacinação (frente)",
    required: true,
    order: 51,
  },
  {
    variable: "",
    input_type: "upload",
    label: "Carteirinha de vacinas - verso",
    help_text: "Carteirinha de vacinação (verso)",
    required: true,
    order: 52,
  },
  {
    variable: "",
    input_type: "upload",
    label: "Foto do filhote",
    help_text: "Foto do filhote adquirido",
    required: true,
    order: 53,
  },
];

/** CNPJ informado pela loja (sem assinatura na tela). */
export const CAMPINAS_STORE_CNPJ_FIELD: ZapSignTemplateField = {
  variable: "",
  input_type: "cnpj",
  label: "CNPJ da loja",
  help_text: "Informe o CNPJ da loja",
  required: true,
  order: 49,
};

export const CAMPINAS_STORE_FORM_FIELDS: ZapSignTemplateField[] = [
  CAMPINAS_STORE_CNPJ_FIELD,
  ...CAMPINAS_STORE_UPLOAD_FIELDS,
];

/** Formulário do signatário loja no ZapSign: só CNPJ (anexos vão pelo painel SkoobPet). */
export function campinasStoreZapSignFormFields(): ZapSignTemplateField[] {
  return [{ ...CAMPINAS_STORE_CNPJ_FIELD, order: 1 }];
}

/** Formulário do signatário 1 (loja): CNPJ + anexos. Cliente responde radios + foto do RG (signatário 2). */
export function campinasStoreFirstFormFields(): ZapSignTemplateField[] {
  return CAMPINAS_STORE_FORM_FIELDS.map((field, index) => ({ ...field, order: index + 1 }));
}

export const CAMPINAS_STORE_FORM_LABELS = new Set(
  CAMPINAS_STORE_FORM_FIELDS.map((field) => field.label.trim().toLowerCase()),
);

/** Variáveis preenchidas no painel — enviadas via API no create-doc, não no formulário do cliente. */
export const CAMPINAS_STORE_PREFILLED_VARIABLES = [
  "{{nome-completo}}",
  "{{endereco}}",
  "{{numero}}",
  "{{complemento}}",
  "{{bairro}}",
  "{{cidade}}",
  "{{uf}}",
  "{{cep}}",
  "{{rg}}",
  "{{data}}",
  "{{nome-animal}}",
  "{{raca}}",
  "{{cor}}",
  "{{data-nasc}}",
  "{{sexo}}",
  "{{microchip}}",
  "{{especie}}",
  "{{pelagem}}",
  "{{observacoes}}",
  "{{valor}}",
  "{{ex-cinco-mil-reais}}",
  "{{forma-de-pag}}",
  "{{parcela}}",
  "{{nome-sobrenome}}",
  "{{contratante-nome-completo}}",
  "{{contratante-celular}}",
  "{{celular}}",
  "{{e-mail}}",
  "{{exemplo-18}}",
  "{{fevereiro}}",
  "{{cpf}}",
  "{{ano}}",
] as const;

export const CAMPINAS_CLIENT_FORM_VARIABLES = new Set(
  CAMPINAS_CLIENT_DOC_ACK_FIELDS.map((field) => field.variable),
);

function pick(contrato: SheetRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = String(contrato[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

/** Endereço do comprador no contrato: bairro vem do painel; cidade = UF (mesma sigla). */
export function buyerAddressForTemplate(contrato: SheetRow): {
  bairro: string;
  cidade: string;
  uf: string;
} {
  const uf = pick(contrato, "Estado");
  return {
    bairro: pick(contrato, "Bairro", "Cidade"),
    cidade: uf,
    uf,
  };
}

function splitPurchaseDate(dataCompra: string): { day: string; monthName: string; year: string } {
  const parsed = parseDate(dataCompra);
  if (!parsed) {
    return { day: "", monthName: "", year: "" };
  }
  return {
    day: String(parsed.getDate()),
    monthName: MONTH_NAMES[parsed.getMonth()] ?? "",
    year: String(parsed.getFullYear()),
  };
}

function formatPhoneBr(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw.trim();
}

/** Variáveis preenchidas pela loja ao criar o documento no ZapSign. */
export function buildCampinasTemplateData(contrato: SheetRow): Array<{ de: string; para: string }> {
  const dataCompra = pick(contrato, "Data Compra");
  const { day, monthName, year } = splitPurchaseDate(dataCompra);
  const nome = pick(contrato, "Nome");
  const telefone = formatPhoneBr(pick(contrato, "Telefone"));
  const email = pick(contrato, "E-mail", "Email");

  const prefilled = (value: string) => value || "\u200b";
  const enderecoComprador = buyerAddressForTemplate(contrato);

  const entries: Array<[string, string]> = [
    ["{{nome-completo}}", prefilled(nome)],
    // Placeholder quebrado no DOCX de produção (faltava "{{" no início).
    ["nome-completo}}", prefilled(nome)],
    ["{{endereco}}", prefilled(pick(contrato, "Endereço", "Endereco"))],
    ["{{numero}}", prefilled(pick(contrato, "Número", "Numero"))],
    ["{{complemento}}", prefilled(pick(contrato, "Complemento"))],
    ["{{bairro}}", prefilled(enderecoComprador.bairro)],
    ["{{cidade}}", prefilled(enderecoComprador.cidade)],
    ["{{uf}}", prefilled(enderecoComprador.uf)],
    ["{{cep}}", prefilled(pick(contrato, "CEP"))],
    ["{{rg}}", prefilled(pick(contrato, "RG"))],
    ["{{data}}", prefilled(dataCompra)],
    ["{{nome-animal}}", prefilled(pick(contrato, "Nome do animal"))],
    ["{{raca}}", prefilled(pick(contrato, "Raça", "Raca"))],
    ["{{cor}}", prefilled(pick(contrato, "Cor"))],
    ["{{data-nasc}}", prefilled(pick(contrato, "Nascimento filhote"))],
    ["{{sexo}}", prefilled(pick(contrato, "Sexo"))],
    ["{{microchip}}", prefilled(pick(contrato, "Microchip"))],
    ["{{especie}}", prefilled(pick(contrato, "Espécie", "Especie"))],
    ["{{pelagem}}", prefilled(pick(contrato, "Pelagem"))],
    ["{{observacoes}}", prefilled(pick(contrato, "Observações", "Observacoes"))],
    ["{{valor}}", prefilled(pick(contrato, "Valor Filhote"))],
    ["{{ex-cinco-mil-reais}}", prefilled(pick(contrato, "Valor por extenso"))],
    ["{{forma-de-pag}}", prefilled(pick(contrato, "Forma de pagamento"))],
    ["{{parcela}}", prefilled(pick(contrato, "Quantidade de parcelas"))],
    ["{{nome-sobrenome}}", prefilled(pick(contrato, "Vendedora"))],
    ["{{contratante-nome-completo}}", prefilled(nome)],
    ["{{contratante-celular}}", prefilled(telefone)],
    ["contratante-celular}}", prefilled(telefone)],
    ["{contratante-celular}}", prefilled(telefone)],
    ["{{celular}}", prefilled(telefone)],
    // Placeholders quebrados no DOCX (Piracicaba/legado).
    ["celular}}", prefilled(telefone)],
    ["{celular}}", prefilled(telefone)],
    ["{{e-mail}}", prefilled(email)],
    ["{{e-mai}}l", prefilled(email)],
    ["{{exemplo-18}}", prefilled(day)],
    ["{{fevereiro}}", prefilled(monthName)],
    ["{{cpf}}", prefilled(pick(contrato, "CPF"))],
    ["{{contratante-cpf}}", prefilled(pick(contrato, "CPF"))],
  ];

  if (year) {
    entries.push(["{{ano}}", year]);
  }

  return entries.map(([de, para]) => ({ de, para }));
}
