# SkoobPet — Painel Pós-Venda (Web)

Dashboard migrado de Python/Streamlit para **React + Vite + TypeScript** (frontend) e **Node.js + Express** (backend).

## Pré-requisitos

1. **Node.js LTS** (v20 ou superior) — [nodejs.org](https://nodejs.org/)
2. Credenciais do Google Sheets (service account)

## Instalação passo a passo

### 1. Instalar o Node.js

Baixe e instale o Node.js LTS. Depois, abra um **novo** terminal PowerShell e confirme:

```powershell
node -v
npm -v
```

### 2. Entrar na pasta do projeto

```powershell
cd "C:\Users\orchi\OneDrive\Desktop\painel-posvenda-novo"
```

### 3. Instalar dependências

```powershell
npm run install:all
```

> Instala apenas `backend/` e `frontend/` — não precisa de pacotes na raiz.

### 4. Configurar variáveis de ambiente

Copie o arquivo de exemplo e edite com suas credenciais:

```powershell
copy backend\.env.example backend\.env
```

Abra `backend\.env` e preencha:

- `GCP_CLIENT_EMAIL` — e-mail da service account
- `GCP_PRIVATE_KEY` — chave privada (com `\n` entre as linhas)
- `JWT_SECRET` — qualquer string longa e aleatória
- `OPER_PASS` / `FIN_PASS` — senhas de acesso

> As credenciais atuais estão em `.streamlit/secrets.toml` (versão Python).

### 5. Rodar o projeto

**Opção A — um comando (backend + frontend juntos):**
```powershell
npm run dev
```

**Opção B — dois terminais separados (se a opção A falhar):**

Terminal 1:
```powershell
cd backend
npm run dev
```

Terminal 2:
```powershell
cd frontend
npm run dev
```

Acesse:

| Serviço   | URL                        |
|-----------|----------------------------|
| Frontend  | http://localhost:5173      |
| Backend   | http://localhost:3001      |

### 6. Login

| Área       | E-mail | Senha (padrão) |
|------------|--------|----------------|
| Operação   | `Piracicaba@skoobpet.com.br`, `Campinas@skoobpet.com.br`, `Indaiatuba@skoobpet.com.br` | `100316` |
| Financeiro | `Controle@skoobpet.com.br` | `100316` |

---

## Estrutura do projeto

```
painel-posvenda-novo/
├── frontend/          # React + Vite + Tailwind
├── backend/           # Express + Google Sheets + PDF
├── app.py             # Versão Python original (Operação + Financeiro)
└── dashboard_sheets_*.py  # Versão Python original (Visão Geral + PDF)
```

## Páginas disponíveis

- **Operação** — KPIs de contato, vendas, gráficos
- **Financeiro** — faturamento, ticket médio, ranking vendedoras
- **Visão Geral** — combina operação + financeiro (planilha de contratos)
- **Novo Contrato** — formulário completo + PDF automático

## Build para produção

```powershell
npm run build
```

- Frontend: `frontend/dist/`
- Backend: `backend/dist/` → rode com `npm start --prefix backend`

## Problemas comuns

### `npm não é reconhecido`
Adicione ao PATH: `C:\Program Files\nodejs`  
Ou rode antes de cada sessão:
```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
```

### `concurrently não é reconhecido`
Já corrigido — use `npm run dev` novamente. Não precisa instalar nada na raiz.

### `vite não é reconhecido` ou erro no esbuild
A instalação do frontend pode ter falhado. Reinstale:
```powershell
cd frontend
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install
```

> **Dica:** Projetos dentro do **OneDrive** (`Desktop`) às vezes bloqueiam arquivos `.exe` do Node. Se os erros persistirem, mova o projeto para `C:\dev\painel-posvenda-novo`.

### Erro de certificado SSL (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`)
```powershell
$env:NODE_OPTIONS="--use-system-ca"
npm install --prefix frontend
npm install --prefix backend
```

Ainda funciona com:

```powershell
pip install -r requirements.txt
streamlit run app.py
```
