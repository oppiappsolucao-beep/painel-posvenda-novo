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

/** Modelos atuais nas pastas Campinas / Piracicaba / Indaiatuba. */
const DEFAULT_FOLDER_TEMPLATE_IDS: Record<UnitKey, string> = {
  campinas: "1c28fbee-2085-4f3e-a081-a1e1c4fef9fe",
  piracicaba: "01e1c71f-f803-49cc-b66f-e992bba9177b",
  indaiatuba: "c4b03046-23f4-4d8b-ac34-cf4e38df34c9",
};

/** Modelos cadastrados manualmente no ZapSign (produção). */
const DEFAULT_PRODUCTION_TEMPLATE_IDS: Partial<Record<UnitKey, string>> = {
  ...DEFAULT_FOLDER_TEMPLATE_IDS,
};

/** IDs antigos — se ainda estiverem no .env, usa o modelo novo da pasta. */
const DEPRECATED_PRODUCTION_TEMPLATE_ID_SET = new Set([
  "0fedf414-7278-4204-bb1c-6bafd091a3fe",
  "15c7d2a6-28fb-4747-9f1a-a9d3a4fd7978",
  "d6104d85-fca6-42e9-9c9d-821c3abf9d0a",
  "573218e2-ab92-4b16-b92c-8dab4dd01a1a",
  "acb861b1-f2eb-47ec-abc9-e3770f8c923b",
  "8b0250de-04a1-4280-95b8-6ffd0b65257e",
  "fce2c847-c3bb-4299-ae4d-2dc7ed9ec8aa",
  "6abc2391-34ad-468a-a0bc-4a0610cb6a1b",
  "e002f686-e44b-4ffe-b652-7da740ba9b37",
  "9ffd3b75-6379-4df3-a432-fa726848cb49",
  "eef0c6fe-6b7b-4d59-9f94-4b42a22fd6c2",
  "875e6e8f-6897-4876-ad3d-2e7e12c62602",
  "1bb9c6d0-e191-4a88-9f9f-63ea153ea5ee",
  "0817b757-5399-4287-8ff0-2aeb396bb629",
]);

/** Template ZapSign de produção (limpo, sem anexos legados). Sobrescreve o modelo-fonte do .env. */
export function getZapSignProductionTemplateId(unitKey: UnitKey): string {
  const key = `ZAPSIGN_PRODUCTION_TEMPLATE_ID_${unitKey.toUpperCase()}`;
  const fromEnv = envValue(key);
  if (fromEnv && DEPRECATED_PRODUCTION_TEMPLATE_ID_SET.has(fromEnv)) {
    return DEFAULT_FOLDER_TEMPLATE_IDS[unitKey];
  }
  return fromEnv || DEFAULT_FOLDER_TEMPLATE_IDS[unitKey] || "";
}

/** Modelo ZapSign da pasta da unidade (não cria cópia). */
export function getZapSignTemplateId(unitKey: UnitKey): string {
  const keys = UNIT_TEMPLATE_ENV[unitKey];
  if (isZapSignSandbox()) {
    return envValue(keys.sandbox) || envValue(keys.prod) || DEFAULT_FOLDER_TEMPLATE_IDS[unitKey];
  }
  const fromEnv = envValue(keys.prod);
  if (fromEnv && DEPRECATED_PRODUCTION_TEMPLATE_ID_SET.has(fromEnv)) {
    return DEFAULT_FOLDER_TEMPLATE_IDS[unitKey];
  }
  return fromEnv || DEFAULT_FOLDER_TEMPLATE_IDS[unitKey];
}

/** @deprecated Use getZapSignTemplateId("campinas") */
export function getZapSignTemplateIdCampinas(): string {
  return getZapSignTemplateId("campinas");
}

/** Sempre o modelo que está na pasta da unidade (Campinas, Piracicaba, Indaiatuba). */
export function getActiveZapSignTemplateId(unitKey: UnitKey): string {
  return getZapSignTemplateId(unitKey);
}

export function isZapSignEnabled(unitKey: UnitKey): boolean {
  if (process.env.ZAPSIGN_ENABLED === "false") return false;
  return Boolean(getZapSignApiToken() && getZapSignTemplateId(unitKey));
}

export function zapSignEnvironmentLabel(): string {
  return isZapSignSandbox() ? "sandbox" : "produção";
}

const UNIT_FOLDER_NAMES: Record<UnitKey, string> = {
  campinas: "Campinas",
  piracicaba: "Piracicaba",
  indaiatuba: "Indaiatuba",
};

/** Caminho da pasta na ZapSign — precisa coincidir com o nome visível no painel. */
export function zapsignFolderPath(unitKey: UnitKey): string {
  const override = envValue(`ZAPSIGN_FOLDER_PATH_${unitKey.toUpperCase()}`);
  const name = (override || UNIT_FOLDER_NAMES[unitKey]).replace(/^\/+|\/+$/g, "");
  return `/${name}/`;
}
