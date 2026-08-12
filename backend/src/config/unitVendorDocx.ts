import type { UnitKey } from "../config.js";

/** Bloco VENDEDOR exatamente como no DOCX ZapSign (Campinas). */
export const CAMPINAS_VENDOR_BLOCK_DOCX =
  "SHOOKPET COMERCIO DE ANIMAIS E MEDICAMENTOS VETERINARIOS LTDA. inscrita no CNPJ sob n\u00b0 47.945.634/0002-61 e na Inscri\u00e7\u00e3o Estadual sob n\u00b0 156.252.423.119, estabelecida \u00e0 RODOVIA DOM PEDRO I (SP 65), KM 132, S/N, Complemento: LOJA 06, Bairro: PARQUE IMPERADOR, CEP: 13.097-100, no Munic\u00edpio de CAMPINAS, UF: SP. denominado \u201cVENDEDOR\u201d, e de outro lado,";

export interface UnitVendorDocxConfig {
  cnpjFormatted: string;
  cityUpper: string;
  introBlock: string;
}

function ieClause(ie: string): string {
  const trimmed = ie.trim();
  return trimmed ? ` e na Inscri\u00e7\u00e3o Estadual sob n\u00b0 ${trimmed}` : "";
}

function buildIntroBlock(parts: {
  cnpj: string;
  ie?: string;
  address: string;
  cityUpper: string;
}): string {
  return (
    "SHOOKPET COMERCIO DE ANIMAIS E MEDICAMENTOS VETERINARIOS LTDA. inscrita no CNPJ sob n\u00b0 " +
    `${parts.cnpj}${ieClause(parts.ie || "")}, estabelecida \u00e0 ${parts.address}, no Munic\u00edpio de ${parts.cityUpper}, UF: SP. denominado \u201cVENDEDOR\u201d, e de outro lado,`
  );
}

const UNIT_VENDOR_DOCX: Record<UnitKey, UnitVendorDocxConfig> = {
  campinas: {
    cnpjFormatted: "47.945.634/0002-61",
    cityUpper: "CAMPINAS",
    introBlock: CAMPINAS_VENDOR_BLOCK_DOCX,
  },
  piracicaba: {
    cnpjFormatted: "47.945.634/0001-80",
    cityUpper: "PIRACICABA",
    introBlock: buildIntroBlock({
      cnpj: "47.945.634/0001-80",
      ie: process.env.ZAPSIGN_VENDOR_IE_PIRACICABA,
      address:
        "AVENIDA TRINTA E UM DE MARCO, 310, Bairro: PAULICEIA, CEP: 13.424-290",
      cityUpper: "PIRACICABA",
    }),
  },
  indaiatuba: {
    cnpjFormatted: "47.945.634/0003-42",
    cityUpper: "INDAIATUBA",
    introBlock: buildIntroBlock({
      cnpj: "47.945.634/0003-42",
      ie: process.env.ZAPSIGN_VENDOR_IE_INDAIATUBA,
      address:
        "RUA QUINZE DE NOVEMBRO, 1200, Complemento: LOJA 76, Bairro: CENTRO, CEP: 13.330-070",
      cityUpper: "INDAIATUBA",
    }),
  },
};

export function getUnitVendorDocxConfig(unitKey: UnitKey): UnitVendorDocxConfig {
  return UNIT_VENDOR_DOCX[unitKey];
}
