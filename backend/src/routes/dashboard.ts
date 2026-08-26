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
  getRowMonthKey,
  groupCount,
  groupSum,
  isCpfComplete,
  isError,
  limparNomeArquivo,
  monthKeyFromDate,
  monthLabelPt,
  normalizeMonthKey,
  moneyBr,
  norm,
  parseDate,
  pickFirstExisting,
  todayMonthKey,
  todaySaoPaulo,
} from "../utils/formatters.js";

const CONTRATO_CAMPOS_OBRIGATORIOS: Record<string, string> = {
  Nome: "Nome do comprador",
  Telefone: "WhatsApp",
  CPF: "CPF",
  "E-mail": "E-mail",
  Endereço: "Endereço",
  Número: "Nº da residência",
  CEP: "CEP",
  Estado: "Estado",
  Cidade: "Cidade",
  Bairro: "Bairro",
  RG: "RG",
  Raça: "Raça",
  Sexo: "Sexo",
  Cor: "Cor",
  Pelagem: "Pelagem",
  Espécie: "Espécie",
  Microchip: "Microchip",
  "Nascimento filhote": "Nascimento do filhote",
  "Data Compra": "Data da compra",
  "Valor Filhote": "Valor do filhote",
  "Valor por extenso": "Valor por extenso",
  "Forma de pagamento": "Forma de pagamento",
  "Quantidade de parcelas": "Quantidade de parcelas",
  Vendedora: "Vendedora",
};

function camposObrigatoriosFaltando(contrato: Record<string, string>): string[] {
  return Object.entries(CONTRATO_CAMPOS_OBRIGATORIOS)
    .filter(([k]) => !String(contrato[k] || "").trim())
    .map(([, label]) => label);
}
import { getCanonicalUnitStoreEmail, getConfiguredUnits, getUnitByEmail, getUnitByKey, LoadedRow, UnitKey } from "../config.js";
import {
  deleteContractRows,
  getContractRow,
  invalidateSheetRowsCache,
  loadAllUnitRowsWithWarnings,
  loadRowsForUser,
  pruneAllSheetsToDemo,
  saveContract,
  saveContractForUser,
  updateContractRow,
} from "../services/sheets.js";
import { generateContractPdf } from "../services/pdf.js";
import {
  buildSignatureProgress,
  contractOverallStatus,
  isContratoAssinadoInApp,
  isSignatarioPendente,
} from "../services/signatureStatus.js";
import {
  clientSignUrl,
  createSignatureSession,
  getSignature,
  loadSignaturesMap,
  signatureImages,
  SignatureRecord,
} from "../services/signatures.js";
import {
  buildZapSignSheetPatch,
  createUnitContractDocument,
  fetchZapSignDocumentPdf,
  isZapSignEnabled,
} from "../services/zapsign.js";
import { invalidateZapSignSignatureCache, syncZapSignRowsForStatus } from "../services/zapsignSignatureSync.js";
import {
  getContractAttachmentBuffers,
  saveContractAttachments,
  AttachmentKind,
  DocFormKind,
} from "../services/contractAttachments.js";
import {
  getDocFormStatus,
  loadDocFormStatusMap,
  saveDocFormAttachments,
} from "../services/contractDocForm.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();

function toSheetRows(loaded: LoadedRow[]): Record<string, string>[] {
  return loaded.map((item) => item.data);
}

function defaultUnidade(user: AuthRequest["user"], requested: string): string {
  if (requested && requested !== "Todas") return requested;
  if (user?.unit) {
    const unit = getUnitByKey(user.unit);
    if (unit) return unit.label;
  }
  return requested || "Todas";
}

function getColumns(rows: Record<string, string>[]) {
  const cols = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const pickPopulated = (candidates: string[]) => {
    for (const candidate of candidates) {
      const col = pickFirstExisting(cols, [candidate]);
      if (col && rows.some((r) => String(r[col] || "").trim())) return col;
    }
    return pickFirstExisting(cols, candidates);
  };
  return {
    mes: pickPopulated(["Mês", "Mes"]),
    dataCompra: pickPopulated(["Data Compra", "Data compra", "Data da compra"]),
    unidade: pickPopulated(["Unidade", "Cidade", "Cidade do comprador"]),
    raca: pickPopulated(["Raça"]),
    c1: pickFirstExisting(cols, ["1º contato", "1 contato", "Primeiro contato"]),
    c2: pickFirstExisting(cols, ["2º contato", "2 contato", "Segundo contato"]),
    c3: pickFirstExisting(cols, ["3º contato", "3 contato", "Terceiro contato"]),
    s1: pickFirstExisting(cols, ["Status 1º contato", "Status 1 contato"]),
    s2: pickFirstExisting(cols, ["Status 2º contato", "Status 2 contato"]),
    s3: pickFirstExisting(cols, ["Status 3º contato", "Status 3 contato"]),
    valor: pickPopulated(["Valor Filhote", "Valor filhote", "Valor de filhote", "Valor"]),
    vendedor: pickPopulated(["Vendedora", "Vendedor", "Atendente"]),
  };
}

function buildOperacaoData(rows: Record<string, string>[], mes: string, unidade: string) {
  const c = getColumns(rows);
  const fAll = filterRows(rows, null, "", c.unidade, unidade, c.dataCompra);
  const fMes = filterRows(rows, c.mes, mes, c.unidade, unidade, c.dataCompra);

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
    total: fAll.length,
    meses: getUniqueMonths(rows, c.mes, c.dataCompra),
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

function financeiroFilterUnits(rows: Record<string, string>[], unidadeCol: string | null): string[] {
  const fromRows = getUniqueUnits(rows, unidadeCol);
  if (fromRows.length > 1) return fromRows;
  return ["Todas", ...getConfiguredUnits().map((unit) => unit.label)];
}

function buildFinanceiroData(rows: Record<string, string>[], mes: string, unidade: string) {
  const c = getColumns(rows);
  const fMes = filterRows(rows, c.mes, mes, c.unidade, unidade, c.dataCompra);

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
    const fAno = rows.filter((r) => extractYearFromMonthKey(getRowMonthKey(r, c.mes, c.dataCompra)) === anoRef);
    const fAnoFiltered = filterRows(fAno, null, "", c.unidade, unidade, c.dataCompra);
    const map = new Map<number, number>();
    for (const r of fAnoFiltered) {
      const mn = extractMonthNumFromMonthKey(getRowMonthKey(r, c.mes, c.dataCompra));
      if (mn) {
        map.set(mn, (map.get(mn) || 0) + (c.valor ? brlToFloat(r[c.valor]) : 0));
      }
    }
    faturamentoAnual = Array.from({ length: 12 }, (_, i) => {
      const mn = i + 1;
      return { mes: monthLabelPt(mn), faturamento: map.get(mn) || 0 };
    });
  }

  return {
    total: filterRows(rows, null, "", c.unidade, unidade, c.dataCompra).length,
    meses: getUniqueMonths(rows, c.mes, c.dataCompra),
    unidades: financeiroFilterUnits(rows, c.unidade),
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

function signatureKey(unitKey: UnitKey, sheetIndex: number): string {
  return `${unitKey}:${sheetIndex}`;
}

function isContratoAssinado(
  row: Record<string, string>,
  _statusCol: string | null,
  _unitKey: UnitKey,
  record?: SignatureRecord | null,
): boolean {
  if (record) {
    return isContratoAssinadoInApp(record);
  }

  const dataCliente = String(row["Data Assinatura Cliente"] || "").trim();
  const dataLoja = String(row["Data Assinatura Loja"] || "").trim();
  if (dataCliente && dataLoja) return true;

  const st = norm(row["Status Assinatura"] || row["Status"]);
  if (st.includes("nao assin") || st.includes("não assin") || st.includes("pendent") || st.includes("aguard")) {
    return false;
  }
  return st.includes("assinado (zapsign)") || st === "assinado";
}

function getDisparoEm(row: Record<string, string>, record?: SignatureRecord | null): string {
  if (record?.sentAt) return record.sentAt;
  return String(row["Data Envio"] || row["Documento ZapSign"] || row["Link Assinatura"] || "").trim();
}

function getAtualizadoEm(row: Record<string, string>, record?: SignatureRecord | null): string {
  if (record?.lojaSignedAt) return record.lojaSignedAt;
  if (record?.clienteSignedAt) return record.clienteSignedAt;
  if (record?.sentAt) return record.sentAt;
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
  loaded: LoadedRow[],
  nome: string,
  dataInicio: string,
  dataFim: string,
  statusFilter: string,
  signatures: Map<string, SignatureRecord>,
  docFormMap: Map<string, import("../services/contractDocForm.js").DocFormStatus>,
  unidade: string,
) {
  const rows = toSheetRows(loaded);
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const statusCol = pickFirstExisting(cols, ["Status", "Status Assinatura", "Status do contrato"]);
  const nomeCol = pickFirstExisting(cols, ["Nome"]);
  const nomeQuery = norm(nome);

  let filtered = loaded.map((item, index) => {
    const row = item.data;
    const record = signatures.get(signatureKey(item.unitKey, item.sheetIndex)) || null;
    const nomeCliente = nomeCol ? String(row[nomeCol] || "").trim() : "";
    const assinado = isContratoAssinado(row, statusCol, item.unitKey, record);
    const disparoEm = getDisparoEm(row, record);
    const atualizadoEm = getAtualizadoEm(row, record);
    const linkAssinatura = record
      ? clientSignUrl(record.clientToken)
      : String(row["Link Assinatura"] || "").trim();
    const identificador = `contrato_${limparNomeArquivo(nomeCliente || `registro_${index + 1}`)}.pdf`;
    const assinatura = buildSignatureProgress(row, item.unitKey, record);
    const overall = contractOverallStatus(assinatura);
    const dataClienteAssinatura = String(row["Data Assinatura Cliente"] || "").trim();
    const dataLojaAssinatura = String(row["Data Assinatura Loja"] || "").trim();
    const podeAssinarLoja = Boolean(
      (record?.clienteSignedAt && !record?.lojaSignedAt) ||
      (dataClienteAssinatura && !dataLojaAssinatura && String(row["Link Assinatura Loja"] || "").trim()),
    );
    const docForm = docFormMap.get(signatureKey(item.unitKey, item.sheetIndex)) || {
      anexos: {
        carteirinhaFrente: { enviado: false },
        carteirinhaVerso: { enviado: false },
        atestado: { enviado: false },
        fotoFilhote: { enviado: false },
      },
      completo: false,
      pendentes: ["carteirinhaFrente", "carteirinhaVerso", "atestado", "fotoFilhote"] as DocFormKind[],
      total: 4,
      enviados: 0,
      emailEnviado: false,
      statusLabel: "Pendente",
    };

    return {
      sheetIndex: item.sheetIndex,
      unitKey: item.unitKey,
      nome: nomeCliente || "Sem nome",
      identificador,
      status: assinado || overall.status === "assinado" ? "assinado" as const : "pendente" as const,
      statusLabel: assinado ? "Assinado" : overall.statusLabel,
      disparoEm: disparoEm || "—",
      atualizadoEm: atualizadoEm || "—",
      dataCompra: String(row["Data Compra"] || "").trim() || "—",
      unidade: getUnitByKey(item.unitKey)?.label || item.unitKey,
      linkAssinatura,
      linkAssinaturaLoja: String(row["Link Assinatura Loja"] || "").trim(),
      docToken: String(row["Documento ZapSign"] || "").trim(),
      email: String(row["E-mail"] || "").trim(),
      telefone: String(row["Telefone"] || "").trim(),
      referenciaData: getReferenciaData(row),
      sortTimestamp: getSortTimestamp(row),
      assinatura,
      podeAssinarLoja,
      inAppSignature: Boolean(record),
      docForm,
    };
  });

  if (nomeQuery) {
    filtered = filtered.filter((item) => norm(item.nome).includes(nomeQuery));
  }

  if (unidade && unidade !== "Todas") {
    const target = norm(unidade);
    filtered = filtered.filter((item) => norm(item.unidade) === target);
  }

  if (dataInicio || dataFim) {
    const startDay = dataInicio ? parseDate(dataInicio) : null;
    const endDay = dataFim ? parseDate(dataFim) : startDay;
    if (startDay || endDay) {
      const start = startDay ? new Date(startDay) : new Date(endDay!);
      start.setHours(0, 0, 0, 0);
      const end = endDay ? new Date(endDay) : new Date(startDay!);
      end.setHours(23, 59, 59, 999);
      if (start.getTime() > end.getTime()) {
        const swap = new Date(start);
        start.setTime(end.getTime());
        end.setTime(swap.getTime());
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      }
      filtered = filtered.filter(
        (item) => item.referenciaData && item.referenciaData >= start && item.referenciaData <= end,
      );
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
    unidades: (() => {
      const fromRows = getUniqueUnits(loaded.map((item) => item.data), "Unidade");
      const extras = getConfiguredUnits().map((unit) => unit.label);
      const set = new Set(fromRows);
      for (const label of extras) set.add(label);
      return ["Todas", ...[...set].filter((u) => u !== "Todas").sort()];
    })(),
    resumo: {
      assinados: items.filter((i) => i.status === "assinado").length,
      pendentes: items.filter((i) => i.status === "pendente").length,
      pendentesLoja: items.filter((i) => isSignatarioPendente(i.assinatura, "Loja")).length,
      pendentesCliente: items.filter((i) => isSignatarioPendente(i.assinatura, "Cliente")).length,
    },
    items,
  };
}

router.get("/operacao", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const mes = String(req.query.mes || todayMonthKey());
    const unidade = defaultUnidade(req.user, String(req.query.unidade || "Todas"));
    const loaded = await loadRowsForUser(req.user!);
    res.json(buildOperacaoData(toSheetRows(loaded), mes, unidade));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/financeiro", authMiddleware, requireRole("financeiro"), async (req: AuthRequest, res) => {
  try {
    const mes = String(req.query.mes || todayMonthKey());
    const unidade = String(req.query.unidade || "Todas");
    const { rows: loaded, warnings } = await loadAllUnitRowsWithWarnings();
    const payload = buildFinanceiroData(toSheetRows(loaded), mes, unidade);
    res.json(warnings.length ? { ...payload, warnings } : payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.get("/visao-geral", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const mes = String(req.query.mes || todayMonthKey());
    const unidade = defaultUnidade(req.user, String(req.query.unidade || "Todas"));
    const loaded = await loadRowsForUser(req.user!);
    res.json(buildVisaoGeralData(toSheetRows(loaded), mes, unidade));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.get("/status-assinatura", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const nome = String(req.query.nome || "");
    const dataInicio = String(req.query.dataInicio || req.query.data || "");
    const dataFim = String(req.query.dataFim || req.query.data || req.query.dataInicio || "");
    const status = String(req.query.status || "todos");
    const unidade = defaultUnidade(req.user, String(req.query.unidade || "Todas"));
    const refresh = String(req.query.refresh || "") === "1";
    if (refresh) {
      invalidateSheetRowsCache();
      invalidateZapSignSignatureCache();
    }
    const loaded = await loadRowsForUser(req.user!);
    const syncedLoaded = await syncZapSignRowsForStatus(loaded);
    const signatures = await loadSignaturesMap();
    const docFormMap = await loadDocFormStatusMap(
      syncedLoaded.map((item) => ({ unitKey: item.unitKey, sheetIndex: item.sheetIndex, contrato: item.data })),
    );
    res.json(buildStatusAssinaturaData(syncedLoaded, nome, dataInicio, dataFim, status, signatures, docFormMap, unidade));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.get("/contracts/preview/:unitKey/:sheetIndex", authMiddleware, requireRole("operacao"), async (req, res) => {
  try {
    const unitKey = String(req.params.unitKey) as UnitKey;
    const sheetIndex = parseInt(String(req.params.sheetIndex), 10);
    if (!getUnitByKey(unitKey)) {
      res.status(400).json({ error: "Unidade inválida." });
      return;
    }
    if (!Number.isFinite(sheetIndex) || sheetIndex < 0) {
      res.status(400).json({ error: "Índice de contrato inválido." });
      return;
    }

    const contrato = await getContractRow(unitKey, sheetIndex);
    if (!contrato) {
      res.status(404).json({ error: "Contrato não encontrado." });
      return;
    }

    const nome = limparNomeArquivo(String(contrato["Nome"] || "contrato"));
    const docToken = String(contrato["Documento ZapSign"] || "").trim();
    let pdf: Buffer | null = null;

    if (docToken && isZapSignEnabled(unitKey)) {
      pdf = await fetchZapSignDocumentPdf(docToken);
    }

    if (!pdf) {
      const record = await getSignature(unitKey, sheetIndex);
      const attachments = await getContractAttachmentBuffers(unitKey, sheetIndex);
      pdf = await generateContractPdf(contrato, signatureImages(record), attachments);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="contrato_${nome}.pdf"`);
    res.send(pdf);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/contracts/register-zapsign", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const body = req.body as {
      unitKey?: UnitKey;
      contrato?: Record<string, string>;
      zapsign?: {
        docToken?: string;
        signUrl?: string;
        storeSignUrl?: string;
        storeEmail?: string;
      };
    };

    const contrato = (body.contrato && typeof body.contrato === "object" ? body.contrato : {}) as Record<string, string>;
    const zapsign = body.zapsign || {};
    const docToken = String(zapsign.docToken || "").trim();
    const signUrl = String(zapsign.signUrl || "").trim();

    if (!docToken || !signUrl) {
      res.status(400).json({ error: "Informe docToken e signUrl do ZapSign." });
      return;
    }

    const faltando = camposObrigatoriosFaltando(contrato);
    if (faltando.length) {
      res.status(400).json({ error: `Preencha os campos obrigatórios: ${faltando.join(", ")}` });
      return;
    }

    if (!isCpfComplete(contrato["CPF"])) {
      res.status(400).json({ error: "CPF obrigatório no formato 123.456.789-00 (11 dígitos)." });
      return;
    }

    const unitKey =
      body.unitKey ||
      req.user!.unit ||
      getUnitByEmail(req.user!.username)?.key;
    if (!unitKey) {
      res.status(400).json({ error: "Unidade não informada." });
      return;
    }

    const unit = getUnitByKey(unitKey);
    if (!unit) {
      res.status(400).json({ error: "Unidade inválida." });
      return;
    }

    if (req.user!.unit && req.user!.unit !== unitKey) {
      res.status(403).json({ error: "Acesso negado para esta unidade." });
      return;
    }

    const now = todaySaoPaulo();
    contrato["Data preenchimento"] = `${formatDateBr(now)} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    contrato["Unidade"] = unit.label;
    contrato["E-mail Loja"] = getCanonicalUnitStoreEmail(unitKey);

    const sheetIndex = await saveContract(contrato, unit);
    const patch = buildZapSignSheetPatch(
      {
        docToken,
        signUrl,
        status: "pending",
        emailSent: false,
        storeSignUrl: String(zapsign.storeSignUrl || "").trim() || undefined,
        storeEmail: getCanonicalUnitStoreEmail(unitKey),
      },
      contrato,
      unitKey,
    );
    await updateContractRow(unitKey, sheetIndex, patch);

    res.json({
      ok: true,
      sheetIndex,
      unitKey,
      message: `Contrato ${contrato.Nome} registrado na planilha com links ZapSign.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/contracts", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const body = req.body as {
      contrato?: Record<string, string>;
      anexos?: Partial<Record<AttachmentKind, string>>;
    } & Record<string, string>;

    const contrato = (body.contrato && typeof body.contrato === "object" ? body.contrato : body) as Record<string, string>;
    const anexos = body.anexos;
    const faltando = camposObrigatoriosFaltando(contrato);
    if (faltando.length) {
      res.status(400).json({ error: `Preencha os campos obrigatórios: ${faltando.join(", ")}` });
      return;
    }

    if (!isCpfComplete(contrato["CPF"])) {
      res.status(400).json({ error: "CPF obrigatório no formato 123.456.789-00 (11 dígitos)." });
      return;
    }

    const now = todaySaoPaulo();
    contrato["Data preenchimento"] = `${formatDateBr(now)} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    if (contrato["Mês"]) {
      contrato["Mês"] = normalizeMonthKey(contrato["Mês"]);
    } else if (contrato["Data Compra"]) {
      contrato["Mês"] = normalizeMonthKey(monthKeyFromDate(parseDate(contrato["Data Compra"])));
    }

    const saveUnitKey = req.user!.unit || getUnitByEmail(req.user!.username)?.key;
    if (saveUnitKey) {
      contrato["E-mail Loja"] = getCanonicalUnitStoreEmail(saveUnitKey);
    }

    const sheetIndex = await saveContractForUser(contrato, req.user!);
    const unitKey = saveUnitKey;

    if (unitKey && isZapSignEnabled(unitKey)) {
      const zapsignDoc = await createUnitContractDocument(
        unitKey,
        contrato,
        `${unitKey}:${sheetIndex}`,
      );
      await updateContractRow(unitKey, sheetIndex, buildZapSignSheetPatch(zapsignDoc, contrato, unitKey));

      const message = zapsignDoc.emailSent && zapsignDoc.clientEmail
        ? `Contrato enviado ao ZapSign. Link de assinatura enviado de contato@skoobpet.com.br para ${zapsignDoc.clientEmail}.`
        : "Contrato enviado ao ZapSign. Compartilhe o link com o cliente.";

      res.json({
        ok: true,
        provider: "zapsign",
        signUrl: zapsignDoc.signUrl,
        docToken: zapsignDoc.docToken,
        sheetIndex,
        emailSent: zapsignDoc.emailSent,
        clientEmail: zapsignDoc.clientEmail,
        message,
      });
      return;
    }

    let record = null;
    let clientSignUrlHeader = "";
    if (unitKey === "campinas" && !isZapSignEnabled("campinas")) {
      record = await createSignatureSession(unitKey, sheetIndex, contrato);
      clientSignUrlHeader = clientSignUrl(record.clientToken);
      if (anexos && Object.keys(anexos).length) {
        await saveContractAttachments(unitKey, sheetIndex, anexos);
      }
    }

    const attachments =
      unitKey === "campinas" && !isZapSignEnabled("campinas")
        ? await getContractAttachmentBuffers(unitKey, sheetIndex)
        : undefined;
    const pdf = await generateContractPdf(contrato, signatureImages(record), attachments);
    const nome = limparNomeArquivo(contrato["Nome"]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="contrato_${nome}.pdf"`);
    if (clientSignUrlHeader) {
      res.setHeader("X-Client-Sign-Url", clientSignUrlHeader);
      res.setHeader("X-Sheet-Index", String(sheetIndex));
    }
    res.send(pdf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/contracts/:unitKey/:sheetIndex/attachments", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const unitKey = String(req.params.unitKey) as UnitKey;
    const sheetIndex = parseInt(String(req.params.sheetIndex), 10);
    const anexos = req.body?.anexos as Partial<Record<AttachmentKind, string>> | undefined;

    if (!getUnitByKey(unitKey) || !Number.isFinite(sheetIndex) || sheetIndex < 0) {
      res.status(400).json({ error: "Parâmetros inválidos." });
      return;
    }

    const userUnit = req.user?.unit;
    if (userUnit && userUnit !== unitKey) {
      res.status(403).json({ error: "Acesso negado para esta unidade." });
      return;
    }

    if (!anexos || !Object.keys(anexos).length) {
      res.status(400).json({ error: "Nenhuma imagem enviada." });
      return;
    }

    const contrato = await getContractRow(unitKey, sheetIndex);
    if (!contrato) {
      res.status(404).json({ error: "Contrato não encontrado." });
      return;
    }

    await saveContractAttachments(unitKey, sheetIndex, anexos);
    res.json({ ok: true, message: "Anexos salvos com sucesso." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.get("/contracts/:unitKey/:sheetIndex/doc-form", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const unitKey = String(req.params.unitKey) as UnitKey;
    const sheetIndex = parseInt(String(req.params.sheetIndex), 10);

    if (!getUnitByKey(unitKey) || !Number.isFinite(sheetIndex) || sheetIndex < 0) {
      res.status(400).json({ error: "Parâmetros inválidos." });
      return;
    }

    const userUnit = req.user?.unit;
    if (userUnit && userUnit !== unitKey) {
      res.status(403).json({ error: "Acesso negado para esta unidade." });
      return;
    }

    const contrato = await getContractRow(unitKey, sheetIndex);
    if (!contrato) {
      res.status(404).json({ error: "Contrato não encontrado." });
      return;
    }

    const status = await getDocFormStatus(unitKey, sheetIndex, contrato);
    res.json({ ok: true, status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/contracts/:unitKey/:sheetIndex/doc-form", authMiddleware, requireRole("operacao"), async (req: AuthRequest, res) => {
  try {
    const unitKey = String(req.params.unitKey) as UnitKey;
    const sheetIndex = parseInt(String(req.params.sheetIndex), 10);
    const anexos = req.body?.anexos as Partial<Record<DocFormKind, string>> | undefined;

    if (!getUnitByKey(unitKey) || !Number.isFinite(sheetIndex) || sheetIndex < 0) {
      res.status(400).json({ error: "Parâmetros inválidos." });
      return;
    }

    const userUnit = req.user?.unit;
    if (userUnit && userUnit !== unitKey) {
      res.status(403).json({ error: "Acesso negado para esta unidade." });
      return;
    }

    const contrato = await getContractRow(unitKey, sheetIndex);
    if (!contrato) {
      res.status(404).json({ error: "Contrato não encontrado." });
      return;
    }

    const result = await saveDocFormAttachments(unitKey, sheetIndex, contrato, anexos || {});

    let message = result.emailSent
      ? "Anexos salvos e e-mail enviado para loja e cliente (contato@skoobpet.com.br)."
      : result.status.completo
        ? "Anexos salvos. E-mail será enviado quando o SMTP estiver configurado."
        : "Anexos salvos. Envie todos os documentos para concluir.";

    if (result.zapsignSync?.disponivel) {
      if (result.zapsignSync.completo) {
        message += " Documentação sincronizada com o ZapSign.";
      } else if (result.zapsignSync.sincronizados > 0) {
        message += ` ${result.zapsignSync.sincronizados}/${result.zapsignSync.total} anexo(s) enviado(s) ao ZapSign.`;
      }
      if (result.zapsignSync.erro) {
        message += ` Aviso ZapSign: ${result.zapsignSync.erro}`;
      }
    }

    res.json({
      ok: true,
      message,
      status: result.status,
      emailSent: result.emailSent,
      emailError: result.emailError,
      zapsignSync: result.zapsignSync,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.delete("/contracts/:unitKey/:sheetIndex", authMiddleware, requireRole("financeiro"), async (req, res) => {
  try {
    const unitKey = String(req.params.unitKey) as UnitKey;
    const sheetIndex = parseInt(String(req.params.sheetIndex), 10);
    if (!getUnitByKey(unitKey)) {
      res.status(400).json({ error: "Unidade inválida." });
      return;
    }
    if (!Number.isFinite(sheetIndex) || sheetIndex < 0) {
      res.status(400).json({ error: "Índice de contrato inválido." });
      return;
    }

    const deleted = await deleteContractRows(unitKey, [sheetIndex]);
    res.json({ ok: true, deleted, unitKey, sheetIndex });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/prune-demo-data", authMiddleware, requireRole("financeiro"), async (_req, res) => {
  try {
    const results = await pruneAllSheetsToDemo();
    const before = results.reduce((sum, item) => sum + item.before, 0);
    const after = results.reduce((sum, item) => sum + item.after, 0);
    res.json({
      ok: true,
      message: `Planilhas atualizadas: ${before} -> ${after} registros no total.`,
      before,
      after,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

export default router;
