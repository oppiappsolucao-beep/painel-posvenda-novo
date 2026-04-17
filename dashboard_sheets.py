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
# CONFIG
# =========================================================
st.set_page_config(
    page_title="Painel Pós-Venda",
    layout="wide",
    initial_sidebar_state="collapsed"
)

NAVY = "#1B1D6D"
NAVY_2 = "#2E3192"
WINE = "#9B0033"
WINE_2 = "#C00040"

APP_USER = "operacao"
APP_PASS = "100316"

SHEET_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "1Q0mLvOBxEGCojUITBLxCXRtpXVMAHE3ngvGsa2Cgf9Q"
    "/gviz/tq?tqx=out:csv&gid=1396326144"
)

TZ = ZoneInfo("America/Sao_Paulo")
hoje = pd.Timestamp(datetime.datetime.now(TZ).date())

# =========================================================
# SESSION
# =========================================================
if "logged_in" not in st.session_state:
    st.session_state.logged_in = False

# =========================================================
# CSS
# =========================================================
def inject_css():
    st.markdown("""
    <style>

    .stApp {
        background: #D4D4D4;
    }

    /* MENU BUTTON */
    div[data-testid="stPopover"] > button {
        height: 46px !important;
        width: 56px !important;
        border-radius: 14px !important;
        background: white !important;
    }

    /* BOTÕES DO MENU (PADRÃO) */
    div[data-testid="stPopoverContent"] .stButton > button {
        width: 100%;
        height: 44px;
        border-radius: 12px;
        border: none;
        background: linear-gradient(90deg, #1B1D6D 0%, #111827 100%);
        color: white;
        font-weight: 700;
    }

    /* NOVO CONTRATO (HTML) */
    .menu-link-btn {
        width: 100%;
        height: 44px;
        margin-top: 8px;
        border-radius: 12px;
        background: linear-gradient(90deg, #1B1D6D 0%, #111827 100%);
        color: #fff !important;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        text-decoration: none !important;
    }

    .menu-link-btn:hover {
        background: linear-gradient(90deg, #16185c 0%, #0f172a 100%);
        transform: translateY(-1px);
    }

    </style>
    """, unsafe_allow_html=True)

# =========================================================
# LOAD DATA
# =========================================================
@st.cache_data(ttl=2)
def load():
    return pd.read_csv(SHEET_CSV_URL)

# =========================================================
# LOGIN
# =========================================================
def login():
    st.title("Login")

    user = st.text_input("Usuário")
    pwd = st.text_input("Senha", type="password")

    if st.button("Entrar"):
        if user == APP_USER and pwd == APP_PASS:
            st.session_state.logged_in = True
            st.rerun()
        else:
            st.error("Erro")

# =========================================================
# DASHBOARD
# =========================================================
def dashboard(df):

    col1, col2 = st.columns([1, 6])

    with col1:
        with st.popover("☰"):

            st.markdown("### Menu")
            st.markdown("Escolha uma área")

            # ✅ BOTÃO CORRIGIDO
            st.markdown(
                """
                <a href="https://n8n.oppitech.com.br/form/55a2bd76-25c9-4ea2-82ad-f5c0ae75e19c"
                target="_blank"
                class="menu-link-btn">
                📄 Novo Contrato
                </a>
                """,
                unsafe_allow_html=True
            )

            st.button("⚙️ Operação")
            st.button("💰 Financeiro")

    with col2:
        st.title("Painel Pós-Venda")

        st.write(df.head())

# =========================================================
# FLOW
# =========================================================
inject_css()

if not st.session_state.logged_in:
    login()
else:
    df = load()
    dashboard(df)
