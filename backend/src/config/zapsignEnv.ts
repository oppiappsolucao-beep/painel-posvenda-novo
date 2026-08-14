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

/** Template ZapSign de produção. */
export function getZapSignProductionTemplateId(unitKey: UnitKey): string {
  return getZapSignTemplateId(unitKey);
}

/** Modelo ZapSign da pasta da unidade (não cria cópia). */
export function getZapSignTemplateId(unitKey: UnitKey): string {
  const known = DEFAULT_FOLDER_TEMPLATE_IDS[unitKey];
  const keys = UNIT_TEMPLATE_ENV[unitKey];
  if (isZapSignSandbox()) {
    return envValue(keys.sandbox) || envValue(keys.prod) || known;
  }
  const fromEnv = envValue(keys.prod);
  const allowed = new Set(Object.values(DEFAULT_FOLDER_TEMPLATE_IDS));
  if (fromEnv && allowed.has(fromEnv)) return fromEnv;
  return known;
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
