import { CONTRACT_SHEET_HEADERS } from "../config.js";

function foldHeader(value: string): string {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ºª°]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Nome canônico do sistema → nomes que podem aparecer na planilha após o ajuste manual. */
const HEADER_ALIASES: Record<string, string[]> = {
  Nome: ["Nome do comprador", "Nome cliente"],
  Telefone: ["WhatsApp", "Whatsapp", "Celular", "Telefone WhatsApp"],
  CPF: ["CPF do comprador"],
  "E-mail": ["Email", "E mail", "Mail"],
  "Data Compra": ["Data da Compra", "Data da compra", "Data compra", "Dt Compra"],
  Mês: ["Mes", "Mes da compra", "Mês da compra"],
  Raça: ["Raca", "Raça do filhote"],
  Sexo: ["Sexo do filhote"],
  Cor: ["Cor do filhote"],
  Pelagem: ["Tipo de pelagem"],
  Endereço: ["Endereco", "Logradouro"],
  Número: ["Numero", "Nro", "N da residencia"],
  Complemento: ["Compl"],
  CEP: ["Cep"],
  Estado: ["UF"],
  Cidade: ["Cidade do comprador"],
  Bairro: ["Bairro do comprador"],
  RG: ["Rg"],
  "Valor Filhote": ["Valor filhote", "Valor de filhote", "Valor do filhote"],
  "Valor por extenso": ["Valor extenso", "Valor por Extenso"],
  "Forma de pagamento": ["Forma pagamento"],
  "Quantidade de parcelas": ["Parcelas", "Qtd parcelas", "Quantidade parcelas"],
  Vendedora: ["Vendedor", "Atendente"],
  "Nome do animal": ["Nome animal", "Nome do filhote"],
  Espécie: ["Especie"],
  Microchip: ["Micro chip", "N microchip"],
  "Nascimento filhote": ["Nascimento do filhote", "Data nascimento filhote"],
  Observações: ["Observacoes", "Obs"],
  "Data preenchimento": ["Data do preenchimento", "Preenchimento"],
  Unidade: ["Unidade da loja", "Loja", "Filial"],
  "Link Assinatura": ["Link assinatura", "Link do cliente"],
  "Link Assinatura Loja": ["Link assinatura loja", "Link da loja"],
  "Data Envio": ["Data de envio"],
  "Documento ZapSign": ["Documento Zapsign", "Doc ZapSign", "Token ZapSign"],
  "Data Assinatura Cliente": ["Data assinatura cliente"],
  "Data Assinatura Loja": ["Data assinatura loja"],
  "Status Assinatura": ["Status da assinatura"],
  "E-mail Loja": ["Email Loja", "E-mail da loja"],
};

const canonicalByFold = new Map<string, string>();

for (const canonical of CONTRACT_SHEET_HEADERS) {
  canonicalByFold.set(foldHeader(canonical), canonical);
  for (const alias of HEADER_ALIASES[canonical] || []) {
    const folded = foldHeader(alias);
    if (!canonicalByFold.has(folded)) canonicalByFold.set(folded, canonical);
  }
}

export function canonicalSheetHeader(header: string): string | null {
  const folded = foldHeader(header);
  if (!folded) return null;
  return canonicalByFold.get(folded) || null;
}

export function sheetHasCanonicalHeader(headers: string[], canonical: string): boolean {
  return headers.some((header) => canonicalSheetHeader(header) === canonical);
}

export function missingCanonicalHeaders(headers: string[]): string[] {
  return CONTRACT_SHEET_HEADERS.filter((canonical) => !sheetHasCanonicalHeader(headers, canonical));
}

function lookupContractValue(contrato: Record<string, string>, wanted: string): string {
  if (Object.prototype.hasOwnProperty.call(contrato, wanted) && contrato[wanted] != null) {
    return contrato[wanted];
  }
  const wantedFold = foldHeader(wanted);
  const match = Object.keys(contrato).find((key) => foldHeader(key) === wantedFold);
  return match ? contrato[match] ?? "" : "";
}

/** Monta a linha na ORDEM da planilha: cada coluna recebe o campo do contrato com o mesmo significado. */
export function valuesForSheetHeaders(contrato: Record<string, string>, headers: string[]): string[] {
  return headers.map((header) => {
    const direct = lookupContractValue(contrato, header);
    if (String(direct).length) return direct;
    const canonical = canonicalSheetHeader(header);
    if (canonical && canonical !== header) {
      return lookupContractValue(contrato, canonical);
    }
    return direct;
  });
}

/** Ao ler, replica o valor também na chave canônica (Nome, Unidade, …) sem mudar a ordem da planilha. */
export function hydrateCanonicalKeys(row: Record<string, string>): Record<string, string> {
  const hydrated = { ...row };
  for (const [header, value] of Object.entries(row)) {
    const canonical = canonicalSheetHeader(header);
    if (canonical && !String(hydrated[canonical] || "").trim()) {
      hydrated[canonical] = value;
    }
  }
  return hydrated;
}
