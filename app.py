import streamlit as st
import streamlit.components.v1 as components
import pandas as pd
import datetime
import plotly.express as px
import re
import time
import base64
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    import gspread
    from google.oauth2.service_account import Credentials
except Exception:
    gspread = None
    Credentials = None

st.set_page_config(
    page_title="Operação SkoobPet",
    layout="wide",
    initial_sidebar_state="collapsed"
)

NAVY = "#1B1D6D"
NAVY_2 = "#2E3192"
WINE = "#9B0033"
WINE_2 = "#C00040"
GRAY_TEXT = "#64748b"

OPER_USER = "skoob"
OPER_PASS = "skoob123"

FIN_USER = "diretoria"
FIN_PASS = "skoob1234"

SHEET_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "1Q0mLvOBxEGCojUITBLxCXRtpXVMAHE3ngvGsa2Cgf9Q"
    "/gviz/tq?tqx=out:csv&gid=1396326144"
)

CONTRATO_SHEET_ID = "1TTrjf0DZxWklacYTp7_vcRmTx2-8XrobIaPglflnyG8"

TZ = ZoneInfo("America/Sao_Paulo")
hoje = pd.Timestamp(datetime.datetime.now(TZ).date())

if "oper_logged_in" not in st.session_state:
    st.session_state.oper_logged_in = False

if "fin_logged_in" not in st.session_state:
    st.session_state.fin_logged_in = False

if "page" not in st.session_state:
    st.session_state.page = "operacao_dashboard" if st.session_state.oper_logged_in else "operacao_login"


def img_to_base64(path: str):
    try:
        file_path = Path(path)
        if file_path.exists():
            return base64.b64encode(file_path.read_bytes()).decode()
    except Exception:
        pass
    return None


def render_logo_html():
    logo_b64 = img_to_base64("skoobpet.png")
    if logo_b64:
        return f'<img src="data:image/png;base64,{logo_b64}" class="login-logo" alt="SkoobPet">'
    return '<div class="login-logo-fallback">🐾</div>'


def inject_global_css():
    st.markdown(
        """
        <style>
            .stApp {
                background: #D4D4D4;
            }

            header[data-testid="stHeader"] {
                background: transparent !important;
            }

            .block-container {
                padding-top: 0.35rem !important;
                padding-bottom: 1.6rem !important;
                padding-left: 1rem !important;
                padding-right: 1rem !important;
                max-width: 1240px !important;
            }

            .login-page-wrap {
                width: 100%;
                display: flex;
                align-items: flex-start;
                justify-content: center;
                padding-top: 18px;
                padding-bottom: 24px;
                font-family: Inter, system-ui, -apple-system, Segoe UI, Arial, sans-serif;
            }

            .login-shell {
                width: 100%;
                max-width: 820px;
                margin: 0 auto;
            }

            .login-brand {
                text-align: center;
                margin-bottom: 10px;
            }

            .logo-center {
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .login-logo {
                width: 90px;
                height: 90px;
                object-fit: cover;
                border-radius: 50%;
                display: inline-block;
            }

            .login-logo-fallback {
                width: 90px;
                height: 90px;
                border-radius: 50%;
                background: linear-gradient(135deg, #1B1D6D 0%, #9B0033 100%);
                color: white;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 40px;
            }

            .login-subtitle {
                margin-top: 10px;
                font-size: 16px;
                color: #334155;
                font-weight: 500;
                text-align: center;
            }

            .login-card {
                background: rgba(255,255,255,0.96);
                border: 1px solid rgba(15,23,42,0.06);
                border-radius: 22px;
                padding: 12px 20px 10px 20px;
                box-shadow: 0 14px 34px rgba(15, 23, 42, 0.10);
                margin-bottom: 2px;
            }

            .login-mini-title {
                font-size: 20px;
                font-weight: 900;
                text-align: center;
                color: #0f172a;
                margin-bottom: 2px;
                line-height: 1.1;
            }

            .login-mini-sub {
                text-align: center;
                font-size: 12px;
                color: #64748b;
                margin-bottom: 0;
                line-height: 1.2;
            }

            div[data-testid="stTextInput"] label p {
                font-size: 15px !important;
                font-weight: 800 !important;
                color: #0f172a !important;
            }

            div[data-testid="stTextInput"] input {
                background: #F8FAFC !important;
                border: 1px solid rgba(15,23,42,0.10) !important;
                border-radius: 14px !important;
                height: 48px !important;
                padding-left: 14px !important;
                color: #0f172a !important;
                font-size: 15px !important;
                box-shadow: none !important;
            }

            div[data-testid="stTextInput"] input:focus {
                border: 1px solid #1B1D6D !important;
                box-shadow: 0 0 0 3px rgba(27,29,109,0.08) !important;
            }

            div.stButton > button {
                width: 100%;
                height: 50px;
                margin-top: 8px;
                border: none !important;
                border-radius: 14px !important;
                background: linear-gradient(90deg, #1B1D6D 0%, #111827 100%) !important;
                color: #ffffff !important;
                font-size: 18px !important;
                font-weight: 900 !important;
                box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18) !important;
            }

            div.stButton > button:hover {
                transform: translateY(-1px);
                background: linear-gradient(90deg, #16185c 0%, #0f172a 100%) !important;
            }

            div.stButton > button:focus,
            div.stButton > button:active {
                outline: none !important;
                box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18) !important;
            }

            .login-footer {
                text-align: center;
                color: #94a3b8;
                font-size: 12px;
                margin-top: 10px;
            }


            /* CORREÇÃO REAL: rótulos e opções do formulário sempre visíveis */
            .novo-card div[data-testid="stWidgetLabel"],
            .novo-card div[data-testid="stWidgetLabel"] *,
            .novo-card div[data-testid="stMarkdownContainer"],
            .novo-card div[data-testid="stMarkdownContainer"] *,
            .novo-card label,
            .novo-card label *,
            .novo-card p,
            .novo-card span,
            .novo-card div[data-testid="stRadio"],
            .novo-card div[data-testid="stRadio"] *,
            .novo-card div[data-baseweb="radio"],
            .novo-card div[data-baseweb="radio"] * {
                color: #1B1D6D !important;
                -webkit-text-fill-color: #1B1D6D !important;
                opacity: 1 !important;
                visibility: visible !important;
                filter: none !important;
            }

            .novo-card div[data-testid="stRadio"] label {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                min-width: auto !important;
                height: auto !important;
                padding: 0 16px 0 0 !important;
                margin: 0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: flex-start !important;
                gap: 8px !important;
            }

            .novo-card div[data-testid="stRadio"] [role="radio"] {
                background: #ffffff !important;
                border: 2px solid #111827 !important;
                box-shadow: none !important;
            }

            .novo-card div[data-testid="stRadio"] [role="radio"][aria-checked="false"] svg,
            .novo-card div[data-testid="stRadio"] [role="radio"][aria-checked="false"] path {
                display: none !important;
            }

            div[data-testid="stPopover"] > button {
                height: 46px !important;
                width: 56px !important;
                min-width: 56px !important;
                border-radius: 14px !important;
                border: 1px solid rgba(15,23,42,0.08) !important;
                background: #ffffff !important;
                color: #1d1564 !important;
                font-size: 22px !important;
                font-weight: 900 !important;
                box-shadow: 0 8px 20px rgba(15,23,42,0.10) !important;
            }

            div[data-testid="stPopover"] > button:hover {
                background: #f8fafc !important;
                transform: translateY(-1px);
            }

            div[data-testid="stPopoverContent"] {
                border-radius: 18px !important;
                border: 1px solid rgba(15,23,42,0.08) !important;
                overflow: hidden !important;
                box-shadow: 0 20px 40px rgba(15,23,42,0.16) !important;
                background: #ffffff !important;
            }

            div[data-testid="stPopoverContent"] > div {
                background: #ffffff !important;
                padding: 16px !important;
            }

            .menu-title {
                font-size: 20px;
                font-weight: 900;
                color: #0f172a;
                margin-bottom: 2px;
            }

            .menu-sub {
                font-size: 13px;
                color: #64748b;
                margin-bottom: 12px;
            }

            .menu-divider {
                height: 1px;
                background: #e5e7eb;
                margin: 10px 0 12px 0;
            }

            .menu-help {
                margin-top: 12px;
                font-size: 11px;
                color: #94a3b8;
                text-align: center;
            }

            div[data-testid="stPopoverContent"] .stButton > button {
                width: 100% !important;
                height: 44px !important;
                margin-top: 8px !important;
                border-radius: 12px !important;
                border: none !important;
                background: linear-gradient(90deg, #1B1D6D 0%, #111827 100%) !important;
                color: #ffffff !important;
                font-size: 15px !important;
                font-weight: 700 !important;
                box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18) !important;
                text-decoration: none !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            }

            div[data-testid="stPopoverContent"] .stButton > button:hover {
                background: linear-gradient(90deg, #16185c 0%, #0f172a 100%) !important;
                color: #ffffff !important;
                border: none !important;
                transform: translateY(-1px);
            }

            .menu-link-btn {
                width: 100%;
                height: 44px;
                margin-top: 8px;
                border-radius: 12px;
                border: none;
                background: linear-gradient(90deg, #1B1D6D 0%, #111827 100%);
                color: #ffffff !important;
                font-size: 15px;
                font-weight: 500;
                box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
                text-decoration: none !important;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 14px;
                box-sizing: border-box;
            }

            .menu-link-btn:hover {
                background: linear-gradient(90deg, #16185c 0%, #0f172a 100%);
                color: #ffffff !important;
                text-decoration: none !important;
                transform: translateY(-1px);
            }

            .desktop-logo-wrap {
                display: flex;
                justify-content: center;
                align-items: center;
                margin-top: -58px;
                min-height: 68px;
                pointer-events: none;
            }

            .mobile-logo-wrap {
                display: none;
                justify-content: center;
                align-items: center;
                margin-top: 12px;
                margin-bottom: 16px;
                pointer-events: none;
            }

            .filter-logo-img {
                width: 72px;
                height: 72px;
                object-fit: contain;
                border-radius: 50%;
                background: #ffffff;
                padding: 6px;
                box-shadow: 0 10px 24px rgba(15,23,42,0.12);
                pointer-events: none;
            }

            .chart-head {
                background: #f5f5f5;
                border-radius: 18px;
                padding: 12px 18px;
                border: 1px solid rgba(15,23,42,0.04);
                box-shadow: 0 3px 10px rgba(15,23,42,0.04);
                margin-bottom: 8px;
            }

            .chart-title {
                font-weight: 900;
                color: #0f172a;
                font-size: 18px;
                line-height: 1.15;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .chart-subtitle {
                font-size: 13px;
                color: #64748b;
                margin-top: 4px;
                line-height: 1.2;
            }

            @media (max-width: 768px) {
                .block-container {
                    padding-left: 0.75rem !important;
                    padding-right: 0.75rem !important;
                }

                .desktop-logo-wrap {
                    display: none !important;
                    min-height: 0 !important;
                    height: 0 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }

                .mobile-logo-wrap {
                    display: flex !important;
                }

                .filter-logo-img {
                    width: 82px !important;
                    height: 82px !important;
                }

                div.stButton > button {
                    margin-top: 6px !important;
                }
            }
        </style>
        """,
        unsafe_allow_html=True
    )


def money_br(v):
    try:
        v = float(v)
    except Exception:
        v = 0.0
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def pick_first_existing(df, candidates):
    cols = {str(c).replace("\u00a0", " ").strip(): c for c in df.columns}
    for c in candidates:
        key = str(c).replace("\u00a0", " ").strip()
        if key in cols:
            return cols[key]
    return None


def norm(x):
    return str(x).strip().lower() if pd.notna(x) else ""


def is_error(status):
    s = norm(status)
    return ("erro" in s) or ("atras" in s) or ("pendenc" in s)


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


def kpi_card(title, value, subtitle, accent, value_color="#0f172a", value_size=38):
    html = f"""
    <div style="
        background:#ffffff;
        border-radius:16px;
        padding:16px;
        border-left:8px solid {accent};
        box-shadow:0 8px 20px rgba(15,23,42,.06);
        height:120px;
        font-family:Inter,Arial,sans-serif;
        box-sizing:border-box;
        overflow:hidden;
    ">
        <div style="font-size:14px;font-weight:900;color:#334155;">{title}</div>
        <div style="
            font-size:{value_size}px;
            font-weight:900;
            color:{value_color};
            line-height:1.05;
            margin-top:6px;
            max-width:100%;
            white-space:normal;
            word-break:keep-all;
            overflow-wrap:anywhere;
        ">
            {value}
        </div>
        <div style="font-size:12px;color:#64748b;margin-top:6px;">{subtitle}</div>
    </div>
    """
    components.html(html, height=130)


def summary_card(title, value, subtitle, accent, value_color="#0f172a"):
    html = f"""
    <div style="
        background:#ffffff;
        border-radius:18px;
        padding:18px 18px 16px 18px;
        border:1px solid rgba(15,23,42,0.08);
        box-shadow:0 10px 24px rgba(15,23,42,0.08);
        min-height:116px;
        position:relative;
        font-family:Inter,Arial,sans-serif;
        width:100%;
    ">
        <div style="
            position:absolute;
            left:0;
            top:12px;
            bottom:12px;
            width:8px;
            border-radius:8px;
            background:{accent};
        "></div>

        <div style="padding-left:18px;">
            <div style="
                font-size:15px;
                font-weight:900;
                color:#0f172a;
                line-height:1.2;
                margin-bottom:10px;
            ">
                {title}
            </div>

            <div style="
                font-size:42px;
                font-weight:900;
                color:{value_color};
                line-height:1;
                margin-bottom:10px;
            ">
                {value}
            </div>

            <div style="
                font-size:13px;
                color:#64748b;
                line-height:1.25;
            ">
                {subtitle}
            </div>
        </div>
    </div>
    """
    components.html(html, height=150)


def tune_plotly(fig, height=390):
    fig.update_layout(
        height=height,
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        margin=dict(t=8, b=52, l=10, r=10),
        font=dict(color="#0f172a"),
        showlegend=False,
        xaxis_title=None,
        yaxis_title=None,
        bargap=0.18,
    )
    fig.update_xaxes(
        showgrid=False,
        zeroline=False,
        tickfont=dict(size=12, color=GRAY_TEXT),
        title_font=dict(size=12, color=GRAY_TEXT)
    )
    fig.update_yaxes(
        showgrid=True,
        gridcolor="rgba(100,116,139,0.12)",
        zeroline=False,
        tickfont=dict(size=12, color=GRAY_TEXT),
        title_font=dict(size=12, color=GRAY_TEXT)
    )
    return fig


def build_named_bar(df_plot, x_col, y_col, height=390, tickangle=28):
    d = df_plot.copy()
    fig = px.bar(d, x=x_col, y=y_col)

    palette = [
        NAVY, WINE, NAVY_2, WINE_2, "#3B4A64", "#94A3B8",
        "#23267F", "#B00045", "#3A3F9F", "#C00040",
        "#42526E", "#A0AEC0"
    ]

    fig.update_traces(
        marker_color=palette[:len(d)],
        text=d[y_col],
        textposition="outside",
        cliponaxis=False,
        textfont=dict(size=12, color="#334155"),
        hovertemplate="<b>%{x}</b><br>Total: %{y}<extra></extra>"
    )

    fig.update_xaxes(tickangle=tickangle)
    fig.update_yaxes(title_text="Total")
    fig.update_xaxes(title_text=x_col)
    return tune_plotly(fig, height=height)


def build_money_bar(df_plot, x_col, y_col, height=390, tickangle=28):
    d = df_plot.copy()
    fig = px.bar(d, x=x_col, y=y_col)

    palette = [
        NAVY, WINE, NAVY_2, WINE_2, "#3B4A64", "#94A3B8",
        "#23267F", "#B00045", "#3A3F9F", "#C00040",
        "#42526E", "#A0AEC0"
    ]

    fig.update_traces(
        marker_color=palette[:len(d)],
        text=[money_br(v) for v in d[y_col]],
        textposition="outside",
        cliponaxis=False,
        textfont=dict(size=11, color="#334155"),
        hovertemplate="<b>%{x}</b><br>Faturamento: R$ %{y:,.2f}<extra></extra>"
    )

    fig.update_xaxes(tickangle=tickangle)
    fig.update_yaxes(title_text="Faturamento")
    fig.update_xaxes(title_text=x_col)
    return tune_plotly(fig, height=height)


def extract_year_from_month_key(month_key: str):
    s = str(month_key).strip()
    m = re.search(r"(\d{4})$", s)
    return m.group(1) if m else None


def extract_month_num_from_month_key(month_key: str):
    s = str(month_key).strip()

    m = re.match(r"^\s*(\d{1,2})\s*/\s*\d{4}\s*$", s)
    if m:
        mm = int(m.group(1))
        if 1 <= mm <= 12:
            return mm

    meses_pt = {
        "janeiro": 1, "fevereiro": 2, "marco": 3, "março": 3,
        "abril": 4, "maio": 5, "junho": 6, "julho": 7,
        "agosto": 8, "setembro": 9, "outubro": 10,
        "novembro": 11, "dezembro": 12,
    }

    s_low = s.lower()
    for nome, num in meses_pt.items():
        if nome in s_low:
            return num
    return None


def month_label_pt(month_num: int):
    labels = {
        1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr",
        5: "Mai", 6: "Jun", 7: "Jul", 8: "Ago",
        9: "Set", 10: "Out", 11: "Nov", 12: "Dez",
    }
    return labels.get(month_num, str(month_num))


def build_monthly_and_cumulative_chart(df_plot, height=420):
    d = df_plot.copy()
    fig = px.bar(d, x="Mês", y="Faturamento")

    fig.update_traces(
        marker_color=NAVY_2,
        text=[money_br(v) for v in d["Faturamento"]],
        textposition="outside",
        cliponaxis=False,
        textfont=dict(size=11, color="#334155"),
        hovertemplate="<b>%{x}</b><br>Faturamento do mês: %{text}<extra></extra>"
    )

    fig.update_layout(
        height=height,
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        margin=dict(t=8, b=52, l=10, r=10),
        font=dict(color="#0f172a"),
        bargap=0.22,
        showlegend=False
    )

    fig.update_xaxes(title_text="Mês", showgrid=False, zeroline=False, tickfont=dict(size=12, color=GRAY_TEXT))
    fig.update_yaxes(title_text="Valor", showgrid=True, gridcolor="rgba(100,116,139,0.12)", zeroline=False, tickfont=dict(size=12, color=GRAY_TEXT))
    return fig


def sheet_url_busted(base_url: str) -> str:
    sep = "&" if "?" in base_url else "?"
    return f"{base_url}{sep}_ts={int(time.time()*1000)}"


@st.cache_data(ttl=2, show_spinner=False)
def load_sheet(csv_url: str) -> pd.DataFrame:
    d = pd.read_csv(csv_url)
    d.columns = [str(c).replace("\u00a0", " ").strip() for c in d.columns]
    return d


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


def render_chart_header(title, emoji="📊", subtitle=None):
    subtitle_html = f'<div class="chart-subtitle">{subtitle}</div>' if subtitle else ""
    st.markdown(
        f"""
        <div class="chart-head">
            <div class="chart-title">{emoji} {title}</div>
            {subtitle_html}
        </div>
        """,
        unsafe_allow_html=True
    )


def render_logo_desktop():
    logo_b64 = img_to_base64("skoobpet.png")
    if logo_b64:
        st.markdown(
            f"""
            <div class="desktop-logo-wrap">
                <img src="data:image/png;base64,{logo_b64}" class="filter-logo-img">
            </div>
            """,
            unsafe_allow_html=True
        )


def render_logo_mobile():
    logo_b64 = img_to_base64("skoobpet.png")
    if logo_b64:
        st.markdown(
            f"""
            <div class="mobile-logo-wrap">
                <img src="data:image/png;base64,{logo_b64}" class="filter-logo-img">
            </div>
            """,
            unsafe_allow_html=True
        )


def render_oper_login():
    inject_global_css()
    logo_html = render_logo_html()

    st.markdown('<div class="login-page-wrap"><div class="login-shell">', unsafe_allow_html=True)
    st.markdown(
        f'''
        <div class="login-brand">
            <div class="logo-center">{logo_html}</div>
            <div class="login-subtitle">Área da operação • Acesso restrito</div>
        </div>
        ''',
        unsafe_allow_html=True
    )
    st.markdown(
        """
        <div class="login-card">
            <div class="login-mini-title">Login da Operação</div>
            <div class="login-mini-sub">Digite o usuário e senha da equipe operacional</div>
        </div>
        """,
        unsafe_allow_html=True
    )

    user = st.text_input("Usuário", placeholder="Digite seu usuário", key="oper_login_user")
    pwd = st.text_input("Senha", type="password", placeholder="Digite sua senha", key="oper_login_pass")
    entrar = st.button("Entrar na Operação", use_container_width=True, key="btn_oper_login")

    if entrar:
        if (user or "").strip() == OPER_USER and (pwd or "").strip() == OPER_PASS:
            st.session_state.oper_logged_in = True
            st.session_state.page = "operacao_dashboard"
            st.rerun()
        else:
            st.error("Usuário ou senha da operação inválidos.")

    st.markdown(
        """
        <div class="login-footer">Acesso interno da operação • SkoobPet</div>
        </div></div>
        """,
        unsafe_allow_html=True
    )


def render_fin_login():
    inject_global_css()
    logo_html = render_logo_html()

    st.markdown('<div class="login-page-wrap"><div class="login-shell">', unsafe_allow_html=True)
    st.markdown(
        f'''
        <div class="login-brand">
            <div class="logo-center">{logo_html}</div>
            <div class="login-subtitle">Área financeira • Acesso restrito</div>
        </div>
        ''',
        unsafe_allow_html=True
    )
    st.markdown(
        """
        <div class="login-card">
            <div class="login-mini-title">Login do Financeiro</div>
            <div class="login-mini-sub">Digite o usuário e senha da diretoria</div>
        </div>
        """,
        unsafe_allow_html=True
    )

    user = st.text_input("Usuário", placeholder="Digite seu usuário", key="fin_login_user")
    pwd = st.text_input("Senha", type="password", placeholder="Digite sua senha", key="fin_login_pass")

    c1, c2 = st.columns(2)
    with c1:
        entrar = st.button("Entrar no Financeiro", use_container_width=True, key="btn_fin_login")
    with c2:
        voltar = st.button("Voltar à Operação", use_container_width=True, key="btn_fin_back")

    if entrar:
        if (user or "").strip() == FIN_USER and (pwd or "").strip() == FIN_PASS:
            st.session_state.fin_logged_in = True
            st.session_state.page = "financeiro_dashboard"
            st.rerun()
        else:
            st.error("Usuário ou senha do financeiro inválidos.")

    if voltar:
        st.session_state.page = "operacao_dashboard"
        st.rerun()

    st.markdown(
        """
        <div class="login-footer">Acesso interno da diretoria • SkoobPet</div>
        </div></div>
        """,
        unsafe_allow_html=True
    )


def count_today_all(df_base, date_col):
    if date_col not in df_base.columns:
        return 0
    sub = df_base[df_base[date_col].dt.date == hoje.date()]
    return int(len(sub))


def count_month_all(df_base, date_col, selected_month_key):
    if date_col not in df_base.columns:
        return 0
    d = df_base.copy()
    series = d[date_col]
    if not series.notna().any():
        return 0
    month_key = series.dt.strftime("%m/%Y")
    return int((month_key == str(selected_month_key)).sum())


def render_oper_dashboard(df: pd.DataFrame):
    COL = {
        "mes": "Mês",
        "unidade": "Unidade",
        "raca": "Raça",
        "c1": "1º contato",
        "c2": "2º contato",
        "c3": "3º contato",
        "s1": "Status 1º contato",
        "s2": "Status 2º contato",
        "s3": "Status 3º contato",
    }

    COL_VENDEDOR = pick_first_existing(df, ["Vendedora", "Vendedor", "Atendente"])

    for key in ["c1", "c2", "c3"]:
        colname = COL.get(key)
        if colname and colname in df.columns:
            df[colname] = parse_date_series(df[colname])

    top_menu, top_left, top_space, top_right = st.columns([1, 5, 3, 1.2])

    with top_menu:
        with st.popover("☰"):
            st.markdown('<div class="menu-title">Menu</div>', unsafe_allow_html=True)
            st.markdown('<div class="menu-sub">Escolha uma área para acessar</div>', unsafe_allow_html=True)
            st.markdown('<div class="menu-divider"></div>', unsafe_allow_html=True)

            if st.button("📄  Novo Contrato", use_container_width=True, key="menu_novo_contrato_oper"):
                st.session_state.page = "novo_contrato"
                st.rerun()

            if st.button("💰  Financeiro", use_container_width=True, key="menu_financeiro"):
                st.session_state.page = "financeiro_login"
                st.rerun()

            st.markdown('<div class="menu-help">Painel interno • SkoobPet</div>', unsafe_allow_html=True)

    with top_left:
        st.markdown("## ⚙️ Operação")
        st.caption(f"Total de registros: **{len(df)}**")

    with top_space:
        st.empty()

    with top_right:
        if st.button("Sair", use_container_width=True, key="btn_logout_oper"):
            st.session_state.oper_logged_in = False
            st.session_state.fin_logged_in = False
            st.session_state.page = "operacao_login"
            st.rerun()

    render_logo_mobile()

    f1, f_logo, f2 = st.columns([6, 1.1, 6])

    with f1:
        meses = sorted(df[COL["mes"]].dropna().astype(str).unique())
        mes = st.selectbox("Mês", meses, index=len(meses)-1 if len(meses) else 0, key="oper_mes")

    with f_logo:
        render_logo_desktop()

    with f2:
        unidades = ["Todas"] + sorted(df[COL["unidade"]].dropna().astype(str).unique().tolist())
        unidade = st.selectbox("Unidade", unidades, key="oper_unidade")

    f_all = df.copy()
    if unidade != "Todas":
        f_all = f_all[f_all[COL["unidade"]].astype(str) == str(unidade)]

    f_mes = df[df[COL["mes"]].astype(str) == str(mes)].copy()
    if unidade != "Todas":
        f_mes = f_mes[f_mes[COL["unidade"]].astype(str) == str(unidade)]

    primeiro_hoje = count_today_all(f_all, COL["c1"])
    segundo_hoje = count_today_all(f_all, COL["c2"])
    terceiro_hoje = count_today_all(f_all, COL["c3"])

    primeiro_mes = count_month_all(f_all, COL["c1"], mes)
    segundo_mes = count_month_all(f_all, COL["c2"], mes)
    terceiro_mes = count_month_all(f_all, COL["c3"], mes)

    vendas_mes_oper = int(len(f_mes))

    erro_mes_oper = 0
    for _, row in f_mes.iterrows():
        for sc in [COL["s1"], COL["s2"], COL["s3"]]:
            if sc in f_mes.columns and is_error(row.get(sc)):
                erro_mes_oper += 1

    st.markdown("---")
    k1, k2, k3, k4, k5, k6 = st.columns(6)

    with k1:
        kpi_card("💬 1º contato hoje", primeiro_hoje, "registros de hoje", NAVY)
    with k2:
        kpi_card("💬 2º contato hoje", segundo_hoje, "registros de hoje", NAVY_2)
    with k3:
        kpi_card("💬 3º contato hoje", terceiro_hoje, "registros de hoje", WINE_2)
    with k4:
        kpi_card("🧾 Primeiro Contato Mês", primeiro_mes, str(mes), NAVY, value_size=30)
    with k5:
        kpi_card("🧾 Segundo Contato Mês", segundo_mes, str(mes), WINE, value_size=30)
    with k6:
        kpi_card("🧾 Terceiro Contato Mês", terceiro_mes, str(mes), WINE_2, value_size=30)

    st.markdown("---")

    c_res1, c_res2 = st.columns(2)
    with c_res1:
        summary_card(
            "Status com erro",
            erro_mes_oper,
            f"Mês selecionado: {mes}",
            "#ef4444",
            value_color="#ef4444" if erro_mes_oper else "#0f172a"
        )
    with c_res2:
        summary_card(
            "Vendas registradas no mês",
            vendas_mes_oper,
            f"Mês Venda: {mes}",
            WINE
        )

    st.markdown("---")
    g1, g2 = st.columns(2)
    g3, g4 = st.columns(2)

    with g1:
        render_chart_header("Contatos por mês", "📞", "Distribuição mensal dos 3 contatos")
        df_contatos = pd.DataFrame({
            "Contato": ["1º contato", "2º contato", "3º contato"],
            "Total": [primeiro_mes, segundo_mes, terceiro_mes]
        })
        fig = build_named_bar(df_contatos, "Contato", "Total", height=360, tickangle=0)
        st.plotly_chart(fig, use_container_width=True, key="oper_contatos_mes")

    with g2:
        render_chart_header(
            "Vendas por unidade no mês",
            "🏬",
            "Quantidade de vendas registradas por unidade no mês selecionado"
        )

        vu = (
            f_mes.groupby(COL["unidade"])
            .size()
            .reset_index(name="Total")
            .sort_values("Total", ascending=False)
        )

        if len(vu) == 0:
            st.info("Sem registros para o filtro selecionado.")
        else:
            fig = build_named_bar(vu, COL["unidade"], "Total", height=360, tickangle=18)
            st.plotly_chart(fig, use_container_width=True, key="oper_vendas_unidade")

    with g3:
        render_chart_header("Raças mais vendidas (mês)", "🐶", "Top 10 raças do mês filtrado")

        vr = (
            f_mes.groupby(COL["raca"])
            .size()
            .reset_index(name="Total")
            .sort_values("Total", ascending=False)
            .head(10)
        )

        if len(vr) == 0:
            st.info("Sem registros para o filtro selecionado.")
        else:
            fig = build_named_bar(vr, COL["raca"], "Total", height=390, tickangle=28)
            st.plotly_chart(fig, use_container_width=True, key="oper_racas_vendidas")

    with g4:
        render_chart_header("Vendas por vendedora (mês)", "🏆", "Todas as vendas do mês, incluindo sem nome")

        if COL_VENDEDOR and COL_VENDEDOR in f_mes.columns:
            f_vend = f_mes.copy()

            f_vend[COL_VENDEDOR] = (
                f_vend[COL_VENDEDOR]
                .fillna("Sem vendedora")
                .astype(str)
                .str.strip()
            )

            f_vend[COL_VENDEDOR] = f_vend[COL_VENDEDOR].replace(
                {"": "Sem vendedora", "nan": "Sem vendedora", "None": "Sem vendedora"}
            )

            vv = (
                f_vend.groupby(COL_VENDEDOR, dropna=False)
                .size()
                .reset_index(name="Total")
                .sort_values("Total", ascending=False)
            )

            if len(vv) == 0:
                st.info("Sem registros para o filtro selecionado.")
            else:
                fig = build_named_bar(vv, COL_VENDEDOR, "Total", height=390, tickangle=28)
                st.plotly_chart(fig, use_container_width=True, key="oper_vendedoras")
        else:
            st.info("Coluna de vendedor/vendedora não encontrada.")


def _contract_label(campo, texto):
    return texto


def _get_google_worksheet():
    if gspread is None or Credentials is None:
        raise RuntimeError("Bibliotecas não instaladas. Adicione gspread e google-auth no requirements.txt.")

    if "gcp_service_account" not in st.secrets:
        raise RuntimeError("Credenciais não encontradas. Configure o Secrets do Streamlit com [gcp_service_account].")

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]

    creds = Credentials.from_service_account_info(
        st.secrets["gcp_service_account"],
        scopes=scopes
    )
    client = gspread.authorize(creds)

    st.write("Service account usada:", st.secrets["gcp_service_account"]["client_email"])
    st.write("ID da planilha:", CONTRATO_SHEET_ID)

    planilha = client.open_by_key(CONTRATO_SHEET_ID)
    return planilha.sheet1


def _append_contract_to_sheet(payload: dict):
    ws = _get_google_worksheet()

    linha = [
        payload.get("nome_comprador", ""),
        payload.get("whatsapp", ""),
        payload.get("cpf", ""),
        payload.get("email", ""),
        payload.get("data_hoje", ""),
        payload.get("mes", ""),
        payload.get("raca", ""),
        payload.get("sexo", ""),
        payload.get("cor", ""),
        payload.get("pelagem", ""),
        payload.get("data_nasc", ""),
        payload.get("nome_animal", ""),
        payload.get("unidade", "CAMPINAS"),
        payload.get("valor_filhote", ""),
        payload.get("vendedora", ""),
        payload.get("endereco", ""),
        payload.get("numero_residencia", ""),
        payload.get("complemento", ""),
        payload.get("bairro", ""),
        payload.get("cep", ""),
        payload.get("estado", ""),
        payload.get("cidade", ""),
        payload.get("rg", ""),
        payload.get("forma_pagamento", ""),
        payload.get("parcelas", ""),
        payload.get("valor_extenso", ""),
        payload.get("microchip", ""),
        payload.get("especie", ""),
        payload.get("observacoes", ""),
    ]

    ws.append_row(linha, value_input_option="USER_ENTERED")


def render_novo_contrato():
    st.markdown(
        """
        <style>
            .stApp {
                background: #ffffff !important;
            }

            header[data-testid="stHeader"] {
                background: transparent !important;
            }

            .block-container {
                max-width: 1220px !important;
                padding-top: 18px !important;
                padding-left: 18px !important;
                padding-right: 18px !important;
                padding-bottom: 38px !important;
            }

            .novo-header-wrap {
                display: flex;
                align-items: center;
                gap: 26px;
                min-height: 88px;
                margin-bottom: 28px;
            }

            .novo-logo-box {
                width: 170px;
                height: 86px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding-right: 24px;
                border-right: 1px solid rgba(27,29,109,0.22);
                overflow: hidden !important;
                background: transparent !important;
                border-radius: 0 !important;
                box-shadow: none !important;
            }

            .novo-logo-box img,
            .novo-logo-img {
                width: 150px !important;
                height: 74px !important;
                max-width: 150px !important;
                max-height: 74px !important;
                object-fit: cover !important;
                object-position: center center !important;
                border-radius: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
                display: block !important;
            }

            .novo-logo-fallback {
                color: #1B1D6D;
                font-size: 28px;
                font-weight: 950;
                font-style: italic;
                line-height: 1;
            }

            .novo-logo-fallback span {
                color: #1B1D6D;
            }

            .novo-title h1 {
                color: #1B1D6D;
                font-size: 36px;
                font-weight: 950;
                line-height: 1.05;
                margin: 0;
                letter-spacing: -0.6px;
            }

            .novo-title p {
                color: #64748b;
                font-size: 14px;
                margin: 10px 0 0 0;
                font-weight: 500;
            }

            .novo-card {
                background: #ffffff;
                border: 1px solid rgba(27,29,109,0.08);
                border-radius: 20px;
                padding: 28px 28px 26px 28px;
                box-shadow: 0 12px 34px rgba(15,23,42,0.12);
                margin-top: 4px;
            }

            .novo-section-title {
                display: flex;
                align-items: center;
                gap: 14px;
                border-bottom: 2px solid #B00045;
                padding-bottom: 11px;
                margin: 0 0 22px 0;
            }

            .novo-section-icon {
                width: 44px;
                height: 44px;
                min-width: 44px;
                border-radius: 50%;
                background: #1B1D6D;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 21px;
                font-weight: 900;
                box-shadow: 0 7px 18px rgba(27,29,109,.18);
            }

            .novo-section-title h2 {
                color: #1B1D6D;
                font-size: 26px;
                font-weight: 950;
                margin: 0;
                letter-spacing: -0.4px;
                line-height: 1;
            }

            .novo-section-space {
                height: 24px;
            }

            .novo-card div[data-testid="stTextInput"],
            .novo-card div[data-testid="stSelectbox"],
            .novo-card div[data-testid="stRadio"],
            .novo-card div[data-testid="stDateInput"] {
                margin-bottom: 13px !important;
            }

            .novo-card div[data-testid="stTextInput"] label,
            .novo-card div[data-testid="stSelectbox"] label,
            .novo-card div[data-testid="stRadio"] label,
            .novo-card div[data-testid="stDateInput"] label,
            .novo-card div[data-testid="stTextInput"] label *,
            .novo-card div[data-testid="stSelectbox"] label *,
            .novo-card div[data-testid="stRadio"] label *,
            .novo-card div[data-testid="stDateInput"] label *,
            .novo-card div[data-testid="stTextInput"] label p,
            .novo-card div[data-testid="stSelectbox"] label p,
            .novo-card div[data-testid="stRadio"] label p,
            .novo-card div[data-testid="stDateInput"] label p {
                color: #1B1D6D !important;
                font-size: 12.5px !important;
                font-weight: 950 !important;
                line-height: 1.15 !important;
                margin-bottom: 5px !important;
            }

            .novo-card div[data-testid="stTextInput"] input,
            .novo-card div[data-testid="stDateInput"] input {
                height: 52px !important;
                border-radius: 11px !important;
                border: 1.5px solid rgba(27,29,109,.56) !important;
                background: #ffffff !important;
                color: #1B1D6D !important;
                font-size: 15px !important;
                padding-left: 16px !important;
                box-shadow: none !important;
            }

            .novo-card div[data-testid="stTextInput"] input::placeholder,
            .novo-card div[data-testid="stDateInput"] input::placeholder {
                color: #71809F !important;
                opacity: 1 !important;
            }

            .novo-card div[data-testid="stTextInput"] input:focus,
            .novo-card div[data-testid="stDateInput"] input:focus {
                border: 2px solid #1B1D6D !important;
                box-shadow: 0 0 0 3px rgba(27,29,109,.08) !important;
            }

            .novo-card div[data-baseweb="select"] > div {
                min-height: 52px !important;
                height: 52px !important;
                border-radius: 11px !important;
                border: 1.5px solid rgba(27,29,109,.56) !important;
                background: #ffffff !important;
                color: #1B1D6D !important;
                box-shadow: none !important;
            }

            .novo-card div[data-baseweb="select"] span {
                color: #71809F !important;
                font-size: 15px !important;
            }

            .novo-card div[data-testid="stRadio"] > div {
                flex-direction: row !important;
                gap: 14px !important;
                align-items: center !important;
            }

            .novo-card div[data-testid="stRadio"] label {
                min-width: 120px !important;
                height: 44px !important;
                border: 1.5px solid rgba(27,29,109,.56) !important;
                border-radius: 10px !important;
                padding: 8px 16px !important;
                background: #ffffff !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 9px !important;
                margin: 0 !important;
            }

            .novo-card div[data-testid="stRadio"] label p {
                color: #1B1D6D !important;
                margin: 0 !important;
                font-size: 13px !important;
                font-weight: 900 !important;
            }

            div[data-testid="stPopover"] > button {
                background: #111827 !important;
                color: #ffffff !important;
                border: none !important;
                border-radius: 9px !important;
                width: 58px !important;
                height: 48px !important;
                min-width: 58px !important;
                box-shadow: 0 8px 18px rgba(17,24,39,.16) !important;
            }

            .novo-sair button {
                background: #1B1D6D !important;
            }

            .novo-save-button div.stButton > button {
                height: 52px !important;
                border-radius: 12px !important;
                background: linear-gradient(90deg, #B00045 0%, #C00040 100%) !important;
                color: #ffffff !important;
                border: none !important;
                font-size: 16px !important;
                font-weight: 950 !important;
                box-shadow: 0 10px 22px rgba(176,0,69,.20) !important;
            }

            .novo-save-button div.stButton > button:hover {
                background: linear-gradient(90deg, #9B0033 0%, #B00045 100%) !important;
                transform: translateY(-1px);
            }

            @media (max-width: 768px) {
                .novo-header-wrap {
                    gap: 14px;
                    align-items: flex-start;
                }

                .novo-logo-box {
                    width: 92px !important;
                    height: 62px !important;
                    min-width: 92px !important;
                    max-width: 92px !important;
                    padding-right: 8px !important;
                    border-right: 1px solid rgba(27,29,109,0.18) !important;
                    overflow: hidden !important;
                    border-radius: 0 !important;
                    background: transparent !important;
                    box-shadow: none !important;
                }

                .novo-logo-box img,
                .novo-logo-img {
                    width: 84px !important;
                    height: 54px !important;
                    max-width: 84px !important;
                    max-height: 54px !important;
                    object-fit: cover !important;
                    object-position: center center !important;
                    border-radius: 0 !important;
                    background: transparent !important;
                    box-shadow: none !important;
                    display: block !important;
                }

                .novo-title h1 {
                    font-size: 28px;
                }

                .novo-card {
                    padding: 22px 16px;
                }
            }
        </style>
        """,
        unsafe_allow_html=True
    )

    def fmt_date(d):
        try:
            return d.strftime("%d/%m/%Y")
        except Exception:
            return str(d or "")

    logo_b64 = img_to_base64("skoobpet.png")
    logo_html = (
        f'<img src="data:image/png;base64,{logo_b64}" class="novo-logo-img" alt="SkoobPet">'
        if logo_b64
        else '<div class="novo-logo-fallback">Skoob<span>Pet</span></div>'
    )

    top_menu, top_title, top_sair = st.columns([0.8, 8.8, 1.3])

    with top_menu:
        with st.popover("☰⌄"):
            st.markdown('<div class="menu-title">Menu</div>', unsafe_allow_html=True)
            st.markdown('<div class="menu-sub">Escolha uma área para acessar</div>', unsafe_allow_html=True)
            st.markdown('<div class="menu-divider"></div>', unsafe_allow_html=True)

            if st.button("⚙️  Operação", use_container_width=True, key="novo_menu_operacao"):
                st.session_state.page = "operacao_dashboard"
                st.rerun()

            if st.button("💰  Financeiro", use_container_width=True, key="novo_menu_financeiro"):
                st.session_state.page = "financeiro_login"
                st.rerun()

            st.markdown('<div class="menu-help">Painel interno • SkoobPet</div>', unsafe_allow_html=True)

    with top_title:
        st.markdown(
            f"""
            <div class="novo-header-wrap">
                <div class="novo-logo-box">{logo_html}</div>
                <div class="novo-title">
                    <h1>Novo Contrato</h1>
                    <p>Preencha todos os dados do comprador, filhote e venda.</p>
                </div>
            </div>
            """,
            unsafe_allow_html=True
        )

    with top_sair:
        st.markdown('<div class="novo-sair">', unsafe_allow_html=True)
        if st.button("↪ Sair", use_container_width=True, key="novo_sair"):
            st.session_state.oper_logged_in = False
            st.session_state.fin_logged_in = False
            st.session_state.page = "operacao_login"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown('<div class="novo-card">', unsafe_allow_html=True)

    # 1) DADOS DO COMPRADOR
    st.markdown(
        """
        <div class="novo-section-title">
            <div class="novo-section-icon">👤</div>
            <h2>Dados do comprador</h2>
        </div>
        """,
        unsafe_allow_html=True
    )

    c1, c2 = st.columns(2, gap="large")
    with c1:
        nome_comprador = st.text_input(_contract_label(9, "Nome do comprador"), placeholder="Digite o nome completo", key="contrato_nome_comprador")
        endereco = st.text_input(_contract_label(6, "Endereço do comprador"), placeholder="Rua, número, complemento", key="contrato_endereco")
        numero_residencia = st.text_input(_contract_label(19, "Insira o n° da residência"), placeholder="Ex: 123", key="contrato_numero_residencia")
        complemento = st.text_input(_contract_label(3, "Insira o complemento da residência (casa-ap-bloco-cond)"), placeholder="Ex: Casa, Apto 101, Bloco B, Condomínio", key="contrato_complemento")
        bairro = st.text_input(_contract_label(13, "Bairro do comprador"), placeholder="Bairro", key="contrato_bairro")
        cep = st.text_input(_contract_label(20, "Insira o CEP do comprador"), placeholder="00000-000", key="contrato_cep")
        estado = st.selectbox(
            _contract_label(28, "Insira o estado de moradia"),
            ["Selecione um estado", "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"],
            key="contrato_estado"
        )
    with c2:
        email = st.text_input(_contract_label(23, "Insira o e-mail do comprador"), placeholder="email@exemplo.com", key="contrato_email")
        cpf = st.text_input(_contract_label(24, "Insira o CPF do comprador"), placeholder="000.000.000-00", key="contrato_cpf")
        whatsapp = st.text_input(_contract_label(25, "Insira o contato do comprador (WhatsApp)"), placeholder="(00) 00000-0000", key="contrato_whatsapp")
        rg = st.text_input(_contract_label(26, "Insira o RG do comprador"), placeholder="00.000.000-0", key="contrato_rg")
        cidade = st.selectbox(_contract_label(29, "Cidade do comprador"), ["Selecione a cidade", "Campinas", "Indaiatuba", "Piracicaba", "São Paulo", "Outra"], key="contrato_cidade")

    st.markdown('<div class="novo-section-space"></div>', unsafe_allow_html=True)

    # 2) DADOS DO FILHOTE
    st.markdown(
        """
        <div class="novo-section-title">
            <div class="novo-section-icon">🐾</div>
            <h2>Dados do filhote</h2>
        </div>
        """,
        unsafe_allow_html=True
    )

    f1, f2 = st.columns(2, gap="large")
    with f1:
        nome_animal = st.text_input(_contract_label(5, "Insira o novo nome do animal"), placeholder="Nome do animal", key="contrato_nome_animal")
        especie = st.radio(_contract_label(15, "Insira a espécie do animal (canina - felina)"), ["CANINA", "FELINA"], index=None, horizontal=True, key="contrato_especie")
        raca = st.selectbox(
            _contract_label(17, "Insira a raça do animal"),
            ["Selecione a raça", "SPITZ ALEMÃO", "YORKSHIRE", "CHIHUAHUA", "SHIH TZU", "BASSET", "BULLDOG", "BIEWER", "PUG", "TECKEL", "DACHSHUND", "MAINE COON", "MALTÊS", "PERSA", "OUTRO"],
            key="contrato_raca"
        )
        microchip = st.text_input(_contract_label(18, "Insira o n° do microchip"), placeholder="Ex: 990000012345678", key="contrato_microchip")
        data_nasc_dt = st.date_input(_contract_label(22, "Insira a data de nasc do filhote"), value=None, format="DD/MM/YYYY", key="contrato_data_nasc")
        data_nasc = fmt_date(data_nasc_dt) if data_nasc_dt else ""
    with f2:
        sexo = st.radio(_contract_label(14, "Insira o sexo do filhote"), ["FÊMEA", "MACHO"], index=None, horizontal=True, key="contrato_sexo")
        pelagem = st.radio(_contract_label(16, "Insira o tipo de pelagem do animal"), ["CURTA", "LONGA"], index=None, horizontal=True, key="contrato_pelagem")
        observacoes = st.text_input(_contract_label(12, "Raça diferente da listagem ou observações"), placeholder="Observações (se houver)", key="contrato_observacoes")
        data_hoje_filhote_dt = st.date_input(_contract_label(21, "Insira a data de hoje"), value=None, format="DD/MM/YYYY", key="contrato_data_hoje_filhote")
        data_hoje_filhote = fmt_date(data_hoje_filhote_dt) if data_hoje_filhote_dt else ""
        cor = st.text_input(_contract_label(2, "Insira a cor do animal"), placeholder="Ex: branco com manchas pretas", key="contrato_cor")

    st.markdown('<div class="novo-section-space"></div>', unsafe_allow_html=True)

    # 3) DADOS DA VENDA
    st.markdown(
        """
        <div class="novo-section-title">
            <div class="novo-section-icon">🛒</div>
            <h2>Dados da venda</h2>
        </div>
        """,
        unsafe_allow_html=True
    )

    v1, v2 = st.columns(2, gap="large")
    with v1:
        valor_extenso = st.text_input(_contract_label(1, "Preencha o valor por extenso da venda"), placeholder="Ex: cinco mil reais", key="contrato_valor_extenso")
        forma_pagamento = st.text_input(_contract_label(4, "Insira a forma de pagamento (cred,deb,pix,din)"), placeholder="Ex: pix", key="contrato_forma_pagamento")
        parcelas = st.text_input(_contract_label(7, "Insira em quantas vezes será pago"), placeholder="Ex: 3 vezes", key="contrato_parcelas")
        valor_filhote = st.text_input(_contract_label(27, "Insira o valor do filhote"), placeholder="Ex: 4500,00", key="contrato_valor_filhote")
    with v2:
        vendedora = st.text_input(_contract_label(8, "VENDEDORA"), placeholder="Nome da vendedora", key="contrato_vendedora")
        dia_hoje_dt = st.date_input(_contract_label(10, "Dia de hoje"), value=None, format="DD/MM/YYYY", key="contrato_dia_hoje")
        dia_numero = fmt_date(dia_hoje_dt) if dia_hoje_dt else ""
        mes = st.text_input(_contract_label(11, "Preencha o mês"), placeholder="Ex: fevereiro", key="contrato_mes")

    data_hoje = dia_numero or data_hoje_filhote

    payload = {
        "valor_extenso": valor_extenso,
        "forma_pagamento": forma_pagamento,
        "parcelas": parcelas,
        "vendedora": vendedora,
        "dia_numero": dia_numero,
        "mes": mes,
        "nome_comprador": nome_comprador,
        "endereco": endereco,
        "numero_residencia": numero_residencia,
        "complemento": complemento,
        "bairro": bairro,
        "cep": cep,
        "estado": "" if estado == "Selecione um estado" else estado,
        "email": email,
        "cpf": cpf,
        "whatsapp": whatsapp,
        "rg": rg,
        "valor_filhote": valor_filhote,
        "cidade": "" if cidade == "Selecione a cidade" else cidade,
        "nome_animal": nome_animal,
        "especie": especie,
        "raca": "" if raca == "Selecione a raça" else raca,
        "microchip": microchip,
        "data_nasc": data_nasc,
        "sexo": sexo,
        "pelagem": pelagem,
        "observacoes": observacoes,
        "data_hoje": data_hoje,
        "cor": cor,
        "unidade": "CAMPINAS",
    }

    _, btn_col, _ = st.columns([4.2, 2.1, 4.2])
    with btn_col:
        st.markdown('<div class="novo-save-button">', unsafe_allow_html=True)
        salvar = st.button("💾 Salvar Contrato", use_container_width=True, key="contrato_salvar")
        st.markdown('</div>', unsafe_allow_html=True)

    if salvar:
        obrigatorios = {
            "Nome do comprador": nome_comprador,
            "Telefone/WhatsApp": whatsapp,
            "CPF": cpf,
            "E-mail": email,
            "Raça": payload["raca"],
            "Sexo": sexo,
            "Cor": cor,
            "Pelagem": pelagem,
            "Data de nascimento": data_nasc,
            "Nome do animal": nome_animal,
            "Valor do filhote": valor_filhote,
            "Vendedora": vendedora,
        }

        faltando = [campo for campo, valor in obrigatorios.items() if not str(valor).strip()]
        if faltando:
            st.error("Preencha os campos obrigatórios: " + ", ".join(faltando))
        else:
            try:
                _append_contract_to_sheet(payload)
                st.success("✅ Contrato salvo com sucesso na planilha!")
                st.cache_data.clear()
            except Exception as e:
                st.error(f"Erro ao salvar na planilha: {e}")

    st.markdown("</div>", unsafe_allow_html=True)


def render_fin_dashboard(df: pd.DataFrame):
    COL_MES = "Mês"
    COL_UNIDADE = "Unidade"
    COL_RACA = "Raça"

    COL_VALOR = pick_first_existing(df, ["Valor Filhote", "Valor de filhote", "Valor Filhote ", "Valor"])
    COL_VENDEDOR = pick_first_existing(df, ["Vendedora", "Vendedor", "Atendente"])

    top_menu, top_l, top_mid, top_r = st.columns([1, 5, 2, 1])

    with top_menu:
        with st.popover("☰"):
            st.markdown('<div class="menu-title">Menu</div>', unsafe_allow_html=True)
            st.markdown('<div class="menu-sub">Escolha uma área para acessar</div>', unsafe_allow_html=True)
            st.markdown('<div class="menu-divider"></div>', unsafe_allow_html=True)

            if st.button("📄  Novo Contrato", use_container_width=True, key="menu_novo_contrato_fin"):
                st.session_state.page = "novo_contrato"
                st.rerun()

            if st.button("⚙️  Operação", use_container_width=True, key="menu_operacao_from_fin"):
                st.session_state.page = "operacao_dashboard"
                st.rerun()

            st.markdown('<div class="menu-help">Painel interno • SkoobPet</div>', unsafe_allow_html=True)

    with top_l:
        st.markdown("## 💰 Financeiro")
        st.caption(f"Total de registros: **{len(df)}**")

    with top_mid:
        st.empty()

    with top_r:
        if st.button("Sair", use_container_width=True, key="btn_logout_fin"):
            st.session_state.oper_logged_in = False
            st.session_state.fin_logged_in = False
            st.session_state.page = "operacao_login"
            st.rerun()

    render_logo_mobile()

    f1, f_logo, f2 = st.columns([6, 1.1, 6])

    with f1:
        meses = sorted(df[COL_MES].dropna().astype(str).unique())
        mes = st.selectbox("Mês", meses, index=len(meses)-1 if len(meses) else 0, key="fin_mes")

    with f_logo:
        render_logo_desktop()

    with f2:
        unidades = ["Todas"] + sorted(df[COL_UNIDADE].dropna().astype(str).unique().tolist())
        unidade = st.selectbox("Unidade", unidades, key="fin_unidade")

    f_mes = df[df[COL_MES].astype(str) == str(mes)].copy()
    if unidade != "Todas":
        f_mes = f_mes[f_mes[COL_UNIDADE].astype(str) == str(unidade)]

    if COL_VALOR and COL_VALOR in f_mes.columns:
        f_mes["_valor_num"] = f_mes[COL_VALOR].apply(brl_to_float)
    else:
        f_mes["_valor_num"] = 0.0

    faturamento_total = float(f_mes["_valor_num"].sum())
    total_vendas = int(len(f_mes))
    ticket_medio = faturamento_total / total_vendas if total_vendas > 0 else 0.0
    total_racas = int(f_mes[COL_RACA].astype(str).nunique()) if COL_RACA in f_mes.columns else 0

    st.markdown("---")
    k1, k2, k3, k4 = st.columns(4)
    with k1:
        kpi_card("💰 Faturamento total", money_br(faturamento_total), str(mes), NAVY, value_size=22)
    with k2:
        kpi_card("🛍️ Vendas no mês", total_vendas, str(mes), WINE_2)
    with k3:
        kpi_card("📊 Ticket médio", money_br(ticket_medio), "por venda", WINE, value_size=22)
    with k4:
        kpi_card("🐶 Raças vendidas", total_racas, "no mês", NAVY_2)

    st.markdown("---")
    g1, g2 = st.columns(2)
    g3, g4 = st.columns(2)

    with g1:
        render_chart_header("Faturamento por Unidade", "🏬", "Faturamento somado por unidade no mês")
        if COL_UNIDADE in f_mes.columns and len(f_mes) > 0:
            df_unidade_valor = (
                f_mes.groupby(COL_UNIDADE)["_valor_num"]
                .sum()
                .reset_index(name="Faturamento")
                .sort_values("Faturamento", ascending=False)
            )

            if len(df_unidade_valor) == 0:
                st.info("Sem registros para o filtro selecionado.")
            else:
                fig = build_money_bar(df_unidade_valor, COL_UNIDADE, "Faturamento", height=390, tickangle=18)
                st.plotly_chart(fig, use_container_width=True, key="fin_faturamento_unidade")
        else:
            st.info("Sem registros para o filtro selecionado.")

    with g2:
        render_chart_header("Valor por raça", "💵", "Faturamento somado por raça no mês")
        if COL_RACA in f_mes.columns and len(f_mes) > 0:
            df_racas_valor = (
                f_mes.groupby(COL_RACA)["_valor_num"]
                .sum()
                .reset_index(name="Faturamento")
                .sort_values("Faturamento", ascending=False)
                .head(10)
            )
            fig = build_money_bar(df_racas_valor, COL_RACA, "Faturamento", height=390, tickangle=28)
            st.plotly_chart(fig, use_container_width=True, key="fin_valor_raca")
        else:
            st.info("Sem registros para o filtro selecionado.")

    with g3:
        render_chart_header("Vendedoras que mais faturaram", "🏆", "Ranking por faturamento no mês")
        if COL_VENDEDOR and COL_VENDEDOR in f_mes.columns and len(f_mes) > 0:
            df_vend_valor = (
                f_mes.groupby(COL_VENDEDOR)["_valor_num"]
                .sum()
                .reset_index(name="Faturamento")
                .sort_values("Faturamento", ascending=False)
                .head(12)
            )
            fig = build_money_bar(df_vend_valor, COL_VENDEDOR, "Faturamento", height=390, tickangle=28)
            st.plotly_chart(fig, use_container_width=True, key="fin_vendedoras")
        else:
            st.info("Coluna de vendedor/vendedora não encontrada.")

    with g4:
        render_chart_header("Faturamento individual por vendedora", "🧾", "Valores individuais no mês selecionado")
        if COL_VENDEDOR and COL_VENDEDOR in f_mes.columns and len(f_mes) > 0:
            df_vend_tabela = (
                f_mes.groupby(COL_VENDEDOR)["_valor_num"]
                .sum()
                .reset_index()
                .rename(columns={COL_VENDEDOR: "Vendedora", "_valor_num": "Faturamento"})
                .sort_values("Faturamento", ascending=False)
            )
            df_vend_tabela["Faturamento"] = df_vend_tabela["Faturamento"].apply(money_br)
            st.dataframe(df_vend_tabela, use_container_width=True, hide_index=True)
        else:
            st.info("Coluna de vendedor/vendedora não encontrada.")

    st.markdown("---")
    render_chart_header("Faturamento total do ano", "📈", "Mensal conforme crescimento da planilha")

    ano_ref = extract_year_from_month_key(mes)

    if ano_ref and COL_MES in df.columns and len(df) > 0:
        f_ano = df[df[COL_MES].astype(str).str.contains(str(ano_ref), na=False)].copy()
        if unidade != "Todas":
            f_ano = f_ano[f_ano[COL_UNIDADE].astype(str) == str(unidade)]

        if COL_VALOR and COL_VALOR in f_ano.columns:
            f_ano["_valor_num"] = f_ano[COL_VALOR].apply(brl_to_float)
        else:
            f_ano["_valor_num"] = 0.0

        f_ano["_mes_num"] = f_ano[COL_MES].astype(str).apply(extract_month_num_from_month_key)
        f_ano = f_ano[f_ano["_mes_num"].notna()].copy()

        if len(f_ano) == 0:
            st.info("Sem dados suficientes para montar o gráfico anual.")
        else:
            df_ano = (
                f_ano.groupby("_mes_num")["_valor_num"]
                .sum()
                .reset_index(name="Faturamento")
                .sort_values("_mes_num")
            )
            df_ano["_mes_num"] = df_ano["_mes_num"].astype(int)
            df_ano["Mês"] = df_ano["_mes_num"].apply(month_label_pt)

            fig = build_monthly_and_cumulative_chart(df_ano, height=420)
            st.plotly_chart(fig, use_container_width=True, key="fin_ano")
    else:
        st.info("Não foi possível identificar o ano do mês selecionado.")


inject_global_css()

if st.session_state.page == "operacao_login":
    render_oper_login()
    st.stop()

if not st.session_state.oper_logged_in:
    st.session_state.page = "operacao_login"
    render_oper_login()
    st.stop()

if st.session_state.page != "novo_contrato":
    components.html("<script>setTimeout(() => window.location.reload(), 10000);</script>", height=0)

df = load_sheet(sheet_url_busted(SHEET_CSV_URL))

if st.session_state.page == "financeiro_login":
    render_fin_login()
elif st.session_state.page == "financeiro_dashboard":
    if not st.session_state.fin_logged_in:
        render_fin_login()
    else:
        render_fin_dashboard(df)
elif st.session_state.page == "novo_contrato":
    render_novo_contrato()
else:
    render_oper_dashboard(df)