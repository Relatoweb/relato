// ============================================================
// CONFIGURAÇÃO — edite os valores abaixo antes de publicar
// ============================================================
//
// Como obter cada valor:
//
// 1. GOOGLE_CLIENT_ID
//    - Acesse https://console.cloud.google.com/
//    - Crie um projeto (ex: "Relatorio Visitas")
//    - Vá em "APIs e Serviços" → "Tela de consentimento OAuth"
//      → tipo "Externo", preencha nome, email de suporte, salve
//      → adicione os e-mails dos vendedores em "Usuários de teste"
//    - Vá em "APIs e Serviços" → "Biblioteca"
//      → habilite "Google Sheets API" e "Google Drive API"
//    - Vá em "APIs e Serviços" → "Credenciais"
//      → "Criar credenciais" → "ID do cliente OAuth"
//      → Tipo: "Aplicativo da Web"
//      → Origens JavaScript autorizadas: a URL onde o app vai rodar
//        (ex: https://SEU-USUARIO.github.io  — sem barra no final)
//        Adicione também http://localhost:8000 para testar local
//      → Copie o "ID do cliente" e cole abaixo
//
// 2. SPREADSHEET_TEMPLATE_ID  (opcional)
//    - Se quiser que o app crie uma planilha nova para cada vendedor
//      automaticamente na primeira vez, deixe vazio ("")
//    - Se quiser usar uma planilha modelo, cole aqui o ID
//      (o ID está na URL: docs.google.com/spreadsheets/d/[ESTE_ID]/edit)
//
// ============================================================

const CONFIG = {
  GOOGLE_CLIENT_ID: "881752346823-qjia58ia45b01vp7rhj4rhccab80d1k8.apps.googleusercontent.com",

  // Nome do arquivo da planilha que será criada no Drive do vendedor
  SPREADSHEET_NAME: "Relato — Visitas",

  // Nome da aba dentro da planilha
  SHEET_NAME: "Visitas",

  // Cabeçalhos das colunas (na ordem que serão gravadas)
  // Coincide com a planilha original que você me enviou
  HEADERS: [
    "Data da Visita",
    "Cidade",
    "Cliente",
    "Contato",
    "Finalidade",
    "Materiais/Segmento",
    "Obs. Planej Estoque",
    "Concorrência",
    "Data Próxima Visita",
    "Informações Relevantes",
  ],
};
