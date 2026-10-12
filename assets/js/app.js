const config = window.APP_BOOTSTRAP || {};
const root = document.getElementById('app');
const SESSION_STORAGE_KEY = 'gestionClub.sessionToken';
let sessionToken = sessionStorage.getItem(SESSION_STORAGE_KEY) || '';
let currentUser = null;
let clubConfig = null;
let structureData = null;
let structureSection = 'people';

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
    ${currentUser ? `<nav class="nav"><button class="nav-link ${active === 'home' ? 'active' : ''}" data-nav="home">Inicio</button><button class="nav-link ${active === 'structure' ? 'active' : ''}" data-nav="structure">Estructura</button><button class="nav-link ${active === 'settings' ? 'active' : ''}" data-nav="settings">Configuración</button></nav>` : ''}
    <main class="container">${content}</main>
    <footer>Gestión Club ${escapeHtml(config.appVersion || '')} · entorno ${escapeHtml(config.environment || '')}</footer>`;
  const logoutButton = document.getElementById('logout');
  if (logoutButton) logoutButton.onclick = logout;
  document.querySelectorAll('[data-nav]').forEach(button => {
    button.onclick = () => button.dataset.nav === 'settings' ? renderClubSettings() : button.dataset.nav === 'structure' ? renderStructure() : renderDashboard();
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
  if (!clubConfig) await loadClubConfig();
  const clubName = clubConfig?.officialName || 'Tu club todavía no está configurado';
  const season = clubConfig?.activeSeason?.name || 'Sin temporada activa';
  shell(`
    <section class="hero">
      <span class="eyebrow">Panel de administración</span>
      <h1>${escapeHtml(clubName)}</h1>
      <p>${escapeHtml(season)}. Administrá personas, cargos, divisiones, equipos y sus asignaciones.</p>
    </section>
    <section class="quick-grid">
      <article class="quick-card"><span class="eyebrow">Gestión</span><h2>Estructura deportiva</h2><p>Personas, cargos, divisiones, equipos y asignaciones múltiples.</p><button class="button primary" id="go-structure">Abrir estructura</button></article>
      <article class="quick-card"><span class="eyebrow">Club</span><h2>Configuración</h2><p>Nombre, logo, colores y temporada activa.</p><button class="button secondary" id="go-settings">Abrir configuración</button></article>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><h2>Estado técnico</h2><p>Comprobación de backend y almacenamiento.</p></div><button class="button secondary" id="refresh-status">Actualizar</button></div>
      <div id="status-grid" class="status-grid">${statusCard('Autenticación', true, currentUser?.email || 'Sesión activa')}${statusCard('Backend', false, 'Comprobando…')}${statusCard('Google Sheets', false, 'Comprobando…')}${statusCard('Google Drive', false, 'Comprobando…')}</div>
    </section>
    <div id="message" class="message" aria-live="polite"></div>`, 'home');
  document.getElementById('go-structure').onclick = () => renderStructure();
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


async function loadStructureData() {
  const { data } = await call('getStructureData');
  structureData = data;
  return data;
}

function structureTabs() {
  const tabs = [
    ['people', 'Personas'], ['roles', 'Cargos'], ['divisions', 'Divisiones'], ['teams', 'Equipos'], ['assignments', 'Asignaciones']
  ];
  return `<div class="subnav">${tabs.map(([key, label]) => `<button type="button" class="subnav-link ${structureSection === key ? 'active' : ''}" data-structure-tab="${key}">${label}</button>`).join('')}</div>`;
}

function optionList(items, valueKey, labelFn, selected = '', includeEmpty = true) {
  const empty = includeEmpty ? '<option value="">— Sin asignar —</option>' : '';
  return empty + items.map(item => `<option value="${escapeHtml(item[valueKey])}" ${item[valueKey] === selected ? 'selected' : ''}>${escapeHtml(labelFn(item))}</option>`).join('');
}

function statusBadge(status) {
  const normalized = String(status || '').toUpperCase();
  const cls = normalized === 'ACTIVE' ? 'active' : normalized === 'ENDED' ? 'ended' : 'inactive';
  return `<span class="badge ${cls}">${escapeHtml(normalized || '—')}</span>`;
}

function emptyTable(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

async function renderStructure(section = structureSection) {
  structureSection = section;
  if (!['ADMIN', 'MANAGER'].includes(currentUser?.role)) {
    return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>Solo administradores y managers autorizados pueden gestionar la estructura.</p></section>', 'structure');
  }
  try { await loadStructureData(); }
  catch (error) { return shell(`<section class="panel narrow"><h1>No se pudo cargar la estructura</h1><p>${escapeHtml(error.message)}</p></section>`, 'structure'); }

  let content = '';
  if (structureSection === 'people') content = renderPeopleSection();
  else if (structureSection === 'roles') content = renderRolesSection();
  else if (structureSection === 'divisions') content = renderDivisionsSection();
  else if (structureSection === 'teams') content = renderTeamsSection();
  else content = renderAssignmentsSection();

  shell(`
    <section class="hero compact">
      <span class="eyebrow">Estructura deportiva</span>
      <h1>Personas y organización</h1>
      <p>Una persona puede tener varios cargos y participar en distintas divisiones o equipos sin duplicarse.</p>
    </section>
    ${structureTabs()}
    ${content}
    <div id="structure-message" class="message" aria-live="polite"></div>`, 'structure');

  document.querySelectorAll('[data-structure-tab]').forEach(button => {
    button.onclick = () => renderStructure(button.dataset.structureTab);
  });
  wireStructureSection();
}

function renderPeopleSection() {
  const people = structureData?.persons || [];
  const rows = people.map(person => `<tr>
    <td><strong>${escapeHtml(person.displayName)}</strong><small>${escapeHtml(person.email || 'Sin correo')}</small></td>
    <td>${escapeHtml(person.phone || '—')}</td>
    <td>${escapeHtml(person.birthDate || '—')}</td>
    <td>${statusBadge(person.status)}</td>
    <td><button class="button mini secondary" data-edit-person="${escapeHtml(person.personId)}">Editar</button></td>
  </tr>`).join('');
  return `<section class="panel management-panel">
    <div class="panel-heading"><div><h2>Personas</h2><p>Registro único para jugadores, entrenadores, managers y colaboradores.</p></div><button class="button primary" id="new-person">Nueva persona</button></div>
    ${people.length ? `<div class="table-wrap"><table><thead><tr><th>Persona</th><th>Teléfono</th><th>Nacimiento</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyTable('Todavía no hay personas cargadas.')}
    <div id="editor-host"></div>
  </section>`;
}

function renderRolesSection() {
  const roles = structureData?.roles || [];
  const labels = { COACH:'Entrenador', MANAGER:'Manager', REFEREE:'Árbitro', COORDINATOR:'Coordinador', COLLABORATOR:'Colaborador', ADMINISTRATIVE:'Administrativo', PLAYER:'Jugador', OTHER:'Otro' };
  const rows = roles.map(role => `<tr><td><strong>${escapeHtml(role.name)}</strong><small>${escapeHtml(role.description || '')}</small></td><td>${escapeHtml(labels[role.category] || role.category)}</td><td>${escapeHtml(role.scopeType)}</td><td>${statusBadge(role.status)}</td><td><button class="button mini secondary" data-edit-role="${escapeHtml(role.roleId)}">Editar</button></td></tr>`).join('');
  return `<section class="panel management-panel"><div class="panel-heading"><div><h2>Cargos</h2><p>Los cargos son configurables y no equivalen automáticamente a permisos de seguridad.</p></div><button class="button primary" id="new-role">Nuevo cargo</button></div>${roles.length ? `<div class="table-wrap"><table><thead><tr><th>Cargo</th><th>Categoría</th><th>Alcance</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyTable('Todavía no hay cargos configurados.')}<div id="editor-host"></div></section>`;
}

function renderDivisionsSection() {
  const divisions = structureData?.divisions || [];
  const rows = divisions.map(item => `<tr><td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.code || '')}</small></td><td>${statusBadge(item.status)}</td><td><button class="button mini secondary" data-edit-division="${escapeHtml(item.divisionId)}">Editar</button></td></tr>`).join('');
  return `<section class="panel management-panel"><div class="panel-heading"><div><h2>Divisiones</h2><p>Se vinculan a la temporada activa para conservar histórico.</p></div><button class="button primary" id="new-division">Nueva división</button></div>${divisions.length ? `<div class="table-wrap"><table><thead><tr><th>División</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyTable('Todavía no hay divisiones para la temporada activa.')}<div id="editor-host"></div></section>`;
}

function renderTeamsSection() {
  const teams = structureData?.teams || [];
  const divisions = Object.fromEntries((structureData?.divisions || []).map(d => [d.divisionId, d]));
  const rows = teams.map(item => `<tr><td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.code || '')}</small></td><td>${escapeHtml(divisions[item.divisionId]?.name || '—')}</td><td>${statusBadge(item.status)}</td><td><button class="button mini secondary" data-edit-team="${escapeHtml(item.teamId)}">Editar</button></td></tr>`).join('');
  return `<section class="panel management-panel"><div class="panel-heading"><div><h2>Equipos</h2><p>Una división puede tener uno o varios equipos.</p></div><button class="button primary" id="new-team">Nuevo equipo</button></div>${teams.length ? `<div class="table-wrap"><table><thead><tr><th>Equipo</th><th>División</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyTable('Todavía no hay equipos creados.')}<div id="editor-host"></div></section>`;
}

function renderAssignmentsSection() {
  const data = structureData || {};
  const people = Object.fromEntries((data.persons || []).map(x => [x.personId, x]));
  const roles = Object.fromEntries((data.roles || []).map(x => [x.roleId, x]));
  const divisions = Object.fromEntries((data.divisions || []).map(x => [x.divisionId, x]));
  const teams = Object.fromEntries((data.teams || []).map(x => [x.teamId, x]));
  const rows = (data.assignments || []).map(item => `<tr>
    <td><strong>${escapeHtml(people[item.personId]?.displayName || '—')}</strong><small>${escapeHtml(roles[item.roleId]?.name || '—')}</small></td>
    <td>${escapeHtml(divisions[item.divisionId]?.name || 'Transversal')}</td><td>${escapeHtml(teams[item.teamId]?.name || '—')}</td>
    <td>${escapeHtml(item.startDate || '—')}${item.endDate ? ' → ' + escapeHtml(item.endDate) : ''}</td><td>${statusBadge(item.status)}</td>
    <td><button class="button mini secondary" data-edit-assignment="${escapeHtml(item.assignmentId)}">Editar</button></td></tr>`).join('');
  return `<section class="panel management-panel"><div class="panel-heading"><div><h2>Asignaciones</h2><p>Relacioná personas con cargos, divisiones y equipos. División y equipo pueden quedar vacíos para funciones transversales.</p></div><button class="button primary" id="new-assignment">Nueva asignación</button></div>${rows ? `<div class="table-wrap"><table><thead><tr><th>Persona / cargo</th><th>División</th><th>Equipo</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyTable('Todavía no hay asignaciones.')}<div id="editor-host"></div></section>`;
}

function wireStructureSection() {
  const bind = (selector, handler) => document.querySelectorAll(selector).forEach(button => button.onclick = () => handler(button.dataset));
  document.getElementById('new-person')?.addEventListener('click', () => showPersonEditor());
  document.getElementById('new-role')?.addEventListener('click', () => showRoleEditor());
  document.getElementById('new-division')?.addEventListener('click', () => showDivisionEditor());
  document.getElementById('new-team')?.addEventListener('click', () => showTeamEditor());
  document.getElementById('new-assignment')?.addEventListener('click', () => showAssignmentEditor());
  bind('[data-edit-person]', data => showPersonEditor((structureData.persons || []).find(x => x.personId === data.editPerson)));
  bind('[data-edit-role]', data => showRoleEditor((structureData.roles || []).find(x => x.roleId === data.editRole)));
  bind('[data-edit-division]', data => showDivisionEditor((structureData.divisions || []).find(x => x.divisionId === data.editDivision)));
  bind('[data-edit-team]', data => showTeamEditor((structureData.teams || []).find(x => x.teamId === data.editTeam)));
  bind('[data-edit-assignment]', data => showAssignmentEditor((structureData.assignments || []).find(x => x.assignmentId === data.editAssignment)));
}

function editorShell(title, description, fields, submitLabel = 'Guardar') {
  const host = document.getElementById('editor-host');
  if (!host) return;
  host.innerHTML = `<section class="inline-editor"><div class="editor-heading"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div><button type="button" class="button link" id="close-editor">Cerrar</button></div><form id="entity-form" class="form-stack">${fields}<div class="editor-actions"><div id="editor-message" class="message"></div><button class="button primary" type="submit">${escapeHtml(submitLabel)}</button></div></form></section>`;
  document.getElementById('close-editor').onclick = () => { host.innerHTML = ''; };
  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showPersonEditor(person = {}) {
  editorShell(person.personId ? 'Editar persona' : 'Nueva persona', 'La persona se registra una única vez aunque tenga varios cargos.', `
    <div class="form-grid two"><label>Nombre<input id="person-first" maxlength="80" required value="${escapeHtml(person.firstName || '')}"></label><label>Apellidos<input id="person-last" maxlength="120" required value="${escapeHtml(person.lastName || '')}"></label></div>
    <div class="form-grid two"><label>Correo<input id="person-email" type="email" maxlength="254" value="${escapeHtml(person.email || '')}"></label><label>Teléfono<input id="person-phone" maxlength="40" value="${escapeHtml(person.phone || '')}"></label></div>
    <div class="form-grid two"><label>Fecha de nacimiento<input id="person-birth" type="date" value="${escapeHtml(person.birthDate || '')}"></label><label>Estado<select id="person-status"><option value="ACTIVE" ${person.status !== 'INACTIVE' && person.status !== 'ARCHIVED' ? 'selected' : ''}>Activo</option><option value="INACTIVE" ${person.status === 'INACTIVE' ? 'selected' : ''}>Inactivo</option><option value="ARCHIVED" ${person.status === 'ARCHIVED' ? 'selected' : ''}>Archivado</option></select></label></div>
    <label>Notas internas<textarea id="person-notes" maxlength="500" rows="3">${escapeHtml(person.notes || '')}</textarea></label>`);
  document.getElementById('entity-form').onsubmit = event => submitEntity(event, 'savePerson', { personId: person.personId || '', firstName: val('person-first'), lastName: val('person-last'), email: val('person-email'), phone: val('person-phone'), birthDate: val('person-birth'), status: val('person-status'), notes: val('person-notes') });
}

function showRoleEditor(role = {}) {
  editorShell(role.roleId ? 'Editar cargo' : 'Nuevo cargo', 'El alcance orienta dónde puede aplicarse, pero una asignación puede seguir siendo transversal.', `
    <label>Nombre del cargo<input id="role-name" maxlength="100" required value="${escapeHtml(role.name || '')}"></label>
    <div class="form-grid two"><label>Categoría<select id="role-category">${[['COACH','Entrenador'],['MANAGER','Manager'],['REFEREE','Árbitro'],['COORDINATOR','Coordinador'],['COLLABORATOR','Colaborador'],['ADMINISTRATIVE','Administrativo'],['PLAYER','Jugador'],['OTHER','Otro']].map(([v,l]) => `<option value="${v}" ${role.category===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Alcance<select id="role-scope">${[['FLEXIBLE','Flexible'],['TRANSVERSAL','Transversal'],['DIVISION','División'],['TEAM','Equipo']].map(([v,l]) => `<option value="${v}" ${role.scopeType===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
    <label>Descripción<textarea id="role-description" maxlength="300" rows="3">${escapeHtml(role.description || '')}</textarea></label>
    <label>Estado<select id="role-status"><option value="ACTIVE" ${role.status !== 'INACTIVE' ? 'selected' : ''}>Activo</option><option value="INACTIVE" ${role.status === 'INACTIVE' ? 'selected' : ''}>Inactivo</option></select></label>`);
  document.getElementById('entity-form').onsubmit = event => submitEntity(event, 'saveRole', { roleId: role.roleId || '', name: val('role-name'), category: val('role-category'), scopeType: val('role-scope'), description: val('role-description'), status: val('role-status') });
}

function showDivisionEditor(item = {}) {
  editorShell(item.divisionId ? 'Editar división' : 'Nueva división', 'La división quedará ligada a la temporada activa.', `<div class="form-grid two"><label>Nombre<input id="division-name" maxlength="100" required value="${escapeHtml(item.name || '')}"></label><label>Código<input id="division-code" maxlength="30" value="${escapeHtml(item.code || '')}" placeholder="M16"></label></div><label>Estado<select id="division-status"><option value="ACTIVE" ${item.status !== 'INACTIVE' ? 'selected' : ''}>Activa</option><option value="INACTIVE" ${item.status === 'INACTIVE' ? 'selected' : ''}>Inactiva</option></select></label>`);
  document.getElementById('entity-form').onsubmit = event => submitEntity(event, 'saveDivision', { divisionId: item.divisionId || '', name: val('division-name'), code: val('division-code'), status: val('division-status'), seasonId: item.seasonId || structureData.activeSeasonId || '' });
}

function showTeamEditor(item = {}) {
  const divisions = (structureData.divisions || []).filter(x => x.status === 'ACTIVE' || x.divisionId === item.divisionId);
  editorShell(item.teamId ? 'Editar equipo' : 'Nuevo equipo', 'Cada equipo pertenece a una división.', `<label>División<select id="team-division" required>${optionList(divisions, 'divisionId', x => x.name, item.divisionId || '', false)}</select></label><div class="form-grid two"><label>Nombre<input id="team-name" maxlength="100" required value="${escapeHtml(item.name || '')}"></label><label>Código<input id="team-code" maxlength="30" value="${escapeHtml(item.code || '')}"></label></div><label>Estado<select id="team-status"><option value="ACTIVE" ${item.status !== 'INACTIVE' ? 'selected' : ''}>Activo</option><option value="INACTIVE" ${item.status === 'INACTIVE' ? 'selected' : ''}>Inactivo</option></select></label>`);
  document.getElementById('entity-form').onsubmit = event => submitEntity(event, 'saveTeam', { teamId: item.teamId || '', divisionId: val('team-division'), name: val('team-name'), code: val('team-code'), status: val('team-status') });
}

function showAssignmentEditor(item = {}) {
  const activePeople = (structureData.persons || []).filter(x => x.status === 'ACTIVE' || x.personId === item.personId);
  const activeRoles = (structureData.roles || []).filter(x => x.status === 'ACTIVE' || x.roleId === item.roleId);
  const activeDivisions = (structureData.divisions || []).filter(x => x.status === 'ACTIVE' || x.divisionId === item.divisionId);
  const teams = structureData.teams || [];
  editorShell(item.assignmentId ? 'Editar asignación' : 'Nueva asignación', 'Dejá división y equipo vacíos para cargos transversales.', `
    <div class="form-grid two"><label>Persona<select id="assignment-person" required>${optionList(activePeople,'personId',x=>x.displayName,item.personId||'',false)}</select></label><label>Cargo<select id="assignment-role" required>${optionList(activeRoles,'roleId',x=>x.name,item.roleId||'',false)}</select></label></div>
    <div class="form-grid two"><label>División<select id="assignment-division">${optionList(activeDivisions,'divisionId',x=>x.name,item.divisionId||'')}</select></label><label>Equipo<select id="assignment-team">${optionList(teams,'teamId',x=>x.name,item.teamId||'')}</select></label></div>
    <div class="form-grid two"><label>Desde<input id="assignment-start" type="date" value="${escapeHtml(item.startDate || '')}"></label><label>Hasta<input id="assignment-end" type="date" value="${escapeHtml(item.endDate || '')}"></label></div>
    <label>Estado<select id="assignment-status"><option value="ACTIVE" ${item.status !== 'ENDED' ? 'selected' : ''}>Activa</option><option value="ENDED" ${item.status === 'ENDED' ? 'selected' : ''}>Finalizada</option></select></label>
    <label>Notas<textarea id="assignment-notes" maxlength="500" rows="3">${escapeHtml(item.notes || '')}</textarea></label>`);
  const divSelect = document.getElementById('assignment-division');
  const teamSelect = document.getElementById('assignment-team');
  const refreshTeams = () => {
    const divId = divSelect.value;
    const allowed = teams.filter(x => (!divId || x.divisionId === divId) && (x.status === 'ACTIVE' || x.teamId === item.teamId));
    teamSelect.innerHTML = optionList(allowed, 'teamId', x => x.name, allowed.some(x => x.teamId === item.teamId) ? item.teamId : '');
  };
  divSelect.onchange = refreshTeams;
  refreshTeams();
  document.getElementById('entity-form').onsubmit = event => submitEntity(event, 'saveAssignment', { assignmentId: item.assignmentId || '', personId: val('assignment-person'), roleId: val('assignment-role'), divisionId: val('assignment-division'), teamId: val('assignment-team'), seasonId: item.seasonId || structureData.activeSeasonId || '', startDate: val('assignment-start'), endDate: val('assignment-end'), status: val('assignment-status'), notes: val('assignment-notes') });
}

function val(id) { return document.getElementById(id)?.value?.trim?.() ?? document.getElementById(id)?.value ?? ''; }

async function submitEntity(event, action, payload) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  showMessage('Guardando…', 'info', 'editor-message');
  try {
    await call(action, payload);
    showMessage('Guardado correctamente.', 'success', 'editor-message');
    await loadStructureData();
    setTimeout(() => renderStructure(structureSection), 300);
  } catch (error) {
    showMessage(error.message, 'error', 'editor-message');
    button.disabled = false;
  }
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
    await loadClubConfig();
    await renderDashboard();
  } catch (error) {
    if (!sessionToken) return renderLogin();
    shell(`<section class="panel narrow"><h1>No se pudo recuperar la sesión</h1><p>${escapeHtml(error.message)}</p><button class="button primary" id="back-login">Volver al acceso</button></section>`);
    document.getElementById('back-login').onclick = () => { clearSession(); renderLogin(); };
  }
}

start();
