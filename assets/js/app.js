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
    }, request?.action === 'importLeagueCalendar' ? 150000 : request?.action === 'previewLeagueCalendarImport' ? 60000 : 30000);
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

function roleDisplayName(role) {
  return ({ADMIN:'Administrador',MANAGER:'Manager',COACH:'Entrenador',REFEREE:'Árbitro',PLAYER:'Jugador',TUTOR:'Tutor',COLLABORATOR:'Colaborador'})[role] || role || '';
}

function navigationForRole(role) {
  const all = [
    ['home','Inicio'],['structure','Estructura'],['families','Tutores'],['documents','Documentos'],['calendar','Calendario'],['users','Usuarios'],['settings','Configuración']
  ];
  if (role === 'MANAGER') return all.filter(x => ['home','structure','documents','calendar','users'].includes(x[0]));
  if (role === 'COACH') return all.filter(x => ['home','structure','documents','calendar'].includes(x[0]));
  if (role === 'REFEREE') return all.filter(x => ['home','documents','calendar'].includes(x[0]));
  if (role === 'PLAYER') return all.filter(x => ['home','documents','calendar'].includes(x[0]));
  if (role === 'TUTOR') return all.filter(x => ['home','families','documents','calendar'].includes(x[0]));
  if (role === 'COLLABORATOR') return all.filter(x => ['home','documents','calendar'].includes(x[0]));
  return all;
}

function navMarkup(active) {
  if (!currentUser) return '';
  return navigationForRole(currentUser.role).map(([key,label]) =>
    `<button class="nav-link ${active === key ? 'active' : ''}" data-nav="${key}"><span class="nav-icon">${({home:'⌂',structure:'◆',families:'♙',documents:'▤',calendar:'▦',users:'◎',settings:'⚙'})[key] || '•'}</span><span class="nav-label">${label}</span></button>`
  ).join('');
}

function dashboardCardsForRole() {
  const role=currentUser?.role || 'ADMIN';
  const cards=[];
  if (['ADMIN','MANAGER','COACH'].includes(role)) cards.push(['Actividad','Calendario deportivo','Entrenamientos, partidos, disponibilidad y convocatorias.','go-calendar','primary']);
  if (['ADMIN','MANAGER','COACH'].includes(role)) cards.push(['Gestión','Estructura deportiva','Personas, cargos, divisiones, equipos y asignaciones.','go-structure','secondary']);
  if (['ADMIN','MANAGER','COACH','REFEREE','PLAYER','TUTOR','COLLABORATOR'].includes(role)) cards.push(['Archivos','Documentación','Consultá y gestioná la documentación a la que tenés acceso.','go-documents','secondary']);
  if (['ADMIN','MANAGER'].includes(role)) cards.push(['Acceso','Usuarios','Creación de cuentas, roles y accesos.','go-users','secondary']);
  if (['ADMIN','MANAGER','TUTOR'].includes(role)) cards.push(['Familias','Tutores y menores','Relaciones entre menores y tutores autorizados.','go-families','secondary']);
  if (role==='ADMIN') cards.push(['Club','Configuración','Nombre, logo, colores y temporada activa.','go-settings','secondary']);
  return cards.map(c=>`<article class="quick-card role-card"><span class="eyebrow">${c[0]}</span><h2>${c[1]}</h2><p>${c[2]}</p><button class="button ${c[4]}" id="${c[3]}">${c[1]}</button></article>`).join('');
}

function isMobileViewport(){ return window.matchMedia && window.matchMedia('(max-width: 760px)').matches; }

function shell(content, active = 'home') {
  root.className = '';
  root.innerHTML = `
    <header class="topbar">
      <div class="brand">${brandMarkup()}</div>
      ${currentUser ? `<div class="session"><div class="session-copy"><span>${escapeHtml(currentUser.email)}</span><small>${escapeHtml(roleDisplayName(currentUser.role))}</small></div><button class="button ghost logout-button" id="logout">Salir</button></div>` : ''}
    </header>
    ${currentUser ? `<nav class="nav">${navMarkup(active)}</nav>` : ''}
    <main class="container">${content}</main>
    <footer>Gestión Club ${escapeHtml(config.appVersion || '')} · entorno ${escapeHtml(config.environment || '')}</footer>`;
  const logoutButton = document.getElementById('logout');
  if (logoutButton) logoutButton.onclick = logout;
  document.querySelectorAll('[data-nav]').forEach(button => {
    button.onclick = () => {
      const nav=button.dataset.nav;
      if(nav==='settings') return renderClubSettings();
      if(nav==='structure') return renderStructure();
      if(nav==='families') return renderFamilies();
      if(nav==='documents') return renderDocuments();
      if(nav==='users') return renderUsers();
      if(nav==='calendar') return renderCalendar();
      return renderDashboard();
    };
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
    <section class="hero role-hero">
      <span class="eyebrow">${escapeHtml(roleDisplayName(currentUser?.role))}</span>
      <h1>${escapeHtml(clubName)}</h1>
      <p>${escapeHtml(season)}. Accesos rápidos adaptados a tu función.</p>
    </section>
    <section class="quick-grid role-quick-grid">${dashboardCardsForRole()}</section>
    <section class="panel">
      <div class="panel-heading"><div><h2>Estado técnico</h2><p>Comprobación de backend y almacenamiento.</p></div><button class="button secondary" id="refresh-status">Actualizar</button></div>
      <div id="status-grid" class="status-grid">${statusCard('Autenticación', true, currentUser?.email || 'Sesión activa')}${statusCard('Backend', false, 'Comprobando…')}${statusCard('Google Sheets', false, 'Comprobando…')}${statusCard('Google Drive', false, 'Comprobando…')}</div>
    </section>
    <div id="message" class="message" aria-live="polite"></div>`, 'home');
  const wire=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn;};
  wire('go-structure',()=>renderStructure());
  wire('go-families',renderFamilies);
  wire('go-documents',renderDocuments);
  wire('go-users',renderUsers);
  wire('go-calendar',renderCalendar);
  wire('go-settings',renderClubSettings);
  document.getElementById('refresh-status').onclick = loadStatus;
  await loadStatus();
}

async function loadStatus() {
  const button = document.getElementById('refresh-status');
  if (button) button.disabled = true;
  try {
    const { data } = await call('status');
    currentUser = { email: data.actor.email, role: data.actor.role, personId: data.actor.personId || '' };
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
    currentUser = { email: data.actor.email, role: data.actor.role, personId: data.actor.personId || '' };
    await loadClubConfig();
    await renderDashboard();
  } catch (error) {
    if (!sessionToken) return renderLogin();
    shell(`<section class="panel narrow"><h1>No se pudo recuperar la sesión</h1><p>${escapeHtml(error.message)}</p><button class="button primary" id="back-login">Volver al acceso</button></section>`);
    document.getElementById('back-login').onclick = () => { clearSession(); renderLogin(); };
  }
}

start();

function personNameById(items,id){const p=(items||[]).find(x=>x.personId===id);return p?p.displayName:id||'—';}

async function renderFamilies(){
  if(!['ADMIN','MANAGER'].includes(currentUser?.role)) return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>Solo administradores y managers pueden gestionar tutores.</p></section>','families');
  try{
    const {data}=await call('getFamilyData');
    const people=data.persons||[], rels=data.relations||[];
    const rows=rels.map(r=>`<tr><td>${escapeHtml(personNameById(people,r.childPersonId))}</td><td>${escapeHtml(personNameById(people,r.guardianPersonId))}</td><td>${escapeHtml(r.relationshipType)}</td><td>${statusBadge(r.status)}</td><td>${r.canManageDocuments==='TRUE'?'Sí':'No'}</td></tr>`).join('');
    shell(`<section class="hero compact"><span class="eyebrow">Familias</span><h1>Tutores y menores</h1><p>Las relaciones autorizan la gestión documental del menor sin duplicar personas.</p></section>
    <section class="panel"><div class="panel-heading"><div><h2>Relaciones</h2></div></div>${rels.length?`<div class="table-wrap"><table><thead><tr><th>Menor</th><th>Tutor</th><th>Relación</th><th>Estado</th><th>Docs</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay relaciones cargadas.')}
    <form id="guardian-form" class="form-grid two" style="margin-top:1rem">
      <label>Menor<select id="guardian-child" required>${optionList(people,'personId',p=>p.displayName,'',false)}</select></label>
      <label>Tutor<select id="guardian-adult" required>${optionList(people,'personId',p=>p.displayName,'',false)}</select></label>
      <label>Tipo de relación<input id="guardian-type" value="PADRE/MADRE" maxlength="50"></label>
      <label>Estado<select id="guardian-status"><option>ACTIVE</option><option>INACTIVE</option><option>REVOKED</option></select></label>
      <label class="check-row"><input id="guardian-docs" type="checkbox" checked> Puede gestionar documentación</label>
      <div><button class="button primary" type="submit">Guardar relación</button></div>
    </form><div id="message" class="message"></div></section>`,'families');
    document.getElementById('guardian-form').onsubmit=async e=>{
      e.preventDefault(); try{
        await call('saveGuardianRelation',{childPersonId:val('guardian-child'),guardianPersonId:val('guardian-adult'),relationshipType:val('guardian-type'),status:val('guardian-status'),canManageDocuments:document.getElementById('guardian-docs').checked});
        await renderFamilies();
      }catch(err){showMessage(err.message,'error');}
    };
  }catch(err){shell(`<section class="panel narrow"><h1>Error</h1><p>${escapeHtml(err.message)}</p></section>`,'families');}
}

async function renderDocuments(){
  try{
    const {data}=await call('getDocumentsData');
    const people=data.persons||[], types=data.documentTypes||[], docs=data.documents||[];
    const typeMap={};types.forEach(t=>typeMap[t.documentTypeId]=t.name);
    const rows=docs.slice().reverse().map(d=>`<tr>
      <td><strong>${escapeHtml(personNameById(people,d.personId))}</strong><small>${escapeHtml(typeMap[d.documentTypeId]||d.documentTypeId)} · v${escapeHtml(d.versionNo)}</small></td>
      <td>${escapeHtml(d.originalName)}</td><td>${statusBadge(d.status)}</td><td>${escapeHtml(d.expiryDate||'—')}</td>
      <td><button class="button mini secondary" data-view-doc="${escapeHtml(d.documentId)}">Ver</button>${data.canReview&&d.status==='PENDING'?` <button class="button mini primary" data-approve-doc="${escapeHtml(d.documentId)}">Aprobar</button> <button class="button mini secondary" data-reject-doc="${escapeHtml(d.documentId)}">Rechazar</button>`:''}</td>
    </tr>`).join('');
    shell(`<section class="hero compact"><span class="eyebrow">Documentación</span><h1>Archivos privados</h1><p>Los archivos se guardan en Drive privado y Sheets conserva únicamente metadatos.</p></section>
    <section class="panel"><div class="panel-heading"><div><h2>Documentos accesibles</h2></div></div>${docs.length?`<div class="table-wrap"><table><thead><tr><th>Titular</th><th>Archivo</th><th>Estado</th><th>Vence</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay documentos accesibles.')}
    ${people.length&&types.length?`<form id="doc-form" class="form-grid two" style="margin-top:1rem">
      <label>Titular<select id="doc-person" required>${optionList(people,'personId',p=>p.displayName,'',false)}</select></label>
      <label>Tipo<select id="doc-type" required>${optionList(types,'documentTypeId',t=>t.name,'',false)}</select></label>
      <label>Fecha emisión<input id="doc-issue" type="date"></label><label>Fecha vencimiento<input id="doc-expiry" type="date"></label>
      <label class="full">Archivo<input id="doc-file" type="file" accept=".pdf,image/png,image/jpeg,image/webp" required></label>
      <div><button class="button primary" type="submit">Subir documento</button></div>
    </form>`:''}
    ${currentUser?.role==='ADMIN'?`<div class="section-divider"></div><form id="doctype-form" class="form-grid two"><label>Nuevo tipo<input id="doctype-name" required maxlength="120"></label><label>Descripción<input id="doctype-description" maxlength="500"></label><label class="check-row"><input id="doctype-expiry" type="checkbox"> Puede tener vencimiento</label><div><button class="button secondary" type="submit">Crear tipo</button></div></form>`:''}
    <div id="message" class="message"></div></section>`,'documents');

    const form=document.getElementById('doc-form');
    if(form) form.onsubmit=async e=>{
      e.preventDefault(); const f=document.getElementById('doc-file').files?.[0]; if(!f)return;
      if(f.size>4500000)return showMessage('El archivo supera 4,5 MB.','error');
      try{showMessage('Subiendo documento…'); const dataUrl=await fileToDataUrl(f);
        await call('uploadDocument',{personId:val('doc-person'),documentTypeId:val('doc-type'),issueDate:val('doc-issue'),expiryDate:val('doc-expiry'),originalName:f.name,fileDataUrl:dataUrl});
        await renderDocuments();
      }catch(err){showMessage(err.message,'error');}
    };
    const tf=document.getElementById('doctype-form');
    if(tf) tf.onsubmit=async e=>{e.preventDefault();try{await call('saveDocumentType',{name:val('doctype-name'),description:val('doctype-description'),hasExpiry:document.getElementById('doctype-expiry').checked,status:'ACTIVE'});await renderDocuments();}catch(err){showMessage(err.message,'error');}};
    document.querySelectorAll('[data-view-doc]').forEach(b=>b.onclick=async()=>{try{showMessage('Abriendo documento…');const {data:file}=await call('getDocumentFile',{documentId:b.dataset.viewDoc});const w=window.open();if(w){w.document.write(`<iframe src="${file.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`);}else{showMessage('El navegador bloqueó la ventana emergente.','error');}}catch(err){showMessage(err.message,'error');}});
    document.querySelectorAll('[data-approve-doc]').forEach(b=>b.onclick=()=>reviewDocUi(b.dataset.approveDoc,'APPROVED'));
    document.querySelectorAll('[data-reject-doc]').forEach(b=>b.onclick=()=>reviewDocUi(b.dataset.rejectDoc,'REJECTED'));
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudo cargar documentación</h1><p>${escapeHtml(err.message)}</p></section>`,'documents');}
}
async function reviewDocUi(id,status){try{const notes=status==='REJECTED'?(prompt('Motivo del rechazo:')||''):'';await call('reviewDocument',{documentId:id,status,reviewNotes:notes});await renderDocuments();}catch(err){showMessage(err.message,'error');}}

async function renderUsers(){
  if(!['ADMIN','MANAGER'].includes(currentUser?.role)) return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>No tienes permisos para administrar usuarios.</p></section>','users');
  try{
    const {data}=await call('getUsersData'); const people=data.persons||[], users=data.users||[], roles=data.securityRoles||[];
    const rows=users.map(u=>`<tr><td><strong>${escapeHtml(u.email)}</strong><small>${escapeHtml(personNameById(people,u.personId))}</small></td><td>${escapeHtml(u.securityRole)}</td><td>${statusBadge(u.status)}</td><td>${escapeHtml(u.lastLoginAt||'Nunca')}</td><td><button class="button mini secondary" data-reset-user="${u.userId}">Reset</button><button class="button mini secondary" data-toggle-user="${u.userId}" data-status="${u.status}" data-role="${u.securityRole}">${u.status==='ACTIVE'?'Desactivar':'Activar'}</button></td></tr>`).join('');
    shell(`<section class="hero compact"><span class="eyebrow">Accesos</span><h1>Usuarios y permisos</h1><p>La cuenta de acceso se mantiene separada de la ficha de persona.</p></section>
    <section class="panel"><div class="panel-heading"><div><h2>Cuentas</h2></div></div>${users.length?`<div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay usuarios disponibles.')}
    <form id="user-form" class="form-grid two" style="margin-top:1rem">
      <label>Persona<select id="user-person" required>${optionList(people,'personId',p=>p.displayName,'',false)}</select></label>
      <label>Correo<input id="user-email" type="email" required></label>
      <label>Rol<select id="user-role">${roles.map(r=>`<option value="${r}">${r}</option>`).join('')}</select></label>
      <label>Contraseña temporal<input id="user-password" type="password" minlength="10" required></label>
      <div><button class="button primary" type="submit">Crear usuario</button></div>
    </form><div id="message" class="message"></div></section>`,'users');
    document.getElementById('user-person').onchange=()=>{const p=people.find(x=>x.personId===val('user-person'));if(p&&p.email)document.getElementById('user-email').value=p.email;};
    document.getElementById('user-form').onsubmit=async e=>{e.preventDefault();try{await call('createUser',{personId:val('user-person'),email:val('user-email'),securityRole:val('user-role'),temporaryPassword:val('user-password')});await renderUsers();}catch(err){showMessage(err.message,'error');}};
    document.querySelectorAll('[data-reset-user]').forEach(b=>b.onclick=async()=>{const pwd=prompt('Nueva contraseña temporal (mínimo 10 caracteres):');if(!pwd)return;try{await call('resetUserPassword',{userId:b.dataset.resetUser,temporaryPassword:pwd});showMessage('Contraseña restablecida.','success');}catch(err){showMessage(err.message,'error');}});
    document.querySelectorAll('[data-toggle-user]').forEach(b=>b.onclick=async()=>{try{await call('updateUserAccess',{userId:b.dataset.toggleUser,status:b.dataset.status==='ACTIVE'?'DISABLED':'ACTIVE',securityRole:b.dataset.role});await renderUsers();}catch(err){showMessage(err.message,'error');}});
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudieron cargar usuarios</h1><p>${escapeHtml(err.message)}</p></section>`,'users');}
}


let calendarData=null;
let calendarCursor=new Date();
let calendarView='month';
let calendarViewTouched=false;

function isoLocalDate(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function eventTypeLabel(t){return t==='TRAINING'?'Entrenamiento':t==='REST'?'Descanso':'Partido';}
function eventStatusLabel(s){return ({SCHEDULED:'Programado',COMPLETED:'Finalizado',CANCELLED:'Cancelado',POSTPONED:'Postergado'})[s]||s;}
function calendarEventLine(e){const tm=e.startTime?` · ${e.startTime}`:'';const opp=e.eventType==='MATCH'&&e.opponent?` · vs ${escapeHtml(e.opponent)}`:'';return `<button class="calendar-event ${e.eventType==='MATCH'?'match':e.eventType==='REST'?'rest':'training'} status-${String(e.status||'').toLowerCase()}" data-open-event="${e.eventId}"><strong>${escapeHtml(e.title||eventTypeLabel(e.eventType))}</strong><small>${tm}${opp}</small></button>`;}

function renderMonthGrid(events){
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth(); const first=new Date(y,m,1), last=new Date(y,m+1,0); let start=(first.getDay()+6)%7;
  const by={};events.forEach(e=>(by[e.eventDate]||(by[e.eventDate]=[])).push(e));
  const heads=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(x=>`<div class="cal-head">${x}</div>`).join(''); let cells='';
  for(let i=0;i<start;i++)cells+='<div class="cal-cell muted"></div>';
  for(let d=1;d<=last.getDate();d++){const key=isoLocalDate(new Date(y,m,d));const today=key===isoLocalDate(new Date());cells+=`<div class="cal-cell ${today?'today':''}"><div class="cal-day">${d}</div>${(by[key]||[]).map(calendarEventLine).join('')}</div>`;}
  return `<div class="calendar-grid">${heads}${cells}</div>`;
}
function startOfWeek(d){const x=new Date(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);x.setHours(0,0,0,0);return x;}
function renderWeekGrid(events){const start=startOfWeek(calendarCursor),days=[];for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);days.push(d);}const by={};events.forEach(e=>(by[e.eventDate]||(by[e.eventDate]=[])).push(e));return `<div class="week-grid">${days.map(d=>{const key=isoLocalDate(d);return `<div class="week-day"><h3>${d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'})}</h3>${(by[key]||[]).length?(by[key]||[]).map(calendarEventLine).join(''):emptyTable('Sin actividad')}</div>`}).join('')}</div>`;}
function renderAgenda(events){
  const sorted=events.slice().sort((a,b)=>`${a.eventDate} ${a.startTime||''}`.localeCompare(`${b.eventDate} ${b.startTime||''}`));
  if(!sorted.length) return emptyTable('Sin actividades para los filtros seleccionados.');
  const groups={}; sorted.forEach(e=>(groups[e.eventDate]||(groups[e.eventDate]=[])).push(e));
  return `<div class="agenda-list">${Object.keys(groups).sort().map(date=>{
    const d=new Date(date+'T12:00:00'); const label=d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
    return `<section class="agenda-day"><h3>${escapeHtml(label)}</h3>${groups[date].map(e=>`<button class="agenda-event ${e.eventType==='MATCH'?'match':e.eventType==='REST'?'rest':'training'} status-${String(e.status||'').toLowerCase()}" data-open-event="${e.eventId}"><span class="agenda-time">${escapeHtml(e.startTime||'—')}</span><span class="agenda-main"><strong>${escapeHtml(e.title||eventTypeLabel(e.eventType))}</strong><small>${escapeHtml(e.eventType==='MATCH'&&e.opponent?'vs '+e.opponent:e.eventType==='REST'?'Fecha de liga sin adversario':(e.location||eventTypeLabel(e.eventType)))}</small></span><span class="agenda-chevron">›</span></button>`).join('')}</section>`;
  }).join('')}</div>`;
}


async function renderCalendar(){
  try{const {data}=await call('getCalendarData',{});calendarData=data;}
  catch(err){return shell(`<section class="panel narrow"><h1>No se pudo cargar el calendario</h1><p>${escapeHtml(err.message)}</p></section>`,'calendar');}
  const d=calendarData, divisionMap={},teamMap={};d.divisions.forEach(x=>divisionMap[x.divisionId]=x.name);d.teams.forEach(x=>teamMap[x.teamId]=x.name);
  if(isMobileViewport()&&!calendarViewTouched) calendarView='agenda';
  const monthLabel=calendarCursor.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  const renderCurrentCalendar=(events)=>calendarView==='month'?renderMonthGrid(events):calendarView==='week'?renderWeekGrid(events):renderAgenda(events);
  shell(`<section class="hero compact"><span class="eyebrow">Actividad deportiva</span><h1>Calendario</h1><p>Entrenamientos y partidos en una única vista.</p></section>
  <section class="panel"><div class="calendar-toolbar"><div class="button-row"><button class="button secondary" id="cal-prev">‹</button><button class="button secondary" id="cal-today">Hoy</button><button class="button secondary" id="cal-next">›</button></div><h2>${escapeHtml(monthLabel)}</h2><div class="button-row"><button class="button ${calendarView==='agenda'?'primary':'secondary'}" id="cal-agenda">Agenda</button><button class="button ${calendarView==='month'?'primary':'secondary'}" id="cal-month">Mes</button><button class="button ${calendarView==='week'?'primary':'secondary'}" id="cal-week">Semana</button>${d.canImportLeague?'<button class="button secondary" id="import-league">Importar liga</button>':''}${d.canCreate?'<button class="button primary" id="new-event">Nueva actividad</button>':''}</div></div><div class="form-grid three calendar-filters"><label>División<select id="cal-filter-division">${optionList(d.divisions,'divisionId',x=>x.name,'',true)}</select></label><label>Equipo<select id="cal-filter-team">${optionList(d.teams,'teamId',x=>x.name,'',true)}</select></label><label>Tipo<select id="cal-filter-type"><option value="">Todos</option><option value="TRAINING">Entrenamientos</option><option value="MATCH">Partidos</option><option value="REST">Descansos</option></select></label></div><div id="calendar-host">${renderCurrentCalendar(d.events)}</div><div id="message" class="message"></div></section>`,'calendar');
  const move=n=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+(calendarView==='month'?n:0),calendarCursor.getDate()+((calendarView==='week'||calendarView==='agenda')?7*n:0));renderCalendar();};
  document.getElementById('cal-prev').onclick=()=>move(-1);document.getElementById('cal-next').onclick=()=>move(1);document.getElementById('cal-today').onclick=()=>{calendarCursor=new Date();renderCalendar();};
  document.getElementById('cal-agenda').onclick=()=>{calendarViewTouched=true;calendarView='agenda';renderCalendar();};document.getElementById('cal-month').onclick=()=>{calendarViewTouched=true;calendarView='month';renderCalendar();};document.getElementById('cal-week').onclick=()=>{calendarViewTouched=true;calendarView='week';renderCalendar();};
  const ib=document.getElementById('import-league');if(ib)ib.onclick=renderLeagueImport;const nb=document.getElementById('new-event');if(nb)nb.onclick=()=>renderEventEditor();
  const applyFilters=()=>{const div=val('cal-filter-division'),team=val('cal-filter-team'),type=val('cal-filter-type');const filtered=d.events.filter(e=>(!div||e.divisionId===div)&&(!team||e.teamId===team)&&(!type||e.eventType===type));document.getElementById('calendar-host').innerHTML=renderCurrentCalendar(filtered);document.querySelectorAll('[data-open-event]').forEach(b=>b.onclick=()=>renderEventDetail(b.dataset.openEvent));};
  ['cal-filter-division','cal-filter-team','cal-filter-type'].forEach(id=>document.getElementById(id).onchange=applyFilters);
  document.querySelectorAll('[data-open-event]').forEach(b=>b.onclick=()=>renderEventDetail(b.dataset.openEvent));
}

function eventEditorParticipants(e){
  const d=calendarData, selected={}; (d.participants||[]).filter(p=>e&&p.eventId===e.eventId).forEach(p=>selected[p.personId]=p.participantType);
  return d.persons.map(p=>`<label class="participant-choice"><input type="checkbox" data-event-person="${p.personId}" ${selected[p.personId]?'checked':''}><span>${escapeHtml(p.displayName)}</span><select data-event-person-type="${p.personId}"><option value="PLAYER" ${selected[p.personId]==='PLAYER'?'selected':''}>Jugador</option><option value="STAFF" ${selected[p.personId]==='STAFF'?'selected':''}>Staff</option><option value="REFEREE" ${selected[p.personId]==='REFEREE'?'selected':''}>Árbitro</option><option value="OTHER" ${selected[p.personId]==='OTHER'?'selected':''}>Otro</option></select></label>`).join('');
}
async function renderEventEditor(eventId=''){
  if(!calendarData){const r=await call('getCalendarData',{});calendarData=r.data;}const d=calendarData,e=(d.events||[]).find(x=>x.eventId===eventId)||{};
  const teams=d.teams||[],divs=d.divisions||[];
  shell(`<section class="hero compact"><span class="eyebrow">${e.eventId?'Editar':'Nueva'} actividad</span><h1>${e.eventId?escapeHtml(e.title):'Entrenamiento o partido'}</h1></section>
  <form id="event-form" class="panel form-stack"><div class="form-grid three"><label>Tipo<select id="event-type"><option value="TRAINING" ${e.eventType==='TRAINING'?'selected':''}>Entrenamiento</option><option value="MATCH" ${e.eventType==='MATCH'?'selected':''}>Partido</option>${e.eventType==='REST'?'<option value="REST" selected>Descanso</option>':''}</select></label><label>Título<input id="event-title" value="${escapeHtml(e.title||'')}" maxlength="120"></label><label>Estado<select id="event-status"><option value="SCHEDULED">Programado</option><option value="COMPLETED" ${e.status==='COMPLETED'?'selected':''}>Finalizado</option><option value="CANCELLED" ${e.status==='CANCELLED'?'selected':''}>Cancelado</option><option value="POSTPONED" ${e.status==='POSTPONED'?'selected':''}>Postergado</option></select></label><label>División<select id="event-division">${optionList(divs,'divisionId',x=>x.name,e.divisionId||'',true)}</select></label><label>Equipo<select id="event-team">${optionList(teams,'teamId',x=>x.name,e.teamId||'',true)}</select></label><label>Fecha<input id="event-date" type="date" required value="${escapeHtml(e.eventDate||isoLocalDate(new Date()))}"></label><label>Hora inicio<input id="event-start" type="time" value="${escapeHtml(e.startTime||'')}"></label><label>Hora fin<input id="event-end" type="time" value="${escapeHtml(e.endTime||'')}"></label><label>Ubicación<input id="event-location" value="${escapeHtml(e.location||'')}" maxlength="180"></label></div><div id="match-fields" class="form-grid three"><label>Rival<input id="event-opponent" value="${escapeHtml(e.opponent||'')}" maxlength="120"></label><label>Tipo partido<select id="event-match-type"><option value="FRIENDLY" ${e.matchType==='FRIENDLY'||!e.matchType?'selected':''}>Amistoso</option><option value="OTHER" ${e.matchType==='OTHER'?'selected':''}>Otro</option>${e.matchType==='COMPETITION'?'<option value="COMPETITION" selected>Competición importada</option>':''}</select></label><label>Competición<input id="event-competition" value="${escapeHtml(e.competition||'')}" maxlength="120"></label><label>Resultado club<input id="event-result-for" type="number" min="0" value="${escapeHtml(e.resultFor||'')}"></label><label>Resultado rival<input id="event-result-against" type="number" min="0" value="${escapeHtml(e.resultAgainst||'')}"></label></div><label>Observaciones<textarea id="event-notes" maxlength="1000">${escapeHtml(e.notes||'')}</textarea></label><div class="section-divider"></div><div class="section-heading"><h2>Convocatoria / participantes</h2><p>Marcá jugadores, staff y árbitro. La asistencia se registra después.</p></div><div class="participants-grid">${eventEditorParticipants(e)}</div><div class="button-row"><button class="button secondary" type="button" id="cancel-event">Cancelar</button><button class="button primary" type="submit">Guardar actividad</button></div><div id="message" class="message"></div></form>`,'calendar');
  const updateMatch=()=>document.getElementById('match-fields').style.display=val('event-type')==='MATCH'?'grid':'none';document.getElementById('event-type').onchange=updateMatch;updateMatch();
  document.getElementById('cancel-event').onclick=renderCalendar;
  document.getElementById('event-form').onsubmit=async ev=>{ev.preventDefault();try{showMessage('Guardando actividad…');const payload={eventId:e.eventId||'',eventType:val('event-type'),title:val('event-title'),status:val('event-status'),divisionId:val('event-division'),teamId:val('event-team'),eventDate:val('event-date'),startTime:val('event-start'),endTime:val('event-end'),location:val('event-location'),opponent:val('event-opponent'),matchType:val('event-match-type'),competition:val('event-competition'),resultFor:val('event-result-for'),resultAgainst:val('event-result-against'),notes:val('event-notes')};const saved=(await call('saveEvent',payload)).data;const participants=[];document.querySelectorAll('[data-event-person]').forEach(ch=>{if(ch.checked){const id=ch.dataset.eventPerson;participants.push({personId:id,participantType:document.querySelector(`[data-event-person-type="${id}"]`).value});}});await call('replaceEventParticipants',{eventId:saved.eventId,participants});calendarData=null;await renderCalendar();}catch(err){showMessage(err.message,'error');}};
}

async function renderEventDetail(eventId){
  if(!calendarData){const r=await call('getCalendarData',{});calendarData=r.data;}
  const d=calendarData,e=d.events.find(x=>x.eventId===eventId);if(!e)return renderCalendar();
  const persons={};d.persons.forEach(p=>persons[p.personId]=p);const parts=d.participants.filter(p=>p.eventId===eventId);
  const canEdit=d.canCreate&&['ADMIN','MANAGER','COACH'].includes(currentUser?.role);const meta=(d.leagueMeta||[]).find(m=>m.eventId===eventId);
  const rows=parts.map(p=>`<tr><td>${escapeHtml(persons[p.personId]?.displayName||p.personId)}</td><td>${escapeHtml(p.participantType)}</td><td>${escapeHtml(p.attendanceStatus)}</td><td>${canEdit?`<select data-attendance="${p.eventParticipantId}"><option value="PENDING">Pendiente</option><option value="PRESENT" ${p.attendanceStatus==='PRESENT'?'selected':''}>Presente</option><option value="ABSENT" ${p.attendanceStatus==='ABSENT'?'selected':''}>Ausente</option><option value="EXCUSED" ${p.attendanceStatus==='EXCUSED'?'selected':''}>Justificado</option></select>`:''}</td></tr>`).join('');
  shell(`<section class="hero compact"><span class="eyebrow">${eventTypeLabel(e.eventType)}</span><h1>${escapeHtml(e.title)}</h1><p>${escapeHtml(e.eventDate)} ${escapeHtml(e.startTime||'')} · ${escapeHtml(e.location||'Sin ubicación')}</p></section><section class="panel"><div class="event-summary"><p><strong>Estado:</strong> ${escapeHtml(eventStatusLabel(e.status))}</p>${e.eventType==='MATCH'?`<p><strong>Rival:</strong> ${escapeHtml(e.opponent||'—')} · ${escapeHtml(e.matchType||'')}</p><p><strong>Competición:</strong> ${escapeHtml(e.competition||'—')}</p>${meta?`<p><strong>${escapeHtml(meta.roundName||'Liga')}</strong> · ${escapeHtml(meta.clubSide==='HOME'?'Local':'Visitante')} · Árbitro: ${escapeHtml(meta.refereeName||'Pendiente')}</p>`:''}<p><strong>Resultado:</strong> ${escapeHtml(e.resultFor||'—')} - ${escapeHtml(e.resultAgainst||'—')}</p>`:''}<p>${escapeHtml(e.notes||'')}</p></div>${canEdit?`<div class="button-row event-actions">${e.eventType==='MATCH'?'<button class="button primary" id="match-planning">Disponibilidad y equipo</button>':''}${(!meta||e.eventType!=='MATCH')?'<button class="button secondary" id="edit-event">Editar</button>':''}${e.status!=='CANCELLED'?'<button class="button secondary" id="cancel-activity">Cancelar actividad</button>':'<button class="button secondary" id="reactivate-activity">Reactivar</button>'}${e.eventType==='MATCH'&&e.status!=='POSTPONED'&&e.status!=='COMPLETED'?'<button class="button secondary" id="postpone-match">Postergar</button>':''}${e.status==='POSTPONED'?'<button class="button secondary" id="reschedule-event">Reprogramar</button>':''}<button class="button link danger-text" id="delete-event">Borrar</button></div>`:(e.eventType==='MATCH'?'<div class="button-row"><button class="button primary" id="match-planning">Disponibilidad y equipo</button></div>':'')}<div class="panel-heading"><div><h2>Participantes operativos</h2></div></div>${parts.length?`<div class="table-wrap"><table><thead><tr><th>Persona</th><th>Tipo</th><th>Asistencia</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('Sin participantes operativos')}<div class="button-row"><button class="button secondary" id="back-calendar">Volver</button></div><div id="message" class="message"></div></section>`,'calendar');
  document.getElementById('back-calendar').onclick=renderCalendar;const eb=document.getElementById('edit-event');if(eb)eb.onclick=()=>renderEventEditor(eventId);const mp=document.getElementById('match-planning');if(mp)mp.onclick=()=>renderMatchPlanning(eventId);
  const changeState=async(status,payload={})=>{try{await call('setEventState',Object.assign({eventId,status},payload));calendarData=null;await renderEventDetail(eventId);}catch(err){showMessage(err.message,'error');}};
  const cb=document.getElementById('cancel-activity');if(cb)cb.onclick=()=>{if(confirm('¿Cancelar esta actividad? Se conservará en el historial.'))changeState('CANCELLED');};
  const pb=document.getElementById('postpone-match');if(pb)pb.onclick=()=>{if(confirm('¿Marcar este partido como postergado? La fecha actual se mantiene hasta que lo reprogrames.'))changeState('POSTPONED');};
  const rb=document.getElementById('reactivate-activity');if(rb)rb.onclick=()=>changeState('SCHEDULED');
  const rs=document.getElementById('reschedule-event');if(rs)rs.onclick=async()=>{const nd=prompt('Nueva fecha (AAAA-MM-DD):',e.eventDate||'');if(!nd)return;const nt=prompt('Nueva hora (HH:MM):',e.startTime||'')??'';await changeState('SCHEDULED',{eventDate:nd,startTime:nt});};
  const db=document.getElementById('delete-event');if(db)db.onclick=async()=>{if(!confirm('¿Borrar definitivamente esta actividad? Esta acción elimina convocatorias, disponibilidad y actas asociadas.'))return;try{await call('deleteEvent',{eventId});calendarData=null;await renderCalendar();}catch(err){showMessage(err.message,'error');}};
  document.querySelectorAll('[data-attendance]').forEach(sel=>sel.onchange=async()=>{try{await call('updateEventAttendance',{eventParticipantId:sel.dataset.attendance,attendanceStatus:sel.value});showMessage('Asistencia actualizada.','success');}catch(err){showMessage(err.message,'error');}});
}


let leagueImportState=null;
function teamsForDivision_(divisionId){return (calendarData?.teams||[]).filter(t=>!divisionId||t.divisionId===divisionId);}
function updateLeagueTeamOptions_(preferred=''){
  const div=val('league-division'); const select=document.getElementById('league-team'); if(!select)return;
  const teams=div?teamsForDivision_(div):[];
  select.innerHTML='<option value="">— Sin asignar —</option>'+teams.map(t=>`<option value="${escapeHtml(t.teamId)}">${escapeHtml(t.name)}</option>`).join('');
  if(preferred&&teams.some(t=>t.teamId===preferred))select.value=preferred;
  else if(teams.length===1)select.value=teams[0].teamId;
  else select.value='';
}

function restRoundsForPreview_(data,clubName){
  const key=String(clubName||'').toLowerCase().trim(); if(!key)return [];
  return (data.rounds||[]).filter(r=>!(data.fixtures||[]).some(f=>f.roundName===r.roundName&&[f.homeTeam,f.awayTeam].some(t=>String(t||'').toLowerCase().trim()===key)));
}
async function renderLeagueImport(){
  if(!calendarData){const r=await call('getCalendarData',{});calendarData=r.data;}const d=calendarData;
  shell(`<section class="hero compact"><span class="eyebrow">Competición</span><h1>Importar calendario de liga</h1><p>La división se detecta desde la categoría del XLSX y los equipos se filtran por esa división.</p></section><section class="panel"><form id="league-preview-form" class="form-grid two"><label>Archivo XLSX<input id="league-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></label><div><button class="button primary" type="submit">Analizar archivo</button></div></form><div id="league-preview"></div><div class="button-row"><button class="button secondary" id="league-back">Volver</button></div><div id="message" class="message"></div></section>`,'calendar');
  document.getElementById('league-back').onclick=renderCalendar;
  document.getElementById('league-preview-form').onsubmit=async ev=>{ev.preventDefault();const f=document.getElementById('league-file').files?.[0];if(!f)return;try{showMessage('Analizando calendario…');const dataUrl=await fileToDataUrl(f);const {data}=await call('previewLeagueCalendarImport',{fileDataUrl:dataUrl,fileName:f.name});leagueImportState={previewId:data.previewId,fileName:f.name,preview:data};const rows=data.fixtures.map(x=>`<tr><td>${escapeHtml(x.roundName)}</td><td>${escapeHtml(x.eventDate)} ${escapeHtml(x.startTime||'')}</td><td>${escapeHtml(x.homeTeam)}</td><td>${escapeHtml(x.resultHome||'—')} - ${escapeHtml(x.resultAway||'—')}</td><td>${escapeHtml(x.awayTeam)}</td><td>${escapeHtml(x.refereeName||'—')}</td></tr>`).join('');
    const clubOptions=`<option value="">— Seleccionar nuestro club —</option>`+data.teams.map(t=>`<option value="${escapeHtml(t)}" ${t===data.suggestedClubCalendarName?'selected':''}>${escapeHtml(t)}</option>`).join('');
    document.getElementById('league-preview').innerHTML=`<div class="section-divider"></div><div class="section-heading"><h2>${escapeHtml(data.competition||'Competición')}</h2><p>${escapeHtml(data.category||'')} · ${data.fixtureCount} partidos detectados.</p></div><div class="form-grid three"><label>Nuestro equipo detectado<select id="league-club-name">${clubOptions}</select></label><label>División detectada<select id="league-division"><option value="">— Seleccionar división —</option>${optionList(d.divisions,'divisionId',x=>x.name,data.suggestedDivisionId||'',false)}</select></label><label>Equipo<select id="league-team"></select></label></div><div class="table-wrap compact-table"><table><thead><tr><th>Jornada</th><th>Fecha</th><th>Local</th><th>Res.</th><th>Visitante</th><th>Árbitro</th></tr></thead><tbody>${rows}</tbody></table></div><button class="button primary" id="league-import-confirm">Importar partidos del club</button>`;
    const divSel=document.getElementById('league-division'); if(data.suggestedDivisionId)divSel.value=data.suggestedDivisionId;
    updateLeagueTeamOptions_(data.suggestedTeamId||''); divSel.onchange=()=>updateLeagueTeamOptions_('');
    document.getElementById('league-import-confirm').onclick=commitLeagueImport;
    const detectedDivision=(d.divisions.find(x=>x.divisionId===data.suggestedDivisionId)||{}).name;
    const detectedClub=data.suggestedClubCalendarName||'sin coincidencia automática';
    const marker=data.detectedDivisionMarker||'sin categoría reconocida';
    const rests=restRoundsForPreview_(data,data.suggestedClubCalendarName); showMessage(`Archivo analizado. Club: ${detectedClub}. Categoría: ${marker}.${detectedDivision?' División: '+detectedDivision+'.':' Confirma la división.'}${rests.length?' Descansos detectados: '+rests.length+'.':''}`,'success');
  }catch(err){showMessage(err.message+(err.requestId?` · Solicitud ${err.requestId}`:''),'error');}};
}
function leagueConflictText_(c){
  const current=c.current||{},official=c.official||{};
  const currentText=`${eventTypeLabel(current.eventType)} · ${current.title||''} · ${current.eventDate||''}`;
  const officialText=official.kind==='REST'?`Descanso oficial · ${official.eventDate||''}`:`Partido oficial · ${official.title||''} · ${official.eventDate||''} ${official.startTime||''}`;
  return {currentText,officialText};
}
function renderLeagueConflicts_(conflicts){
  const host=document.getElementById('league-conflicts')||document.getElementById('league-preview');
  if(!host)return;
  const cards=(conflicts||[]).map(c=>{const t=leagueConflictText_(c);return `<article class="conflict-card"><h3>${escapeHtml(c.roundName||'Conflicto de calendario')}</h3><p>El calendario oficial cambió y existe una modificación local.</p><div class="conflict-compare"><div><span class="eyebrow">Actual</span><strong>${escapeHtml(t.currentText)}</strong></div><div><span class="eyebrow">Federación</span><strong>${escapeHtml(t.officialText)}</strong></div></div><label class="check-row"><input type="radio" name="conflict-${c.conflictId}" value="KEEP_CURRENT" checked> Mantener lo que tenemos</label><label class="check-row"><input type="radio" name="conflict-${c.conflictId}" value="USE_OFFICIAL"> Reemplazar por el calendario oficial</label><small>Reemplazar puede eliminar convocatoria, disponibilidad, alineación o acta vinculadas al evento actual.</small></article>`}).join('');
  host.insertAdjacentHTML('beforeend',`<section id="league-conflicts" class="conflict-section"><div class="section-divider"></div><div class="section-heading"><h2>Hay cambios para revisar</h2><p>Elegí qué hacer en cada jornada. No modificamos nada hasta que confirmes.</p></div>${cards}<button class="button primary" id="league-conflicts-apply">Aplicar decisiones e importar</button></section>`);
  document.getElementById('league-conflicts-apply').onclick=()=>commitLeagueImport(true);
}
async function commitLeagueImport(withResolutions=false){if(!leagueImportState)return;const club=val('league-club-name'),division=val('league-division');if(!club)return showMessage('Selecciona cómo figura nuestro club en el calendario.','error');if(!division)return showMessage('Selecciona la división antes de importar.','error');const button=document.getElementById(withResolutions?'league-conflicts-apply':'league-import-confirm');if(button)button.disabled=true;try{const conflictResolutions={};if(withResolutions&&(leagueImportState.conflicts||[]).length){leagueImportState.conflicts.forEach(c=>{const checked=document.querySelector(`input[name="conflict-${c.conflictId}"]:checked`);if(checked)conflictResolutions[c.conflictId]=checked.value;});}showMessage(withResolutions?'Aplicando decisiones…':'Importando partidos…');const {data}=await call('importLeagueCalendar',{previewId:leagueImportState.previewId,fileName:leagueImportState.fileName,clubCalendarName:club,divisionId:division,teamId:val('league-team'),conflictResolutions});if(data.requiresResolution){leagueImportState.conflicts=data.conflicts||[];const old=document.getElementById('league-conflicts');if(old)old.remove();renderLeagueConflicts_(leagueImportState.conflicts);showMessage('El calendario oficial cambió. Revisa los conflictos antes de importar.','info');if(button)button.disabled=false;return;}calendarData=null;alert(`Importación completada: ${data.imported} partidos nuevos, ${data.updated} actualizados, ${data.restImported||0} descansos. Conflictos mantenidos: ${data.keptConflicts||0}; reemplazados: ${data.replacedConflicts||0}.`);renderCalendar();}catch(err){showMessage(err.message+(err.requestId?` · Solicitud ${err.requestId}`:''),'error');if(button)button.disabled=false;}}

function availabilityLabel(s){return ({AVAILABLE:'Disponible',UNAVAILABLE:'No disponible',MAYBE:'Duda'})[s]||'Sin respuesta';}
async function renderMatchPlanning(eventId){
  try{const {data}=await call('getMatchPlanningData',{eventId});const e=data.event,availMap={},lineMap={};data.availability.forEach(a=>availMap[a.personId]=a);data.lineup.forEach(l=>lineMap[l.personId]=l);const canRespond={};(data.responsePersonIds||[]).forEach(id=>canRespond[id]=true);
    const playerRows=data.players.map(p=>{const a=availMap[p.personId],l=lineMap[p.personId];return `<tr><td><strong>${escapeHtml(p.displayName)}</strong></td><td>${escapeHtml(availabilityLabel(a?.status))}${a?.comment?`<small>${escapeHtml(a.comment)}</small>`:''}</td><td>${l?`${l.lineupRole==='STARTER'?'Titular':'Suplente'} ${l.jerseyNumber?'#'+escapeHtml(l.jerseyNumber):''}`:'—'}</td><td>${canRespond[p.personId]?`<select data-availability-person="${p.personId}"><option value="AVAILABLE" ${a?.status==='AVAILABLE'?'selected':''}>Disponible</option><option value="MAYBE" ${a?.status==='MAYBE'?'selected':''}>Duda</option><option value="UNAVAILABLE" ${a?.status==='UNAVAILABLE'?'selected':''}>No disponible</option></select>`:''}</td></tr>`}).join('');
    const lineupEditor=data.canManage?`<div class="section-divider"></div><div class="section-heading"><h2>Armar equipo</h2><p>Seleccioná titulares y suplentes. La disponibilidad es orientativa: el staff decide la convocatoria final.</p></div><div class="lineup-builder">${data.players.map(p=>{const l=lineMap[p.personId];return `<label class="lineup-row"><input type="checkbox" data-lineup-person="${p.personId}" ${l?'checked':''}><span>${escapeHtml(p.displayName)}</span><select data-lineup-role="${p.personId}"><option value="STARTER" ${l?.lineupRole==='STARTER'?'selected':''}>Titular</option><option value="SUBSTITUTE" ${l?.lineupRole==='SUBSTITUTE'?'selected':''}>Suplente</option></select><input data-lineup-number="${p.personId}" placeholder="Dorsal" maxlength="3" value="${escapeHtml(l?.jerseyNumber||'')}"></label>`}).join('')}</div><button class="button primary" id="save-lineup">Guardar convocatoria/equipo</button>`:'';
    const reports=(data.reports||[]).map(r=>`<li><strong>${escapeHtml(r.originalName)}</strong> · ${escapeHtml(r.status)} <button class="button mini secondary" data-report-view="${r.reportId}">Ver</button>${r.status==='PARSED'?` <button class="button mini primary" data-report-apply="${r.reportId}">Revisar/aplicar</button>`:''}</li>`).join('');const reportBlock=data.canManage?`<div class="section-divider"></div><div class="section-heading"><h2>Acta oficial</h2><p>Para liga, subí el PDF después del partido. Se intentará extraer fecha, campo, resultado y árbitro; siempre requiere revisión antes de aplicar.</p></div><form id="report-form" class="form-grid two"><label>Acta PDF<input id="report-file" type="file" accept="application/pdf,.pdf" required></label><div><button class="button secondary" type="submit">Subir acta</button></div></form>${reports?`<ul class="file-list">${reports}</ul>`:''}`:'';
    shell(`<section class="hero compact"><span class="eyebrow">Partido</span><h1>${escapeHtml(e.title)}</h1><p>${escapeHtml(e.eventDate)} ${escapeHtml(e.startTime||'')} · ${escapeHtml(e.competition||'Amistoso')}</p></section><section class="panel"><div class="panel-heading"><div><h2>Disponibilidad</h2><p>Los jugadores o sus tutores pueden responder antes de que el staff arme el equipo.</p></div></div><div class="table-wrap"><table><thead><tr><th>Jugador</th><th>Respuesta</th><th>Equipo</th><th>Mi respuesta</th></tr></thead><tbody>${playerRows}</tbody></table></div>${lineupEditor}${reportBlock}<div class="button-row"><button class="button secondary" id="planning-back">Volver al partido</button></div><div id="message" class="message"></div></section>`,'calendar');
    document.getElementById('planning-back').onclick=()=>renderEventDetail(eventId);document.querySelectorAll('[data-availability-person]').forEach(sel=>sel.onchange=async()=>{try{await call('setMatchAvailability',{eventId,personId:sel.dataset.availabilityPerson,status:sel.value,comment:''});showMessage('Disponibilidad guardada.','success');}catch(err){showMessage(err.message,'error');}});
    const sb=document.getElementById('save-lineup');if(sb)sb.onclick=async()=>{try{const lineup=[];document.querySelectorAll('[data-lineup-person]').forEach(ch=>{if(ch.checked){const id=ch.dataset.lineupPerson;lineup.push({personId:id,lineupRole:document.querySelector(`[data-lineup-role="${id}"]`).value,jerseyNumber:document.querySelector(`[data-lineup-number="${id}"]`).value});}});await call('saveMatchLineup',{eventId,lineup});showMessage('Equipo guardado.','success');setTimeout(()=>renderMatchPlanning(eventId),350);}catch(err){showMessage(err.message,'error');}};
    const rf=document.getElementById('report-form');if(rf)rf.onsubmit=async ev=>{ev.preventDefault();const f=document.getElementById('report-file').files?.[0];if(!f)return;try{showMessage('Subiendo y procesando acta…');const dataUrl=await fileToDataUrl(f);const {data:r}=await call('uploadMatchReport',{eventId,fileDataUrl:dataUrl,originalName:f.name});if(r.ocrAvailable)alert('Acta procesada. Revisa los datos extraídos antes de aplicarlos.');else alert('Acta guardada. La extracción automática no está disponible; el PDF queda almacenado de forma privada.');await renderMatchPlanning(eventId);}catch(err){showMessage(err.message,'error');}};
    document.querySelectorAll('[data-report-view]').forEach(b=>b.onclick=async()=>{try{const {data:f}=await call('getMatchReportFile',{reportId:b.dataset.reportView});const w=window.open();if(w)w.document.write(`<iframe src="${f.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`);}catch(err){showMessage(err.message,'error');}});document.querySelectorAll('[data-report-apply]').forEach(b=>b.onclick=()=>reviewAndApplyReport(b.dataset.reportApply,eventId));
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudo cargar el partido</h1><p>${escapeHtml(err.message)}</p></section>`,'calendar');}
}
async function reviewAndApplyReport(reportId,eventId){try{const {data}=await call('getMatchPlanningData',{eventId});const r=(data.reports||[]).find(x=>x.reportId===reportId);let ex={};try{ex=JSON.parse(r?.extractedJson||'{}')}catch(ignore){}const home=prompt('Equipo local detectado:',ex.homeTeam||data.leagueMeta?.homeTeam||'')??'';const away=prompt('Equipo visitante detectado:',ex.awayTeam||data.leagueMeta?.awayTeam||'')??'';const rh=prompt('Resultado local:',ex.resultHome||'')??'';const ra=prompt('Resultado visitante:',ex.resultAway||'')??'';const referee=prompt('Árbitro:',ex.refereeName||data.leagueMeta?.refereeName||'')??'';await call('applyMatchReport',{reportId,confirmed:{homeTeam:home,awayTeam:away,resultHome:rh,resultAway:ra,refereeName:referee,eventDate:ex.eventDate||'',startTime:ex.startTime||'',location:ex.location||''},reviewNotes:'Revisado desde interfaz'});calendarData=null;alert('Acta aplicada al partido.');renderEventDetail(eventId);}catch(err){showMessage(err.message,'error');}}

