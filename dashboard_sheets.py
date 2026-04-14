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

# ===============================
# CONFIG DA PÁGINA
# ===============================
st.set_page_config(
    page_title="Painel Pós-Venda",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# ===============================
# LOGIN
# ===============================
APP_USER = "operacao"
APP_PASS = "100316"

def img_to_base64(path: str):
    try:
        file_path = Path(path)
        if file_path.exists():
            return base64.b64encode(file_path.read_bytes()).decode()
    except Exception:
        pass
    return None

def render_login_logo():
    logo_b64 = img_to_base64("skoobpet.png")
    if logo_b64:
        return f'<img src="data:image/png;base64,{logo_b64}" class="login-logo" alt="SkoobPet">'
    return '<div class="login-logo-fallback">🐾</div>'

def ensure_login() -> bool:
    if "logged_in" not in st.session_state:
        st.session_state.logged_in = False

    if st.session_state.logged_in:
        return True

    logo_html = render_login_logo()

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
                padding-top: 0rem !important;
                padding-bottom: 0rem !important;
                padding-left: 1rem !important;
                padding-right: 1rem !important;
                max-width: 1100px !important;
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
                background: rgba(255,255,255,0.95);
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

            /* ===============================
               MENU MAIS PROFISSIONAL
            =============================== */
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
                border: 1px solid #e5e7eb !important;
                background: #f8fafc !important;
                color: #0f172a !important;
                font-size: 15px !important;
                font-weight: 700 !important;
                box-shadow: none !important;
            }

            div[data-testid="stPopoverContent"] .stButton > button:hover {
                background: linear-gradient(90deg, #1d1564 0%, #9d0139 100%) !important;
                color: #ffffff !important;
                border: 1px solid transparent !important;
                transform: translateY(-1px);
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

    st.markdown('<div class="login-page-wrap"><div class="login-shell">', unsafe_allow_html=True)

    st.markdown(
        f'''
        <div class="login-brand">
            <div class="logo-center">{logo_html}</div>
            <div class="login-subtitle">Acesse o dashboard de pós-venda e pedigree</div>
        </div>
        ''',
        unsafe_allow_html=True
    )

    st.markdown(
        """
        <div class="login-card">
            <div class="login-mini-title">Acesso ao Painel</div>
            <div class="login-mini-sub">Digite seu usuário e senha para continuar</div>
        </div>
        """,
        unsafe_allow_html=True
    )

    user = st.text_input("Usuário", placeholder="Digite seu usuário")
    pwd = st.text_input("Senha", type="password", placeholder="Digite sua senha")

    entrar = st.button("Entrar", use_container_width=True)

    if entrar:
        u = (user or "").strip()
        p = (pwd or "").strip()

        if u == APP_USER and p == APP_PASS:
            st.session_state.logged_in = True
            st.rerun()
        else:
            st.error("Usuário ou senha inválidos.")

    st.markdown(
        """
        <div class="login-badges">
            <span class="login-badge">🔒 Acesso restrito</span>
            <span class="login-badge">🐾 Operação interna SkoobPet</span>
        </div>
        <div class="login-footer">Painel interno • Uso autorizado apenas para a equipe</div>
        </div></div>
        """,
        unsafe_allow_html=True
    )

    return False


# ===============================
# CONFIG
# ===============================
SHEET_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "1Q0mLvOBxEGCojUITBLxCXRtpXVMAHE3ngvGsa2Cgf9Q"
    "/gviz/tq?tqx=out:csv&gid=1396326144"
)

if not ensure_login():
    st.stop()

# ===============================
# AUTO-REFRESH
# ===============================
components.html("<script>setTimeout(() => window.location.reload(), 10000);</script>", height=0)

# ===============================
# CSS DASHBOARD
# ===============================
st.markdown(
    """
    <style>
        .stApp { background-color: #D4D4D4; }

        .block-container {
            padding-top: 2.4rem !important;
            padding-bottom: 1.6rem !important;
        }

        h1, h2, h3, h4 { margin-top: 0 !important; padding-top: 0 !important; }

        div[data-baseweb="select"] { margin-top: 10px; }

        .panel-card{
            background:#ffffff;
            border-radius:18px;
            box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
            border: 1px solid rgba(15,23,42,0.06);
            overflow: hidden;
        }

        .panel-head{
            padding: 14px 16px 0px 16px;
            background:#ffffff;
        }

        .panel-title{
            font-weight: 900;
            color:#0f172a;
            font-size: 18px;
            display:flex;
            align-items:center;
            gap:8px;
        }

        .panel-body{
            padding: 8px 10px 12px 10px;
            background:#ffffff;
        }
    </style>
    """,
    unsafe_allow_html=True
)

# ===============================
# PALETA
# ===============================
NAVY = "#1B1D6D"
WINE = "#9B0033"
NAVY_2 = "#2E3192"
WINE_2 = "#C00040"
GRAY = "#64748b"
BAR_SEQ = [NAVY, WINE, NAVY_2, WINE_2, "#334155", "#94a3b8"]

# ===============================
# HELPERS
# ===============================
def pick_first_existing(df, candidates):
    cols = {str(c).replace("\u00a0", " ").strip(): c for c in df.columns}
    for c in candidates:
        key = str(c).replace("\u00a0", " ").strip()
        if key in cols:
            return cols[key]
    return None

def norm(x):
    return str(x).strip().lower() if pd.notna(x) else ""

def is_done(status):
    return norm(status) in [
        "feito", "concluido", "concluído", "ok",
        "realizado", "finalizado", "concluida", "concluída",
        "enviado", "enviada"
    ]

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

def money_br(v):
    try:
        v = float(v)
    except Exception:
        v = 0.0
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"

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
        <div style="font-size:12px;color:{GRAY};margin-top:6px;">{subtitle}</div>
    </div>
    """
    components.html(html, height=130)

def tune_plotly(fig, height=360):
    fig.update_layout(
        height=height,
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        margin=dict(t=6, b=6, l=6, r=6),
        font=dict(color="#0f172a"),
    )
    fig.update_xaxes(showgrid=False, zeroline=False)
    fig.update_yaxes(showgrid=True, gridcolor="rgba(15,23,42,0.06)",
