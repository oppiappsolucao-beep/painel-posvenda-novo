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
# CREDENCIAIS
# =========================================================
APP_USER = "operacao"
APP_PASS = "100316"

OPER_USER = "skoob"
OPER_PASS = "skoob123"

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

            div[data-testid="stPopoverContent"] .stButton > button,
            div[data-testid="stPopoverContent"] .stLinkButton > a {
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
                text-decoration: none !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            }

            div[data-testid="stPopoverContent"] .stButton > button:hover,
            div[data-testid="stPopoverContent"] .stLinkButton > a:hover {
                background: linear-gradient(90deg, #1d1564 0%, #9d0139 100%) !important;
                color: #ffffff !important;
                border: 1px solid transparent !important;
                transform: translateY(-1px);
            }

            .panel-card{
                background:#ffffff;
                border-radius:22px;
                box-shadow: 0 12px 26px rgba(15, 23, 42, 0.08);
                border: 1px solid rgba(15,23,42,0.06);
                overflow: hidden;
            }

            .panel-head{
                padding: 18px 20px 6px 20px;
                background:#ffffff;
            }

            .panel-title{
                font-weight: 900;
                color:#0f172a;
                font-size: 16px;
                display:flex;
                align-items:center;
                gap:8px;
                letter-spacing: .1px;
            }

            .panel-subtitle{
                font-size:12px;
                color:#64748b;
                margin-top:4px;
            }

            .panel-body{
                padding: 8px 14px 18px 14px;
                background:#ffffff;
            }

            .section-label{
                font-size: 13px;
                color:#64748b;
                font-weight:700;
                margin-bottom: 8px;
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
        border-radius:18px;
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
        border-radius:20px;
        padding:20px 20px 18px 20px;
        border:1px solid rgba(15,23,42,0.08);
        box-shadow:0 10px 24px rgba(15,23,42,0.08);
        min-height:120px;
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
                margin-bottom:12px;
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
    components.html(html, height=155)

def tune_plotly(fig, height=360):
    fig.update_layout(
        height=height,
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        margin=dict(t=12, b=24, l=8, r=8),
        font=dict(color="#0f172a"),
        showlegend=False,
        xaxis_title=None,
        yaxis_title=None,
        bargap=0.18,
    )
    fig.update_xaxes(
        showgrid=False,
        zeroline=False,
        tickfont=dict(size=11, color="#64748b")
    )
    fig.update_yaxes(
        showgrid=True,
        gridcolor="rgba(15,23,42,0.07)",
        zeroline=False,
        tickfont=dict(size=11, color="#64748b")
    )
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

def render_main_login():
    inject_global_css()
    logo_html = render_logo_html()

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

    user = st.text_input("Usuário", placeholder="Digite seu usuário", key="main_login_user")
    pwd = st.text_input("Senha", type="password", placeholder="Digite sua senha", key="main_login_pass")

    entrar = st.button("Entrar", use_container_width=True, key="btn_main_login")

    if entrar:
        if (user or "").strip() == APP_USER and (pwd or "").strip() == APP_PASS:
            st.session_state.logged_in = True
            st.session_state.page = "main"
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

    c1, c2 = st.columns(2)
    with c1:
        entrar = st.button("Entrar na Operação", use_container_width=True, key="btn_oper_login")
    with c2:
        voltar = st.button("Voltar ao Painel", use_container_width=True, key="btn_oper_back")

    if entrar:
        if (user or "").strip() == OPER_USER and (pwd or "").strip() == OPER_PASS:
            st.session_state.oper_logged_in = True
            st.session_state.page = "operacao_dashboard"
            st.rerun()
        else:
            st.error("Usuário ou senha da operação inválidos.")

    if voltar:
        st.session_state.page = "main"
        st.rerun()

    st.markdown(
        """
        <div class="login-footer">Acesso interno da operação • SkoobPet</div>
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
    valid = series.notna()
    if not valid.any():
        return 0
    month_key = series.dt.strftime("%m/%Y")
    return int((month_key == str(selected_month_key)).sum())

def render_panel_card_open(title, emoji="📊", subtitle=None):
    subtitle_html = f'<div class="panel-subtitle">{subtitle}</div>' if subtitle else ""
    st.markdown(
        f'''
        <div class="panel-card">
            <div class="panel-head">
                <div class="panel-title">{emoji} {title}</div>
                {subtitle_html}
            </div>
            <div class="panel-body">
        ''',
        unsafe_allow_html=True
    )

def render_panel_card_close():
    st.markdown("</div></div>", unsafe_allow_html=True)

def render_main_dashboard(df: pd.DataFrame):
    COL = {
        "mes": "Mês",
        "raca": "Raça",
        "unidade": "Unidade",
        "c1": "1º contato",
        "s1": "Status 1º contato",
        "c2": "2º contato",
        "s2": "Status 2º contato",
        "c3": "3º contato",
        "s3": "Status 3º contato",
    }

    COL_VALOR = pick_first_existing(df, ["Valor Filhote", "Valor de filhote", "Valor Filhote ", "Valor"])
    COL_VENDEDOR = pick_first_existing(df, ["Vendedor", "Vendedora", "Atendente"])

    for key in ["c1", "c2", "c3"]:
        colname = COL.get(key)
        if colname and colname in df.columns:
            df[colname] = parse_date_series(df[colname])

    top_menu, top_l, top_mid, top_r = st.columns([1, 5, 2, 1])

    with top_menu:
        with st.popover("☰"):
            st.markdown('<div class="menu-title">Menu</div>', unsafe_allow_html=True)
            st.markdown('<div class="menu-sub">Escolha uma área para acessar</div>', unsafe_allow_html=True)
            st.markdown('<div class="menu-divider"></div>', unsafe_allow_html=True)

            st.link_button(
                "📄  Novo Contrato",
                "https://n8n.oppitech.com.br/form/55a2bd76-25c9-4ea2-82ad-f5c0ae75e19c",
                use_container_width=True
            )

            if st.button("⚙️  Operação", use_container_width=True, key="menu_operacao"):
                st.session_state.page = "operacao_login"
                st.rerun()

            if st.button("💰  Financeiro", use_container_width=True, key="menu_financeiro"):
                st.info("Área Financeiro em construção.")

            st.markdown('<div class="menu-help">Painel interno • SkoobPet</div>', unsafe_allow_html=True)

    with top_l:
        st.markdown("## 📊 Painel de Pós-Venda")
        st.caption(f"Total de registros: **{len(df)}**")

    with top_mid:
        if st.button("🔄 Atualizar agora", use_container_width=True, key="btn_refresh_main"):
            st.cache_data.clear()
            st.rerun()

    with top_r:
        if st.button("Sair", use_container_width=True, key="btn_logout_main"):
            st.session_state.logged_in = False
            st.session_state.oper_logged_in = False
            st.session_state.page = "main"
            st.rerun()

    f1, f2, f3 = st.columns(3)
    with f1:
        setor = st.selectbox("Setor", ["Pós-Venda", "Pedigree"], key="main_setor")
    with f2:
        meses = sorted(df[COL["mes"]].dropna().astype(str).unique())
        mes = st.selectbox("Mês", meses, index=len(meses)-1 if len(meses) else 0, key="main_mes")
    with f3:
        unidades = ["Todas"] + sorted(df[COL["unidade"]].dropna().astype(str).unique().tolist())
        unidade = st.selectbox("Unidade", unidades, key="main_unidade")

    f = df[df[COL["mes"]].astype(str) == str(mes)].copy()
    if unidade != "Todas":
        f = f[f[COL["unidade"]].astype(str) == str(unidade)]

    f_all = df.copy()
    if unidade != "Todas":
        f_all = f_all[f_all[COL["unidade"]].astype(str) == str(unidade)]

    records_today = []
    c1 = c2 = c3 = 0
    if setor == "Pós-Venda":
        c1 = count_today_all(f_all, COL["c1"])
        c2 = count_today_all(f_all, COL["c2"])
        c3 = count_today_all(f_all, COL["c3"])

        for _, r in f_all.iterrows():
            for dc, sc in [(COL["c1"], COL["s1"]), (COL["c2"], COL["s2"]), (COL["c3"], COL["s3"])]:
                dval = r.get(dc)
                if pd.notna(dval) and pd.to_datetime(dval).date() == hoje.date():
                    records_today.append(status_bucket_today(r.get(sc)))

    erro_hoje = records_today.count("Erro")
    vendas_mes = int(len(f))

    if COL_VALOR and (COL_VALOR in f.columns):
        faturamento = float(f[COL_VALOR].apply(brl_to_float).fillna(0).sum())
    else:
        faturamento = 0.0

    st.markdown("---")
    k1, k2, k3, k4, k5, k6 = st.columns(6)
    with k1:
        kpi_card("💬 1º contato hoje", c1, "registros de hoje", "#1B1D6D")
    with k2:
        kpi_card("💬 2º contato hoje", c2, "registros de hoje", "#2E3192")
    with k3:
        kpi_card("💬 3º contato hoje", c3, "registros de hoje", "#C00040")
    with k4:
        kpi_card("⚠️ Status com erro", erro_hoje, "atenção", "#9B0033", value_color="#ef4444" if erro_hoje else "#0f172a")
    with k5:
        kpi_card("🛍️ Vendas no mês", vendas_mes, str(mes), "#F59E0B")
    with k6:
        kpi_card("💰 Faturamento", money_br(faturamento), "valor do filhote", "#1B1D6D", value_size=28)

    st.markdown("---")
    g1, g2 = st.columns(2)
    g3, g4 = st.columns(2)

    with g1:
        render_panel_card_open("Contatos por Status (hoje)", "📌")
        counts = {"Aguardando": 0, "Enviado": 0, "Erro": 0}
        for r in records_today:
            counts[r] = counts.get(r, 0) + 1
        df_status = pd.DataFrame({"Status": list(counts.keys()), "Total": list(counts.values())})
        fig = px.pie(
            df_status,
            names="Status",
            values="Total",
            hole=0.58,
            color="Status",
            color_discrete_map={"Aguardando": "#1B1D6D", "Enviado": "#9B0033", "Erro": "#ef4444"},
        )
        fig.update_traces(textinfo="label+value", textposition="inside")
        st.plotly_chart(tune_plotly(fig, height=360), use_container_width=True)
        render_panel_card_close()

    with g2:
        render_panel_card_open("Vendas por loja (Unidade)", "🏬")
        vp = f.groupby(COL["unidade"]).size().reset_index(name="Total")
        if len(vp) == 0:
            st.info("Sem registros para o filtro selecionado.")
        else:
            fig = px.bar(
                vp,
                x=COL["unidade"],
                y="Total",
                text="Total",
                color=COL["unidade"],
                color_discrete_sequence=["#1B1D6D", "#9B0033", "#2E3192", "#C00040", "#334155", "#94a3b8"]
            )
            fig.update_traces(textposition="outside", cliponaxis=False)
            st.plotly_chart(tune_plotly(fig, height=360), use_container_width=True)
        render_panel_card_close()

    with g3:
        render_panel_card_open("Raças mais vendidas (mês)", "🐶")
        vr = (
            f.groupby(COL["raca"]).size().reset_index(name="Total")
            .sort_values("Total", ascending=False)
            .head(10)
        )
        if len(vr) == 0:
            st.info("Sem registros para o filtro selecionado.")
        else:
            fig = px.bar(
                vr,
                x=COL["raca"],
                y="Total",
                text="Total",
                color=COL["raca"],
                color_discrete_sequence=["#1B1D6D", "#9B0033", "#2E3192", "#C00040", "#334155", "#94a3b8"]
            )
            fig.update_traces(textposition="outside", cliponaxis=False)
            fig.update_xaxes(tickangle=25)
            st.plotly_chart(tune_plotly(fig, height=360), use_container_width=True)
        render_panel_card_close()

    with g4:
        render_panel_card_open("Vendas por vendedora (mês)", "🏆")
        if COL_VENDEDOR:
            vv = (
                f.groupby(COL_VENDEDOR).size().reset_index(name="Total")
                .sort_values("Total", ascending=False)
            )
            if len(vv) == 0:
                st.info("Sem registros para o filtro selecionado.")
            else:
                fig = px.bar(
                    vv,
                    x=COL_VENDEDOR,
                    y="Total",
                    text="Total",
                    color=COL_VENDEDOR,
                    color_discrete_sequence=["#1B1D6D", "#9B0033", "#2E3192", "#C00040", "#334155", "#94a3b8"]
                )
                fig.update_traces(textposition="outside", cliponaxis=False)
                fig.update_xaxes(tickangle=25)
                st.plotly_chart(tune_plotly(fig, height=360), use_container_width=True)
        else:
            st.info("Coluna de vendedor não encontrada")
        render_panel_card_close()

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

    top_l, top_mid, top_r = st.columns([6, 2, 1])

    with top_l:
        st.markdown("## ⚙️ Operação")
        st.caption(f"Total de registros: **{len(df)}**")

    with top_mid:
        if st.button("⬅️ Voltar ao Painel", use_container_width=True, key="btn_back_main"):
            st.session_state.page = "main"
            st.rerun()

    with top_r:
        if st.button("Sair", use_container_width=True, key="btn_logout_oper"):
            st.session_state.oper_logged_in = False
            st.session_state.page = "main"
            st.rerun()

    f1, f2 = st.columns(2)
    with f1:
        meses = sorted(df[COL["mes"]].dropna().astype(str).unique())
        mes = st.selectbox("Mês", meses, index=len(meses)-1 if len(meses) else 0, key="oper_mes")
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
        kpi_card("💬 1º contato hoje", primeiro_hoje, "registros de hoje", "#1B1D6D")
    with k2:
        kpi_card("💬 2º contato hoje", segundo_hoje, "registros de hoje", "#2E3192")
    with k3:
        kpi_card("💬 3º contato hoje", terceiro_hoje, "registros de hoje", "#C00040")
    with k4:
        kpi_card("🧾 Primeiro Contato Mês", primeiro_mes, str(mes), "#1B1D6D", value_size=30)
    with k5:
        kpi_card("🧾 Segundo Contato Mês", segundo_mes, str(mes), "#9B0033", value_size=30)
    with k6:
        kpi_card("🧾 Terceiro Contato Mês", terceiro_mes, str(mes), "#C00040", value_size=30)

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
            "#9B0033"
        )

    st.markdown("---")
    g1, g2 = st.columns(2)
    g3, g4 = st.columns(2)

    with g1:
        render_panel_card_open("Contatos por mês", "📞", "Distribuição mensal dos 3 contatos")
        df_contatos = pd.DataFrame({
            "Contato": ["1º contato", "2º contato", "3º contato"],
            "Total": [primeiro_mes, segundo_mes, terceiro_mes]
        })
        fig = px.bar(
            df_contatos,
            x="Contato",
            y="Total",
            text="Total",
            color="Contato",
            color_discrete_sequence=["#1B1D6D", "#9B0033", "#C00040"]
        )
        fig.update_traces(
            textposition="outside",
            cliponaxis=False,
            hovertemplate="<b>%{x}</b><br>Total: %{y}<extra></extra>"
        )
        st.plotly_chart(tune_plotly(fig, height=360), use_container_width=True)
        render_panel_card_close()

    with g2:
        render_panel_card_open("Contatos por unidade no mês", "🏬", "Linhas com pelo menos um contato no mês selecionado")

        temp = df.copy()
        for key in ["c1", "c2", "c3"]:
            temp[COL[key]] = parse_date_series(temp[COL[key]])

        if unidade != "Todas":
            temp = temp[temp[COL["unidade"]].astype(str) == str(unidade)]

        month_counts = []
        for _, row in temp.iterrows():
            hit = False
            for dc in [COL["c1"], COL["c2"], COL["c3"]]:
                dval = row.get(dc)
                if pd.notna(dval) and pd.to_datetime(dval).strftime("%m/%Y") == str(mes):
                    hit = True
                    break
            month_counts.append(hit)

        temp = temp.copy()
        temp["_tem_contato_mes"] = month_counts
        vu = (
            temp[temp["_tem_contato_mes"]]
            .groupby(COL["unidade"])
            .size()
            .reset_index(name="Total")
            .sort_values("Total", ascending=False)
        )

        if len(vu) == 0:
            st.info("Sem registros para o filtro selecionado.")
        else:
            fig = px.bar(
                vu,
                x=COL["unidade"],
                y="Total",
                text="Total",
                color=COL["unidade"],
                color_discrete_sequence=["#1B1D6D", "#9B0033", "#2E3192", "#C00040", "#334155", "#94a3b8"]
            )
            fig.update_traces(
                textposition="outside",
                cliponaxis=False,
                hovertemplate="<b>%{x}</b><br>Total: %{y}<extra></extra>"
            )
            st.plotly_chart(tune_plotly(fig, height=360), use_container_width=True)

        render_panel_card_close()

    with g3:
        render_panel_card_open("Raças mais vendidas (mês)", "🐶", "Top 10 raças do mês filtrado")

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
            fig = px.bar(
                vr,
                x=COL["raca"],
                y="Total",
                text="Total",
                color=COL["raca"],
                color_discrete_sequence=["#1B1D6D", "#9B0033", "#2E3192", "#C00040", "#334155", "#94a3b8"]
            )
            fig.update_traces(
                textposition="outside",
                cliponaxis=False,
                hovertemplate="<b>%{x}</b><br>Total: %{y}<extra></extra>"
            )
            fig.update_xaxes(tickangle=25)
            st.plotly_chart(tune_plotly(fig, height=360), use_container_width=True)

        render_panel_card_close()

    with g4:
        render_panel_card_open("Vendas por vendedora (mês)", "🏆", "Top 12 vendedoras do mês filtrado")

        if COL_VENDEDOR and COL_VENDEDOR in f_mes.columns:
            vv = (
                f_mes.groupby(COL_VENDEDOR)
                .size()
                .reset_index(name="Total")
                .sort_values("Total", ascending=False)
                .head(12)
            )

            if len(vv) == 0:
                st.info("Sem registros para o filtro selecionado.")
            else:
                fig = px.bar(
                    vv,
                    x=COL_VENDEDOR,
                    y="Total",
                    text="Total",
                    color=COL_VENDEDOR,
                    color_discrete_sequence=["#1B1D6D", "#9B0033", "#2E3192", "#C00040", "#334155", "#94a3b8"]
                )
                fig.update_traces(
                    textposition="outside",
                    cliponaxis=False,
                    hovertemplate="<b>%{x}</b><br>Total: %{y}<extra></extra>"
                )
                fig.update_xaxes(tickangle=25)
                st.plotly_chart(tune_plotly(fig, height=360), use_container_width=True)
        else:
            st.info("Coluna de vendedor/vendedora não encontrada.")

        render_panel_card_close()

# =========================================================
# FLUXO PRINCIPAL
# =========================================================
inject_global_css()

if not st.session_state.logged_in:
    render_main_login()
    st.stop()

components.html("<script>setTimeout(() => window.location.reload(), 10000);</script>", height=0)

df = load_sheet(sheet_url_busted(SHEET_CSV_URL))

if st.session_state.page == "operacao_login":
    render_oper_login()
elif st.session_state.page == "operacao_dashboard":
    if not st.session_state.oper_logged_in:
        render_oper_login()
    else:
        render_oper_dashboard(df)
else:
    render_main_dashboard(df)
