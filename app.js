// ============================================================
// Relatório de Visitas — frontend puro
// Login Google + Sheets API direto do browser. Sem backend.
// ============================================================

const SCOPES = [
  // file: cria/edita só arquivos criados por este app (mínimo necessário)
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "openid",
  "email",
  "profile",
].join(" ");

const state = {
  user: null,
  accessToken: null,
  spreadsheetId: null,
  tokenClient: null,
};

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------
// Inicialização
// ------------------------------------------------------------
window.addEventListener("load", () => {
  // Espera o GSI carregar (script async)
  const waitGsi = setInterval(() => {
    if (window.google && window.google.accounts) {
      clearInterval(waitGsi);
      initAuth();
    }
  }, 50);
});

function initAuth() {
  if (
    !CONFIG.GOOGLE_CLIENT_ID ||
    CONFIG.GOOGLE_CLIENT_ID.startsWith("COLE_AQUI")
  ) {
    showLoginError(
      "Configuração ausente: edite config.js e cole seu GOOGLE_CLIENT_ID antes de usar.",
    );
    return;
  }

  // Botão de Sign-In oficial do Google (renderizado por eles)
  google.accounts.id.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    auto_select: false,
  });
  google.accounts.id.renderButton($("google-button-host"), {
    theme: "filled_black",
    size: "large",
    text: "signin_with",
    shape: "rectangular",
    logo_alignment: "left",
  });

  // Token client (OAuth para chamar APIs)
  state.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: async (resp) => {
      if (resp.error) {
        return showLoginError("Erro de autorização: " + resp.error);
      }
      state.accessToken = resp.access_token;
      // Persiste por enquanto que a aba está aberta (sessionStorage seria
      // ideal, mas para artefatos rodando em GitHub Pages é ok manter
      // só em memória — o usuário re-loga ao recarregar)
      try {
        await ensureSpreadsheet();
        showForm();
      } catch (e) {
        showLoginError("Erro ao preparar planilha: " + e.message);
      }
    },
  });

  // Restaura sessão se houver
  const savedUser = sessionStorage.getItem("rv_user");
  const savedSheet = sessionStorage.getItem("rv_sheet_id");
  if (savedUser) {
    state.user = JSON.parse(savedUser);
    state.spreadsheetId = savedSheet;
    // Re-pedir token (silencioso se possível)
    state.tokenClient.requestAccessToken({ prompt: "" });
  }
}

// ------------------------------------------------------------
// Login (One Tap / botão)
// ------------------------------------------------------------
function handleCredentialResponse(response) {
  // O credential é um JWT com os dados do usuário (id_token)
  const payload = parseJwt(response.credential);
  state.user = {
    name: payload.name,
    email: payload.email,
    picture: payload.picture,
  };
  sessionStorage.setItem("rv_user", JSON.stringify(state.user));
  // Agora pede o access token (precisa de gesto do usuário, e o botão já foi)
  state.tokenClient.requestAccessToken({ prompt: "consent" });
}

function parseJwt(token) {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  );
  return JSON.parse(json);
}

function logout() {
  if (state.accessToken) {
    google.accounts.oauth2.revoke(state.accessToken, () => {});
  }
  sessionStorage.clear();
  state.user = null;
  state.accessToken = null;
  state.spreadsheetId = null;
  location.reload();
}

// ------------------------------------------------------------
// Garantir que existe a planilha do usuário
// ------------------------------------------------------------
async function ensureSpreadsheet() {
  // Se já temos o ID em sessão, valida; senão, procura/cria
  if (state.spreadsheetId) {
    try {
      await sheetsApi(
        `https://sheets.googleapis.com/v4/spreadsheets/${state.spreadsheetId}?fields=spreadsheetId`,
      );
      return;
    } catch {
      state.spreadsheetId = null;
    }
  }

  // Procura no Drive uma planilha criada por este app com o nome configurado
  const q = encodeURIComponent(
    `name = '${CONFIG.SPREADSHEET_NAME.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
  );
  const search = await driveApi(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
  );

  if (search.files && search.files.length > 0) {
    state.spreadsheetId = search.files[0].id;
  } else {
    // Cria a planilha do zero
    const created = await sheetsApi(
      "https://sheets.googleapis.com/v4/spreadsheets",
      "POST",
      {
        properties: { title: CONFIG.SPREADSHEET_NAME },
        sheets: [{ properties: { title: CONFIG.SHEET_NAME } }],
      },
    );
    state.spreadsheetId = created.spreadsheetId;
    // Escreve o cabeçalho
    await sheetsApi(
      `https://sheets.googleapis.com/v4/spreadsheets/${state.spreadsheetId}/values/${encodeURIComponent(CONFIG.SHEET_NAME)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      "POST",
      { values: [CONFIG.HEADERS] },
    );
    // Formata o cabeçalho em negrito + congelado
    const sheetMeta = await sheetsApi(
      `https://sheets.googleapis.com/v4/spreadsheets/${state.spreadsheetId}?fields=sheets.properties`,
    );
    const sheetId = sheetMeta.sheets[0].properties.sheetId;
    await sheetsApi(
      `https://sheets.googleapis.com/v4/spreadsheets/${state.spreadsheetId}:batchUpdate`,
      "POST",
      {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
              },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: { red: 0.92, green: 0.92, blue: 0.92 },
                },
              },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: { frozenRowCount: 1 },
              },
              fields: "gridProperties.frozenRowCount",
            },
          },
        ],
      },
    );
  }
  sessionStorage.setItem("rv_sheet_id", state.spreadsheetId);
}

// ------------------------------------------------------------
// Wrappers fetch
// ------------------------------------------------------------
async function apiFetch(url, method = "GET", body = null) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status} — ${txt.slice(0, 200)}`);
  }
  return res.json();
}
const sheetsApi = apiFetch;
const driveApi = apiFetch;

// ------------------------------------------------------------
// UI
// ------------------------------------------------------------
function showForm() {
  $("login-screen").classList.add("hidden");
  $("app-header").classList.remove("hidden");
  $("form-screen").classList.remove("hidden");
  if (state.user) {
    $("user-avatar").src = state.user.picture || "";
    $("user-avatar").alt = state.user.name || "";
  }
  $("open-sheet-link").href = `https://docs.google.com/spreadsheets/d/${state.spreadsheetId}/edit`;

  // Default da data: hoje
  const today = new Date().toISOString().slice(0, 10);
  if (!$("data_visita").value) $("data_visita").value = today;
}

function showLoginError(msg) {
  let host = $("google-button-host");
  if (host) {
    host.innerHTML = `<div style="color: var(--danger); font-size: 13px; padding: 10px; border: 1px solid var(--danger); max-width: 360px; text-align: left;">${msg}</div>`;
  }
}

function setStatus(msg, type = "ok") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status show" + (type === "error" ? " error" : "");
  if (type !== "error") {
    setTimeout(() => el.classList.remove("show"), 5000);
  }
}

// ------------------------------------------------------------
// Submit
// ------------------------------------------------------------
$("logout-btn")?.addEventListener("click", logout);
$("clear-btn")?.addEventListener("click", () => {
  $("visit-form").reset();
  $("data_visita").value = new Date().toISOString().slice(0, 10);
});
$("visit-form")?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const required = ["data_visita", "cidade", "cliente"];
  for (const id of required) {
    if (!$(id).value.trim()) {
      $(id).focus();
      setStatus("Preencha os campos obrigatórios.", "error");
      return;
    }
  }

  const row = [
    formatDateBR($("data_visita").value),
    $("cidade").value.trim(),
    $("cliente").value.trim(),
    $("contato").value.trim(),
    $("finalidade").value.trim(),
    $("materiais").value.trim(),
    $("estoque").value.trim(),
    $("concorrencia").value.trim(),
    $("proxima").value ? formatDateBR($("proxima").value) : "",
    $("info").value.trim(),
  ];

  const btn = $("submit-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span>Salvando...';

  try {
    await sheetsApi(
      `https://sheets.googleapis.com/v4/spreadsheets/${state.spreadsheetId}/values/${encodeURIComponent(CONFIG.SHEET_NAME)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      "POST",
      { values: [row] },
    );
    setStatus("✓ Visita salva na sua planilha.");
    $("visit-form").reset();
    $("data_visita").value = new Date().toISOString().slice(0, 10);
  } catch (e) {
    if (
      String(e.message).includes("401") ||
      String(e.message).includes("invalid_token")
    ) {
      // Token expirou — pede novo
      state.tokenClient.requestAccessToken({ prompt: "" });
      setStatus("Sessão expirada. Tente salvar novamente.", "error");
    } else {
      setStatus("Erro ao salvar: " + e.message, "error");
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Salvar visita";
  }
});

function formatDateBR(iso) {
  // YYYY-MM-DD → DD/MM/YYYY (igual ao formato da sua planilha original)
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
