import type { UnitKey } from "../config.js";

const PRODUCTION_API = "https://api.zapsign.com.br/api/v1";
const SANDBOX_API = "https://sandbox.api.zapsign.com.br/api/v1";

export const ZAPSIGN_UNIT_KEYS: UnitKey[] = ["campinas", "piracicaba", "indaiatuba"];

const UNIT_TEMPLATE_ENV: Record<UnitKey, { prod: string; sandbox: string }> = {
  campinas: {
    prod: "ZAPSIGN_TEMPLATE_ID_CAMPINAS",
    sandbox: "ZAPSIGN_SANDBOX_TEMPLATE_ID_CAMPINAS",
  },
  piracicaba: {
    prod: "ZAPSIGN_TEMPLATE_ID_PIRACICABA",
    sandbox: "ZAPSIGN_SANDBOX_TEMPLATE_ID_PIRACICABA",
  },
  indaiatuba: {
    prod: "ZAPSIGN_TEMPLATE_ID_INDAIATUBA",
    sandbox: "ZAPSIGN_SANDBOX_TEMPLATE_ID_INDAIATUBA",
  },
};

/** Ambiente de testes ZapSign — não consome documentos/créditos de produção. */
export function isZapSignSandbox(): boolean {
  return process.env.ZAPSIGN_SANDBOX === "true";
}

export function getZapSignApiBase(): string {
  const override = process.env.ZAPSIGN_API_BASE?.trim();
  if (override) return override.replace(/\/$/, "");
  return isZapSignSandbox() ? SANDBOX_API : PRODUCTION_API;
}

export function getZapSignApiToken(): string {
  if (isZapSignSandbox()) {
    return (
      process.env.ZAPSIGN_SANDBOX_API_TOKEN?.trim() ||
      process.env.ZAPSIGN_API_TOKEN?.trim() ||
      ""
    );
  }
  return process.env.ZAPSIGN_API_TOKEN?.trim() || "";
}

function envValue(key: string): string {
  return process.env[key]?.trim() || "";
}

/** Templates limpos em produção (sem anexos legados no link do cliente). */
const DEFAULT_PRODUCTION_TEMPLATE_IDS: Partial<Record<UnitKey, string>> = {
  campinas: "e90eab76-5580-4bad-813f-92a00fabcd62",
  piracicaba: "1e905160-dcce-43cd-a78c-18b2ad5b4af6",
  indaiatuba: "3cf9c387-d450-4810-8154-3b66721f8588",
};

/** Template ZapSign de produção (limpo, sem anexos legados). Sobrescreve o modelo-fonte do .env. */
export function getZapSignProductionTemplateId(unitKey: UnitKey): string {
  const key = `ZAPSIGN_PRODUCTION_TEMPLATE_ID_${unitKey.toUpperCase()}`;
  return envValue(key) || DEFAULT_PRODUCTION_TEMPLATE_IDS[unitKey] || "";
}

/** Template ZapSign da unidade. Se não houver ID próprio, usa o de Campinas (retrocompatível). */
export function getZapSignTemplateId(unitKey: UnitKey): string {
  const keys = UNIT_TEMPLATE_ENV[unitKey];
  if (isZapSignSandbox()) {
    return (
      envValue(keys.sandbox) ||
      envValue(keys.prod) ||
      envValue(UNIT_TEMPLATE_ENV.campinas.sandbox) ||
      envValue(UNIT_TEMPLATE_ENV.campinas.prod)
    );
  }
  return envValue(keys.prod) || envValue(UNIT_TEMPLATE_ENV.campinas.prod);
}

/** @deprecated Use getZapSignTemplateId("campinas") */
export function getZapSignTemplateIdCampinas(): string {
  return getZapSignTemplateId("campinas");
}

export function isZapSignEnabled(unitKey: UnitKey): boolean {
  if (process.env.ZAPSIGN_ENABLED === "false") return false;
  return Boolean(getZapSignApiToken() && getZapSignTemplateId(unitKey));
}

export function zapSignEnvironmentLabel(): string {
  return isZapSignSandbox() ? "sandbox" : "produção";
}

export function zapsignFolderPath(unitKey: UnitKey): string {
  return `/${unitKey}/`;
}
