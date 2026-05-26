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
      try {
        await ensureSpreadsheet();
        showForm();
      } catch (e) {
        // Detecta o erro mais comum (403 PERMISSION_DENIED) e mostra
        // mensagem amigável + botão de reset automático
        if (
          String(e.message).includes("403") ||
          String(e.message).includes("PERMISSION_DENIED") ||
          String(e.message).includes("insufficient")
        ) {
          showPermissionError();
        } else {
          showLoginError("Erro ao preparar planilha: " + e.message);
        }
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
  $("dashboard-screen")?.classList.add("hidden");
  $("nav-form-btn")?.classList.add("active");
  $("nav-dashboard-btn")?.classList.remove("active");
  if (state.user) {
    $("user-avatar").src = state.user.picture || "";
    $("user-avatar").alt = state.user.name || "";
  }
  $("open-sheet-link").href = `https://docs.google.com/spreadsheets/d/${state.spreadsheetId}/edit`;

  // Default da data: hoje
  const today = new Date().toISOString().slice(0, 10);
  if (!$("data_visita").value) $("data_visita").value = today;

  // Carrega sugestões de autocomplete em background (não bloqueia)
  loadVisitsCached().then(populateAutocomplete).catch(() => {});
}

// Mostra a tela do dashboard e carrega dados
async function showDashboard() {
  $("login-screen").classList.add("hidden");
  $("app-header").classList.remove("hidden");
  $("form-screen").classList.add("hidden");
  $("dashboard-screen").classList.remove("hidden");
  $("nav-form-btn")?.classList.remove("active");
  $("nav-dashboard-btn")?.classList.add("active");

  // Reseta estados
  $("dashboard-loading").classList.remove("hidden");
  $("dashboard-empty").classList.add("hidden");
  $("dashboard-error").classList.add("hidden");
  $("dashboard-content").classList.add("hidden");

  try {
    const visits = await loadVisitsCached();
    $("dashboard-loading").classList.add("hidden");
    if (!visits || visits.length === 0) {
      $("dashboard-empty").classList.remove("hidden");
      return;
    }
    $("dashboard-content").classList.remove("hidden");
    renderDashboard(visits);
  } catch (e) {
    $("dashboard-loading").classList.add("hidden");
    $("dashboard-error").classList.remove("hidden");
    console.error("Erro ao carregar dashboard:", e);
  }
}

function showLoginError(msg) {
  let host = $("google-button-host");
  if (host) {
    host.innerHTML = `<div style="color: var(--danger); font-size: 13px; padding: 10px; border: 1px solid var(--danger); max-width: 360px; text-align: left;">${msg}</div>`;
  }
}

// Mensagem amigável + botão de reset pra erro 403/PERMISSION_DENIED.
// É de longe o erro mais comum (e o mais confuso pro usuário leigo).
// Causa típica: usuário desmarcou alguma caixinha de permissão no Google,
// ou token velho em cache sem permissões corretas.
function showPermissionError() {
  const host = $("google-button-host");
  if (!host) return;
  host.innerHTML = `
    <div style="text-align: left; max-width: 380px; padding: 14px 16px; border: 1px solid var(--danger); border-left: 4px solid var(--danger); background: #faecec; color: #6e1612;">
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px;">
        ⚠️ Faltam permissões para o Relato funcionar
      </div>
      <div style="font-size: 13px; line-height: 1.55; margin-bottom: 12px;">
        Provavelmente alguma caixinha de permissão ficou
        <strong>desmarcada</strong> quando o Google pediu autorização.
        Clique no botão abaixo para resetar e tentar de novo —
        e desta vez <strong>marque todas as caixinhas</strong>.
      </div>
      <button id="reset-login-btn"
        style="background: var(--accent); color: white; border: none; padding: 10px 16px;
               font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%;">
        🔄 Resetar login e tentar de novo
      </button>
    </div>
  `;
  $("reset-login-btn")?.addEventListener("click", resetEverything);
}

// Faz uma limpeza COMPLETA do estado de autenticação:
// 1. Revoga o access token atual no Google (se houver)
// 2. Desabilita auto-select do One Tap
// 3. Limpa sessionStorage do app
// 4. Recarrega a página para um login totalmente do zero
async function resetEverything() {
  try {
    if (state.accessToken) {
      // Revoga o token atual — não bloqueia se falhar
      await new Promise((resolve) => {
        try {
          google.accounts.oauth2.revoke(state.accessToken, resolve);
          // failsafe se o callback não vier
          setTimeout(resolve, 1500);
        } catch {
          resolve();
        }
      });
    }
    // Desabilita auto-select pra forçar a tela de escolha de conta
    try {
      google.accounts.id.disableAutoSelect();
    } catch {}
  } finally {
    sessionStorage.clear();
    // Recarrega forçando bypass de cache
    location.reload();
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
$("nav-form-btn")?.addEventListener("click", showForm);
$("nav-dashboard-btn")?.addEventListener("click", showDashboard);
$("dashboard-retry")?.addEventListener("click", () => {
  visitsCache = null;
  showDashboard();
});
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
    // Invalida cache pra próxima vez que o dashboard/autocomplete carregar
    visitsCache = null;
    visitsCacheAt = 0;
    // Recarrega sugestões de autocomplete em background
    loadVisitsCached().then(populateAutocomplete).catch(() => {});
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

// ============================================================
// Autocomplete + Dashboard
// ============================================================
// Cache de visitas em memória — evita reler a planilha toda hora.
// Vale 5 minutos por padrão. É invalidado após salvar nova visita.
let visitsCache = null;
let visitsCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Lê toda a aba "Visitas" e devolve objetos {data, cidade, cliente, ...}
async function loadVisitsCached() {
  const now = Date.now();
  if (visitsCache && now - visitsCacheAt < CACHE_TTL_MS) {
    return visitsCache;
  }
  if (!state.spreadsheetId || !state.accessToken) return [];

  const range = encodeURIComponent(`${CONFIG.SHEET_NAME}!A2:J`); // pula header
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${state.spreadsheetId}/values/${range}`;
  const data = await sheetsApi(url);
  const rows = data.values || [];

  // Mapeia pra objetos pra ficar mais fácil de usar
  const visits = rows
    .filter((r) => r && (r[0] || r[2])) // tem que ter pelo menos data ou cliente
    .map((r) => ({
      data: r[0] || "",
      cidade: r[1] || "",
      cliente: r[2] || "",
      contato: r[3] || "",
      finalidade: r[4] || "",
      materiais: r[5] || "",
      estoque: r[6] || "",
      concorrencia: r[7] || "",
      proxima: r[8] || "",
      info: r[9] || "",
    }));

  visitsCache = visits;
  visitsCacheAt = now;
  return visits;
}

// Popula os 4 datalists com valores únicos das visitas anteriores
function populateAutocomplete(visits) {
  if (!visits || visits.length === 0) return;
  fillDatalist("suggest-clientes", uniqueValues(visits, "cliente"));
  fillDatalist("suggest-cidades", uniqueValues(visits, "cidade"));
  fillDatalist("suggest-contatos", uniqueValues(visits, "contato"));
  fillDatalist("suggest-finalidades", uniqueValues(visits, "finalidade"));
}

function uniqueValues(visits, key) {
  const seen = new Map();
  for (const v of visits) {
    const val = (v[key] || "").trim();
    if (!val) continue;
    const lower = val.toLowerCase();
    if (!seen.has(lower)) seen.set(lower, val); // preserva a primeira grafia
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function fillDatalist(id, values) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = values
    .map((v) => `<option value="${escapeAttr(v)}"></option>`)
    .join("");
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ============================================================
// Renderização do Dashboard
// ============================================================
function renderDashboard(visits) {
  renderKPIs(visits);
  renderMonthChart(visits);
  renderBarList("chart-clients", topCount(visits, "cliente", 10));
  renderBarList("chart-cities", topCount(visits, "cidade", 10));
  renderPie("chart-purpose", topCount(visits, "finalidade", 6));
}

// Cards do topo: total, este mês, média semanal últimos 3 meses
function renderKPIs(visits) {
  const total = visits.length;
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  let thisMonth = 0;
  let last3MonthsCount = 0;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 3);

  for (const v of visits) {
    const d = parseDateBR(v.data);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key === thisMonthKey) thisMonth++;
    if (d >= cutoff && d <= now) last3MonthsCount++;
  }
  // 3 meses ≈ 13 semanas
  const weekly = last3MonthsCount > 0 ? (last3MonthsCount / 13).toFixed(1) : "0";

  $("kpi-total").textContent = total;
  $("kpi-month").textContent = thisMonth;
  $("kpi-weekly").textContent = weekly;
}

// Converte DD/MM/YYYY para Date; aceita também YYYY-MM-DD como fallback
function parseDateBR(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

// Conta ocorrências de um campo e devolve top N {label, count}
function topCount(visits, key, n) {
  const counts = new Map();
  for (const v of visits) {
    const val = (v[key] || "").trim();
    if (!val) continue;
    // Agrupa case-insensitive mas mantém a grafia mais frequente
    const lower = val.toLowerCase();
    const entry = counts.get(lower) || { label: val, count: 0 };
    entry.count++;
    counts.set(lower, entry);
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

// Gráfico de barras horizontais (top clientes / top cidades)
function renderBarList(containerId, data) {
  const container = $(containerId);
  if (!container) return;
  if (data.length === 0) {
    container.innerHTML = `<p style="color: var(--muted); font-size: 12px; padding: 10px 0;">Sem dados ainda.</p>`;
    return;
  }
  const max = data[0].count;
  container.innerHTML = `
    <div class="bar-list">
      ${data
        .map((row) => {
          const pct = max > 0 ? (row.count / max) * 100 : 0;
          return `
            <div class="bar-row">
              <span class="bar-name" title="${escapeAttr(row.label)}">${escapeHtml(row.label)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${pct.toFixed(1)}%"></span></span>
              <span class="bar-count">${row.count}</span>
            </div>`;
        })
        .join("")}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Gráfico de linha — visitas por mês nos últimos 6 meses
function renderMonthChart(visits) {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      count: 0,
    });
  }
  const idx = Object.fromEntries(months.map((m, i) => [m.key, i]));
  for (const v of visits) {
    const d = parseDateBR(v.data);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key in idx) months[idx[key]].count++;
  }

  const max = Math.max(1, ...months.map((m) => m.count));
  const W = 560;
  const H = 200;
  const padL = 30;
  const padR = 16;
  const padT = 14;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX = innerW / (months.length - 1);

  // Pontos da linha
  const points = months.map((m, i) => {
    const x = padL + i * stepX;
    const y = padT + innerH - (m.count / max) * innerH;
    return { x, y, ...m };
  });

  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");
  const areaPath =
    linePath +
    ` L ${padL + innerW} ${padT + innerH} L ${padL} ${padT + innerH} Z`;

  // Linhas de grid: 4 horizontais
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((p) => padT + innerH * p);
  const yLabels = [0, 0.5, 1].map((p) => Math.round(max * (1 - p)));

  $("chart-month").innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${gridY
        .map(
          (y) =>
            `<line x1="${padL}" x2="${padL + innerW}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1" stroke-dasharray="${y === padT + innerH ? "0" : "2,3"}" />`,
        )
        .join("")}
      ${yLabels
        .map(
          (val, i) =>
            `<text x="${padL - 6}" y="${padT + (innerH * i) / 2 + 4}" font-size="10" text-anchor="end" fill="var(--muted)" font-family="IBM Plex Sans">${val}</text>`,
        )
        .join("")}
      <path d="${areaPath}" fill="var(--accent-soft)" opacity="0.6" />
      <path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      ${points
        .map(
          (p) => `
        <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="var(--accent)" />
        <text x="${p.x}" y="${p.y - 8}" font-size="10" text-anchor="middle" fill="var(--ink)" font-weight="600" font-family="IBM Plex Sans">${p.count > 0 ? p.count : ""}</text>
        <text x="${p.x}" y="${H - 10}" font-size="10" text-anchor="middle" fill="var(--muted)" font-family="IBM Plex Sans">${p.label}</text>
      `,
        )
        .join("")}
    </svg>
  `;
}

// Gráfico de pizza — top finalidades
function renderPie(containerId, data) {
  const container = $(containerId);
  if (!container) return;
  if (data.length === 0) {
    container.innerHTML = `<p style="color: var(--muted); font-size: 12px; padding: 10px 0;">Sem dados ainda.</p>`;
    return;
  }
  const total = data.reduce((s, d) => s + d.count, 0);
  // Paleta harmoniosa com o verde principal
  const colors = [
    "#0e5e5a",
    "#1d8b85",
    "#3aa8a2",
    "#c87a1f",
    "#e0a358",
    "#6b6b6b",
  ];

  const cx = 70;
  const cy = 70;
  const r = 60;
  let angle = -Math.PI / 2; // começa no topo
  const slices = data.map((d, i) => {
    const fraction = d.count / total;
    const a1 = angle;
    const a2 = angle + fraction * Math.PI * 2;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    const largeArc = fraction > 0.5 ? 1 : 0;
    const path =
      fraction >= 0.999
        ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    angle = a2;
    return { path, color: colors[i % colors.length], ...d, pct: fraction * 100 };
  });

  container.innerHTML = `
    <div class="pie-wrap">
      <svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" style="width: 140px; height: 140px;">
        ${slices.map((s) => `<path d="${s.path}" fill="${s.color}" stroke="#fff" stroke-width="1" />`).join("")}
      </svg>
      <div class="pie-legend">
        ${slices
          .map(
            (s) => `
          <div class="pie-legend-item">
            <span class="swatch" style="background:${s.color}"></span>
            <span class="lbl" title="${escapeAttr(s.label)}">${escapeHtml(s.label)}</span>
            <span class="pct">${s.count} · ${s.pct.toFixed(0)}%</span>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
  `;
}
