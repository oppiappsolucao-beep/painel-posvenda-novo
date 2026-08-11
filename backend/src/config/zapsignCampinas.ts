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

/** Variáveis preenchidas pela loja ao criar o documento no ZapSign. */
export function buildCampinasTemplateData(contrato: SheetRow): Array<{ de: string; para: string }> {
  const dataCompra = pick(contrato, "Data Compra");
  const { day, monthName, year } = splitPurchaseDate(dataCompra);
  const nome = pick(contrato, "Nome");
  const telefone = pick(contrato, "Telefone");
  const email = pick(contrato, "E-mail", "Email");

  const entries: Array<[string, string]> = [
    ["{{nome-completo}}", nome],
    // Placeholder quebrado no DOCX de produção (faltava "{{" no início).
    ["nome-completo}}", nome],
    ["{{endereco}}", pick(contrato, "Endereço", "Endereco")],
    ["{{numero}}", pick(contrato, "Número", "Numero")],
    ["{{complemento}}", pick(contrato, "Complemento") || "\u200b"],
    ["{{bairro}}", pick(contrato, "Bairro")],
    ["{{cidade}}", pick(contrato, "Cidade")],
    ["{{uf}}", pick(contrato, "Estado")],
    ["{{cep}}", pick(contrato, "CEP")],
    ["{{rg}}", pick(contrato, "RG")],
    ["{{data}}", dataCompra],
    ["{{nome-animal}}", pick(contrato, "Nome do animal")],
    ["{{raca}}", pick(contrato, "Raça", "Raca")],
    ["{{cor}}", pick(contrato, "Cor")],
    ["{{data-nasc}}", pick(contrato, "Nascimento filhote")],
    ["{{sexo}}", pick(contrato, "Sexo")],
    ["{{microchip}}", pick(contrato, "Microchip")],
    ["{{especie}}", pick(contrato, "Espécie", "Especie")],
    ["{{pelagem}}", pick(contrato, "Pelagem")],
    ["{{observacoes}}", pick(contrato, "Observações", "Observacoes") || "\u200b"],
    ["{{valor}}", pick(contrato, "Valor Filhote")],
    ["{{ex-cinco-mil-reais}}", pick(contrato, "Valor por extenso")],
    ["{{forma-de-pag}}", pick(contrato, "Forma de pagamento")],
    ["{{parcela}}", pick(contrato, "Quantidade de parcelas")],
    ["{{nome-sobrenome}}", pick(contrato, "Vendedora")],
    ["{{contratante-nome-completo}}", nome],
    ["{{celular}}", telefone],
    ["{{e-mail}}", email],
    ["{{exemplo-18}}", day],
    ["{{fevereiro}}", monthName],
    ["{{cpf}}", pick(contrato, "CPF")],
    ["{{contratante-cpf}}", pick(contrato, "CPF")],
  ];

  if (year) {
    entries.push(["{{ano}}", year]);
  }

  return entries
    .filter(([, para]) => para)
    .map(([de, para]) => ({ de, para }));
}
