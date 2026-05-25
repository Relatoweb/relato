# relato.

App leve de registro de visitas para equipes de vendas externas.

Cada vendedor entra com a própria conta Google e os dados vão direto pra uma planilha criada no Drive dele. Sem backend, sem banco, sem custo.

```
[Vendedor] → [Relato no GitHub Pages] → [Login Google direto no browser]
                                      ↓
                             [Google Sheets API
                              escreve na planilha
                              do próprio usuário]
```

**Stack:** HTML + JS puro · Google Identity Services · Google Sheets API v4

---

## Setup (passo único, ~10 minutos)

### 1. Criar projeto no Google Cloud Console

1. Acesse https://console.cloud.google.com/
2. Clique no seletor de projeto (topo) → **Novo projeto** → nome livre (ex: `Relato`) → criar.
3. Com o projeto selecionado, vá em **APIs e Serviços → Biblioteca** e habilite:
   - **Google Sheets API**
   - **Google Drive API**

### 2. Configurar tela de consentimento OAuth

1. **APIs e Serviços → Tela de consentimento OAuth**
2. Tipo de usuário: **Externo** → criar.
3. Preencha:
   - Nome do app: `Relato`
   - E-mail de suporte: seu e-mail
   - E-mail de contato do desenvolvedor: seu e-mail
4. **Escopos**: pode pular (são definidos pelo código).
5. **Usuários de teste**: adicione o e-mail de cada vendedor que vai usar o Relato. Enquanto o app estiver em modo "Teste" só esses e-mails conseguem entrar.
6. Salvar.

### 3. Criar credencial OAuth

1. **APIs e Serviços → Credenciais → Criar credenciais → ID do cliente OAuth**
2. Tipo: **Aplicativo da Web**
3. Nome: `Relato — Web`
4. **Origens JavaScript autorizadas** — adicione:
   - `http://localhost:8000` (para testar localmente)
   - `https://SEU-USUARIO.github.io` (URL final do GitHub Pages, sem barra no final)
5. **URIs de redirecionamento autorizados**: pode deixar vazio.
6. Criar → copie o **ID do cliente**.

### 4. Configurar o app

Abra `config.js` e cole o ID do cliente em `GOOGLE_CLIENT_ID`.

### 5. Testar localmente

```bash
cd relato
python3 -m http.server 8000
```

Abra http://localhost:8000 e faça login. Na primeira vez o Google pede confirmação dos escopos. Depois o Relato cria automaticamente a planilha `Relato — Visitas` no Drive do usuário.

### 6. Publicar no GitHub Pages

Crie um repositório com **nome aleatório** (pra URL ser difícil de adivinhar):

```bash
# Gere um sufixo aleatório:
openssl rand -hex 6
# → ex: a3f9c1d2b8e7

# Crie e suba:
cd relato
git init
git add .
git commit -m "v1"
gh repo create relato-a3f9c1d2b8e7 --public --source=. --push
```

No GitHub:
- **Settings → Pages** → Source: `main` branch → `/ (root)` → save.
- Em 1-2 min: `https://SEU-USUARIO.github.io/relato-a3f9c1d2b8e7/`

**Importante:** volte no Google Cloud Console e adicione essa URL exata em **Origens JavaScript autorizadas**.

---

## Como usar (perspectiva do vendedor)

1. Abre o link do Relato no celular ou no computador.
2. Clica em "Entrar com Google" e usa a conta liberada.
3. Na primeira vez, autoriza o Relato a criar uma planilha no Drive dele.
4. Preenche o formulário após cada visita → "Salvar visita".
5. Pode ver/editar todos os dados na planilha (link no rodapé do app).

A planilha fica no Drive do próprio vendedor. Você (admin) não tem acesso direto a ela. Pra consolidar tudo numa única planilha, ele precisa compartilhar com você.

---

## Identidade visual

- **Nome:** Relato (sempre com inicial maiúscula; "relato." em minúsculas como logotipo)
- **Cor principal:** verde-petróleo `#0e5e5a`
- **Fundo:** off-white `#f5f3ee`
- **Tipografia:** Fraunces (display) + IBM Plex Sans (corpo)
- **Símbolo:** pin de mapa contendo "R" — sugere marcar onde a visita aconteceu

---

## Estrutura

```
relato/
├── index.html      ← UI (HTML + CSS inline)
├── app.js          ← OAuth, criação da planilha, gravação
├── config.js       ← Configuração (editar antes de publicar)
└── README.md       ← Este arquivo
```

---

## Próximas iterações (para usar no Claude Code)

- **Lista de visitas recentes** dentro do app
- **Autocomplete de clientes** baseado nas visitas anteriores
- **Modo offline** — guarda no localStorage e sincroniza
- **Resumo com IA** — botão que chama a API do Claude pra resumir anotações
- **Dashboard** — outra página com gráficos de visitas por cidade/mês

```bash
claude   # abre o Claude Code na pasta do projeto
```

---

## Resolução de problemas

**"Erro 403: access_denied"** — o e-mail não está na lista de usuários de teste no console OAuth. Adicione e tente novamente.

**"redirect_uri_mismatch" ou origem não autorizada** — a URL onde você está rodando não está na lista de Origens JavaScript autorizadas.

**"401 Unauthorized" ao salvar** — o token expirou. O app pede um novo automaticamente; tente salvar de novo.

**A planilha não aparece** — confira no Drive do usuário se existe um arquivo chamado `Relato — Visitas`. Se foi renomeado, o app não acha e cria outra.
