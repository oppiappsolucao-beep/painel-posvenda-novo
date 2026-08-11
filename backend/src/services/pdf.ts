import PDFDocument from "pdfkit";
import { SheetRow } from "../config.js";
import { ContractAttachmentImages } from "./contractAttachments.js";
import { ContractSignatureImages, generateCampinasContractPdf } from "./pdfCampinas.js";

/** Dados fictícios do vendedor — outras unidades (modelo simplificado) */
const VENDEDOR_TESTE =
  'PET SHOP DEMONSTRACAO LTDA, inscrita no CNPJ sob nº 12.345.678/0001-99 e na Inscrição Estadual sob nº 987.654.321.000, ' +
  "estabelecida à RUA FICTICIA DOS TESTES, 250, Complemento: LOJA 03, Bairro: JARDIM MODELO, CEP: 13.111-222, " +
  'no Município de CIDADE EXEMPLO, UF: SP, denominada "VENDEDOR", e de outro lado,';

const RODAPE_VENDEDOR_TESTE = "PET SHOP DEMONSTRACAO LTDA — CNPJ: 12.345.678/0001-99 (dados fictícios para teste)";

function isCampinas(contrato: SheetRow): boolean {
  const unidade = String(contrato.Unidade || "").trim().toLowerCase();
  return unidade.includes("campinas");
}

function valor(contrato: SheetRow, campo: string, padrao = "Não informado"): string {
  const s = String(contrato[campo] ?? "").trim();
  return s || padrao;
}

function addParagraph(doc: PDFKit.PDFDocument, text: string, opts?: { bold?: boolean; size?: number; align?: "left" | "center" | "justify" }) {
  doc.font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts?.size ?? 10.5)
    .text(text.replace(/<br\/?>/g, "\n").replace(/<\/?b>/g, ""), {
      align: opts?.align ?? "justify",
      lineGap: 2,
    });
  doc.moveDown(0.4);
}

function generateDefaultContractPdf(contrato: SheetRow): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const nome = valor(contrato, "Nome");
    const cpf = valor(contrato, "CPF");
    const rg = valor(contrato, "RG");
    const telefone = valor(contrato, "Telefone");
    const email = valor(contrato, "E-mail");
    const endereco = valor(contrato, "Endereço");
    const numero = valor(contrato, "Número");
    const complemento = valor(contrato, "Complemento", "");
    const cep = valor(contrato, "CEP");
    const cidade = valor(contrato, "Cidade");
    const estado = valor(contrato, "Estado");
    const nomeAnimal = valor(contrato, "Nome do animal");
    const especie = valor(contrato, "Espécie");
    const raca = valor(contrato, "Raça");
    const sexo = valor(contrato, "Sexo");
    const cor = valor(contrato, "Cor");
    const pelagem = valor(contrato, "Pelagem");
    const microchip = valor(contrato, "Microchip");
    const nascimento = valor(contrato, "Nascimento filhote");
    const observacoes = valor(contrato, "Observações", "");
    const dataCompra = valor(contrato, "Data Compra");
    const valorFilhote = valor(contrato, "Valor Filhote");
    const valorExtenso = valor(contrato, "Valor por extenso");
    const formaPagamento = valor(contrato, "Forma de pagamento");
    const parcelas = valor(contrato, "Quantidade de parcelas");

    doc.font("Helvetica-Bold").fontSize(11.5).text("CONTRATO DE COMPRA E VENDA DE FILHOTE DE COMPANHIA", { align: "center" });
    doc.moveDown(1);

    addParagraph(doc, "Pelo presente instrumento, de um lado:");
    addParagraph(doc, VENDEDOR_TESTE);
    addParagraph(doc, `${nome}, morador(a) estabelecido(a) à ${endereco}, ${numero}${complemento ? ", " + complemento : ""} - Cidade: ${cidade} - UF: ${estado} - CEP: ${cep}, inscrito(a) no CPF sob o nº ${cpf}, RG sob o nº ${rg}, contato através do celular: ${telefone} e e-mail: ${email}, denominada simplesmente \"COMPRADOR\".`);
    addParagraph(doc, `Firmam o presente contrato de compra e venda de filhote celebrado entre as partes em ${dataCompra}, para os seguintes efeitos:`);

    doc.font("Helvetica-Bold").fontSize(11).text("DO OBJETO DO CONTRATO");
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(10.5).text("Cláusula Primeira");
    doc.moveDown(0.3);
    addParagraph(doc, `O presente contrato tem como OBJETO a venda e compra de um animal de (COMPANHIA) sendo:\n\nNOME: ${nomeAnimal}\nRAÇA: ${raca}\nCOR: ${cor}\nNASCIDO: ${nascimento}\nSEXO: ${sexo}\nNº MICROCHIP: ${microchip}\nESPÉCIE: ${especie}\nPELAGEM: ${pelagem}\nOBSERVAÇÕES: ${observacoes}`);

    doc.font("Helvetica-Bold").fontSize(11).text("DO PREÇO");
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(10.5).text("Cláusula Segunda");
    doc.moveDown(0.3);
    addParagraph(doc, `O comprador(a) pagará ao vendedor, pela compra do animal objeto deste contrato, a quantia de ${valorFilhote} (${valorExtenso}).`);
    addParagraph(doc, `Valor pago da seguinte forma: ${formaPagamento}`);
    addParagraph(doc, `Pagos em: ${parcelas}`);

    doc.font("Helvetica-Bold").fontSize(11).text("DA DOCUMENTAÇÃO DO FILHOTE");
    doc.moveDown(0.3);
    addParagraph(doc, "Carteira de Vacinação atualizada: Sim, recebi !", { size: 8.5 });
    addParagraph(doc, "Certificado de Microchip: Sim, recebi !", { size: 8.5 });
    addParagraph(doc, "Pedigree - OPCIONAL - R$ 249,90 Taxa de Emissão: Vou pensar !", { size: 8.5 });
    addParagraph(doc, "AR - OPCIONAL - R$ 35,80 Carta Registrada via Correios: Vou pensar !", { size: 8.5 });
    addParagraph(doc, "Atestado de Saúde: Sim, recebi !", { size: 8.5 });

    doc.moveDown(1);
    addParagraph(doc, "Campinas, " + dataCompra, { align: "center" });
    doc.moveDown(2);
    addParagraph(doc, "_________________________________________", { align: "center" });
    addParagraph(doc, "VENDEDOR", { align: "center", bold: true });
    addParagraph(doc, RODAPE_VENDEDOR_TESTE, { align: "center", size: 8.5 });
    doc.moveDown(1);
    addParagraph(doc, "_________________________________________", { align: "center" });
    addParagraph(doc, "COMPRADOR(A)", { align: "center", bold: true });

    doc.end();
  });
}

export function generateContractPdf(
  contrato: SheetRow,
  signatures?: ContractSignatureImages,
  attachments?: ContractAttachmentImages,
): Promise<Buffer> {
  if (isCampinas(contrato)) {
    return generateCampinasContractPdf(contrato, signatures, attachments);
  }
  return generateDefaultContractPdf(contrato);
}
