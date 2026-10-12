const config = window.APP_BOOTSTRAP || {};
const root = document.getElementById('app');
const SESSION_STORAGE_KEY = 'gestionClub.sessionToken';
let sessionToken = sessionStorage.getItem(SESSION_STORAGE_KEY) || '';
let currentUser = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function requestId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '_');
  return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 14);
}

function serverApi(request) {
  return new Promise((resolve, reject) => {
    if (!window.google?.script?.run) {
      reject(new Error('Esta interfaz debe abrirse desde la URL /exec de Apps Script.'));
      return;
    }
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error('El backend está tardando demasiado en responder.'));
    }, 30000);
    google.script.run
      .withSuccessHandler(response => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(response);
      })
      .withFailureHandler(error => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(new Error(error?.message || String(error)));
      })
      .api(request);
  });
}

async function call(action, payload = {}, fixedRequestId = null) {
  const response = await serverApi({
    action,
    payload,
    sessionToken,
    requestId: fixedRequestId || requestId(),
    clientVersion: config.appVersion
  });
  if (!response?.ok) {
    const error = new Error(response?.error?.message || 'La operación no pudo completarse.');
    error.code = response?.error?.code || 'UNKNOWN_ERROR';
    error.requestId = response?.requestId || '';
    if (['AUTH_REQUIRED', 'INVALID_SESSION', 'SESSION_EXPIRED', 'ACCOUNT_DISABLED'].includes(error.code)) clearSession();
    throw error;
  }
  return response;
}

function saveSession(data) {
  sessionToken = data.sessionToken || '';
  currentUser = data.user || null;
  if (sessionToken) sessionStorage.setItem(SESSION_STORAGE_KEY, sessionToken);
}

function clearSession() {
  sessionToken = '';
  currentUser = null;
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function shell(content) {
  root.className = '';
  root.innerHTML = `
    <header class="topbar">
      <div class="brand"><span class="brand-mark">GC</span><div><strong>${escapeHtml(config.appName || 'Gestión Club')}</strong><small>Versión ${escapeHtml(config.appVersion || '?')} · ${escapeHtml(config.environment || 'sin configurar')}</small></div></div>
      ${currentUser ? `<div class="session"><span>${escapeHtml(currentUser.email)}</span><button class="button ghost" id="logout">Salir</button></div>` : ''}
    </header>
    <main class="container">${content}</main>
    <footer>Prueba técnica 0.1.0 · No utilizar datos personales reales</footer>`;
  const logoutButton = document.getElementById('logout');
  if (logoutButton) logoutButton.onclick = logout;
}

function showMessage(message, kind = 'info') {
  const host = document.getElementById('message');
  if (!host) return;
  host.className = `message ${kind}`;
  host.textContent = message;
}

function renderLogin() {
  shell(`
    <section class="hero narrow">
      <span class="eyebrow">Circuito técnico 0.1.0</span>
      <h1>Comprueba que toda la arquitectura funciona</h1>
      <p>Autenticación propia con usuarios en Google Sheets. La prueba escribirá un registro ficticio en Sheets y actualizará un archivo privado en Drive.</p>
    </section>
    <section class="panel narrow">
      <form id="login-form" class="form-stack">
        <label>Correo electrónico<input id="email" type="email" autocomplete="username" required></label>
        <label>Contraseña<input id="password" type="password" autocomplete="current-password" required></label>
        <button class="button primary" type="submit">Entrar</button>
      </form>
      <p class="helper">En esta versión técnica el primer administrador se crea desde Apps Script ejecutando <code>createBootstrapAdmin()</code> después de configurar las propiedades bootstrap.</p>
      <div id="message" class="message" aria-live="polite"></div>
    </section>`);

  document.getElementById('login-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    showMessage('Validando cuenta…');
    try {
      const response = await call('login', {
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value
      });
      saveSession(response.data);
      await renderDashboard();
    } catch (error) {
      showMessage(error.message, 'error');
      button.disabled = false;
    }
  };
}

async function logout() {
  try { if (sessionToken) await call('logout'); } catch (error) { /* sesión local se limpia igualmente */ }
  clearSession();
  renderLogin();
}

function statusCard(title, state, detail) {
  return `<article class="status-card ${state ? 'ok' : 'pending'}"><span class="status-dot"></span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div></article>`;
}

async function renderDashboard() {
  shell(`
    <section class="hero">
      <span class="eyebrow">Administrador técnico</span>
      <h1>Estado de la infraestructura</h1>
      <p>Esta pantalla no contiene todavía módulos funcionales del club.</p>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><h2>Comprobación de acceso</h2><p>Lectura segura del backend y de los recursos configurados.</p></div><button class="button secondary" id="refresh-status">Actualizar</button></div>
      <div id="status-grid" class="status-grid">${statusCard('Autenticación', true, currentUser?.email || 'Sesión activa')}${statusCard('Backend', false, 'Comprobando…')}${statusCard('Google Sheets', false, 'Comprobando…')}${statusCard('Google Drive', false, 'Comprobando…')}</div>
    </section>
    <section class="panel test-panel">
      <div><span class="eyebrow">Prueba de escritura</span><h2>Ejecutar circuito completo</h2><p>Inserta una fila técnica e actualiza un único archivo centinela privado. No utiliza datos reales.</p></div>
      <button class="button primary" id="run-test">Ejecutar prueba técnica</button>
      <div id="test-result" class="result" aria-live="polite"></div>
    </section>
    <div id="message" class="message" aria-live="polite"></div>`);
  document.getElementById('refresh-status').onclick = loadStatus;
  document.getElementById('run-test').onclick = runTest;
  await loadStatus();
}

async function loadStatus() {
  const button = document.getElementById('refresh-status');
  if (button) button.disabled = true;
  try {
    const { data } = await call('status');
    currentUser = { email: data.actor.email, role: data.actor.role };
    document.getElementById('status-grid').innerHTML = [
      statusCard('Autenticación', data.authenticated, `${data.actor.email} · ${data.actor.role}`),
      statusCard('Backend', data.backend.ok, `v${data.backend.version} · ${data.backend.environment}`),
      statusCard('Google Sheets', data.sheets.ok, `${data.sheets.spreadsheetName} · ${data.sheets.requiredSheets} hojas`),
      statusCard('Google Drive', data.drive.ok, data.drive.rootFolderName)
    ].join('');
    showMessage('Todos los accesos de lectura están disponibles.', 'success');
  } catch (error) {
    if (!sessionToken) return renderLogin();
    showMessage(`${error.message}${error.requestId ? ` · Solicitud ${error.requestId}` : ''}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function runTest() {
  const button = document.getElementById('run-test');
  const result = document.getElementById('test-result');
  button.disabled = true;
  result.className = 'result visible';
  result.textContent = 'Ejecutando prueba…';
  const id = requestId();
  try {
    const response = await call('runTechnicalTest', {}, id);
    const data = response.data;
    result.className = 'result visible success';
    result.innerHTML = `<strong>Prueba correcta</strong><span>Sheets: ${data.sheet.ok ? 'OK' : 'ERROR'} · Drive privado: ${data.drive.ok ? 'OK' : 'ERROR'}</span><span>Evento: ${escapeHtml(data.testEventId)}${data.replayed ? ' · respuesta idempotente' : ''}</span><span>Solicitud: ${escapeHtml(response.requestId)}</span>`;
  } catch (error) {
    result.className = 'result visible error';
    result.textContent = `${error.message}${error.requestId ? ` · Solicitud ${error.requestId}` : ''}`;
  } finally {
    button.disabled = false;
  }
}

async function start() {
  if (config.authMode !== 'SHEETS_PASSWORD') {
    return shell('<section class="panel narrow"><h1>Configuración de autenticación no compatible</h1><p>El backend no informa el modo SHEETS_PASSWORD esperado.</p></section>');
  }
  if (!sessionToken) return renderLogin();
  currentUser = { email: 'Sesión guardada', role: '' };
  await renderDashboard();
}

start();
