import { Router } from "express";
import {
  brlToFloat,
  countMonthAll,
  countTodayAll,
  extractMonthNumFromMonthKey,
  extractYearFromMonthKey,
  filterRows,
  formatDateBr,
  getUniqueMonths,
  getUniqueUnits,
  groupCount,
  groupSum,
  isCpfComplete,
  isError,
  limparNomeArquivo,
  monthLabelPt,
  moneyBr,
  norm,
  parseDate,
  pickFirstExisting,
  todayMonthKey,
  todaySaoPaulo,
} from "../utils/formatters.js";
import { loadMainSheet, saveContract } from "../services/sheets.js";
import { generateContractPdf } from "../services/pdf.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();

function getColumns(rows: Record<string, string>[]) {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  return {
    mes: pickFirstExisting(cols, ["Mês"]),
    unidade: pickFirstExisting(cols, ["Unidade", "Cidade", "Cidade do comprador"]),
    raca: pickFirstExisting(cols, ["Raça"]),
    c1: pickFirstExisting(cols, ["1º contato", "1 contato", "Primeiro contato"]),
    c2: pickFirstExisting(cols, ["2º contato", "2 contato", "Segundo contato"]),
    c3: pickFirstExisting(cols, ["3º contato", "3 contato", "Terceiro contato"]),
    s1: pickFirstExisting(cols, ["Status 1º contato", "Status 1 contato"]),
    s2: pickFirstExisting(cols, ["Status 2º contato", "Status 2 contato"]),
    s3: pickFirstExisting(cols, ["Status 3º contato", "Status 3 contato"]),
    valor: pickFirstExisting(cols, ["Valor Filhote", "Valor filhote", "Valor de filhote", "Valor"]),
    vendedor: pickFirstExisting(cols, ["Vendedora", "Vendedor", "Atendente"]),
  };
}

function buildOperacaoData(rows: Record<string, string>[], mes: string, unidade: string) {
  const c = getColumns(rows);
  const fAll = filterRows(rows, null, "", c.unidade, unidade);
  const fMes = filterRows(rows, c.mes, mes, c.unidade, unidade);

  let primeiroMes = countMonthAll(fAll, c.c1, mes);
  let segundoMes = countMonthAll(fAll, c.c2, mes);
  let terceiroMes = countMonthAll(fAll, c.c3, mes);

  if (primeiroMes === 0 && segundoMes === 0 && terceiroMes === 0) {
    primeiroMes = fMes.length;
    segundoMes = fMes.length;
    terceiroMes = fMes.length;
  }

  let erroMes = 0;
  for (const r of fMes) {
    for (const sc of [c.s1, c.s2, c.s3]) {
      if (sc && isError(r[sc])) erroMes++;
    }
  }

  const contatosMes = [
    { name: "1º contato", total: primeiroMes },
    { name: "2º contato", total: segundoMes },
    { name: "3º contato", total: terceiroMes },
  ];

  const vendasUnidade = c.unidade ? groupCount(fMes, c.unidade) : [];
  const topRacas = c.raca
    ? groupCount(fMes, c.raca).slice(0, 10)
    : [];
  const vendasVendedor = c.vendedor ? groupCount(fMes, c.vendedor).slice(0, 12) : [];

  return {
    total: rows.length,
    meses: getUniqueMonths(rows, c.mes),
    unidades: getUniqueUnits(rows, c.unidade),
    kpis: {
      primeiroHoje: countTodayAll(fAll, c.c1),
      segundoHoje: countTodayAll(fAll, c.c2),
      terceiroHoje: countTodayAll(fAll, c.c3),
      primeiroMes,
      segundoMes,
      terceiroMes,
      erroMes,
      vendasMes: fMes.length,
    },
    charts: { contatosMes, vendasUnidade, topRacas, vendasVendedor },
  };
}

function buildFinanceiroData(rows: Record<string, string>[], mes: string, unidade: string) {
  const c = getColumns(rows);
  const fMes = filterRows(rows, c.mes, mes, c.unidade, unidade);

  let faturamento = 0;
  for (const r of fMes) {
    faturamento += c.valor ? brlToFloat(r[c.valor]) : 0;
  }
  const totalVendas = fMes.length;
  const ticketMedio = totalVendas > 0 ? faturamento / totalVendas : 0;
  const racasSet = new Set(fMes.map((r) => (c.raca ? r[c.raca] : "")).filter(Boolean));

  const faturamentoUnidade = c.unidade && c.valor ? groupSum(fMes, c.unidade, c.valor) : [];
  const faturamentoRaca = c.raca && c.valor ? groupSum(fMes, c.raca, c.valor).slice(0, 10) : [];
  const faturamentoVendedor = c.vendedor && c.valor ? groupSum(fMes, c.vendedor, c.valor).slice(0, 12) : [];
  const tabelaVendedor = faturamentoVendedor.map((v) => ({
    vendedora: v.name,
    faturamento: moneyBr(v.total),
  }));

  const anoRef = extractYearFromMonthKey(mes);
  let faturamentoAnual: { mes: string; faturamento: number }[] = [];
  if (anoRef && c.mes) {
    const fAno = rows.filter((r) => String(r[c.mes!] || "").includes(anoRef));
    const fAnoFiltered = filterRows(fAno, null, "", c.unidade, unidade);
    const map = new Map<number, number>();
    for (const r of fAnoFiltered) {
      const mn = extractMonthNumFromMonthKey(String(r[c.mes!] || ""));
      if (mn) {
        map.set(mn, (map.get(mn) || 0) + (c.valor ? brlToFloat(r[c.valor]) : 0));
      }
    }
    faturamentoAnual = [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([mn, total]) => ({ mes: monthLabelPt(mn), faturamento: total }));
  }

  return {
    total: rows.length,
    meses: getUniqueMonths(rows, c.mes),
    unidades: getUniqueUnits(rows, c.unidade),
    kpis: {
      faturamentoTotal: faturamento,
      faturamentoTotalFmt: moneyBr(faturamento),
      totalVendas,
      ticketMedio,
      ticketMedioFmt: moneyBr(ticketMedio),
      totalRacas: racasSet.size,
    },
    charts: { faturamentoUnidade, faturamentoRaca, faturamentoVendedor, faturamentoAnual },
    tabelaVendedor,
  };
}

function buildVisaoGeralData(rows: Record<string, string>[], mes: string, unidade: string) {
  const oper = buildOperacaoData(rows, mes, unidade);
  const fin = buildFinanceiroData(rows, mes, unidade);
  return { ...oper, financeiro: fin.kpis, finCharts: fin.charts, tabelaVendedor: fin.tabelaVendedor };
}

function isContratoAssinado(row: Record<string, string>, statusCol: string | null): boolean {
  const st = norm(statusCol ? row[statusCol] : row["Status"]);
  if (st) {
    if (st.includes("nao assin") || st.includes("não assin") || st.includes("pendent") || st.includes("aguard")) {
      return false;
    }
    if (st.includes("assin")) return true;
  }
  return Boolean(
    String(row["Data Assinatura Cliente"] || "").trim() ||
    String(row["Data Assinatura Loja"] || "").trim(),
  );
}

function getDisparoEm(row: Record<string, string>): string {
  return String(row["Data Envio"] || row["Documento ZapSign"] || "").trim();
}

function getAtualizadoEm(row: Record<string, string>): string {
  return String(
    row["Data Assinatura Cliente"] ||
    row["Data Assinatura Loja"] ||
    row["Data preenchimento"] ||
    getDisparoEm(row) ||
    "",
  ).trim();
}

function getReferenciaData(row: Record<string, string>): Date | null {
  return (
    parseDate(row["Data Compra"]) ||
    parseDate(row["Data preenchimento"]) ||
    parseDate(getDisparoEm(row))
  );
}

function getSortTimestamp(row: Record<string, string>): number {
  const d = getReferenciaData(row);
  return d ? d.getTime() : Number.MAX_SAFE_INTEGER;
}

function buildStatusAssinaturaData(
  rows: Record<string, string>[],
  nome: string,
  dataInicio: string,
  dataFim: string,
  statusFilter: string,
) {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const statusCol = pickFirstExisting(cols, ["Status", "Status Assinatura", "Status do contrato"]);
  const nomeCol = pickFirstExisting(cols, ["Nome"]);
  const nomeQuery = norm(nome);

  let filtered = rows.map((row, index) => {
    const nomeCliente = nomeCol ? String(row[nomeCol] || "").trim() : "";
    const assinado = isContratoAssinado(row, statusCol);
    const disparoEm = getDisparoEm(row);
    const atualizadoEm = getAtualizadoEm(row);
    const linkAssinatura = String(row["Link Assinatura"] || "").trim();
    const identificador = `contrato_${limparNomeArquivo(nomeCliente || `registro_${index + 1}`)}.pdf`;

    return {
      sheetIndex: index,
      nome: nomeCliente || "Sem nome",
      identificador,
      status: assinado ? "assinado" as const : "pendente" as const,
      statusLabel: assinado ? "Assinado" : "Não assinado",
      disparoEm: disparoEm || "—",
      atualizadoEm: atualizadoEm || "—",
      dataCompra: String(row["Data Compra"] || "").trim() || "—",
      linkAssinatura,
      email: String(row["E-mail"] || "").trim(),
      telefone: String(row["Telefone"] || "").trim(),
      referenciaData: getReferenciaData(row),
      sortTimestamp: getSortTimestamp(row),
    };
  });

  if (nomeQuery) {
    filtered = filtered.filter((item) => norm(item.nome).includes(nomeQuery));
  }

  if (dataInicio) {
    const start = parseDate(dataInicio);
    if (start) {
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter((item) => item.referenciaData && item.referenciaData >= start);
    }
  }

  if (dataFim) {
    const end = parseDate(dataFim);
    if (end) {
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((item) => item.referenciaData && item.referenciaData <= end);
    }
  }

  if (statusFilter === "assinado") {
    filtered = filtered.filter((item) => item.status === "assinado");
  } else if (statusFilter === "pendente") {
    filtered = filtered.filter((item) => item.status === "pendente");
  }

  const items = filtered
    .sort((a, b) => {
      if (a.sortTimestamp !== b.sortTimestamp) return a.sortTimestamp - b.sortTimestamp;
      return a.sheetIndex - b.sheetIndex;
    })
    .map(({ referenciaData: _ref, sortTimestamp: _sort, ...item }, index) => ({
      ...item,
      id: index + 1,
    }));

  return {
    total: items.length,
    resumo: {
      assinados: items.filter((i) => i.status === "assinado").length,
      pendentes: items.filter((i) => i.status === "pendente").length,
    },
    items,
  };
}

router.get("/operacao", authMiddleware, requireRole("operacao"), async (req, res) => {
  try {
    const mes = String(req.query.mes || todayMonthKey());
    const unidade = String(req.query.unidade || "Todas");
    const rows = await loadMainSheet();
    res.json(buildOperacaoData(rows, mes, unidade));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/financeiro", authMiddleware, requireRole("financeiro"), async (req, res) => {
  try {
    const mes = String(req.query.mes || todayMonthKey());
    const unidade = String(req.query.unidade || "Todas");
    const rows = await loadMainSheet();
    res.json(buildFinanceiroData(rows, mes, unidade));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/visao-geral", authMiddleware, requireRole("operacao"), async (req, res) => {
  try {
    const mes = String(req.query.mes || todayMonthKey());
    const unidade = String(req.query.unidade || "Todas");
    const rows = await loadMainSheet();
    res.json(buildVisaoGeralData(rows, mes, unidade));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.get("/status-assinatura", authMiddleware, requireRole("operacao"), async (req, res) => {
  try {
    const nome = String(req.query.nome || "");
    const dataInicio = String(req.query.dataInicio || "");
    const dataFim = String(req.query.dataFim || "");
    const status = String(req.query.status || "todos");
    const rows = await loadMainSheet();
    res.json(buildStatusAssinaturaData(rows, nome, dataInicio, dataFim, status));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.get("/contracts/preview/:sheetIndex", authMiddleware, requireRole("operacao"), async (req, res) => {
  try {
    const sheetIndex = parseInt(String(req.params.sheetIndex), 10);
    if (!Number.isFinite(sheetIndex) || sheetIndex < 0) {
      res.status(400).json({ error: "Índice de contrato inválido." });
      return;
    }

    const rows = await loadMainSheet();
    const contrato = rows[sheetIndex];
    if (!contrato) {
      res.status(404).json({ error: "Contrato não encontrado." });
      return;
    }

    const pdf = await generateContractPdf(contrato);
    const nome = limparNomeArquivo(String(contrato["Nome"] || "contrato"));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="contrato_${nome}.pdf"`);
    res.send(pdf);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/contracts", authMiddleware, requireRole("operacao"), async (req, res) => {
  try {
    const contrato = req.body as Record<string, string>;
    const obrigatorios = ["Nome", "Telefone", "CPF", "E-mail", "Raça", "Sexo", "Cor", "Pelagem", "Data Compra", "Valor Filhote"];
    const faltando = obrigatorios.filter((k) => !String(contrato[k] || "").trim());
    if (faltando.length) {
      res.status(400).json({ error: `Preencha: ${faltando.join(", ")}` });
      return;
    }

    if (!isCpfComplete(contrato["CPF"])) {
      res.status(400).json({ error: "CPF obrigatório no formato 123.456.789-00 (11 dígitos)." });
      return;
    }

    const now = todaySaoPaulo();
    contrato["Data preenchimento"] = `${formatDateBr(now)} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    await saveContract(contrato);
    const pdf = await generateContractPdf(contrato);
    const nome = limparNomeArquivo(contrato["Nome"]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="contrato_${nome}.pdf"`);
    res.send(pdf);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
