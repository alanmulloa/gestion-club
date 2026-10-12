const config = window.APP_BOOTSTRAP || {};
const root = document.getElementById('app');
const SESSION_STORAGE_KEY = 'gestionClub.sessionToken';
let sessionToken = sessionStorage.getItem(SESSION_STORAGE_KEY) || '';
let currentUser = null;
let clubConfig = null;

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
  clubConfig = null;
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function applyClubTheme(settings) {
  const style = document.documentElement.style;
  const primary = settings?.primaryColor || '#176b4d';
  const secondary = settings?.secondaryColor || '#12372a';
  const accent = settings?.accentColor || '#d8a53b';
  style.setProperty('--brand', primary);
  style.setProperty('--brand-dark', secondary);
  style.setProperty('--accent', accent);
}

function brandMarkup() {
  const name = clubConfig?.shortName || clubConfig?.officialName || config.appName || 'Gestión Club';
  const logo = clubConfig?.logoDataUrl
    ? `<img class="brand-logo" src="${escapeHtml(clubConfig.logoDataUrl)}" alt="Logo">`
    : `<span class="brand-mark">${escapeHtml((clubConfig?.shortName || 'GC').slice(0, 2).toUpperCase())}</span>`;
  return `${logo}<div><strong>${escapeHtml(name)}</strong><small>Versión ${escapeHtml(config.appVersion || '?')} · ${escapeHtml(config.environment || 'sin configurar')}</small></div>`;
}

function shell(content, active = 'home') {
  root.className = '';
  root.innerHTML = `
    <header class="topbar">
      <div class="brand">${brandMarkup()}</div>
      ${currentUser ? `<div class="session"><span>${escapeHtml(currentUser.email)}</span><button class="button ghost" id="logout">Salir</button></div>` : ''}
    </header>
    ${currentUser ? `<nav class="nav"><button class="nav-link ${active === 'home' ? 'active' : ''}" data-nav="home">Inicio</button><button class="nav-link ${active === 'settings' ? 'active' : ''}" data-nav="settings">Configuración</button></nav>` : ''}
    <main class="container">${content}</main>
    <footer>Gestión Club ${escapeHtml(config.appVersion || '')} · entorno ${escapeHtml(config.environment || '')}</footer>`;
  const logoutButton = document.getElementById('logout');
  if (logoutButton) logoutButton.onclick = logout;
  document.querySelectorAll('[data-nav]').forEach(button => {
    button.onclick = () => button.dataset.nav === 'settings' ? renderClubSettings() : renderDashboard();
  });
}

function showMessage(message, kind = 'info', hostId = 'message') {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.className = `message ${kind}`;
  host.textContent = message;
}

function renderLogin() {
  applyClubTheme(clubConfig);
  shell(`
    <section class="hero narrow">
      <span class="eyebrow">Gestión deportiva</span>
      <h1>Acceso al club</h1>
      <p>Inicia sesión con la cuenta creada por la administración.</p>
    </section>
    <section class="panel narrow">
      <form id="login-form" class="form-stack">
        <label>Correo electrónico<input id="email" type="email" autocomplete="username" required></label>
        <label>Contraseña<input id="password" type="password" autocomplete="current-password" required></label>
        <button class="button primary" type="submit">Entrar</button>
      </form>
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
      await loadClubConfig();
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

async function loadClubConfig() {
  try {
    const { data } = await call('getClubConfig');
    clubConfig = data;
    applyClubTheme(clubConfig);
    return data;
  } catch (error) {
    if (error.code === 'FORBIDDEN') return null;
    throw error;
  }
}

function statusCard(title, state, detail) {
  return `<article class="status-card ${state ? 'ok' : 'pending'}"><span class="status-dot"></span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div></article>`;
}

async function renderDashboard() {
  if (!clubConfig && currentUser?.role === 'ADMIN') await loadClubConfig();
  const clubName = clubConfig?.officialName || 'Tu club todavía no está configurado';
  const season = clubConfig?.activeSeason?.name || 'Sin temporada activa';
  shell(`
    <section class="hero">
      <span class="eyebrow">Panel de administración</span>
      <h1>${escapeHtml(clubName)}</h1>
      <p>${escapeHtml(season)}. La infraestructura está operativa y ya podés configurar la identidad del club.</p>
    </section>
    <section class="quick-grid">
      <article class="quick-card"><span class="eyebrow">Club</span><h2>Configuración</h2><p>Nombre, logo, colores y temporada activa.</p><button class="button secondary" id="go-settings">Abrir configuración</button></article>
      <article class="quick-card muted-card"><span class="eyebrow">Próxima fase</span><h2>Personas</h2><p>Jugadores, entrenadores, managers, colaboradores y tutores.</p><button class="button secondary" disabled>Próximamente</button></article>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><h2>Estado técnico</h2><p>Comprobación de backend y almacenamiento.</p></div><button class="button secondary" id="refresh-status">Actualizar</button></div>
      <div id="status-grid" class="status-grid">${statusCard('Autenticación', true, currentUser?.email || 'Sesión activa')}${statusCard('Backend', false, 'Comprobando…')}${statusCard('Google Sheets', false, 'Comprobando…')}${statusCard('Google Drive', false, 'Comprobando…')}</div>
    </section>
    <div id="message" class="message" aria-live="polite"></div>`, 'home');
  document.getElementById('go-settings').onclick = renderClubSettings;
  document.getElementById('refresh-status').onclick = loadStatus;
  await loadStatus();
}

async function loadStatus() {
  const button = document.getElementById('refresh-status');
  if (button) button.disabled = true;
  try {
    const { data } = await call('status');
    currentUser = { email: data.actor.email, role: data.actor.role };
    const grid = document.getElementById('status-grid');
    if (grid) grid.innerHTML = [
      statusCard('Autenticación', data.authenticated, `${data.actor.email} · ${data.actor.role}`),
      statusCard('Backend', data.backend.ok, `v${data.backend.version} · ${data.backend.environment}`),
      statusCard('Google Sheets', data.sheets.ok, `${data.sheets.spreadsheetName} · ${data.sheets.requiredSheets} hojas`),
      statusCard('Google Drive', data.drive.ok, data.drive.rootFolderName)
    ].join('');
    showMessage('Sistema disponible.', 'success');
  } catch (error) {
    if (!sessionToken) return renderLogin();
    showMessage(`${error.message}${error.requestId ? ` · Solicitud ${error.requestId}` : ''}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function renderClubSettings() {
  try {
    if (!clubConfig) await loadClubConfig();
  } catch (error) {
    return shell(`<section class="panel narrow"><h1>No se pudo cargar la configuración</h1><p>${escapeHtml(error.message)}</p></section>`, 'settings');
  }
  if (currentUser?.role !== 'ADMIN') return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>Solo un administrador puede modificar la configuración del club.</p></section>', 'settings');
  const s = clubConfig || {};
  const season = s.activeSeason || {};
  const logoPreview = s.logoDataUrl ? `<img id="logo-preview" class="logo-preview" src="${escapeHtml(s.logoDataUrl)}" alt="Logo actual">` : `<div id="logo-preview" class="logo-placeholder">Sin logo</div>`;
  shell(`
    <section class="hero compact">
      <span class="eyebrow">Configuración</span>
      <h1>Identidad del club</h1>
      <p>Estos datos personalizan la aplicación y preparan la estructura para los siguientes módulos.</p>
    </section>
    <form id="club-form" class="settings-layout">
      <section class="panel settings-main">
        <div class="section-heading"><h2>Datos principales</h2><p>Información visible dentro de la aplicación.</p></div>
        <div class="form-grid two">
          <label>Nombre oficial<input id="official-name" maxlength="120" required value="${escapeHtml(s.officialName || '')}"></label>
          <label>Nombre corto<input id="short-name" maxlength="40" required value="${escapeHtml(s.shortName || '')}"></label>
          <label>Correo de contacto<input id="contact-email" type="email" maxlength="254" value="${escapeHtml(s.contactEmail || '')}"></label>
          <label>Teléfono de contacto<input id="contact-phone" maxlength="40" value="${escapeHtml(s.contactPhone || '')}"></label>
        </div>
        <div class="section-divider"></div>
        <div class="section-heading"><h2>Temporada activa</h2><p>La temporada quedará registrada como entidad independiente para conservar histórico.</p></div>
        <div class="form-grid three">
          <label>Nombre<input id="season-name" maxlength="80" placeholder="2026/2027" value="${escapeHtml(season.name || '')}"></label>
          <label>Inicio<input id="season-start" type="date" value="${escapeHtml(season.startDate || '')}"></label>
          <label>Fin<input id="season-end" type="date" value="${escapeHtml(season.endDate || '')}"></label>
        </div>
      </section>
      <aside class="settings-side">
        <section class="panel">
          <div class="section-heading"><h2>Logo</h2><p>PNG, JPG o WebP. Máximo 1,5 MB.</p></div>
          <div class="logo-box">${logoPreview}</div>
          <input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
          <div class="button-row"><button class="button secondary" type="button" id="choose-logo">Elegir logo</button>${s.logoDataUrl ? '<button class="button link danger-text" type="button" id="remove-logo">Quitar</button>' : ''}</div>
          <div id="logo-message" class="message"></div>
        </section>
        <section class="panel">
          <div class="section-heading"><h2>Colores</h2><p>Podés elegirlos manualmente o sugerirlos a partir del logo.</p></div>
          <div class="color-list">
            <label>Principal<div class="color-control"><input id="primary-color" type="color" value="${escapeHtml(s.primaryColor || '#176b4d')}"><input id="primary-text" class="color-text" value="${escapeHtml(s.primaryColor || '#176b4d')}" maxlength="7"></div></label>
            <label>Secundario<div class="color-control"><input id="secondary-color" type="color" value="${escapeHtml(s.secondaryColor || '#12372a')}"><input id="secondary-text" class="color-text" value="${escapeHtml(s.secondaryColor || '#12372a')}" maxlength="7"></div></label>
            <label>Acento<div class="color-control"><input id="accent-color" type="color" value="${escapeHtml(s.accentColor || '#d8a53b')}"><input id="accent-text" class="color-text" value="${escapeHtml(s.accentColor || '#d8a53b')}" maxlength="7"></div></label>
          </div>
          <button class="button secondary full" type="button" id="suggest-colors">Sugerir desde logo</button>
        </section>
      </aside>
      <div class="settings-actions"><div id="message" class="message" aria-live="polite"></div><button class="button primary" type="submit">Guardar configuración</button></div>
    </form>`, 'settings');

  wireColorPair('primary');
  wireColorPair('secondary');
  wireColorPair('accent');
  let selectedLogo = null;
  let removeLogo = false;
  const fileInput = document.getElementById('logo-file');
  document.getElementById('choose-logo').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 1500000) return showMessage('El logo supera 1,5 MB.', 'error', 'logo-message');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return showMessage('Formato de logo no permitido.', 'error', 'logo-message');
    selectedLogo = { file, dataUrl: await fileToDataUrl(file) };
    removeLogo = false;
    document.getElementById('logo-preview').outerHTML = `<img id="logo-preview" class="logo-preview" src="${escapeHtml(selectedLogo.dataUrl)}" alt="Vista previa">`;
    showMessage(file.name, 'success', 'logo-message');
  };
  const removeButton = document.getElementById('remove-logo');
  if (removeButton) removeButton.onclick = () => {
    selectedLogo = null;
    removeLogo = true;
    document.getElementById('logo-preview').outerHTML = '<div id="logo-preview" class="logo-placeholder">Sin logo</div>';
    showMessage('El logo se eliminará al guardar.', 'info', 'logo-message');
  };
  document.getElementById('suggest-colors').onclick = async () => {
    const dataUrl = selectedLogo?.dataUrl || clubConfig?.logoDataUrl;
    if (!dataUrl) return showMessage('Primero seleccioná un logo.', 'error', 'logo-message');
    try {
      const palette = await extractPalette(dataUrl);
      setColor('primary', palette[0]);
      setColor('secondary', palette[1]);
      setColor('accent', palette[2]);
      applyClubTheme({ primaryColor: palette[0], secondaryColor: palette[1], accentColor: palette[2] });
      showMessage('Paleta sugerida. Podés ajustarla antes de guardar.', 'success', 'logo-message');
    } catch (error) { showMessage('No se pudo analizar el logo.', 'error', 'logo-message'); }
  };
  document.getElementById('club-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    showMessage('Guardando configuración…');
    try {
      const payload = {
        officialName: document.getElementById('official-name').value.trim(),
        shortName: document.getElementById('short-name').value.trim(),
        contactEmail: document.getElementById('contact-email').value.trim(),
        contactPhone: document.getElementById('contact-phone').value.trim(),
        primaryColor: document.getElementById('primary-text').value.trim(),
        secondaryColor: document.getElementById('secondary-text').value.trim(),
        accentColor: document.getElementById('accent-text').value.trim(),
        season: {
          name: document.getElementById('season-name').value.trim(),
          startDate: document.getElementById('season-start').value,
          endDate: document.getElementById('season-end').value
        },
        logoDataUrl: selectedLogo?.dataUrl || '',
        logoOriginalName: selectedLogo?.file?.name || '',
        removeLogo
      };
      const { data } = await call('saveClubConfig', payload);
      clubConfig = data;
      applyClubTheme(clubConfig);
      showMessage('Configuración guardada correctamente.', 'success');
      setTimeout(renderClubSettings, 550);
    } catch (error) {
      showMessage(error.message, 'error');
      button.disabled = false;
    }
  };
}

function wireColorPair(prefix) {
  const picker = document.getElementById(prefix + '-color');
  const text = document.getElementById(prefix + '-text');
  picker.oninput = () => { text.value = picker.value; previewColors(); };
  text.oninput = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(text.value)) { picker.value = text.value; previewColors(); }
  };
}

function setColor(prefix, value) {
  document.getElementById(prefix + '-color').value = value;
  document.getElementById(prefix + '-text').value = value;
}

function previewColors() {
  const primary = document.getElementById('primary-text')?.value;
  const secondary = document.getElementById('secondary-text')?.value;
  const accent = document.getElementById('accent-text')?.value;
  if ([primary, secondary, accent].every(value => /^#[0-9a-fA-F]{6}$/.test(value))) {
    applyClubTheme({ primaryColor: primary, secondaryColor: secondary, accentColor: accent });
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function extractPalette(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 72;
      canvas.height = 72;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, 72, 72);
      const data = ctx.getImageData(0, 0, 72, 72).data;
      const buckets = new Map();
      for (let i = 0; i < data.length; i += 16) {
        if (data[i + 3] < 180) continue;
        let r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max > 242 || max < 20 || max - min < 10) continue;
        r = Math.round(r / 32) * 32; g = Math.round(g / 32) * 32; b = Math.round(b / 32) * 32;
        const key = [Math.min(255, r), Math.min(255, g), Math.min(255, b)].join(',');
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
      const colors = [...buckets.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key.split(',').map(Number));
      const selected = [];
      for (const rgb of colors) {
        if (selected.every(other => colorDistance(rgb, other) > 95)) selected.push(rgb);
        if (selected.length === 3) break;
      }
      while (selected.length < 3) selected.push(selected.length ? adjustColor(selected[0], selected.length === 1 ? -55 : 65) : [23, 107, 77]);
      selected.sort((a, b) => luminance(b) - luminance(a));
      const primary = selected[0];
      const secondary = selected[selected.length - 1];
      const accent = selected.length > 2 ? selected[1] : adjustColor(primary, 70);
      resolve([rgbToHex(primary), rgbToHex(secondary), rgbToHex(accent)]);
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function colorDistance(a, b) { return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2); }
function luminance(c) { return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
function adjustColor(c, amount) { return c.map(value => Math.max(0, Math.min(255, value + amount))); }
function rgbToHex(c) { return '#' + c.map(value => Math.round(value).toString(16).padStart(2, '0')).join(''); }

async function start() {
  if (config.authMode !== 'SHEETS_PASSWORD') {
    return shell('<section class="panel narrow"><h1>Configuración de autenticación no compatible</h1><p>El backend no informa el modo SHEETS_PASSWORD esperado.</p></section>');
  }
  if (!sessionToken) return renderLogin();
  currentUser = { email: 'Sesión guardada', role: '' };
  try {
    const { data } = await call('status');
    currentUser = { email: data.actor.email, role: data.actor.role };
    if (currentUser.role === 'ADMIN') await loadClubConfig();
    await renderDashboard();
  } catch (error) {
    if (!sessionToken) return renderLogin();
    shell(`<section class="panel narrow"><h1>No se pudo recuperar la sesión</h1><p>${escapeHtml(error.message)}</p><button class="button primary" id="back-login">Volver al acceso</button></section>`);
    document.getElementById('back-login').onclick = () => { clearSession(); renderLogin(); };
  }
}

start();
