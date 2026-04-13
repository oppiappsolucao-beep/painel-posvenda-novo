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
        return f'<div class="login-logo-wrap"><img src="data:image/png;base64,{logo_b64}" class="login-logo"></div>'
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
                background: linear-gradient(180deg, #F3F4F6 0%, #ECEFF3 100%);
            }

            header[data-testid="stHeader"] {
                background: transparent !important;
            }

            .block-container {
                padding-top: 0rem !important;
                padding-bottom: 0rem !important;
                max-width: 1100px !important;
            }

            .login-page-wrap {
                width: 100%;
                display: flex;
                align-items: flex-start;
                justify-content: center;
                padding-top: 20px;
            }

            .login-shell {
                width: 100%;
                max-width: 820px;
                margin: 0 auto;
            }

            .login-top-bar {
                width: 100%;
                height: 44px;
                border-radius: 18px;
                background: rgba(255,255,255,0.8);
                margin-bottom: 14px;
            }

            .login-brand {
                text-align: center;
                margin-bottom: 10px;
            }

            /* 🔥 LOGO REDONDA */
            .login-logo {
                width: 120px;
                height: 120px;
                object-fit: cover;
                border-radius: 50%;
                background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
                padding: 10px;
                box-shadow: 0 14px 30px rgba(15, 23, 42, 0.14);
                border: 2px solid rgba(255,255,255,0.9);
            }

            .login-subtitle {
                margin-top: 8px;
                font-size: 16px;
                color: #64748b;
                font-weight: 500;
            }

            .login-card {
                background: rgba(255,255,255,0.95);
                border-radius: 20px;
                padding: 26px;
                box-shadow: 0 14px 34px rgba(15, 23, 42, 0.10);
            }

            .login-mini-title {
                font-size: 22px;
                font-weight: 900;
                text-align: center;
                margin-bottom: 6px;
            }

            .login-mini-sub {
                text-align: center;
                font-size: 13px;
                color: #64748b;
                margin-bottom: 16px;
            }

            div[data-testid="stTextInput"] input {
                border-radius: 14px !important;
                height: 48px !important;
            }

            div.stButton > button {
                height: 50px;
                border-radius: 14px !important;
                background: linear-gradient(90deg, #1B1D6D 0%, #111827 100%) !important;
                color: white !important;
                font-weight: 900 !important;
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
            }

            @media (max-width: 640px) {
                .login-logo {
                    width: 90px;
                    height: 90px;
                }
            }
        </style>
        """,
        unsafe_allow_html=True
    )

    st.markdown('<div class="login-page-wrap"><div class="login-shell">', unsafe_allow_html=True)
    st.markdown('<div class="login-top-bar"></div>', unsafe_allow_html=True)

    st.markdown(
        f'<div class="login-brand">{logo_html}<div class="login-subtitle">Acesse o dashboard de pós-venda e pedigree</div></div>',
        unsafe_allow_html=True
    )

    st.markdown(
        """
        <div class="login-card">
            <div class="login-mini-title">Acesso ao Painel</div>
            <div class="login-mini-sub">Digite seu usuário e senha para continuar</div>
        """,
        unsafe_allow_html=True
    )

    user = st.text_input("Usuário")
    pwd = st.text_input("Senha", type="password")

    if st.button("Entrar", use_container_width=True):
        if user == APP_USER and pwd == APP_PASS:
            st.session_state.logged_in = True
            st.rerun()
        else:
            st.error("Usuário ou senha inválidos")

    st.markdown(
        """
        <div class="login-badges">
            <span class="login-badge">🔒 Acesso restrito</span>
            <span class="login-badge">🐾 SkoobPet</span>
        </div>
        </div></div></div>
        """,
        unsafe_allow_html=True
    )

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
# AQUI CONTINUA SEU DASH NORMAL
# (não alterei nada abaixo)
# ===============================

st.title("Dashboard funcionando 🚀")
