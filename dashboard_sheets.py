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

# =========================================================
# CONFIG DA PÁGINA
# =========================================================
st.set_page_config(
    page_title="Painel Pós-Venda",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# =========================================================
# PALETA
# =========================================================
NAVY = "#1B1D6D"
NAVY_2 = "#2E3192"
WINE = "#9B0033"
WINE_2 = "#C00040"
GOLD = "#F59E0B"
GRAY_TEXT = "#64748b"
GRID = "rgba(15,23,42,0.07)"

# =========================================================
# CREDENCIAIS
# =========================================================
APP_USER = "operacao"
APP_PASS = "100316"

OPER_USER = "skoob"
OPER_PASS = "skoob123"

FIN_USER = "diretoria"
FIN_PASS = "skoob1234"

SHEET_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "1Q0mLvOBxEGCojUITBLxCXRtpXVMAHE3ngvGsa2Cgf9Q"
    "/gviz/tq?tqx=out:csv&gid=1396326144"
)

TZ = ZoneInfo("America/Sao_Paulo")
hoje = pd.Timestamp(datetime.datetime.now(TZ).date())

# =========================================================
# ESTADO INICIAL
# =========================================================
if "logged_in" not in st.session_state:
    st.session_state.logged_in = False

if "oper_logged_in" not in st.session_state:
    st.session_state.oper_logged_in = False

if "fin_logged_in" not in st.session_state:
    st.session_state.fin_logged_in = False

if "page" not in st.session_state:
    st.session_state.page = "main"

# =========================================================
# HELPERS VISUAIS
# =========================================================
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
                max-width: 1180px !important;
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

            .login-badges {
                text-align: center;
                margin-top: 12px;
            }

            .login-badge {
                display: inline-block;
                margin: 4px;
                padding: 6px 10px;
                border-radius: 999px;
                font-size: 11px;
                background: #F1F5F9;
                color: #475569;
                border: 1px solid rgba(15,23,42,0.06);
                font-weight: 700;
            }

            .login-footer {
                text-align: center;
                color: #94a3b8;
                font-size: 12px;
                margin-top: 10px;
            }

            /* MENU */
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

            /* BOTÕES DO MENU */
            div[data-testid="stPopoverContent"] .stButton > button,
            div[data-testid="stPopoverContent"] .stLinkButton > a {
                width: 100% !important;
                height: 48px !important;
                margin-top: 8px !important;
                border-radius: 14px !important;
                border: none !important;
                background: linear-gradient(90deg, #1B1D6D 0%, #111827 100%) !important;
                color: #ffffff !important;
                font-size: 15px !important;
                font-weight: 800 !important;
                box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18) !important;
                text-decoration: none !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            }

            div[data-testid="stPopoverContent"] .stButton > button:hover,
            div[data-testid="stPopoverContent"] .stLinkButton > a:hover {
                background: linear-gradient(90deg, #16185c 0%, #0f172a 100%) !important;
                color: #ffffff !important;
                border: none !important;
                transform: translateY(-1px);
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

            @media (max-width: 640px) {
                .login-logo {
                    width: 70px;
                    height: 70px;
                }

                .login-logo-fallback {
                    width: 70px;
                    height: 70px;
                    font-size: 30px;
                }

                .login-page-wrap {
                    padding-top: 12px;
                }

                .login-card {
                    padding: 10px 14px 8px 14px;
                }

                .login-subtitle {
                    font-size: 14px;
                }

                .login-mini-title {
                    font-size: 18px;
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


def is_sent(status):
    s = norm(status)
    return ("enviado" in s) or ("enviada" in s)


def status_bucket_today(status):
    if is_error(status):
        return "Erro"
    if is_sent(status):
        return "Enviado"
    return "Aguardando"


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
    ">
        <div style="font-size:14px;font-weight:900;color:#334155;">{title}</div>
        <div style="font-size:{value_size}px;font-weight:900;color:{value_color};line-height:1.05;margin-top:6px;">
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


def build_named_bar(df_plot, x_col, y_col, bar_color=NAVY, height=390, tickangle=28):
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
        NAVY, WINE, NAVY_2, WINE_2, "#3B4A64", "#
