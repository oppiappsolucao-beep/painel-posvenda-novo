import streamlit as st
import streamlit.components.v1 as components
import pandas as pd
import datetime
import plotly.express as px
import re
import time
from zoneinfo import ZoneInfo

# ===============================
# CONFIG
# ===============================
st.set_page_config(page_title="Painel Pós-Venda", layout="wide")

SHEET_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "1Q0mLvOBxEGCojUITBLxCXRtpXVMAHE3ngvGsa2Cgf9Q"
    "/gviz/tq?tqx=out:csv&gid=1396326144"
)

# ===============================
# LOGIN PRINCIPAL
# ===============================
APP_USER = "operacao"
APP_PASS = "100316"

def ensure_login():
    if "logged_in" not in st.session_state:
        st.session_state.logged_in = False

    if st.session_state.logged_in:
        return True

    st.markdown("""
    <style>
    .stApp { background-color: #D4D4D4; }
    .login-box {
        background: white;
        padding: 30px;
        border-radius: 18px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        max-width: 420px;
        margin: auto;
        margin-top: 8vh;
        text-align: center;
    }
    </style>
    """, unsafe_allow_html=True)

    st.markdown('<div class="login-box">', unsafe_allow_html=True)

    st.image("skoobpet.png", width=90)
    st.markdown("### Acesso ao Painel")

    user = st.text_input("Usuário")
    pwd = st.text_input("Senha", type="password")

    if st.button("Entrar", use_container_width=True):
        if user == APP_USER and pwd == APP_PASS:
            st.session_state.logged_in = True
            st.rerun()
        else:
            st.error("Login inválido")

    st.markdown("</div>", unsafe_allow_html=True)
    return False


# ===============================
# LOGIN OPERAÇÃO
# ===============================
def ensure_oper_login():
    if "oper_logged" not in st.session_state:
        st.session_state.oper_logged = False

    if st.session_state.oper_logged:
        return True

    st.markdown("## 🔐 Login Operação")

    user = st.text_input("Usuário", key="op_user")
    pwd = st.text_input("Senha", type="password", key="op_pwd")

    if st.button("Entrar Operação"):
        if user == "skoob" and pwd == "skoob123":
            st.session_state.oper_logged = True
            st.rerun()
        else:
            st.error("Senha incorreta")

    return False


# ===============================
# LOAD DATA
# ===============================
@st.cache_data(ttl=2)
def load_data():
    df = pd.read_csv(SHEET_CSV_URL)
    return df

df = load_data()

# ===============================
# MENU LATERAL
# ===============================
def render_menu():
    if "menu_open" not in st.session_state:
        st.session_state.menu_open = False

    col1, col2 = st.columns([1, 10])

    with col1:
        if st.button("☰"):
            st.session_state.menu_open = not st.session_state.menu_open

    if st.session_state.menu_open:
        st.markdown("""
        <style>
        .menu-box {
            background: linear-gradient(135deg, #9d0139, #1d1564);
            padding: 20px;
            border-radius: 16px;
            color: white;
            width: 260px;
            position: absolute;
            z-index: 999;
        }
        </style>
        """, unsafe_allow_html=True)

        st.markdown('<div class="menu-box">', unsafe_allow_html=True)

        if st.button("📄 Novo Contrato"):
            components.html(
                "<script>window.open('https://n8n.oppitech.com.br/form/55a2bd76-25c9-4ea2-82ad-f5c0ae75e19c', '_blank')</script>",
                height=0,
            )

        if st.button("⚙️ Operação"):
            st.session_state.page = "operacao"

        if st.button("💰 Financeiro"):
            st.info("Em construção")

        st.markdown("</div>", unsafe_allow_html=True)


# ===============================
# HELPERS
# ===============================
def parse_date_series(s):
    return pd.to_datetime(s, errors="coerce", dayfirst=True)

def count_today(df, col):
    today = datetime.date.today()
    return df[df[col].dt.date == today].shape[0]

def count_month(df, col, mes):
    return df[df[col].dt.strftime("%m/%Y") == mes].shape[0]

def is_error(val):
    if pd.isna(val): return False
    return "erro" in str(val).lower()

# ===============================
# MAIN DASHBOARD
# ===============================
def render_main():
    render_menu()

    st.title("📊 Painel de Pós-Venda")

    meses = sorted(df["Mês"].dropna().astype(str).unique())
    mes = st.selectbox("Mês", meses)

    # KPIs
    c1 = count_today(df, "1º contato")
    c2 = count_today(df, "2º contato")
    c3 = count_today(df, "3º contato")

    m1 = count_month(df, "1º contato", mes)
    m2 = count_month(df, "2º contato", mes)
    m3 = count_month(df, "3º contato", mes)

    erro = df[df["Status 1º contato"].apply(is_error)].shape[0]
    vendas = df[df["Mês"] == mes].shape[0]

    st.markdown("### KPIs")

    cols = st.columns(6)
    cols[0].metric("1º hoje", c1)
    cols[1].metric("2º hoje", c2)
    cols[2].metric("3º hoje", c3)
    cols[3].metric("1º mês", m1)
    cols[4].metric("2º mês", m2)
    cols[5].metric("3º mês", m3)

    st.markdown("---")

    # CARDS DE BAIXO (ESTILO CERTO)
    c_res1, c_res2 = st.columns(2)

    with c_res1:
        st.markdown(f"""
        <div style="background:white;padding:20px;border-radius:16px;border-left:8px solid red">
        <b>Status com erro</b>
        <h1>{erro}</h1>
        </div>
        """, unsafe_allow_html=True)

    with c_res2:
        st.markdown(f"""
        <div style="background:white;padding:20px;border-radius:16px;border-left:8px solid orange">
        <b>Vendas no mês</b>
        <h1>{vendas}</h1>
        </div>
        """, unsafe_allow_html=True)


# ===============================
# OPERAÇÃO DASHBOARD
# ===============================
def render_oper():
    if not ensure_oper_login():
        return

    st.title("⚙️ Painel de Operação")

    meses = sorted(df["Mês"].dropna().astype(str).unique())
    mes = st.selectbox("Mês", meses, key="op_mes")

    m1 = count_month(df, "1º contato", mes)
    m2 = count_month(df, "2º contato", mes)
    m3 = count_month(df, "3º contato", mes)

    cols = st.columns(3)
    cols[0].metric("Primeiro Contato Mês", m1)
    cols[1].metric("Segundo Contato Mês", m2)
    cols[2].metric("Terceiro Contato Mês", m3)


# ===============================
# ROUTER
# ===============================
if "page" not in st.session_state:
    st.session_state.page = "main"

if not ensure_login():
    st.stop()

if st.session_state.page == "main":
    render_main()

elif st.session_state.page == "operacao":
    render_oper()
