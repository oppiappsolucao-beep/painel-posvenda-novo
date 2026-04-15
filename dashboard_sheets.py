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

    fig.add_scatter(
        x=d["Mês"],
        y=d["Acumulado"],
        mode="lines+markers+text",
        name="Acumulado",
        line=dict(color=WINE, width=4),
        marker=dict(size=9, color=WINE),
        text=[money_br(v) for v in d["Acumulado"]],
        textposition="top center",
        hovertemplate="<b>%{x}</b><br>Acumulado: %{text}<extra></extra>"
    )

    fig.update_layout(
        height=height,
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        margin=dict(t=8, b=52, l=10, r=10),
        font=dict(color="#0f172a"),
        bargap=0.22,
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        )
    )

    fig.update_xaxes(
        title_text="Mês",
        showgrid=False,
        zeroline=False,
        tickfont=dict(size=12, color=GRAY_TEXT)
    )

    fig.update_yaxes(
        title_text="Valor",
        showgrid=True,
        gridcolor="rgba(100,116,139,0.12)",
        zeroline=False,
        tickfont=dict(size=12, color=GRAY_TEXT)
    )

    return fig
