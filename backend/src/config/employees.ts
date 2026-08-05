const EXAMPLE_NAME_PATTERNS = [
  /teste/i,
  /demo/i,
  /exemplo/i,
  /demonstr/i,
  /fict[ií]c/i,
];

function exampleNamesFromEnv(): string[] {
  const raw = process.env.EXAMPLE_EMPLOYEE_NAMES?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;|]/)
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
}

export function isExampleEmployeeName(name: string): boolean {
  const normalized = name.trim();
  if (!normalized) return true;

  const lower = normalized.toLowerCase();
  if (exampleNamesFromEnv().includes(lower)) return true;
  return EXAMPLE_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isDemoSheetRow(row: Record<string, string>): boolean {
  const nome = String(row.Nome || row.nome || "").trim();
  const vendedora = String(row.Vendedora || row.Vendedor || "").trim();
  const combined = `${nome} ${vendedora}`.toLowerCase();

  if (combined.includes("demonstracao") || combined.includes("demonstração")) return true;
  if (combined.includes("dados fict") || combined.includes("pet shop demonstracao")) return true;
  if (/^123\.456\.789/.test(String(row.CPF || row.cpf || ""))) return true;

  return isExampleEmployeeName(vendedora) || isExampleEmployeeName(nome);
}
