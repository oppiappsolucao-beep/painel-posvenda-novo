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
    except:
        pass
    return None

def render_login_logo():
    logo_b64 = img_to_base64("skoobpet.png")
    if logo_b64:
        return f'<img src="data:image/png;base64,{logo_b64}" class="login-logo">'
    return '<div class="login-logo-fallback">🐾</div>'

def ensure_login() -> bool:
    if "logged_in" not in st.session_state:
        st.session_state.logged_in = False

    if st.session_state.logged_in:
        return True

    logo_html = render_login_logo()

    st.markdown("""
    <style>
        .stApp {
            background: #D4D4D4;
        }

        .block-container {
            padding-top: 0rem !important;
        }

        .login-page {
            text-align: center;
            padding-top: 30px;
        }

        .login-logo {
            width: 90px;
            height: 90px;
            object-fit: cover;
            border-radius: 50%;
        }

        .login-subtitle {
            margin-top: 10px;
            font-size: 16px;
            color: #334155;
        }

        .login-card {
            margin-top: 20px;
            background: #ffffff;
            border-radius: 20px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.08);
        }

        .login-title {
            font-size: 22px;
            font-weight: 900;
        }

        .login-mini {
            font-size: 13px;
            color: #64748b;
            margin-bottom: 15px;
        }

        div.stButton > button {
            height: 50px;
            border-radius: 14px !important;
            background: linear-gradient(90deg, #1B1D6D 0%, #111827 100%) !important;
            color: white !important;
            font-weight: 900 !important;
        }

        @media (max-width: 640px) {
            .login-logo {
                width: 70px;
                height: 70px;
            }
        }
    </style>
    """, unsafe_allow_html=True)

    st.markdown('<div class="login-page">', unsafe_allow_html=True)

    st.markdown(f'{logo_html}', unsafe_allow_html=True)
    st.markdown('<div class="login-subtitle">Acesse o dashboard de pós-venda e pedigree</div>', unsafe_allow_html=True)

    st.markdown('<div class="login-card">', unsafe_allow_html=True)
    st.markdown('<div class="login-title">Acesso ao Painel</div>', unsafe_allow_html=True)
    st.markdown('<div class="login-mini">Digite seu usuário e senha para continuar</div>', unsafe_allow_html=True)

    user = st.text_input("Usuário")
    pwd = st.text_input("Senha", type="password")

    if st.button("Entrar", use_container_width=True):
        if user == APP_USER and pwd == APP_PASS:
            st.session_state.logged_in = True
            st.rerun()
        else:
            st.error("Usuário ou senha inválidos")

    st.markdown('</div>', unsafe_allow_html=True)
    st.markdown('</div>', unsafe_allow_html=True)

    return False

# ===============================
# BLOQUEIO LOGIN
# ===============================
if not ensure_login():
    st.stop()

# ===============================
# AUTO REFRESH
# ===============================
components.html("<script>setTimeout(() => window.location.reload(), 10000);</script>", height=0)

# ===============================
# DASHBOARD CSS
# ===============================
st.markdown("""
<style>
    .stApp { background-color: #D4D4D4; }

    .block-container {
        padding-top: 2rem !important;
    }

    .panel-card{
        background:#ffffff;
        border-radius:18px;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        padding:10px;
    }
</style>
""", unsafe_allow_html=True)

# ===============================
# LOAD DATA
# ===============================
SHEET_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "1Q0mLvOBxEGCojUITBLxCXRtpXVMAHE3ngvGsa2Cgf9Q"
    "/gviz/tq?tqx=out:csv&gid=1396326144"
)

def sheet_url_busted(base_url: str) -> str:
    return f"{base_url}&_ts={int(time.time()*1000)}"

@st.cache_data(ttl=2)
def load_sheet(url):
    df = pd.read_csv(url)
    df.columns = [c.strip() for c in df.columns]
    return df

df = load_sheet(sheet_url_busted(SHEET_CSV_URL))

# ===============================
# HEADER
# ===============================
st.title("📊 Painel de Pós-Venda")
st.caption(f"Total de registros: {len(df)}")

# ===============================
# FILTROS
# ===============================
col1, col2 = st.columns(2)

mes = col1.selectbox("Mês", sorted(df["Mês"].dropna().unique()))
unidade = col2.selectbox("Unidade", ["Todas"] + sorted(df["Unidade"].dropna().unique()))

f = df[df["Mês"] == mes]
if unidade != "Todas":
    f = f[f["Unidade"] == unidade]

# ===============================
# KPIs
# ===============================
st.markdown("---")
c1, c2 = st.columns(2)

c1.metric("Vendas no mês", len(f))
c2.metric("Faturamento", f["Valor Filhote"].sum())

# ===============================
# GRÁFICO
# ===============================
st.markdown("---")

fig = px.bar(
    f.groupby("Unidade").size().reset_index(name="Total"),
    x="Unidade",
    y="Total",
    text="Total"
)

st.plotly_chart(fig, use_container_width=True)
