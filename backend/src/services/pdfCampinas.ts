import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import { SheetRow } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, "../../assets/skoobpet-logo.png");

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const VENDEDOR =
  "SHOOKPET COMERCIO DE ANIMAIS E MEDICAMENTOS VETERINARIOS LTDA, inscrita no CNPJ sob nº 47.945.634/0002-61 " +
  "e na Inscrição Estadual sob nº 156.252.423.119, estabelecida à RODOVIA DOM PEDRO I (SP 65), KM 132, S/N, " +
  "Complemento: LOJA 06, Bairro: PARQUE IMPERADOR, CEP: 13.097-100, no Município de CAMPINAS, UF: SP. " +
  'denominado "VENDEDOR", e de outro lado,';

function v(contrato: SheetRow, campo: string, padrao = "Não informado"): string {
  const s = String(contrato[campo] ?? "").trim();
  return s || padrao;
}

function formatDataPorExtenso(data: string): string {
  const m = data.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return data || "—";
  const [, dd, mm, yyyy] = m;
  const mes = MESES[parseInt(mm, 10) - 1] || mm;
  return `${parseInt(dd, 10)} de ${mes} de ${yyyy}`;
}

type PdfDoc = PDFKit.PDFDocument;

function addLogo(doc: PdfDoc): void {
  try {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const logoWidth = 110;
    const x = doc.page.margins.left + (pageWidth - logoWidth) / 2;
    doc.image(LOGO_PATH, x, doc.y, { width: logoWidth });
    doc.moveDown(3.2);
  } catch {
    doc.moveDown(0.5);
  }
}

function paragraph(doc: PdfDoc, text: string, opts?: { bold?: boolean; size?: number; align?: "left" | "center" | "justify"; color?: string; gap?: number }) {
  if (opts?.color) doc.fillColor(opts.color);
  doc.font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts?.size ?? 10.5)
    .text(text, { align: opts?.align ?? "justify", lineGap: 2 });
  doc.fillColor("black");
  doc.moveDown(opts?.gap ?? 0.45);
}

function section(doc: PdfDoc, title: string) {
  doc.moveDown(0.3);
  paragraph(doc, title, { bold: true, size: 11, align: "left", gap: 0.35 });
}

function clause(doc: PdfDoc, title: string) {
  paragraph(doc, title, { bold: true, size: 10.5, align: "left", gap: 0.35 });
}

function pageBreak(doc: PdfDoc) {
  doc.addPage();
}

export function generateCampinasContractPdf(contrato: SheetRow): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 47 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const nome = v(contrato, "Nome");
    const cpf = v(contrato, "CPF");
    const rg = v(contrato, "RG");
    const telefone = v(contrato, "Telefone");
    const email = v(contrato, "E-mail");
    const endereco = v(contrato, "Endereço");
    const numero = v(contrato, "Número");
    const complemento = v(contrato, "Complemento", "");
    const bairro = v(contrato, "Bairro", "");
    const cep = v(contrato, "CEP");
    const cidade = v(contrato, "Cidade");
    const estado = v(contrato, "Estado");
    const nomeAnimal = v(contrato, "Nome do animal");
    const especie = v(contrato, "Espécie");
    const raca = v(contrato, "Raça");
    const sexo = v(contrato, "Sexo");
    const cor = v(contrato, "Cor");
    const pelagem = v(contrato, "Pelagem");
    const microchip = v(contrato, "Microchip");
    const nascimento = v(contrato, "Nascimento filhote");
    const observacoes = v(contrato, "Observações", "");
    const dataCompra = v(contrato, "Data Compra");
    const valorFilhote = v(contrato, "Valor Filhote");
    const valorExtenso = v(contrato, "Valor por extenso");
    const formaPagamento = v(contrato, "Forma de pagamento");
    const parcelas = v(contrato, "Quantidade de parcelas");
    const vendedora = v(contrato, "Vendedora");
    const unidade = v(contrato, "Unidade", "CAMPINAS");
    const dataExtenso = formatDataPorExtenso(dataCompra);
    const cidadeFinal = (cidade || unidade || "CAMPINAS").toUpperCase();

    const compTxt = complemento ? `, ${complemento}` : "";
    const bairroTxt = bairro ? ` - Bairro: ${bairro}` : "";

    addLogo(doc);
    paragraph(doc, "CONTRATO DE COMPRA E VENDA DE FILHOTE DE COMPANHIA", { bold: true, size: 11.5, align: "center", gap: 0.8 });

    paragraph(doc, "Pelo presente instrumento, de um lado:");
    paragraph(doc, VENDEDOR);
    paragraph(doc,
      `${nome}, morador(a) estabelecido(a) à ${endereco}, ${numero}${compTxt}${bairroTxt} - Cidade: ${cidade} - UF: ${estado} - CEP: ${cep}, ` +
      `inscrito(a) no CPF sob o nº ${cpf}, RG sob o nº ${rg}, contato através do celular: ${telefone} e e-mail: ${email}, denominada simplesmente "COMPRADOR".`,
    );
    paragraph(doc, `Firmam o presente contrato de compra e venda de filhote celebrado entre as partes em ${dataCompra}, para os seguintes efeitos:`);

    section(doc, "DO OBJETO DO CONTRATO");
    paragraph(doc, "-");
    clause(doc, "Cláusula Primeira");
    paragraph(doc,
      `• O presente contrato tem como OBJETO a venda e compra de um animal de (COMPANHIA) sendo:\n\n` +
      `• NOME: ${nomeAnimal}\n• RAÇA: ${raca}\n• COR: ${cor}\n• NASCIDO: ${nascimento}\n• SEXO: ${sexo}\n` +
      `• Nº MICROCHIP: ${microchip}\n• ESPÉCIE: ${especie}\n• PELAGEM: ${pelagem}\n• OBSERVAÇÕES: ${observacoes}`,
    );
    paragraph(doc,
      "1.2) O canino será retirado pelo próprio comprador(a) ou pessoa devidamente autorizada, mediante apresentação de requisição por escrito com cópia do RG do comprador e do retirante, cumulativamente com a apresentação do recibo expedido pelo vendedor, não sendo autorizada a retirada do animal sem a respectiva documentação ora informada, para que assim preserve a sanidade canina e a entrega do mesmo a quem de direito.",
    );
    paragraph(doc, "-");

    section(doc, "DO PREÇO");
    clause(doc, "Cláusula Segunda");
    paragraph(doc, `• O comprador(a) pagará ao vendedor, pela compra do animal objeto deste contrato, a quantia de ${valorFilhote}, (${valorExtenso}).`);
    paragraph(doc, `• Valor pago da seguinte forma: ${formaPagamento}`);
    paragraph(doc, `• Pagos em: ${parcelas}`);
    paragraph(doc, "-");

    section(doc, "DA DOCUMENTAÇÃO DO FILHOTE");
    paragraph(doc, "3.1) Abaixo relação de documentação:");
    paragraph(doc, "1. Carteira de Vacinação atualizada: Sim, recebi !", { size: 8.5 });
    paragraph(doc, "2. Certificado de Microchip: Sim, recebi !", { size: 8.5 });
    paragraph(doc, "3. Pedigree - OPCIONAL - R$ 249,90 Taxa de Emissão: Vou pensar !", { size: 8.5 });
    paragraph(doc, "4. AR - OPCIONAL - R$ 35,80 Carta Registrada via Correios: Vou pensar !", { size: 8.5 });
    paragraph(doc, "5. Atestado de Saúde: Sim, recebi !", { size: 8.5 });
    paragraph(doc, "3.2) O comprador(a) declara estar ciente de que a matriz responsável pela emissão dos pedigrees encontra-se registrada junto à Cinobras, não possuindo direito de escolher a entidade ou associação responsável pelo registro e emissão do Pedigree.");
    paragraph(doc, "3.3) O Pedigree será emitido pela entidade responsável pelo registro da matriz, sendo esta uma Entidade Cinófila devidamente legalizada e registrada no 1º Cartório de Registro Civil de Pessoa Jurídica sob nº 79.613 e inscrita no CNPJ sob nº 22.214.403/0001-76.");

    section(doc, "DAS OBRIGAÇÕES DO VENDEDOR (A) E COMPRADOR (A)");
    clause(doc, "Cláusula Quarta");
    [
      "4.1) O vendedor se obriga a entregar ao comprador(a), a carteira de vacinação do animal no ato da compra, com indicação da vacina e vermifugação.",
      "4.2) A entrega do PEDIGREE será realizada imediatamente após a emissão que é feita por órgão competente, não se responsabilizando assim o vendedor por eventuais demoras.",
      "4.3) Certificado de microchip assinado pelo Médico Veterinário responsável.",
      "4.4) O comprador(a), após a comunicação da confecção do PEDIGREE, receberá o documento exclusivamente via correios, com aviso de recebimento, mediante o pagamento de taxa de R$ 35,00 (trinta e cinco reais). O vendedor não se responsabiliza por eventuais extravios ocasionados pela empresa responsável pelo transporte.",
      "4.5) Atestado de Saúde; assinado pelo Médico Veterinário responsável. (O atestado específico para embarque aéreo, deverá ser solicitado e adquirido a parte).",
      "4.6) Caso o documento pedigree não seja retirado ou solicitado o envio por correio com aviso de recebimento, dentro do prazo informado no parágrafo anterior, o mesmo será desprezado, e, em caso de nova solicitação o valor da documentação será cobrada na época própria, tudo de acordo com a tabela praticada pelo Centro de Cinofilia Competente.",
    ].forEach((t) => paragraph(doc, t));
    paragraph(doc, "-");

    pageBreak(doc);

    section(doc, "DA RETIRADA DO FILHOTE");
    clause(doc, "Cláusula Quinta");
    [
      "5.1) Caso o filhote não seja retirado no ato da compra ou seja deixado em loja por qualquer outro motivo não autorizado judicialmente, em razão da acomodação posterior à venda, será cobrada o dia de hospedagem, na proporção de R$ 80,00 (oitenta reais) o dia.",
      "5.2) Considerar-se-á rescindido o contrato de compra e venda, caso o valor devido a título de hospedagem ultrapasse a monta do contrato ora firmado, neste caso o filhote será disponibilizado para venda à terceiros, sendo que, do valor dispendido pelo pagamento do canino será retido 30% (trinta por cento) do valor total do contrato, destinado à cobertura dos gastos de acomodação e alimentação.",
      "5.3) Caso seja necessário o despacho do canino, via terrestre ou aéreo, as respectivas despesas e riscos serão suportados exclusivamente pelo comprador (a), responsabilizando-se este inclusive no caso de contaminação ou óbito.",
      "5.4) No caso de despacho do canino, o comprador (a) arcará com as despesas de traslado, incluindo a contratação e pagamento de taxi-dog, sendo certo que, considerar-se-á a data da efetiva entrega do animal a data da sua retirada da loja.",
    ].forEach((t) => paragraph(doc, t));
    paragraph(doc, "-");

    section(doc, "DA RETIRADA DO FILHOTE");
    clause(doc, "Cláusula Sexta");
    [
      "6.1) O comprador(a) declara ter recebido todas orientações quanto aos cuidados do canino ao que tange: vacinação, vermifugação, da impossibilidade de contato com outros animais filhotes ou adultos antes da conclusão do ciclo inicial de vacinação, da impossibilidade de exposição à locais públicos de grande circulação, ao fornecimento de alimentação adequada, assumindo a responsabilidade de inclusive apresentar o canino no prazo de até 48h de sua retirada e às suas expensas, em veterinário de sua confiança, para confirmação do atestado de sanidade canina expedido pelo veterinário responsável do vendedor.",
      "6.2) Passadas as 48h, sem a prerrogativa da confirmação da sanidade canina por veterinário de confiança do comprador (a), o mesmo dará plena e total concordância de que o estado de saúde do animal retirado, estava em perfeitas condições de saúde e higiene, aceitando-o no estado recebido obrigando-se à seguir às orientações dadas na entrega do canino, posto que o filhote ainda não tem a imunidade necessária para exposição à riscos biológicos ou bacterianos.",
      "6.3) Em caso de ressalva da saúde canina, expedido por laudo médico veterinário, relacionados exclusivamente às doenças de cegueira, surdez, palato aberto; ou qualquer má-formação congênita, deverá ser apontado através de laudo médico veterinário da confiança do comprador (a), e sua comunicação ao vendedor deve ser IMEDIATA, dentro das 48h da retirada do animal da posse do vendedor, para as tomadas de providências necessárias quanto à substituição do animal, por mesma raça e gênero, sucessivamente à animal de valor equivalente ao adquirido.",
      "6.4) Na falta de qualquer filhote e na impossibilidade de espera pelo comprador(a) de nova ninhada, o valor da compra será estornado integralmente, desde que a comunicação das enfermidades elencadas seja feita dentro das hipóteses e condições do parágrafo anterior.",
    ].forEach((t) => paragraph(doc, t));
    paragraph(doc, "-");

    pageBreak(doc);

    section(doc, "DAS GARANTIAS");
    clause(doc, "Cláusula Sétima");
    [
      "7.1) Fica convencionado que, o comprador(a) possui garantia de atendimento veterinário ao canino adquirido, por profissional médico do vendedor, ou a este conveniado dentro do prazo de 30 (trinta) dias.",
      "7.2) Tal garantia não se estende à medicamentos, desde que não tenha relação com a retirada do canino do local presente. (em caso de necessidade de uso medicamentoso, o produto deverá ser retirado diretamente em loja).",
      "7.3) Perderá a garantia do filhote se o mesmo for tratado em outro estabelecimento veterinário, sob qualquer pretexto.",
      "7.4) Em caso de urgência, sob prévia comunicação ao vendedor, fora dos horários de atendimento e funcionamento deste, o Comprador poderá dirigir-se ao Hospital Conveniado ao Vendedor, para que tenha a garantia mantida e o suporte prestado, sito ao Endereço: Rua Dr.Silvino de Godoy, 540 - Jardim de Itapoan, Paulínia - SP, 13140-252.",
      "7.5) Não estão inclusas nas garantias de troca: possíveis alterações de predisposição racial (luxação de patela, prolapso de glândula lacrimal, necrose asséptica da cabeça do fêmur) e enfermidades hereditárias, tais como: dermáticos, uma vez que, a hereditariedade pode estar relacionada com genes de gerações passadas podendo ser manifestada com queda de imunidade.",
      "7.6) O vendedor por sua vez, declara para os fins civis e criminais que, os pais do canino vendido nunca manifestaram as patologias descritas no parágrafo 3º desta cláusula.",
      "7.7) Em relação à displasia coxa femoral (patologia de instabilidade articular do quadril com casuística de 95% genética e 5% adquirida), o vendedor não garante a inexistência da instabilidade no filhote, uma vez que, o gene hereditário da displasia coxo femoral pode ser manifestada em até 10 gerações sucessoras, todavia, esclarece e afirma o vendedor que, os pais do filhote adquirido não apresentaram tais alterações físicas.",
      "7.8) Em relação a coprofagia, importante informar que, algumas raças podem apresentar este desvio de comportamento e que a garantia não se estende para detectar tal anomalia, vez que, na aquisição o comprador(a) foi orientado aos procedimentos que devem ser adotados na educação do canino, com intuito de afastar o mal hábito.",
      "7.9) Fica esclarecido que, conforme o desenvolvimento do filhote, podem ocorrer alterações na cor e/ou pelagem. O comprador(a) tem ciência que a cor de registro no Pedigree e no Contrato de Venda e Compra, refere-se a observação da coloração no momento do nascimento, esclarecendo que poderá haver mudanças na tonalidade da pelagem quando do primeira tosa ou idade adulta. Salientando que, este fato não é considerado defeito, portanto, essas possíveis alterações não possibilitam troca ou qualquer tipo de reembolso do filhote.",
      "7.10) Recomenda-se banhos e tosas somente em animais após o término do esquema vacinal, vez que, anterior à isto o canino estará exposto à vírus e bactérias, pois não possui imunidade necessária para combater algumas mazelas, assim, o comprador(a) é responsável pela inobservância de tal procedimento.",
      "7.11) NÃO ESTÃO COBERTOS PELA GARANTIA:\n• Úlcera de Córnea\n• Quedas\n• Feridas\n• Intoxicações\n• Choques elétricos\n• Queimadura\n• Ectoparasitas\n• Virose\n• Casos de óbito causado por doença infectocontagiosa no animal",
    ].forEach((t) => paragraph(doc, t));

    pageBreak(doc);

    section(doc, "DO DIREITO DA IMAGEM");
    clause(doc, "Cláusula Oitava");
    [
      "8.1) É proibida a divulgação e utilização dos dados do vendedor para todos os fins de direito sem sua expressa autorização, por qualquer meio de comunicação.",
      "8.2) Fica ajustado que, em casos de dúvidas, esclarecimentos, divergências, insatisfações, reclamações o contato será realizado diretamente com o gerente responsável pela loja e atendimento ou suporte.",
      "8.3) Fica expressamente ajustado que, em caso de reclamações com utilização de ofensas, pareceres sem fundamentação médica veterinária, palavras inadequadas e de baixo calão, junto aos meios de comunicações tais como: FACEBOOK, INSTAGRAM, WHATSAPP, serão objetos de demandas judiciais, e o comprador(a) responderá civil e criminalmente pelos prejuízos causados.",
      "8.4) Fica fixado multa de 10x o valor do contrato pelo descumprimento das clausulas acima mencionadas.",
    ].forEach((t) => paragraph(doc, t));
    paragraph(doc, "-");

    section(doc, "DISPOSIÇÕES FINAIS");
    clause(doc, "Cláusula Nona");
    [
      "9.1) O vendedor não se responsabiliza por óbito do animal que seja decorrente de doença-infectocontagiosa (Cinomose, Coronavirose, Hepatite Infecciosa Canina, Parainfluenza, Parvovirose, Doença do Carrapato), que tenha sido causada por negligência do comprador(a), ou seja em inobservância dos cuidados necessários e cumprimento do ciclo de vacinação e vermifugação, tudo devidamente anotados na caderneta do canino.",
      "9.2) O comprador (a) está ciente que, após a retirada do filhote da loja e em razão de mudança do ambiente e separação da mãe e dos irmãos do filhote adquirido; como também: vacinação, transporte terrestre ou aéreo, poderá ocasionar ao canino alteração de imunidade, podendo resultar em uma infecção oportunista de protozoário, sendo considerado normal tal possível alteração, sendo certo que, seu tratamento é breve e sem complexidade.",
      "9.3) O presente contrato é realizado de forma presencial, sendo irrevogável, irretratável, irrenunciável, não cabendo qualquer arrependimento ou devolução do valor pago pelo canino, posto que o comprador (a) é cientificado das exigências de criação que terá com o filhote adquirido, comprometendo-se com os cuidados diários básicos de saúde, alimentação e lazer do canino.",
      "9.4) Para dirimir quaisquer controvérsias oriundas do presente CONTRATO, as partes elegem o foro da Cidade de CAMPINAS no Estado de São Paulo, renunciando a qualquer outro por mais privilegiado que seja. Por estarem assim justos e contratados, firmam o presente instrumento, em duas vias.",
      "9.5) Declara o comprador (a) ter lido integralmente o presente contrato estando de acordo com todas as suas cláusulas, comprometendo-se à zelar pelo animal adquirido e ciente que abandono e maus tratos são caracterizados crimes ambientais, sendo passíveis de prisão e multa:",
    ].forEach((t) => paragraph(doc, t));

    pageBreak(doc);

    paragraph(doc, "LEI Nº 9.605, DE 12 DE FEVEREIRO DE 1998", { bold: true, align: "center", color: "#1B1D6D" });
    paragraph(doc,
      "Dispõe sobre as sanções penais e administrativas derivadas de condutas e atividades lesivas ao meio ambiente, e dá outras providências.\n\n" +
      "Art. 32. Praticar ato de abuso, maus-tratos, ferir ou mutilar animais silvestres, domésticos ou domesticados, nativos ou exóticos:\n\n" +
      "Pena - detenção, de três meses a um ano, e multa.\n\n" +
      "1º Incorre nas mesmas penas quem realiza experiência dolorosa ou cruel em animal vivo, ainda que para fins didáticos ou científicos, quando existirem recursos alternativos.\n\n" +
      "2º A pena é aumentada de um sexto a um terço, se ocorre morte do animal.",
      { align: "center" },
    );

    doc.moveDown(0.8);
    paragraph(doc, "E por estarem ciente da contratação, firmam e assinam o presente em duas vias de iguais.");
    doc.moveDown(1);
    paragraph(doc, `CIDADE ${cidadeFinal}, ${dataExtenso}.`, { align: "left" });
    doc.moveDown(1.5);

    paragraph(doc, "PELO VENDEDOR", { bold: true });
    doc.moveDown(2);
    paragraph(doc, "______________________________________");
    paragraph(doc, "SHOOKPET COMERCIO DE ANIMAIS E MEDICAMENTOS VETERINARIOS LTDA", { size: 8.5 });
    paragraph(doc, "CNPJ : 47.945.634/0002-61", { size: 8.5 });
    paragraph(doc, `VENDA REALIZADA POR: ${vendedora}`, { size: 8.5 });
    paragraph(doc, `Unidade de ${unidade.toUpperCase()}`, { size: 8.5 });

    doc.moveDown(1.5);
    paragraph(doc, "PELO COMPRADOR", { bold: true });
    doc.moveDown(2);
    paragraph(doc, "______________________________________");
    paragraph(doc, nome, { size: 8.5, color: "#dc2626" });
    paragraph(doc, cpf, { size: 8.5, color: "#dc2626" });
    paragraph(doc, telefone, { size: 8.5, color: "#dc2626" });
    paragraph(doc, email, { size: 8.5, color: "#dc2626" });

    pageBreak(doc);
    addLogo(doc);
    paragraph(doc, "TERMO DE AUTORIZAÇÃO DE USO DE IMAGEM E VOZ", { bold: true, size: 11.5, align: "center", gap: 0.8 });
    paragraph(doc,
      "Neste ato, e para todos os fins de direito, autorizo uso da minha imagem e voz para fins de divulgação e publicidade do trabalho artístico-cultural, em caráter definitivo e gratuito, constante em fotos e filmagens.\n\n" +
      "As imagens e voz poderão ser exibidas: parcial ou total, em apresentação, audiovisual, publicações e divulgações em exposições e festivais com ou sem premiações remuneradas nacionais ou internacionais, assim como disponibilizadas no banco de imagens resultante da pesquisa e na internet e em outras mídias futuras, fazendo-se constar os devidos créditos ao fotografo.\n\n" +
      "Por ser esta a expressão de minha vontade, nada terei a reclamar a titulo de direitos conexos a minha imagem de voz ou qualquer outro.",
    );
    doc.moveDown(0.8);
    paragraph(doc, `CIDADE ${cidadeFinal}, ${dataExtenso}.`, { align: "left" });
    doc.moveDown(3);
    paragraph(doc, "__________________________________");
    paragraph(doc, nome, { size: 8.5, color: "#dc2626" });

    doc.end();
  });
}
