def extract_year_from_month_key(month_key: str):
    s = str(month_key).strip()
    m = re.search(r"(\d{4})$", s)
    if m:
        return m.group(1)
    return None


def extract_month_num_from_month_key(month_key: str):
    s = str(month_key).strip()

    m = re.match(r"^\s*(\d{1,2})\s*/\s*\d{4}\s*$", s)
    if m:
        mm = int(m.group(1))
        if 1 <= mm <= 12:
            return mm

    meses_pt = {
        "janeiro": 1,
        "fevereiro": 2,
        "marco": 3,
        "março": 3,
        "abril": 4,
        "maio": 5,
        "junho": 6,
        "julho": 7,
        "agosto": 8,
        "setembro": 9,
        "outubro": 10,
        "novembro": 11,
        "dezembro": 12,
    }

    s_low = s.lower()
    for nome, num in meses_pt.items():
        if nome in s_low:
            return num

    return None


def month_label_pt(month_num: int):
    labels = {
        1: "Jan",
        2: "Fev",
        3: "Mar",
        4: "Abr",
        5: "Mai",
        6: "Jun",
        7: "Jul",
        8: "Ago",
        9: "Set",
        10: "Out",
        11: "Nov",
        12: "Dez",
    }
    return labels.get(month_num, str(month_num))


def build_money_line(df_plot, x_col, y_col, height=360):
    d = df_plot.copy()

    fig = px.line(d, x=x_col, y=y_col, markers=True)
    fig.update_traces(
        line=dict(color=NAVY_2, width=4),
        marker=dict(size=9, color=WINE),
        text=[money_br(v) for v in d[y_col]],
        textposition="top center",
        hovertemplate="<b>%{x}</b><br>Faturamento acumulado: %{text}<extra></extra>"
    )

    fig.update_yaxes(title_text="Faturamento acumulado")
    fig.update_xaxes(title_text="Mês")
    return tune_plotly(fig, height=height)
