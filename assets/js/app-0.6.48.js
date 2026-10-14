const FRONTEND_BUILD = '0.6.48';
const config = window.APP_BOOTSTRAP || {};
const root = document.getElementById('app');
const SESSION_STORAGE_KEY = 'gestionClub.sessionToken';
const APP_BOOTSTRAP_CACHE_KEY = 'gestionClub.bootstrap.v2';
const RUNTIME_MAINTENANCE_SESSION_KEY = 'gestionClub.maintenance.0.6.48';
let sessionToken = sessionStorage.getItem(SESSION_STORAGE_KEY) || '';
let currentUser = null;
let clubConfig = null;
let structureData = null;
let statisticsData = null;
let seasonContext = null;
let familyData = null;
let structureSection = 'people';
const UI_STATE_KEY = 'gestionClub.uiState.v1';
function loadUiState_(){try{return JSON.parse(sessionStorage.getItem(UI_STATE_KEY)||'{}')||{};}catch(_){return {};}}
function saveUiStatePatch_(patch){const next=Object.assign({},loadUiState_(),patch||{});sessionStorage.setItem(UI_STATE_KEY,JSON.stringify(next));return next;}
function textNorm_(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
const APP_TIMEZONE = config.timezone || 'Europe/Madrid';
function formatAppDateTime_(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return String(value||'').replace('T',' ').slice(0,16);
  try{
    return new Intl.DateTimeFormat('es-ES',{timeZone:APP_TIMEZONE,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).replace(',', '');
  }catch(_){return String(value||'').replace('T',' ').slice(0,16);}
}



function readBootstrapCache_(){
  try { return JSON.parse(sessionStorage.getItem(APP_BOOTSTRAP_CACHE_KEY)||'null'); }
  catch(_){ return null; }
}
function writeBootstrapCache_(data){
  try {
    if(!data)return;
    const safe=JSON.parse(JSON.stringify(data));
    if(safe.clubConfig&&String(safe.clubConfig.logoDataUrl||'').length>450000)safe.clubConfig.logoDataUrl='';
    sessionStorage.setItem(APP_BOOTSTRAP_CACHE_KEY,JSON.stringify(safe));
  } catch(_) { /* cache best effort */ }
}
function clearBootstrapCache_(){ try{sessionStorage.removeItem(APP_BOOTSTRAP_CACHE_KEY);}catch(_){} }
function applyBootstrapData_(data){
  const d=data||{};
  if(d.actor)currentUser={email:d.actor.email||'',displayName:d.actor.displayName||'',role:d.actor.role||'MEMBER',personId:d.actor.personId||'',accessProfile:d.actor.accessProfile||{}};
  if(d.clubConfig){clubConfig=d.clubConfig;applyClubTheme(clubConfig);}
  if(d.seasonContext){seasonContext=d.seasonContext;const selected=selectedSeasonId_();if(selected!==String(loadUiState_().selectedSeasonId||''))saveUiStatePatch_({selectedSeasonId:selected});}
  writeBootstrapCache_({actor:d.actor||null,clubConfig:d.clubConfig||null,seasonContext:d.seasonContext||null,cachedAt:new Date().toISOString()});
}
function currentNavKey_(){const active=document.querySelector('[data-nav].active');return active?.dataset?.nav||'';}
function scheduleRuntimeMaintenance_(){
  if(!currentAccessProfile_().isAdmin)return;
  try{if(sessionStorage.getItem(RUNTIME_MAINTENANCE_SESSION_KEY)==='DONE')return;}catch(_){}
  setTimeout(()=>{
    call('runRuntimeMaintenance').then(()=>{try{sessionStorage.setItem(RUNTIME_MAINTENANCE_SESSION_KEY,'DONE');}catch(_){}}).catch(()=>{});
  },1400);
}
function renderStartupShell_(){
  root.className='';
  root.innerHTML=`<main class="container"><section class="panel narrow startup-panel"><span class="eyebrow">Gestión Club</span><h1>Preparando tu sesión</h1><p>Cargando configuración y temporada…</p><div class="inline-loader" aria-label="Cargando"></div></section></main>`;
}

// 0.6.48 - disponibilidad automática, snapshot histórico y asistencia simplificada.
// 0.6.47 - disponibilidad deportiva, bajas y ausencias para partidos y entrenamientos.
// 0.6.46 - sincronización autoritativa de árbitros FAR / MatchReady.
// 0.6.45 - feedback de carga visible y centrado.
// Las lecturas muestran un indicador compacto centrado sin bloquear la navegación;
// las operaciones que modifican datos usan el mismo componente con backdrop bloqueante.
// Aparece con una pequeña demora para evitar parpadeos en respuestas rápidas.
let uiBusySeq = 0;
const uiBusyTasks = new Map();
let uiBusyTimer = null;

function busyMessageForAction_(action) {
  const a = String(action || '');
  if (a === 'login') return 'Validando cuenta…';
  if (a === 'status') return 'Comprobando sistema…';
  if (/analyzeCompetitionSource/i.test(a)) return 'Analizando FAR / MatchReady…';
  if (/syncCompetitionFromWeb/i.test(a)) return 'Actualizando desde FAR…';
  if (/processCompetitionOfficialReports/i.test(a)) return 'Descargando y procesando actas oficiales…';
  if (/previewLeagueCalendarImport/i.test(a)) return 'Analizando calendario…';
  if (/importLeagueCalendar/i.test(a)) return 'Importando calendario…';
  if (/uploadMatchReport/i.test(a)) return 'Subiendo y procesando acta…';
  if (/reprocessMatchReport/i.test(a)) return 'Reprocesando acta…';
  if (/applyMatchReport/i.test(a)) return 'Aplicando datos del acta…';
  if (/getMatchReportFile/i.test(a)) return 'Cargando acta…';
  if (/MatchReportPeople/i.test(a)) return 'Vinculando personas…';
  if (/saveMatchLineup/i.test(a)) return 'Guardando equipo…';
  if (/MatchAvailability/i.test(a)) return 'Guardando disponibilidad…';
  if (/uploadDocument/i.test(a)) return 'Subiendo documento…';
  if (/save|create|update|delete|cancel|postpone|reactivate|review|set/i.test(a)) return 'Guardando cambios…';
  if (/get|list|status|statistics|calendar|structure|planning/i.test(a)) return 'Cargando…';
  return 'Procesando…';
}

function ensureBusyOverlay_() {
  let overlay = document.getElementById('ui-busy-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'ui-busy-overlay';
  overlay.className = 'ui-busy-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-label', 'Operación en curso');
  overlay.innerHTML = `<div class="ui-busy-card"><span class="ui-spinner" aria-hidden="true"></span><div><strong data-ui-busy-title>Procesando…</strong><small data-ui-busy-subtitle>Esperá un momento.</small></div></div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function refreshBusyOverlay_() {
  const overlay = ensureBusyOverlay_();
  const tasks = Array.from(uiBusyTasks.values());
  const latest = tasks.length ? tasks[tasks.length - 1] : null;
  const blocking = tasks.some(task => !!task.blocking);
  const title = overlay.querySelector('[data-ui-busy-title]');
  const subtitle = overlay.querySelector('[data-ui-busy-subtitle]');
  if (title) title.textContent = latest?.message || 'Procesando…';
  if (subtitle) subtitle.textContent = blocking ? 'Esperá un momento.' : 'Estamos preparando la pantalla.';
  if (uiBusyTasks.size) {
    overlay.classList.toggle('is-blocking', blocking);
    overlay.classList.toggle('is-passive', !blocking);
    document.documentElement.setAttribute('aria-busy', 'true');
    if ('inert' in root) root.inert = blocking;
    if (!overlay.classList.contains('is-visible') && !uiBusyTimer) {
      uiBusyTimer = setTimeout(() => {
        uiBusyTimer = null;
        if (uiBusyTasks.size) overlay.classList.add('is-visible');
      }, 240);
    }
  } else {
    if (uiBusyTimer) clearTimeout(uiBusyTimer);
    uiBusyTimer = null;
    overlay.classList.remove('is-visible', 'is-blocking', 'is-passive');
    document.documentElement.removeAttribute('aria-busy');
    if ('inert' in root) root.inert = false;
  }
}

function beginUiBusy_(message, blocking = true) {
  const token = ++uiBusySeq;
  uiBusyTasks.set(token, {message: message || 'Procesando…', blocking: !!blocking});
  refreshBusyOverlay_();
  return token;
}

function endUiBusy_(token) {
  uiBusyTasks.delete(token);
  refreshBusyOverlay_();
}

async function withUiBusy_(message, task) {
  const token = beginUiBusy_(message);
  try { return await task(); }
  finally { endUiBusy_(token); }
}

function showToast_(message, kind = 'success', duration = 2600) {
  let host = document.getElementById('ui-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'ui-toast-host';
    host.className = 'ui-toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const toast = document.createElement('div');
  toast.className = `ui-toast ${kind}`;
  toast.textContent = message;
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 180);
  }, duration);
}

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
    const action = request?.action || '';
    const timeoutMs = action === 'importLeagueCalendar' ? 150000
      : action === 'syncCompetitionFromWeb' ? 180000
      : action === 'processCompetitionOfficialReports' ? 180000
      : action === 'analyzeCompetitionSource' ? 120000
      : action === 'saveCompetition' ? 60000
      : action === 'previewLeagueCalendarImport' ? 60000
      : ['uploadMatchReport','reprocessMatchReport'].includes(action) ? 120000
      : action === 'getStatisticsData' ? 60000
      : 30000;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error(action === 'syncCompetitionFromWeb'
        ? 'La sincronización con FAR está tardando más de lo esperado. La competición ya está guardada; podés volver a Competiciones y reintentar la actualización sin duplicar partidos.'
        : 'El backend está tardando demasiado en responder.'));
    }, timeoutMs);
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

function shouldBlockUiForAction_(action){
  const a=String(action||'');
  return /^(login|logout|save|create|update|delete|set|upload|import|reprocess|apply|analyze|sync|process|copy|generate|review|reset|link|refreshMatchReportOfficialData)/i.test(a)
    || /^(previewLeagueCalendarImport|runTechnicalTest)$/i.test(a);
}

async function call(action, payload = {}, fixedRequestId = null) {
  const blocking = shouldBlockUiForAction_(action);
  const busyToken = beginUiBusy_(busyMessageForAction_(action), blocking);
  try {
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
  } finally {
    if (busyToken) endUiBusy_(busyToken);
  }
}


function userErrorText_(err){
  const base=err&&err.message?err.message:'No se pudo completar la operación.';
  const code=err&&err.code&&err.code!=='UNKNOWN_ERROR'?' ['+err.code+']':'';
  const req=err&&err.requestId?' · Solicitud '+err.requestId:'';
  return base+code+req;
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
  seasonContext = null;
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  clearBootstrapCache_();
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
  const backendVersion=String(config.appVersion||'?');
  const mismatch=backendVersion!==FRONTEND_BUILD?` · frontend ${escapeHtml(FRONTEND_BUILD)}`:'';
  return `${logo}<div><strong>${escapeHtml(name)}</strong><small>Versión ${escapeHtml(backendVersion)}${mismatch} · ${escapeHtml(config.environment || 'sin configurar')}</small></div>`;
}

function roleDisplayName(role) {
  return ({ADMIN:'Administrador',MEMBER:'Acceso por persona',MANAGER:'Manager',COACH:'Entrenador',REFEREE:'Árbitro',PLAYER:'Jugador',TUTOR:'Tutor',COORDINATOR:'Coordinador',COLLABORATOR:'Colaborador'})[role] || role || '';
}
function currentAccessProfile_(){return currentUser?.accessProfile||{capabilities:{},accessLabels:[]};}
function currentAccessSummary_(){const p=currentAccessProfile_();if(p.isAdmin)return 'Administrador';const labels=p.accessLabels||[];if(!labels.length)return 'Acceso personal';return labels.length>1?`${labels[0]} +${labels.length-1}`:labels[0];}

function seasonList_(){return seasonContext?.seasons||[];}
function selectedSeasonId_(){
  const seasons=seasonList_(),saved=String(loadUiState_().selectedSeasonId||''),active=String(seasonContext?.activeSeasonId||clubConfig?.activeSeason?.seasonId||'');
  if(saved&&seasons.some(x=>x.seasonId===saved))return saved;
  if(active&&seasons.some(x=>x.seasonId===active))return active;
  return seasons[0]?.seasonId||active||'';
}
function selectedSeason_(){const id=selectedSeasonId_();return seasonList_().find(x=>x.seasonId===id)||clubConfig?.activeSeason||null;}
async function loadSeasonContext_(force=false){
  if(seasonContext&&!force)return seasonContext;
  const {data}=await call('getSeasonContext');seasonContext=data||{activeSeasonId:'',seasons:[]};
  const selected=selectedSeasonId_();if(selected!==String(loadUiState_().selectedSeasonId||''))saveUiStatePatch_({selectedSeasonId:selected});
  return seasonContext;
}
function seasonSwitcherMarkup_(){
  if(!currentUser)return '';
  const seasons=seasonList_(),selectedId=selectedSeasonId_(),activeId=seasonContext?.activeSeasonId||'';
  if(!seasons.length)return `<div class="season-switcher empty"><span>Temporada</span><strong>Sin configurar</strong></div>`;
  return `<label class="season-switcher"><span>Temporada</span><select id="global-season-select" aria-label="Temporada de trabajo">${seasons.map(x=>`<option value="${escapeHtml(x.seasonId)}" ${x.seasonId===selectedId?'selected':''}>${escapeHtml(x.name)}${x.seasonId===activeId?' · activa':''}</option>`).join('')}</select></label>`;
}
function resetSeasonScopedUi_(seasonId){
  const ui=loadUiState_(),calendar=Object.assign({},ui.calendarFilters||{},{divisionId:'',teamId:''}),statistics=Object.assign({},ui.statisticsFilters||{},{seasonId:seasonId||'',divisionId:'',teamId:''}),people=Object.assign({},ui.peopleFilters||{},{divisionId:''});
  saveUiStatePatch_({selectedSeasonId:seasonId||'',calendarFilters:calendar,statisticsFilters:statistics,peopleFilters:people});
  structureData=null;calendarData=null;statisticsData=null;
}
function rerenderForSeason_(active){
  if(active==='home')return renderDashboard();
  if(active==='structure')return renderStructure();
  if(active==='calendar')return renderCalendar();
  if(active==='statistics')return renderStatistics();
  if(active==='seasons')return renderSeasons();
}

function navigationForRole() {
  const p=currentAccessProfile_(),c=p.capabilities||{};
  const all=[['home','Inicio'],['structure',c.browseStructure?'Estructura':'Mi perfil'],['documents','Documentos'],['calendar','Calendario'],['statistics','Estadísticas'],['users','Usuarios'],['seasons','Temporadas'],['settings','Configuración']];
  return all.filter(([key])=>{
    if(key==='home')return true;
    if(key==='structure')return !!c.viewStructure;
    if(key==='documents')return !!c.viewDocuments;
    if(key==='calendar')return !!c.viewCalendar;
    if(key==='statistics')return !!c.viewStatistics;
    if(key==='users')return !!c.manageUsers;
    if(key==='seasons'||key==='settings')return !!p.isAdmin;
    return false;
  });
}

function navMarkup(active) {
  if (!currentUser) return '';
  return navigationForRole().map(([key,label]) =>
    `<button class="nav-link ${active === key ? 'active' : ''}" data-nav="${key}"><span class="nav-icon">${({home:'⌂',structure:'◆',families:'♙',documents:'▤',calendar:'▦',statistics:'▥',users:'◎',seasons:'◫',settings:'⚙'})[key] || '•'}</span><span class="nav-label">${label}</span></button>`
  ).join('');
}

function dashboardCardsForRole() {
  const p=currentAccessProfile_(),c=p.capabilities||{},cards=[];
  if(c.viewCalendar)cards.push(['Actividad','Calendario deportivo','Entrenamientos, partidos, disponibilidad y convocatorias.','go-calendar','primary']);
  if(c.viewStructure)cards.push(['Gestión','Estructura deportiva','Personas y organización dentro de tu alcance.','go-structure','secondary']);
  if(c.viewStatistics)cards.push(['Rendimiento','Estadísticas','Minutos, convocatorias, puntos, disciplina y resultados.','go-statistics','secondary']);
  if(c.viewDocuments)cards.push(['Archivos','Documentación','Consultá tu documentación y la que tu rol permita gestionar.','go-documents','secondary']);
  if(c.manageUsers)cards.push(['Acceso','Usuarios','Cuentas, Persona asociada y permisos efectivos.','go-users','secondary']);
  if(p.isAdmin)cards.push(['Temporadas','Gestión de temporadas','Alta, activación y reglas deportivas por temporada.','go-seasons','secondary']);
  if(p.isAdmin)cards.push(['Club','Configuración','Identidad, contacto, logo y colores del club.','go-settings','secondary']);
  return cards.map(c=>`<article class="quick-card role-card"><span class="eyebrow">${c[0]}</span><h2>${c[1]}</h2><p>${c[2]}</p><button class="button ${c[4]}" id="${c[3]}">${c[1]}</button></article>`).join('');
}

function isMobileViewport(){ return window.matchMedia && window.matchMedia('(max-width: 760px)').matches; }

function shell(content, active = 'home') {
  root.className = '';
  root.innerHTML = `
    <header class="topbar">
      <div class="brand">${brandMarkup()}</div>
      ${currentUser ? seasonSwitcherMarkup_() : ''}
      ${currentUser ? `<div class="session"><div class="session-copy"><span>${escapeHtml(currentUser.displayName||currentUser.email)}</span><small>${escapeHtml(currentAccessSummary_())}</small></div><button class="button ghost logout-button" id="logout">Salir</button></div>` : ''}
    </header>
    ${currentUser ? `<nav class="nav">${navMarkup(active)}</nav>` : ''}
    <main class="container">${content}</main>
    <footer>Gestión Club ${escapeHtml(config.appVersion || '')}${String(config.appVersion||'')!==FRONTEND_BUILD?` · frontend ${escapeHtml(FRONTEND_BUILD)}`:''} · entorno ${escapeHtml(config.environment || '')}</footer>`;
  const logoutButton = document.getElementById('logout');
  if (logoutButton) logoutButton.onclick = logout;
  const seasonSelect=document.getElementById('global-season-select');if(seasonSelect)seasonSelect.onchange=()=>{resetSeasonScopedUi_(seasonSelect.value);rerenderForSeason_(active);};
  document.querySelectorAll('[data-nav]').forEach(button => {
    button.onclick = () => {
      const nav=button.dataset.nav;
      if(nav==='settings') return renderClubSettings();
      if(nav==='structure') return renderStructure();
      if(nav==='families') return renderFamilies();
      if(nav==='documents') return renderDocuments();
      if(nav==='users') return renderUsers();
      if(nav==='calendar') return renderCalendar();
      if(nav==='statistics') return renderStatistics();
      if(nav==='seasons') return renderSeasons();
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
      const boot=(await call('getAppBootstrap')).data;
      applyBootstrapData_(boot);
      await renderDashboard();
      scheduleRuntimeMaintenance_();
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
  if (!seasonContext) await loadSeasonContext_();
  const clubName = clubConfig?.officialName || 'Tu club todavía no está configurado';
  const season = selectedSeason_()?.name || 'Sin temporada configurada';
  shell(`
    <section class="hero role-hero">
      <span class="eyebrow">${escapeHtml(roleDisplayName(currentUser?.role))}</span>
      <h1>${escapeHtml(clubName)}</h1>
      <p>Temporada de trabajo: ${escapeHtml(season)}. Accesos rápidos adaptados a tu función.</p>
    </section>
    <section class="quick-grid role-quick-grid">${dashboardCardsForRole()}</section>
    <section class="panel">
      <div class="panel-heading"><div><h2>Estado técnico</h2><p>Comprobación de backend y almacenamiento.</p></div><button class="button secondary" id="refresh-status">Actualizar</button></div>
      <div id="status-grid" class="status-grid">${statusCard('Autenticación', true, currentUser?.email || 'Sesión activa')}${statusCard('Backend', false, 'Comprobando…')}${statusCard('Google Sheets', false, 'Comprobando…')}${statusCard('Google Drive', false, 'Comprobando…')}${statusCard('Drive API v3', false, 'Comprobando…')}${statusCard('OCR PDF', false, 'Comprobando…')}</div>
    </section>
    <div id="message" class="message" aria-live="polite"></div>`, 'home');
  const wire=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn;};
  wire('go-structure',()=>renderStructure());
  wire('go-documents',renderDocuments);
  wire('go-users',renderUsers);
  wire('go-calendar',renderCalendar);
  wire('go-statistics',renderStatistics);
  wire('go-seasons',renderSeasons);
  wire('go-settings',renderClubSettings);
  document.getElementById('refresh-status').onclick = loadStatus;
  void loadStatus();
}

async function loadStatus() {
  const button = document.getElementById('refresh-status');
  if (button) button.disabled = true;
  try {
    const { data } = await call('status');
    currentUser = { email:data.actor.email, displayName:data.actor.displayName||'', role:data.actor.role, personId:data.actor.personId||'', accessProfile:data.actor.accessProfile||{} };
    const grid = document.getElementById('status-grid');
    if (grid) grid.innerHTML = [
      statusCard('Autenticación', data.authenticated, `${data.actor.email} · ${data.actor.role}`),
      statusCard('Backend', data.backend.ok, `v${data.backend.version} · ${data.backend.environment}`),
      statusCard('Google Sheets', data.sheets.ok, `${data.sheets.spreadsheetName} · ${data.sheets.requiredSheets} hojas`),
      statusCard('Google Drive', data.drive.ok, data.drive.rootFolderName),
      statusCard('Drive API v3', !!data.ocr?.ok, data.ocr?.ok ? `${data.ocr.apiVersion} · ${data.ocr.method}` : (data.ocr?.detail || 'No disponible')),
      statusCard('OCR PDF', !!data.ocr?.ocrPdfReady, data.ocr?.ocrPdfReady ? 'Preparado · idioma español' : 'No disponible')
    ].join('');
    showMessage('Sistema disponible.', 'success');
  } catch (error) {
    if (!sessionToken) return renderLogin();
    showMessage(`${error.message}${error.requestId ? ` · Solicitud ${error.requestId}` : ''}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function renderSeasons(){
  if(currentUser?.role!=='ADMIN')return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>Solo un administrador puede gestionar las temporadas.</p></section>','seasons');
  if(!seasonContext)await loadSeasonContext_();
  shell(`<section class="hero compact"><span class="eyebrow">Temporadas</span><h1>Gestión deportiva por temporada</h1><p>Creá, editá y activá temporadas. El selector de la cabecera cambia la temporada de trabajo; “Activar” define cuál se usará por defecto al entrar.</p></section><section class="panel"><div class="section-heading"><h2>Temporadas</h2><p>Equipos, asignaciones, calendario y estadísticas se separan por temporada. Personas, cargos y divisiones siguen siendo registros maestros.</p></div><div id="season-manager-content"><p>Cargando temporadas…</p></div></section>`,'seasons');
  await hydrateSeasonManager_();
}

async function hydrateSeasonManager_(){
  try{
    const seasonResp=await call('getSeasonsData'),sd=seasonResp.data||{},list=sd.seasons||[];
    const rows=list.map(x=>`<tr><td><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml(x.startDate||'')} → ${escapeHtml(x.endDate||'')}</small></td><td>${x.seasonId===sd.activeSeasonId?'<span class="badge active">Activa</span>':statusBadge(x.status)}</td><td>${x.divisionCount||0} div · ${x.teamCount||0} equipos · ${x.assignmentCount||0} asignaciones · ${x.eventCount||0} eventos</td><td><button type="button" class="button mini secondary" data-edit-season="${escapeHtml(x.seasonId)}">Editar</button> <button type="button" class="button mini secondary" data-config-season="${escapeHtml(x.seasonId)}">Reglas</button> ${x.seasonId===sd.activeSeasonId?'':`<button type="button" class="button mini primary" data-activate-season="${escapeHtml(x.seasonId)}">Activar</button>`}</td></tr>`).join('');
    const host=document.getElementById('season-manager-content');if(!host)return;
    host.innerHTML=`${rows?`<div class="table-wrap"><table><thead><tr><th>Temporada</th><th>Estado</th><th>Datos deportivos</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty-state">No hay temporadas todavía.</div>'}<div class="section-divider"></div><div class="section-heading"><h3>Nueva temporada / edición</h3><p>Al crear una temporada se preparan las reglas de división tomando como base la temporada activa.</p></div><form id="new-season-form" class="form-grid three"><input id="new-season-id" type="hidden"><label>Nombre<input id="new-season-name" placeholder="2027/2028" required></label><label>Inicio<input id="new-season-start" type="date"></label><label>Fin<input id="new-season-end" type="date"></label><label>Estado<select id="new-season-status"><option value="PLANNED">Planificada</option><option value="INACTIVE">Inactiva</option><option value="CLOSED">Cerrada</option></select></label><label class="check-row"><input id="new-season-activate" type="checkbox"> Activar al guardar</label><div><button class="button secondary" type="button" id="cancel-season-edit" hidden>Cancelar</button> <button class="button primary" type="submit" id="save-season-button">Crear temporada</button></div></form><div id="season-message" class="message"></div><div id="season-division-config"></div>`;
    document.querySelectorAll('[data-activate-season]').forEach(b=>b.onclick=async()=>{try{const seasonId=b.dataset.activateSeason;await call('setActiveSeason',{seasonId});clubConfig=null;await loadClubConfig();await loadSeasonContext_(true);resetSeasonScopedUi_(seasonId);showToast_('Temporada activa actualizada.');await renderSeasons();}catch(err){showMessage(err.message,'error','season-message');}});
    document.querySelectorAll('[data-config-season]').forEach(b=>b.onclick=()=>renderSeasonDivisionConfig_(sd,b.dataset.configSeason));
    const seasonForm=document.getElementById('new-season-form');
    const resetSeasonForm=()=>{seasonForm.reset();document.getElementById('new-season-id').value='';document.getElementById('save-season-button').textContent='Crear temporada';document.getElementById('cancel-season-edit').hidden=true;};
    document.querySelectorAll('[data-edit-season]').forEach(b=>b.onclick=()=>{const x=list.find(s0=>s0.seasonId===b.dataset.editSeason);if(!x)return;document.getElementById('new-season-id').value=x.seasonId;document.getElementById('new-season-name').value=x.name||'';document.getElementById('new-season-start').value=x.startDate||'';document.getElementById('new-season-end').value=x.endDate||'';document.getElementById('new-season-status').value=x.status==='ACTIVE'?'INACTIVE':(x.status||'PLANNED');document.getElementById('new-season-activate').checked=x.seasonId===sd.activeSeasonId;document.getElementById('save-season-button').textContent='Guardar temporada';document.getElementById('cancel-season-edit').hidden=false;seasonForm.scrollIntoView({behavior:'smooth',block:'center'});});
    document.getElementById('cancel-season-edit').onclick=resetSeasonForm;
    seasonForm.onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{const seasonId=val('new-season-id'),activate=document.getElementById('new-season-activate').checked;const saved=(await call('saveSeason',{seasonId,name:val('new-season-name'),startDate:val('new-season-start'),endDate:val('new-season-end'),status:val('new-season-status'),activate})).data;await loadSeasonContext_(true);if(activate&&saved?.seasonId){clubConfig=null;await loadClubConfig();resetSeasonScopedUi_(saved.seasonId);}showToast_(seasonId?'Temporada actualizada.':'Temporada creada.');await renderSeasons();}catch(err){showMessage(err.message,'error','season-message');if(button)button.disabled=false;}};
  }catch(err){const host=document.getElementById('season-manager-content');if(host)host.innerHTML=`<div class="message error">${escapeHtml(err.message)}</div>`;}
}

async function renderClubSettings() {
  try {
    if (!clubConfig) await loadClubConfig();
  } catch (error) {
    return shell(`<section class="panel narrow"><h1>No se pudo cargar la configuración</h1><p>${escapeHtml(error.message)}</p></section>`, 'settings');
  }
  if (currentUser?.role !== 'ADMIN') return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>Solo un administrador puede modificar la configuración del club.</p></section>', 'settings');
  const s = clubConfig || {};
  const logoPreview = s.logoDataUrl ? `<img id="logo-preview" class="logo-preview" src="${escapeHtml(s.logoDataUrl)}" alt="Logo actual">` : `<div id="logo-preview" class="logo-placeholder">Sin logo</div>`;
  shell(`
    <section class="hero compact">
      <span class="eyebrow">Configuración</span>
      <h1>Identidad del club</h1>
      <p>Datos generales, identidad visual y contacto del club. La gestión de temporadas tiene ahora su propia sección.</p>
    </section>
    <div class="settings-layout">
      <form id="club-form" class="panel settings-main">
        <div class="section-heading"><h2>Datos principales</h2><p>Información visible dentro de la aplicación.</p></div>
        <div class="form-grid two">
          <label>Nombre oficial<input id="official-name" maxlength="120" required value="${escapeHtml(s.officialName || '')}"></label>
          <label>Nombre corto<input id="short-name" maxlength="40" required value="${escapeHtml(s.shortName || '')}"></label>
          <label>Correo de contacto<input id="contact-email" type="email" maxlength="254" value="${escapeHtml(s.contactEmail || '')}"></label>
          <label>Teléfono de contacto<input id="contact-phone" maxlength="40" value="${escapeHtml(s.contactPhone || '')}"></label>
        </div>
      </form>
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
      <div class="settings-actions"><div id="message" class="message" aria-live="polite"></div><button class="button primary" type="submit" form="club-form">Guardar configuración</button></div>
    </div>`, 'settings');

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
        logoDataUrl: selectedLogo?.dataUrl || '',
        logoOriginalName: selectedLogo?.file?.name || '',
        removeLogo
      };
      const { data } = await call('saveClubConfig', payload);
      clubConfig = data;
      applyClubTheme(clubConfig);
      showToast_('Configuración guardada correctamente.');
      await renderClubSettings();
    } catch (error) {
      showMessage(error.message, 'error');
      button.disabled = false;
    }
  };
}


async function loadStructureData() {
  const { data } = await call('getStructureData',{seasonId:selectedSeasonId_()});
  structureData = data;
  return data;
}

function structureTabs() {
  if(!currentAccessProfile_().capabilities?.browseStructure)return '';
  const tabs = [
    ['people', 'Personas'], ['roles', 'Cargos'], ['divisions', 'Divisiones y equipos'], ['assignments', 'Asignaciones']
  ];
  return `<div class="subnav">${tabs.map(([key, label]) => `<button type="button" class="subnav-link ${structureSection === key ? 'active' : ''}" data-structure-tab="${key}">${label}</button>`).join('')}</div>`;
}

function recommendedRoleCategories_(){return ['PLAYER','COACH','MANAGER','COORDINATOR','REFEREE','COLLABORATOR'];}
function roleCategoryLabel_(category){return ({PLAYER:'Jugador',COACH:'Entrenador',MANAGER:'Manager / Delegado',COORDINATOR:'Coordinador',REFEREE:'Árbitro',COLLABORATOR:'Colaborador'})[category]||category||'—';}
function normalizeEmailClient_(value){return String(value||'').trim().toLowerCase();}

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
  const canBrowse=!!currentAccessProfile_().capabilities?.browseStructure;
  structureSection = canBrowse?section:'people';
  if (!currentAccessProfile_().capabilities?.viewStructure) {
    return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>No tienes acceso a la estructura deportiva.</p></section>', 'structure');
  }
  try { await loadStructureData(); }
  catch (error) { return shell(`<section class="panel narrow"><h1>No se pudo cargar la estructura</h1><p>${escapeHtml(error.message)}</p></section>`, 'structure'); }

  let content = '';
  if (structureSection === 'people') content = renderPeopleSection();
  else if (structureSection === 'roles') content = renderRolesSection();
  else if (structureSection === 'divisions') content = renderDivisionsSection();
  else content = renderAssignmentsSection();

  shell(`
    <section class="hero compact">
      <span class="eyebrow">${canBrowse?'Estructura deportiva':'Perfil personal'}</span>
      <h1>${canBrowse?'Personas y organización':'Mi perfil'}</h1>
      <p>${canBrowse?'La vista usa la temporada elegida en la cabecera. Personas, cargos y divisiones son maestras; equipos, asignaciones, calendario y estadísticas se gestionan por temporada.':'Actualizá tus datos personales, consultá tus cargos y gestioná tu documentación. Si sos tutor, también verás a tus menores vinculados.'}</p>
    </section>
    ${structureTabs()}
    ${content}
    <div id="structure-message" class="message" aria-live="polite"></div>`, 'structure');

  document.querySelectorAll('[data-structure-tab]').forEach(button => {
    button.onclick = () => renderStructure(button.dataset.structureTab);
  });
  wireStructureSection();
}

function structureCanManage_(){return !!structureData?.canManage;}

function renderPeopleSection() {
  const people = structureData?.persons || [];
  const state=loadUiState_().peopleFilters||{};
  const query=textNorm_(state.q||''), status=state.status||'', divisionId=state.divisionId||'';
  const personDivs={};(structureData.assignments||[]).forEach(a=>{if(a.status==='ACTIVE'&&a.divisionId)(personDivs[a.personId]||(personDivs[a.personId]=new Set())).add(a.divisionId);});
  const filtered=people.filter(p=>(!query||textNorm_([p.displayName,p.email,p.phone].join(' ')).includes(query))&&(!status||p.status===status)&&(!divisionId||(personDivs[p.personId]&&personDivs[p.personId].has(divisionId))));
  const roleById=Object.fromEntries((structureData.roles||[]).map(r=>[r.roleId,r]));
  const linkedByPerson=Object.fromEntries((structureData.userAccess||[]).filter(u=>u.personId).map(u=>[u.personId,u]));
  const unlinkedByEmail=Object.fromEntries((structureData.userAccess||[]).filter(u=>!u.personId&&u.email).map(u=>[normalizeEmailClient_(u.email),u]));
  const rows = filtered.map(person => {
    const assignments=(structureData.assignments||[]).filter(a=>a.personId===person.personId&&a.status==='ACTIVE');
    const rnames=assignments.map(a=>roleById[a.roleId]?.name).filter(Boolean);
    const u=linkedByPerson[person.personId],candidate=person.email?unlinkedByEmail[normalizeEmailClient_(person.email)]:null;
    const access=u?statusBadge(u.status):(candidate?'<span class="badge pending">Cuenta por vincular</span>':'<span class="badge inactive">Sin acceso</span>');
    const action=structureCanManage_()?(u?`<button class="button mini secondary" data-open-person="${escapeHtml(person.personId)}" data-person-tab="access">Gestionar acceso</button>`:(candidate?`<button class="button mini primary" data-link-access="${escapeHtml(person.personId)}" data-user-id="${escapeHtml(candidate.userId)}">Vincular acceso</button>`:(person.email?`<button class="button mini primary" data-create-access="${escapeHtml(person.personId)}">Crear acceso</button>`:''))):'';
    return `<tr><td><button class="person-link" data-open-person="${escapeHtml(person.personId)}"><strong>${escapeHtml(person.displayName)}</strong><small>${escapeHtml(person.email || 'Sin correo')}</small></button></td><td>${escapeHtml([...new Set(rnames)].join(' · ')||'Sin cargos')}</td><td>${escapeHtml(person.phone || '—')}</td><td>${access}</td><td>${statusBadge(person.status)}</td><td><button class="button mini secondary" data-open-person="${escapeHtml(person.personId)}">Abrir ficha</button>${action}</td></tr>`;
  }).join('');
  const divisions=(structureData?.divisions||[]).filter(x=>x.status==='ACTIVE');
  return `<section class="panel management-panel">
    <div class="panel-heading"><div><h2>${currentAccessProfile_().capabilities?.browseStructure?'Personas':'Mi perfil y vinculados'}</h2><p>La persona es el registro central: datos, club, familia, documentación y acceso se gestionan desde su ficha.</p></div>${structureCanManage_()?'<button class="button primary" id="new-person">Nueva persona</button>':''}</div>
    <div class="filter-bar"><label class="filter-grow">Buscar<input id="people-filter-q" placeholder="Nombre, correo o teléfono" value="${escapeHtml(state.q||'')}"></label><label>División<select id="people-filter-division"><option value="">Todas</option>${divisions.map(d=>`<option value="${escapeHtml(d.divisionId)}" ${d.divisionId===divisionId?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}</select></label><label>Estado<select id="people-filter-status"><option value="">Todos</option><option value="ACTIVE" ${status==='ACTIVE'?'selected':''}>Activos</option><option value="INACTIVE" ${status==='INACTIVE'?'selected':''}>Inactivos</option><option value="ARCHIVED" ${status==='ARCHIVED'?'selected':''}>Archivados</option></select></label><button class="button secondary filter-clear" id="people-filter-clear">Limpiar</button></div>
    <p class="filter-count">${filtered.length} de ${people.length} personas</p>
    ${filtered.length ? `<div class="table-wrap"><table><thead><tr><th>Persona</th><th>Cargos</th><th>Teléfono</th><th>Acceso</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyTable('No hay personas que coincidan con los filtros.')}
    <div id="editor-host"></div>
  </section>`;
}

function renderRolesSection() {
  const allRoles = structureData?.roles || [];
  const categories=new Set(recommendedRoleCategories_());
  const roles=allRoles.filter(r=>categories.has(r.category));
  const rows = roles.map(role => `<tr><td><strong>${escapeHtml(role.name)}</strong><small>${escapeHtml(role.description || '')}</small></td><td>${escapeHtml(roleCategoryLabel_(role.category))}</td><td>${escapeHtml(role.scopeType==='DIVISION'?'División':role.scopeType==='TRANSVERSAL'?'Transversal':'Flexible')}</td><td>${statusBadge(role.status)}</td><td>${structureCanManage_()?`<button class="button mini secondary" data-edit-role="${escapeHtml(role.roleId)}">Editar</button>`:''}</td></tr>`).join('');
  return `<section class="panel management-panel"><div class="panel-heading"><div><h2>Cargos</h2><p>Catálogo simplificado de funciones del club. Administrador del sistema no es un cargo: se gestiona en Usuarios.</p></div>${structureCanManage_()?'<button class="button primary" id="new-role">Nuevo cargo</button>':''}</div><div class="info-strip"><strong>Categorías recomendadas:</strong> Jugador · Entrenador · Manager/Delegado · Coordinador · Árbitro · Colaborador.</div>${roles.length ? `<div class="table-wrap"><table><thead><tr><th>Cargo</th><th>Categoría</th><th>Alcance</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyTable('Todavía no hay cargos configurados.')}<div id="editor-host"></div></section>`;
}

function renderDivisionsSection() {
  const divisions = structureData?.divisions || [], teams=structureData?.teams||[], plans=structureData?.trainingPlans||[];
  const rows = divisions.map(item => {
    const own=teams.filter(t=>t.divisionId===item.divisionId);
    const ownPlans=plans.filter(p=>p.divisionId===item.divisionId&&p.status==='ACTIVE');
    const teamHtml=own.length?own.map(t=>`<span class="badge active">${escapeHtml(t.name)}</span>${structureCanManage_()?` <button class="button mini secondary" data-edit-team="${escapeHtml(t.teamId)}">Editar</button>`:''}`).join('<br>'):'<span class="muted">Sin equipos creados</span>';
    return `<tr><td><strong><span class="division-color-dot" style="--division-color:${escapeHtml(item.color||'#2563EB')}"></span>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.code || '')}</small></td><td>${teamHtml}${structureCanManage_()?`<div style="margin-top:.45rem"><button class="button mini primary" data-new-team-division="${escapeHtml(item.divisionId)}">+ Equipo</button></div>`:''}</td><td>${statusBadge(item.status)}${ownPlans.length?`<small>${ownPlans.length} plan(es) de entrenamiento activo(s)</small>`:''}</td><td><div class="button-row"><button class="button mini secondary" data-training-plans="${escapeHtml(item.divisionId)}">Entrenamientos</button>${structureCanManage_()?`<button class="button mini secondary" data-edit-division="${escapeHtml(item.divisionId)}">Editar división</button>`:''}</div></td></tr>`;
  }).join('');
  return `<section class="panel management-panel"><div class="panel-heading"><div><h2>Divisiones y equipos</h2><p>La división es maestra y estable. Los equipos A/B y los planes de entrenamiento pertenecen a la temporada seleccionada.</p></div>${structureCanManage_()?'<button class="button primary" id="new-division">Nueva división</button>':''}</div>${divisions.length ? `<div class="table-wrap"><table><thead><tr><th>División</th><th>Equipos</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyTable('Todavía no hay divisiones activas para la temporada seleccionada.')}<div id="editor-host"></div></section>`;
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
  const state=loadUiState_().assignmentFilters||{},q=textNorm_(state.q||''),roleId=state.roleId||'',divisionId=state.divisionId||'',status=state.status||'';
  const filtered=(data.assignments||[]).filter(a=>{const p=people[a.personId]||{},r=roles[a.roleId]||{};return (!q||textNorm_([p.displayName,r.name].join(' ')).includes(q))&&(!roleId||a.roleId===roleId)&&(!divisionId||(divisionId==='TRANSVERSAL'?!a.divisionId:a.divisionId===divisionId))&&(!status||a.status===status);});
  const rows = filtered.map(item => `<tr><td><strong>${escapeHtml(people[item.personId]?.displayName || '—')}</strong><small>${escapeHtml(roles[item.roleId]?.name || '—')}</small></td><td>${escapeHtml(divisions[item.divisionId]?.name || 'Transversal')}</td><td>${item.startDate||item.endDate?`${escapeHtml(item.startDate || '—')}${item.endDate ? ' → ' + escapeHtml(item.endDate) : ''}`:'<span class="muted">Toda la temporada</span>'}</td><td>${statusBadge(item.status)}</td><td><button class="button mini secondary" data-edit-assignment="${escapeHtml(item.assignmentId)}">Editar</button></td></tr>`).join('');
  const activeRoles=(data.roles||[]).filter(r=>r.status==='ACTIVE'&&recommendedRoleCategories_().includes(r.category));
  const activeDivisions=(data.divisions||[]).filter(d=>d.status==='ACTIVE');
  const seasons=(data.seasons||[]).filter(x=>x.seasonId!==data.selectedSeasonId).sort((a,b)=>String(b.startDate||'').localeCompare(String(a.startDate||'')));
  return `<section class="panel management-panel"><div class="panel-heading"><div><h2>Asignaciones</h2><p>Persona + cargo + división + temporada. El alcance del cargo evita combinaciones incoherentes y se controlan duplicados.</p></div><div class="button-row"><button class="button secondary" id="copy-assignments" ${seasons.length?'':'disabled'}>Copiar temporada anterior</button>${structureCanManage_()?'<button class="button primary" id="new-assignment">Nuevas asignaciones</button>':''}</div></div><div class="filter-bar"><label class="filter-grow">Buscar<input id="assignment-filter-q" value="${escapeHtml(state.q||'')}" placeholder="Persona o cargo"></label><label>Cargo<select id="assignment-filter-role"><option value="">Todos</option>${activeRoles.map(r=>`<option value="${escapeHtml(r.roleId)}" ${roleId===r.roleId?'selected':''}>${escapeHtml(r.name)}</option>`).join('')}</select></label><label>División<select id="assignment-filter-division"><option value="">Todas</option><option value="TRANSVERSAL" ${divisionId==='TRANSVERSAL'?'selected':''}>Transversal</option>${activeDivisions.map(d=>`<option value="${escapeHtml(d.divisionId)}" ${divisionId===d.divisionId?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}</select></label><label>Estado<select id="assignment-filter-status"><option value="">Todos</option><option value="ACTIVE" ${status==='ACTIVE'?'selected':''}>Activas</option><option value="ENDED" ${status==='ENDED'?'selected':''}>Finalizadas</option></select></label><button class="button secondary filter-clear" id="assignment-filter-clear">Limpiar</button></div><p class="filter-count">${filtered.length} de ${(data.assignments||[]).length} asignaciones</p>${rows ? `<div class="table-wrap"><table><thead><tr><th>Persona / cargo</th><th>División</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyTable('No hay asignaciones que coincidan con los filtros.')}<div id="editor-host"></div></section>`;
}

function renderGuardiansSection() {
  const people=familyData?.persons||[], rels=familyData?.relations||[], byId=Object.fromEntries(people.map(p=>[p.personId,p]));
  const state=loadUiState_().guardianFilters||{}, q=textNorm_(state.q||''), status=state.status||'', docs=state.docs||'';
  const filtered=rels.filter(r=>{const c=byId[r.childPersonId]||{},g=byId[r.guardianPersonId]||{};return (!q||textNorm_([c.displayName,g.displayName,g.email,g.phone,r.relationshipType].join(' ')).includes(q))&&(!status||r.status===status)&&(!docs||(docs==='YES'?(r.canManageDocuments==='TRUE'):(r.canManageDocuments!=='TRUE')));});
  const rows=filtered.map(r=>{const c=byId[r.childPersonId]||{},g=byId[r.guardianPersonId]||{};return `<tr><td><strong>${escapeHtml(c.displayName||'—')}</strong><small>${escapeHtml(c.birthDate||'Sin fecha de nacimiento')}</small></td><td><strong>${escapeHtml(g.displayName||'—')}</strong><small>${escapeHtml([g.email,g.phone].filter(Boolean).join(' · ')||'Sin contacto')}</small></td><td>${escapeHtml(r.relationshipType||'—')}</td><td>${statusBadge(r.status)}</td><td>${r.canManageDocuments==='TRUE'?'Sí':'No'}</td><td>${escapeHtml(r.verifiedAt||'—')}</td></tr>`;}).join('');
  return `<section class="panel management-panel"><div class="panel-heading"><div><h2>Tutores y menores</h2><p>Relaciones familiares y permisos documentales dentro de la estructura del club.</p></div></div><div class="filter-bar"><label class="filter-grow">Buscar<input id="guardian-filter-q" value="${escapeHtml(state.q||'')}" placeholder="Menor, tutor, correo, teléfono"></label><label>Estado<select id="guardian-filter-status"><option value="">Todos</option>${['ACTIVE','INACTIVE','REVOKED'].map(x=>`<option value="${x}" ${status===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Documentos<select id="guardian-filter-docs"><option value="">Todos</option><option value="YES" ${docs==='YES'?'selected':''}>Puede gestionar</option><option value="NO" ${docs==='NO'?'selected':''}>No puede</option></select></label><button class="button secondary filter-clear" id="guardian-filter-clear">Limpiar</button></div><p class="filter-count">${filtered.length} de ${rels.length} relaciones</p>${rows?`<div class="table-wrap"><table><thead><tr><th>Menor</th><th>Tutor</th><th>Relación</th><th>Estado</th><th>Docs</th><th>Verificado</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay relaciones que coincidan con los filtros.')}<div class="section-divider"></div><form id="guardian-structure-form" class="form-grid two"><label>Menor<select id="guardian-child" required>${optionList(people,'personId',p=>p.displayName,'',false)}</select></label><label>Tutor<select id="guardian-adult" required>${optionList(people,'personId',p=>p.displayName,'',false)}</select></label><label>Tipo de relación<input id="guardian-type" value="PADRE/MADRE" maxlength="50"></label><label>Estado<select id="guardian-status"><option>ACTIVE</option><option>INACTIVE</option><option>REVOKED</option></select></label><label class="check-row"><input id="guardian-docs" type="checkbox" checked> Puede gestionar documentación</label><label>Notas<input id="guardian-notes" maxlength="500"></label><div><button class="button primary" type="submit">Guardar relación</button></div></form></section>`;
}


function trainingScheduleClient_(plan){try{return JSON.parse(plan?.scheduleJson||'[]')||[];}catch(_){return [];}}
function trainingDayLabel_(weekday){return ({1:'Lunes',2:'Martes',3:'Miércoles',4:'Jueves',5:'Viernes',6:'Sábado',7:'Domingo'})[Number(weekday)]||String(weekday||'');}
function trainingScheduleSummary_(plan){const rows=trainingScheduleClient_(plan);return rows.length?rows.map(x=>`${trainingDayLabel_(x.weekday)} ${x.startTime}–${x.endTime}`).join(' · '):'Sin horarios';}
function showTrainingPlansEditor_(divisionId,editPlanId=''){
  const host=document.getElementById('editor-host');if(!host)return;
  const division=(structureData?.divisions||[]).find(x=>x.divisionId===divisionId);if(!division)return;
  const plans=(structureData?.trainingPlans||[]).filter(x=>x.divisionId===divisionId).sort((a,b)=>String(b.startDate||'').localeCompare(String(a.startDate||'')));
  const plan=plans.find(x=>x.trainingPlanId===editPlanId)||{};
  const teams=(structureData?.teams||[]).filter(x=>x.divisionId===divisionId&&x.status==='ACTIVE');
  const season=(structureData?.seasons||[]).find(x=>x.seasonId===(structureData.selectedSeasonId||selectedSeasonId_()))||{};
  const schedule=trainingScheduleClient_(plan),byDay={};schedule.forEach(x=>{if(!byDay[x.weekday])byDay[x.weekday]=x;});
  const list=plans.length?`<div class="table-wrap"><table><thead><tr><th>Plan</th><th>Vigencia</th><th>Horarios</th><th>Estado</th><th></th></tr></thead><tbody>${plans.map(x=>`<tr><td><strong>${escapeHtml(x.name||'Entrenamiento')}</strong><small>${escapeHtml((teams.find(t=>t.teamId===x.teamId)||{}).name||'Toda la división')}${x.location?' · '+escapeHtml(x.location):''}</small></td><td>${escapeHtml(x.startDate||'—')} → ${escapeHtml(x.endDate||'—')}</td><td><small>${escapeHtml(trainingScheduleSummary_(x))}</small></td><td>${statusBadge(x.status)}</td><td><div class="button-row"><button type="button" class="button mini secondary" data-edit-training-plan="${escapeHtml(x.trainingPlanId)}">Editar</button><button type="button" class="button mini secondary" data-generate-training-plan="${escapeHtml(x.trainingPlanId)}">Regenerar</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state">Todavía no hay planes de entrenamiento para esta división.</div>';
  const dayRows=[1,2,3,4,5,6,7].map(day=>{const row=byDay[day]||{};return `<div class="training-day-row"><label class="check-row"><input type="checkbox" data-training-day="${day}" ${row.weekday?'checked':''}> ${trainingDayLabel_(day)}</label><label>Desde<input type="time" data-training-start="${day}" value="${escapeHtml(row.startTime||'')}"></label><label>Hasta<input type="time" data-training-end="${day}" value="${escapeHtml(row.endTime||'')}"></label></div>`;}).join('');
  host.innerHTML=`<section class="inline-editor"><div class="editor-heading"><div><span class="eyebrow">${escapeHtml(division.name)}</span><h3>Planificación de entrenamientos</h3><p>Definí periodos con días y horarios. Al guardar se crean o actualizan los entrenamientos futuros; los cancelados, postergados o editados manualmente no se pisan.</p></div><button type="button" class="button link" id="close-editor">Cerrar</button></div>${list}<div class="section-divider"></div><form id="training-plan-form" class="form-stack"><div class="section-heading"><h3>${plan.trainingPlanId?'Editar plan':'Nuevo plan'}</h3><p>Podés crear un plan de pretemporada y otro de temporada con rangos diferentes.</p></div><div class="form-grid three"><label>Nombre<input id="training-plan-name" maxlength="120" value="${escapeHtml(plan.name||'Entrenamiento')}" required></label><label>Equipo<select id="training-plan-team"><option value="">Toda la división</option>${teams.map(t=>`<option value="${escapeHtml(t.teamId)}" ${plan.teamId===t.teamId?'selected':''}>${escapeHtml(t.name)}</option>`).join('')}</select></label><label>Estado<select id="training-plan-status"><option value="ACTIVE" ${plan.status!=='INACTIVE'?'selected':''}>Activo</option><option value="INACTIVE" ${plan.status==='INACTIVE'?'selected':''}>Inactivo</option></select></label><label>Desde<input id="training-plan-start" type="date" value="${escapeHtml(plan.startDate||season.startDate||'')}" required></label><label>Hasta<input id="training-plan-end" type="date" value="${escapeHtml(plan.endDate||season.endDate||'')}" required></label><label>Ubicación<input id="training-plan-location" maxlength="180" value="${escapeHtml(plan.location||'')}"></label></div><div class="section-heading"><h3>Días y horarios semanales</h3><p>Marcá los días que correspondan y completá horario de inicio y fin.</p></div><div class="training-days-grid">${dayRows}</div><div class="editor-actions"><div id="training-plan-message" class="message"></div><button type="submit" class="button primary">Guardar y generar actividades</button></div></form></section>`;
  host.scrollIntoView({behavior:'smooth',block:'start'});
  document.getElementById('close-editor').onclick=()=>host.innerHTML='';
  document.querySelectorAll('[data-edit-training-plan]').forEach(b=>b.onclick=()=>showTrainingPlansEditor_(divisionId,b.dataset.editTrainingPlan));
  document.querySelectorAll('[data-generate-training-plan]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=(await call('generateTrainingPlanEvents',{trainingPlanId:b.dataset.generateTrainingPlan})).data;showToast_(`Entrenamientos: ${r.created||0} creados · ${r.updated||0} actualizados · ${r.protected||0} protegidos · ${r.removed||0} retirados.`,'success',6500);await loadStructureData();showTrainingPlansEditor_(divisionId,b.dataset.generateTrainingPlan);}catch(err){showMessage(err.message,'error','training-plan-message');b.disabled=false;}});
  document.getElementById('training-plan-form').onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;const schedule=[];document.querySelectorAll('[data-training-day]').forEach(ch=>{if(ch.checked){const day=Number(ch.dataset.trainingDay),start=document.querySelector(`[data-training-start="${day}"]`).value,end=document.querySelector(`[data-training-end="${day}"]`).value;schedule.push({weekday:day,startTime:start,endTime:end});}});try{showMessage('Guardando plan y generando entrenamientos…','info','training-plan-message');const res=(await call('saveTrainingPlan',{trainingPlanId:plan.trainingPlanId||'',seasonId:structureData.selectedSeasonId||selectedSeasonId_(),divisionId:divisionId,teamId:val('training-plan-team'),name:val('training-plan-name'),startDate:val('training-plan-start'),endDate:val('training-plan-end'),location:val('training-plan-location'),status:val('training-plan-status'),schedule:schedule,generate:true})).data;const g=res.generation||{};showToast_(`Plan guardado · ${g.created||0} entrenamientos creados · ${g.updated||0} actualizados · ${g.protected||0} protegidos.`,'success',6500);await loadStructureData();showTrainingPlansEditor_(divisionId,res.plan?.trainingPlanId||'');}catch(err){showMessage(err.message,'error','training-plan-message');if(button)button.disabled=false;}};
}

function wireStructureSection() {
  const bind = (selector, handler) => document.querySelectorAll(selector).forEach(button => button.onclick = () => handler(button.dataset));
  document.getElementById('new-person')?.addEventListener('click', () => showPersonEditor());
  document.getElementById('new-role')?.addEventListener('click', () => showRoleEditor());
  document.getElementById('new-division')?.addEventListener('click', () => showDivisionEditor());
  document.getElementById('new-assignment')?.addEventListener('click', () => showMultiAssignmentEditor_());
  bind('[data-create-access]', data => renderUsers(data.createAccess));
  bind('[data-open-person]', data => openPersonProfile_(data.openPerson,data.personTab||'club'));
  bind('[data-link-access]', async data => {
    if(!confirm('Se vinculará la cuenta existente con esta Persona. No se modificará la contraseña. ¿Continuar?'))return;
    try{
      await call('linkUserToPerson',{personId:data.linkAccess,userId:data.userId});
      const linkedUser=(structureData?.userAccess||[]).find(u=>u.userId===data.userId);
      if(normalizeEmailClient_(currentUser?.email)===normalizeEmailClient_(linkedUser?.email||'')) currentUser.personId=data.linkAccess;
      showToast_('Cuenta vinculada a la Persona.');
      await loadStructureData(); await renderStructure('people');
    }catch(err){showMessage(err.message,'error','structure-message');}
  });
  bind('[data-edit-person]', data => showPersonEditor((structureData.persons || []).find(x => x.personId === data.editPerson)));
  bind('[data-edit-role]', data => showRoleEditor((structureData.roles || []).find(x => x.roleId === data.editRole)));
  bind('[data-edit-division]', data => showDivisionEditor((structureData.divisions || []).find(x => x.divisionId === data.editDivision)));
  bind('[data-edit-team]', data => showTeamEditor((structureData.teams || []).find(x => x.teamId === data.editTeam)));
  bind('[data-new-team-division]', data => showTeamEditor({divisionId:data.newTeamDivision,status:'ACTIVE'}));
  bind('[data-training-plans]', data => showTrainingPlansEditor_(data.trainingPlans));
  bind('[data-edit-assignment]', data => showAssignmentEditor((structureData.assignments || []).find(x => x.assignmentId === data.editAssignment)));
  if(structureSection==='people'){
    const apply=()=>{saveUiStatePatch_({peopleFilters:{q:val('people-filter-q'),divisionId:val('people-filter-division'),status:val('people-filter-status')}});renderStructure('people');};
    document.getElementById('people-filter-q')?.addEventListener('change',apply);
    document.getElementById('people-filter-q')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply();}});
    document.getElementById('people-filter-division')?.addEventListener('change',apply);
    document.getElementById('people-filter-status')?.addEventListener('change',apply);
    document.getElementById('people-filter-clear')?.addEventListener('click',()=>{saveUiStatePatch_({peopleFilters:{}});renderStructure('people');});
  }
  if(structureSection==='assignments'){
    const applyAssignments=()=>{saveUiStatePatch_({assignmentFilters:{q:val('assignment-filter-q'),roleId:val('assignment-filter-role'),divisionId:val('assignment-filter-division'),status:val('assignment-filter-status')}});renderStructure('assignments');};
    ['assignment-filter-role','assignment-filter-division','assignment-filter-status'].forEach(id=>document.getElementById(id)?.addEventListener('change',applyAssignments));
    document.getElementById('assignment-filter-q')?.addEventListener('change',applyAssignments);
    document.getElementById('assignment-filter-q')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyAssignments();}});
    document.getElementById('assignment-filter-clear')?.addEventListener('click',()=>{saveUiStatePatch_({assignmentFilters:{}});renderStructure('assignments');});
    document.getElementById('copy-assignments')?.addEventListener('click',async()=>{
      const target=structureData.selectedSeasonId||selectedSeasonId_();
      const seasons=(structureData.seasons||[]).filter(x=>x.seasonId!==target).sort((a,b)=>String(b.startDate||'').localeCompare(String(a.startDate||'')));
      if(!seasons.length)return;
      const suggested=seasons[0];
      if(!confirm(`Copiar asignaciones activas de ${suggested.name} a la temporada seleccionada? Las existentes no se duplicarán.`))return;
      try{const res=(await call('copyAssignmentsFromSeason',{sourceSeasonId:suggested.seasonId,targetSeasonId:target})).data;showToast_(`${res.created} asignaciones copiadas · ${res.skipped} omitidas.`);await renderStructure('assignments');}catch(err){showMessage(err.message,'error','structure-message');}
    });
  }
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

function isMinorClient_(birthDate){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate||'')))return false;
  const b=new Date(String(birthDate)+'T12:00:00'),today=new Date();let age=today.getFullYear()-b.getFullYear();if((today.getMonth()<b.getMonth())||(today.getMonth()===b.getMonth()&&today.getDate()<b.getDate()))age--;return age<18;
}

function availabilityPeriodTypeLabelClient_(type){return ({SPORTS_LEAVE:'Baja deportiva',VACATION:'Vacaciones',STUDIES:'Estudios',WORK:'Trabajo',TRAVEL:'Viaje',SUSPENSION:'Sanción deportiva',PERSONAL:'Motivo personal',OTHER:'Otra ausencia'})[type]||'Ausencia';}
function trainingModeLabelClient_(mode){return ({NORMAL:'Normal',ADAPTED:'Entrenamiento adaptado',REHAB:'Rehabilitación / recuperación',UNAVAILABLE:'No participa'})[mode]||mode||'—';}
function availabilityEffectLabel_(effect,eventType){
  if(!effect||effect.state==='NORMAL')return '<span class="status-pill success">Sin restricciones</span>';
  if(effect.state==='ADAPTED')return '<span class="status-pill warning">Entrenamiento adaptado</span>';
  if(effect.state==='REHAB')return '<span class="status-pill warning">Rehabilitación</span>';
  return `<span class="status-pill danger">${eventType==='MATCH'?'No seleccionable':'No participa'}</span>`;
}
function availabilityPeriodSummaryClient_(p){
  const range=`${p.startDate||'—'} → ${p.endDate||'Sin fecha fin'}`,impact=[];
  if(String(p.affectsMatches).toUpperCase()==='TRUE')impact.push(String(p.matchSelectable).toUpperCase()==='TRUE'?'Partidos: seleccionable':'Partidos: no seleccionable');
  if(String(p.affectsTraining).toUpperCase()==='TRUE')impact.push('Entrenos: '+trainingModeLabelClient_(p.trainingMode));
  return `${range}${impact.length?' · '+impact.join(' · '):''}`;
}
function showAvailabilityPeriodEditor_(person,{eventId='',period=null,onDone=null,onCancel=null}={}){
  const host=document.getElementById('editor-host');if(!host||!person)return;
  const p=period||{},isEdit=!!p.availabilityPeriodId;
  const today=new Date().toISOString().slice(0,10),sourceEvent=(calendarData?.events||[]).find(x=>x.eventId===eventId),defaultStart=p.startDate||(sourceEvent?.eventDate||today),defaultType=p.periodType||'SPORTS_LEAVE';
  host.innerHTML=`<section class="inline-editor"><div class="editor-heading"><div><span class="eyebrow">Disponibilidad deportiva</span><h3>${isEdit?'Editar':'Nueva'} baja / ausencia · ${escapeHtml(person.displayName||'')}</h3><p>No hace falta registrar un diagnóstico médico. Indicá solo el período y cómo afecta a entrenamientos y partidos.</p></div><button type="button" class="button link" id="close-editor">Cerrar</button></div><form id="availability-period-form" class="form-stack"><div class="form-grid two"><label>Tipo<select id="avp-type">${[['SPORTS_LEAVE','Baja deportiva'],['VACATION','Vacaciones'],['STUDIES','Estudios'],['WORK','Trabajo'],['TRAVEL','Viaje'],['SUSPENSION','Sanción deportiva'],['PERSONAL','Motivo personal'],['OTHER','Otra ausencia']].map(([v,l])=>`<option value="${v}" ${(defaultType===v)?'selected':''}>${l}</option>`).join('')}</select></label><label>Motivo breve<input id="avp-reason" maxlength="120" value="${escapeHtml(p.reason||'')}" placeholder="Opcional"></label><label>Desde<input id="avp-start" type="date" required value="${escapeHtml(defaultStart)}"></label><label>Hasta<input id="avp-end" type="date" value="${escapeHtml(p.endDate||'')}"></label></div><div class="form-grid two"><label class="check-row"><input id="avp-training" type="checkbox" ${String(p.affectsTraining||'TRUE').toUpperCase()!=='FALSE'?'checked':''}> Afecta entrenamientos</label><label>En entrenamientos<select id="avp-training-mode"><option value="ADAPTED" ${(p.trainingMode||'ADAPTED')==='ADAPTED'?'selected':''}>Entrenamiento adaptado</option><option value="REHAB" ${p.trainingMode==='REHAB'?'selected':''}>Rehabilitación / recuperación</option><option value="UNAVAILABLE" ${p.trainingMode==='UNAVAILABLE'?'selected':''}>No participa</option><option value="NORMAL" ${p.trainingMode==='NORMAL'?'selected':''}>Normal</option></select></label><label class="check-row"><input id="avp-matches" type="checkbox" ${String(p.affectsMatches||'TRUE').toUpperCase()!=='FALSE'?'checked':''}> Afecta partidos</label><label class="check-row"><input id="avp-match-selectable" type="checkbox" ${String(p.matchSelectable).toUpperCase()==='TRUE'?'checked':''}> Puede ser seleccionado para partidos</label></div><label>Notas internas<textarea id="avp-notes" maxlength="500" rows="3">${escapeHtml(p.notes||'')}</textarea></label><div class="editor-actions"><div id="editor-message" class="message"></div><button class="button primary" type="submit">Guardar</button></div></form></section>`;
  document.getElementById('close-editor').onclick=()=>{if(onCancel)onCancel();else host.innerHTML='';};
  const syncDefaults=()=>{const type=val('avp-type'),mode=document.getElementById('avp-training-mode'),sel=document.getElementById('avp-match-selectable');if(!isEdit){if(type==='SPORTS_LEAVE'){mode.value='ADAPTED';sel.checked=false;}else if(type==='SUSPENSION'){mode.value='NORMAL';sel.checked=false;}else{mode.value='UNAVAILABLE';sel.checked=false;}}};
  document.getElementById('avp-type').onchange=syncDefaults;
  document.getElementById('availability-period-form').onsubmit=async ev=>{ev.preventDefault();const btn=ev.submitter;if(btn)btn.disabled=true;try{await call('saveAvailabilityPeriod',{availabilityPeriodId:p.availabilityPeriodId||'',personId:person.personId,periodType:val('avp-type'),startDate:val('avp-start'),endDate:val('avp-end'),affectsTraining:document.getElementById('avp-training').checked,affectsMatches:document.getElementById('avp-matches').checked,trainingMode:val('avp-training-mode'),matchSelectable:document.getElementById('avp-match-selectable').checked,reason:val('avp-reason'),notes:val('avp-notes'),sourceEventId:eventId,seasonId:selectedSeasonId_()});showToast_('Disponibilidad actualizada.');if(onDone)await onDone();}catch(err){showMessage(err.message,'error','editor-message');if(btn)btn.disabled=false;}};
  host.scrollIntoView({behavior:'smooth',block:'start'});
}

async function openPersonProfile_(personId,tab='club'){
  const host=document.getElementById('editor-host'),person=(structureData?.persons||[]).find(x=>x.personId===personId);if(!host||!person)return;
  host.innerHTML='<section class="inline-editor"><p>Cargando ficha de la persona…</p></section>';host.scrollIntoView({behavior:'smooth',block:'start'});
  try{
    const [familyResponse,documentsResponse,availabilityResponse]=await Promise.all([call('getFamilyData'),call('getDocumentsData'),call('getPersonAvailabilityData',{personId,seasonId:selectedSeasonId_()})]);
    renderPersonProfile_({person,family:familyResponse.data||{},documents:documentsResponse.data||{},availability:availabilityResponse.data||{}},tab);
  }catch(err){host.innerHTML=`<section class="inline-editor"><div class="editor-heading"><h3>${escapeHtml(person.displayName)}</h3><button class="button link" id="close-person-profile">Cerrar</button></div><div class="message error">${escapeHtml(err.message)}</div></section>`;document.getElementById('close-person-profile').onclick=()=>host.innerHTML='';}
}

function renderPersonProfile_(profile,tab){
  const host=document.getElementById('editor-host'),person=profile.person;if(!host)return;
  const canManageStructure=structureCanManage_(),isSelf=currentUser?.personId===person.personId;
  const tabs=[['data','Datos'],['club','Club'],['availability','Disponibilidad'],...(canManageStructure||isSelf?[['family','Familia']]:[]),['documents','Documentos'],...(canManageStructure||isSelf?[['access','Acceso']]:[])];
  const roles=Object.fromEntries((structureData.roles||[]).map(x=>[x.roleId,x])),divisions=Object.fromEntries((structureData.divisions||[]).map(x=>[x.divisionId,x]));
  let body='';
  if(tab==='data'){
    body=`<div class="profile-grid"><div><span>Nombre</span><strong>${escapeHtml(person.displayName)}</strong></div><div><span>Correo</span><strong>${escapeHtml(person.email||'—')}</strong></div><div><span>Teléfono</span><strong>${escapeHtml(person.phone||'—')}</strong></div><div><span>Nacimiento</span><strong>${escapeHtml(person.birthDate||'—')}</strong></div><div><span>Estado</span>${statusBadge(person.status)}</div></div>${canManageStructure||isSelf?'<div class="editor-actions"><button class="button secondary" id="profile-edit-person">Editar datos</button></div>':''}`;
  }else if(tab==='club'){
    const assignments=(structureData.assignments||[]).filter(a=>a.personId===person.personId);
    body=assignments.length?`<div class="table-wrap"><table><thead><tr><th>Cargo</th><th>División</th><th>Estado</th><th></th></tr></thead><tbody>${assignments.map(a=>`<tr><td>${escapeHtml(roles[a.roleId]?.name||'—')}</td><td>${escapeHtml(divisions[a.divisionId]?.name||'Transversal')}</td><td>${statusBadge(a.status)}</td><td>${canManageStructure?`<button class="button mini secondary" data-profile-edit-assignment="${escapeHtml(a.assignmentId)}">Editar</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:emptyTable('No tiene asignaciones en esta temporada.');
    if(canManageStructure)body+=`<div class="editor-actions"><button class="button primary" id="profile-new-assignment">Añadir asignaciones</button></div>`;
  }else if(tab==='availability'){
    const av=profile.availability||{},periods=av.periods||[],active=av.activePeriods||[];
    const activeHtml=active.length?`<div class="availability-current">${active.map(p=>`<article class="availability-period-card active"><div><span class="eyebrow">Estado actual</span><h3>${escapeHtml(availabilityPeriodTypeLabelClient_(p.periodType))}</h3><p>${escapeHtml(availabilityPeriodSummaryClient_(p))}</p>${p.reason?`<small>${escapeHtml(p.reason)}</small>`:''}</div></article>`).join('')}</div>`:'<div class="info-strip"><strong>Disponible.</strong> No hay bajas o ausencias activas para hoy.</div>';
    const rows=periods.map(p=>`<tr><td><strong>${escapeHtml(availabilityPeriodTypeLabelClient_(p.periodType))}</strong>${p.reason?`<small>${escapeHtml(p.reason)}</small>`:''}</td><td>${escapeHtml(p.startDate||'—')}</td><td>${escapeHtml(p.endDate||'Sin fecha fin')}</td><td>${escapeHtml(String(p.affectsTraining).toUpperCase()==='TRUE'?trainingModeLabelClient_(p.trainingMode):'No afecta')}</td><td>${escapeHtml(String(p.affectsMatches).toUpperCase()==='TRUE'?(String(p.matchSelectable).toUpperCase()==='TRUE'?'Seleccionable':'No seleccionable'):'No afecta')}</td><td>${statusBadge(p.status||'ACTIVE')}</td><td>${av.canManage&&p.status!=='CANCELLED'?`<button class="button mini secondary" data-edit-avp="${escapeHtml(p.availabilityPeriodId)}">Editar</button> <button class="button mini link danger-text" data-cancel-avp="${escapeHtml(p.availabilityPeriodId)}">Finalizar / cancelar</button>`:''}</td></tr>`).join('');
    body=`${activeHtml}<div class="section-divider"></div><div class="section-heading"><h3>Historial de disponibilidad</h3><p>Vacaciones, bajas deportivas y otras ausencias que afectan entrenamientos o partidos.</p></div>${rows?`<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Entrenos</th><th>Partidos</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay bajas o ausencias registradas.')}${av.canManage?'<div class="editor-actions"><button class="button primary" id="profile-new-availability-period">Nueva baja / ausencia</button></div>':''}`;
  }else if(tab==='family'){
    const people=profile.family.persons||[],rels=profile.family.relations||[],byId=Object.fromEntries(people.map(p=>[p.personId,p])),minor=isMinorClient_(person.birthDate);
    const own=rels.filter(r=>r.childPersonId===person.personId||r.guardianPersonId===person.personId);
    body=own.length?`<div class="table-wrap"><table><thead><tr><th>${minor?'Tutor':'Persona vinculada'}</th><th>Relación</th><th>Estado</th><th>Documentos</th></tr></thead><tbody>${own.map(r=>{const other=r.childPersonId===person.personId?byId[r.guardianPersonId]:byId[r.childPersonId];return `<tr><td><strong>${escapeHtml(other?.displayName||'—')}</strong><small>${escapeHtml([other?.email,other?.phone].filter(Boolean).join(' · '))}</small></td><td>${escapeHtml(r.relationshipType||'—')}</td><td>${statusBadge(r.status)}</td><td>${r.canManageDocuments==='TRUE'?'Sí':'No'}</td></tr>`;}).join('')}</tbody></table></div>`:emptyTable(minor?'No tiene tutores vinculados.':'No tiene menores vinculados.');
    const candidates=minor?people.filter(p=>p.personId!==person.personId&&!isMinorClient_(p.birthDate)):people.filter(p=>p.personId!==person.personId&&isMinorClient_(p.birthDate));
    if(canManageStructure)body+=candidates.length?`<div class="section-divider"></div><form id="profile-family-form" class="form-grid two"><label>${minor?'Tutor':'Menor'}<select id="profile-family-person" required>${optionList(candidates,'personId',p=>p.displayName,'',false)}</select></label><label>Relación<input id="profile-family-type" value="PADRE/MADRE" maxlength="50"></label><label class="check-row"><input id="profile-family-docs" type="checkbox" checked> Puede gestionar documentación</label><div><button class="button primary" type="submit">Añadir relación</button></div></form>`:'<p class="muted">No hay personas compatibles para añadir una relación.</p>';
  }else if(tab==='documents'){
    const docs=(profile.documents.documents||[]).filter(d=>d.personId===person.personId),types=Object.fromEntries((profile.documents.documentTypes||[]).map(t=>[t.documentTypeId,t]));
    body=docs.length?`<div class="table-wrap"><table><thead><tr><th>Documento</th><th>Estado</th><th>Vence</th></tr></thead><tbody>${docs.map(d=>`<tr><td><strong>${escapeHtml(types[d.documentTypeId]?.name||d.documentTypeId)}</strong><small>${escapeHtml(d.originalName||'')}</small></td><td>${statusBadge(d.status)}</td><td>${escapeHtml(d.expiryDate||'—')}</td></tr>`).join('')}</tbody></table></div>`:emptyTable('No tiene documentación cargada.');
    const canManageDocs=(profile.documents.manageablePersonIds||[]).includes(person.personId);if(canManageDocs)body+=`<div class="editor-actions"><button class="button primary" id="profile-manage-documents">Gestionar documentación</button></div>`;
  }else{
    const linked=(structureData.userAccess||[]).find(u=>u.personId===person.personId),candidate=!linked&&person.email?(structureData.userAccess||[]).find(u=>!u.personId&&normalizeEmailClient_(u.email)===normalizeEmailClient_(person.email)):null;
    if(linked) body=`<div class="profile-grid"><div><span>Cuenta</span><strong>${escapeHtml(linked.email)}</strong></div><div><span>Permiso del sistema</span><strong>${escapeHtml(linked.securityRole==='ADMIN'?'Administrador':'Acceso por Persona')}</strong></div><div><span>Estado</span>${statusBadge(linked.status)}</div><div><span>Último acceso</span><strong>${escapeHtml(linked.lastLoginAt||'Nunca')}</strong></div></div>${canManageStructure?'<div class="editor-actions"><button class="button secondary" id="profile-manage-access">Gestionar usuario</button></div>':''}`;
    else if(candidate&&canManageStructure) body=`<div class="info-strip"><strong>Cuenta existente detectada.</strong> ${escapeHtml(candidate.email)} todavía no está vinculada a ninguna Persona.</div><div class="editor-actions"><button class="button primary" id="profile-link-access" data-user-id="${escapeHtml(candidate.userId)}">Vincular cuenta existente</button></div>`;
    else body=`${person.email?'<p>No hay una cuenta vinculada a esta Persona.</p>':'<div class="message warning">Añadí un correo a la Persona antes de crear acceso.</div>'}<div class="editor-actions">${person.email&&canManageStructure?'<button class="button primary" id="profile-create-access">Crear acceso</button>':''}</div>`;
  }
  host.innerHTML=`<section class="inline-editor person-profile"><div class="editor-heading"><div><span class="eyebrow">Ficha de persona</span><h3>${escapeHtml(person.displayName)}</h3><p>${escapeHtml([person.email,person.phone].filter(Boolean).join(' · ')||'Sin datos de contacto')}</p></div><button type="button" class="button link" id="close-person-profile">Cerrar</button></div><div class="subnav profile-subnav">${tabs.map(([key,label])=>`<button type="button" class="subnav-link ${tab===key?'active':''}" data-profile-tab="${key}">${label}</button>`).join('')}</div><div class="profile-tab-body">${body}</div><div id="profile-message" class="message"></div></section>`;
  document.getElementById('close-person-profile').onclick=()=>host.innerHTML='';
  document.querySelectorAll('[data-profile-tab]').forEach(b=>b.onclick=()=>renderPersonProfile_(profile,b.dataset.profileTab));
  document.getElementById('profile-edit-person')?.addEventListener('click',()=>showPersonEditor(person));
  document.getElementById('profile-new-assignment')?.addEventListener('click',()=>showMultiAssignmentEditor_({personId:person.personId,returnToPersonId:person.personId}));
  document.querySelectorAll('[data-profile-edit-assignment]').forEach(b=>b.onclick=()=>showAssignmentEditor((structureData.assignments||[]).find(a=>a.assignmentId===b.dataset.profileEditAssignment)));
  document.getElementById('profile-manage-documents')?.addEventListener('click',()=>{saveUiStatePatch_({documentFilters:{personId:person.personId}});renderDocuments();});
  document.getElementById('profile-manage-access')?.addEventListener('click',()=>renderUsers(person.personId));
  document.getElementById('profile-create-access')?.addEventListener('click',()=>renderUsers(person.personId));
  const link=document.getElementById('profile-link-access');if(link)link.onclick=async()=>{try{const linkedUser=(structureData?.userAccess||[]).find(u=>u.userId===link.dataset.userId);await call('linkUserToPerson',{personId:person.personId,userId:link.dataset.userId});if(normalizeEmailClient_(currentUser?.email)===normalizeEmailClient_(linkedUser?.email||''))currentUser.personId=person.personId;showToast_('Cuenta vinculada.');await loadStructureData();await openPersonProfile_(person.personId,'access');}catch(err){showMessage(err.message,'error','profile-message');}};
  const newAvp=document.getElementById('profile-new-availability-period');if(newAvp)newAvp.onclick=()=>showAvailabilityPeriodEditor_(person,{onDone:()=>openPersonProfile_(person.personId,'availability'),onCancel:()=>openPersonProfile_(person.personId,'availability')});
  document.querySelectorAll('[data-edit-avp]').forEach(b=>b.onclick=()=>{const period=(profile.availability?.periods||[]).find(x=>x.availabilityPeriodId===b.dataset.editAvp);showAvailabilityPeriodEditor_(person,{period,onDone:()=>openPersonProfile_(person.personId,'availability'),onCancel:()=>openPersonProfile_(person.personId,'availability')});});
  document.querySelectorAll('[data-cancel-avp]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Finalizar/cancelar esta baja o ausencia?'))return;try{await call('cancelAvailabilityPeriod',{availabilityPeriodId:b.dataset.cancelAvp});showToast_('Período finalizado.');await openPersonProfile_(person.personId,'availability');}catch(err){showMessage(err.message,'error','profile-message');}});
  const ff=document.getElementById('profile-family-form');if(ff)ff.onsubmit=async e=>{e.preventDefault();const minor=isMinorClient_(person.birthDate),other=val('profile-family-person');try{await call('saveGuardianRelation',{childPersonId:minor?person.personId:other,guardianPersonId:minor?other:person.personId,relationshipType:val('profile-family-type'),status:'ACTIVE',canManageDocuments:document.getElementById('profile-family-docs').checked});showToast_('Relación familiar guardada.');await openPersonProfile_(person.personId,'family');}catch(err){showMessage(err.message,'error','profile-message');}};
  host.scrollIntoView({behavior:'smooth',block:'start'});
}

function showRoleEditor(role = {}) {
  editorShell(role.roleId ? 'Editar cargo' : 'Nuevo cargo', 'Definí la función organizativa y su alcance. Los permisos de administrador del sistema se gestionan exclusivamente desde Usuarios.', `
    <label>Nombre del cargo<input id="role-name" maxlength="100" required value="${escapeHtml(role.name || '')}"></label>
    <div class="form-grid two"><label>Categoría<select id="role-category">${[['PLAYER','Jugador'],['COACH','Entrenador'],['MANAGER','Manager / Delegado'],['COORDINATOR','Coordinador'],['REFEREE','Árbitro'],['COLLABORATOR','Colaborador']].map(([v,l]) => `<option value="${v}" ${role.category===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Alcance<select id="role-scope">${[['FLEXIBLE','Flexible'],['TRANSVERSAL','Transversal'],['DIVISION','División']].map(([v,l]) => `<option value="${v}" ${role.scopeType===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
    <div class="info-strip" id="role-scope-help"></div>
    <label>Descripción<textarea id="role-description" maxlength="300" rows="3">${escapeHtml(role.description || '')}</textarea></label>
    <label>Estado<select id="role-status"><option value="ACTIVE" ${role.status !== 'INACTIVE' ? 'selected' : ''}>Activo</option><option value="INACTIVE" ${role.status === 'INACTIVE' ? 'selected' : ''}>Inactivo</option></select></label>`);
  const sync=()=>{const cat=val('role-category'),scope=document.getElementById('role-scope'),help=document.getElementById('role-scope-help');if(['PLAYER','COACH','MANAGER'].includes(cat)){scope.value='DIVISION';scope.disabled=true;help.textContent=cat==='PLAYER'?'Jugador: siempre se asigna a una división.':cat==='COACH'?'Entrenador: el acceso se limita a las divisiones asignadas.':'Manager/Delegado: el acceso y la gestión documental se limitan a las divisiones asignadas.';}else if(cat==='REFEREE'){scope.value='TRANSVERSAL';scope.disabled=true;help.textContent='Árbitro: el acceso se limita a las actividades donde esté asignado.';}else{scope.disabled=false;help.textContent='Coordinador y Colaborador pueden asignarse a una división o ser transversales para todas las divisiones.';}};
  document.getElementById('role-category').onchange=sync;sync();
  document.getElementById('entity-form').onsubmit = event => submitEntity(event, 'saveRole', { roleId: role.roleId || '', name: val('role-name'), category: val('role-category'), scopeType: val('role-scope'), description: val('role-description'), status: val('role-status') });
}

function showDivisionEditor(item = {}) {
  editorShell(item.divisionId ? 'Editar división' : 'Nueva división', 'La división es un registro maestro estable entre temporadas. Equipos y reglas de duración se configuran por temporada.', `<div class="form-grid three"><label>Nombre<input id="division-name" maxlength="100" required value="${escapeHtml(item.name || '')}"></label><label>Código<input id="division-code" maxlength="30" value="${escapeHtml(item.code || '')}" placeholder="M16"></label><label>Color base<input id="division-color" type="color" value="${escapeHtml(item.color || '#2563EB')}"></label></div><label>Estado<select id="division-status"><option value="ACTIVE" ${item.status !== 'INACTIVE' ? 'selected' : ''}>Activa</option><option value="INACTIVE" ${item.status === 'INACTIVE' ? 'selected' : ''}>Inactiva</option></select></label><small>Los minutos de partido único/triangular/cuadrangular ya no se guardan aquí: pertenecen a Temporada + División.</small><div id="division-color-preview" class="division-color-preview"></div>`);
  const renderDivisionColorPreview=()=>{const base=val('division-color')||'#2563EB',v=divisionColorVariants_(base);const host=document.getElementById('division-color-preview');if(host)host.innerHTML=`<div class="division-swatch strong" style="--swatch:${escapeHtml(v.strong)}"><strong>Partido</strong><small>Fuerte</small></div><div class="division-swatch medium" style="--swatch:${escapeHtml(v.medium)}"><strong>Entrenamiento</strong><small>Medio</small></div><div class="division-swatch light" style="--swatch:${escapeHtml(v.light)}"><strong>Descanso</strong><small>Suave</small></div>`;};
  document.getElementById('division-color').oninput=renderDivisionColorPreview;renderDivisionColorPreview();
  document.getElementById('entity-form').onsubmit = event => submitEntity(event, 'saveDivision', { divisionId: item.divisionId || '', seasonId: structureData.selectedSeasonId || structureData.activeSeasonId || selectedSeasonId_(), name: val('division-name'), code: val('division-code'), color: val('division-color'), status: val('division-status') });
}

function showTeamEditor(item = {}) {
  const divisions = (structureData.divisions || []).filter(x => x.status === 'ACTIVE' || x.divisionId === item.divisionId);
  editorShell(item.teamId ? 'Editar equipo' : 'Nuevo equipo', 'El color lo hereda de la división. El patrón se usa en partidos y descansos para distinguir A/B; los entrenamientos siguen siendo de división.', `<label>División<select id="team-division" required>${optionList(divisions, 'divisionId', x => x.name, item.divisionId || '', false)}</select></label><div class="form-grid two"><label>Nombre<input id="team-name" maxlength="100" required value="${escapeHtml(item.name || '')}"></label><label>Código<input id="team-code" maxlength="30" value="${escapeHtml(item.code || '')}"></label></div><div class="form-grid two"><label>Patrón visual<select id="team-pattern"><option value="SOLID" ${(item.displayPattern||'SOLID')==='SOLID'?'selected':''}>Sólido (Equipo A)</option><option value="STRIPED" ${item.displayPattern==='STRIPED'?'selected':''}>Rayado (Equipo B)</option><option value="DOTTED" ${item.displayPattern==='DOTTED'?'selected':''}>Punteado</option></select></label><div class="team-pattern-preview"><span class="pattern-sample solid">A</span><span class="pattern-sample striped">B</span><span class="pattern-sample dotted">C</span></div></div><label>Estado<select id="team-status"><option value="ACTIVE" ${item.status !== 'INACTIVE' ? 'selected' : ''}>Activo</option><option value="INACTIVE" ${item.status === 'INACTIVE' ? 'selected' : ''}>Inactivo</option></select></label>`);
  document.getElementById('entity-form').onsubmit = event => submitEntity(event, 'saveTeam', { teamId: item.teamId || '', seasonId: item.seasonId || structureData.selectedSeasonId || structureData.activeSeasonId || selectedSeasonId_(), divisionId: val('team-division'), name: val('team-name'), code: val('team-code'), displayPattern: val('team-pattern'), status: val('team-status') });
}

function assignmentRuleClient_(role){
  if(!role)return 'OPTIONAL';if(['PLAYER','COACH','MANAGER'].includes(role.category)||role.scopeType==='DIVISION')return 'REQUIRED';if(role.category==='REFEREE'||role.scopeType==='TRANSVERSAL')return 'FORBIDDEN';return 'OPTIONAL';
}
function assignmentDivisionChecks_(rowId,activeDivisions,selectedIds){
  const selected=new Set(selectedIds||[]);
  if(!activeDivisions.length)return '<p class="muted">No hay divisiones activas disponibles.</p>';
  return '<div class="assignment-division-grid">'+activeDivisions.map(d=>`<label class="assignment-check"><input type="checkbox" data-assignment-division="${rowId}" value="${escapeHtml(d.divisionId)}" ${selected.has(d.divisionId)?'checked':''}><span>${escapeHtml(d.name)}</span></label>`).join('')+'</div>';
}

function multiAssignmentRowHtml_(rowId,item,activeRoles,activeDivisions){
  const roleId=item.roleId||'',role=activeRoles.find(r=>r.roleId===roleId),rule=assignmentRuleClient_(role);
  const initialMode=rule==='FORBIDDEN'?'TRANSVERSAL':(item.mode||(item.divisionIds&&item.divisionIds.length?'DIVISION':'DIVISION'));
  return `<section class="assignment-batch-row" data-assignment-row="${rowId}">
    <div class="assignment-row-head"><strong>Asignación <span data-assignment-number></span></strong><button type="button" class="button mini link" data-remove-assignment-row="${rowId}">Quitar</button></div>
    <div class="form-grid two"><label>Cargo<select data-batch-role="${rowId}" required>${optionList(activeRoles,'roleId',x=>x.name,roleId,false)}</select></label><label>Estado<select data-batch-status="${rowId}"><option value="ACTIVE" ${item.status!=='ENDED'?'selected':''}>Activa</option><option value="ENDED" ${item.status==='ENDED'?'selected':''}>Finalizada</option></select></label></div>
    <div class="assignment-scope-box" data-batch-scope-box="${rowId}">
      <div class="assignment-scope-head"><strong>Alcance</strong><small data-batch-help="${rowId}"></small></div>
      <div class="assignment-mode-row">
        <label class="assignment-mode"><input type="radio" name="batch-mode-${rowId}" value="DIVISION" data-batch-mode="${rowId}" ${initialMode==='DIVISION'?'checked':''}> Por división</label>
        <label class="assignment-mode"><input type="radio" name="batch-mode-${rowId}" value="TRANSVERSAL" data-batch-mode="${rowId}" ${initialMode==='TRANSVERSAL'?'checked':''}> Transversal</label>
      </div>
      <div data-batch-divisions-wrap="${rowId}">${assignmentDivisionChecks_(rowId,activeDivisions,item.divisionIds||[])}</div>
    </div>
    <details class="advanced-fields"><summary>Vigencia y notas (opcional)</summary><div class="form-grid two"><label>Desde<input data-batch-start="${rowId}" type="date" value="${escapeHtml(item.startDate||'')}"></label><label>Hasta<input data-batch-end="${rowId}" type="date" value="${escapeHtml(item.endDate||'')}"></label></div><label>Notas<textarea data-batch-notes="${rowId}" maxlength="500" rows="2">${escapeHtml(item.notes||'')}</textarea></label></details>
  </section>`;
}

function showMultiAssignmentEditor_(options={}){
  const host=document.getElementById('editor-host');if(!host)return;
  const activePeople=(structureData.persons||[]).filter(x=>x.status==='ACTIVE'||x.personId===options.personId);
  const activeRoles=(structureData.roles||[]).filter(x=>x.status==='ACTIVE'&&recommendedRoleCategories_().includes(x.category));
  const activeDivisions=(structureData.divisions||[]).filter(x=>x.status==='ACTIVE');
  const fixedPersonId=options.personId||'';
  let rowSeq=0;
  host.innerHTML=`<section class="inline-editor assignment-batch-editor"><div class="editor-heading"><div><h3>Nuevas asignaciones</h3><p>Cargá varios cargos y varias divisiones en una sola operación. La temporada es la seleccionada en la cabecera.</p></div><button type="button" class="button link" id="close-editor">Cerrar</button></div><form id="assignment-batch-form" class="form-stack"><label>Persona<select id="assignment-batch-person" required ${fixedPersonId?'disabled':''}>${optionList(activePeople,'personId',x=>x.displayName,fixedPersonId,false)}</select></label><div class="info-strip"><strong>Podés resolver todo el perfil de una vez.</strong> Por ejemplo, Entrenador en M16 + M18, Coordinador transversal y Árbitro transversal. Los duplicados existentes se omiten.</div><div id="assignment-batch-rows"></div><div><button type="button" class="button secondary" id="assignment-batch-add">+ Añadir otra asignación</button></div><div class="editor-actions"><div id="editor-message" class="message"></div><button class="button primary" type="submit">Guardar asignaciones</button></div></form></section>`;
  document.getElementById('close-editor').onclick=()=>{host.innerHTML='';};
  const rowsHost=document.getElementById('assignment-batch-rows');
  const renumber=()=>rowsHost.querySelectorAll('[data-assignment-row]').forEach((el,i)=>{const n=el.querySelector('[data-assignment-number]');if(n)n.textContent=String(i+1);const remove=el.querySelector('[data-remove-assignment-row]');if(remove)remove.style.visibility=rowsHost.querySelectorAll('[data-assignment-row]').length>1?'visible':'hidden';});
  const syncRow=(rowId)=>{
    const roleId=document.querySelector(`[data-batch-role="${rowId}"]`)?.value||'',role=activeRoles.find(r=>r.roleId===roleId),rule=assignmentRuleClient_(role);
    const modes=[...document.querySelectorAll(`[data-batch-mode="${rowId}"]`)];const divisionMode=modes.find(x=>x.value==='DIVISION'),transversalMode=modes.find(x=>x.value==='TRANSVERSAL');
    const help=document.querySelector(`[data-batch-help="${rowId}"]`),wrap=document.querySelector(`[data-batch-divisions-wrap="${rowId}"]`);
    if(rule==='REQUIRED'){divisionMode.checked=true;divisionMode.disabled=true;transversalMode.disabled=true;if(help)help.textContent='Este cargo requiere una o varias divisiones.';}
    else if(rule==='FORBIDDEN'){transversalMode.checked=true;divisionMode.disabled=true;transversalMode.disabled=true;if(help)help.textContent='Cargo transversal: no requiere división.';}
    else{divisionMode.disabled=false;transversalMode.disabled=false;if(help)help.textContent='Elegí una o varias divisiones, o marcá Transversal.';}
    const mode=modes.find(x=>x.checked)?.value||'DIVISION';if(wrap)wrap.hidden=mode!=='DIVISION';
  };
  const addRow=(item={})=>{
    const rowId=++rowSeq;rowsHost.insertAdjacentHTML('beforeend',multiAssignmentRowHtml_(rowId,item,activeRoles,activeDivisions));
    const role=document.querySelector(`[data-batch-role="${rowId}"]`);if(role)role.onchange=()=>syncRow(rowId);
    document.querySelectorAll(`[data-batch-mode="${rowId}"]`).forEach(x=>x.onchange=()=>syncRow(rowId));
    const remove=document.querySelector(`[data-remove-assignment-row="${rowId}"]`);if(remove)remove.onclick=()=>{document.querySelector(`[data-assignment-row="${rowId}"]`)?.remove();renumber();};
    syncRow(rowId);renumber();
  };
  document.getElementById('assignment-batch-add').onclick=()=>addRow();
  addRow();
  document.getElementById('assignment-batch-form').onsubmit=async(event)=>{
    event.preventDefault();const button=event.submitter;if(button)button.disabled=true;showMessage('Guardando asignaciones…','info','editor-message');
    const personId=fixedPersonId||val('assignment-batch-person'),seasonId=structureData.selectedSeasonId||structureData.activeSeasonId||selectedSeasonId_();
    const assignments=[];let validationError='';
    rowsHost.querySelectorAll('[data-assignment-row]').forEach(row=>{
      if(validationError)return;const rowId=row.dataset.assignmentRow,roleId=document.querySelector(`[data-batch-role="${rowId}"]`)?.value||'',role=activeRoles.find(r=>r.roleId===roleId),rule=assignmentRuleClient_(role),mode=document.querySelector(`[data-batch-mode="${rowId}"]:checked`)?.value||'DIVISION';
      const base={personId,roleId,seasonId,status:document.querySelector(`[data-batch-status="${rowId}"]`)?.value||'ACTIVE',startDate:document.querySelector(`[data-batch-start="${rowId}"]`)?.value||'',endDate:document.querySelector(`[data-batch-end="${rowId}"]`)?.value||'',notes:document.querySelector(`[data-batch-notes="${rowId}"]`)?.value||''};
      if(!roleId){validationError='Seleccioná un cargo en todas las filas.';return;}
      if(rule==='FORBIDDEN'||mode==='TRANSVERSAL'){assignments.push(Object.assign({},base,{divisionId:''}));return;}
      const selected=[...document.querySelectorAll(`[data-assignment-division="${rowId}"]:checked`)].map(x=>x.value);
      if(!selected.length){validationError='Seleccioná al menos una división para '+(role?.name||'el cargo')+'.';return;}
      selected.forEach(divisionId=>assignments.push(Object.assign({},base,{divisionId})));
    });
    if(validationError){showMessage(validationError,'error','editor-message');if(button)button.disabled=false;return;}
    const seen=new Set(),unique=[];for(const a of assignments){const key=[a.personId,a.roleId,a.divisionId,a.seasonId,a.status].join('|');if(!seen.has(key)){seen.add(key);unique.push(a);}}
    try{
      const res=(await call('saveAssignmentsBatch',{personId,seasonId,assignments:unique})).data||{};
      const parts=[`${res.created||0} creadas`];if(res.skipped)parts.push(`${res.skipped} duplicadas omitidas`);if((res.errors||[]).length)parts.push(`${res.errors.length} con error`);showToast_(parts.join(' · '));
      await loadStructureData();
      if(options.returnToPersonId)await openPersonProfile_(options.returnToPersonId,'club');else await renderStructure('assignments');
    }catch(error){showMessage(error.message,'error','editor-message');if(button)button.disabled=false;}
  };
  host.scrollIntoView({behavior:'smooth',block:'start'});
}

function showAssignmentEditor(item = {}) {
  const activePeople = (structureData.persons || []).filter(x => x.status === 'ACTIVE' || x.personId === item.personId);
  const activeRoles = (structureData.roles || []).filter(x => x.roleId === item.roleId || (x.status === 'ACTIVE' && recommendedRoleCategories_().includes(x.category)));
  const activeDivisions = (structureData.divisions || []).filter(x => x.status === 'ACTIVE' || x.divisionId === item.divisionId);
  editorShell(item.assignmentId ? 'Editar asignación' : 'Nueva asignación', 'La asignación pertenece a la temporada seleccionada. A/B se decide en cada partido, no en la persona.', `<div class="form-grid two"><label>Persona<select id="assignment-person" required>${optionList(activePeople,'personId',x=>x.displayName,item.personId||'',false)}</select></label><label>Cargo<select id="assignment-role" required>${optionList(activeRoles,'roleId',x=>x.name,item.roleId||'',false)}</select></label></div><label id="assignment-division-wrap">División<select id="assignment-division">${optionList(activeDivisions,'divisionId',x=>x.name,item.divisionId||'')}</select><small id="assignment-scope-help"></small></label><details class="advanced-fields"><summary>Vigencia y notas (opcional)</summary><div class="form-grid two"><label>Desde<input id="assignment-start" type="date" value="${escapeHtml(item.startDate || '')}"></label><label>Hasta<input id="assignment-end" type="date" value="${escapeHtml(item.endDate || '')}"></label></div><label>Notas<textarea id="assignment-notes" maxlength="500" rows="3">${escapeHtml(item.notes || '')}</textarea></label></details><label>Estado<select id="assignment-status"><option value="ACTIVE" ${item.status !== 'ENDED' ? 'selected' : ''}>Activa</option><option value="ENDED" ${item.status === 'ENDED' ? 'selected' : ''}>Finalizada</option></select></label>`);
  const syncScope=()=>{const role=activeRoles.find(r=>r.roleId===val('assignment-role')),rule=assignmentRuleClient_(role),select=document.getElementById('assignment-division'),wrap=document.getElementById('assignment-division-wrap'),help=document.getElementById('assignment-scope-help');if(rule==='FORBIDDEN'){select.value='';select.disabled=true;wrap.classList.add('is-disabled');help.textContent='Cargo transversal: no se asigna división.';}else{select.disabled=false;wrap.classList.remove('is-disabled');if(rule==='REQUIRED')help.textContent='Este cargo requiere una división.';else help.textContent='Podés elegir una división o dejarlo transversal.';}};
  document.getElementById('assignment-role').onchange=syncScope;syncScope();
  document.getElementById('entity-form').onsubmit = event => submitEntity(event, 'saveAssignment', { assignmentId: item.assignmentId || '', personId: val('assignment-person'), roleId: val('assignment-role'), divisionId: document.getElementById('assignment-division').disabled?'':val('assignment-division'), seasonId: item.seasonId || structureData.selectedSeasonId || structureData.activeSeasonId || selectedSeasonId_(), startDate: val('assignment-start'), endDate: val('assignment-end'), status: val('assignment-status'), notes: val('assignment-notes') });
}

function val(id) { return document.getElementById(id)?.value?.trim?.() ?? document.getElementById(id)?.value ?? ''; }

async function submitEntity(event, action, payload) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  showMessage('Guardando…', 'info', 'editor-message');
  try {
    await call(action, payload);
    showToast_('Guardado correctamente.');
    await loadStructureData();
    await renderStructure(structureSection);
  } catch (error) {
    showMessage(error.message, 'error', 'editor-message');
    button.disabled = false;
  }
}

function renderSeasonDivisionConfig_(seasonData,seasonId){
  const host=document.getElementById('season-division-config');if(!host)return;const season=(seasonData.seasons||[]).find(x=>x.seasonId===seasonId)||{},settings=seasonData.seasonDivisionSettings||[],teams=seasonData.teams||[];
  const byDivision={};settings.filter(x=>x.seasonId===seasonId).forEach(x=>byDivision[x.divisionId]=x);
  const rows=(seasonData.divisions||[]).filter(d=>d.status==='ACTIVE').map(d=>{const st=byDivision[d.divisionId]||{},own=teams.filter(t=>t.seasonId===seasonId&&t.divisionId===d.divisionId&&t.status==='ACTIVE');return `<tr><td><strong>${escapeHtml(d.name)}</strong><small>${escapeHtml(d.code||'')}</small></td><td>${st.status==='INACTIVE'?'<span class="badge inactive">No usada</span>':'<span class="badge active">Activa</span>'}</td><td>${escapeHtml(st.defaultMatchMinutes||'—')}${st.defaultHalfMinutes?` (${escapeHtml(st.defaultHalfMinutes)}+${escapeHtml(st.defaultHalfMinutes)})`:''}</td><td>${escapeHtml(st.triangularMatchMinutes||'—')}${st.triangularHalfMinutes?` (${escapeHtml(st.triangularHalfMinutes)}+${escapeHtml(st.triangularHalfMinutes)})`:''}</td><td>${escapeHtml(st.quadrangularMatchMinutes||'—')}${st.quadrangularHalfMinutes?` (${escapeHtml(st.quadrangularHalfMinutes)}+${escapeHtml(st.quadrangularHalfMinutes)})`:''}</td><td>${own.length?own.map(t=>escapeHtml(t.name)).join(' · '):'Sin equipos'}</td><td><button class="button mini secondary" data-season-division-edit="${escapeHtml(d.divisionId)}">Editar reglas</button></td></tr>`;}).join('');
  host.innerHTML=`<div class="section-divider"></div><div class="section-heading"><h3>${escapeHtml(season.name||'Temporada')} · configuración deportiva</h3><p>Los tiempos pertenecen a esta temporada. Los equipos se crean desde Estructura → Divisiones y equipos seleccionando esta temporada en la cabecera.</p></div><div class="table-wrap"><table><thead><tr><th>División</th><th>Uso</th><th>Partido único</th><th>Triangular</th><th>Cuadrangular</th><th>Equipos</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div id="season-division-editor"></div>`;
  host.querySelectorAll('[data-season-division-edit]').forEach(b=>b.onclick=()=>openSeasonDivisionRuleEditor_(seasonData,seasonId,b.dataset.seasonDivisionEdit));host.scrollIntoView({behavior:'smooth',block:'start'});
}
function openSeasonDivisionRuleEditor_(seasonData,seasonId,divisionId){
  const host=document.getElementById('season-division-editor'),d=(seasonData.divisions||[]).find(x=>x.divisionId===divisionId)||{},st=(seasonData.seasonDivisionSettings||[]).find(x=>x.seasonId===seasonId&&x.divisionId===divisionId)||{};if(!host)return;
  host.innerHTML=`<section class="inline-editor"><div class="editor-heading"><div><h3>${escapeHtml(d.name||'División')} · reglas de temporada</h3><p>Estas reglas no modifican otras temporadas.</p></div><button class="button link" type="button" id="season-rule-close">Cerrar</button></div><form id="season-rule-form" class="form-stack"><label>Uso en esta temporada<select id="season-rule-status"><option value="ACTIVE" ${st.status!=='INACTIVE'?'selected':''}>Activa</option><option value="INACTIVE" ${st.status==='INACTIVE'?'selected':''}>No usada</option></select></label><div class="section-heading"><h4>Partido único</h4></div><div class="form-grid two"><label>Minutos partido<input id="season-rule-single-total" type="number" min="1" max="120" value="${escapeHtml(st.defaultMatchMinutes||'')}"></label><label>Minutos por tiempo<input id="season-rule-single-half" type="number" min="1" max="60" value="${escapeHtml(st.defaultHalfMinutes||'')}"></label></div><div class="section-heading"><h4>Triangular</h4></div><div class="form-grid two"><label>Minutos partido<input id="season-rule-tri-total" type="number" min="1" max="120" value="${escapeHtml(st.triangularMatchMinutes||'')}"></label><label>Minutos por tiempo<input id="season-rule-tri-half" type="number" min="1" max="60" value="${escapeHtml(st.triangularHalfMinutes||'')}"></label></div><div class="section-heading"><h4>Cuadrangular</h4></div><div class="form-grid two"><label>Minutos partido<input id="season-rule-quad-total" type="number" min="1" max="120" value="${escapeHtml(st.quadrangularMatchMinutes||'')}"></label><label>Minutos por tiempo<input id="season-rule-quad-half" type="number" min="1" max="60" value="${escapeHtml(st.quadrangularHalfMinutes||'')}"></label></div><div class="editor-actions"><div id="season-rule-message" class="message"></div><button class="button primary" type="submit">Guardar reglas</button></div></form></section>`;
  document.getElementById('season-rule-close').onclick=()=>{host.innerHTML='';};document.getElementById('season-rule-form').onsubmit=async ev=>{ev.preventDefault();try{await call('saveSeasonDivisionSetting',{seasonId,divisionId,status:val('season-rule-status'),defaultMatchMinutes:val('season-rule-single-total'),defaultHalfMinutes:val('season-rule-single-half'),triangularMatchMinutes:val('season-rule-tri-total'),triangularHalfMinutes:val('season-rule-tri-half'),quadrangularMatchMinutes:val('season-rule-quad-total'),quadrangularHalfMinutes:val('season-rule-quad-half')});showToast_('Reglas de temporada guardadas.');const fresh=(await call('getSeasonsData')).data;renderSeasonDivisionConfig_(fresh,seasonId);}catch(err){showMessage(err.message,'error','season-rule-message');}};host.scrollIntoView({behavior:'smooth',block:'start'});
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

let pdfJsPromise_=null;
function loadPdfJs_(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  if(pdfJsPromise_)return pdfJsPromise_;
  pdfJsPromise_=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload=()=>{if(!window.pdfjsLib)return reject(new Error('PDF.js no quedó disponible.'));window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';resolve(window.pdfjsLib);};
    script.onerror=()=>reject(new Error('No se pudo cargar PDF.js.'));
    document.head.appendChild(script);
  });
  return pdfJsPromise_;
}
async function extractNativePdfText_(fileOrDataUrl){
  try{
    const pdfjs=await loadPdfJs_();
    let bytes;
    if(fileOrDataUrl instanceof File)bytes=new Uint8Array(await fileOrDataUrl.arrayBuffer());
    else {const res=await fetch(String(fileOrDataUrl||''));bytes=new Uint8Array(await res.arrayBuffer());}
    const pdf=await pdfjs.getDocument({data:bytes}).promise;const pages=[];
    for(let i=1;i<=pdf.numPages;i+=1){
      const page=await pdf.getPage(i);const content=await page.getTextContent();
      const rows=[];
      (content.items||[]).forEach(item=>{
        const str=String(item.str||'').trim();if(!str)return;
        const x=Number(item.transform?.[4]||0),y=Number(item.transform?.[5]||0),w=Math.max(0,Number(item.width||0));
        let row=rows.find(r=>Math.abs(r.y-y)<=2.2);
        if(!row){row={y,items:[]};rows.push(row);}row.items.push({x,w,str});
      });
      rows.sort((a,b)=>b.y-a.y);
      const viewport=page.getViewport({scale:1});
      const midX=viewport.width/2;
      const lines=[];
      let farSection='',farChangeTeam='',farCardTeam='';
      rows.forEach(row=>{
        row.items.sort((a,b)=>a.x-b.x);let line='',cursor=null;
        row.items.forEach(item=>{
          if(cursor===null){
            line=(item.x>midX?' '.repeat(24):'')+item.str;cursor=item.x+item.w;return;
          }
          const gap=Math.max(0,item.x-cursor);
          const spaces=gap>90?12:gap>45?7:gap>20?4:gap>7?2:1;
          line+=' '.repeat(spaces)+item.str;cursor=Math.max(cursor,item.x+item.w);
        });
        line=line.trimEnd();
        if(line)lines.push(line);

        const flatLine=line.replace(/\s+/g,' ').trim();
        if(/^Marcador$/i.test(flatLine))farSection='SCORING';
        else if(/^Cambios$/i.test(flatLine))farSection='CHANGES';
        else if(/Expulsiones\s+temporales/i.test(flatLine))farSection='CARDS';

        if(farSection==='CHANGES'){
          if(/Equipo\s+local\s*:/i.test(flatLine))farChangeTeam='HOME';
          else if(/Equipo\s+visitante\s*:/i.test(flatLine))farChangeTeam='AWAY';
          if(farChangeTeam && /^(?:Tipo\s*\*|Dorsal\s+entra|Dorsal\s+sale|Minuto\b)/i.test(flatLine)){
            lines.push(`__FAR_CHANGE_${farChangeTeam}__ ${flatLine}`);
          }
        }

        if(farSection==='CARDS'){
          if(/Equipo\s+local\s*:/i.test(flatLine))farCardTeam='HOME';
          else if(/Equipo\s+visitante\s*:/i.test(flatLine))farCardTeam='AWAY';
          if(farCardTeam){
            const cardColumns={YELLOW:[],RED:[]};
            row.items.forEach(item=>cardColumns[item.x<midX?'YELLOW':'RED'].push(item.str));
            ['YELLOW','RED'].forEach(cardType=>{
              const cardText=cardColumns[cardType].join(' ').replace(/\s+/g,' ').trim();
              if(/^(?:Tipo\s*\*|Dorsal\b|Minuto\b)/i.test(cardText)){
                lines.push(`__FAR_CARD_${farCardTeam}_${cardType}__ ${cardText}`);
              }
            });
          }
        }

        // Preserve the physical HOME/AWAY column for roster rows. Native PDF text can
        // flatten uneven benches and make the server infer the wrong team. These tagged
        // rows are additive metadata used only by the FAR roster parser.
        const sideItems={HOME:[],AWAY:[]};
        row.items.forEach(item=>sideItems[item.x<midX?'HOME':'AWAY'].push(item.str));
        ['HOME','AWAY'].forEach(side=>{
          const sideText=sideItems[side].join(' ').replace(/\s+/g,' ').trim();
          if(!/0\d{6}/.test(sideText))return;
          if(!/^\d{1,3}\s+/.test(sideText))return;
          lines.push(`__FAR_ROSTER_${side}__ ${sideText}`);
        });
      });
      pages.push(lines.join('\n'));
    }
    const text=pages.join('\n\n');
    return text.length>=250?text:'';
  }catch(err){console.warn('Extracción nativa PDF no disponible; se usará fallback del backend.',err);return '';}
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
  const cached=readBootstrapCache_();
  if(cached?.actor&&cached?.clubConfig&&cached?.seasonContext){
    applyBootstrapData_(cached);
    await renderDashboard();
  }else{
    currentUser={email:'Sesión guardada',role:'MEMBER',accessProfile:{capabilities:{}}};
    renderStartupShell_();
  }
  try {
    const {data}=await call('getAppBootstrap');
    applyBootstrapData_(data);
    if(!cached||currentNavKey_()==='home'||!currentNavKey_())await renderDashboard();
    scheduleRuntimeMaintenance_();
  } catch (error) {
    if (!sessionToken) return renderLogin();
    if(cached){showToast_('No se pudo refrescar la sesión. Se muestran los últimos datos disponibles.','warning',4000);return;}
    shell(`<section class="panel narrow"><h1>No se pudo recuperar la sesión</h1><p>${escapeHtml(error.message)}</p><button class="button primary" id="back-login">Volver al acceso</button></section>`);
    document.getElementById('back-login').onclick = () => { clearSession(); renderLogin(); };
  }
}

start();

function personNameById(items,id){const p=(items||[]).find(x=>x.personId===id);return p?p.displayName:id||'—';}

async function renderFamilies(){
  if(!currentAccessProfile_().isAdmin) return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>Las relaciones de tutor se gestionan desde la ficha de Persona por un administrador.</p></section>','families');
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
    const {data}=await call('getDocumentsData');const people=data.persons||[],types=data.documentTypes||[],docs=data.documents||[],personMap=Object.fromEntries(people.map(p=>[p.personId,p])),typeMap=Object.fromEntries(types.map(t=>[t.documentTypeId,t]));
    const manageable=new Set(data.manageablePersonIds||[]),reviewable=new Set(data.reviewablePersonIds||[]),manageablePeople=people.filter(p=>manageable.has(p.personId));
    const st=loadUiState_().documentFilters||{},q=textNorm_(st.q||''),personId=st.personId||'',typeId=st.typeId||'',status=st.status||'',expiry=st.expiry||'';const today=new Date().toISOString().slice(0,10),soon=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
    const filtered=docs.filter(d=>{const p=personMap[d.personId]||{},t=typeMap[d.documentTypeId]||{};if(q&&!textNorm_([p.displayName,d.originalName,t.name,d.reviewNotes].join(' ')).includes(q))return false;if(personId&&d.personId!==personId)return false;if(typeId&&d.documentTypeId!==typeId)return false;if(status&&d.status!==status)return false;if(expiry==='EXPIRED'&&(!d.expiryDate||d.expiryDate>=today))return false;if(expiry==='SOON'&&(!d.expiryDate||d.expiryDate<today||d.expiryDate>soon))return false;if(expiry==='NO_EXPIRY'&&d.expiryDate)return false;return true;}).sort((a,b)=>String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||'')));
    const rows=filtered.map(d=>{const p=personMap[d.personId]||{},t=typeMap[d.documentTypeId]||{},statusOnly=d.statusOnly==='TRUE',kb=Math.round((Number(d.sizeBytes)||0)/1024);const detail=statusOnly?'Estado documental visible; archivo privado.':`${escapeHtml(d.originalName)} · v${escapeHtml(d.versionNo)}${d.sizeBytes?` · ${kb} KB`:''}`;const actions=statusOnly?'<span class="muted">Solo estado</span>':`<button class="button mini secondary" data-view-doc="${escapeHtml(d.documentId)}">Ver</button>${reviewable.has(d.personId)&&d.status==='PENDING'?` <button class="button mini primary" data-approve-doc="${escapeHtml(d.documentId)}">Aprobar</button> <button class="button mini secondary" data-reject-doc="${escapeHtml(d.documentId)}">Rechazar</button>`:''}`;return `<tr><td><strong>${escapeHtml(p.displayName||'—')}</strong><small>${escapeHtml([p.email,p.phone].filter(Boolean).join(' · ')||'')}</small></td><td><strong>${escapeHtml(t.name||d.documentTypeId)}</strong><small>${detail}</small></td><td>${statusBadge(d.status)}${d.reviewNotes?`<small>${escapeHtml(d.reviewNotes)}</small>`:''}</td><td><strong>${escapeHtml(d.issueDate||'—')}</strong><small>Subido ${escapeHtml((d.uploadedAt||'').slice(0,10)||'—')}</small></td><td>${escapeHtml(d.expiryDate||'—')}</td><td>${actions}</td></tr>`;}).join('');
    shell(`<section class="hero compact"><span class="eyebrow">Documentación</span><h1>Archivos privados</h1><p>Cada persona gestiona sus documentos. Tutores gestionan los de sus menores y managers los de las personas de sus divisiones; otros perfiles solo ven el estado cuando corresponde.</p></section><section class="panel"><div class="panel-heading"><div><h2>Documentos accesibles</h2><p>${filtered.length} de ${docs.length} documentos</p></div></div><div class="filter-bar"><label class="filter-grow">Buscar<input id="doc-filter-q" value="${escapeHtml(st.q||'')}" placeholder="Persona, archivo, tipo o nota"></label><label>Titular<select id="doc-filter-person"><option value="">Todos</option>${people.map(p=>`<option value="${escapeHtml(p.personId)}" ${personId===p.personId?'selected':''}>${escapeHtml(p.displayName)}</option>`).join('')}</select></label><label>Tipo<select id="doc-filter-type"><option value="">Todos</option>${types.map(t=>`<option value="${escapeHtml(t.documentTypeId)}" ${typeId===t.documentTypeId?'selected':''}>${escapeHtml(t.name)}</option>`).join('')}</select></label><label>Estado<select id="doc-filter-status"><option value="">Todos</option>${['PENDING','APPROVED','REJECTED','SUPERSEDED'].map(x=>`<option value="${x}" ${status===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Vencimiento<select id="doc-filter-expiry"><option value="">Todos</option><option value="EXPIRED" ${expiry==='EXPIRED'?'selected':''}>Vencidos</option><option value="SOON" ${expiry==='SOON'?'selected':''}>Vencen en 30 días</option><option value="NO_EXPIRY" ${expiry==='NO_EXPIRY'?'selected':''}>Sin vencimiento</option></select></label><button class="button secondary filter-clear" id="doc-filter-clear">Limpiar</button></div>${rows?`<div class="table-wrap"><table><thead><tr><th>Titular</th><th>Documento</th><th>Estado</th><th>Emisión / carga</th><th>Vence</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay documentos que coincidan con los filtros.')}${manageablePeople.length&&types.length?`<div class="section-divider"></div><form id="doc-form" class="form-grid two"><label>Titular<select id="doc-person" required>${optionList(manageablePeople,'personId',p=>p.displayName,manageablePeople.length===1?manageablePeople[0].personId:'',false)}</select></label><label>Tipo<select id="doc-type" required>${optionList(types,'documentTypeId',t=>t.name,'',false)}</select></label><label>Fecha emisión<input id="doc-issue" type="date"></label><label>Fecha vencimiento<input id="doc-expiry" type="date"></label><label class="full">Archivo<input id="doc-file" type="file" accept=".pdf,image/png,image/jpeg,image/webp" required></label><div><button class="button primary" type="submit">Subir documento</button></div></form>`:''}${currentAccessProfile_().isAdmin?`<div class="section-divider"></div><form id="doctype-form" class="form-grid two"><label>Nuevo tipo<input id="doctype-name" required maxlength="120"></label><label>Descripción<input id="doctype-description" maxlength="500"></label><label class="check-row"><input id="doctype-expiry" type="checkbox"> Puede tener vencimiento</label><div><button class="button secondary" type="submit">Crear tipo</button></div></form>`:''}<div id="message" class="message"></div></section>`,'documents');
    const apply=()=>{saveUiStatePatch_({documentFilters:{q:val('doc-filter-q'),personId:val('doc-filter-person'),typeId:val('doc-filter-type'),status:val('doc-filter-status'),expiry:val('doc-filter-expiry')}});renderDocuments();};['doc-filter-person','doc-filter-type','doc-filter-status','doc-filter-expiry'].forEach(id=>document.getElementById(id)?.addEventListener('change',apply));document.getElementById('doc-filter-q')?.addEventListener('change',apply);document.getElementById('doc-filter-q')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply();}});document.getElementById('doc-filter-clear')?.addEventListener('click',()=>{saveUiStatePatch_({documentFilters:{}});renderDocuments();});
    const form=document.getElementById('doc-form');if(form)form.onsubmit=async e=>{e.preventDefault();const f=document.getElementById('doc-file').files?.[0];if(!f)return;if(f.size>4500000)return showMessage('El archivo supera 4,5 MB.','error');const localBusy=beginUiBusy_('Leyendo documento…');try{const dataUrl=await fileToDataUrl(f);endUiBusy_(localBusy);await call('uploadDocument',{personId:val('doc-person'),documentTypeId:val('doc-type'),issueDate:val('doc-issue'),expiryDate:val('doc-expiry'),originalName:f.name,fileDataUrl:dataUrl});showToast_('Documento subido.');await renderDocuments();}catch(err){endUiBusy_(localBusy);showMessage(err.message,'error');}};
    const tf=document.getElementById('doctype-form');if(tf)tf.onsubmit=async e=>{e.preventDefault();try{await call('saveDocumentType',{name:val('doctype-name'),description:val('doctype-description'),hasExpiry:document.getElementById('doctype-expiry').checked,status:'ACTIVE'});await renderDocuments();}catch(err){showMessage(err.message,'error');}};
    document.querySelectorAll('[data-view-doc]').forEach(b=>b.onclick=async()=>{try{const {data:file}=await call('getDocumentFile',{documentId:b.dataset.viewDoc});const w=window.open();if(w)w.document.write(`<iframe src="${file.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`);else showMessage('El navegador bloqueó la ventana emergente.','error');}catch(err){showMessage(err.message,'error');}});document.querySelectorAll('[data-approve-doc]').forEach(b=>b.onclick=()=>reviewDocUi(b.dataset.approveDoc,'APPROVED'));document.querySelectorAll('[data-reject-doc]').forEach(b=>b.onclick=()=>reviewDocUi(b.dataset.rejectDoc,'REJECTED'));
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudo cargar documentación</h1><p>${escapeHtml(err.message)}</p></section>`,'documents');}
}
async function reviewDocUi(id,status){try{const notes=status==='REJECTED'?(prompt('Motivo del rechazo:')||''):'';await call('reviewDocument',{documentId:id,status,reviewNotes:notes});await renderDocuments();}catch(err){showMessage(err.message,'error');}}

async function openUserPerson_(personId){
  if(!personId)return;
  structureSection='people';
  await renderStructure('people');
  await openPersonProfile_(personId,'access');
}

async function renderUsers(preselectedPersonId=''){
  if(!currentAccessProfile_().capabilities?.manageUsers) return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>Solo un administrador puede gestionar cuentas de usuario.</p></section>','users');
  try{
    const {data}=await call('getUsersData'); const people=data.persons||[], users=data.users||[], roles=data.securityRoles||[], personAccessRoles=data.personAccessRoles||{};
    const st=loadUiState_().userFilters||{}, q=textNorm_(st.q||''), status=st.status||'', role=st.role||'';
    const filtered=users.filter(u=>(!q||textNorm_([u.email,personNameById(people,u.personId),(u.accessLabels||[]).join(' ')].join(' ')).includes(q))&&(!status||u.status===status)&&(!role||u.securityRole===role));
    const rows=filtered.map(u=>{const personName=personNameById(people,u.personId),systemPermission=u.securityRole==='ADMIN'?'Administrador':'Acceso por Persona',labels=(u.accessLabels||[]).filter(x=>!/^Administrador/.test(x));return `<tr><td><strong>${escapeHtml(u.email)}</strong><small>${escapeHtml(personName)}</small>${u.personId?`<button class="button mini link" data-user-person="${escapeHtml(u.personId)}">Ver persona</button>`:''}</td><td><strong>${escapeHtml(systemPermission)}</strong><small>${escapeHtml(labels.join(' · ')||'Sin cargos/relaciones con acceso')}</small></td><td>${statusBadge(u.status)}</td><td>${escapeHtml(u.lastLoginAt||'Nunca')}</td><td><div class="button-row"><button class="button mini secondary" data-reset-user="${u.userId}">Reset</button><button class="button mini secondary" data-toggle-user="${u.userId}" data-status="${u.status}" data-role="${u.securityRole}">${u.status==='ACTIVE'?'Desactivar':'Activar'}</button><button class="button mini secondary" data-admin-user="${u.userId}" data-status="${u.status}" data-role="${u.securityRole}">${u.securityRole==='ADMIN'?'Quitar Admin':'Hacer Admin'}</button></div></td></tr>`;}).join('');
    shell(`<section class="hero compact"><span class="eyebrow">Accesos</span><h1>Usuarios y permisos</h1><p>La cuenta se vincula a una Persona. ADMIN es el único permiso global; el resto de accesos se calcula por cargos, divisiones, tutorías y actividades asignadas.</p></section>
    <section class="panel"><div class="panel-heading"><div><h2>Cuentas</h2></div></div><div class="filter-bar"><label class="filter-grow">Buscar<input id="user-filter-q" placeholder="Nombre, correo o acceso" value="${escapeHtml(st.q||'')}"></label><label>Permiso<select id="user-filter-role"><option value="">Todos</option>${roles.map(r=>`<option value="${r}" ${role===r?'selected':''}>${escapeHtml(r==='ADMIN'?'Administrador':'Acceso por Persona')}</option>`).join('')}</select></label><label>Estado<select id="user-filter-status"><option value="">Todos</option><option value="ACTIVE" ${status==='ACTIVE'?'selected':''}>Activos</option><option value="DISABLED" ${status==='DISABLED'?'selected':''}>Desactivados</option><option value="LOCKED" ${status==='LOCKED'?'selected':''}>Bloqueados</option></select></label><button class="button secondary filter-clear" id="user-filter-clear">Limpiar</button></div><p class="filter-count">${filtered.length} de ${users.length} usuarios</p>${filtered.length?`<div class="table-wrap"><table><thead><tr><th>Usuario / Persona</th><th>Permiso y accesos efectivos</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay usuarios que coincidan con los filtros.')}
    <form id="user-form" class="form-grid two" style="margin-top:1rem">
      <label>Persona<select id="user-person" required>${optionList(people,'personId',p=>p.displayName,preselectedPersonId||'',false)}</select></label><label>Correo<input id="user-email" type="email" required></label><label>Cargos / relaciones<input id="user-derived-roles" readonly placeholder="Se deriva de la Persona"></label>
      <label>Permiso del sistema<select id="user-security-role"><option value="MEMBER">Acceso por Persona</option><option value="ADMIN">Administrador global</option></select></label>
      <label>Contraseña temporal<input id="user-password" type="password" minlength="10" required></label>
      <div><button class="button primary" type="submit">Crear usuario</button></div>
    </form><div id="message" class="message"></div></section>`,'users');
    const applyFilters=()=>{saveUiStatePatch_({userFilters:{q:val('user-filter-q'),role:val('user-filter-role'),status:val('user-filter-status')}});renderUsers();};
    document.getElementById('user-filter-q').onchange=applyFilters;document.getElementById('user-filter-q').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyFilters();}};document.getElementById('user-filter-role').onchange=applyFilters;document.getElementById('user-filter-status').onchange=applyFilters;document.getElementById('user-filter-clear').onclick=()=>{saveUiStatePatch_({userFilters:{}});renderUsers();};
    const syncUserPerson=()=>{const pid=val('user-person'),p=people.find(x=>x.personId===pid);if(p&&p.email)document.getElementById('user-email').value=p.email;const rs=personAccessRoles[pid]||[];const el=document.getElementById('user-derived-roles');if(el)el.value=rs.length?rs.map(roleDisplayName).join(' · '):'Solo datos/documentación propia';};document.getElementById('user-person').onchange=syncUserPerson;syncUserPerson();
    document.getElementById('user-form').onsubmit=async e=>{e.preventDefault();try{await call('createUser',{personId:val('user-person'),email:val('user-email'),securityRole:val('user-security-role'),temporaryPassword:val('user-password')});await renderUsers();}catch(err){showMessage(err.message,'error');}};
    document.querySelectorAll('[data-user-person]').forEach(b=>b.onclick=()=>openUserPerson_(b.dataset.userPerson));
    document.querySelectorAll('[data-reset-user]').forEach(b=>b.onclick=async()=>{const pwd=prompt('Nueva contraseña temporal (mínimo 10 caracteres):');if(!pwd)return;try{await call('resetUserPassword',{userId:b.dataset.resetUser,temporaryPassword:pwd});showMessage('Contraseña restablecida.','success');}catch(err){showMessage(err.message,'error');}});
    document.querySelectorAll('[data-toggle-user]').forEach(b=>b.onclick=async()=>{try{await call('updateUserAccess',{userId:b.dataset.toggleUser,status:b.dataset.status==='ACTIVE'?'DISABLED':'ACTIVE',securityRole:b.dataset.role});await renderUsers();}catch(err){showMessage(err.message,'error');}});
    document.querySelectorAll('[data-admin-user]').forEach(b=>b.onclick=async()=>{const next=b.dataset.role==='ADMIN'?'MEMBER':'ADMIN';try{await call('updateUserAccess',{userId:b.dataset.adminUser,status:b.dataset.status==='ACTIVE'?'ACTIVE':'DISABLED',securityRole:next});await renderUsers();}catch(err){showMessage(err.message,'error');}});
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudieron cargar usuarios</h1><p>${escapeHtml(err.message)}</p></section>`,'users');}
}


let calendarData=null;
let calendarCursor=new Date();
let calendarView='month';
let calendarViewTouched=false;
let leagueImportPreferredCompetitionId='';

function isoLocalDate(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function eventTypeLabel(t){return t==='TRAINING'?'Entrenamiento':t==='REST'?'Descanso':t==='RECOVERY'?'Jornada de recuperación':'Partido';}
function displayEventTime_(e){const t=String(e?.startTime||'').trim();return !t||t==='00:00'?'':t;}
function eventSortTime_(e){const t=displayEventTime_(e);return /^\d{2}:\d{2}$/.test(t)?t:'99:99';}
function sortCalendarEvents_(rows){return (rows||[]).slice().sort((a,b)=>String(a.eventDate||'').localeCompare(String(b.eventDate||''))||eventSortTime_(a).localeCompare(eventSortTime_(b))||String(a.title||'').localeCompare(String(b.title||''),'es'));}
function eventVisualClass_(e){return e.eventType==='MATCH'?'match':e.eventType==='REST'?'rest':e.eventType==='RECOVERY'?'recovery':'training';}
function divisionColorForEvent_(e){const d=(calendarData?.divisions||[]).find(x=>x.divisionId===e.divisionId);return d?.color||'#64748B';}
function normalizeHexColor_(value){const v=String(value||'').trim().toUpperCase();return /^#[0-9A-F]{6}$/.test(v)?v:'#64748B';}
function mixHexColor_(base,target,amount){
  const a=normalizeHexColor_(base),b=normalizeHexColor_(target);const t=Math.max(0,Math.min(1,amount));
  const c=x=>parseInt(x,16),h=n=>Math.round(n).toString(16).padStart(2,'0');
  const ar=[c(a.slice(1,3)),c(a.slice(3,5)),c(a.slice(5,7))],br=[c(b.slice(1,3)),c(b.slice(3,5)),c(b.slice(5,7))];
  return '#'+h(ar[0]+(br[0]-ar[0])*t)+h(ar[1]+(br[1]-ar[1])*t)+h(ar[2]+(br[2]-ar[2])*t);
}
function divisionColorVariants_(base){const c=normalizeHexColor_(base);return {strong:mixHexColor_(c,'#000000',.12),medium:mixHexColor_(c,'#FFFFFF',.46),light:mixHexColor_(c,'#FFFFFF',.82)};}
function divisionEventStyle_(e){const base=divisionColorForEvent_(e),v=divisionColorVariants_(base);return `--division-color:${escapeHtml(base)};--division-strong:${escapeHtml(v.strong)};--division-medium:${escapeHtml(v.medium)};--division-light:${escapeHtml(v.light)}`;}
function teamPatternForEvent_(e){if(e.eventType==='TRAINING'||!e.teamId)return 'SOLID';const t=(calendarData?.teams||[]).find(x=>x.teamId===e.teamId);return t?.displayPattern||'SOLID';}
function teamPatternClass_(e){const p=teamPatternForEvent_(e);return p==='STRIPED'?'team-pattern-striped':p==='DOTTED'?'team-pattern-dotted':'team-pattern-solid';}
function eventStatusLabel(s){return ({PENDING:'Pendiente',SCHEDULED:'Programado',COMPLETED:'Finalizado',CANCELLED:'Cancelado',POSTPONED:'Postergado'})[s]||s;}
function competitionTypeLabelClient_(t){return ({LEAGUE:'Liga',CUP:'Copa',TOURNAMENT:'Torneo',FRIENDLY:'Amistoso',OTHER:'Otro'})[t]||t||'Liga';}
function competitionDisplayNameClient_(c){return [c?.name,c?.phase].filter(Boolean).join(' · ');}
function competitionForEvent_(e){return (calendarData?.competitions||[]).find(c=>c.competitionId===e?.competitionId)||null;}
function usableExternalUrl_(url){const v=String(url||'').trim();return /^https?:\/\/[^\s]+$/i.test(v)?v:'';}
function externalLinkButton_(url,label,variant='secondary'){const safe=usableExternalUrl_(url);return safe?`<a class="button ${variant}" href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`:'';}
function competitionLinkButtons_(competition,event=null){
  const c=competition||{};const links=[];
  if(c.federationPageUrl)links.push(externalLinkButton_(c.federationPageUrl,c.federationName||'Federación'));
  if(c.calendarUrl)links.push(externalLinkButton_(c.calendarUrl,'Calendario'));
  if(c.matchCenterUrl)links.push(externalLinkButton_(c.matchCenterUrl,'Partidos / actas'));
  if(event?.officialMatchUrl)links.push(externalLinkButton_(event.officialMatchUrl,'Partido oficial'));
  if(event?.officialReportUrl)links.push(externalLinkButton_(event.officialReportUrl,'Acta oficial','primary'));
  return links.filter(Boolean).join('');
}
function calendarEventLine(e){const time=displayEventTime_(e),tm=time?` · ${escapeHtml(time)}`:'';const opp=e.eventType==='MATCH'&&e.opponent?` · vs ${escapeHtml(e.opponent)}`:'';return `<button class="calendar-event ${eventVisualClass_(e)} ${teamPatternClass_(e)} status-${String(e.status||'').toLowerCase()}" style="${divisionEventStyle_(e)}" data-open-event="${e.eventId}"><strong>${escapeHtml(e.title||eventTypeLabel(e.eventType))}</strong><small>${tm}${opp}</small></button>`;}

function renderMonthGrid(events){
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth(); const first=new Date(y,m,1), last=new Date(y,m+1,0); let start=(first.getDay()+6)%7;
  const by={};events.forEach(e=>(by[e.eventDate]||(by[e.eventDate]=[])).push(e));Object.keys(by).forEach(k=>by[k]=sortCalendarEvents_(by[k]));
  const heads=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(x=>`<div class="cal-head">${x}</div>`).join(''); let cells='';
  for(let i=0;i<start;i++)cells+='<div class="cal-cell muted"></div>';
  for(let d=1;d<=last.getDate();d++){const key=isoLocalDate(new Date(y,m,d));const today=key===isoLocalDate(new Date());cells+=`<div class="cal-cell ${today?'today':''}"><div class="cal-day">${d}</div>${(by[key]||[]).map(calendarEventLine).join('')}</div>`;}
  return `<div class="calendar-grid">${heads}${cells}</div>`;
}
function startOfWeek(d){const x=new Date(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);x.setHours(0,0,0,0);return x;}
function renderWeekGrid(events){const start=startOfWeek(calendarCursor),days=[];for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);days.push(d);}const by={};events.forEach(e=>(by[e.eventDate]||(by[e.eventDate]=[])).push(e));Object.keys(by).forEach(k=>by[k]=sortCalendarEvents_(by[k]));return `<div class="week-grid">${days.map(d=>{const key=isoLocalDate(d);return `<div class="week-day"><h3>${d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'})}</h3>${(by[key]||[]).length?(by[key]||[]).map(calendarEventLine).join(''):emptyTable('Sin actividad')}</div>`}).join('')}</div>`;}
function renderAgenda(events){
  const sorted=sortCalendarEvents_(events);
  if(!sorted.length) return emptyTable('Sin actividades para los filtros seleccionados.');
  const groups={}; sorted.forEach(e=>(groups[e.eventDate]||(groups[e.eventDate]=[])).push(e));
  return `<div class="agenda-list">${Object.keys(groups).sort().map(date=>{
    const d=new Date(date+'T12:00:00'); const label=d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
    return `<section class="agenda-day"><h3>${escapeHtml(label)}</h3>${groups[date].map(e=>`<button class="agenda-event ${eventVisualClass_(e)} ${teamPatternClass_(e)} status-${String(e.status||'').toLowerCase()}" style="${divisionEventStyle_(e)}" data-open-event="${e.eventId}"><span class="agenda-time">${escapeHtml(displayEventTime_(e)||'—')}</span><span class="agenda-main"><strong>${escapeHtml(e.title||eventTypeLabel(e.eventType))}</strong><small>${escapeHtml(e.eventType==='MATCH'&&e.opponent?'vs '+e.opponent:e.eventType==='REST'?'Fecha de liga sin adversario':e.eventType==='RECOVERY'?'Jornada federativa de recuperación':(e.location||eventTypeLabel(e.eventType)))}</small></span><span class="agenda-chevron">›</span></button>`).join('')}</section>`;
  }).join('')}</div>`;
}



function statsNumber_(value){return Number(value||0).toLocaleString('es-ES');}
function statisticsResultLabel_(m){const pf=Number(m.resultFor||0),pa=Number(m.resultAgainst||0);return pf>pa?'Victoria':pf<pa?'Derrota':'Empate';}
async function renderStatistics(filters={}){
  try{
    const previous=loadUiState_().statisticsFilters||{};const requested=Object.assign({},Object.keys(filters||{}).length?filters:previous,{seasonId:selectedSeasonId_()});const {data}=await call('getStatisticsData',requested);statisticsData=data;const divMap=Object.fromEntries((data.divisions||[]).map(x=>[x.divisionId,x])),teamMap=Object.fromEntries((data.teams||[]).map(x=>[x.teamId,x]));const f=data.filters||{},summary=data.summary||{};
    const divisionOptions=`<option value="">Todas</option>`+(data.divisions||[]).filter(x=>x.status==='ACTIVE'||x.divisionId===f.divisionId).map(x=>`<option value="${escapeHtml(x.divisionId)}" ${x.divisionId===f.divisionId?'selected':''}>${escapeHtml(x.name)}</option>`).join(''),scopedTeams=(data.teams||[]).filter(x=>!f.divisionId||x.divisionId===f.divisionId),teamOptions=`<option value="">Todos</option>`+scopedTeams.map(x=>`<option value="${escapeHtml(x.teamId)}" ${x.teamId===f.teamId?'selected':''}>${escapeHtml(x.name)}</option>`).join('');
    const playerRows=(data.players||[]).map((p,i)=>`<tr><td><span class="rank-number">${i+1}</span></td><td><strong>${escapeHtml(p.playerName)}</strong>${p.licenseNumber?`<small>Lic. ${escapeHtml(p.licenseNumber)}</small>`:''}</td><td>${p.matches}</td><td>${p.starts}</td><td>${p.bench}</td><td>${statsNumber_(p.minutes)}<small>${statsNumber_(p.availableMinutes)} disp. · ${statsNumber_(p.participationPct)}%</small></td><td><strong>${p.points}</strong><small>${statsNumber_(p.pointsPerMatch)}/PJ</small></td><td>${p.tries}</td><td>${p.conversions}</td><td>${p.penalties}</td><td>${p.drops}</td><td>${p.yellowCards}</td><td>${p.redCards}</td><td>${p.captaincies}</td></tr>`).join('');
    const breakdownRows=(data.breakdown||[]).map(b=>`<tr><td>${escapeHtml(b.divisionName)}</td><td>${escapeHtml(b.teamName)}</td><td>${b.matches}</td><td>${b.wins}-${b.draws}-${b.losses}</td><td>${statsNumber_(b.winRate)}%</td><td>${b.pointsFor}</td><td>${b.pointsAgainst}</td><td>${b.difference>0?'+':''}${b.difference}</td></tr>`).join('');
    const matchRows=(data.recentMatches||[]).map(m=>`<tr data-stats-event="${escapeHtml(m.eventId)}" data-stats-season="${escapeHtml(m.seasonId||'')}" class="clickable-row"><td>${escapeHtml(m.eventDate)}</td><td>${escapeHtml((divMap[m.divisionId]||{}).name||'—')}</td><td>${escapeHtml((teamMap[m.teamId]||{}).name||'—')}</td><td>${escapeHtml(m.condition==='HOME'?'Local':m.condition==='AWAY'?'Visitante':'—')}</td><td><strong>${escapeHtml(m.opponent||'—')}</strong>${m.calendarCategory?`<small><strong>${escapeHtml(m.calendarCategory)}</strong></small>`:''}<small>${escapeHtml([m.calendarCompetition||m.competition,m.roundName].filter(Boolean).join(' · '))}</small></td><td><strong>${escapeHtml(m.resultFor||'0')} - ${escapeHtml(m.resultAgainst||'0')}</strong></td><td>${statisticsResultLabel_(m)}</td></tr>`).join('');
    shell(`<section class="hero compact"><span class="eyebrow">Rendimiento</span><h1>Estadísticas</h1><p>Rendimiento individual, por división/equipo y por partido.</p></section><section class="panel stats-filter-panel"><div class="form-grid three"><label>División<select id="stats-division">${divisionOptions}</select></label><label>Equipo<select id="stats-team">${teamOptions}</select></label><label>Desde<input id="stats-from" type="date" value="${escapeHtml(f.fromDate||'')}"></label><label>Hasta<input id="stats-to" type="date" value="${escapeHtml(f.toDate||'')}"></label><label>Condición<select id="stats-condition"><option value="">Local y visitante</option><option value="HOME" ${f.condition==='HOME'?'selected':''}>Local</option><option value="AWAY" ${f.condition==='AWAY'?'selected':''}>Visitante</option></select></label><label>Competición<select id="stats-competition"><option value="">Todas</option>${(data.competitions||[]).map(x=>`<option value="${escapeHtml(x)}" ${f.competition===x?'selected':''}>${escapeHtml(x)}</option>`).join('')}</select></label><label class="filter-grow">Rival<input id="stats-opponent" value="${escapeHtml(f.opponent||'')}" placeholder="Buscar rival"></label><div><button class="button secondary" id="stats-clear">Limpiar filtros</button></div></div></section><section class="stats-summary-grid"><article class="metric-card"><span>Partidos</span><strong>${statsNumber_(summary.matches)}</strong><small>${summary.wins||0} V · ${summary.draws||0} E · ${summary.losses||0} D · ${statsNumber_(summary.winRate)}%</small></article><article class="metric-card"><span>Puntos</span><strong>${summary.pointsFor||0} : ${summary.pointsAgainst||0}</strong><small>${statsNumber_(summary.pointsForPerMatch)} PF/PJ · ${statsNumber_(summary.pointsAgainstPerMatch)} PC/PJ</small></article><article class="metric-card"><span>Jugadores</span><strong>${statsNumber_(summary.players)}</strong><small>${statsNumber_(summary.totalMinutes)} min acumulados</small></article><article class="metric-card"><span>Disciplina</span><strong>${summary.yellowCards||0} 🟨 · ${summary.redCards||0} 🟥</strong><small>Actas consolidadas</small></article></section><section class="panel"><div class="panel-heading"><div><h2>División / equipo</h2><p>Resumen comparativo dentro del filtro actual.</p></div></div>${breakdownRows?`<div class="table-wrap"><table><thead><tr><th>División</th><th>Equipo</th><th>PJ</th><th>V-E-D</th><th>% V</th><th>PF</th><th>PC</th><th>Dif.</th></tr></thead><tbody>${breakdownRows}</tbody></table></div>`:emptyTable('No hay datos agregados para este filtro.')}</section><section class="panel"><div class="panel-heading"><div><h2>Estadísticas individuales</h2><p>Incluye promedios, formas de anotación, disciplina y capitanías.</p></div></div>${playerRows?`<div class="table-wrap"><table class="stats-table"><thead><tr><th>#</th><th>Jugador</th><th>PJ</th><th>Tit.</th><th>Sup.</th><th>Min.</th><th>Pts.</th><th>Ens.</th><th>Transf.</th><th>Pen.</th><th>Drop</th><th>🟨</th><th>🟥</th><th>Cap.</th></tr></thead><tbody>${playerRows}</tbody></table></div>`:emptyTable('Todavía no hay estadísticas oficiales para este filtro.')}</section><section class="panel"><div class="panel-heading"><div><h2>Partidos</h2><p>Hasta 50 partidos incluidos en el cálculo.</p></div></div>${matchRows?`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>División</th><th>Equipo</th><th>Condición</th><th>Rival / competición</th><th>Resultado</th><th></th></tr></thead><tbody>${matchRows}</tbody></table></div>`:emptyTable('No hay partidos finalizados en este filtro.')}</section>`,'statistics');
    const collect=()=>({seasonId:selectedSeasonId_(),divisionId:val('stats-division'),teamId:val('stats-team'),fromDate:val('stats-from'),toDate:val('stats-to'),condition:val('stats-condition'),competition:val('stats-competition'),opponent:val('stats-opponent')});const reload=()=>{const next=collect();saveUiStatePatch_({statisticsFilters:next});renderStatistics(next);};['stats-team','stats-from','stats-to','stats-condition','stats-competition'].forEach(id=>document.getElementById(id).onchange=reload);document.getElementById('stats-division').onchange=()=>{const next=collect();next.teamId='';saveUiStatePatch_({statisticsFilters:next});renderStatistics(next);};document.getElementById('stats-opponent').addEventListener('change',reload);document.getElementById('stats-opponent').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();reload();}});document.getElementById('stats-clear').onclick=()=>{saveUiStatePatch_({statisticsFilters:{seasonId:selectedSeasonId_()}});renderStatistics({seasonId:selectedSeasonId_()});};document.querySelectorAll('[data-stats-event]').forEach(row=>row.onclick=()=>renderEventDetail(row.dataset.statsEvent));
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudieron cargar las estadísticas</h1><p>${escapeHtml(err.message)}</p><button class="button primary" id="stats-retry">Reintentar</button></section>`,'statistics');document.getElementById('stats-retry')?.addEventListener('click',()=>renderStatistics());}
}

async function renderCalendar(){
  const state=loadUiState_().calendarFilters||{};
  try{const {data}=await call('getCalendarData',{seasonId:selectedSeasonId_()});calendarData=data;}catch(err){return shell(`<section class="panel narrow"><h1>No se pudo cargar calendario</h1><p>${escapeHtml(err.message)}</p></section>`,'calendar');}
  const d=calendarData;
  if(!calendarViewTouched&&loadUiState_().calendarView)calendarView=loadUiState_().calendarView;
  const monthLabel=calendarCursor.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  const reportSet=new Set(d.matchReportEventIds||[]);
  const renderCurrentCalendar=(events)=>calendarView==='month'?renderMonthGrid(events):calendarView==='week'?renderWeekGrid(events):renderAgenda(events);
  shell(`<section class="hero compact"><span class="eyebrow">Actividad deportiva</span><h1>Calendario</h1><p>Entrenamientos y partidos en una única vista.</p></section>
  <section class="panel"><div class="calendar-toolbar"><div class="button-row"><button class="button secondary" id="cal-prev">‹</button><button class="button secondary" id="cal-today">Hoy</button><button class="button secondary" id="cal-next">›</button></div><h2>${escapeHtml(monthLabel)}</h2><div class="button-row"><button class="button ${calendarView==='agenda'?'primary':'secondary'}" id="cal-agenda">Agenda</button><button class="button ${calendarView==='month'?'primary':'secondary'}" id="cal-month">Mes</button><button class="button ${calendarView==='week'?'primary':'secondary'}" id="cal-week">Semana</button>${d.canManageCompetitions?'<button class="button secondary" id="manage-competitions">Actualizar desde WEB</button>':''}${d.canImportLeague?'<button class="button secondary" id="manual-load">Carga manual</button>':''}${d.canCreate?'<button class="button primary" id="new-event">Nueva actividad</button>':''}</div></div>
  <div class="filter-bar calendar-filters"><label>División<select id="cal-filter-division"><option value="">Todas las divisiones</option>${(d.divisions||[]).map(x=>`<option value="${escapeHtml(x.divisionId)}" ${state.divisionId===x.divisionId?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}</select></label><label id="cal-filter-team-wrap">Equipo<select id="cal-filter-team"><option value="">Todos los equipos</option></select></label><label>Competición<select id="cal-filter-competition"><option value="">Todas las competiciones</option>${(d.competitions||[]).filter(c=>c.status==='ACTIVE'||state.competitionId===c.competitionId).map(c=>`<option value="${escapeHtml(c.competitionId)}" ${state.competitionId===c.competitionId?'selected':''}>${escapeHtml(competitionDisplayNameClient_(c))}</option>`).join('')}</select></label><label>Tipo<select id="cal-filter-type"><option value="">Todos</option><option value="TRAINING" ${state.type==='TRAINING'?'selected':''}>Entrenamientos</option><option value="MATCH" ${state.type==='MATCH'?'selected':''}>Partidos</option><option value="REST" ${state.type==='REST'?'selected':''}>Descansos</option><option value="RECOVERY" ${state.type==='RECOVERY'?'selected':''}>Jornadas de recuperación</option></select></label><label>Estado<select id="cal-filter-status"><option value="">Todos</option>${['PENDING','SCHEDULED','COMPLETED','POSTPONED','CANCELLED'].map(x=>`<option value="${x}" ${state.status===x?'selected':''}>${escapeHtml(eventStatusLabel(x))}</option>`).join('')}</select></label><label>Acta<select id="cal-filter-report"><option value="">Todas</option><option value="WITH" ${state.report==='WITH'?'selected':''}>Con acta</option><option value="WITHOUT" ${state.report==='WITHOUT'?'selected':''}>Sin acta</option></select></label><label class="filter-grow">Rival / título<input id="cal-filter-q" value="${escapeHtml(state.q||'')}" placeholder="Buscar partido o rival"></label><button class="button secondary filter-clear" id="cal-filter-clear">Limpiar</button></div>
  <div id="calendar-host"></div><div id="message" class="message"></div></section>`,'calendar');
  const move=n=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+(calendarView==='month'?n:0),calendarCursor.getDate()+((calendarView==='week'||calendarView==='agenda')?7*n:0));renderCalendar();};
  document.getElementById('cal-prev').onclick=()=>move(-1);document.getElementById('cal-next').onclick=()=>move(1);document.getElementById('cal-today').onclick=()=>{calendarCursor=new Date();renderCalendar();};
  document.getElementById('cal-agenda').onclick=()=>{calendarViewTouched=true;calendarView='agenda';saveUiStatePatch_({calendarView});renderCalendar();};document.getElementById('cal-month').onclick=()=>{calendarViewTouched=true;calendarView='month';saveUiStatePatch_({calendarView});renderCalendar();};document.getElementById('cal-week').onclick=()=>{calendarViewTouched=true;calendarView='week';saveUiStatePatch_({calendarView});renderCalendar();};
  const cb=document.getElementById('manage-competitions');if(cb)cb.onclick=renderCompetitions;const ml=document.getElementById('manual-load');if(ml)ml.onclick=renderManualLoad_;const nb=document.getElementById('new-event');if(nb)nb.onclick=()=>renderEventEditor();
  const teamWrap=document.getElementById('cal-filter-team-wrap'),teamSelect=document.getElementById('cal-filter-team');
  const syncCalendarTeams=()=>{const div=val('cal-filter-division');const teams=div?(d.teams||[]).filter(t=>t.divisionId===div):[];teamWrap.hidden=!div;teamSelect.innerHTML='<option value="">Todos los equipos</option>'+teams.map(t=>`<option value="${escapeHtml(t.teamId)}" ${state.teamId===t.teamId?'selected':''}>${escapeHtml(t.name)}</option>`).join('');if(!div)teamSelect.value='';};
  const applyFilters=()=>{const f={divisionId:val('cal-filter-division'),teamId:val('cal-filter-team'),competitionId:val('cal-filter-competition'),type:val('cal-filter-type'),status:val('cal-filter-status'),report:val('cal-filter-report'),q:val('cal-filter-q')};saveUiStatePatch_({calendarFilters:f});const q=textNorm_(f.q);const filtered=d.events.filter(e=>(!f.divisionId||e.divisionId===f.divisionId)&&(!f.teamId||e.teamId===f.teamId||(e.eventType==='TRAINING'&&e.divisionId===f.divisionId&&!e.teamId))&&(!f.competitionId||e.competitionId===f.competitionId)&&(!f.type||e.eventType===f.type)&&(!f.status||e.status===f.status)&&(!f.report||(f.report==='WITH'?reportSet.has(e.eventId):!reportSet.has(e.eventId)))&&(!q||textNorm_([e.title,e.opponent,e.competition,e.location].join(' ')).includes(q)));document.getElementById('calendar-host').innerHTML=renderCurrentCalendar(filtered);document.querySelectorAll('[data-open-event]').forEach(b=>b.onclick=()=>renderEventDetail(b.dataset.openEvent));};
  syncCalendarTeams();applyFilters();
  document.getElementById('cal-filter-division').onchange=()=>{state.teamId='';syncCalendarTeams();applyFilters();};teamSelect.onchange=applyFilters;document.getElementById('cal-filter-competition').onchange=applyFilters;document.getElementById('cal-filter-type').onchange=applyFilters;document.getElementById('cal-filter-status').onchange=applyFilters;document.getElementById('cal-filter-report').onchange=applyFilters;document.getElementById('cal-filter-q').onchange=applyFilters;document.getElementById('cal-filter-q').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyFilters();}};document.getElementById('cal-filter-clear').onclick=()=>{saveUiStatePatch_({calendarFilters:{}});renderCalendar();};
}

function competitionExternalAuthHtml_(access){
  const a=access||{};
  if(a.status!=='REQUIRED')return '';
  const authorize=a.canAuthorize?'<button class="button primary" type="button" id="competition-authorize-external">Autorizar conexión FAR</button>':'';
  const text=a.canAuthorize?'Esta versión necesita un permiso nuevo de Google Apps Script para consultar FAR / MatchReady. Se autoriza una sola vez con la cuenta que publicó el Web App.':'La conexión FAR está pendiente de autorización por el administrador que publicó Apps Script.';
  return `<div class="info-strip external-auth-warning"><div><strong>Falta autorizar la conexión con FAR</strong><br>${escapeHtml(text)}</div><div class="button-row">${authorize}<button class="button secondary" type="button" id="competition-auth-recheck">Comprobar autorización</button></div></div>`;
}
function wireCompetitionExternalAuth_(access,refresh){
  const a=access||{};
  const authorize=document.getElementById('competition-authorize-external');
  if(authorize)authorize.onclick=()=>{if(!a.authorizationUrl)return showMessage('No se pudo obtener la URL de autorización. Ejecutá authorizeExternalRequests desde Apps Script una vez.','error');const popup=window.open(a.authorizationUrl,'_blank');if(popup)popup.opener=null;else return showMessage('El navegador bloqueó la ventana de autorización. Permití ventanas emergentes y volvé a intentarlo.','error');showMessage('Google abrió la autorización en otra pestaña. Aceptá el permiso y después pulsá “Comprobar autorización”.','success');};
  const recheck=document.getElementById('competition-auth-recheck');
  if(recheck)recheck.onclick=()=>Promise.resolve(refresh?refresh():renderCompetitions());
}

async function syncCompetitionAndReports_(competitionId){
  const {data:sync}=await call('syncCompetitionFromWeb',{competitionId});
  calendarData=null;
  let reportSummary={downloaded:0,parsed:0,applied:0,needsReview:0,failed:0,remaining:0};
  let guard=0,remaining=1;
  while(remaining>0&&guard<10){
    guard++;
    const {data:batch}=await call('processCompetitionOfficialReports',{competitionId,limit:2});
    reportSummary.downloaded+=(batch.downloaded||0);reportSummary.parsed+=(batch.parsed||0);reportSummary.applied+=(batch.applied||0);reportSummary.needsReview+=(batch.needsReview||0);reportSummary.failed+=(batch.failed||0);remaining=batch.remaining||0;reportSummary.remaining=remaining;
    if(!(batch.downloaded||batch.failed)||batch.failed>0&&batch.downloaded===0)break;
  }
  return {sync,reportSummary};
}

async function renderCompetitions(){
  try{
    const {data}=await call('getCompetitionsData',{seasonId:selectedSeasonId_()});
    const divMap=Object.fromEntries((data.divisions||[]).map(x=>[x.divisionId,x]));
    const teamMap=Object.fromEntries((data.teams||[]).map(x=>[x.teamId,x]));
    const externalAccess=data.externalAccess||{};
    const externalAuthHtml=competitionExternalAuthHtml_(externalAccess);
    const rows=(data.competitions||[]).map(c=>{
      const links=competitionLinkButtons_(c)||'<span class="muted-text">Sin enlaces</span>';
      const webSync=String(c.calendarUrl||'').includes('farugby.matchready.es');
      const syncState=c.lastSyncStatus==='OK'?`<span class="status-pill success">Sincronizada</span>`:c.lastSyncStatus==='ERROR'?`<span class="status-pill warning">Error sync</span>`:'<span class="status-pill muted">Sin sincronizar</span>';
      const syncText=c.lastSyncAt?`<small>${escapeHtml(formatAppDateTime_(c.lastSyncAt))}${c.lastSyncSummary?' · '+escapeHtml(c.lastSyncSummary):''}</small>`:'<small>El alta puede traer el calendario automáticamente.</small>';
      return `<tr><td><strong>${escapeHtml((divMap[c.divisionId]||{}).name||'—')}</strong><small>${escapeHtml((teamMap[c.teamId]||{}).name||'Toda la división')}</small></td><td><strong>${escapeHtml(c.name||'—')}</strong>${c.phase?`<small>${escapeHtml(c.phase)}</small>`:''}${c.externalClubName?`<small>Club FAR: ${escapeHtml(c.externalClubName)}</small>`:''}</td><td>${escapeHtml(competitionTypeLabelClient_(c.competitionType))}<small>${escapeHtml(c.federationName||'')}</small></td><td><div class="button-row compact-links">${links}</div></td><td>${syncState}${syncText}</td><td><div class="button-row"><button class="button mini secondary" data-edit-competition="${escapeHtml(c.competitionId)}">Editar</button>${webSync?`<button class="button mini primary" data-sync-competition="${escapeHtml(c.competitionId)}">Actualizar desde FAR</button>`:''}</div></td></tr>`;
    }).join('');
    shell(`<section class="hero compact"><span class="eyebrow">Calendario federativo</span><h1>Actualizar desde WEB</h1><p>Gestioná las competiciones y sincronizá FAR / MatchReady. Podés actualizar una competición o todas las activas de la temporada.</p></section><section class="panel"><div class="panel-heading"><div><h2>${escapeHtml(selectedSeason_()?.name||'Temporada')}</h2><p>${(data.competitions||[]).length} competición(es) configurada(s).</p></div><div class="button-row"><button class="button secondary" id="competitions-back">Volver al calendario</button>${data.canManage?'<button class="button primary" id="competition-sync-all">Actualizar todos</button><button class="button secondary" id="competition-new">Nueva competición</button>':''}</div></div>${externalAuthHtml}${rows?`<div class="table-wrap"><table><thead><tr><th>División / equipo</th><th>Competición / fase</th><th>Tipo</th><th>Enlaces oficiales</th><th>Sincronización</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('Todavía no hay competiciones configuradas para esta temporada.')}<div id="message" class="message"></div></section>`,'calendar');
    document.getElementById('competitions-back').onclick=renderCalendar;
    wireCompetitionExternalAuth_(externalAccess,renderCompetitions);
    const nb=document.getElementById('competition-new');if(nb)nb.onclick=()=>renderCompetitionEditor('');
    const syncAll=document.getElementById('competition-sync-all');if(syncAll)syncAll.onclick=async()=>{const eligible=(data.competitions||[]).filter(c=>c.status==='ACTIVE'&&String(c.calendarUrl||'').includes('farugby.matchready.es'));if(!eligible.length)return showToast_('No hay competiciones WEB activas para actualizar.','warning',4000);syncAll.disabled=true;const original=syncAll.textContent;let ok=0,failed=0,imported=0,updated=0,rests=0,recoveries=0,removedRests=0,removedRecoveries=0,refereeChanges=0,refereeFieldsMissing=0,acts=0,applied=0;try{for(let i=0;i<eligible.length;i++){const c=eligible[i];syncAll.textContent=`Actualizando ${i+1}/${eligible.length}...`;try{const result=await syncCompetitionAndReports_(c.competitionId),s=result.sync||{},r=result.reportSummary||{};ok++;imported+=s.imported||0;updated+=s.updated||0;rests+=s.rests||0;recoveries+=s.recoveries||0;removedRests+=s.staleRestsRemoved||0;removedRecoveries+=s.staleRecoveriesRemoved||0;refereeChanges+=s.refereeChanges||0;refereeFieldsMissing+=s.refereeFieldsMissing||0;acts+=r.downloaded||0;applied+=r.applied||0;}catch(err){failed++;console.warn('Sync WEB fallida',c.competitionId,err);}}calendarData=null;showToast_(`WEB actualizado: ${ok}/${eligible.length} competiciones · ${imported} nuevos · ${updated} actualizados · ${rests} descansos Marbella · ${recoveries} jornadas de recuperación · ${removedRests} descansos incorrectos eliminados · ${removedRecoveries} recuperaciones retiradas · ${refereeChanges} cambios de árbitro${refereeFieldsMissing?' · '+refereeFieldsMissing+' árbitros no verificables':''} · ${acts} actas descargadas · ${applied} aplicadas${failed?' · '+failed+' con error':''}.`,failed?'warning':'success',9000);await renderCompetitions();}finally{syncAll.disabled=false;syncAll.textContent=original;}};
    document.querySelectorAll('[data-edit-competition]').forEach(b=>b.onclick=()=>renderCompetitionEditor(b.dataset.editCompetition));
    document.querySelectorAll('[data-sync-competition]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const result=await syncCompetitionAndReports_(b.dataset.syncCompetition),sync=result.sync||{},r=result.reportSummary||{};showToast_(`FAR actualizado: ${sync.imported||0} nuevos · ${sync.updated||0} actualizados · ${sync.duplicatesMerged||0} duplicados conciliados · ${sync.rests||0} descansos Marbella · ${sync.recoveries||0} jornadas de recuperación · ${sync.staleRestsRemoved||0} descansos incorrectos eliminados · ${sync.staleRecoveriesRemoved||0} recuperaciones retiradas · ${sync.refereeChanges||0} cambios de árbitro${sync.refereeFieldsMissing?' · '+sync.refereeFieldsMissing+' árbitros no verificables':''} · ${r.downloaded||0} acta(s) descargada(s) · ${r.applied||0} aplicada(s)${r.needsReview?' · '+r.needsReview+' para revisión':''}.`,'success',7000);await renderCompetitions();}catch(err){if(err.code==='EXTERNAL_REQUEST_AUTH_REQUIRED'){showToast_('Falta autorizar la conexión FAR.','warning',4000);await renderCompetitions();return;}showMessage(userErrorText_(err),'error');b.disabled=false;}});
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudieron cargar las competiciones</h1><p>${escapeHtml(err.message)}</p><button class="button secondary" id="competitions-back">Volver</button></section>`,'calendar');document.getElementById('competitions-back')?.addEventListener('click',renderCalendar);}
}

async function renderCompetitionEditor(competitionId=''){
  const {data}=await call('getCompetitionsData',{seasonId:selectedSeasonId_()});
  const c=(data.competitions||[]).find(x=>x.competitionId===competitionId)||{};
  const divs=data.divisions||[],teams=data.teams||[];
  const externalAccess=data.externalAccess||{};
  const externalAuthHtml=competitionExternalAuthHtml_(externalAccess);
  let sourceAnalysis=null;
  shell(`<section class="hero compact"><span class="eyebrow">Competición</span><h1>${c.competitionId?'Editar competición':'Nueva competición'}</h1><p>Pegá la página de FAR de la categoría o un calendario MatchReady. El sistema detecta las competiciones disponibles y, al guardar, puede traer el calendario automáticamente.</p></section><form id="competition-form" class="panel form-stack">${externalAuthHtml}<div class="section-heading"><h2>Origen oficial</h2><p>Ejemplo M18: https://farugby.com/categoria-m18/</p></div><div class="form-grid two"><label class="filter-grow">URL FAR / MatchReady<input id="competition-source-url" type="url" value="${escapeHtml(c.federationPageUrl||c.calendarUrl||'')}" placeholder="https://farugby.com/categoria-m18/"></label><div class="form-action-bottom"><button class="button secondary" type="button" id="competition-analyze-source">Analizar URL</button></div></div><div id="competition-source-analysis">${c.calendarUrl?`<div class="info-strip"><strong>Origen configurado:</strong> ${escapeHtml(c.calendarUrl)}${c.externalClubName?` · Nuestro club: ${escapeHtml(c.externalClubName)}`:''}</div>`:''}</div><div class="section-divider"></div><div class="form-grid three"><label>División<select id="competition-division" required><option value="">— Seleccionar división —</option>${optionList(divs,'divisionId',x=>x.name,c.divisionId||'',false)}</select></label><label>Equipo<select id="competition-team"><option value="">Toda la división</option></select></label><label>Tipo<select id="competition-type"><option value="LEAGUE" ${!c.competitionType||c.competitionType==='LEAGUE'?'selected':''}>Liga</option><option value="CUP" ${c.competitionType==='CUP'?'selected':''}>Copa</option><option value="TOURNAMENT" ${c.competitionType==='TOURNAMENT'?'selected':''}>Torneo</option><option value="FRIENDLY" ${c.competitionType==='FRIENDLY'?'selected':''}>Amistoso</option><option value="OTHER" ${c.competitionType==='OTHER'?'selected':''}>Otro</option></select></label><label>Nombre<input id="competition-name" value="${escapeHtml(c.name||'')}" maxlength="180" required placeholder="Ej. CPTO ANDALUZ M18 MASCULINO XV"></label><label>Fase / ronda<input id="competition-phase" value="${escapeHtml(c.phase||'')}" maxlength="140" placeholder="Ej. 1ª DIVISIÓN, 2ª ronda, Copa FAR"></label><label>Federación<input id="competition-federation" value="${escapeHtml(c.federationName||'FAR')}" maxlength="100"></label><label>Nuestro club en FAR<input id="competition-external-club-name" list="competition-source-teams" value="${escapeHtml(c.externalClubName||'')}" maxlength="180" placeholder="Ej. Marbella R.C."><datalist id="competition-source-teams"></datalist><small>Se completa al analizar la URL.</small></label><label>Orden<input id="competition-sort" type="number" min="0" max="9999" value="${escapeHtml(c.sortOrder||'0')}"></label><label>Estado<select id="competition-status"><option value="ACTIVE" ${c.status!=='INACTIVE'?'selected':''}>Activa</option><option value="INACTIVE" ${c.status==='INACTIVE'?'selected':''}>Inactiva</option></select></label></div><input id="competition-calendar-url" type="hidden" value="${escapeHtml(c.calendarUrl||'')}"><input id="competition-external-id" type="hidden" value="${escapeHtml(c.externalCompetitionId||'')}"><input id="competition-source-provider" type="hidden" value="${escapeHtml(c.sourceProvider||'')}"><details class="advanced-box"><summary>Información técnica / enlaces manuales</summary><div class="form-grid two"><label>Calendario MatchReady<input id="competition-calendar-url-display" type="url" value="${escapeHtml(c.calendarUrl||'')}" placeholder="Se completa al analizar"></label><label>Centro de partidos / actas<input id="competition-match-center-url" type="url" value="${escapeHtml(c.matchCenterUrl||c.calendarUrl||'')}"></label><label>ID externo<input id="competition-external-id-display" value="${escapeHtml(c.externalCompetitionId||'')}" maxlength="160"></label></div></details><label>Observaciones<textarea id="competition-notes" maxlength="1200">${escapeHtml(c.notes||'')}</textarea></label><label class="check-row"><input id="competition-sync-on-save" type="checkbox" ${c.calendarUrl||!c.competitionId?'checked':''}> Después de guardar, sincronizar calendario desde FAR / MatchReady</label><div class="info-strip"><strong>Cómo funciona:</strong> al guardar una competición con MatchReady se crean o actualizan únicamente los partidos de nuestro club. En sincronizaciones posteriores se actualizan fecha, hora, campo, árbitro y resultado, y se añade automáticamente el enlace al PDF del acta cuando FAR lo publique. El XLSX queda disponible como alternativa.</div><div class="button-row"><button class="button secondary" type="button" id="competition-cancel">Cancelar</button><button class="button primary" type="submit">Guardar competición</button></div><div id="message" class="message"></div></form>`,'calendar');
  wireCompetitionExternalAuth_(externalAccess,()=>renderCompetitionEditor(competitionId));
  const divSel=document.getElementById('competition-division'),teamSel=document.getElementById('competition-team');
  const syncTeams=(preferred='')=>{const div=divSel.value;const scoped=teams.filter(t=>t.divisionId===div);teamSel.innerHTML='<option value="">Toda la división</option>'+scoped.map(t=>`<option value="${escapeHtml(t.teamId)}">${escapeHtml(t.name)}</option>`).join('');if(preferred&&scoped.some(t=>t.teamId===preferred))teamSel.value=preferred;};
  syncTeams(c.teamId||'');divSel.onchange=()=>syncTeams('');
  const syncTechnicalInputs=()=>{document.getElementById('competition-calendar-url').value=val('competition-calendar-url-display');document.getElementById('competition-external-id').value=val('competition-external-id-display');};
  document.getElementById('competition-calendar-url-display').onchange=syncTechnicalInputs;document.getElementById('competition-external-id-display').onchange=syncTechnicalInputs;
  function applyCandidate(candidate){if(!candidate)return;document.getElementById('competition-name').value=candidate.name||'';document.getElementById('competition-phase').value=candidate.phase||'';document.getElementById('competition-type').value=candidate.competitionType||'LEAGUE';document.getElementById('competition-federation').value=candidate.federationName||'FAR';document.getElementById('competition-calendar-url').value=candidate.calendarUrl||'';document.getElementById('competition-calendar-url-display').value=candidate.calendarUrl||'';document.getElementById('competition-match-center-url').value=candidate.matchCenterUrl||candidate.calendarUrl||'';document.getElementById('competition-external-id').value=candidate.externalCompetitionId||'';document.getElementById('competition-external-id-display').value=candidate.externalCompetitionId||'';document.getElementById('competition-source-provider').value=candidate.sourceProvider||'MATCHREADY';const list=document.getElementById('competition-source-teams');list.innerHTML=(candidate.teams||[]).map(t=>`<option value="${escapeHtml(t)}"></option>`).join('');document.getElementById('competition-external-club-name').value=candidate.externalClubName||'';if(candidate.suggestedDivisionId&&divs.some(d=>d.divisionId===candidate.suggestedDivisionId)){divSel.value=candidate.suggestedDivisionId;syncTeams(candidate.suggestedTeamId||'');}document.getElementById('competition-sync-on-save').checked=true;}
  document.getElementById('competition-analyze-source').onclick=async()=>{const source=val('competition-source-url');if(!source)return showMessage('Pegá primero la URL de FAR o MatchReady.','error');try{const {data:analysis}=await call('analyzeCompetitionSource',{sourceUrl:source,seasonId:selectedSeasonId_()});sourceAnalysis=analysis;const host=document.getElementById('competition-source-analysis');host.innerHTML=`<div class="form-grid two"><label>Competición detectada<select id="competition-source-candidate">${analysis.candidates.map((x,i)=>`<option value="${escapeHtml(x.key)}">${escapeHtml(x.sourceTitle||x.name)} · ${x.fixtureCount} partidos · ${x.reportCount} acta(s)</option>`).join('')}</select></label><div class="info-strip"><strong>${analysis.candidates.length}</strong> calendario(s) detectado(s). Elegí el que corresponda al equipo.</div></div>`;const sel=document.getElementById('competition-source-candidate');const choose=()=>applyCandidate(analysis.candidates.find(x=>x.key===sel.value)||analysis.candidates[0]);sel.onchange=choose;choose();showToast_('Origen FAR analizado correctamente.');}catch(err){showMessage(userErrorText_(err),'error');}};
  document.getElementById('competition-cancel').onclick=renderCompetitions;
  document.getElementById('competition-form').onsubmit=async ev=>{ev.preventDefault();syncTechnicalInputs();const source=val('competition-source-url'),calendarUrl=val('competition-calendar-url');if(source&&!calendarUrl&&!c.calendarUrl)return showMessage('Analizá la URL oficial antes de guardar para seleccionar la competición correcta.','error');const button=ev.submitter;if(button)button.disabled=true;const shouldSync=!!(document.getElementById('competition-sync-on-save').checked&&calendarUrl);try{const {data:saved}=await call('saveCompetition',{competitionId:c.competitionId||'',seasonId:selectedSeasonId_(),divisionId:val('competition-division'),teamId:val('competition-team'),name:val('competition-name'),competitionType:val('competition-type'),phase:val('competition-phase'),federationName:val('competition-federation'),federationPageUrl:source,calendarUrl:calendarUrl,matchCenterUrl:val('competition-match-center-url'),externalCompetitionId:val('competition-external-id'),externalClubName:val('competition-external-club-name'),sourceProvider:val('competition-source-provider'),sortOrder:val('competition-sort'),status:val('competition-status'),notes:val('competition-notes')});calendarData=null;const savedCompetition=saved&&saved.competition?saved.competition:null;if(shouldSync&&savedCompetition&&savedCompetition.competitionId){showToast_('Competición guardada. Iniciando sincronización con FAR…','success',2200);try{const result=await syncCompetitionAndReports_(savedCompetition.competitionId),sync=result.sync||{},r=result.reportSummary||{};calendarData=null;showToast_(`FAR actualizado: ${sync.imported||0} nuevos · ${sync.updated||0} actualizados · ${sync.duplicatesMerged||0} duplicados conciliados · ${sync.refereeChanges||0} cambios de árbitro${sync.refereeFieldsMissing?' · '+sync.refereeFieldsMissing+' árbitros no verificables':''} · ${r.downloaded||0} acta(s) procesada(s)${r.needsReview?' · '+r.needsReview+' para revisión':''}.`,'success',6500);}catch(syncErr){if(syncErr.code==='EXTERNAL_REQUEST_AUTH_REQUIRED')showToast_('La competición quedó guardada. Falta autorizar la conexión FAR para sincronizar.','warning',6000);else showToast_('La competición quedó guardada, pero la sincronización no terminó: '+userErrorText_(syncErr),'warning',7000);}}else showToast_('Competición guardada.');await renderCompetitions();}catch(err){showMessage(userErrorText_(err),'error');if(button)button.disabled=false;}};
}

async function renderManualLoad_(){
  shell(`<section class="hero compact"><span class="eyebrow">Calendario</span><h1>Carga manual</h1><p>Alternativas manuales para cuando una competición no pueda sincronizarse automáticamente o necesites cargar documentación puntual.</p></section><section class="panel"><div class="panel-heading"><div><h2>Herramientas manuales</h2><p>La sincronización FAR sigue siendo la vía recomendada para calendario, resultados y actas oficiales.</p></div><button class="button secondary" id="manual-back">Volver al calendario</button></div><div class="dashboard-grid"><article class="summary-card"><span class="eyebrow">Calendario</span><h3>Importar XLSX</h3><p>Analiza un Excel federativo y vincula los partidos con una competición configurada.</p><button class="button primary" id="manual-calendar-import">Importar calendario</button></article><article class="summary-card"><span class="eyebrow">Actas</span><h3>Cargar acta PDF</h3><p>Selecciona un partido y carga o revisa manualmente su acta.</p><button class="button primary" id="manual-report-upload">Seleccionar partido</button></article><article class="summary-card"><span class="eyebrow">Mantenimiento</span><h3>Reprocesar actas</h3><p>Vuelve a leer PDFs ya guardados y sincroniza los datos oficiales detectados.</p><button class="button secondary" id="manual-report-maint">Actualizar actas existentes</button></article></div></section>`,'calendar');
  document.getElementById('manual-back').onclick=renderCalendar;document.getElementById('manual-calendar-import').onclick=()=>renderLeagueImport();document.getElementById('manual-report-upload').onclick=renderManualReportLoad_;document.getElementById('manual-report-maint').onclick=renderReportMaintenance_;
}

async function renderManualReportLoad_(){
  try{const {data}=await call('getCalendarData',{seasonId:selectedSeasonId_()});const reportSet=new Set(data.matchReportEventIds||[]),divMap=Object.fromEntries((data.divisions||[]).map(x=>[x.divisionId,x])),teamMap=Object.fromEntries((data.teams||[]).map(x=>[x.teamId,x])),metaMap=Object.fromEntries((data.leagueMeta||[]).map(x=>[x.eventId,x]));const matches=(data.events||[]).filter(e=>e.eventType==='MATCH').sort((a,b)=>String(b.eventDate||'').localeCompare(String(a.eventDate||''))||String(a.startTime||'').localeCompare(String(b.startTime||'')));const rows=matches.map(e=>{const m=metaMap[e.eventId]||{},category=m.calendarCategory||'',competition=m.calendarCompetition||e.competition||'';return `<tr><td>${escapeHtml(e.eventDate||'—')}<small>${escapeHtml(displayEventTime_(e))}</small></td><td>${escapeHtml([divMap[e.divisionId]?.name,teamMap[e.teamId]?.name].filter(Boolean).join(' · ')||'—')}</td><td><strong>${escapeHtml(e.title||('vs '+(e.opponent||'')))}</strong>${category?`<small><strong>${escapeHtml(category)}</strong></small>`:''}${competition&&competition!==category?`<small>${escapeHtml(competition)}</small>`:''}</td><td>${reportSet.has(e.eventId)?'<span class="status-pill success">Acta cargada</span>':(e.officialReportUrl?'<span class="status-pill warning">PDF FAR disponible</span>':'<span class="status-pill muted">Sin acta</span>')}</td><td><button class="button mini primary" data-manual-report-event="${escapeHtml(e.eventId)}">${reportSet.has(e.eventId)?'Revisar acta':'Cargar acta'}</button></td></tr>`;}).join('');shell(`<section class="hero compact"><span class="eyebrow">Carga manual</span><h1>Actas de partido</h1><p>Elegí el partido sobre el que querés cargar o revisar un PDF manualmente.</p></section><section class="panel"><div class="panel-heading"><div><h2>${escapeHtml(selectedSeason_()?.name||'Temporada')}</h2><p>${matches.length} partido(s).</p></div><button class="button secondary" id="manual-report-back">Volver</button></div>${rows?`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>División / equipo</th><th>Partido</th><th>Acta</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay partidos en esta temporada.')}<div id="message" class="message"></div></section>`,'calendar');document.getElementById('manual-report-back').onclick=renderManualLoad_;document.querySelectorAll('[data-manual-report-event]').forEach(b=>b.onclick=()=>renderMatchPlanning(b.dataset.manualReportEvent));}catch(err){shell(`<section class="panel narrow"><h1>No se pudieron cargar los partidos</h1><p>${escapeHtml(err.message)}</p><button class="button secondary" id="manual-report-back">Volver</button></section>`,'calendar');document.getElementById('manual-report-back')?.addEventListener('click',renderManualLoad_);}
}

async function renderReportMaintenance_(){
  try{
    const {data}=await call('getMatchReportMaintenanceData');const reports=data.reports||[];
    shell(`<section class="hero compact"><span class="eyebrow">Mantenimiento</span><h1>Actualizar actas existentes</h1><p>Relee PDFs ya asociados y vuelve a sincronizar los datos oficiales, incluido orderNo. plannedOrderNo se conserva.</p></section><section class="panel"><div class="panel-heading"><div><h2>Actas disponibles</h2><p>Selecciona las que quieras actualizar. Si una revisión automática no es segura, se omite y queda para revisión manual.</p></div><button class="button secondary" id="back-calendar-maint">Volver</button></div>${reports.length?`<div class="bulk-actions"><label><input type="checkbox" id="report-select-all" checked> Seleccionar todas (${reports.length})</label><button class="button primary" id="report-run-selected">Reprocesar seleccionadas</button></div><div class="table-wrap"><table><thead><tr><th></th><th>Fecha</th><th>División / Equipo</th><th>Partido</th><th>Estado</th><th>Parser</th></tr></thead><tbody>${reports.map(r=>`<tr><td><input type="checkbox" data-maint-report="${escapeHtml(r.reportId)}" checked></td><td>${escapeHtml(r.eventDate||'—')}</td><td>${escapeHtml([r.divisionName,r.teamName].filter(Boolean).join(' · ')||'—')}</td><td><strong>${escapeHtml(r.title||'Partido')}</strong><small>${escapeHtml(r.opponent?('vs '+r.opponent):'')}</small></td><td>${escapeHtml(r.status||'—')}</td><td>${escapeHtml(r.parserVersion||'—')}</td></tr>`).join('')}</tbody></table></div>`:emptyTable('No hay partidos con PDF de acta asociado.')}<div id="report-maint-progress" class="maintenance-progress"></div><div id="message" class="message"></div></section>`,'calendar');
    document.getElementById('back-calendar-maint').onclick=renderManualLoad_;
    const all=document.getElementById('report-select-all');if(all)all.onchange=()=>document.querySelectorAll('[data-maint-report]').forEach(x=>x.checked=all.checked);
    const run=document.getElementById('report-run-selected');if(run)run.onclick=async()=>{const ids=[...document.querySelectorAll('[data-maint-report]:checked')].map(x=>x.dataset.maintReport);if(!ids.length)return showMessage('Selecciona al menos un acta.','error');if(!confirm(`Se reprocesarán ${ids.length} actas y se sincronizarán sus datos oficiales. ¿Continuar?`))return;run.disabled=true;let ok=0,review=0,failed=0;const host=document.getElementById('report-maint-progress');for(let i=0;i<ids.length;i++){host.innerHTML=`<div class="progress-line"><strong>Procesando ${i+1} de ${ids.length}</strong><progress max="${ids.length}" value="${i}"></progress></div>`;try{const res=(await call('refreshMatchReportOfficialData',{reportId:ids[i]})).data;if(res.ok)ok++;else if(res.needsReview)review++;else failed++;}catch(_){failed++;}}host.innerHTML=`<div class="message ${failed?'warning':'success'}"><strong>Proceso terminado.</strong> ${ok} actualizadas · ${review} requieren revisión · ${failed} con error.</div>`;showToast_('Actualización de actas finalizada.',failed?'warning':'success');run.disabled=false;};
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudieron cargar las actas</h1><p>${escapeHtml(err.message)}</p><button class="button secondary" id="back-calendar-maint">Volver</button></section>`,'calendar');document.getElementById('back-calendar-maint')?.addEventListener('click',renderManualLoad_);}
}


function eventCandidateGroups_(divisionId,eventDate){
  const d=calendarData||{},rolesById=Object.fromEntries((d.roles||[]).map(r=>[r.roleId,r])),personsById=Object.fromEntries((d.persons||[]).map(p=>[p.personId,p])),groups={PLAYER:[],COACH:[],MANAGER:[],COLLABORATOR:[],COORDINATOR:[],REFEREE:[]},seen={PLAYER:{},COACH:{},MANAGER:{},COLLABORATOR:{},COORDINATOR:{},REFEREE:{}};
  if(!divisionId)return groups;
  (d.assignments||[]).forEach(a=>{const role=rolesById[a.roleId],cat=role?.category;if(!role||!groups[cat]||!personsById[a.personId])return;if(eventDate&&a.startDate&&a.startDate>eventDate)return;if(eventDate&&a.endDate&&a.endDate<eventDate)return;const scoped=cat==='REFEREE'?true:['PLAYER','COACH','MANAGER','COLLABORATOR','COORDINATOR'].includes(cat)?(!a.divisionId||a.divisionId===divisionId):false;if(!scoped||seen[cat][a.personId])return;seen[cat][a.personId]=true;groups[cat].push({person:personsById[a.personId],roleName:role.name||''});});
  Object.values(groups).forEach(rows=>rows.sort((a,b)=>String(a.person.displayName||'').localeCompare(String(b.person.displayName||''),'es')));
  return groups;
}
function eventExistingParticipantSelection_(e,groups){const selected={};(calendarData?.participants||[]).filter(p=>e&&p.eventId===e.eventId).forEach(p=>{let cat=p.roleCategory||'';if(!cat){if(p.participantType==='PLAYER')cat='PLAYER';else if(p.participantType==='REFEREE')cat='REFEREE';else if(p.participantType==='STAFF')cat=(groups.COACH||[]).some(x=>x.person.personId===p.personId)?'COACH':'MANAGER';}selected[p.personId]=cat;});return selected;}
function currentEventParticipantSelection_(){const selected={};document.querySelectorAll('[data-event-person]:checked').forEach(ch=>selected[ch.dataset.eventPerson]=ch.dataset.eventRoleCategory);return selected;}
function eventEditorParticipants(e,divisionId,eventDate,selectedOverride){
  const groups=eventCandidateGroups_(divisionId,eventDate),selected=selectedOverride||eventExistingParticipantSelection_(e,groups);
  if(!divisionId)return '<div class="info-strip">Seleccioná primero una división para cargar las vinculaciones específicas.</div>';
  const rows=groups.REFEREE||[];
  return `<div class="participant-role-groups"><div class="info-strip"><strong>Disponibilidad automática.</strong> Jugadores y staff activos de la división se calculan automáticamente según bajas y ausencias. Acá solo vinculás árbitros específicos a esta actividad.</div><section class="participant-role-group"><div class="participant-role-heading"><h3>Árbitros</h3><small>Opcional. Los árbitros pueden vincularse tanto a partidos como a entrenamientos.</small></div>${rows.length?`<div class="participant-role-list">${rows.map(x=>`<label class="participant-choice role-fixed"><input type="checkbox" data-event-person="${escapeHtml(x.person.personId)}" data-event-role-category="REFEREE" ${selected[x.person.personId]==='REFEREE'?'checked':''}><span><strong>${escapeHtml(x.person.displayName)}</strong>${x.roleName?`<small>${escapeHtml(x.roleName)}</small>`:''}</span><span class="badge active">Árbitro</span></label>`).join('')}</div>`:'<div class="muted-text">Sin árbitros activos.</div>'}</section></div>`;
}
function wireParticipantRoleChoices_(){document.querySelectorAll('[data-event-person]').forEach(ch=>ch.onchange=()=>{if(!ch.checked)return;document.querySelectorAll(`[data-event-person="${CSS.escape(ch.dataset.eventPerson)}"]`).forEach(other=>{if(other!==ch)other.checked=false;});});}
async function renderEventEditor(eventId=''){
  if(!calendarData){const r=await call('getCalendarData',{seasonId:selectedSeasonId_()});calendarData=r.data;}const d=calendarData,e=(d.events||[]).find(x=>x.eventId===eventId)||{};
  const teams=d.teams||[],divs=d.divisions||[];
  shell(`<section class="hero compact"><span class="eyebrow">${e.eventId?'Editar':'Nueva'} actividad</span><h1>${e.eventId?escapeHtml(e.title):'Entrenamiento o partido'}</h1></section>
  <form id="event-form" class="panel form-stack"><div class="form-grid three"><label>Tipo<select id="event-type"><option value="TRAINING" ${e.eventType==='TRAINING'||!e.eventType?'selected':''}>Entrenamiento</option><option value="MATCH" ${e.eventType==='MATCH'?'selected':''}>Partido</option>${e.eventType==='REST'?'<option value="REST" selected>Descanso</option>':''}</select></label><label>Título<input id="event-title" value="${escapeHtml(e.title||'')}" maxlength="120"></label><label>Estado<div class="readonly-field">${escapeHtml(eventStatusLabel(e.status||'SCHEDULED'))}</div><small>${e.eventId?'El estado se cambia desde el detalle de la actividad.':'Las nuevas actividades se crean siempre como Programadas.'}</small></label><label>División<select id="event-division" required><option value="">— Seleccionar división —</option>${optionList(divs,'divisionId',x=>x.name,e.divisionId||'',false)}</select></label><label>Equipo<select id="event-team"><option value="">Toda la división</option></select></label><label>Fecha<input id="event-date" type="date" required value="${escapeHtml(e.eventDate||isoLocalDate(new Date()))}"></label><label>Hora inicio<input id="event-start" type="time" value="${escapeHtml(e.startTime||'')}"></label><label>Hora fin<input id="event-end" type="time" value="${escapeHtml(e.endTime||'')}"></label><label>Ubicación<input id="event-location" value="${escapeHtml(e.location||'')}" maxlength="180"></label></div><div id="match-fields" class="form-grid three"><label>Rival<input id="event-opponent" value="${escapeHtml(e.opponent||'')}" maxlength="120"></label><label>Tipo partido<select id="event-match-type"><option value="FRIENDLY" ${e.matchType==='FRIENDLY'||!e.matchType?'selected':''}>Amistoso</option><option value="OTHER" ${e.matchType==='OTHER'?'selected':''}>Otro</option>${e.matchType==='COMPETITION'?'<option value="COMPETITION" selected>Competición importada</option>':''}</select></label><label>Competición<select id="event-competition-id"><option value="">— Sin competición configurada —</option></select><small id="event-competition-legacy">${e.competition&&!e.competitionId?'Actual: '+escapeHtml(e.competition):''}</small></label><label>Resultado club<input id="event-result-for" type="number" min="0" value="${escapeHtml(e.resultFor||'')}"></label><label>Resultado rival<input id="event-result-against" type="number" min="0" value="${escapeHtml(e.resultAgainst||'')}"></label><label>Formato de partido/jornada<select id="event-match-format"><option value="SINGLE" ${!e.matchFormat||e.matchFormat==='SINGLE'?'selected':''}>Partido único</option><option value="TRIANGULAR" ${e.matchFormat==='TRIANGULAR'?'selected':''}>Triangular</option><option value="QUADRANGULAR" ${e.matchFormat==='QUADRANGULAR'?'selected':''}>Cuadrangular</option><option value="CUSTOM" ${e.matchFormat==='CUSTOM'?'selected':''}>Personalizado</option></select></label><label>Duración partido (min)<input id="event-match-duration" type="number" min="1" max="120" value="${escapeHtml(e.matchDurationMinutes||'')}" placeholder="Usa división"></label><label>Minutos por tiempo<input id="event-half-duration" type="number" min="1" max="60" value="${escapeHtml(e.halfDurationMinutes||'')}" placeholder="Usa división"></label><div class="form-hint span-three" id="event-duration-hint">Partido único usa la duración de la división salvo que la sobrescribas.</div></div><label>Observaciones<textarea id="event-notes" maxlength="1000">${escapeHtml(e.notes||'')}</textarea></label><div class="section-divider"></div><div class="section-heading"><h2>Vinculaciones específicas</h2><p>La disponibilidad de jugadores y staff se calcula automáticamente. Vinculá acá solo árbitros específicos de la actividad.</p></div><div id="event-participants-grid">${eventEditorParticipants(e,e.divisionId||'',e.eventDate||isoLocalDate(new Date()))}</div><div class="button-row"><button class="button secondary" type="button" id="cancel-event">Cancelar</button><button class="button primary" type="submit">Guardar actividad</button></div><div id="message" class="message"></div></form>`,'calendar');
  const updateMatch=()=>document.getElementById('match-fields').style.display=val('event-type')==='MATCH'?'grid':'none';document.getElementById('event-type').onchange=updateMatch;updateMatch();
  const teamSelect=document.getElementById('event-team'),competitionSelect=document.getElementById('event-competition-id');
  const syncEventTeams=(preferred='')=>{const divisionId=val('event-division'),scoped=teams.filter(t=>t.divisionId===divisionId);teamSelect.innerHTML='<option value="">Toda la división</option>'+scoped.map(t=>`<option value="${escapeHtml(t.teamId)}">${escapeHtml(t.name)}</option>`).join('');if(preferred&&scoped.some(t=>t.teamId===preferred))teamSelect.value=preferred;else if(!preferred&&scoped.length===1)teamSelect.value=scoped[0].teamId;else teamSelect.value='';};
  const syncEventCompetitions=(preferred='')=>{const divisionId=val('event-division'),teamId=val('event-team');const scoped=(d.competitions||[]).filter(c=>(c.status==='ACTIVE'||c.competitionId===e.competitionId)&&c.divisionId===divisionId&&(!c.teamId||c.teamId===teamId));competitionSelect.innerHTML='<option value="">— Sin competición configurada —</option>'+scoped.map(c=>`<option value="${escapeHtml(c.competitionId)}">${escapeHtml(competitionDisplayNameClient_(c))}${c.teamId?' · equipo':''}</option>`).join('');if(preferred&&scoped.some(c=>c.competitionId===preferred))competitionSelect.value=preferred;};
  const refreshParticipants=(preserve=true)=>{const current=preserve?currentEventParticipantSelection_():null;document.getElementById('event-participants-grid').innerHTML=eventEditorParticipants(e,val('event-division'),val('event-date'),current);wireParticipantRoleChoices_();};
  syncEventTeams(e.teamId||'');syncEventCompetitions(e.competitionId||'');wireParticipantRoleChoices_();
  const divisionDefaults=()=>{const d0=divs.find(x=>x.divisionId===val('event-division'))||{};return {single:{total:String(d0.defaultMatchMinutes||''),half:String(d0.defaultHalfMinutes||'')},triangular:{total:String(d0.triangularMatchMinutes||''),half:String(d0.triangularHalfMinutes||'')},quadrangular:{total:String(d0.quadrangularMatchMinutes||''),half:String(d0.quadrangularHalfMinutes||'')}};};
  let eventDurationSource=e.durationSource||'';
  const syncMatchFormat=(force=false)=>{const f=val('event-match-format')||'SINGLE',total=document.getElementById('event-match-duration'),half=document.getElementById('event-half-duration'),hint=document.getElementById('event-duration-hint'),dd=divisionDefaults();let rule=f==='TRIANGULAR'?dd.triangular:f==='QUADRANGULAR'?dd.quadrangular:dd.single;if(force){total.value=f==='SINGLE'?'':rule.total;half.value=f==='SINGLE'?'':rule.half;eventDurationSource=rule.total?'SEASON_RULE':'PENDING';}if(f==='SINGLE')hint.textContent=`Partido único: usa ${dd.single.total?(dd.single.total+' min'+(dd.single.half?' ('+dd.single.half+'+'+dd.single.half+')':'')):'la duración configurada en la división'} salvo que indiques una duración específica.`;else if(f==='TRIANGULAR')hint.textContent=rule.total?`Triangular: regla de la división ${rule.total} min${rule.half?' ('+rule.half+'+'+rule.half+')':''}.`:'Triangular detectado, pero esta división no tiene duración configurada.';else if(f==='QUADRANGULAR')hint.textContent=rule.total?`Cuadrangular: regla de la división ${rule.total} min${rule.half?' ('+rule.half+'+'+rule.half+')':''}.`:'Cuadrangular detectado, pero esta división no tiene duración configurada.';else hint.textContent='Personalizado: indica la duración real del encuentro.';};
  document.getElementById('event-division').addEventListener('change',()=>{syncEventTeams('');syncEventCompetitions('');refreshParticipants(false);syncMatchFormat(true);});
  document.getElementById('event-team').addEventListener('change',()=>syncEventCompetitions(''));
  document.getElementById('event-date').addEventListener('change',()=>refreshParticipants(true));
  document.getElementById('event-match-format').onchange=()=>syncMatchFormat(true);['event-match-duration','event-half-duration'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{eventDurationSource='MANUAL';}));syncMatchFormat(false);
  document.getElementById('cancel-event').onclick=renderCalendar;
  document.getElementById('event-form').onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{showMessage('Guardando actividad…');const payload={eventId:e.eventId||'',seasonId:e.seasonId||d.selectedSeasonId||d.activeSeasonId||'',eventType:val('event-type'),title:val('event-title'),status:e.eventId?(e.status||'SCHEDULED'):'SCHEDULED',divisionId:val('event-division'),teamId:val('event-team'),eventDate:val('event-date'),startTime:val('event-start'),endTime:val('event-end'),location:val('event-location'),opponent:val('event-opponent'),matchType:val('event-match-type'),competitionId:val('event-competition-id'),competition:e.competition||'',resultFor:val('event-result-for'),resultAgainst:val('event-result-against'),matchDurationMinutes:val('event-match-duration'),halfDurationMinutes:val('event-half-duration'),durationSource:val('event-match-duration')?(eventDurationSource||'MANUAL'):'',matchFormat:val('event-match-format'),notes:val('event-notes')};const saved=(await call('saveEvent',payload)).data;const participants=[];document.querySelectorAll('[data-event-person]:checked').forEach(ch=>participants.push({personId:ch.dataset.eventPerson,roleCategory:ch.dataset.eventRoleCategory}));await call('replaceEventParticipants',{eventId:saved.eventId,participants});calendarData=null;await renderCalendar();}catch(err){showMessage(err.message,'error');if(button)button.disabled=false;}};
}

function matchFormatLabel_(value){return ({SINGLE:'Partido único',TRIANGULAR:'Triangular',QUADRANGULAR:'Cuadrangular',CUSTOM:'Personalizado'})[value]||'Partido único';}
function effectiveEventDuration_(e){const div=(calendarData?.divisions||[]).find(x=>x.divisionId===e.divisionId)||{},format=e.matchFormat||'SINGLE';const fields=format==='TRIANGULAR'?['triangularMatchMinutes','triangularHalfMinutes']:format==='QUADRANGULAR'?['quadrangularMatchMinutes','quadrangularHalfMinutes']:['defaultMatchMinutes','defaultHalfMinutes'];const total=Number(e.matchDurationMinutes||div[fields[0]]||div.defaultMatchMinutes||0),half=Number(e.halfDurationMinutes||div[fields[1]]||div.defaultHalfMinutes||0);return {total,half};}
function eventDivisionName_(e){return (calendarData?.divisions||[]).find(x=>x.divisionId===e.divisionId)?.name||'';}
function eventTeamName_(e){return (calendarData?.teams||[]).find(x=>x.teamId===e.teamId)?.name||'';}
function eventQualifiedTitle_(e){const parts=[];const div=eventDivisionName_(e),team=eventTeamName_(e);if(div)parts.push(div);if(e.eventType!=='MATCH'&&team&&team!==div)parts.push(team);return (parts.length?parts.join(' · ')+' — ':'')+(e.title||eventTypeLabel(e.eventType));}
function matchHeaderHtml_(e,meta,opts={}){
  const divisionName=eventDivisionName_(e),teamName=eventTeamName_(e);
  const configuredCompetition=competitionForEvent_(e);
  const officialLinks=competitionLinkButtons_(configuredCompetition,e);
  const competitionCategory=meta?.calendarCategory||'';
  const competitionName=meta?.calendarCompetition||e.competition||'';
  const side=meta?.clubSide==='HOME'?'Local':meta?.clubSide==='AWAY'?'Visitante':'—';
  const result=`${escapeHtml(e.resultFor||'—')} <span>–</span> ${escapeHtml(e.resultAgainst||'—')}`;
  const title=escapeHtml(e.title||'Partido');
  const eyebrow=[eventTypeLabel(e.eventType),divisionName,teamName].filter(Boolean).join(' · ');
  return `<section class="match-overview ${opts.compact?'compact':''}">
    <div class="match-overview-title"><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${title}</h1></div>
    <div class="match-overview-card">
      <div class="match-overview-primary">
        <div class="match-info competition"><span>Competición</span><strong>${escapeHtml(competitionCategory||competitionName||'—')}</strong>${competitionName&&competitionName!==competitionCategory?`<small>${escapeHtml(competitionName)}</small>`:''}</div>
        <div class="match-info"><span>Jornada</span><strong>${escapeHtml(meta?.roundName||'—')}</strong></div>
        <div class="match-info"><span>Fecha</span><strong>${escapeHtml(e.eventDate||'—')}</strong></div>
        <div class="match-info"><span>Hora</span><strong>${escapeHtml(displayEventTime_(e)||'Pendiente')}</strong></div>
        <div class="match-info"><span>Equipo</span><strong>${escapeHtml(teamName||'—')}</strong></div>
        <div class="match-info"><span>Condición</span><strong>${escapeHtml(side)}</strong></div>
      </div>
      <div class="match-overview-secondary">
        <div class="match-info result"><span>Resultado</span><strong>${result}</strong></div>
        <div class="match-info"><span>Rival</span><strong>${escapeHtml(e.opponent||'—')}</strong></div>
        <div class="match-info"><span>Árbitro</span><strong>${escapeHtml(meta?.refereeName||'Pendiente')}</strong></div>
        <div class="match-info"><span>Estado</span><strong>${escapeHtml(eventStatusLabel(e.status))}</strong></div>
      </div>
      <div class="match-overview-location"><span>Ubicación</span><strong>${escapeHtml(e.location||'Pendiente')}</strong></div>
      ${officialLinks?`<div class="official-link-bar"><span>Fuentes oficiales</span><div class="button-row">${officialLinks}</div></div>`:''}
      ${(()=>{const dur=effectiveEventDuration_(e),season=(calendarData?.seasons||[]).find(x=>x.seasonId===e.seasonId),src=e.durationSource==='MANUAL'||e.durationSource==='EVENT'?'Override manual':(e.durationSource==='AUTO_IMPORT'||e.durationSource==='SEASON_FORMAT_RULE'?'Detectado desde calendario federativo':(e.durationSource==='PENDING'?'Duración pendiente':`Regla temporada${season?.name?' '+season.name:''}`));return `<div class="match-overview-location"><span>Formato / duración</span><strong>${escapeHtml(matchFormatLabel_(e.matchFormat))}${dur.total?` · ${dur.total} min${dur.half?` (${dur.half}+${dur.half})`:''}`:' · Sin definir'}</strong><small>${escapeHtml(src)}</small></div>`;})()}
    </div>
  </section>`;
}
function activityHeaderHtml_(e,meta){
  const divisionName=eventDivisionName_(e),teamName=eventTeamName_(e),start=displayEventTime_(e),end=String(e.endTime||'').trim(),timeLabel=start?(start+(end&&end!=='00:00'?' – '+end:'')):'—';
  const eyebrow=[eventTypeLabel(e.eventType),divisionName,teamName].filter(Boolean).join(' · ');
  const category=meta?.calendarCategory||'',competition=meta?.calendarCompetition||e.competition||'';
  return `<section class="match-overview compact"><div class="match-overview-title"><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(e.title||eventTypeLabel(e.eventType))}</h1></div><div class="match-overview-card"><div class="match-overview-primary"><div class="match-info"><span>Fecha</span><strong>${escapeHtml(e.eventDate||'—')}</strong></div><div class="match-info"><span>Horario</span><strong>${escapeHtml(timeLabel)}</strong></div><div class="match-info"><span>Equipo</span><strong>${escapeHtml(teamName||'Toda la división')}</strong></div><div class="match-info"><span>Estado</span><strong>${escapeHtml(eventStatusLabel(e.status))}</strong></div>${meta?.roundName?`<div class="match-info"><span>Jornada</span><strong>${escapeHtml(meta.roundName)}</strong></div>`:''}${category||competition?`<div class="match-info competition"><span>Competición</span><strong>${escapeHtml(category||competition)}</strong>${competition&&competition!==category?`<small>${escapeHtml(competition)}</small>`:''}</div>`:''}</div><div class="match-overview-location"><span>Ubicación</span><strong>${escapeHtml(e.location||'—')}</strong></div></div></section>`;
}

function openMatchFormatDurationEditor_(e){
  if(!document.getElementById('editor-host')){const h=document.createElement('div');h.id='editor-host';(document.querySelector('.match-detail-panel')||document.getElementById('app')).appendChild(h);}
  const div=(calendarData?.divisions||[]).find(x=>x.divisionId===e.divisionId)||{};
  const defaults={SINGLE:[div.defaultMatchMinutes||'',div.defaultHalfMinutes||''],TRIANGULAR:[div.triangularMatchMinutes||'',div.triangularHalfMinutes||''],QUADRANGULAR:[div.quadrangularMatchMinutes||'',div.quadrangularHalfMinutes||''],CUSTOM:['','']};
  editorShell('Formato / duración','Modificá solo el formato y la duración de este partido. No altera rival, fecha, convocatoria ni acta.',`<div class="form-grid three"><label>Formato<select id="quick-match-format"><option value="SINGLE">Partido único</option><option value="TRIANGULAR">Triangular</option><option value="QUADRANGULAR">Cuadrangular</option><option value="CUSTOM">Personalizado</option></select></label><label>Duración partido (min)<input id="quick-match-duration" type="number" min="1" max="120" value="${escapeHtml(e.matchDurationMinutes||'')}"></label><label>Minutos por tiempo<input id="quick-half-duration" type="number" min="1" max="60" value="${escapeHtml(e.halfDurationMinutes||'')}"></label></div><div class="form-hint" id="quick-duration-hint"></div>`, 'Guardar formato / duración');
  const format=document.getElementById('quick-match-format'),total=document.getElementById('quick-match-duration'),half=document.getElementById('quick-half-duration'),hint=document.getElementById('quick-duration-hint');format.value=e.matchFormat||'SINGLE';
  const sync=(apply=false)=>{const f=format.value,rule=defaults[f]||['',''];if(apply){total.value=rule[0];half.value=rule[1];}hint.textContent=rule[0]?`Regla configurada para esta temporada y división: ${rule[0]} min${rule[1]?` (${rule[1]}+${rule[1]})`:''}. Podés modificarla solo para este partido.`:(f==='CUSTOM'?'Indicá la duración real de este partido.':'Esta temporada no tiene una duración configurada para este formato; completala manualmente.');};format.onchange=()=>sync(true);sync(false);
  document.getElementById('entity-form').onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{showMessage('Guardando formato y duración…','info','editor-message');await call('updateEventMatchFormatDuration',{eventId:e.eventId,matchFormat:format.value,matchDurationMinutes:total.value,halfDurationMinutes:half.value});calendarData=null;showToast_('Formato y duración actualizados.');await renderEventDetail(e.eventId);}catch(err){showMessage(err.message,'error','editor-message');if(button)button.disabled=false;}};
}

function openOfficialLinksEditor_(e){
  if(!document.getElementById('editor-host')){const h=document.createElement('div');h.id='editor-host';(document.querySelector('.match-detail-panel')||document.getElementById('app')).appendChild(h);}
  const competitions=(calendarData?.competitions||[]).filter(c=>(c.status==='ACTIVE'||c.competitionId===e.competitionId)&&c.divisionId===e.divisionId&&(!c.teamId||c.teamId===e.teamId));
  const options='<option value="">— Sin competición configurada —</option>'+competitions.map(c=>`<option value="${escapeHtml(c.competitionId)}" ${c.competitionId===e.competitionId?'selected':''}>${escapeHtml(competitionDisplayNameClient_(c))}</option>`).join('');
  editorShell('Enlaces oficiales','Asociá el partido con su competición y, cuando estén disponibles, pegá los enlaces directos de MatchReady/FAR al partido y al PDF del acta.',`<div class="form-grid two"><label>Competición<select id="official-competition-id">${options}</select></label><label>ID externo del partido<input id="official-external-match-id" value="${escapeHtml(e.externalMatchId||'')}" maxlength="160" placeholder="Ej. 4842"></label><label>URL del partido oficial<input id="official-match-url" type="url" value="${escapeHtml(e.officialMatchUrl||'')}" placeholder="https://farugby.matchready.es/..."></label><label>URL del acta oficial / PDF<input id="official-report-url" type="url" value="${escapeHtml(e.officialReportUrl||'')}" placeholder="https://..."></label></div><div class="form-hint">Los enlaces son opcionales. Aunque todavía no exista el acta, podés dejar configurada la competición y completarla cuando FAR publique el partido.</div>`, 'Guardar enlaces');
  document.getElementById('entity-form').onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{showMessage('Guardando enlaces oficiales…','info','editor-message');await call('updateEventOfficialLinks',{eventId:e.eventId,competitionId:val('official-competition-id'),externalMatchId:val('official-external-match-id'),officialMatchUrl:val('official-match-url'),officialReportUrl:val('official-report-url')});calendarData=null;showToast_('Enlaces oficiales actualizados.');await renderEventDetail(e.eventId);}catch(err){showMessage(err.message,'error','editor-message');if(button)button.disabled=false;}};
}

function attendanceStatusLabel_(value){return ({PRESENT:'Presente',ADAPTED:'Adaptado',ABSENT:'Ausente',EXCUSED:'Justificado'})[value]||value||'Presente';}
function attendanceSelectHtml_(participant,editable){
  const status=participant.attendanceStatus||'PRESENT';
  if(!editable)return `<strong>${escapeHtml(attendanceStatusLabel_(status))}</strong>`;
  return `<select class="attendance-select" data-attendance="${escapeHtml(participant.eventParticipantId)}"><option value="PRESENT" ${status==='PRESENT'?'selected':''}>Presente</option><option value="ADAPTED" ${status==='ADAPTED'?'selected':''}>Adaptado</option><option value="ABSENT" ${status==='ABSENT'?'selected':''}>Ausente</option><option value="EXCUSED" ${status==='EXCUSED'?'selected':''}>Justificado</option></select>`;
}
function trainingAttendanceHtml_(parts,persons,event,canManage){
  const rows=(parts||[]).slice().sort((a,b)=>String(persons[a.personId]?.displayName||'').localeCompare(String(persons[b.personId]?.displayName||''),'es'));
  const counts={PRESENT:0,ADAPTED:0,ABSENT:0,EXCUSED:0};rows.forEach(p=>{const st=p.attendanceStatus||'PRESENT';counts[st]=(counts[st]||0)+1;});
  const roleLabel=p=>p.roleCategory==='COACH'?'Entrenador':p.roleCategory==='MANAGER'?'Manager / Delegado':p.roleCategory==='REFEREE'?'Árbitro':p.roleCategory==='COLLABORATOR'?'Colaborador':p.roleCategory==='COORDINATOR'?'Coordinador':'Jugador';
  const body=rows.map(p=>`<tr><td><strong>${escapeHtml(persons[p.personId]?.displayName||p.personId)}</strong><small>${escapeHtml(roleLabel(p))}</small></td><td>${attendanceSelectHtml_(p,canManage)}</td></tr>`).join('');
  const closed=!!event.attendanceClosedAt;
  return `<section class="training-attendance"><div class="panel-heading"><div><h2>Asistencia al entrenamiento</h2><p>Los disponibles se cargan como presentes por defecto. Marcá solamente ausentes, justificados o entrenamientos adaptados.</p></div>${closed?'<span class="status-pill active">Asistencia confirmada</span>':'<span class="status-pill warning">Pendiente de confirmar</span>'}</div><div class="attendance-summary"><span><strong>${rows.length}</strong> previstos</span><span><strong>${counts.PRESENT||0}</strong> presentes</span><span><strong>${counts.ADAPTED||0}</strong> adaptados</span><span><strong>${counts.ABSENT||0}</strong> ausentes</span><span><strong>${counts.EXCUSED||0}</strong> justificados</span></div>${body?`<div class="table-wrap"><table><thead><tr><th>Persona / rol</th><th>Asistencia real</th></tr></thead><tbody>${body}</tbody></table></div>`:emptyTable('No hay asistentes previstos para este entrenamiento.')}${canManage?`<div class="button-row"><button class="button primary" id="confirm-training-attendance">${closed?'Guardar / confirmar correcciones':'Confirmar asistencia'}</button></div>`:''}</section>`;
}

function eventAvailabilityRoleLabelClient_(category){return ({PLAYER:'Jugador',COACH:'Entrenador',MANAGER:'Manager / Delegado',COLLABORATOR:'Colaborador',COORDINATOR:'Coordinador',REFEREE:'Árbitro'})[category]||category||'Otro';}
function availabilityRestrictionText_(effect,eventType){
  if(!effect||effect.state==='NORMAL')return 'Sin restricciones';
  const first=(effect.periods||[])[0],reason=effect.summary|| (first?(availabilityPeriodTypeLabelClient_(first.periodType)+(first.reason?' · '+first.reason:'')):'');
  if(eventType==='MATCH')return `No seleccionable${reason?' · '+reason:''}`;
  if(effect.state==='ADAPTED')return `Entrenamiento adaptado${reason?' · '+reason:''}`;
  if(effect.state==='REHAB')return `Rehabilitación / recuperación${reason?' · '+reason:''}`;
  return `No participa${reason?' · '+reason:''}`;
}
async function renderEventAvailability(eventId){
  try{
    const {data}=await call('getEventAvailabilityData',{eventId});const e=data.event;
    const roleOrder={PLAYER:1,COACH:2,MANAGER:3,COLLABORATOR:4,COORDINATOR:5,REFEREE:6};
    const candidates=(data.candidates||[]).slice().sort((a,b)=>(roleOrder[a.availabilityRoleCategory]||99)-(roleOrder[b.availabilityRoleCategory]||99)||String(a.displayName||'').localeCompare(String(b.displayName||''),'es'));
    const counts={AVAILABLE:0,BLOCKED:0,ADAPTED:0,REHAB:0};
    candidates.forEach(p=>{const eff=data.effects?.[p.personId]||{state:'NORMAL',blocked:false};if(eff.blocked)counts.BLOCKED++;else if(eff.state==='ADAPTED')counts.ADAPTED++;else if(eff.state==='REHAB')counts.REHAB++;else counts.AVAILABLE++;});
    const rows=candidates.map(p=>{const eff=data.effects?.[p.personId]||{state:'NORMAL',blocked:false},blocked=!!eff.blocked;
      const stateLabel=e.eventType==='MATCH'?(blocked?'No seleccionable':'Disponible'):(eff.state==='ADAPTED'?'Adaptado':eff.state==='REHAB'?'Rehabilitación':blocked?'No participa':'Disponible');
      const stateClass=blocked?'danger':(eff.state==='ADAPTED'||eff.state==='REHAB'?'warning':'active');
      const action=data.canEditAvailability?`<button class="button mini secondary" data-new-event-period="${escapeHtml(p.personId)}">Registrar baja / ausencia</button>`:'—';
      return `<tr class="${blocked?'availability-blocked-row':''}"><td><strong>${escapeHtml(p.displayName||p.personId)}</strong></td><td>${escapeHtml(eventAvailabilityRoleLabelClient_(p.availabilityRoleCategory))}</td><td><span class="status-pill ${stateClass}">${escapeHtml(stateLabel)}</span></td><td><small>${escapeHtml(availabilityRestrictionText_(eff,e.eventType))}</small></td><td>${action}</td></tr>`;
    }).join('');
    const header=e.eventType==='MATCH'?matchHeaderHtml_(e,(calendarData?.leagueMeta||[]).find(m=>m.eventId===e.eventId)||null,{compact:true}):activityHeaderHtml_(e,null);
    const open=!!data.isOpenForAvailability;
    const modeText=open?'La disponibilidad se calcula automáticamente: toda persona activa de la división está disponible salvo que tenga una baja o ausencia vigente.':'La actividad ya no está Pendiente o Programada. Se muestra la foto de disponibilidad guardada antes del cambio de estado.';
    shell(`${header}<section class="panel"><div class="panel-heading"><div><h2>${open?'Disponibilidad automática':'Disponibilidad previa'}</h2><p>${escapeHtml(modeText)}</p></div>${open?'<span class="status-pill active">Abierta</span>':'<span class="status-pill">Cerrada</span>'}</div><div class="attendance-summary"><span><strong>${candidates.length}</strong> personas</span><span><strong>${counts.AVAILABLE||0}</strong> disponibles</span><span><strong>${counts.BLOCKED||0}</strong> no disponibles</span>${counts.ADAPTED||counts.REHAB?`<span><strong>${(counts.ADAPTED||0)+(counts.REHAB||0)}</strong> adaptados/rehab</span>`:''}</div>${rows?`<div class="table-wrap"><table><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Motivo / modalidad</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay personas activas en el alcance de esta actividad.')}<div id="editor-host"></div><div class="button-row"><button class="button secondary" id="availability-back">Volver a la actividad</button>${e.eventType==='MATCH'?'<button class="button primary" id="availability-team">Equipo / acta</button>':''}</div><div id="message" class="message"></div></section>`,'calendar');
    document.getElementById('availability-back').onclick=()=>renderEventDetail(eventId);const team=document.getElementById('availability-team');if(team)team.onclick=()=>renderMatchPlanning(eventId);
    document.querySelectorAll('[data-new-event-period]').forEach(btn=>btn.onclick=()=>{const person=candidates.find(p=>p.personId===btn.dataset.newEventPeriod);showAvailabilityPeriodEditor_(person,{eventId,onDone:()=>renderEventAvailability(eventId),onCancel:()=>renderEventAvailability(eventId)});});
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudo cargar la disponibilidad</h1><p>${escapeHtml(err.message)}</p><button class="button secondary" id="availability-error-back">Volver</button></section>`,'calendar');document.getElementById('availability-error-back')?.addEventListener('click',()=>renderEventDetail(eventId));}
}

async function renderEventDetail(eventId){
  if(!calendarData||!(calendarData.events||[]).some(x=>x.eventId===eventId)){const r=await call('getCalendarData',{seasonId:selectedSeasonId_()});calendarData=r.data;}
  const d=calendarData,e=d.events.find(x=>x.eventId===eventId);if(!e)return renderCalendar();
  const persons={};d.persons.forEach(p=>persons[p.personId]=p);const parts=d.participants.filter(p=>p.eventId===eventId);
  const canEdit=d.canCreate&&['ADMIN','MANAGER','COACH'].includes(currentUser?.role);const meta=(d.leagueMeta||[]).find(m=>m.eventId===eventId);const divisionName=eventDivisionName_(e),teamName=eventTeamName_(e);
  const reportProtected=(d.matchReportEventIds||[]).includes(eventId);
  let officialData=null;
  if(e.eventType==='MATCH'&&reportProtected){try{officialData=(await call('getMatchPlanningData',{eventId})).data;}catch(ignore){officialData=null;}}
  const linkedStats=officialData?.stats||[],roleByPerson={};linkedStats.forEach(x=>{if(x.personId)roleByPerson[x.personId]=x.lineupRole;});
  const linkedPlayers=parts.filter(x=>(x.roleCategory||x.participantType)==='PLAYER'),linkedCoaches=parts.filter(x=>x.roleCategory==='COACH'),linkedManagers=parts.filter(x=>x.roleCategory==='MANAGER'),linkedCollaborators=parts.filter(x=>x.roleCategory==='COLLABORATOR'),linkedCoordinators=parts.filter(x=>x.roleCategory==='COORDINATOR'),linkedReferees=parts.filter(x=>(x.roleCategory||x.participantType)==='REFEREE'),linkedStaff=parts.filter(x=>x.participantType==='STAFF'&&!x.roleCategory);
  const participantNames=rows=>uniqueBy_(rows,x=>x.personId).map(x=>`<li>${escapeHtml(persons[x.personId]?.displayName||x.personId)}</li>`).join('');
  const starterNames=participantNames(linkedPlayers.filter(x=>roleByPerson[x.personId]==='STARTER'));
  const substituteNames=participantNames(linkedPlayers.filter(x=>roleByPerson[x.personId]==='SUBSTITUTE'));
  const otherPlayerNames=participantNames(linkedPlayers.filter(x=>!roleByPerson[x.personId]));
  const coachNames=participantNames(linkedCoaches),managerNames=participantNames(linkedManagers),collaboratorNames=participantNames(linkedCollaborators),coordinatorNames=participantNames(linkedCoordinators),refereeNames=participantNames(linkedReferees),staffNames=participantNames(linkedStaff);
  const trainingLinkedGroups=e.eventType==='TRAINING'?(otherPlayerNames||coachNames||managerNames||collaboratorNames||coordinatorNames||refereeNames||staffNames?`<div class="linked-people-grid training-linked-layout">${otherPlayerNames?`<div><h3>Jugadores</h3><ul>${otherPlayerNames}</ul></div>`:''}<div class="linked-staff-stack">${coachNames?`<div><h3>Entrenadores</h3><ul>${coachNames}</ul></div>`:''}${managerNames?`<div><h3>Managers / Delegados</h3><ul>${managerNames}</ul></div>`:''}${collaboratorNames?`<div><h3>Colaboradores</h3><ul>${collaboratorNames}</ul></div>`:''}${coordinatorNames?`<div><h3>Coordinadores</h3><ul>${coordinatorNames}</ul></div>`:''}${refereeNames?`<div><h3>Árbitros</h3><ul>${refereeNames}</ul></div>`:''}${staffNames?`<div><h3>Staff</h3><ul>${staffNames}</ul></div>`:''}</div></div>`:''):'';
  const linkedGroups=e.eventType==='TRAINING'?trainingLinkedGroups:((starterNames||substituteNames||otherPlayerNames||coachNames||managerNames||collaboratorNames||coordinatorNames||refereeNames||staffNames)?`<div class="linked-people-grid">${starterNames?`<div><h3>Titulares</h3><ul>${starterNames}</ul></div>`:''}${substituteNames?`<div><h3>Suplentes</h3><ul>${substituteNames}</ul></div>`:''}${otherPlayerNames?`<div><h3>Jugadores</h3><ul>${otherPlayerNames}</ul></div>`:''}${coachNames?`<div><h3>Entrenadores</h3><ul>${coachNames}</ul></div>`:''}${managerNames?`<div><h3>Managers / Delegados</h3><ul>${managerNames}</ul></div>`:''}${collaboratorNames?`<div><h3>Colaboradores</h3><ul>${collaboratorNames}</ul></div>`:''}${coordinatorNames?`<div><h3>Coordinadores</h3><ul>${coordinatorNames}</ul></div>`:''}${refereeNames?`<div><h3>Árbitros</h3><ul>${refereeNames}</ul></div>`:''}${staffNames?`<div><h3>Staff</h3><ul>${staffNames}</ul></div>`:''}</div>`:'');
  const attendancePanel=e.eventType==='TRAINING'&&e.status==='COMPLETED'?trainingAttendanceHtml_(parts,persons,e,canEdit):'';
  const surveyPanel=e.eventType==='TRAINING'&&e.status==='COMPLETED'?`<section class="post-training-survey"><div><span class="eyebrow">Post-entrenamiento</span><h2>Encuesta del entrenamiento</h2><p>La actividad ya finalizó. La encuesta quedará asociada a este entrenamiento cuando definamos sus preguntas.</p></div><span class="status-pill warning">Pendiente</span></section>`:'';
  const matchHeader=e.eventType==='MATCH'?matchHeaderHtml_(e,meta):activityHeaderHtml_(e,meta);
  shell(`${matchHeader}<section class="panel match-detail-panel">${e.notes&&e.eventType!=='MATCH'?`<div class="match-note">${escapeHtml(e.notes)}</div>`:''}${canEdit?`<div class="button-row event-actions">${['MATCH','TRAINING'].includes(e.eventType)?`<button class="button primary" id="event-availability">${['PENDING','SCHEDULED'].includes(e.status)?'Disponibilidad':'Disponibilidad previa'}</button>`:''}${e.eventType==='MATCH'?'<button class="button secondary" id="match-planning">Equipo / acta</button><button class="button secondary" id="match-format-duration">Formato / duración</button>':''}${e.eventType==='MATCH'&&d.canManageCompetitions?'<button class="button secondary" id="official-links">Enlaces oficiales</button>':''}${e.eventType!=='RECOVERY'&&(!['MATCH','TRAINING'].includes(e.eventType)||['PENDING','SCHEDULED'].includes(e.status))&&(!meta||e.eventType!=='MATCH')?'<button class="button secondary" id="edit-event">Editar</button>':''}${reportProtected?(e.status==='CANCELLED'?'<button class="button secondary" id="reactivate-activity">Reactivar</button>':''):((['PENDING','SCHEDULED'].includes(e.status)&&e.eventType!=='RECOVERY')?'<button class="button secondary" id="cancel-activity">Cancelar actividad</button>':e.status==='CANCELLED'?'<button class="button secondary" id="reactivate-activity">Reactivar</button>':'')}${e.eventType!=='REST'&&e.eventType!=='RECOVERY'&&['PENDING','SCHEDULED'].includes(e.status)?'<button class="button secondary" id="postpone-activity">Postergar</button>':''}${e.status==='POSTPONED'?'<button class="button secondary" id="reschedule-event">Reprogramar</button>':''}${reportProtected||e.sourceType==='TRAINING_PLAN'||e.eventType==='RECOVERY'?'':`<button class="button link danger-text" id="delete-event">Borrar</button>`}</div>`:(['MATCH','TRAINING'].includes(e.eventType)?`<div class="button-row"><button class="button primary" id="event-availability">${['PENDING','SCHEDULED'].includes(e.status)?'Disponibilidad':'Disponibilidad previa'}</button>${e.eventType==='MATCH'?'<button class="button secondary" id="match-planning">Equipo / acta</button>':''}</div>`:'')}<div id="editor-host"></div>${officialData?officialMatchSummaryHtml_(officialData,{compact:true}):''}<div class="panel-heading"><div><h2>${e.eventType==='MATCH'?'Personas vinculadas al partido':'Personas vinculadas a la actividad'}</h2><p>${reportProtected?'Jugadores y staff ya vinculados con Personas. El resumen oficial de arriba se muestra aunque todavía falte vincularlos.':'Participantes asociados operativamente a esta actividad.'}</p></div></div>${linkedGroups||emptyTable(reportProtected?'El acta todavía no tiene personas vinculadas. Usa “Vincular personas” y vuelve a aplicar/revisar el acta.':'Sin participantes asociados')}${attendancePanel}${surveyPanel}<div class="button-row"><button class="button secondary" id="back-calendar">Volver</button></div><div id="message" class="message"></div></section>`,'calendar');
  document.getElementById('back-calendar').onclick=renderCalendar;const eb=document.getElementById('edit-event');if(eb)eb.onclick=()=>renderEventEditor(eventId);const ea=document.getElementById('event-availability');if(ea)ea.onclick=()=>renderEventAvailability(eventId);const mp=document.getElementById('match-planning');if(mp)mp.onclick=()=>renderMatchPlanning(eventId);const mfd=document.getElementById('match-format-duration');if(mfd)mfd.onclick=()=>openMatchFormatDurationEditor_(e);const ol=document.getElementById('official-links');if(ol)ol.onclick=()=>openOfficialLinksEditor_(e);
  const changeState=async(status,payload={})=>{try{await call('setEventState',Object.assign({eventId,status},payload));calendarData=null;await renderEventDetail(eventId);}catch(err){showMessage(err.message,'error');}};
  const cb=document.getElementById('cancel-activity');if(cb)cb.onclick=()=>{if(confirm('¿Cancelar esta actividad? Se conservará en el historial.'))changeState('CANCELLED');};
  const pb=document.getElementById('postpone-activity');if(pb)pb.onclick=()=>{if(confirm('¿Marcar esta actividad como postergada? La fecha actual se mantiene hasta que la reprogrames.'))changeState('POSTPONED');};
  const rb=document.getElementById('reactivate-activity');if(rb)rb.onclick=()=>changeState('SCHEDULED');
  const rs=document.getElementById('reschedule-event');if(rs)rs.onclick=async()=>{const nd=prompt('Nueva fecha (AAAA-MM-DD):',e.eventDate||'');if(!nd)return;const nt=prompt('Nueva hora (HH:MM):',e.startTime||'')??'';await changeState('SCHEDULED',{eventDate:nd,startTime:nt});};
  const db=document.getElementById('delete-event');if(db)db.onclick=async()=>{if(!confirm('¿Borrar definitivamente esta actividad? Esta acción elimina convocatorias, disponibilidad y actas asociadas.'))return;try{await call('deleteEvent',{eventId});calendarData=null;await renderCalendar();}catch(err){showMessage(err.message,'error');}};
  document.querySelectorAll('[data-attendance]').forEach(sel=>sel.onchange=async()=>{try{await call('updateEventAttendance',{eventParticipantId:sel.dataset.attendance,attendanceStatus:sel.value});calendarData=null;showToast_('Asistencia actualizada.','success',2200);await renderEventDetail(eventId);}catch(err){showMessage(err.message,'error');}});
  const confirmAttendance=document.getElementById('confirm-training-attendance');if(confirmAttendance)confirmAttendance.onclick=async()=>{try{confirmAttendance.disabled=true;await call('closeTrainingAttendance',{eventId});calendarData=null;showToast_('Asistencia confirmada.','success',2200);await renderEventDetail(eventId);}catch(err){showMessage(err.message,'error');confirmAttendance.disabled=false;}};
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

function updateLeagueCompetitionOptions_(preferred=''){
  const div=val('league-division'),team=val('league-team');const select=document.getElementById('league-competition');if(!select)return;
  const comps=(calendarData?.competitions||[]).filter(c=>(c.status==='ACTIVE'||c.competitionId===preferred)&&c.divisionId===div&&(!c.teamId||c.teamId===team));
  select.innerHTML='<option value="">— Sin vincular; usar nombre del XLSX —</option>'+comps.map(c=>`<option value="${escapeHtml(c.competitionId)}">${escapeHtml(competitionDisplayNameClient_(c))}${c.teamId?' · equipo':''}</option>`).join('');
  if(preferred&&comps.some(c=>c.competitionId===preferred))select.value=preferred;
  else if(comps.length===1)select.value=comps[0].competitionId;
  else select.value='';
  const hint=document.getElementById('league-competition-links');if(hint){const c=comps.find(x=>x.competitionId===select.value);hint.innerHTML=c?`<div class="button-row compact-links">${competitionLinkButtons_(c)}</div>`:'';}
}

function baseRoundKeyForPreview_(roundName){const m=/^\s*Jornada\s+(\d+)/i.exec(String(roundName||''));return m?`Jornada ${m[1]}`:String(roundName||'').trim();}
function restRoundsForPreview_(data,clubName){
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const club=norm(clubName); if(!club)return [];
  const baseHasMatch={};
  (data.fixtures||[]).forEach(f=>{if(norm(f.homeTeam)===club||norm(f.awayTeam)===club)baseHasMatch[baseRoundKeyForPreview_(f.roundName)]=true;});
  const byBase={};
  (data.explicitRests||[]).filter(r=>norm(r.clubName)===club).forEach(r=>{const base=baseRoundKeyForPreview_(r.roundName);if(!baseHasMatch[base]&&!byBase[base])byBase[base]={roundName:r.roundName,eventDate:r.eventDate,source:'EXPLICIT'};});
  (data.rounds||[]).forEach(r=>{const base=baseRoundKeyForPreview_(r.roundName);if(!baseHasMatch[base]&&r.eventDate&&!byBase[base])byBase[base]={roundName:r.roundName,eventDate:r.eventDate,source:'IMPLICIT'};});
  return Object.values(byBase);
}
function formatLabel_(f){return ({SINGLE:'Partido único',TRIANGULAR:'Triangular',QUADRANGULAR:'Cuadrangular',CUSTOM:'Personalizado'})[f]||f||'—';}
function leagueFormatPlanClient_(data,clubName,division){
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(),club=norm(clubName),groups={},seen={};if(!club)return [];
  (data.fixtures||[]).forEach(f=>{if(norm(f.homeTeam)!==club&&norm(f.awayTeam)!==club)return;const date=String(f.eventDate||'').trim(),base=baseRoundKeyForPreview_(f.roundName),key=date?`DATE:${date}`:`ROUND:${base}`,fixtureKey=[date,String(f.startTime||''),norm(f.homeTeam),norm(f.awayTeam),String(f.roundName||'')].join('|');if(seen[fixtureKey])return;seen[fixtureKey]=true;if(!groups[key])groups[key]={eventDate:date,baseRoundName:base,roundNames:[],matchCount:0};groups[key].matchCount++;if(!groups[key].roundNames.includes(f.roundName))groups[key].roundNames.push(f.roundName);});
  return Object.entries(groups).map(([groupKey,g])=>{const count=g.matchCount,format=count===1?'SINGLE':count===2?'TRIANGULAR':count===3?'QUADRANGULAR':'CUSTOM';let total='',half='';if(format==='SINGLE'){total=division?.defaultMatchMinutes||'';half=division?.defaultHalfMinutes||'';}else if(format==='TRIANGULAR'){total=division?.triangularMatchMinutes||'';half=division?.triangularHalfMinutes||'';}else if(format==='QUADRANGULAR'){total=division?.quadrangularMatchMinutes||'';half=division?.quadrangularHalfMinutes||'';}return {groupKey,eventDate:g.eventDate,baseRoundName:g.baseRoundName,roundNames:g.roundNames,matchCount:count,matchFormat:format,matchDurationMinutes:total,halfDurationMinutes:half,durationSource:total?'AUTO_IMPORT':'PENDING'};});
}
function renderLeagueFormatPlan_(){
  if(!leagueImportState?.preview)return;const host=document.getElementById('league-format-plan');if(!host)return;const d=calendarData||{},division=(d.divisions||[]).find(x=>x.divisionId===val('league-division'))||{},plan=leagueFormatPlanClient_(leagueImportState.preview,val('league-club-name'),division);if(!plan.length){host.innerHTML='';return;}const rows=plan.map(x=>`<tr><td>${escapeHtml(x.eventDate||'—')}</td><td>${escapeHtml((x.roundNames||[]).join(', ')||x.baseRoundName||'—')}</td><td>${x.matchCount}</td><td>${escapeHtml(formatLabel_(x.matchFormat))}</td><td>${x.matchDurationMinutes?escapeHtml(x.matchDurationMinutes+' min'+(x.halfDurationMinutes?' ('+x.halfDurationMinutes+'+'+x.halfDurationMinutes+')':'')):'<span class="status-pill warning">Pendiente de confirmar</span>'}</td></tr>`).join('');host.innerHTML=`<div class="section-divider"></div><div class="section-heading"><h3>Formato detectado por fecha</h3><p>Se cuentan los partidos del club en la misma fecha: 1 = único · 2 = triangular · 3 = cuadrangular. Así funciona aunque la federación use jornadas o sub-jornadas distintas el mismo día.</p></div><div class="table-wrap compact-table"><table><thead><tr><th>Fecha</th><th>Jornada(s)</th><th>Partidos</th><th>Formato</th><th>Duración aplicada</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function renderLeagueImport(preferredCompetitionId=''){
  leagueImportPreferredCompetitionId=String(preferredCompetitionId||'');
  if(!calendarData){const r=await call('getCalendarData',{seasonId:selectedSeasonId_()});calendarData=r.data;}const d=calendarData;
  const preferred=(d.competitions||[]).find(c=>c.competitionId===leagueImportPreferredCompetitionId)||null;
  const sourceLinks=preferred?competitionLinkButtons_(preferred):'';
  shell(`<section class="hero compact"><span class="eyebrow">Competición</span><h1>Importar calendario oficial</h1><p>Analizá el XLSX de la federación y vinculalo a una competición configurada. Así podés separar 1ª ronda, 2ª ronda, Copa FAR u otros torneos de la misma división.</p>${sourceLinks?`<div class="button-row official-link-bar">${sourceLinks}</div>`:''}</section><section class="panel"><form id="league-preview-form" class="form-grid two"><label>Archivo XLSX<input id="league-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></label><div><button class="button primary" type="submit">Analizar archivo</button></div></form><div id="league-preview"></div><div class="button-row"><button class="button secondary" id="league-back">Volver</button></div><div id="message" class="message"></div></section>`,'calendar');
  document.getElementById('league-back').onclick=renderManualLoad_;
  document.getElementById('league-preview-form').onsubmit=async ev=>{ev.preventDefault();const f=document.getElementById('league-file').files?.[0];if(!f)return;const localBusy=beginUiBusy_('Leyendo calendario…');try{showMessage('Analizando calendario…');const dataUrl=await fileToDataUrl(f);endUiBusy_(localBusy);const {data}=await call('previewLeagueCalendarImport',{fileDataUrl:dataUrl,fileName:f.name,seasonId:selectedSeasonId_()});leagueImportState={previewId:data.previewId,fileName:f.name,preview:data};const rows=data.fixtures.map(x=>`<tr><td>${escapeHtml(x.roundName)}</td><td>${escapeHtml(x.eventDate)} ${escapeHtml(x.startTime||'')}</td><td>${escapeHtml(x.homeTeam)}</td><td>${escapeHtml(x.resultHome||'—')} - ${escapeHtml(x.resultAway||'—')}</td><td>${escapeHtml(x.awayTeam)}</td><td>${escapeHtml(x.refereeName||'—')}</td></tr>`).join('');
    const clubOptions=`<option value="">— Seleccionar nuestro club —</option>`+data.teams.map(t=>`<option value="${escapeHtml(t)}" ${t===data.suggestedClubCalendarName?'selected':''}>${escapeHtml(t)}</option>`).join('');
    document.getElementById('league-preview').innerHTML=`<div class="section-divider"></div><div class="section-heading"><h2>${escapeHtml(data.category||data.competition||'Competición')}</h2><p>${data.competition&&data.competition!==data.category?escapeHtml(data.competition)+' · ':''}${data.fixtureCount} partidos detectados.</p></div><div class="form-grid two"><label>Nuestro equipo detectado<select id="league-club-name">${clubOptions}</select></label><label>División detectada<select id="league-division"><option value="">— Seleccionar división —</option>${optionList(d.divisions,'divisionId',x=>x.name,data.suggestedDivisionId||'',false)}</select></label><label>Equipo<select id="league-team"></select></label><label>Competición configurada<select id="league-competition"></select><small>Opcional. Vincula este calendario con una fase/torneo concreto.</small></label></div><div id="league-competition-links"></div><div id="league-format-plan"></div><div class="table-wrap compact-table"><table><thead><tr><th>Jornada</th><th>Fecha</th><th>Local</th><th>Res.</th><th>Visitante</th><th>Árbitro</th></tr></thead><tbody>${rows}</tbody></table></div><button class="button primary" id="league-import-confirm">Importar partidos del club</button>`;
    const divSel=document.getElementById('league-division');if(data.suggestedDivisionId)divSel.value=data.suggestedDivisionId;
    updateLeagueTeamOptions_(data.suggestedTeamId||'');
    const preferredCompetition=leagueImportPreferredCompetitionId||data.suggestedCompetitionId||'';updateLeagueCompetitionOptions_(preferredCompetition);
    divSel.onchange=()=>{updateLeagueTeamOptions_('');updateLeagueCompetitionOptions_('');renderLeagueFormatPlan_();};
    document.getElementById('league-team').onchange=()=>updateLeagueCompetitionOptions_('');
    document.getElementById('league-competition').onchange=()=>updateLeagueCompetitionOptions_(val('league-competition'));
    document.getElementById('league-club-name').onchange=renderLeagueFormatPlan_;renderLeagueFormatPlan_();
    document.getElementById('league-import-confirm').onclick=commitLeagueImport;
    const detectedDivision=(d.divisions.find(x=>x.divisionId===data.suggestedDivisionId)||{}).name;
    const detectedClub=data.suggestedClubCalendarName||'sin coincidencia automática';
    const marker=data.detectedDivisionMarker||'sin categoría reconocida';
    const rests=restRoundsForPreview_(data,data.suggestedClubCalendarName);showMessage(`Archivo analizado. Club: ${detectedClub}. Categoría: ${marker}.${detectedDivision?' División: '+detectedDivision+'.':' Confirma la división.'}${rests.length?' Descansos detectados: '+rests.length+'.':''}`,'success');
  }catch(err){endUiBusy_(localBusy);showMessage(err.message+(err.requestId?` · Solicitud ${err.requestId}`:''),'error');}};
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
async function commitLeagueImport(withResolutions=false){if(!leagueImportState)return;const club=val('league-club-name'),division=val('league-division');if(!club)return showMessage('Selecciona cómo figura nuestro club en el calendario.','error');if(!division)return showMessage('Selecciona la división antes de importar.','error');const button=document.getElementById(withResolutions?'league-conflicts-apply':'league-import-confirm');if(button)button.disabled=true;try{const conflictResolutions={};if(withResolutions&&(leagueImportState.conflicts||[]).length){leagueImportState.conflicts.forEach(c=>{const checked=document.querySelector(`input[name="conflict-${c.conflictId}"]:checked`);if(checked)conflictResolutions[c.conflictId]=checked.value;});}showMessage(withResolutions?'Aplicando decisiones…':'Importando partidos…');const {data}=await call('importLeagueCalendar',{previewId:leagueImportState.previewId,fileName:leagueImportState.fileName,seasonId:selectedSeasonId_(),clubCalendarName:club,divisionId:division,teamId:val('league-team'),competitionId:val('league-competition'),conflictResolutions});if(data.requiresResolution){leagueImportState.conflicts=data.conflicts||[];const old=document.getElementById('league-conflicts');if(old)old.remove();renderLeagueConflicts_(leagueImportState.conflicts);showMessage('El calendario oficial cambió. Revisa los conflictos antes de importar.','info');if(button)button.disabled=false;return;}calendarData=null;leagueImportPreferredCompetitionId='';const pending=(data.formatPlan||[]).filter(x=>x.durationSource==='PENDING').length;alert(`Importación completada: ${data.imported} partidos nuevos, ${data.updated} actualizados, ${data.restImported||0} descansos. Formatos detectados: ${(data.formatPlan||[]).length}${pending?' · '+pending+' jornada(s) con duración pendiente':''}. Conflictos mantenidos: ${data.keptConflicts||0}; reemplazados: ${data.replacedConflicts||0}.`);renderCalendar();}catch(err){showMessage(err.message+(err.requestId?` · Solicitud ${err.requestId}`:''),'error');if(button)button.disabled=false;}}

function availabilityLabel(s){return ({AVAILABLE:'Disponible',UNAVAILABLE:'No disponible',MAYBE:'Duda'})[s]||'Sin respuesta';}
function matchScoreTypeLabel_(t){return ({E:'Ensayo',T:'Transformación',PC:'Golpe de castigo',D:'Drop',EC:'Ensayo de castigo'})[t]||t||'Puntuación';}
function matchChangeTypeLabel_(t){return ({CT:'Táctico',CL:'Lesión',CS:'Sangre',CC:'Conmoción',C1:'1ª línea',CJ:'Juego sucio'})[t]||t||'Cambio';}
function uniqueBy_(rows,keyFn){const seen=new Set();return (rows||[]).filter(x=>{const k=keyFn(x);if(!k||seen.has(k))return false;seen.add(k);return true;});}
function matchPresenceLabel_(stat,data){
  const key=stat.personId||stat.licenseNumber||stat.jerseyNumber;
  const summary=(data.presenceSummary||{})[key];
  if(!summary)return '—';
  return `${summary.minutesPlayed} min`;
}
function officialMatchSummaryHtml_(data,{compact=false}={}){
  const stats=uniqueBy_(data?.stats||[],x=>`${x.personId||x.licenseNumber||x.playerName}|${x.jerseyNumber}|${x.lineupRole}`), scores=uniqueBy_(data?.scoringEvents||[],x=>`${x.teamSide}|${x.jerseyNumber}|${x.eventType}|${x.minute}|${x.points}`), subs=uniqueBy_(data?.substitutionEvents||[],x=>`${x.teamSide}|${x.jerseyIn}|${x.jerseyOut}|${x.changeType}|${x.minute}`), cards=uniqueBy_(data?.disciplinaryEvents||[],x=>`${x.teamSide}|${x.jerseyNumber}|${x.cardType}|${x.reasonCode||''}|${x.minute}`), staff=uniqueBy_(data?.staffAppearances||[],x=>`${x.teamSide}|${x.personId||x.licenseNumber||x.staffName}|${x.staffRole}`);
  if(!stats.length&&!scores.length&&!subs.length&&!cards.length&&!staff.length)return '';
  const starters=stats.filter(x=>x.lineupRole==='STARTER');
  const substitutes=stats.filter(x=>x.lineupRole==='SUBSTITUTE');
  const captain=stats.find(x=>x.isCaptain==='TRUE');
  const points=scores.reduce((n,x)=>n+Number(x.points||0),0);
  const yellows=cards.filter(x=>x.cardType!=='RED').length, reds=cards.filter(x=>x.cardType==='RED').length;
  const scoreRows=scores.slice().sort((a,b)=>Number(a.minute||999)-Number(b.minute||999)).map(x=>`<li><span class="incident-minute">${escapeHtml(x.minute||'—')}'</span><strong>#${escapeHtml(x.jerseyNumber||'—')} ${escapeHtml(x.playerName||'')}</strong><span>${escapeHtml(matchScoreTypeLabel_(x.eventType))} · ${escapeHtml(String(x.points||0))} pts</span></li>`).join('');
  const subRows=subs.slice().sort((a,b)=>Number(a.minute||999)-Number(b.minute||999)).map(x=>`<li><span class="incident-minute">${escapeHtml(x.minute||'—')}'</span><strong>#${escapeHtml(x.jerseyIn||'—')} ${escapeHtml(x.playerInName||'')}</strong><span>entra por #${escapeHtml(x.jerseyOut||'—')} ${escapeHtml(x.playerOutName||'')} · ${escapeHtml(matchChangeTypeLabel_(x.changeType))}</span></li>`).join('');
  const cardRows=cards.slice().sort((a,b)=>Number(a.minute||999)-Number(b.minute||999)).map(x=>`<li><span class="incident-minute">${escapeHtml(x.minute||'—')}'</span><strong>#${escapeHtml(x.jerseyNumber||'—')} ${escapeHtml(x.playerName||'')}</strong><span>${x.cardType==='RED'?'Roja':'Amarilla'}${x.reasonCode?' · '+escapeHtml(x.reasonCode):''}</span></li>`).join('');
  const staffRows=staff.map(x=>`<li><strong>${escapeHtml(({COACH:'Entrenador',MANAGER:'Delegado',FIELD_DELEGATE:'Delegado de campo'})[x.staffRole]||x.staffRole||'Staff')}</strong><span>${escapeHtml(x.staffName||'—')}</span></li>`).join('');
  const substituteCards=substitutes.map(s=>{const sub=subs.find(x=>String(x.jerseyIn||'')===String(s.jerseyNumber||''));return `<article class="squad-person-card"><div><strong>#${escapeHtml(s.jerseyNumber||'—')} ${escapeHtml(s.playerName||'')}</strong><small>${escapeHtml(s.licenseNumber||'')}${s.status==='UNMATCHED'?' · Sin vincular':''}</small></div><span class="badge ${sub?'':'muted'}">${sub?`Entró ${escapeHtml(sub.minute||'—')}'`:'No ingresó'}</span></article>`}).join('');
  const starterRows=starters.map(s=>{const out=subs.find(x=>String(x.jerseyOut||'')===String(s.jerseyNumber||''));const cardCount=Number(s.yellowCards||0)+Number(s.redCards||0);return `<tr><td><strong>#${escapeHtml(s.jerseyNumber||'—')} ${escapeHtml(s.playerName||'')}</strong>${s.isCaptain==='TRUE'?'<span class="badge">Capitán</span>':''}<small>${escapeHtml(s.licenseNumber||'')}${s.status==='UNMATCHED'?' · Sin vincular':''}</small></td><td>${out?`${escapeHtml(out.minute||'—')}'`:'—'}</td><td>${escapeHtml(String(s.points||0))}</td><td>${cardCount?`${Number(s.yellowCards||0)?Number(s.yellowCards||0)+' A ':''}${Number(s.redCards||0)?Number(s.redCards||0)+' R':''}`:'—'}</td></tr>`}).join('');
  const sectionTitle=compact?'Resumen oficial del acta':'Resumen oficial de Marbella';
  return `<section class="official-match-summary ${compact?'compact':''}"><div class="section-heading"><h2>${sectionTitle}</h2><p>${stats.length} convocados · ${starters.length} titulares · ${substitutes.length} suplentes${captain?' · Capitán: '+escapeHtml(captain.playerName||''):''}</p></div><div class="match-kpi-row"><div class="match-kpi"><strong>${points}</strong><span>Puntos</span></div><div class="match-kpi"><strong>${subs.length}</strong><span>Cambios</span></div><div class="match-kpi"><strong>${yellows}</strong><span>Amarillas</span></div><div class="match-kpi"><strong>${reds}</strong><span>Rojas</span></div></div>${compact?'':`<div class="official-roster-grid"><div><h3>Titulares</h3><div class="table-wrap compact-table"><table><thead><tr><th>Jugador</th><th>Minutos</th><th>Pts</th><th>Tarjetas</th></tr></thead><tbody>${starterRows||'<tr><td colspan="4">Sin titulares consolidados</td></tr>'}</tbody></table></div></div><div><h3>Suplentes</h3><div class="squad-card-list">${substituteCards||'<p>Sin suplentes consolidados.</p>'}</div></div></div>`}<div class="official-incidents-grid">${scoreRows?`<div><h3>Puntos</h3><ul class="incident-list">${scoreRows}</ul></div>`:''}${subRows?`<div><h3>Cambios</h3><ul class="incident-list">${subRows}</ul></div>`:''}${cardRows?`<div><h3>Disciplina</h3><ul class="incident-list">${cardRows}</ul></div>`:''}${staffRows&&!compact?`<div><h3>Staff</h3><ul class="incident-list">${staffRows}</ul></div>`:''}</div></section>`;
}
async function renderMatchPlanning(eventId){
  try{const {data}=await call('getMatchPlanningData',{eventId});const e=data.event,lineMap={};data.lineup.forEach(l=>lineMap[l.personId]=l);
    const selectablePlayers=(data.players||[]).filter(p=>!(data.availabilityEffects?.[p.personId]||{}).blocked);
    const blockedPlayers=(data.players||[]).filter(p=>(data.availabilityEffects?.[p.personId]||{}).blocked);
    const playerRows=(data.players||[]).map(p=>{const eff=data.availabilityEffects?.[p.personId]||{state:'NORMAL'},l=(data.isOpenForAvailability&&eff.blocked)?null:lineMap[p.personId];return `<tr class="${eff.blocked?'availability-blocked-row':''}"><td><strong>${escapeHtml(p.displayName)}</strong>${eff.state!=='NORMAL'?`<small>${escapeHtml(availabilityRestrictionText_(eff,'MATCH'))}</small>`:''}</td><td>${eff.blocked?'<span class="status-pill danger">No disponible</span>':'<span class="status-pill success">Disponible</span>'}</td><td>${eff.blocked?'No seleccionable':(l?`${l.lineupRole==='STARTER'?'Titular':'Suplente'}${l.orderNo?' · orden '+escapeHtml(l.plannedOrderNo||l.orderNo):''}${l.jerseyNumber?' · #'+escapeHtml(l.jerseyNumber):''}`:'No convocado')}</td></tr>`}).join('');
    const lineupEditor=data.canEditLineup?`<div class="section-divider"></div><div class="section-heading"><h2>Armar equipo</h2><p>Solo aparecen como seleccionables los jugadores activos sin baja o ausencia que bloquee este partido. Seleccioná, ordená y asigná dorsal.</p></div><div class="lineup-builder">${selectablePlayers.map(p=>{const l=lineMap[p.personId],plannedOrder=l?.plannedOrderNo||l?.orderNo||'';return `<label class="lineup-row"><input type="checkbox" data-lineup-person="${p.personId}" ${l?'checked':''}><span>${escapeHtml(p.displayName)}</span><select data-lineup-role="${p.personId}"><option value="STARTER" ${l?.lineupRole==='STARTER'?'selected':''}>Titular</option><option value="SUBSTITUTE" ${l?.lineupRole==='SUBSTITUTE'?'selected':''}>Suplente</option></select><input data-lineup-order="${p.personId}" type="number" min="1" max="99" inputmode="numeric" placeholder="Orden" value="${escapeHtml(plannedOrder)}" title="Orden planificado"><input data-lineup-number="${p.personId}" placeholder="Dorsal" maxlength="3" value="${escapeHtml(l?.jerseyNumber||'')}"></label>`}).join('')}</div>${blockedPlayers.length?`<div class="info-strip"><strong>${blockedPlayers.length} no seleccionable(s).</strong> ${escapeHtml(blockedPlayers.map(p=>p.displayName).join(', '))}</div>`:''}<button class="button primary" id="save-lineup">Guardar convocatoria/equipo</button>`:(data.canManage?`<div class="section-divider"></div><div class="info-strip"><strong>Equipo cerrado.</strong> La convocatoria solo se puede modificar mientras el partido está Pendiente o Programado.</div>`:'');
    const reports=(data.reports||[]).map(r=>`<li><strong>${escapeHtml(r.originalName)}</strong> · ${escapeHtml(r.status)}${r.parsedAt?` · <small>extraído ${escapeHtml(r.parsedAt)}</small>`:''} <button class="button mini secondary" data-report-view="${r.reportId}">Ver</button> <button class="button mini secondary" data-report-refresh="${r.reportId}">Reprocesar acta</button>${r.status==='PARSED'||r.status==='REVIEWED'?` <button class="button mini secondary" data-report-people="${r.reportId}">Vincular personas</button> <button class="button mini primary" data-report-apply="${r.reportId}">${r.status==='REVIEWED'?'Ver datos del acta':'Revisar datos'}</button>`:''}</li>`).join('');const reportBlock=data.canManage?`<div class="section-divider"></div><div class="section-heading"><h2>Acta oficial</h2><p>El PDF oficial es la fuente documental. Reprocesar vuelve a interpretar el mismo archivo y sincroniza los datos oficiales sin duplicarlos. Vincular personas relaciona jugadores y staff con Personas; Los datos válidos se aplican automáticamente al cargar el acta; Revisar datos queda disponible para comprobarlos o corregirlos después.</p></div><form id="report-form" class="form-grid two"><label>Acta PDF<input id="report-file" type="file" accept="application/pdf,.pdf" required></label><div><button class="button secondary" type="submit">Subir acta</button></div></form>${reports?`<ul class="file-list">${reports}</ul>`:''}<div id="report-review-panel"></div>`:'';
    const statsTotals=(data.stats||[]).reduce((o,s)=>{o.players++;o.starters+=s.lineupRole==='STARTER'?1:0;o.subs+=s.lineupRole==='SUBSTITUTE'?1:0;o.points+=Number(s.points||0);o.yellow+=Number(s.yellowCards||0);o.red+=Number(s.redCards||0);return o;},{players:0,starters:0,subs:0,points:0,yellow:0,red:0});
    const starterStats=(data.stats||[]).filter(s=>s.lineupRole==='STARTER');
    const advancedRows=starterStats.map(s=>`<tr data-stat-row><td><strong>${escapeHtml(s.playerName||'Sin identificar')}</strong><small>#${escapeHtml(s.jerseyNumber||'—')} · ${escapeHtml(s.licenseNumber||'')}${s.isCaptain==='TRUE'?' · Capitán':''}</small><input type="hidden" data-stat-field="isCaptain" value="${escapeHtml(s.isCaptain||'FALSE')}"><input type="hidden" data-stat-field="personId" value="${escapeHtml(s.personId||'')}"><input type="hidden" data-stat-field="playerName" value="${escapeHtml(s.playerName||'')}"><input type="hidden" data-stat-field="licenseNumber" value="${escapeHtml(s.licenseNumber||'')}"><input type="hidden" data-stat-field="jerseyNumber" value="${escapeHtml(s.jerseyNumber||'')}"><input type="hidden" data-stat-field="lineupRole" value="STARTER"></td><td>${escapeHtml(matchPresenceLabel_(s,data))}</td><td><input class="stat-mini" data-stat-field="tries" type="number" min="0" value="${escapeHtml(s.tries||'0')}"></td><td><input class="stat-mini" data-stat-field="conversions" type="number" min="0" value="${escapeHtml(s.conversions||'0')}"></td><td><input class="stat-mini" data-stat-field="penalties" type="number" min="0" value="${escapeHtml(s.penalties||'0')}"></td><td><input class="stat-mini" data-stat-field="drops" type="number" min="0" value="${escapeHtml(s.drops||'0')}"></td><td><input class="stat-mini" data-stat-field="points" type="number" min="0" value="${escapeHtml(s.points||'0')}"></td><td><input class="stat-mini" data-stat-field="yellowCards" type="number" min="0" value="${escapeHtml(s.yellowCards||'0')}"></td><td><input class="stat-mini" data-stat-field="redCards" type="number" min="0" value="${escapeHtml(s.redCards||'0')}"></td></tr>`).join('');
    const statsBlock=(data.stats||[]).length?`<div class="section-divider"></div>${officialMatchSummaryHtml_(data)}${data.canManage&&advancedRows?`<details class="advanced-stats"><summary>Correcciones avanzadas de titulares</summary><p>Usá esta tabla solo si necesitás corregir manualmente los totales consolidados del acta.</p><div class="table-wrap"><table><thead><tr><th>Jugador</th><th>Minutos</th><th>E</th><th>T</th><th>PC</th><th>D</th><th>Pts</th><th>Amar.</th><th>Rojas</th></tr></thead><tbody>${advancedRows}</tbody></table></div><button class="button secondary" id="save-match-stats">Guardar correcciones</button></details>`:''}`:'';
    const incidentsBlock='';
    const staffRoleLabel=r=>({COACH:'Entrenador',MANAGER:'Delegado',FIELD_DELEGATE:'Delegado de campo',STAFF:'Staff'})[r]||r||'Staff';
    const staffBlock=data.staffAppearances?.length?`<div class="section-divider"></div><div class="section-heading"><h2>Staff de Marbella en acta</h2><p>Solo se muestran miembros del club detectados en el acta oficial.</p></div><div class="table-wrap compact-table"><table><thead><tr><th>Nombre</th><th>Rol</th><th>Licencia</th><th>Vínculo</th></tr></thead><tbody>${data.staffAppearances.map(x=>`<tr><td>${escapeHtml(x.staffName||'—')}</td><td>${escapeHtml(staffRoleLabel(x.staffRole))}</td><td>${escapeHtml(x.licenseNumber||'—')}</td><td>${x.status==='LINKED'?'Vinculado':x.status==='INFO_ONLY'?'Dato del acta':'Pendiente'}</td></tr>`).join('')}</tbody></table></div>`:'';
    const planningHeader=matchHeaderHtml_(e,data.leagueMeta||data.meta||null,{compact:true});
    shell(`${planningHeader}<section class="panel match-workspace-panel"><div class="panel-heading"><div><h2>${data.isOpenForAvailability?'Disponibilidad automática':'Disponibilidad previa'}</h2><p>${data.isOpenForAvailability?'Todo jugador activo de la división está disponible salvo que tenga una baja o ausencia vigente.':'La disponibilidad quedó congelada cuando el partido dejó de estar Pendiente/Programado.'}</p></div></div><div class="attendance-summary"><span><strong>${selectablePlayers.length}</strong> seleccionables</span><span><strong>${blockedPlayers.length}</strong> no disponibles</span><span><strong>${data.isOpenForAvailability?(data.lineup||[]).filter(l=>!(data.availabilityEffects?.[l.personId]||{}).blocked).length:(data.lineup||[]).length}</strong> convocados</span></div><div class="table-wrap"><table><thead><tr><th>Jugador</th><th>Estado</th><th>Equipo</th></tr></thead><tbody>${playerRows}</tbody></table></div>${lineupEditor}${reportBlock}${statsBlock}${incidentsBlock}${staffBlock}<div class="button-row"><button class="button secondary" id="planning-back">Volver al partido</button></div><div id="message" class="message"></div></section>`,'calendar');
    document.getElementById('planning-back').onclick=()=>renderEventDetail(eventId);
    const sb=document.getElementById('save-lineup');if(sb)sb.onclick=async()=>{try{const lineup=[];document.querySelectorAll('[data-lineup-person]').forEach(ch=>{if(ch.checked){const id=ch.dataset.lineupPerson;lineup.push({personId:id,lineupRole:document.querySelector(`[data-lineup-role="${id}"]`).value,orderNo:document.querySelector(`[data-lineup-order="${id}"]`)?.value||'',jerseyNumber:document.querySelector(`[data-lineup-number="${id}"]`).value});}});await call('saveMatchLineup',{eventId,lineup});showToast_('Equipo guardado.');await renderMatchPlanning(eventId);}catch(err){showMessage(err.message,'error');}};
    const ss=document.getElementById('save-match-stats');if(ss)ss.onclick=async()=>{showMessage('Las correcciones manuales de totales se deshabilitaron temporalmente para no eliminar suplentes. Las incidencias del acta son la fuente de verdad.','warning');};
    const rf=document.getElementById('report-form');if(rf)rf.onsubmit=async ev=>{ev.preventDefault();const f=document.getElementById('report-file').files?.[0];if(!f)return;let uploaded=false;const localBusy=beginUiBusy_('Leyendo PDF…');try{showMessage('Leyendo PDF y subiendo acta…');const dataUrl=await fileToDataUrl(f);let nativeText='';try{nativeText=await extractNativePdfText_(f);}catch(ignore){}endUiBusy_(localBusy);const {data:r}=await call('uploadMatchReport',{eventId,fileDataUrl:dataUrl,originalName:f.name,sourceText:nativeText});uploaded=true;if(r.autoApplied)showMessage('Acta guardada, procesada y aplicada automáticamente. Podés abrir Revisar datos si querés comprobar o corregir lo importado.'+(r.unmatched?' Quedaron '+r.unmatched+' persona(s) sin vincular.':''),'success');else if(r.ocrAvailable)showMessage('Acta guardada y procesada, pero requiere revisión antes de aplicarse.','warning');else showMessage('Acta guardada. '+(r.ocrMessage||r.ocrReason||'La extracción queda pendiente')+'.','warning');}catch(err){endUiBusy_(localBusy);showMessage(userErrorText_(err),'error');return;}if(uploaded){try{await renderMatchPlanning(eventId);}catch(err){showMessage('El acta se guardó correctamente, pero no se pudo refrescar la pantalla: '+userErrorText_(err),'warning');}}};
    document.querySelectorAll('[data-report-view]').forEach(b=>b.onclick=async()=>{try{const {data:f}=await call('getMatchReportFile',{reportId:b.dataset.reportView});const w=window.open();if(w)w.document.write(`<iframe src="${f.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`);}catch(err){showMessage(userErrorText_(err),'error');}});document.querySelectorAll('[data-report-refresh]').forEach(b=>b.onclick=async()=>{const btn=b;btn.disabled=true;const localBusy=beginUiBusy_('Leyendo acta original…');try{showMessage('Reprocesando el acta y sincronizando datos detectados…');let sourceText='';try{const {data:file}=await call('getMatchReportFile',{reportId:b.dataset.reportRefresh});if(file?.dataUrl)sourceText=await extractNativePdfText_(file.dataUrl);}catch(nativeErr){console.warn('No se pudo refrescar el texto nativo del PDF; se usará caché/OCR.',nativeErr);}endUiBusy_(localBusy);const {data:r}=await call('reprocessMatchReport',{reportId:b.dataset.reportRefresh,sourceText});if(!r.ok){showMessage((r.ocrMessage||r.ocrReason||'No se pudo reprocesar el acta.')+(r.phase?' · Fase '+r.phase:''),'error');return;}showMessage(sourceText?'Acta reprocesada desde el PDF original. La revisión se sincronizó sin crear duplicados.':(r.fromCache?'Acta reprocesada usando texto guardado. La revisión se sincronizó sin crear duplicados.':'Acta reprocesada con '+(r.ocrEngine||'extracción automática')+'.'),'success');renderMatchReportReviewPanel_(r.review,b.dataset.reportRefresh,eventId);}catch(err){showMessage(userErrorText_(err),'error');}finally{endUiBusy_(localBusy);btn.disabled=false;}});document.querySelectorAll('[data-report-people]').forEach(b=>b.onclick=()=>reviewAndCreateReportPeople(b.dataset.reportPeople,eventId));document.querySelectorAll('[data-report-apply]').forEach(b=>b.onclick=()=>reviewAndApplyReport(b.dataset.reportApply,eventId));
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudo cargar el partido</h1><p>${escapeHtml(err.message)}</p></section>`,'calendar');}
}
async function reviewAndCreateReportPeople(reportId,eventId){try{
  const {data:review}=await call('getMatchReportReview',{reportId});
  const candidates=(review.unmatched||[]).filter(x=>x.kind==='PLAYER'||['COACH','MANAGER'].includes(x.staffRole));
  if(!candidates.length){alert('No hay personas nuevas pendientes en esta acta. Las personas detectadas ya están vinculadas por licencia o nombre.');return;}
  const roleLabel=x=>x.kind==='PLAYER'?'Jugador':({COACH:'Entrenador',MANAGER:'Delegado',FIELD_DELEGATE:'Delegado de campo'}[x.staffRole]||'Staff');
  const lines=candidates.map((x,i)=>`${i+1}. ${x.name} · ${roleLabel(x)}${x.licenseNumber?' · Lic. '+x.licenseNumber:''}`).join('\n');
  if(!confirm(`Personas de Marbella no encontradas en la base:\n\n${lines}\n\n¿Crearlas ahora?\n\nJugadores, entrenador y delegado se asignarán a la división/equipo del partido. El delegado de campo no crea ni vincula personas automáticamente; queda como dato oficial del partido.`))return;
  showMessage('Creando y vinculando personas desde el acta…');
  const {data:r}=await call('createMatchReportPeople',{reportId,keys:candidates.map(x=>x.key)});
  alert(`Proceso completado. Creadas: ${r.created}. Omitidas/vinculadas: ${r.skipped}.`);
  await renderMatchPlanning(eventId);
}catch(err){showMessage(err.message,'error');}}

function renderMatchReportReviewPanel_(review,reportId,eventId){
  const host=document.getElementById('report-review-panel');if(!host)return;
  const ex=review.summary||{},side=review.clubSide==='HOME'?'Local':'Visitante',linked=(review.linked||[]).length,pending=(review.unmatched||[]).length,v=review.validation||{};
  const players=(review.players||[]).slice().sort((a,b)=>Number(a.orderNo||999)-Number(b.orderNo||999)).map(x=>`<tr><td>${escapeHtml(x.orderNo||'—')}</td><td>${escapeHtml(x.jerseyNumber||'—')}</td><td>${escapeHtml(x.name||'')}</td><td>${escapeHtml(x.licenseNumber||'—')}</td><td>${x.lineupRole==='STARTER'?'Titular':'Suplente'}${x.isCaptain?' · Capitán':''}</td><td>${x.status==='LINKED'?'Vinculado':'Pendiente'}</td></tr>`).join('');
  const staff=(review.staff||[]).map(x=>`<tr><td>${escapeHtml(({COACH:'Entrenador',MANAGER:'Delegado',FIELD_DELEGATE:'Delegado de campo'}[x.staffRole]||x.staffRole))}</td><td>${escapeHtml(x.name||'—')}</td><td>${escapeHtml(x.licenseNumber||'—')}</td><td>${x.status==='LINKED'?'Vinculado':x.status==='INFO_ONLY'?'Dato del acta':'Pendiente'}</td></tr>`).join('');
  const score=(review.scoringEvents||[]).map(x=>`<li>#${escapeHtml(x.jerseyNumber)} · ${escapeHtml(x.eventType)} · min ${escapeHtml(x.minute)} · ${escapeHtml(String(x.points||0))} pt</li>`).join('');
  const subs=(review.substitutions||[]).map(x=>`<li>#${escapeHtml(x.jerseyIn)} por #${escapeHtml(x.jerseyOut)} · ${escapeHtml(x.changeType||'Cambio')} · min ${escapeHtml(x.minute||'—')}</li>`).join('');
  const cards=(review.disciplinaryEvents||[]).map(x=>`<li>#${escapeHtml(x.jerseyNumber)} · ${x.cardType==='RED'?'Roja':'Amarilla'} · min ${escapeHtml(x.minute)}</li>`).join('');
  const errors=(v.errors||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join(''),warnings=(v.warnings||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('');
  host.innerHTML=`<div class="section-divider"></div><div class="section-heading"><h2>Revisión del acta</h2><p>Marbella detectado como <strong>${escapeHtml(side)}</strong>. Parser ${escapeHtml(review.parserVersion||'')}. No se aplicará nada hasta confirmar.</p></div><div class="form-grid two"><label>Equipo local<input id="report-review-home" value="${escapeHtml(ex.homeTeam||'')}" readonly></label><label>Equipo visitante<input id="report-review-away" value="${escapeHtml(ex.awayTeam||'')}" readonly></label><label>Resultado local<input id="report-review-rh" value="${escapeHtml(ex.resultHome||'')}"></label><label>Resultado visitante<input id="report-review-ra" value="${escapeHtml(ex.resultAway||'')}"></label><label>Ubicación / campo<input id="report-review-location" value="${escapeHtml(ex.location||'')}"></label><label>Árbitro<input id="report-review-referee" value="${escapeHtml(ex.refereeName||'')}"></label></div><div class="event-summary"><p><strong>Jugadores Marbella:</strong> ${v.playerCount??(review.players||[]).length} · Titulares: ${v.starterCount??'—'} · Suplentes: ${v.substituteCount??'—'}</p><p><strong>Puntos calculados:</strong> ${v.calculatedPoints??0}${v.officialPoints!==null&&v.officialPoints!==undefined?' / oficial '+v.officialPoints:''} · <strong>Cambios:</strong> ${v.substitutionCount??0} · <strong>Amarillas:</strong> ${v.yellowCount??0} · <strong>Rojas:</strong> ${v.redCount??0}</p><p><strong>Personas vinculadas:</strong> ${linked} · <strong>Pendientes:</strong> ${pending}</p></div>${errors?`<div class="message error"><strong>No se puede aplicar todavía:</strong><ul>${errors}</ul></div>`:''}${warnings?`<div class="message warning"><strong>Revisar:</strong><ul>${warnings}</ul></div>`:''}${players?`<h3>Jugadores de Marbella</h3><div class="table-wrap"><table><thead><tr><th>Orden</th><th>Dorsal</th><th>Jugador</th><th>Licencia</th><th>Convocatoria</th><th>Vínculo</th></tr></thead><tbody>${players}</tbody></table></div>`:''}${staff?`<h3>Staff de Marbella</h3><div class="table-wrap"><table><thead><tr><th>Función</th><th>Nombre</th><th>Licencia / Nº acta</th><th>Vínculo</th></tr></thead><tbody>${staff}</tbody></table></div>`:''}<div class="form-grid three"><div><h3>Puntos</h3>${score?`<ul>${score}</ul>`:'<p>Sin anotaciones.</p>'}</div><div><h3>Cambios</h3>${subs?`<ul>${subs}</ul>`:'<p>Sin cambios detectados.</p>'}</div><div><h3>Tarjetas</h3>${cards?`<ul>${cards}</ul>`:'<p>Sin tarjetas.</p>'}</div></div><div class="button-row"><button class="button primary" id="report-review-apply" ${v.ok===false?'disabled':''}>Aplicar datos del acta</button><button class="button secondary" id="report-review-cancel">Cerrar revisión</button></div>`;
  host.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('report-review-cancel').onclick=()=>{host.innerHTML='';};
  const apply=document.getElementById('report-review-apply');if(apply)apply.onclick=async()=>{try{if(v.ok===false)return showMessage('Corrige o reprocesa el acta antes de aplicarla.','error');const confirmed={homeTeam:ex.homeTeam||'',awayTeam:ex.awayTeam||'',resultHome:val('report-review-rh'),resultAway:val('report-review-ra'),refereeName:val('report-review-referee'),eventDate:ex.eventDate||'',startTime:ex.startTime||'',location:val('report-review-location')};showMessage('Aplicando datos del acta…');await call('applyMatchReport',{reportId,confirmed,reviewNotes:'Revisado desde interfaz · parser '+(review.parserVersion||'')});calendarData=null;alert('Acta aplicada y sincronizada: los datos oficiales anteriores de este partido fueron actualizados, no duplicados.');renderEventDetail(eventId);}catch(err){showMessage(err.message,'error');}};
}
async function reviewAndApplyReport(reportId,eventId){try{
  let {data:review}=await call('getMatchReportReview',{reportId});
  const unmatched=(review.unmatched||[]).filter(x=>x.kind==='PLAYER'||['COACH','MANAGER'].includes(x.staffRole));
  if(unmatched.length){const preview=unmatched.slice(0,12).map(x=>`• ${x.name}${x.staffRole&&x.staffRole!=='PLAYER'?' · '+({COACH:'Entrenador',MANAGER:'Delegado',FIELD_DELEGATE:'Delegado de campo'}[x.staffRole]||x.staffRole):''}${x.licenseNumber?' · '+x.licenseNumber:''}`).join('\n');const more=unmatched.length>12?`\n… y ${unmatched.length-12} más.`:'';const canCreatePeople=!!currentAccessProfile_().isAdmin;if(canCreatePeople&&confirm(`Hay ${unmatched.length} personas de Marbella sin vincular:\n\n${preview}${more}\n\n¿Crear estas personas desde el acta?\nLos jugadores se asignarán a la división; entrenador/delegado conservarán su alcance correspondiente. El delegado de campo solo se registrará como dato del partido.`)){showMessage('Vinculando personas del acta…');const created=await call('createMatchReportPeople',{reportId,keys:unmatched.map(x=>x.key)});review=created.data.review;}else if(!canCreatePeople){alert(`Hay ${unmatched.length} personas sin vincular. Un administrador puede crearlas desde el acta.\n\n${preview}${more}`);}}
  renderMatchReportReviewPanel_(review,reportId,eventId);
}catch(err){showMessage(err.message,'error');}}
