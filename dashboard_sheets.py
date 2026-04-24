                if pd.notna(dval) and pd.to_datetime(dval).strftime("%m/%Y") == str(mes):
                    hit = True
                    break
            month_counts.append(hit)

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
            fig = build_named_bar(vu, COL["unidade"], "Total", height=360, tickangle=18)
            st.plotly_chart(fig, use_container_width=True, key="oper_contatos_unidade")

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
        render_chart_header("Vendas por vendedora (mês)", "🏆", "Top 12 vendedoras do mês filtrado")

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
                fig = build_named_bar(vv, COL_VENDEDOR, "Total", height=390, tickangle=28)
                st.plotly_chart(fig, use_container_width=True, key="oper_vendedoras")
        else:
            st.info("Coluna de vendedor/vendedora não encontrada.")


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

            st.markdown(
                """
                <a href="https://n8n.oppitech.com.br/form/55a2bd76-25c9-4ea2-82ad-f5c0ae75e19c"
                   target="_blank"
                   class="menu-link-btn">
                    📄&nbsp;&nbsp;Novo Contrato
                </a>
                """,
                unsafe_allow_html=True
            )

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

    f1, f_logo, f2 = st.columns([6, 1.1, 6])

    with f1:
        meses = sorted(df[COL_MES].dropna().astype(str).unique())
        mes = st.selectbox("Mês", meses, index=len(meses)-1 if len(meses) else 0, key="fin_mes")

    with f_logo:
        logo_b64 = img_to_base64("skoobpet.png")
        if logo_b64:
            st.markdown(
                f"""
                <div style="
                    display:flex;
                    justify-content:center;
                    align-items:center;
                    margin-top:-58px;
                    min-height:68px;
                ">
                    <img src="data:image/png;base64,{logo_b64}"
                         style="
                            width:72px;
                            height:72px;
                            object-fit:contain;
                            border-radius:50%;
                            background:#ffffff;
                            padding:6px;
                            box-shadow:0 10px 24px rgba(15,23,42,0.12);
                         ">
                </div>
                """,
                unsafe_allow_html=True
            )
        else:
            st.markdown(
                """
                <div style="
                    display:flex;
                    justify-content:center;
                    align-items:center;
                    margin-top:-58px;
                    min-height:68px;
                ">
                    <div style="
                        width:72px;
                        height:72px;
                        border-radius:50%;
                        background:#ffffff;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        font-size:30px;
                        box-shadow:0 10px 24px rgba(15,23,42,0.12);
                    ">🐾</div>
                </div>
                """,
                unsafe_allow_html=True
            )

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
                fig = build_money_bar(
                    df_unidade_valor,
                    COL_UNIDADE,
                    "Faturamento",
                    height=390,
                    tickangle=18
                )
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


# =========================================================
# FLUXO PRINCIPAL
# =========================================================
inject_global_css()

if st.session_state.page == "operacao_login":
    render_oper_login()
    st.stop()

if not st.session_state.oper_logged_in:
    st.session_state.page = "operacao_login"
    render_oper_login()
    st.stop()

components.html("<script>setTimeout(() => window.location.reload(), 10000);</script>", height=0)

df = load_sheet(sheet_url_busted(SHEET_CSV_URL))

if st.session_state.page == "financeiro_login":
    render_fin_login()
elif st.session_state.page == "financeiro_dashboard":
    if not st.session_state.fin_logged_in:
        render_fin_login()
    else:
        render_fin_dashboard(df)
else:
    render_oper_dashboard(df)
