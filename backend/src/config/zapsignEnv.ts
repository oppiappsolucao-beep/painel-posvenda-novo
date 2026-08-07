const PRODUCTION_API = "https://api.zapsign.com.br/api/v1";
const SANDBOX_API = "https://sandbox.api.zapsign.com.br/api/v1";

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

export function getZapSignTemplateIdCampinas(): string {
  if (isZapSignSandbox()) {
    return (
      process.env.ZAPSIGN_SANDBOX_TEMPLATE_ID_CAMPINAS?.trim() ||
      process.env.ZAPSIGN_TEMPLATE_ID_CAMPINAS?.trim() ||
      ""
    );
  }
  return process.env.ZAPSIGN_TEMPLATE_ID_CAMPINAS?.trim() || "";
}

export function zapSignEnvironmentLabel(): string {
  return isZapSignSandbox() ? "sandbox" : "produção";
}
