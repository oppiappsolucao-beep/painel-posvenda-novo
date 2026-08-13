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

/** Modelos cadastrados manualmente no ZapSign (produção). */
const DEFAULT_PRODUCTION_TEMPLATE_IDS: Partial<Record<UnitKey, string>> = {
  campinas: "0fedf414-7278-4204-bb1c-6bafd091a3fe",
  piracicaba: "15c7d2a6-28fb-4747-9f1a-a9d3a4fd7978",
  indaiatuba: "d6104d85-fca6-42e9-9c9d-821c3abf9d0a",
};

/** Clones antigos (nome/conteúdo Campinas) — ignorados se ainda estiverem no .env de produção. */
const DEPRECATED_PRODUCTION_TEMPLATE_IDS: Partial<Record<UnitKey, string>> = {
  piracicaba: "fce2c847-c3bb-4299-ae4d-2dc7ed9ec8aa",
  indaiatuba: "6abc2391-34ad-468a-a0bc-4a0610cb6a1b",
};

/** Template ZapSign de produção (limpo, sem anexos legados). Sobrescreve o modelo-fonte do .env. */
export function getZapSignProductionTemplateId(unitKey: UnitKey): string {
  const key = `ZAPSIGN_PRODUCTION_TEMPLATE_ID_${unitKey.toUpperCase()}`;
  const fromEnv = envValue(key);
  const deprecated = DEPRECATED_PRODUCTION_TEMPLATE_IDS[unitKey];
  if (fromEnv && deprecated && fromEnv === deprecated) {
    return DEFAULT_PRODUCTION_TEMPLATE_IDS[unitKey] || fromEnv;
  }
  return fromEnv || DEFAULT_PRODUCTION_TEMPLATE_IDS[unitKey] || "";
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

export function getActiveZapSignTemplateId(unitKey: UnitKey): string {
  if (isZapSignSandbox()) {
    return getZapSignTemplateId(unitKey);
  }
  return getZapSignProductionTemplateId(unitKey) || getZapSignTemplateId(unitKey);
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
