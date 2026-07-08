
import streamlit as st
import streamlit.components.v1 as components
import pandas as pd
import datetime
import re
import base64
from io import BytesIO
from pathlib import Path
from zoneinfo import ZoneInfo

import plotly.express as px
import gspread
from google.oauth2.service_account import Credentials
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image as RLImage


# ============================================================
# CONFIGURAÇÕES PRINCIPAIS
# ============================================================

st.set_page_config(
    page_title="Dashboard SkoobPet",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Login atual
APP_USER = "skoob"
APP_PASS = "skoob123"

# Planilha correta enviada
SHEET_ID = "1TTrjf0DZxWkIacYTp7_vcRmTx2-8XrobIaPglflnyG8"
CONTRATO_SHEET_ID = "1TTrjf0DZxWkIacYTp7_vcRmTx2-8XrobIaPglflnyG8"

# Aba usada para salvar e carregar dados
SHEET_TAB_NAME = "Página1"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

TZ = ZoneInfo("America/Sao_Paulo")
HOJE = pd.Timestamp(datetime.datetime.now(TZ).date())

NAVY = "#1B1D6D"
NAVY_2 = "#2E3192"
WINE = "#9B0033"
WINE_2 = "#C00040"
ORANGE = "#F59E0B"
GRAY_BG = "#D4D4D4"
DARK_INPUT = "#262832"
TEXT_DARK = "#07142F"
GRAY_TEXT = "#64748b"


# ============================================================
# COLUNAS DA PLANILHA
# ============================================================

DEFAULT_HEADERS = [
    "Nome",
    "Telefone",
    "CPF",
    "E-mail",
    "Data Compra",
    "Mês",
    "Raça",
    "Sexo",
    "Cor",
    "Pelagem",
    "Endereço",
    "Número",
    "Complemento",
    "CEP",
    "Estado",
    "Cidade",
    "RG",
    "Valor Filhote",
    "Valor por extenso",
    "Forma de pagamento",
    "Quantidade de parcelas",
    "Vendedora",
    "Nome do animal",
    "Espécie",
    "Microchip",
    "Nascimento filhote",
    "Observações",
    "Data preenchimento",
]


# ============================================================
# HELPERS
# ============================================================

def img_to_base64(path: str):
    try:
        file_path = Path(path)
        if file_path.exists():
            return base64.b64encode(file_path.read_bytes()).decode()
    except Exception:
        pass
    return None


def logo_html(size=72):
    logo_b64 = img_to_base64("skoobpet.png")
    if logo_b64:
        return f'<img src="data:image/png;base64,{logo_b64}" class="logo-img" style="width:{size}px;height:{size}px;">'
    return f'<div class="logo-fallback" style="width:{size}px;height:{size}px;">🐾</div>'


def brl_to_float(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 0.0
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        try:
            return float(v)
        except Exception:
            return 0.0

    s = str(v).replace("\u00a0", " ").strip()
    if s == "" or s.lower() in {"nan", "none", "-"}:
        return 0.0

    s = s.replace("R$", "").strip()
    s = re.sub(r"[^0-9,\.\-]", "", s)

    if "," in s:
        s = s.replace(".", "").replace(",", ".")

    try:
        return float(s)
    except Exception:
        return 0.0


def money_br(v):
    try:
        v = float(v)
    except Exception:
        v = 0.0
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def norm(x):
    return str(x).strip().lower() if pd.notna(x) else ""


def pick_first_existing(df, candidates):
    """
    Encontra uma coluna mesmo quando muda maiúscula/minúscula.
    Exemplo: "Valor Filhote" e "Valor filhote" serão tratados como a mesma coluna.
    """
    def clean_col(value):
        return str(value).replace("\u00a0", " ").strip().lower()

    cols_exact = {str(c).replace("\u00a0", " ").strip(): c for c in df.columns}
    cols_clean = {clean_col(c): c for c in df.columns}

    for c in candidates:
        key_exact = str(c).replace("\u00a0", " ").strip()
        key_clean = clean_col(c)

        if key_exact in cols_exact:
            return cols_exact[key_exact]

        if key_clean in cols_clean:
            return cols_clean[key_clean]

    return None


def parse_date_series(s: pd.Series) -> pd.Series:
    if s is None:
        return pd.to_datetime(pd.Series([], dtype="object"), errors="coerce")

    x = s.astype(str).str.replace("\u00a0", " ").str.strip()
    x = x.replace({"": None, "nan": None, "None": None})

    out = pd.Series(pd.NaT, index=x.index, dtype="datetime64[ns]")

    mask_br = x.notna() & x.str.contains("/", regex=False)
    if mask_br.any():
        out.loc[mask_br] = pd.to_datetime(x.loc[mask_br], errors="coerce", dayfirst=True)

    mask_other = x.notna() & ~mask_br
    if mask_other.any():
        out.loc[mask_other] = pd.to_datetime(x.loc[mask_other], errors="coerce")

    return out


def month_key_from_date(date_value):
    try:
        d = pd.to_datetime(date_value, dayfirst=True, errors="coerce")
        if pd.isna(d):
            return datetime.datetime.now(TZ).strftime("%m/%Y")
        return d.strftime("%m/%Y")
    except Exception:
        return datetime.datetime.now(TZ).strftime("%m/%Y")


def is_error(status):
    s = norm(status)
    return ("erro" in s) or ("atras" in s) or ("pendenc" in s)


def count_today_all(df_base, date_col):
    if not date_col or date_col not in df_base.columns:
        return 0
    d = parse_date_series(df_base[date_col])
    return int((d.dt.date == HOJE.date()).sum())


def count_month_all(df_base, date_col, selected_month):
    if not date_col or date_col not in df_base.columns:
        return 0
    d = parse_date_series(df_base[date_col])
    return int((d.dt.strftime("%m/%Y") == str(selected_month)).sum())


# ============================================================
# GOOGLE SHEETS
# ============================================================

@st.cache_resource(show_spinner=False)
def get_google_client():
    if "gcp_service_account" not in st.secrets:
        raise RuntimeError("Não encontrei [gcp_service_account] no Secrets do Streamlit.")

    creds = Credentials.from_service_account_info(
        st.secrets["gcp_service_account"],
        scopes=SCOPES,
    )
    return gspread.authorize(creds)


def open_skoob_spreadsheet(client):
    try:
        return client.open_by_key(SHEET_ID)
    except Exception:
        return client.open("Planilha SkoobPet (Campinas)")


def get_worksheet():
    client = get_google_client()
    spreadsheet = open_skoob_spreadsheet(client)

    try:
        ws = spreadsheet.worksheet(SHEET_TAB_NAME)
    except Exception:
        ws = spreadsheet.sheet1

    return spreadsheet, ws


def ensure_headers(ws):
    values = ws.get_all_values()

    if not values:
        ws.update("A1", [DEFAULT_HEADERS])
        return DEFAULT_HEADERS

    current_headers = [str(h).strip() for h in values[0]]
    current_headers = [h for h in current_headers if h != ""]

    if not current_headers:
        ws.update("A1", [DEFAULT_HEADERS])
        return DEFAULT_HEADERS

    missing = [h for h in DEFAULT_HEADERS if h not in current_headers]

    if missing:
        new_headers = current_headers + missing
        ws.update("A1", [new_headers])
        return new_headers

    return current_headers


@st.cache_data(ttl=3, show_spinner=False)
def load_sheet_data():
    _, ws = get_worksheet()
    headers = ensure_headers(ws)

    # Não usamos get_all_records() porque ele quebra quando a planilha tem
    # cabeçalhos duplicados, por exemplo: "Data Assinatura" repetido.
    values = ws.get_all_values()

    if not values or len(values) <= 1:
        return pd.DataFrame(columns=headers)

    raw_headers = [str(h).replace("\u00a0", " ").strip() for h in values[0]]
    unique_headers = []
    seen = {}

    for i, h in enumerate(raw_headers):
        if not h:
            h = f"Coluna {i + 1}"

        if h in seen:
            seen[h] += 1
            h = f"{h} {seen[h]}"
        else:
            seen[h] = 1

        unique_headers.append(h)

    rows = values[1:]
    max_cols = len(unique_headers)

    normalized_rows = []
    for row in rows:
        row = list(row)
        if len(row) < max_cols:
            row = row + [""] * (max_cols - len(row))
        elif len(row) > max_cols:
            row = row[:max_cols]
        normalized_rows.append(row)

    df = pd.DataFrame(normalized_rows, columns=unique_headers)

    if not df.empty:
        df = df.dropna(how="all")
        df = df[~(df.astype(str).apply(lambda r: "".join(r).strip(), axis=1) == "")]

    for h in headers:
        if h not in df.columns:
            df[h] = ""

    return df


def save_contract_to_google_sheets(contrato: dict):
    client = get_google_client()

    try:
        spreadsheet = client.open_by_key(CONTRATO_SHEET_ID)
    except Exception:
        spreadsheet = client.open("Planilha SkoobPet (Campinas)")

    try:
        ws = spreadsheet.worksheet(SHEET_TAB_NAME)
    except Exception:
        ws = spreadsheet.sheet1

    headers = ensure_headers(ws)

    row = []
    for h in headers:
        row.append(contrato.get(h, ""))

    ws.append_row(row, value_input_option="USER_ENTERED")

    st.cache_data.clear()
    return spreadsheet, ws


# ============================================================
# GERAÇÃO DO PDF DO CONTRATO
# ============================================================

def limpar_nome_arquivo(texto):
    texto = str(texto or "contrato").strip().lower()
    texto = re.sub(r"[^a-z0-9áéíóúâêôãõç\s_-]", "", texto)
    texto = re.sub(r"\s+", "_", texto)
    return texto[:80] or "contrato"


def valor_contrato(contrato, campo, padrao="Não informado"):
    valor = contrato.get(campo, "")
    if valor is None:
        return padrao
    valor = str(valor).strip()
    return valor if valor else padrao


def disparar_download_pdf(pdf_bytes: bytes, nome_arquivo: str):
    """
    Faz o navegador baixar o PDF automaticamente após salvar o contrato.
    """
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    nome_seguro = nome_arquivo.replace('"', "").replace("'", "")

    components.html(
        f"""
        <script>
            const pdfBase64 = "{pdf_b64}";
            const fileName = "{nome_seguro}";

            function base64ToBlob(base64, type = "application/pdf") {{
                const binStr = atob(base64);
                const len = binStr.length;
                const arr = new Uint8Array(len);
                for (let i = 0; i < len; i++) {{
                    arr[i] = binStr.charCodeAt(i);
                }}
                return new Blob([arr], {{ type: type }});
            }}

            const blob = base64ToBlob(pdfBase64);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(() => URL.revokeObjectURL(url), 1500);
        </script>
        """,
        height=0,
    )



def gerar_pdf_contrato(contrato: dict) -> bytes:
    """
    Gera o PDF do contrato com visual e estrutura parecidos com o modelo antigo do Assine Bem,
    mas sem assinatura/validação Assine Bem, pois o documento será enviado para ZapSign.
    """
    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.65 * cm,
        leftMargin=1.65 * cm,
        topMargin=1.35 * cm,
        bottomMargin=1.35 * cm,
    )

    styles = getSampleStyleSheet()

    def add_style(name, parent, **kwargs):
        if name not in styles:
            styles.add(ParagraphStyle(name=name, parent=styles[parent], **kwargs))

    add_style(
        "ContratoTitulo",
        "Title",
        fontName="Helvetica-Bold",
        fontSize=11.5,
        leading=14,
        alignment=1,
        textColor=colors.black,
        spaceAfter=24,
    )
    add_style(
        "ContratoSecao",
        "Heading2",
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        alignment=0,
        textColor=colors.black,
        spaceBefore=14,
        spaceAfter=12,
    )
    add_style(
        "ContratoClausula",
        "Heading3",
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        alignment=0,
        textColor=colors.black,
        underline=True,
        spaceBefore=8,
        spaceAfter=12,
    )
    add_style(
        "ContratoTexto",
        "BodyText",
        fontName="Helvetica",
        fontSize=10.5,
        leading=13.2,
        alignment=4,
        textColor=colors.black,
        spaceAfter=8,
    )
    add_style(
        "ContratoTextoCentro",
        "BodyText",
        fontName="Helvetica",
        fontSize=10.5,
        leading=13,
        alignment=1,
        textColor=colors.black,
        spaceAfter=8,
    )
    add_style(
        "ContratoTextoPequeno",
        "BodyText",
        fontName="Helvetica",
        fontSize=8.5,
        leading=10.5,
        alignment=0,
        textColor=colors.black,
        spaceAfter=5,
    )
    add_style(
        "ContratoLei",
        "BodyText",
        fontName="Helvetica",
        fontSize=10.5,
        leading=13.2,
        alignment=1,
        textColor=colors.black,
        spaceAfter=10,
    )
    add_style(
        "ContratoLeiAzul",
        "BodyText",
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        alignment=1,
        textColor=colors.blue,
        spaceAfter=16,
    )

    nome = valor_contrato(contrato, "Nome")
    cpf = valor_contrato(contrato, "CPF")
    rg = valor_contrato(contrato, "RG")
    telefone = valor_contrato(contrato, "Telefone")
    email = valor_contrato(contrato, "E-mail")
    endereco = valor_contrato(contrato, "Endereço")
    numero = valor_contrato(contrato, "Número")
    complemento = valor_contrato(contrato, "Complemento", "")
    cep = valor_contrato(contrato, "CEP")
    cidade = valor_contrato(contrato, "Cidade")
    estado = valor_contrato(contrato, "Estado")
    bairro = valor_contrato(contrato, "Bairro", "")

    nome_animal = valor_contrato(contrato, "Nome do animal")
    especie = valor_contrato(contrato, "Espécie")
    raca = valor_contrato(contrato, "Raça")
    sexo = valor_contrato(contrato, "Sexo")
    cor = valor_contrato(contrato, "Cor")
    pelagem = valor_contrato(contrato, "Pelagem")
    microchip = valor_contrato(contrato, "Microchip")
    nascimento = valor_contrato(contrato, "Nascimento filhote")
    observacoes = valor_contrato(contrato, "Observações", "")

    data_compra = valor_contrato(contrato, "Data Compra")
    valor_filhote = valor_contrato(contrato, "Valor Filhote")
    valor_extenso = valor_contrato(contrato, "Valor por extenso")
    forma_pagamento = valor_contrato(contrato, "Forma de pagamento")
    parcelas = valor_contrato(contrato, "Quantidade de parcelas")
    vendedora = valor_contrato(contrato, "Vendedora")
    unidade = valor_contrato(contrato, "Unidade")

    story = []

    logo_path = Path("skoobpet.png")
    if logo_path.exists():
        try:
            logo = RLImage(str(logo_path), width=3.1 * cm, height=2.2 * cm)
            logo.hAlign = "CENTER"
            story.append(logo)
            story.append(Spacer(1, 16))
        except Exception:
            pass

    story.append(Paragraph("CONTRATO DE COMPRA E VENDA DE FILHOTE DE COMPANHIA", styles["ContratoTitulo"]))

    story.append(Paragraph("Pelo presente instrumento, de um lado:", styles["ContratoTexto"]))

    vendedor = (
        "<b>SHOOKPET COMERCIO DE ANIMAIS E MEDICAMENTOS VETERINARIOS LTDA</b>, "
        "inscrita no CNPJ sob nº <b>47.945.634/0002-61</b> e na Inscrição Estadual sob nº "
        "<b>156.252.423.119</b>, estabelecida à RODOVIA DOM PEDRO I (SP 65), KM 132, S/N, "
        "Complemento: LOJA 06, Bairro: PARQUE IMPERADOR, CEP: 13.097-100, no Município de "
        "CAMPINAS, UF: SP. denominada <b>“VENDEDOR”</b>, e de outro lado,"
    )
    story.append(Paragraph(vendedor, styles["ContratoTexto"]))

    comprador = (
        f"<b>{nome}</b>, morador(a) estabelecido(a) à {endereco}, {numero}"
        f"{', ' + complemento if complemento else ''}"
        f"{' - Bairro: ' + bairro if bairro else ''} - Cidade: {cidade} - UF: {estado} - CEP: {cep}, "
        f"inscrito(a) no CPF sob o nº {cpf}, RG sob o nº {rg}, contato através do celular: {telefone} "
        f"e e-mail: {email}, denominada simplesmente <b>“COMPRADOR”</b>."
    )
    story.append(Paragraph(comprador, styles["ContratoTexto"]))

    story.append(Paragraph(
        f"Firmam o presente contrato de compra e venda de filhote celebrado entre as partes em {data_compra}, "
        "para os seguintes efeitos:",
        styles["ContratoTexto"]
    ))

    story.append(Paragraph("DO OBJETO DO CONTRATO", styles["ContratoSecao"]))
    story.append(Paragraph("-", styles["ContratoTexto"]))
    story.append(Paragraph("Cláusula Primeira", styles["ContratoClausula"]))

    objeto = (
        "• O presente contrato tem como <b>OBJETO</b> a venda e compra de um animal de <b>(COMPANHIA)</b> sendo:<br/><br/>"
        f"• NOME: {nome_animal}<br/>"
        f"• RAÇA: {raca}<br/>"
        f"• COR: {cor}<br/>"
        f"• NASCIDO: {nascimento}<br/>"
        f"• SEXO: {sexo}<br/>"
        f"• Nº MICROCHIP: {microchip}<br/>"
        f"• ESPÉCIE: {especie}<br/>"
        f"• PELAGEM: {pelagem}<br/>"
        f"• OBSERVAÇÕES: {observacoes or ''}"
    )
    story.append(Paragraph(objeto, styles["ContratoTexto"]))

    story.append(Paragraph(
        "<b>1.2)</b> O canino será retirado pelo próprio comprador(a) ou pessoa devidamente autorizada, mediante "
        "apresentação de requisição por escrito com cópia do RG do comprador e do retirante, cumulativamente com "
        "a apresentação do recibo expedido pelo vendedor, não sendo autorizada a retirada do animal sem a respectiva "
        "documentação ora informada, para que assim preserve a sanidade canina e a entrega do mesmo a quem de direito.",
        styles["ContratoTexto"]
    ))

    story.append(Paragraph("-", styles["ContratoTexto"]))

    story.append(Paragraph("DO PREÇO", styles["ContratoSecao"]))
    story.append(Paragraph("Cláusula Segunda", styles["ContratoClausula"]))
    story.append(Paragraph(
        f"• O comprador(a) pagará ao vendedor, pela compra do animal objeto deste contrato, a quantia de "
        f"<b>{valor_filhote}</b>, ({valor_extenso}).",
        styles["ContratoTexto"]
    ))
    story.append(Paragraph(f"• Valor pago da seguinte forma: <b>{forma_pagamento}</b>", styles["ContratoTexto"]))
    story.append(Paragraph(f"• Pagos em: <b>{parcelas}</b>", styles["ContratoTexto"]))
    story.append(Paragraph("-", styles["ContratoTexto"]))

    story.append(Paragraph("DA DOCUMENTAÇÃO DO FILHOTE", styles["ContratoSecao"]))
    story.append(Paragraph("<b>3.1)</b> Abaixo relação de documentação:", styles["ContratoTexto"]))
    story.append(Paragraph("1. Carteira de Vacinação atualizada: Sim, recebi !", styles["ContratoTextoPequeno"]))
    story.append(Paragraph("2. Certificado de Microchip: Sim, recebi !", styles["ContratoTextoPequeno"]))
    story.append(Paragraph("3. Pedigree - <b>OPCIONAL</b> - R$ 249,90 Taxa de Emissão: Vou pensar !", styles["ContratoTextoPequeno"]))
    story.append(Paragraph("4. AR - <b>OPCIONAL</b> - R$ 35,80 Carta Registrada via Correios: Vou pensar !", styles["ContratoTextoPequeno"]))
    story.append(Paragraph("5. Atestado de Saúde: Sim, recebi !", styles["ContratoTextoPequeno"]))

    story.append(Paragraph(
        "<b>3.2)</b> O comprador(a) declara estar ciente de que a matriz responsável pela emissão dos pedigrees "
        "encontra-se registrada junto à Cinobras, não possuindo direito de escolher a entidade ou associação responsável "
        "pelo registro e emissão do Pedigree.",
        styles["ContratoTexto"]
    ))
    story.append(Paragraph(
        "<b>3.3)</b> O Pedigree será emitido pela entidade responsável pelo registro da matriz, sendo esta uma "
        "Entidade Cinófila devidamente legalizada e registrada no 1º Cartório de Registro Civil de Pessoa Jurídica "
        "sob nº 79.613 e inscrita no CNPJ sob nº 22.214.403/0001-76.",
        styles["ContratoTexto"]
    ))

    story.append(Paragraph("DAS OBRIGAÇÕES DO VENDEDOR (A) E COMPRADOR (A)", styles["ContratoSecao"]))
    story.append(Paragraph("Cláusula Quarta", styles["ContratoClausula"]))

    clausulas_4 = [
        "<b>4.1)</b> O vendedor se obriga a entregar ao comprador(a), a carteira de vacinação do animal no ato da compra, com indicação da vacina e vermifugação.",
        "<b>4.2)</b> A entrega do <b>PEDIGREE</b> será realizada imediatamente após a emissão que é feita por órgão competente, não se responsabilizando assim o vendedor por eventuais demoras.",
        "<b>4.3)</b> Certificado de microchip assinado pelo Médico Veterinário responsável.",
        "<b>4.4)</b> O comprador(a), após a comunicação da confecção do PEDIGREE, receberá o documento exclusivamente via correios, com aviso de recebimento, mediante o pagamento de taxa de R$ 35,00 (trinta e cinco reais). O vendedor não se responsabiliza por eventuais extravios ocasionados pela empresa responsável pelo transporte.",
        "<b>4.5)</b> Atestado de Saúde; assinado pelo Médico Veterinário responsável. O atestado específico para embarque aéreo deverá ser solicitado e adquirido a parte.",
        "<b>4.6)</b> Caso o documento pedigree não seja retirado ou solicitado o envio por correio com aviso de recebimento, dentro do prazo informado no parágrafo anterior, o mesmo será desprezado, e, em caso de nova solicitação o valor da documentação será cobrada na época própria, tudo de acordo com a tabela praticada pelo Centro de Cinofilia Competente.",
    ]
    for item in clausulas_4:
        story.append(Paragraph(item, styles["ContratoTexto"]))

    story.append(Paragraph("-", styles["ContratoTexto"]))
    story.append(PageBreak())

    story.append(Paragraph("DA RETIRADA DO FILHOTE", styles["ContratoSecao"]))
    story.append(Paragraph("Cláusula Quinta", styles["ContratoClausula"]))

    clausulas_5 = [
        "<b>5.1)</b> Caso o filhote não seja retirado no ato da compra ou seja deixado em loja por qualquer outro motivo não autorizado judicialmente, em razão da acomodação posterior à venda, será cobrada o dia de hospedagem, na proporção de <b>R$ 80,00 (oitenta reais) o dia.</b>",
        "<b>5.2)</b> Considerar-se-á rescindido o contrato de compra e venda, caso o valor devido a título de hospedagem ultrapasse a monta do contrato ora firmado, neste caso o filhote será disponibilizado para venda a terceiros, sendo que, do valor dispendido pelo pagamento do canino será retido 30% (trinta por cento) do valor total do contrato, destinado à cobertura dos gastos de acomodação e alimentação.",
        "<b>5.3)</b> Caso seja necessário o despacho do canino, via terrestre ou aéreo, as respectivas despesas e riscos serão suportados exclusivamente pelo comprador(a), responsabilizando-se este inclusive no caso de contaminação ou óbito.",
        "<b>5.4)</b> No caso de despacho do canino, o comprador(a) arcará com as despesas de traslado, incluindo a contratação e pagamento de taxi-dog, sendo certo que considerar-se-á a data da efetiva entrega do animal a data da sua retirada da loja. Alertando o comprador(a) que, em que pese o transporte via aérea de carga viva ser seguro, exclusivamente o comprador(a) responderá por quaisquer danos que sobrevierem ao animal em consequência dos procedimentos relativos ao despacho.",
    ]
    for item in clausulas_5:
        story.append(Paragraph(item, styles["ContratoTexto"]))

    story.append(Paragraph("-", styles["ContratoTexto"]))

    story.append(Paragraph("DA RETIRADA DO FILHOTE", styles["ContratoSecao"]))
    story.append(Paragraph("Cláusula Sexta", styles["ContratoClausula"]))

    clausulas_6 = [
        "<b>6.1)</b> O comprador(a) declara ter recebido todas orientações quanto aos cuidados do canino ao que tange vacinação, vermifugação, da impossibilidade de contato com outros animais filhotes ou adultos antes da conclusão do ciclo inicial de vacinação, da impossibilidade de exposição à locais públicos de grande circulação, ao fornecimento de alimentação adequada, assumindo a responsabilidade de inclusive apresentar o canino no prazo de até 48h de sua retirada e às suas expensas, em veterinário de sua confiança, para confirmação do atestado de sanidade canina expedido pelo veterinário responsável do vendedor.",
        "<b>6.2)</b> Passadas as 48h, sem a prerrogativa da confirmação da sanidade canina por veterinário de confiança do comprador(a), o mesmo dará plena e total concordância de que o estado de saúde do animal retirado estava em perfeitas condições de saúde e higiene, aceitando-o no estado recebido obrigando-se à seguir às orientações dadas na entrega do canino.",
        "<b>6.3)</b> Em caso de ressalva da saúde canina, expedido por laudo médico veterinário, relacionados exclusivamente às doenças de cegueira, surdez, palato aberto; ou qualquer má-formação congênita, deverá ser apontado através de laudo médico veterinário da confiança do comprador(a), e sua comunicação ao vendedor deve ser IMEDIATA, dentro das 48h da retirada do animal da posse do vendedor, para as tomadas de providências necessárias quanto à substituição do animal.",
        "<b>6.4)</b> Na falta de qualquer filhote e na impossibilidade de espera pelo comprador(a) de nova ninhada, o valor da compra será estornado integralmente, desde que a comunicação das enfermidades elencadas seja feita dentro das hipóteses e condições do parágrafo anterior.",
    ]
    for item in clausulas_6:
        story.append(Paragraph(item, styles["ContratoTexto"]))

    story.append(Paragraph("-", styles["ContratoTexto"]))
    story.append(PageBreak())

    story.append(Paragraph("DAS GARANTIAS", styles["ContratoSecao"]))
    story.append(Paragraph("Cláusula Sétima", styles["ContratoClausula"]))

    clausulas_7 = [
        "<b>7.1)</b> Fica convencionado que, o comprador(a) possui garantia de atendimento veterinário ao canino adquirido, por profissional médico do vendedor, ou a este conveniado dentro do prazo de 30 (trinta) dias.",
        "<b>7.2)</b> Tal garantia não se estende à medicamentos, desde que não tenha relação com a retirada do canino do local presente. Em caso de necessidade de uso medicamentoso, o produto deverá ser retirado diretamente em loja.",
        "<b>7.3)</b> Perderá a garantia do filhote se o mesmo for tratado em outro estabelecimento veterinário, sob qualquer pretexto.",
        "<font color='red'><b>7.4)</b> Em caso de urgência, sob prévia comunicação ao vendedor, fora dos horários de atendimento e funcionamento deste, o Comprador poderá dirigir-se ao Hospital Conveniado ao Vendedor, para que tenha a garantia mantida e o suporte prestado, sito ao Endereço: Rua Dr. Silvino de Godoy, 540 - Jardim de Itapoan, Paulínia - SP, 13140-252.</font>",
        "<b>7.5)</b> Não estão inclusas nas garantias de troca: possíveis alterações de predisposição racial e enfermidades hereditárias, tais como: dermáticos, uma vez que, a hereditariedade pode estar relacionada com genes de gerações passadas podendo ser manifestada com queda de imunidade.",
        "<b>7.6)</b> O vendedor por sua vez, declara para os fins civis e criminais que, os pais do canino vendido nunca manifestaram as patologias descritas no parágrafo 3º desta cláusula.",
        "<b>7.7)</b> Em relação à displasia coxa femoral, o vendedor não garante a inexistência da instabilidade no filhote, uma vez que, o gene hereditário da displasia coxo femoral pode ser manifestada em até 10 gerações sucessoras.",
        "<b>7.8)</b> Em relação a coprofagia, importante informar que, algumas raças podem apresentar este desvio de comportamento e que a garantia não se estende para detectar tal anomalia.",
        "<b>7.9)</b> Fica esclarecido que, conforme o desenvolvimento do filhote, podem ocorrer alterações na cor e/ou pelagem. O comprador(a) tem ciência que a cor de registro no Pedigree e no Contrato de Venda e Compra, refere-se à observação da coloração no momento do nascimento, podendo haver mudanças na tonalidade da pelagem quando da primeira tosa ou idade adulta.",
        "<b>7.10)</b> Recomenda-se banhos e tosas somente em animais após o término do esquema vacinal, vez que, anterior à isto o canino estará exposto à vírus e bactérias.",
        "<b>7.11)</b> NÃO ESTÃO COBERTOS PELA GARANTIA:<br/>• Úlcera de Córnea: provocada pelo calor do secador, produtos químicos, trauma com escovas.<br/>• Quedas: mesa, banheira ou colo. Enforcamento por guia de contenção, distração.<br/>• Feridas: causadas pela lâmina da tosa/tesouras.<br/>• Intoxicações: uso inadequado de substâncias.<br/>• Choques elétricos.<br/>• Queimadura: utilização de alta temperatura da água.<br/>• Ectoparasitas: pulgas, carrapatos, pela falta de higiene e/ou uso comum de tesouras/pinças/escovas de outros caninos.<br/>• Virose: comedouros e bebedouros são agentes de transmissão de viroses.<br/>• Casos de óbito causado por doença infectocontagiosa no animal, tais como: doenças bacterianas e viróticas, envenenamento, intoxicação, quedas, verminoses, parasitas, dermatites alérgicas, pelagem, fungos, pneumonia, dentição, testículos, atropelamentos, maus tratos, brigas entre cães, alimentação inadequada.",
    ]
    for item in clausulas_7:
        story.append(Paragraph(item, styles["ContratoTexto"]))

    story.append(PageBreak())

    story.append(Paragraph("DO DIREITO DA IMAGEM", styles["ContratoSecao"]))
    story.append(Paragraph("Cláusula Oitava", styles["ContratoClausula"]))
    clausulas_8 = [
        "<b>8.1)</b> É proibida a divulgação e utilização dos dados do vendedor para todos os fins de direito sem sua expressa autorização, por qualquer meio de comunicação.",
        "<b>8.2)</b> Fica ajustado que, em casos de dúvidas, esclarecimentos, divergências, insatisfações, reclamações o contato será realizado diretamente com o gerente responsável pela loja e atendimento ou suporte.",
        "<b>8.3)</b> Fica expressamente ajustado que, em caso de reclamações com utilização de ofensas, pareceres sem fundamentação médica veterinária, palavras inadequadas e de baixo calão, junto aos meios de comunicação como Facebook, Instagram e WhatsApp, serão objetos de demandas judiciais, e o comprador(a) responderá civil e criminalmente pelos prejuízos causados.",
        "<b>8.4)</b> Fica fixado multa de 10x o valor do contrato pelo descumprimento das cláusulas acima mencionadas. Uma vez que a empresa se disponibiliza por meio legal a cumprir o contrato aqui firmado, não havendo necessidades de utilização de outros.",
    ]
    for item in clausulas_8:
        story.append(Paragraph(item, styles["ContratoTexto"]))

    story.append(Paragraph("-", styles["ContratoTexto"]))

    story.append(Paragraph("DISPOSIÇÕES FINAIS", styles["ContratoSecao"]))
    story.append(Paragraph("Cláusula Nona", styles["ContratoClausula"]))
    clausulas_9 = [
        "<b>9.1)</b> O vendedor não se responsabiliza por óbito do animal que seja decorrente de doença infectocontagiosa, que tenha sido causada por negligência do comprador(a), ou seja, em inobservância dos cuidados necessários e cumprimento do ciclo de vacinação e vermifugação.",
        "<b>9.2)</b> O comprador(a) está ciente que, após a retirada do filhote da loja e em razão de mudança do ambiente e separação da mãe e dos irmãos do filhote adquirido; como também vacinação, transporte terrestre ou aéreo, poderá ocasionar ao canino alteração de imunidade, podendo resultar em uma infecção oportunista de protozoário.",
        "<b>9.3)</b> O presente contrato é realizado de forma presencial, sendo irrevogável, irretratável, irrenunciável, não cabendo qualquer arrependimento ou devolução do valor pago pelo canino, posto que o comprador(a) é cientificado das exigências de criação que terá com o filhote adquirido.",
        "<b>9.4)</b> Para dirimir quaisquer controvérsias oriundas do presente CONTRATO, as partes elegem o foro da Cidade de CAMPINAS no Estado de São Paulo, renunciando a qualquer outro por mais privilegiado que seja.",
        "<b>9.5)</b> Declara o comprador(a) ter lido integralmente o presente contrato estando de acordo com todas as suas cláusulas, comprometendo-se à zelar pelo animal adquirido e ciente que abandono e maus tratos são caracterizados crimes ambientais, sendo passíveis de prisão e multa:",
    ]
    for item in clausulas_9:
        story.append(Paragraph(item, styles["ContratoTexto"]))

    story.append(PageBreak())

    story.append(Paragraph("LEI Nº 9.605, DE 12 DE FEVEREIRO DE 1998", styles["ContratoLeiAzul"]))
    lei = (
        "Dispõe sobre as sanções penais e administrativas derivadas de<br/>"
        "condutas e atividades lesivas ao meio ambiente, e dá outras providências.<br/><br/>"
        "<b>Art. 32.</b> Praticar ato de abuso, maus-tratos, ferir ou mutilar animais silvestres, "
        "domésticos ou domesticados, nativos ou exóticos:<br/><br/>"
        "Pena - detenção, de três meses a um ano, e multa.<br/><br/>"
        "<b>1º</b> Incorre nas mesmas penas quem realiza experiência dolorosa ou cruel em animal vivo, "
        "ainda que para fins didáticos ou científicos, quando existirem recursos alternativos.<br/><br/>"
        "<b>2º</b> A pena é aumentada de um sexto a um terço, se ocorre morte do animal."
    )
    story.append(Paragraph(lei, styles["ContratoLei"]))
    story.append(Spacer(1, 22))
    story.append(Paragraph("E por estarem ciente da contratação, firmam e assinam o presente em duas vias de iguais.", styles["ContratoTexto"]))
    story.append(Spacer(1, 24))

    cidade_final = cidade or unidade or "CAMPINAS"
    data_final = data_compra or datetime.datetime.now(TZ).strftime("%d/%m/%Y")
    story.append(Paragraph(f"CIDADE {cidade_final.upper()}, {data_final}.", styles["ContratoTexto"]))
    story.append(Spacer(1, 34))

    story.append(Paragraph("<b>PELO VENDEDOR</b>", styles["ContratoTexto"]))
    story.append(Spacer(1, 46))
    story.append(Paragraph("__________________________________________", styles["ContratoTexto"]))
    story.append(Paragraph("<b>SHOOKPET COMERCIO DE ANIMAIS E MEDICAMENTOS VETERINARIOS LTDA</b>", styles["ContratoTextoPequeno"]))
    story.append(Paragraph("<b>CNPJ: 47.945.634/0002-61</b>", styles["ContratoTextoPequeno"]))
    story.append(Paragraph(f"<b>VENDA REALIZADA POR: {vendedora}</b>", styles["ContratoTextoPequeno"]))
    story.append(Paragraph(f"<b>Unidade de {unidade}</b>", styles["ContratoTextoPequeno"]))

    story.append(Spacer(1, 34))
    story.append(Paragraph("<b>PELO COMPRADOR</b>", styles["ContratoTexto"]))
    story.append(Spacer(1, 46))
    story.append(Paragraph("__________________________________________", styles["ContratoTexto"]))
    story.append(Paragraph(f"<font color='red'>{nome}</font>", styles["ContratoTextoPequeno"]))
    story.append(Paragraph(f"<font color='red'>{cpf}</font>", styles["ContratoTextoPequeno"]))
    story.append(Paragraph(f"<font color='red'>{telefone}</font>", styles["ContratoTextoPequeno"]))
    story.append(Paragraph(f"<font color='red'>{email}</font>", styles["ContratoTextoPequeno"]))

    story.append(PageBreak())

    if logo_path.exists():
        try:
            logo2 = RLImage(str(logo_path), width=3.1 * cm, height=2.2 * cm)
            logo2.hAlign = "CENTER"
            story.append(logo2)
            story.append(Spacer(1, 18))
        except Exception:
            pass

    story.append(Paragraph("TERMO DE AUTORIZAÇÃO DE USO DE IMAGEM E VOZ", styles["ContratoTitulo"]))
    termo = (
        "Neste ato, e para todos os fins de direito, autorizo uso da minha imagem e voz para fins de divulgação "
        "e publicidade do trabalho artístico-cultural, em caráter definitivo e gratuito, constante em fotos e filmagens.<br/><br/>"
        "As imagens e voz poderão ser exibidas: parcial ou total, em apresentação, audiovisual, publicações e divulgações "
        "em exposições e festivais com ou sem premiações remuneradas nacionais ou internacionais, assim como disponibilizadas "
        "no banco de imagens resultante da pesquisa e na internet e em outras mídias futuras, fazendo-se constar os devidos "
        "créditos ao fotógrafo.<br/><br/>"
        "Por ser esta a expressão de minha vontade, nada terei a reclamar a título de direitos conexos à minha imagem "
        "e voz ou qualquer outro."
    )
    story.append(Paragraph(termo, styles["ContratoTexto"]))
    story.append(Spacer(1, 24))
    story.append(Paragraph(f"CIDADE {cidade_final.upper()}, {data_final}.", styles["ContratoTexto"]))
    story.append(Spacer(1, 70))
    story.append(Paragraph("__________________________________________", styles["ContratoTexto"]))
    story.append(Paragraph(f"<font color='red'>{nome}</font>", styles["ContratoTextoPequeno"]))
    story.append(Paragraph(f"<font color='red'>{cpf}</font>", styles["ContratoTextoPequeno"]))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()




# ============================================================
# CSS GLOBAL
# ============================================================

def inject_css():
    st.markdown(
        """
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

            html, body, [class*="css"] {
                font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
            }

            .stApp {
                background: #D4D4D4 !important;
                color: #07142F !important;
            }

            header[data-testid="stHeader"] {
                background: transparent !important;
            }

            .block-container {
                max-width: 1240px !important;
                padding-top: 2rem !important;
                padding-left: 1.4rem !important;
                padding-right: 1.4rem !important;
                padding-bottom: 3rem !important;
            }

            h1, h2, h3, h4, p, label {
                font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
            }

            div:not([class*="material"]):not([data-testid="stIconMaterial"]),
            span:not([class*="material"]):not([data-testid="stIconMaterial"]) {
                font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
            }

            div[data-testid="stSelectbox"] label p,
            div[data-testid="stTextInput"] label p,
            div[data-testid="stDateInput"] label p,
            div[data-testid="stRadio"] label p {
                color: #ffffff !important;
                font-size: 14px !important;
                font-weight: 800 !important;
            }

            div[data-testid="stSelectbox"] div[data-baseweb="select"] > div {
                background: #262832 !important;
                border: 1px solid #262832 !important;
                border-radius: 9px !important;
                min-height: 48px !important;
                color: #ffffff !important;
            }

            div[data-testid="stSelectbox"] div[data-baseweb="select"] span {
                color: #ffffff !important;
                font-weight: 600 !important;
                font-size: 15px !important;
            }

            div[data-testid="stSelectbox"] svg {
                fill: #ffffff !important;
            }

            div.stButton > button {
                width: 100%;
                height: 50px;
                border: none !important;
                border-radius: 14px !important;
                background: linear-gradient(90deg, #1B1D6D 0%, #111827 100%) !important;
                color: #ffffff !important;
                font-size: 16px !important;
                font-weight: 800 !important;
                box-shadow: 0 14px 28px rgba(15, 23, 42, 0.18) !important;
            }

            div.stButton > button:hover {
                transform: translateY(-1px);
                background: linear-gradient(90deg, #16185c 0%, #0f172a 100%) !important;
            }

            .top-grid {
                display: grid;
                grid-template-columns: 70px 1fr 120px;
                gap: 18px;
                align-items: start;
                margin-bottom: 22px;
            }

            .page-title {
                color: #ffffff;
                font-size: 38px;
                font-weight: 900;
                letter-spacing: -0.8px;
                margin: 6px 0 0 0;
                line-height: 1;
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .page-caption {
                color: #ffffff;
                opacity: 0.85;
                font-size: 14px;
                font-weight: 600;
                margin-top: 22px;
            }

            .center-logo {
                width: 76px;
                height: 76px;
                border-radius: 50%;
                background: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 12px 28px rgba(15,23,42,0.13);
                margin: -10px auto 12px auto;
            }

            .logo-img {
                border-radius: 50%;
                object-fit: contain;
                background: #ffffff;
                padding: 6px;
            }

            .logo-fallback {
                border-radius: 50%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: #ffffff;
                font-size: 30px;
            }

            .divider {
                height: 1px;
                background: rgba(255,255,255,0.22);
                margin: 26px 0 38px 0;
            }

            .kpi-card {
                background: #ffffff;
                border-radius: 18px;
                min-height: 122px;
                padding: 18px 16px 12px 20px;
                box-shadow: 0 14px 28px rgba(15, 23, 42, 0.10);
                border-left: 8px solid var(--accent);
                box-sizing: border-box;
                overflow: hidden;
            }

            .kpi-title {
                color: #07142F;
                font-size: 15px;
                font-weight: 900;
                line-height: 1.23;
                margin-bottom: 8px;
                letter-spacing: -0.15px;
            }

            .kpi-value {
                color: #07142F;
                font-size: 36px;
                font-weight: 900;
                line-height: 0.95;
                margin-bottom: 8px;
                letter-spacing: -0.8px;
            }

            .kpi-sub {
                color: #475569;
                font-size: 12px;
                font-weight: 500;
                line-height: 1.1;
            }

            .panel-card {
                background: #ffffff;
                border-radius: 18px;
                box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
                border: 1px solid rgba(15,23,42,0.06);
                overflow: hidden;
                margin-bottom: 20px;
            }

            .panel-head {
                padding: 18px 20px 0px 20px;
                background: #ffffff;
            }

            .panel-title {
                font-weight: 900;
                color:#07142F;
                font-size: 27px;
                line-height: 1.15;
                letter-spacing: -0.4px;
                display:flex;
                align-items:center;
                justify-content:center;
                text-align:center;
                gap:12px;
                width:100%;
            }

            .panel-body {
                padding: 12px 16px 16px 16px;
                background:#ffffff;
            }


            .menu-title {
                font-size: 21px;
                font-weight: 900;
                color: #ffffff;
                margin-bottom: 8px;
            }

            .menu-sub {
                font-size: 13px;
                color: #94a3b8;
                margin-bottom: 22px;
            }

            .menu-divider {
                height: 1px;
                background: rgba(255,255,255,0.18);
                margin: 12px 0 16px 0;
            }

            .menu-help {
                margin-top: 18px;
                font-size: 11px;
                color: #94a3b8;
                text-align: center;
            }

            div[data-testid="stPopoverContent"] .stButton > button {
                background: #111A3D !important;
                color: #ffffff !important;
                border-radius: 11px !important;
                height: 50px !important;
                margin-top: 10px !important;
                box-shadow: none !important;
                font-size: 15px !important;
                font-weight: 800 !important;
            }

            div[data-testid="stPopoverContent"] .stButton > button:hover {
                background: #1B1D6D !important;
            }

            .form-page-title {
                color: #1B1D6D;
                font-size: 38px;
                font-weight: 900;
                letter-spacing: -0.9px;
                margin: 0;
            }

            .form-page-sub {
                color: #64748b;
                font-size: 15px;
                margin-top: 8px;
                font-weight: 500;
            }

            .form-card {
                background: #ffffff;
                border-radius: 22px;
                padding: 30px 28px 24px 28px;
                box-shadow: 0 14px 40px rgba(15, 23, 42, 0.13);
                border: 1px solid rgba(27,29,109,0.08);
                margin-top: 24px;
            }

            .section-title {
                display: flex;
                align-items: center;
                gap: 14px;
                margin: 10px 0 22px 0;
                border-bottom: 3px solid #C00040;
                padding-bottom: 12px;
            }

            .section-icon {
                width: 46px;
                height: 46px;
                border-radius: 50%;
                background: #1B1D6D;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 22px;
                font-weight: 900;
            }

            .section-title h2 {
                color: #1B1D6D;
                font-size: 27px;
                font-weight: 900;
                margin: 0;
                letter-spacing: -0.4px;
            }

            .form-card div[data-testid="stTextInput"] label p,
            .form-card div[data-testid="stSelectbox"] label p,
            .form-card div[data-testid="stDateInput"] label p,
            .form-card div[data-testid="stRadio"] label p {
                color: #1B1D6D !important;
                font-size: 14px !important;
                font-weight: 900 !important;
            }

            .form-card div[data-testid="stTextInput"] input,
            .form-card div[data-testid="stDateInput"] input {
                height: 52px !important;
                border-radius: 12px !important;
                border: 1.5px solid rgba(27,29,109,0.55) !important;
                background: #ffffff !important;
                color: #1B1D6D !important;
                font-size: 15px !important;
                box-shadow: none !important;
            }

            .form-card div[data-testid="stTextInput"] input::placeholder,
            .form-card div[data-testid="stDateInput"] input::placeholder {
                color: #7b86a5 !important;
                opacity: 1 !important;
            }

            .form-card div[data-testid="stSelectbox"] div[data-baseweb="select"] > div {
                background: #ffffff !important;
                border: 1.5px solid rgba(27,29,109,0.55) !important;
                border-radius: 12px !important;
                min-height: 52px !important;
                color: #1B1D6D !important;
            }

            .form-card div[data-testid="stSelectbox"] div[data-baseweb="select"] span {
                color: #1B1D6D !important;
            }

            .form-card div[data-testid="stSelectbox"] svg {
                fill: #1B1D6D !important;
            }

            .form-card div[data-testid="stRadio"] > div {
                display: flex;
                flex-direction: row;
                gap: 14px;
            }

            .form-card div[data-testid="stRadio"] label {
                border: 1.5px solid rgba(27,29,109,0.45);
                border-radius: 10px;
                padding: 10px 18px;
                min-width: 124px;
                background: #ffffff;
                color: #1B1D6D !important;
                font-weight: 800 !important;
            }

            .placeholder-page {
                background:#ffffff;
                border-radius:18px;
                padding: 28px;
                box-shadow: 0 10px 24px rgba(15,23,42,0.08);
                color:#07142F;
                margin-top: 20px;
            }

            @media (max-width: 900px) {
                .top-grid {
                    grid-template-columns: 60px 1fr;
                }

                .page-title {
                    font-size: 30px;
                }

                .center-logo {
                    margin-top: 8px;
                }
            }
        
            /* Corrige expand_more / expand_less sem tirar o menu */
            span[class*="material-symbols"],
            span[class*="material-icons"],
            i[class*="material-symbols"],
            i[class*="material-icons"],
            [class*="material-symbols"],
            [class*="material-icons"] {
                font-family: "Material Symbols Rounded", "Material Symbols Outlined", "Material Icons" !important;
                font-weight: normal !important;
                font-style: normal !important;
                font-size: 20px !important;
                line-height: 1 !important;
                letter-spacing: normal !important;
                text-transform: none !important;
                display: inline-flex !important;
                white-space: nowrap !important;
                word-wrap: normal !important;
                direction: ltr !important;
                -webkit-font-feature-settings: "liga" !important;
                -webkit-font-smoothing: antialiased !important;
                font-feature-settings: "liga" !important;
                color: inherit !important;
            }

            /* No botão do menu, mostra somente o ☰ e esconde o ícone extra do Streamlit */
            div[data-testid="stPopover"] > button {
                gap: 0 !important;
            }

            div[data-testid="stPopover"] > button span[class*="material-symbols"],
            div[data-testid="stPopover"] > button span[class*="material-icons"],
            div[data-testid="stPopover"] > button i[class*="material-symbols"],
            div[data-testid="stPopover"] > button i[class*="material-icons"] {
                display: none !important;
                opacity: 0 !important;
                width: 0 !important;
                max-width: 0 !important;
                overflow: hidden !important;
            }

        
            /* Corrige definitivamente o texto expand_more / expand_less */
            [data-testid="stIconMaterial"],
            [data-testid="stIconMaterial"] *,
            span[class*="material"],
            i[class*="material"],
            .material-symbols-rounded,
            .material-symbols-outlined,
            .material-icons {
                font-family: "Material Symbols Rounded", "Material Symbols Outlined", "Material Icons" !important;
                font-weight: normal !important;
                font-style: normal !important;
                font-size: 20px !important;
                line-height: 1 !important;
                letter-spacing: normal !important;
                text-transform: none !important;
                white-space: nowrap !important;
                word-wrap: normal !important;
                direction: ltr !important;
                -webkit-font-feature-settings: "liga" !important;
                -webkit-font-smoothing: antialiased !important;
                font-feature-settings: "liga" !important;
            }

            /* Remove o ícone de seta do botão do popover e mantém só o ☰ */
            div[data-testid="stPopover"] > button [data-testid="stIconMaterial"],
            div[data-testid="stPopover"] > button span[class*="material"],
            div[data-testid="stPopover"] > button i[class*="material"] {
                display: none !important;
                width: 0 !important;
                max-width: 0 !important;
                opacity: 0 !important;
                overflow: hidden !important;
            }

            div[data-testid="stPopover"] > button {
                gap: 0 !important;
            }

        
            /* Cabeçalho central da Visão Geral */
            .header-center {
                width: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                margin-top: -8px;
                margin-bottom: 18px;
            }

            .header-logo {
                width: 92px;
                height: 92px;
                border-radius: 50%;
                background: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 12px 28px rgba(15,23,42,0.13);
                margin-bottom: 10px;
            }

            .header-title {
                color: #1B1D6D;
                font-size: 34px;
                font-weight: 900;
                letter-spacing: -0.8px;
                line-height: 1.05;
                margin-bottom: 8px;
            }

            .header-caption {
                color: #1B1D6D;
                opacity: 1;
                font-size: 14px;
                font-weight: 600;
            }

        
            .login-brand-card {
                max-width: 560px;
                margin: 5vh auto 24px auto;
                background: #ffffff;
                border-radius: 26px;
                padding: 34px 30px 26px 30px;
                box-shadow: 0 22px 48px rgba(15,23,42,0.16);
                border: 1px solid rgba(27,29,109,0.08);
                text-align: center;
            }

            .login-logo-wrap {
                width: 132px;
                height: 132px;
                border-radius: 50%;
                background: #ffffff;
                margin: 0 auto 18px auto;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 16px 32px rgba(15,23,42,0.16);
                border: 8px solid #f8fafc;
            }

            .login-main-title {
                color: #1B1D6D;
                font-size: 32px;
                font-weight: 900;
                letter-spacing: -0.8px;
                line-height: 1.05;
                margin-bottom: 8px;
            }

            .login-subtitle {
                color: #07142F;
                font-size: 18px;
                font-weight: 900;
                margin-bottom: 4px;
            }

            .login-caption {
                color: #64748b;
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 20px;
            }

            .login-line {
                height: 1px;
                width: 100%;
                background: #e5e7eb;
            }

        
            /* Ajuste SOMENTE para mobile: separa os cards de KPI sem mexer no desktop */
            @media (max-width: 768px) {
                div[data-testid="column"] {
                    margin-bottom: 14px !important;
                }

                .kpi-card {
                    margin-bottom: 14px !important;
                    min-height: 118px !important;
                    padding: 18px 16px 14px 18px !important;
                    border-radius: 16px !important;
                }

                .kpi-title {
                    font-size: 14px !important;
                    line-height: 1.25 !important;
                    margin-bottom: 8px !important;
                }

                .kpi-value {
                    font-size: 34px !important;
                    line-height: 1 !important;
                    margin-bottom: 8px !important;
                }

                .kpi-sub {
                    font-size: 12px !important;
                    line-height: 1.2 !important;
                }
            }


        
            /* MENU CORRETO - volta ao modelo visual original */
            div[data-testid="stPopover"] > button {
                height: 46px !important;
                width: 56px !important;
                min-width: 56px !important;
                border-radius: 8px !important;
                border: none !important;
                background: #111827 !important;
                color: #ffffff !important;
                font-size: 22px !important;
                font-weight: 900 !important;
                box-shadow: 0 8px 20px rgba(15,23,42,0.14) !important;
            }

            div[data-testid="stPopover"] > button:hover {
                background: #1B1D6D !important;
            }

            div[data-testid="stPopoverContent"] {
                border-radius: 14px !important;
                background: #0b0f17 !important;
                border: 1px solid rgba(255,255,255,0.06) !important;
                box-shadow: 0 18px 40px rgba(15,23,42,0.35) !important;
                transition-duration: 0ms !important;
                animation-duration: 0ms !important;
            }

            div[data-testid="stPopoverContent"] > div {
                background: #0b0f17 !important;
                padding: 22px !important;
                min-width: 280px !important;
            }

            div[data-testid="stPopoverContent"] .stButton > button {
                background: #111A3D !important;
                color: #ffffff !important;
                border-radius: 11px !important;
                height: 50px !important;
                margin-top: 10px !important;
                box-shadow: none !important;
                font-size: 15px !important;
                font-weight: 800 !important;
                width: 100% !important;
                white-space: normal !important;
            }

            div[data-testid="stPopoverContent"] .stButton > button:hover {
                background: #1B1D6D !important;
            }

            @media (max-width: 768px) {
                div[data-testid="stPopoverContent"] > div {
                    min-width: 240px !important;
                    padding: 20px !important;
                }

                div[data-testid="stPopoverContent"] .stButton > button {
                    height: 48px !important;
                    font-size: 14px !important;
                }
            }

        
            /* Ajuste fino: remove delay/animação do menu sem alterar o modelo visual */
            div[data-testid="stPopover"],
            div[data-testid="stPopover"] *,
            div[data-testid="stPopoverContent"],
            div[data-testid="stPopoverContent"] * {
                transition-duration: 0ms !important;
                transition-delay: 0ms !important;
                animation-duration: 0ms !important;
                animation-delay: 0ms !important;
            }

            div[data-testid="stPopoverContent"] {
                opacity: 1 !important;
                transform: none !important;
                will-change: auto !important;
            }

        
            .panel-subtitle {
                color: #64748b;
                font-size: 13px;
                font-weight: 700;
                margin-top: 4px;
                text-align: center;
            }

        
            /* Deixa o texto dos selects escuros legível sem alterar o restante do formulário */
            div[data-baseweb="select"] span,
            div[data-baseweb="select"] div,
            div[data-baseweb="select"] input {
                color: #ffffff !important;
                opacity: 1 !important;
            }

            div[data-baseweb="select"] [class*="placeholder"],
            div[data-baseweb="select"] [data-testid*="placeholder"] {
                color: #ffffff !important;
                opacity: 0.85 !important;
            }

            div[data-baseweb="popover"] ul[role="listbox"] li,
            div[data-baseweb="popover"] ul[role="listbox"] div,
            ul[role="listbox"] li,
            ul[role="listbox"] div {
                color: #07142F !important;
                opacity: 1 !important;
            }

        
            /* Corrige placeholder invisível em selects vazios, principalmente Estado de moradia */
            div[data-baseweb="select"] {
                color: #ffffff !important;
            }

            div[data-baseweb="select"] * {
                color: #ffffff !important;
                opacity: 1 !important;
            }

            div[data-baseweb="select"] input::placeholder {
                color: #ffffff !important;
                opacity: 1 !important;
            }

            div[data-baseweb="select"] [aria-hidden="true"] {
                color: #ffffff !important;
                opacity: 1 !important;
            }

        
            /* Corrige a cor dos nomes das páginas dentro do menu */
            div[data-testid="stPopoverContent"] .stButton > button,
            div[data-testid="stPopoverContent"] .stButton > button *,
            div[data-testid="stPopoverContent"] .stButton > button p,
            div[data-testid="stPopoverContent"] .stButton > button span {
                color: #ffffff !important;
                opacity: 1 !important;
                font-weight: 800 !important;
            }

            div[data-testid="stPopoverContent"] .stButton > button:hover,
            div[data-testid="stPopoverContent"] .stButton > button:hover *,
            div[data-testid="stPopoverContent"] .stButton > button:hover p,
            div[data-testid="stPopoverContent"] .stButton > button:hover span {
                color: #ffffff !important;
                opacity: 1 !important;
            }

        
            /* Correção forte: texto dos botões do menu sempre branco */
            div[data-testid="stPopoverContent"] button,
            div[data-testid="stPopoverContent"] button *,
            div[data-testid="stPopoverContent"] button p,
            div[data-testid="stPopoverContent"] button div,
            div[data-testid="stPopoverContent"] button span,
            div[data-testid="stPopoverContent"] [data-testid="stMarkdownContainer"],
            div[data-testid="stPopoverContent"] [data-testid="stMarkdownContainer"] *,
            div[data-testid="stPopoverContent"] [data-testid="stMarkdownContainer"] p {
                color: #ffffff !important;
                -webkit-text-fill-color: #ffffff !important;
                opacity: 1 !important;
                font-weight: 800 !important;
            }

            div[data-testid="stPopoverContent"] button:disabled,
            div[data-testid="stPopoverContent"] button:disabled *,
            div[data-testid="stPopoverContent"] button[disabled],
            div[data-testid="stPopoverContent"] button[disabled] * {
                color: #ffffff !important;
                -webkit-text-fill-color: #ffffff !important;
                opacity: 1 !important;
            }

        
            /* Correção definitiva: texto do markdown dentro dos botões do menu */
            div[data-testid="stPopoverContent"] div.stButton button [data-testid="stMarkdownContainer"] p,
            div[data-testid="stPopoverContent"] div.stButton button [data-testid="stMarkdownContainer"] strong,
            div[data-testid="stPopoverContent"] div.stButton button [data-testid="stMarkdownContainer"] span,
            div[data-testid="stPopoverContent"] div.stButton button [data-testid="stMarkdownContainer"] {
                color: #ffffff !important;
                -webkit-text-fill-color: #ffffff !important;
                opacity: 1 !important;
            }

            div[data-testid="stPopoverContent"] div.stButton button {
                color: #ffffff !important;
                -webkit-text-fill-color: #ffffff !important;
            }

        
            /* MENU: mantém os nomes das páginas em branco */
            div[data-baseweb="popover"] button,
            div[data-baseweb="popover"] button *,
            div[data-baseweb="popover"] button p,
            div[data-baseweb="popover"] button span,
            div[data-baseweb="popover"] button div,
            div[data-testid="stPopoverContent"] button,
            div[data-testid="stPopoverContent"] button *,
            div[data-testid="stPopoverContent"] button p,
            div[data-testid="stPopoverContent"] button span,
            div[data-testid="stPopoverContent"] button div {
                color: #ffffff !important;
                -webkit-text-fill-color: #ffffff !important;
                opacity: 1 !important;
                font-weight: 800 !important;
            }

        
            /* MENU FINAL: sem delay, fecha ao clicar e mantém o visual */
            .menu-html-wrap {
                position: relative;
                z-index: 999999;
                width: 56px;
                height: 46px;
            }

            .menu-html-wrap details {
                position: relative;
                width: 56px;
            }

            .menu-html-wrap summary {
                width: 56px;
                height: 46px;
                border-radius: 8px;
                background: #111827;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 22px;
                font-weight: 900;
                list-style: none;
                cursor: pointer;
                user-select: none;
                box-shadow: 0 8px 20px rgba(15,23,42,0.14);
            }

            .menu-html-wrap summary:hover {
                background: #1B1D6D;
            }

            .menu-html-wrap summary::-webkit-details-marker {
                display: none;
            }

            .menu-html-wrap summary::marker {
                content: "";
                display: none;
            }

            .menu-html-panel {
                position: absolute;
                top: 54px;
                left: 0;
                width: 320px;
                max-width: calc(100vw - 28px);
                background: #0b0f17;
                border-radius: 14px;
                border: 1px solid rgba(255,255,255,0.06);
                box-shadow: 0 18px 40px rgba(15,23,42,0.35);
                padding: 22px;
                box-sizing: border-box;
                z-index: 999999;
            }

            .menu-html-link {
                width: 100%;
                min-height: 50px;
                border-radius: 11px;
                background: #111A3D;
                color: #ffffff !important;
                -webkit-text-fill-color: #ffffff !important;
                text-decoration: none !important;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-top: 10px;
                font-size: 15px;
                font-weight: 800;
                box-sizing: border-box;
            }

            .menu-html-link:hover {
                background: #1B1D6D;
                color: #ffffff !important;
                -webkit-text-fill-color: #ffffff !important;
                text-decoration: none !important;
            }

            @media (max-width: 768px) {
                .menu-html-panel {
                    width: 260px;
                    max-width: calc(100vw - 24px);
                    padding: 20px;
                }

                .menu-html-link {
                    min-height: 48px;
                    font-size: 14px;
                }
            }

        </style>
        """,
        unsafe_allow_html=True
    )


# ============================================================
# LOGIN
# ============================================================

def ensure_login():
    if "logged_in" not in st.session_state:
        st.session_state.logged_in = False

    if st.session_state.logged_in:
        return True

    inject_css()

    st.markdown(
        f"""
        <div class="login-brand-card">
            <div class="login-logo-wrap">
                {logo_html(118)}
            </div>
            <div class="login-main-title">SkoobPet Campinas</div>
            <div class="login-subtitle">🔒 Acesso ao Painel</div>
            <div class="login-caption">Digite usuário e senha para continuar</div>
            <div class="login-line"></div>
        </div>
        """,
        unsafe_allow_html=True
    )

    with st.container():
        user = st.text_input("usuario")
        pwd = st.text_input("senha", type="password")
        entrar = st.button("Entrar", use_container_width=True)

    if entrar:
        usuario_digitado = (user or "").strip()
        senha_digitada = (pwd or "").strip().replace(" ", "")

        if usuario_digitado == APP_USER and senha_digitada == APP_PASS:
            st.session_state.logged_in = True
            st.session_state.page = "visao"
            st.rerun()
        else:
            st.error("Usuário ou senha inválidos")

    return False



# ============================================================
# COMPONENTES
# ============================================================

def render_menu():
    st.markdown("""<div class="menu-html-wrap"><details><summary>☰</summary><div class="menu-html-panel"><div class="menu-title">Menu</div><div class="menu-sub">Escolha uma área para acessar</div><div class="menu-divider"></div><a class="menu-html-link" href="?page=visao&auth=1" target="_self">📊 Visão Geral</a><a class="menu-html-link" href="?page=formulario&auth=1" target="_self">📄 Formulário</a><a class="menu-html-link" href="?page=nova&auth=1" target="_self">🧩 Nova Página</a><div class="menu-help">Painel interno • SkoobPet</div></div></details></div>""", unsafe_allow_html=True)


def render_logout():
    if st.button("Sair", use_container_width=True, key="btn_sair"):
        st.session_state.logged_in = False
        st.session_state.page = "visao"
        st.rerun()


def kpi_card(title, value, subtitle, accent):
    st.markdown(
        f"""
        <div class="kpi-card" style="--accent:{accent};">
            <div class="kpi-title">{title}</div>
            <div class="kpi-value">{value}</div>
            <div class="kpi-sub">{subtitle}</div>
        </div>
        """,
        unsafe_allow_html=True
    )


def tune_plotly(fig, height=360, showlegend=False):
    fig.update_layout(
        height=height,
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        margin=dict(t=18, b=20, l=20, r=20),
        font=dict(color="#07142F", family="Inter"),
        showlegend=showlegend,
    )
    fig.update_xaxes(showgrid=False, zeroline=False, tickfont=dict(color="#334155"))
    fig.update_yaxes(showgrid=True, gridcolor="rgba(15,23,42,0.08)", zeroline=False, tickfont=dict(color="#334155"))
    return fig


# ============================================================
# PÁGINA: VISÃO GERAL
# ============================================================

def render_visao_geral(df):
    inject_css()

    top_menu, top_center, top_sair = st.columns([0.8, 6, 1.4])

    with top_menu:
        render_menu()

    with top_center:
        st.markdown(
            f"""
            <div class="header-center">
                <div class="header-logo">{logo_html(78)}</div>
                <div class="header-title">Visão Geral</div>
                <div class="header-caption">Total de registros: <b>{len(df)}</b></div>
            </div>
            """,
            unsafe_allow_html=True
        )

    with top_sair:
        render_logout()

    # filtros
    col_mes, col_logo_space, col_unidade = st.columns([6, 1.1, 6])

    if "Mês" in df.columns and len(df) > 0:
        meses = sorted([m for m in df["Mês"].dropna().astype(str).unique().tolist() if m.strip()])
    else:
        meses = []

    if not meses:
        meses = [datetime.datetime.now(TZ).strftime("%m/%Y")]

    mes_atual = datetime.datetime.now(TZ).strftime("%m/%Y")
    index_mes = meses.index(mes_atual) if mes_atual in meses else len(meses) - 1

    with col_mes:
        mes = st.selectbox("Mês", meses, index=index_mes, key="filtro_mes")

    with col_logo_space:
        st.empty()

    unidade_col = pick_first_existing(df, ["Unidade", "Cidade", "Cidade do comprador"])

    if unidade_col and unidade_col in df.columns:
        unidades = ["Todas"] + sorted([
            str(u).strip().title()
            for u in df[unidade_col].dropna().astype(str).unique().tolist()
            if str(u).strip()
        ])
    else:
        unidades = ["Todas"]

    with col_unidade:
        unidade = st.selectbox("Unidade", unidades, key="filtro_unidade")

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    f_all = df.copy()

    if unidade_col and unidade_col in f_all.columns:
        f_all["_UnidadePainel"] = f_all[unidade_col].astype(str).str.strip().str.title()
    else:
        f_all["_UnidadePainel"] = "Sem unidade"

    if unidade != "Todas":
        f_all = f_all[f_all["_UnidadePainel"] == str(unidade)]

    f_mes = f_all.copy()
    if "Mês" in f_mes.columns:
        f_mes = f_mes[f_mes["Mês"].astype(str) == str(mes)]

    # colunas de contato, se existirem
    c1_col = pick_first_existing(df, ["1º contato", "1 contato", "Primeiro contato", "Data 1º contato"])
    c2_col = pick_first_existing(df, ["2º contato", "2 contato", "Segundo contato", "Data 2º contato"])
    c3_col = pick_first_existing(df, ["3º contato", "3 contato", "Terceiro contato", "Data 3º contato"])

    s1_col = pick_first_existing(df, ["Status 1º contato", "Status 1 contato"])
    s2_col = pick_first_existing(df, ["Status 2º contato", "Status 2 contato"])
    s3_col = pick_first_existing(df, ["Status 3º contato", "Status 3 contato"])

    primeiro_hoje = count_today_all(f_all, c1_col)
    segundo_hoje = count_today_all(f_all, c2_col)
    terceiro_hoje = count_today_all(f_all, c3_col)

    primeiro_mes = count_month_all(f_all, c1_col, mes)
    segundo_mes = count_month_all(f_all, c2_col, mes)
    terceiro_mes = count_month_all(f_all, c3_col, mes)

    # caso a planilha seja só de contratos, usa quantidade de vendas como base de operação
    if primeiro_mes == 0 and segundo_mes == 0 and terceiro_mes == 0:
        primeiro_mes = int(len(f_mes))
        segundo_mes = int(len(f_mes))
        terceiro_mes = int(len(f_mes))

    vendas_mes = int(len(f_mes))

    valor_col = pick_first_existing(
        f_mes,
        [
            "Valor Filhote",
            "Valor filhote",
            "Valor de filhote",
            "Valor do filhote",
            "Valor",
            "Valor Pet",
            "Preço",
            "Preco",
        ]
    )
    faturamento = 0.0
    if valor_col and valor_col in f_mes.columns:
        faturamento = float(f_mes[valor_col].apply(brl_to_float).sum())

    erro_total = 0
    for sc in [s1_col, s2_col, s3_col]:
        if sc and sc in f_mes.columns:
            erro_total += int(f_mes[sc].apply(is_error).sum())

    k1, k2, k3, k4, k5, k6 = st.columns(6)
    with k1:
        kpi_card("💬 1º contato<br>hoje", primeiro_hoje, "registros de hoje", NAVY)
    with k2:
        kpi_card("💬 2º contato<br>hoje", segundo_hoje, "registros de hoje", NAVY_2)
    with k3:
        kpi_card("💬 3º contato<br>hoje", terceiro_hoje, "registros de hoje", WINE_2)
    with k4:
        kpi_card("📄 Primeiro<br>Contato Mês", primeiro_mes, str(mes), NAVY)
    with k5:
        kpi_card("📄 Segundo<br>Contato Mês", segundo_mes, str(mes), WINE)
    with k6:
        kpi_card("📄 Terceiro<br>Contato Mês", terceiro_mes, str(mes), WINE_2)

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    g_unidade, g_vendedor = st.columns(2)

    with g_unidade:
        st.markdown(
            """
            <div class="panel-card">
                <div class="panel-head"><div class="panel-title">🏬 Vendas por loja (Unidade)</div></div>
                <div class="panel-body">
            """,
            unsafe_allow_html=True
        )

        if "_UnidadePainel" in f_mes.columns and len(f_mes) > 0:
            df_unidade_base = f_mes.copy()

            if valor_col and valor_col in df_unidade_base.columns:
                df_unidade_base["_ValorVendaPainel"] = df_unidade_base[valor_col].apply(brl_to_float)
            else:
                df_unidade_base["_ValorVendaPainel"] = 0.0

            if "Mês" in df_unidade_base.columns:
                df_unidade_base["_MesVendaPainel"] = (
                    df_unidade_base["Mês"]
                    .fillna(str(mes))
                    .astype(str)
                    .str.strip()
                    .replace("", str(mes))
                )
            else:
                df_unidade_base["_MesVendaPainel"] = str(mes)

            df_unidade = (
                df_unidade_base
                .groupby(["_UnidadePainel", "_MesVendaPainel"], dropna=False)
                .agg(
                    Total=("Nome", "size") if "Nome" in df_unidade_base.columns else ("_UnidadePainel", "size"),
                    Faturamento=("_ValorVendaPainel", "sum"),
                )
                .reset_index()
                .rename(columns={"_UnidadePainel": "Unidade", "_MesVendaPainel": "Mês da venda"})
                .sort_values(["Mês da venda", "Total"], ascending=[True, False])
            )

            df_unidade["Faturamento formatado"] = df_unidade["Faturamento"].apply(money_br)
            df_unidade["Texto"] = (
                df_unidade["Total"].astype(str)
                + " vendas<br>"
                + df_unidade["Faturamento formatado"].astype(str)
                + "<br>"
                + df_unidade["Mês da venda"].astype(str)
            )
        else:
            df_unidade = pd.DataFrame(
                {
                    "Unidade": ["Sem unidade"],
                    "Mês da venda": [str(mes)],
                    "Total": [len(f_mes)],
                    "Faturamento": [0.0],
                    "Faturamento formatado": [money_br(0)],
                    "Texto": [f"{len(f_mes)} vendas<br>{money_br(0)}<br>{mes}"],
                }
            )

        fig = px.bar(
            df_unidade,
            x="Unidade",
            y="Total",
            text="Texto",
            color="Mês da venda",
            hover_data={
                "Unidade": True,
                "Mês da venda": True,
                "Total": True,
                "Faturamento formatado": True,
                "Faturamento": False,
                "Texto": False,
            },
            color_discrete_sequence=[NAVY, WINE, NAVY_2, WINE_2, "#334155", "#94a3b8"],
        )
        fig.update_traces(
            textposition="outside",
            cliponaxis=False,
            width=0.35,
            marker_line_width=0,
            hovertemplate=(
                "<b>%{x}</b><br>"
                "Mês da venda: %{customdata[0]}<br>"
                "Vendas: %{y}<br>"
                "Faturamento: %{customdata[2]}"
                "<extra></extra>"
            ),
        )
        fig.update_layout(
            showlegend=True,
            legend_title_text="Mês da venda",
            bargap=0.65,
            height=310,
            margin=dict(l=20, r=20, t=10, b=40),
            xaxis_type="category",
        )
        fig.update_xaxes(type="category")
        st.plotly_chart(tune_plotly(fig, height=310, showlegend=True), use_container_width=True, key="chart_unidade")
        st.markdown("</div></div>", unsafe_allow_html=True)

    with g_vendedor:
        st.markdown(
            """
            <div class="panel-card">
                <div class="panel-head"><div class="panel-title">🏆 Vendas por vendedora (mês)</div></div>
                <div class="panel-body">
            """,
            unsafe_allow_html=True
        )

        vendedor_col = pick_first_existing(
            f_mes,
            [
                "Vendedora",
                "vendedora",
                "Vendedor",
                "vendedor",
                "Nome vendedor",
                "Nome da vendedora",
                "Responsável",
                "Responsavel",
            ]
        )

        if vendedor_col and vendedor_col in f_mes.columns and len(f_mes) > 0:
            df_vendedor = f_mes.copy()
            df_vendedor["_VendedoraPainel"] = (
                df_vendedor[vendedor_col]
                .fillna("")
                .astype(str)
                .str.strip()
                .replace("", "Sem vendedora")
                .str.title()
            )

            df_vendedor = (
                df_vendedor.groupby("_VendedoraPainel")
                .size()
                .reset_index(name="Total")
                .rename(columns={"_VendedoraPainel": "Vendedora"})
                .sort_values("Total", ascending=False)
            )
        else:
            df_vendedor = pd.DataFrame({"Vendedora": ["Sem vendedora"], "Total": [len(f_mes)]})

        fig = px.bar(
            df_vendedor,
            x="Vendedora",
            y="Total",
            text="Total",
            color="Vendedora",
            color_discrete_sequence=[NAVY, WINE, NAVY_2, WINE_2, "#334155", "#94a3b8"],
        )
        fig.update_traces(
            textposition="outside",
            cliponaxis=False,
            marker_line_width=0,
        )
        fig.update_layout(
            showlegend=False,
            bargap=0.35,
            height=300,
            margin=dict(l=20, r=20, t=10, b=70),
            xaxis_type="category",
        )
        fig.update_xaxes(
            type="category",
            tickangle=-35,
            tickfont=dict(size=10),
            title_text="Vendedora",
        )
        st.plotly_chart(tune_plotly(fig, height=300), use_container_width=True, key="chart_vendedor")
        st.markdown("</div></div>", unsafe_allow_html=True)

    g3, g4 = st.columns(2)

    with g3:
        st.markdown(
            """
            <div class="panel-card">
                <div class="panel-head"><div class="panel-title">🐶 Raças mais vendidas (mês)</div></div>
                <div class="panel-body">
            """,
            unsafe_allow_html=True
        )

        if "Raça" in f_mes.columns and len(f_mes) > 0:
            df_racas = (
                f_mes.groupby("Raça")
                .size()
                .reset_index(name="Total")
                .sort_values("Total", ascending=False)
                .head(10)
            )
            fig = px.bar(
                df_racas,
                x="Raça",
                y="Total",
                text="Total",
                color="Raça",
                color_discrete_sequence=[NAVY, WINE, NAVY_2, WINE_2, "#334155", "#94a3b8"],
            )
            fig.update_traces(textposition="outside", cliponaxis=False)
            fig.update_layout(showlegend=False)
            st.plotly_chart(tune_plotly(fig, height=360), use_container_width=True, key="chart_racas")
        else:
            st.info("Sem registros para montar o gráfico de raças.")

        st.markdown("</div></div>", unsafe_allow_html=True)

    with g4:
        st.markdown(
            """
            <div class="panel-card">
                <div class="panel-head">
                    <div>
                        <div class="panel-title">📈 Faturamento total do ano</div>
                        <div class="panel-subtitle">Mensal conforme crescimento da planilha</div>
                    </div>
                </div>
                <div class="panel-body">
            """,
            unsafe_allow_html=True
        )

        df_fat_ano = f_all.copy()

        valor_ano_col = pick_first_existing(
            df_fat_ano,
            [
                "Valor Filhote",
                "Valor filhote",
                "Valor de filhote",
                "Valor do filhote",
                "Valor",
                "Valor Pet",
                "Preço",
                "Preco",
            ],
        )

        if valor_ano_col and valor_ano_col in df_fat_ano.columns:
            df_fat_ano["_ValorFaturamento"] = df_fat_ano[valor_ano_col].apply(brl_to_float)
        else:
            df_fat_ano["_ValorFaturamento"] = 0.0

        if "Mês" in df_fat_ano.columns:
            df_fat_ano["_MesFaturamento"] = (
                df_fat_ano["Mês"]
                .fillna("")
                .astype(str)
                .str.strip()
            )
        else:
            data_fat_col = pick_first_existing(
                df_fat_ano,
                ["Data Compra", "Data da compra", "Data Venda", "Data da venda", "Data"],
            )

            if data_fat_col and data_fat_col in df_fat_ano.columns:
                datas_fat = pd.to_datetime(df_fat_ano[data_fat_col], errors="coerce", dayfirst=True)
                df_fat_ano["_MesFaturamento"] = datas_fat.dt.strftime("%m/%Y").fillna("")
            else:
                df_fat_ano["_MesFaturamento"] = str(mes)

        df_fat_ano = df_fat_ano[df_fat_ano["_MesFaturamento"].astype(str).str.strip() != ""]

        ordem_meses = {
            "01": "Jan",
            "02": "Fev",
            "03": "Mar",
            "04": "Abr",
            "05": "Mai",
            "06": "Jun",
            "07": "Jul",
            "08": "Ago",
            "09": "Set",
            "10": "Out",
            "11": "Nov",
            "12": "Dez",
        }

        if len(df_fat_ano) > 0:
            df_fat_ano["_MesNumero"] = (
                df_fat_ano["_MesFaturamento"]
                .astype(str)
                .str.extract(r"(\d{1,2})")[0]
                .fillna("0")
                .str.zfill(2)
            )

            df_faturamento_mes = (
                df_fat_ano
                .groupby("_MesNumero", dropna=False)["_ValorFaturamento"]
                .sum()
                .reset_index()
                .rename(columns={"_ValorFaturamento": "Valor"})
            )

            df_faturamento_mes = df_faturamento_mes[df_faturamento_mes["_MesNumero"].isin(ordem_meses.keys())]
            df_faturamento_mes["Mês"] = df_faturamento_mes["_MesNumero"].map(ordem_meses)
            df_faturamento_mes["Valor formatado"] = df_faturamento_mes["Valor"].apply(money_br)
            df_faturamento_mes = df_faturamento_mes.sort_values("_MesNumero")
        else:
            df_faturamento_mes = pd.DataFrame(
                {
                    "_MesNumero": ["01"],
                    "Mês": ["Jan"],
                    "Valor": [0.0],
                    "Valor formatado": [money_br(0)],
                }
            )

        fig = px.bar(
            df_faturamento_mes,
            x="Mês",
            y="Valor",
            text="Valor formatado",
            color_discrete_sequence=[NAVY],
        )

        fig.update_traces(
            textposition="outside",
            cliponaxis=False,
            marker_line_width=0,
        )

        fig.update_layout(
            showlegend=False,
            bargap=0.35,
            height=310,
            margin=dict(l=20, r=20, t=10, b=40),
            xaxis_type="category",
        )

        fig.update_xaxes(title_text="Mês", type="category")
        fig.update_yaxes(title_text="Valor")

        st.plotly_chart(tune_plotly(fig, height=310), use_container_width=True, key="chart_faturamento_ano")
        st.markdown("</div></div>", unsafe_allow_html=True)


# ============================================================
# PÁGINA: FORMULÁRIO
# ============================================================

def render_section(title, icon):
    st.markdown(
        f"""
        <div class="section-title">
            <div class="section-icon">{icon}</div>
            <h2>{title}</h2>
        </div>
        """,
        unsafe_allow_html=True
    )


def render_formulario():
    inject_css()

    top_menu, top_title, top_sair = st.columns([0.55, 7, 1.25])

    with top_menu:
        render_menu()

    with top_title:
        st.markdown(
            f"""
            <div style="display:flex;align-items:center;gap:28px;">
                <div style="width:160px;border-right:1px solid rgba(27,29,109,0.22);padding-right:24px;">
                    {logo_html(115)}
                </div>
                <div>
                    <div class="form-page-title">Novo Contrato</div>
                    <div class="form-page-sub">Preencha todos os dados do comprador, filhote e venda.</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True
        )

    with top_sair:
        render_logout()

    st.markdown('<div class="form-card">', unsafe_allow_html=True)

    with st.container():
        render_section("Dados do comprador", "👤")

        c1, c2 = st.columns(2)

        with c1:
            nome = st.text_input("Nome do comprador", placeholder="Digite o nome completo")
            endereco = st.text_input("Endereço do comprador", placeholder="Rua, número, complemento")
            numero = st.text_input("Nº da residência", placeholder="Ex: 123")
            complemento = st.text_input("Complemento da residência", placeholder="Casa, apto, bloco, condomínio")
            cep = st.text_input("CEP do comprador", placeholder="00000-000")
            estado = st.selectbox(
                "Estado de moradia",
                ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
                 "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
                 "SP", "SE", "TO"],
                index=None,
                placeholder="Selecione o estado"
            )

        with c2:
            email = st.text_input("E-mail do comprador", placeholder="email@exemplo.com")
            cpf = st.text_input("CPF do comprador", placeholder="000.000.000-00")
            telefone = st.text_input("Contato do comprador (WhatsApp)", placeholder="(00) 00000-0000")
            rg = st.text_input("RG do comprador", placeholder="00.000.000-0")
            cidade_opcao = st.selectbox(
                "Cidade do comprador",
                ["Campinas", "Indaiatuba", "Piracicaba", "Outro"],
                index=None,
                placeholder="Selecione a cidade"
            )
            cidade_outro = ""
            if cidade_opcao == "Outro":
                cidade_outro = st.text_input("Digite a cidade do comprador", placeholder="Digite a cidade")
            cidade = cidade_outro if cidade_opcao == "Outro" else (cidade_opcao or "")

        st.markdown('<div style="height:18px;"></div>', unsafe_allow_html=True)

        render_section("Dados do filhote", "🐾")

        c3, c4 = st.columns(2)

        with c3:
            nome_animal = st.text_input("Novo nome do animal", placeholder="Nome do animal")
            especie = st.radio("Espécie do animal", ["CANINA", "FELINA"], horizontal=True, index=None)

            raca = ""
            if especie == "CANINA":
                raca_opcao = st.selectbox(
                    "Raça do animal",
                    [
                        "Spitz Alemão",
                        "Shih Tzu",
                        "Maltês",
                        "Teckel",
                        "Dachshund",
                        "Lulu da Pomerânia",
                        "Yorkshire",
                        "Bulldogue",
                        "Bulldogue Francês",
                        "Pug",
                        "Biewer Terrier",
                        "Chihuahua",
                        "Outro",
                    ],
                    index=None,
                    placeholder="Selecione a raça"
                )

                if raca_opcao == "Outro":
                    raca_outro = st.text_input("Digite a raça do animal", placeholder="Digite a raça")
                    raca = raca_outro
                else:
                    raca = raca_opcao or ""

            elif especie == "FELINA":
                raca_opcao = st.selectbox(
                    "Raça do animal",
                    [
                        "Persa",
                        "Maine Coon",
                        "British Shorthair",
                        "Outro",
                    ],
                    index=None,
                    placeholder="Selecione a raça"
                )

                if raca_opcao == "Outro":
                    raca_outro = st.text_input("Digite a raça do animal", placeholder="Digite a raça")
                    raca = raca_outro
                else:
                    raca = raca_opcao or ""
            else:
                st.info("Selecione a espécie do animal para escolher a raça.")

            microchip = st.text_input("Nº do microchip", placeholder="Ex: 990000012345678")
            nascimento = st.date_input(
                "Data de nascimento do filhote",
                value=None,
                format="DD/MM/YYYY",
            )

        with c4:
            sexo = st.radio("Sexo do filhote", ["FÊMEA", "MACHO"], horizontal=True, index=None)
            pelagem = st.radio("Tipo de pelagem do animal", ["CURTA", "LONGA"], horizontal=True, index=None)
            observacoes = st.text_input("Raça diferente da listagem ou observações", placeholder="Observações, se houver")
            data_compra = st.date_input(
                "Data da compra",
                value=datetime.datetime.now(TZ).date(),
                format="DD/MM/YYYY",
            )
            cor = st.text_input("Cor do animal", placeholder="Ex: branco com manchas pretas")

        st.markdown('<div style="height:18px;"></div>', unsafe_allow_html=True)

        render_section("Dados da venda", "🛒")

        c5, c6 = st.columns(2)

        with c5:
            valor_filhote = st.text_input("Valor do filhote", placeholder="Ex: 4500,00")
            valor_extenso = st.text_input("Valor por extenso da venda", placeholder="Ex: cinco mil reais")
            forma_pagamento = st.text_input("Forma de pagamento", placeholder="Ex: pix")
            parcelas = st.text_input("Quantidade de parcelas", placeholder="Ex: 3 vezes")

        with c6:
            vendedora = st.text_input("Vendedora", placeholder="Nome da vendedora")
            mes = st.text_input("Mês", value=month_key_from_date(data_compra), placeholder="Ex: 06/2026")
            unidade = st.text_input("Unidade", placeholder="Ex: Campinas")

        st.markdown('<div style="height:14px;"></div>', unsafe_allow_html=True)

        salvar = st.button("💾 Salvar Contrato", use_container_width=True, key="btn_salvar_contrato")

    if salvar:
        contrato = {
            "Nome": nome,
            "Telefone": telefone,
            "CPF": cpf,
            "E-mail": email,
            "Data Compra": data_compra.strftime("%d/%m/%Y") if data_compra else "",
            "Mês": mes or month_key_from_date(data_compra),
            "Raça": raca,
            "Sexo": sexo,
            "Cor": cor,
            "Pelagem": pelagem,
            "Endereço": endereco,
            "Número": numero,
            "Complemento": complemento,
            "CEP": cep,
            "Estado": estado,
            "Cidade": cidade,
            "RG": rg,
            "Valor Filhote": valor_filhote,
            "Valor por extenso": valor_extenso,
            "Forma de pagamento": forma_pagamento,
            "Quantidade de parcelas": parcelas,
            "Vendedora": vendedora,
            "Nome do animal": nome_animal,
            "Espécie": especie,
            "Microchip": microchip,
            "Nascimento filhote": nascimento.strftime("%d/%m/%Y") if nascimento else "",
            "Observações": observacoes,
            "Data preenchimento": datetime.datetime.now(TZ).strftime("%d/%m/%Y %H:%M:%S"),
            "Unidade": unidade,
        }

        obrigatorios = {
            "Nome": nome,
            "Telefone": telefone,
            "CPF": cpf,
            "E-mail": email,
            "Raça": raca,
            "Sexo": sexo,
            "Cor": cor,
            "Pelagem": pelagem,
            "Data Compra": data_compra,
            "Valor Filhote": valor_filhote,
        }

        faltando = [campo for campo, valor in obrigatorios.items() if valor is None or str(valor).strip() == ""]

        if faltando:
            st.error("Preencha os campos obrigatórios: " + ", ".join(faltando))
        else:
            try:
                planilha, aba = save_contract_to_google_sheets(contrato)
                st.success("Contrato salvo com sucesso no Google Sheets.")
                st.info(f"Planilha: {planilha.title} • Aba: {aba.title}")

                pdf_bytes = gerar_pdf_contrato(contrato)
                nome_arquivo_pdf = f"contrato_{limpar_nome_arquivo(nome)}.pdf"
                disparar_download_pdf(pdf_bytes, nome_arquivo_pdf)
                st.success("PDF gerado e download iniciado automaticamente.")
            except Exception as e:
                st.error("Não foi possível salvar o contrato no Google Sheets.")
                st.exception(e)

    st.markdown("</div>", unsafe_allow_html=True)


# ============================================================
# PÁGINA: NOVA
# ============================================================

def render_nova_pagina():
    inject_css()

    top_menu, top_title, top_logo, top_sair = st.columns([0.55, 4.4, 1, 1.25])

    with top_menu:
        render_menu()

    with top_title:
        st.markdown(
            """
            <div class="page-title">🧩 Nova Página</div>
            <div class="page-caption">Essa área ficará pronta quando definirmos o nome e o objetivo.</div>
            """,
            unsafe_allow_html=True
        )

    with top_logo:
        st.markdown(f'<div class="center-logo">{logo_html(62)}</div>', unsafe_allow_html=True)

    with top_sair:
        render_logout()

    st.markdown(
        """
        <div class="placeholder-page">
            <h2 style="margin-top:0;color:#07142F;">Página em construção</h2>
            <p style="color:#475569;font-size:15px;">
                Aqui vamos adicionar a terceira página do painel assim que você decidir o nome e quais informações ela deve mostrar.
            </p>
        </div>
        """,
        unsafe_allow_html=True
    )


# ============================================================
# MAIN
# ============================================================

def main():
    if "page" not in st.session_state:
        st.session_state.page = "visao"

    try:
        page_param = st.query_params.get("page", None)
        auth_param = st.query_params.get("auth", None)

        if auth_param == "1":
            st.session_state.logged_in = True

        if page_param in ["visao", "formulario", "nova"]:
            st.session_state.page = page_param
    except Exception:
        pass

    if not ensure_login():
        st.stop()

    try:
        df = load_sheet_data()
    except Exception as e:
        inject_css()
        st.error("Erro ao carregar a planilha.")
        st.exception(e)
        st.stop()

    page = st.session_state.get("page", "visao")

    if page == "visao":
        render_visao_geral(df)
    elif page == "formulario":
        render_formulario()
    elif page == "nova":
        render_nova_pagina()
    else:
        st.session_state.page = "visao"
        st.rerun()


if __name__ == "__main__":
    main()