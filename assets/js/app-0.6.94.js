const FRONTEND_BUILD = '0.6.94';
const config = window.APP_BOOTSTRAP || {};
const publicBranding = config.branding || {};
const root = document.getElementById('app');
const SESSION_STORAGE_KEY = 'gestionClub.sessionToken';
const APP_BOOTSTRAP_CACHE_KEY = 'gestionClub.bootstrap.v2';
const RUNTIME_MAINTENANCE_SESSION_KEY = 'gestionClub.maintenance.0.6.81';
let sessionToken = sessionStorage.getItem(SESSION_STORAGE_KEY) || '';
let currentUser = null;
let simulationCandidates = [];
let simulationState = {personId:'',displayName:'',email:'',accessProfile:null,allowActions:false};
let clubConfig = null;
let structureData = null;
let statisticsData = null;
let statisticsDataCacheKey = '';
let statisticsDataCachedAt = 0;
let refereeStatisticsData = null;
let refereeStatisticsDataCacheKey = '';
let refereeStatisticsDataCachedAt = 0;
let trainingLibraryData = null;
let seasonContext = null;
let familyData = null;
let structureSection = 'people';
let settingsSection = 'general';
let dashboardNextRefreshTimer = null;
let performanceFilterState_={version:'CURRENT',period:'TODAY'};
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


const PERFORMANCE_HISTORY_KEY='gestionClub.performance.v1';
const PERFORMANCE_HISTORY_DAYS=7;
const PERFORMANCE_HISTORY_LIMIT=300;
function performanceHistory_(){
  try{
    const rows=JSON.parse(localStorage.getItem(PERFORMANCE_HISTORY_KEY)||'[]');
    const min=Date.now()-PERFORMANCE_HISTORY_DAYS*86400000;
    return (Array.isArray(rows)?rows:[]).filter(x=>Number(x.at||0)>=min).slice(-PERFORMANCE_HISTORY_LIMIT);
  }catch(_){return [];}
}
function savePerformanceHistory_(rows){try{localStorage.setItem(PERFORMANCE_HISTORY_KEY,JSON.stringify((rows||[]).slice(-PERFORMANCE_HISTORY_LIMIT)));}catch(_){}}
function recordPerformanceMetric_(action,response,roundTripMs,success=true,transportError=''){
  const a=String(action||'');
  if(['getPerformanceData','status','runRuntimeMaintenance'].includes(a))return;
  const server=response?.meta?.performance||{};
  const row={
    at:Date.now(),action:a,category:String(server.category||performanceCategoryClient_(a)),success:!!success,
    roundTripMs:Math.max(0,Math.round(roundTripMs||0)),serverMs:Number(server.serverMs||0),sheetReadMs:Number(server.sheetReadMs||0),sheetWriteMs:Number(server.sheetWriteMs||0),urlFetchMs:Number(server.urlFetchMs||0),telemetryMs:Number(server.telemetryMs||0),
    sheetReads:Number(server.sheetReads||0),sheetWrites:Number(server.sheetWrites||0),rowsRead:Number(server.rowsRead||0),rowsWritten:Number(server.rowsWritten||0),baseSheetReads:Number(server.baseSheetReads||0),snapshotStoreReads:Number(server.snapshotStoreReads||0),
    requestCacheHits:Number(server.requestCacheHits||0),requestCacheMisses:Number(server.requestCacheMisses||0),scriptCacheHits:Number(server.scriptCacheHits||0),scriptCacheMisses:Number(server.scriptCacheMisses||0),
    snapshotType:String(server.snapshotType||''),snapshotState:String(server.snapshotState||''),snapshotReadMs:Number(server.snapshotReadMs||0),snapshotRebuildMs:Number(server.snapshotRebuildMs||0),snapshotHits:Number(server.snapshotHits||0),snapshotMisses:Number(server.snapshotMisses||0),snapshotStales:Number(server.snapshotStales||0),snapshotRebuilds:Number(server.snapshotRebuilds||0),snapshotHitPct:Number(server.snapshotHitPct||0),
    payloadBytes:Number(server.payloadBytes||0),sheetsTouched:Number(server.sheetsTouched||0),phases:(server.phases&&typeof server.phases==='object'?server.phases:{}),level:String(server.level||''),errorCode:String(response?.error?.code||transportError||''),appVersion:String(response?.meta?.appVersion||server.appVersion||config.appVersion||FRONTEND_BUILD||'')
  };
  const rows=performanceHistory_();rows.push(row);savePerformanceHistory_(rows);
}
function performancePercentileClient_(values,pct){const nums=(values||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!nums.length)return 0;return nums[Math.min(nums.length-1,Math.max(0,Math.ceil((pct/100)*nums.length)-1))];}
function performanceFormatBytes_(bytes){const n=Number(bytes||0);if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(n<10240?1:0)} KB`;return `${(n/(1024*1024)).toFixed(1)} MB`;}
function performancePhaseText_(phases){const p=phases&&typeof phases==='object'?phases:{};return ['AUTH_LOOKUP','AUTH_CRYPTO','SESSION_CREATE','BOOTSTRAP_READ','BOOTSTRAP_REBUILD'].filter(k=>Number(p[k]||0)>0).map(k=>`${k.replace('AUTH_','').replace('SESSION_','').replace('BOOTSTRAP_','BOOT ')} ${Math.round(Number(p[k]||0))} ms`).join(' · ');}
function performanceActionLabel_(action){return ({getHomeDashboard:'Mi semana',getCalendarListData:'Calendario',getCalendarData:'Detalle calendario',getEventDetailHeaderData:'Cabecera de actividad',getStatisticsData:'Estadísticas',getRefereeStatisticsData:'Estadísticas arbitrales',getTrainingExercisesData:'Ejercicios',getMatchPlanningData:'Partido',getMatchSummaryFast:'Partido · Resumen',getMatchLineupFast:'Partido · Convocados',getMatchSurveyFast:'Partido · Encuesta',getMatchSectionState:'Sección de partido',getRefereeCoordinationData:'Coordinación árbitros',getRefereeMatchWorkspaceData:'Ficha arbitral',getStructureData:'Estructura',getCompetitionsData:'Competiciones',getRefereeSourcesData:'Fuentes FAR',syncAllFar:'Sincronización FAR completa',dailyFarSync:'Sincronización FAR automática',refreshMatchOfficialReport:'Acta FAR del partido',getAppBootstrap:'Inicio de sesión',status:'Estado técnico'})[action]||action||'Operación';}
function performanceCategoryClient_(action){const a=String(action||'');if(['syncCompetitionFromWeb','syncRefereeSource','syncAllFar','dailyFarSync','processCompetitionOfficialReports','refreshMatchOfficialReport','refreshMatchReportOfficialData','refreshRefereeMatchOfficialDocument'].includes(a))return 'SYNC_EXTERNAL';if(/^(save|create|update|delete|remove|set|assign|mark|close|reopen|import|apply|reprocess|upload)/i.test(a))return 'WRITE';return 'INTERACTIVE';}


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
  simulationCandidates=Array.isArray(d.simulationCandidates)?d.simulationCandidates:simulationCandidates;
  if(d.clubConfig){const retainedLogo=clubConfig?.logoDataUrl||publicBranding?.logoDataUrl||'';clubConfig=Object.assign({},clubConfig||{},d.clubConfig||{});if(!clubConfig.logoDataUrl&&retainedLogo)clubConfig.logoDataUrl=retainedLogo;applyClubTheme(clubConfig);}
  if(d.seasonContext){seasonContext=d.seasonContext;const selected=selectedSeasonId_();if(selected!==String(loadUiState_().selectedSeasonId||''))saveUiStatePatch_({selectedSeasonId:selected});}
  writeBootstrapCache_({actor:d.actor||null,clubConfig:d.clubConfig||null,seasonContext:d.seasonContext||null,simulationCandidates:simulationCandidates||[],cachedAt:new Date().toISOString()});
}
function currentNavKey_(){const active=document.querySelector('[data-nav].active');return active?.dataset?.nav||'';}
function refreshSimulationSelectOptions_(){
  const select=document.getElementById('global-simulation-person');if(!select||simulationActive_())return;
  select.innerHTML='<option value="">Administrador</option>'+(simulationCandidates||[]).map(x=>`<option value="${escapeHtml(x.personId)}">${escapeHtml(x.displayName||x.email)}${x.email?` · ${escapeHtml(x.email)}`:''}</option>`).join('');
}
function scheduleRuntimeMaintenance_(){
  // 0.6.78: no se ejecutan migraciones ni mantenimiento pesado al iniciar sesión.
  // Solo se difieren datos administrativos y se verifica/instala el trigger FAR.
  if(!currentAccessProfile_().isAdmin||simulationActive_())return;
  try{if(sessionStorage.getItem(RUNTIME_MAINTENANCE_SESSION_KEY)==='DONE')return;}catch(_){}
  setTimeout(()=>{
    Promise.allSettled([
      simulationCandidates.length?Promise.resolve(null):call('getSimulationCandidates').then(r=>{simulationCandidates=Array.isArray(r.data)?r.data:[];refreshSimulationSelectOptions_();}),
      call('getFarSyncStatus')
    ]).finally(()=>{try{sessionStorage.setItem(RUNTIME_MAINTENANCE_SESSION_KEY,'DONE');}catch(_){}});
  },900);
}

function renderStartupShell_(){
  root.className='';
  root.innerHTML=`<main class="container"><section class="panel narrow startup-panel"><span class="eyebrow">Gestión Club</span><h1>Preparando tu sesión</h1><p>Cargando configuración y temporada…</p><div class="inline-loader" aria-label="Cargando"></div></section></main>`;
}

// 0.6.51 - orden 1-23 determina titular/suplente, dorsal único y disponibilidad multirrol sin duplicar personas.
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
  if (/syncCompetitionFromWeb|syncRefereeSource|syncAllFar/i.test(a)) return 'Actualizando desde FAR…';
  if (/processCompetitionOfficialReports/i.test(a)) return 'Descargando y procesando actas oficiales…';
  if (/previewLeagueCalendarImport/i.test(a)) return 'Analizando calendario…';
  if (/previewTrainingExerciseImport/i.test(a)) return 'Analizando ejercicios…';
  if (/importTrainingExercises/i.test(a)) return 'Importando ejercicios…';
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
      : action === 'syncAllFar' ? 330000
      : action === 'syncRefereeSource' ? 180000
      : action === 'syncCompetitionFromWeb' ? 180000
      : action === 'processCompetitionOfficialReports' ? 180000
      : action === 'refreshMatchOfficialReport' ? 180000
      : action === 'analyzeCompetitionSource' ? 120000
      : action === 'saveCompetition' ? 60000
      : action === 'previewLeagueCalendarImport' ? 60000
      : action === 'previewTrainingExerciseImport' ? 60000
      : action === 'importTrainingExercises' ? 90000
      : ['uploadMatchReport','reprocessMatchReport'].includes(action) ? 120000
      : action === 'getPerformanceData' ? 45000
      : action === 'getStatisticsData' ? 60000
      : action === 'getCalendarData' ? 45000
      : action === 'getCalendarListData' ? 20000
      : action === 'getMatchSectionState' ? 20000
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

function realUserIsAdmin_(){return currentUser?.role==='ADMIN';}
function simulationActive_(){return !!(simulationState&&simulationState.personId);}
function simulationCanEnableActions_(){return String(config.environment||'').toUpperCase()==='DEV';}
const SIMULATION_READ_ACTIONS_CLIENT = new Set(['logout','status','getAppBootstrap','getHomeDashboard','getAccessProfile','getClubConfig','getSeasonContext','getSeasonsData','getStructureData','getTrainingExercisesData','previewTrainingExerciseImport','getTrainingSessionPlanData','getFamilyData','getDocumentsData','getDocumentFile','getCalendarData','getCalendarListData','getEventDetailHeaderData','getRefereeCoordinationData','getEventAvailabilityData','getPersonAvailabilityData','getCompetitionsData','getRefereeSourcesData','getRefereeMatchWorkspaceData','getRefereeMatchDocumentFile','analyzeCompetitionSource','previewLeagueCalendarImport','getMatchPlanningData','getMatchSummaryFast','getMatchLineupFast','getMatchSurveyFast','getMatchSectionState','getMatchReportReview','getMatchReportFile','getMatchReportMaintenanceData','getStatisticsData','getRefereeStatisticsData']);
function simulationActionIsReadOnlyClient_(action){return SIMULATION_READ_ACTIONS_CLIENT.has(String(action||''));}
function simulationRequest_(){return simulationActive_()?{personId:simulationState.personId,allowActions:!!simulationState.allowActions}:{personId:'',allowActions:false};}
function simulationCandidateById_(personId){return (simulationCandidates||[]).find(x=>String(x.personId||'')===String(personId||''))||null;}
function resetSimulationState_(){simulationState={personId:'',displayName:'',email:'',accessProfile:null,allowActions:false};}

function shouldBlockUiForAction_(action){
  const a=String(action||'');
  // Las sincronizaciones FAR pueden tardar varios minutos. El botón queda
  // deshabilitado, pero no bloqueamos toda la navegación mientras el servidor trabaja.
  if(['syncAllFar','syncRefereeSource'].includes(a))return false;
  return /^(login|logout|save|create|update|delete|set|upload|import|reprocess|apply|analyze|sync|process|copy|generate|review|reset|link|refreshMatchReportOfficialData)/i.test(a)
    || /^(previewLeagueCalendarImport|runTechnicalTest)$/i.test(a);
}
function shouldShowUiBusyForAction_(action){
  const a=String(action||'');
  // Los sondeos de Sistema/Rendimiento actualizan sus propios componentes. No deben
  // mostrar el overlay global ni dar sensación de que toda la aplicación está bloqueada.
  return !['getPerformanceData','getFarSyncStatus','status'].includes(a);
}

async function call(action, payload = {}, fixedRequestId = null) {
  if(simulationActive_()&&!simulationState.allowActions&&!simulationActionIsReadOnlyClient_(action)){
    const error=new Error('Modo simulación en solo lectura. Volvé a Administrador o habilitá acciones de prueba en DEV.');error.code='SIMULATION_READ_ONLY';throw error;
  }
  const blocking = shouldBlockUiForAction_(action);
  const busyToken = shouldShowUiBusyForAction_(action) ? beginUiBusy_(busyMessageForAction_(action), blocking) : null;
  const perfStarted=performance.now();
  let response=null;
  try {
    response = await serverApi({
      action,
      payload,
      sessionToken,
      simulation: (action==='login'||action==='logout')?{personId:'',allowActions:false}:simulationRequest_(),
      requestId: fixedRequestId || requestId(),
      clientVersion: config.appVersion
    });
    const roundTripMs=Math.max(0,performance.now()-perfStarted);
    recordPerformanceMetric_(action,response,roundTripMs,!!response?.ok);
    if (!response?.ok) {
      const error = new Error(response?.error?.message || 'La operación no pudo completarse.');
      error.code = response?.error?.code || 'UNKNOWN_ERROR';
      error.requestId = response?.requestId || '';
      if (['AUTH_REQUIRED', 'INVALID_SESSION', 'SESSION_EXPIRED', 'ACCOUNT_DISABLED'].includes(error.code)) clearSession();
      throw error;
    }
    if(/^(save|create|update|delete|set|upload|import|reprocess|apply|close|reopen|assign|cancel|end|generate|copy|refresh|sync|process)/i.test(String(action||''))){statisticsData=null;statisticsDataCacheKey='';statisticsDataCachedAt=0;refereeStatisticsData=null;refereeStatisticsDataCacheKey='';refereeStatisticsDataCachedAt=0;}
    return response;
  } catch(error) {
    if(!response)recordPerformanceMetric_(action,null,Math.max(0,performance.now()-perfStarted),false,error?.code||'TRANSPORT_ERROR');
    throw error;
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
  simulationCandidates = [];
  resetSimulationState_();
  clubConfig = null;
  seasonContext = null;
  statisticsData = null;
  statisticsDataCacheKey = '';
  statisticsDataCachedAt = 0;
  refereeStatisticsData = null;
  refereeStatisticsDataCacheKey = '';
  refereeStatisticsDataCachedAt = 0;
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

function publicAssetUrl_(path) {
  const base=String(window.GC_FRONTEND_BASE_URL||'https://alanmulloa.github.io/gestion-club').replace(/\/+$/,'');
  return `${base}/${String(path||'').replace(/^\/+/, '')}`;
}
function brandInitials_(name){
  const parts=String(name||'Gestión Club').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0,2).map(x=>x[0]||'').join('')||'GC').toUpperCase();
}
function brandMarkup() {
  const unauthenticated=!currentUser;
  const source=unauthenticated?publicBranding:(clubConfig||publicBranding);
  const name=source?.officialName || config.appName || 'Gestión Club';
  const logoSrc=source?.logoDataUrl || '';
  const logo = logoSrc
    ? `<img class="brand-logo" src="${escapeHtml(logoSrc)}" alt="Logo del club">`
    : `<span class="brand-mark">${escapeHtml(brandInitials_(name))}</span>`;
  const backendVersion=String(config.appVersion||'?');
  const mismatch=backendVersion!==FRONTEND_BUILD?` · frontend ${escapeHtml(FRONTEND_BUILD)}`:'';
  const sub=unauthenticated?`${escapeHtml(source?.description||'Gestión deportiva del club')} · ${escapeHtml(backendVersion)}${mismatch}`:`Versión ${escapeHtml(backendVersion)}${mismatch} · ${escapeHtml(config.environment || 'sin configurar')}`;
  return `${logo}<div><strong>${escapeHtml(name)}</strong><small>${sub}</small></div>`;
}

function roleDisplayName(role) {
  return ({ADMIN:'Administrador',MEMBER:'Acceso por persona',MANAGER:'Manager',COACH:'Entrenador',REFEREE:'Árbitro',PLAYER:'Jugador',TUTOR:'Tutor',COORDINATOR:'Coordinador',REFEREE_COORDINATOR:'Coordinador de Árbitros',COLLABORATOR:'Colaborador'})[role] || role || '';
}
function currentAccessProfile_(){return simulationActive_()?(simulationState.accessProfile||{capabilities:{},accessLabels:[],roleContexts:[]}):(currentUser?.accessProfile||{capabilities:{},accessLabels:[],roleContexts:[]});}
const ROLE_CONTEXT_STORAGE_PREFIX='gestionClub.roleContext.v1:';
function roleContexts_(){return currentAccessProfile_().roleContexts||[];}
function roleContextStorageKey_(){return ROLE_CONTEXT_STORAGE_PREFIX+String(simulationActive_()?simulationState.personId:(currentUser?.personId||currentUser?.email||'anonymous'));}
function savedRoleContextId_(){try{return localStorage.getItem(roleContextStorageKey_())||'';}catch(_){return '';}}
function currentRoleContext_(){
  const contexts=roleContexts_();if(!contexts.length)return {id:'PERSONAL',roleCategory:'PERSONAL',label:'Mi perfil',divisionIds:[],eventIds:[]};
  const saved=savedRoleContextId_(),preferred=contexts.find(x=>x.id===saved),def=currentAccessProfile_().defaultRoleContextId;
  return preferred||contexts.find(x=>x.id===def)||contexts[0];
}
function saveRoleContextId_(id){try{localStorage.setItem(roleContextStorageKey_(),String(id||''));}catch(_){} }
function contextDivisionIds_(){return (currentRoleContext_().divisionIds||[]).slice();}
function contextEventIds_(){return (currentRoleContext_().eventIds||[]).slice();}
function contextRoleCategory_(){return String(currentRoleContext_().roleCategory||'PERSONAL');}
function contextSingleDivisionId_(){const ids=contextDivisionIds_();return ids.length===1?ids[0]:'';}
function contextScopedDivisionId_(stored){
  const ids=contextDivisionIds_();if(!ids.length)return stored||'';
  if(stored&&ids.includes(stored))return stored;
  return ids.length===1?ids[0]:'';
}
function contextAllowsDivisionId_(divisionId){const ids=contextDivisionIds_();return !ids.length||ids.includes(String(divisionId||''));}
function isExternalRefereeMatchClient_(event){return String(event?.eventType||'').toUpperCase()==='MATCH'&&String(event?.matchType||'').toUpperCase()==='REFEREE_EXTERNAL';}
function eventClubRefereeParticipantClient_(eventId,data=calendarData){return (data?.participants||[]).find(p=>String(p.eventId||'')===String(eventId||'')&&String(p.roleCategory||p.participantType||'').toUpperCase()==='REFEREE')||null;}
function eventHasClubRefereeClient_(eventId,data=calendarData){return !!eventClubRefereeParticipantClient_(eventId,data);}
function shouldUseRefereeWorkspaceClient_(event,data=calendarData){if(!event||String(event.eventType||'').toUpperCase()!=='MATCH'||!eventHasClubRefereeClient_(event.eventId,data))return false;if(isExternalRefereeMatchClient_(event))return true;const role=contextRoleCategory_().toUpperCase();if(role==='REFEREE')return contextEventIds_().includes(String(event.eventId||''));return role==='REFEREE_COORDINATOR';}
function refereeOccupationProfileLabelClient_(profile){return ({AUTO:'Automático',LOCAL:'Local / mismo club',NEAR:'Cercano',NORMAL:'Desplazamiento normal',LONG:'Desplazamiento largo',CUSTOM:'Personalizado'})[String(profile||'AUTO').toUpperCase()]||'Automático';}
function refereeOccupationDurationLabelClient_(minutes){const n=Math.max(0,Number(minutes||0)),h=Math.floor(n/60),m=Math.round(n%60);return h?`${h} h${m?' '+m+' min':''}`:`${m} min`; }
function contextAllowsEvent_(event){
  const ctx=currentRoleContext_(),role=String(ctx.roleCategory||'').toUpperCase();
  if(isExternalRefereeMatchClient_(event)){
    if(role==='REFEREE'){const ids=contextEventIds_();return ids.includes(String(event?.eventId||''));}
    return role==='REFEREE_COORDINATOR'||role==='ADMIN';
  }
  if(role==='REFEREE'){const ids=contextEventIds_();return ids.includes(String(event?.eventId||''));}
  const divs=contextDivisionIds_();return !divs.length||divs.includes(String(event?.divisionId||''));
}
function roleContextSwitcherMarkup_(){
  if(!currentUser)return '';
  const contexts=roleContexts_(),current=currentRoleContext_();
  if(contexts.length<=1)return `<div class="role-context-switcher single"><span>Contexto</span><strong>${escapeHtml(current.label||'Mi perfil')}</strong></div>`;
  return `<label class="role-context-switcher"><span>Contexto</span><select id="global-role-context" aria-label="Rol y ámbito de trabajo">${contexts.map(x=>`<option value="${escapeHtml(x.id)}" ${x.id===current.id?'selected':''}>${escapeHtml(x.label)}</option>`).join('')}</select></label>`;
}
function resetContextScopedUi_(){
  const div=contextSingleDivisionId_(),ui=loadUiState_();
  saveUiStatePatch_({
    calendarFilters:Object.assign({},ui.calendarFilters||{},{divisionId:div,teamId:''}),
    statisticsFilters:Object.assign({},ui.statisticsFilters||{},{divisionId:div,teamId:''}),
    peopleFilters:Object.assign({},ui.peopleFilters||{},{divisionId:div}),
    exerciseFilters:Object.assign({},ui.exerciseFilters||{},{divisionId:div})
  });
  structureData=null;invalidateCalendarCaches_();statisticsData=null;refereeStatisticsData=null;trainingLibraryData=null;
}
function currentAccessSummary_(){const ctx=currentRoleContext_();return ctx?.label||'Acceso personal';}
async function refreshAccessProfileForSeason_(){
  if(!currentUser)return;
  try{const {data}=await call('getAccessProfile',{seasonId:selectedSeasonId_()});if(simulationActive_())simulationState.accessProfile=data||{};else currentUser.accessProfile=data||{};}catch(_){/* conserva perfil previo si la lectura falla */}
}
function rerenderForContext_(active){
  if(active==='home')return renderDashboard();
  if(active==='structure')return renderStructure();
  if(active==='documents')return renderDocuments();
  if(active==='calendar')return renderCalendar();
  if(active==='exercises')return renderTrainingExercises();
  if(active==='statistics')return renderStatistics();
  if(active==='settings')return renderClubSettings();
  return renderDashboard();
}

function simulationSwitcherMarkup_(){
  if(!realUserIsAdmin_())return '';
  const current=simulationActive_()?simulationState.personId:'';
  const options=(simulationCandidates||[]).map(x=>`<option value="${escapeHtml(x.personId)}" ${String(x.personId)===String(current)?'selected':''}>${escapeHtml(x.displayName||x.email)}${x.email?` · ${escapeHtml(x.email)}`:''}</option>`).join('');
  return `<label class="simulation-switcher"><span>Vista</span><select id="global-simulation-person" aria-label="Vista de administrador o persona"><option value="">Administrador</option>${options}</select></label>`;
}
function simulationBannerMarkup_(){
  if(!simulationActive_())return '';
  const mode=simulationState.allowActions?'Acciones de prueba habilitadas':'Solo lectura';
  const toggle=simulationCanEnableActions_()?`<label class="simulation-actions"><input id="simulation-allow-actions" type="checkbox" ${simulationState.allowActions?'checked':''}> Permitir acciones en DEV</label>`:'';
  return `<div class="simulation-banner"><div><strong>Modo simulación</strong><span>Viendo como ${escapeHtml(simulationState.displayName||simulationState.email||'persona')} · <b id="simulation-mode-text">${escapeHtml(mode)}</b></span></div><div class="simulation-banner-actions">${toggle}<button class="button mini secondary" id="simulation-exit">Volver a Administrador</button></div></div>`;
}
async function activateSimulation_(personId){
  const id=String(personId||'');
  if(!id){resetSimulationState_();resetContextScopedUi_();showToast_('Vista Administrador restaurada.','success',1800);return renderDashboard();}
  const candidate=simulationCandidateById_(id);
  if(!candidate){showToast_('La persona seleccionada ya no está disponible para simular.','warning',3000);return;}
  simulationState={personId:id,displayName:candidate.displayName||'',email:candidate.email||'',accessProfile:null,allowActions:false};
  try{const {data}=await call('getAccessProfile',{seasonId:selectedSeasonId_()});simulationState.accessProfile=data||{};resetContextScopedUi_();showToast_('Simulando acceso de '+(candidate.displayName||candidate.email)+'.','success',2200);return renderDashboard();}
  catch(err){resetSimulationState_();showToast_(userErrorText_(err),'error',4500);return renderDashboard();}
}
function simulationSessionSubtext_(){return simulationActive_()?'Administrador autenticado':currentAccessSummary_();}

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
  structureData=null;invalidateCalendarCaches_();statisticsData=null;refereeStatisticsData=null;trainingLibraryData=null;
}
function rerenderForSeason_(active){
  if(active==='home')return renderDashboard();
  if(active==='structure')return renderStructure();
  if(active==='calendar')return renderCalendar();
  if(active==='exercises')return renderTrainingExercises();
  if(active==='statistics')return renderStatistics();
}

function navigationForRole() {
  const p=currentAccessProfile_(),c=p.capabilities||{};
  const all=[['home','Inicio'],['structure',c.browseStructure?'Estructura':'Mi perfil'],['documents','Documentos'],['calendar','Calendario'],['exercises','Ejercicios'],['statistics','Estadísticas'],['settings','Configuración']];
  return all.filter(([key])=>{
    if(key==='home')return true;
    if(key==='structure')return !!c.viewStructure;
    if(key==='documents')return !!c.viewDocuments;
    if(key==='calendar')return !!c.viewCalendar;
    if(key==='exercises')return !!c.viewTrainingLibrary;
    if(key==='statistics'){const role=String(currentRoleContext_().roleCategory||'').toUpperCase();return (!!c.viewStatistics&&['GUARDIAN','PERSONAL'].indexOf(role)<0)||['REFEREE_COORDINATOR','REFEREE'].includes(role)||!!p.isAdmin;}
    if(key==='settings')return !!p.isAdmin;
    return false;
  });
}

function navMarkup(active) {
  if (!currentUser) return '';
  return navigationForRole().map(([key,label]) =>
    `<button class="nav-link ${active === key ? 'active' : ''}" data-nav="${key}"><span class="nav-icon">${({home:'⌂',structure:'◆',families:'♙',documents:'▤',calendar:'▦',exercises:'◇',statistics:'▥',users:'◎',seasons:'◫',settings:'⚙'})[key] || '•'}</span><span class="nav-label">${label}</span></button>`
  ).join('');
}

function dashboardCardsForRole() {
  const p=currentAccessProfile_(),c=p.capabilities||{},cards=[];
  if(c.viewCalendar)cards.push(['Actividad','Calendario deportivo','Entrenamientos, partidos, disponibilidad y convocatorias.','go-calendar','primary']);
  if(c.viewTrainingLibrary)cards.push(['Entrenamiento','Biblioteca de ejercicios','Ejercicios reutilizables, coaching points, material y variantes.','go-exercises','secondary']);
  if(c.viewStructure)cards.push(['Gestión','Estructura deportiva','Personas y organización dentro de tu alcance.','go-structure','secondary']);
  {const role=String(currentRoleContext_().roleCategory||'').toUpperCase();if(['REFEREE','REFEREE_COORDINATOR'].includes(role))cards.push(['Rendimiento','Estadísticas arbitrales','Designaciones, ocupación, preparación y seguimiento de la temporada.','go-statistics','secondary']);else if(c.viewStatistics||p.isAdmin)cards.push(['Rendimiento','Estadísticas','Asistencia, disponibilidad, convocatorias, participación y resultados.','go-statistics','secondary']);}
  if(c.viewDocuments)cards.push(['Archivos','Documentación','Consultá tu documentación y la que tu rol permita gestionar.','go-documents','secondary']);
  if(p.isAdmin)cards.push(['Club','Configuración','Identidad, contacto, logo y colores del club.','go-settings','secondary']);
  return cards.map(c=>`<article class="quick-card role-card"><span class="eyebrow">${c[0]}</span><h2>${c[1]}</h2><p>${c[2]}</p><button class="button ${c[4]}" id="${c[3]}">${c[1]}</button></article>`).join('');
}


function accessScopeOverviewHtml_(){
  const p=currentAccessProfile_();
  if(p.isAdmin)return `<section class="panel access-overview"><div class="panel-heading"><div><h2>Accesos efectivos</h2><p>Administrador · acceso global a todas las funciones y divisiones.</p></div></div></section>`;
  const divisions=p.divisionAccess||[],referee=(p.categories||[]).includes('REFEREE');
  if(!divisions.length&&!referee)return `<section class="panel access-overview"><div class="panel-heading"><div><h2>Accesos efectivos</h2><p>Tu acceso actual es personal. Los permisos deportivos se asignan mediante cargos por temporada/división.</p></div></div></section>`;
  const keyLabels={manageTrainingPlan:'Plan entrenos',manageTrainingAttendance:'Asistencia',manageMatchLineup:'Convocatorias',manageMatchReport:'Partidos / actas',manageAvailability:'Bajas / ausencias',manageCompetitions:'Competiciones',manageDocuments:'Documentación',viewDocumentStatus:'Estado documental'};
  const rows=divisions.map(d=>{
    const caps=(d.capabilities||[]).filter(k=>keyLabels[k]).map(k=>`<span class="badge">${escapeHtml(keyLabels[k])}</span>`).join('');
    const roles=(d.roleLabels||[]).join(' · ')||'Acceso personal';
    return `<article class="access-scope-row"><div><strong>${escapeHtml(d.divisionName||d.divisionId)}</strong><small>${escapeHtml(roles)}</small></div><div class="access-scope-badges">${caps||'<span class="muted">Calendario / acceso personal</span>'}</div></article>`;
  }).join('');
  const refereeRow=referee?`<article class="access-scope-row"><div><strong>Árbitro</strong><small>Solo actividades asignadas</small></div><div class="access-scope-badges"><span class="badge">Calendario de asignaciones</span></div></article>`:'';
  return `<section class="panel access-overview"><div class="panel-heading"><div><h2>Accesos efectivos</h2><p>Los permisos se suman por cargo, pero respetan la división donde fue asignado cada uno.</p></div></div><div class="access-scope-list">${rows}${refereeRow}</div><div class="info-strip"><strong>Documentación:</strong> el Coordinador puede ver el estado documental; la carga/revisión de documentos de una división queda reservada al Manager.</div></section>`;
}

function isMobileViewport(){ return window.matchMedia && window.matchMedia('(max-width: 760px)').matches; }

function shell(content, active = 'home') {
  root.className = '';
  document.body.classList.toggle('login-mode', !currentUser);
  root.innerHTML = `
    <header class="topbar">
      <div class="brand">${brandMarkup()}</div>
      ${currentUser ? simulationSwitcherMarkup_() : ''}
      ${currentUser ? seasonSwitcherMarkup_() : ''}
      ${currentUser ? roleContextSwitcherMarkup_() : ''}
      ${currentUser ? `<div class="session"><div class="session-copy"><span>${escapeHtml(currentUser.displayName||currentUser.email)}</span><small>${escapeHtml(simulationSessionSubtext_())}</small></div><button class="button ghost logout-button" id="logout">Salir</button></div>` : ''}
    </header>
    ${currentUser ? `<nav class="nav">${navMarkup(active)}</nav>` : ''}
    ${currentUser ? simulationBannerMarkup_() : ''}
    <main class="container">${content}</main>
    <footer>Gestión Club ${escapeHtml(config.appVersion || '')}${String(config.appVersion||'')!==FRONTEND_BUILD?` · frontend ${escapeHtml(FRONTEND_BUILD)}`:''} · entorno ${escapeHtml(config.environment || '')}</footer>`;
  const logoutButton = document.getElementById('logout');
  if (logoutButton) logoutButton.onclick = logout;
  const simulationSelect=document.getElementById('global-simulation-person');if(simulationSelect)simulationSelect.onchange=()=>activateSimulation_(simulationSelect.value);
  const simulationExit=document.getElementById('simulation-exit');if(simulationExit)simulationExit.onclick=()=>activateSimulation_('');
  const simulationActions=document.getElementById('simulation-allow-actions');if(simulationActions)simulationActions.onchange=()=>{simulationState.allowActions=!!simulationActions.checked;const modeText=document.getElementById('simulation-mode-text');if(modeText)modeText.textContent=simulationState.allowActions?'Acciones de prueba habilitadas':'Solo lectura';showToast_(simulationState.allowActions?'Acciones de prueba habilitadas. Quedarán auditadas con el administrador real.':'Simulación en solo lectura.','warning',3200);};
  const seasonSelect=document.getElementById('global-season-select');if(seasonSelect)seasonSelect.onchange=async()=>{resetSeasonScopedUi_(seasonSelect.value);await refreshAccessProfileForSeason_();resetContextScopedUi_();rerenderForSeason_(active);};
  const roleContextSelect=document.getElementById('global-role-context');if(roleContextSelect)roleContextSelect.onchange=()=>{saveRoleContextId_(roleContextSelect.value);resetContextScopedUi_();showToast_('Contexto cambiado a '+(currentRoleContext_().label||'la vista seleccionada')+'.','success',1800);rerenderForContext_(active);};
  document.querySelectorAll('[data-nav]').forEach(button => {
    button.onclick = () => {
      const nav=button.dataset.nav;
      if(nav==='settings') return renderClubSettings();
      if(nav==='structure') return renderStructure();
      if(nav==='families') return renderFamilies();
      if(nav==='documents') return renderDocuments();
      if(nav==='calendar') return renderCalendar();
      if(nav==='exercises') return renderTrainingExercises();
      if(nav==='statistics') return renderStatistics();
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
  const b=publicBranding||{};
  applyClubTheme({primaryColor:b.primaryColor||'#2b4168',secondaryColor:b.secondaryColor||'#21375e',accentColor:b.accentColor||'#919b17'});
  const clubName=b.officialName||config.appName||'Gestión Club';
  const description=b.description||'Gestión deportiva del club';
  const logo=b.logoDataUrl?`<img src="${escapeHtml(b.logoDataUrl)}" alt="Logo de ${escapeHtml(clubName)}">`:`<span class="login-brand-fallback">${escapeHtml(brandInitials_(clubName))}</span>`;
  shell(`
    <section class="login-layout">
      <div class="login-intro">
        <span class="eyebrow">${escapeHtml(description)}</span>
        <h1>Acceso al club</h1>
        <p>Entrá con la cuenta creada por la administración para consultar tu actividad, disponibilidad y gestión deportiva.</p>
        <div class="login-club">${logo}<div><strong>${escapeHtml(clubName)}</strong><small>${escapeHtml(description)} · ${escapeHtml(config.environment || 'DEV')}</small></div></div>
      </div>
      <section class="panel login-panel">
        <div class="login-panel-heading"><span class="eyebrow">Cuenta</span><h2>Iniciar sesión</h2><p>Usá tu correo y contraseña de Gestión Club.</p></div>
        <form id="login-form" class="form-stack">
          <label>Correo electrónico<input id="email" type="email" autocomplete="username" inputmode="email" required placeholder="nombre@correo.com"></label>
          <label>Contraseña<input id="password" type="password" autocomplete="current-password" required placeholder="Contraseña"></label>
          <button class="button primary login-submit" type="submit">Entrar</button>
        </form>
        <div id="message" class="message" aria-live="polite"></div>
      </section>
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
      // 0.6.94: si el Bootstrap Snapshot ya existe, el login lo entrega en la
      // misma respuesta y eliminamos un segundo viaje a Apps Script.
      const boot=response.data?.bootstrap||(await call('getAppBootstrap')).data;
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

function dashboardDateObj_(iso){const d=new Date(String(iso||'')+'T12:00:00Z');return Number.isNaN(d.getTime())?null:d;}
function dashboardAddDaysClient_(iso,days){const d=dashboardDateObj_(iso);if(!d)return '';d.setUTCDate(d.getUTCDate()+Number(days||0));return d.toISOString().slice(0,10);}
function dashboardDayLabel_(iso){const d=dashboardDateObj_(iso);if(!d)return iso||'';return new Intl.DateTimeFormat('es-ES',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(d).replace('.','');}
function dashboardFullDateLabel_(iso){const d=dashboardDateObj_(iso);if(!d)return iso||'';return new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(d);}
function dashboardRoleCopy_(role){return ({PLAYER:'Tus entrenamientos, partidos y avisos personales.',COACH:'Planificación, asistencia y convocatorias de tu equipo.',MANAGER:'Operativa de la división, documentación, bajas y convocatorias.',COLLABORATOR:'Entrenamientos, asistencia y tareas deportivas de tu ámbito.',REFEREE:'Tus próximas asignaciones y actividades arbitrales.',REFEREE_COORDINATOR:'Designaciones internas, conflictos y cobertura arbitral.',COORDINATOR:'Visión transversal de entrenamientos, equipos, bajas y pendientes.',ADMIN:'Visión global del club y acciones que requieren seguimiento.'})[role]||'Tu actividad y pendientes de la semana.';}
function dashboardEventTypeLabel_(type){return ({TRAINING:'Entrenamiento',MATCH:'Partido',REST:'Descanso',RECOVERY:'Jornada de recuperación',ACTIVITY:'Actividad'})[String(type||'').toUpperCase()]||'Actividad';}
function dashboardEventDisplayTitle_(event){const e=event||{},type=String(e.eventType||'').toUpperCase();if(type==='MATCH')return e.opponent?'vs '+e.opponent:(e.title||'Partido');if(type==='TRAINING')return e.title||'Entrenamiento';if(type==='REST')return e.title||'Descanso';if(type==='RECOVERY')return e.title||'Jornada de recuperación';return e.title||dashboardEventTypeLabel_(type);}
function dashboardEventCompactHtml_(event){if(!event)return '<div class="empty-state">No hay próximos eventos en tu ámbito.</div>';const meta=[event.divisionName,event.teamName,event.location].filter(Boolean).join(' · '),inProgress=String(event.status||'').toUpperCase()==='IN_PROGRESS';return `<button class="dashboard-next-event ${eventVisualClass_(event)} ${teamPatternClass_(event)} status-${String(event.status||'').toLowerCase()}" style="${divisionEventStyle_(event)}" data-dashboard-event="${escapeHtml(event.eventId)}"><span class="dashboard-event-date">${inProgress?'En curso · ':''}${escapeHtml(dashboardFullDateLabel_(event.eventDate))}${event.startTime?' · '+escapeHtml(event.startTime):''}${event.effectiveEndTime?'–'+escapeHtml(event.effectiveEndTime):''}</span><strong>${escapeHtml(dashboardEventDisplayTitle_(event))}</strong><small>${escapeHtml(meta||'Abrir actividad')}</small></button>`;}
function dashboardWeekHtml_(data){const events=data.weekEvents||[],byDate={};events.forEach(e=>{(byDate[e.eventDate]||(byDate[e.eventDate]=[])).push(e);});Object.keys(byDate).forEach(k=>byDate[k]=sortCalendarEvents_(byDate[k]));let cols='';for(let i=0;i<7;i++){const date=dashboardAddDaysClient_(data.weekStart,i),items=(byDate[date]||[]).map(e=>`<button class="dashboard-week-event ${eventVisualClass_(e)} ${teamPatternClass_(e)} status-${String(e.status||'').toLowerCase()}" style="${divisionEventStyle_(e)}" data-dashboard-event="${escapeHtml(e.eventId)}"><span>${escapeHtml(displayEventTime_(e)||'—')}</span><strong>${escapeHtml(dashboardEventDisplayTitle_(e))}</strong><small>${escapeHtml(e.divisionName||e.teamName||'')}</small></button>`).join('');cols+=`<article class="dashboard-week-day ${date===data.today?'today':''}"><header><strong>${escapeHtml(dashboardDayLabel_(date))}</strong></header>${items||'<span class="dashboard-no-event">Sin eventos</span>'}</article>`;}return `<div class="dashboard-week-grid">${cols}</div>`;}
function dashboardPriorityLabel_(priority){return ({HIGH:'Prioridad alta',MEDIUM:'Pendiente',LOW:'Aviso',INFO:'Información'})[priority]||'Pendiente';}
function dashboardTaskActionLabel_(task){return ({'training-plan':'Planificar','training-attendance':'Confirmar asistencia','match-lineup':'Preparar convocatoria','match-summary':'Abrir partido','referee-pre':'Preparar','referee-post':'Completar seguimiento','documents':'Revisar','calendar':'Ver calendario','event':'Abrir'})[task.action]||'Abrir';}
function dashboardTasksHtml_(tasks){if(!tasks?.length)return '<div class="empty-state dashboard-empty"><strong>Todo al día.</strong><span>No hay acciones pendientes para este contexto.</span></div>';return `<div class="dashboard-task-list">${tasks.map(t=>`<article class="dashboard-task ${String(t.priority||'MEDIUM').toLowerCase()}"><div class="dashboard-task-copy"><span class="status-pill ${t.priority==='HIGH'?'danger':t.priority==='INFO'?'muted':'warning'}">${escapeHtml(dashboardPriorityLabel_(t.priority))}</span><strong>${escapeHtml(t.title)}</strong><p>${escapeHtml(t.detail||'')}</p></div><button class="button mini secondary" data-dashboard-task="${escapeHtml(t.action||'')}" data-event-id="${escapeHtml(t.eventId||'')}">${escapeHtml(dashboardTaskActionLabel_(t))}</button></article>`).join('')}</div>`;}
function wireDashboardActions_(){document.querySelectorAll('[data-dashboard-event]').forEach(el=>el.onclick=()=>renderEventDetail(el.dataset.dashboardEvent));document.querySelectorAll('[data-dashboard-task]').forEach(el=>el.onclick=()=>{const action=el.dataset.dashboardTask,id=el.dataset.eventId;if(action==='training-plan')return renderEventDetail(id,'plan');if(action==='training-attendance')return renderEventDetail(id,'attendance');if(action==='match-lineup')return renderMatchPlanning(id,'convocados');if(action==='match-summary')return renderMatchPlanning(id,'summary');if(action==='referee-pre')return renderRefereeMatchWorkspace(id,'pre');if(action==='referee-post')return renderRefereeMatchWorkspace(id,'post');if(action==='event')return renderEventDetail(id);if(action==='documents')return renderDocuments();return renderCalendar();});}

async function renderDashboard() {
  if(dashboardNextRefreshTimer){clearTimeout(dashboardNextRefreshTimer);dashboardNextRefreshTimer=null;}
  if (!clubConfig) await loadClubConfig();
  if (!seasonContext) await loadSeasonContext_();
  const clubName=clubConfig?.officialName||'Gestión Club',season=selectedSeason_()?.name||'Sin temporada configurada',ctx=currentRoleContext_(),role=contextRoleCategory_();
  shell(`
    <section class="hero role-hero dashboard-hero">
      <span class="eyebrow">${escapeHtml(ctx.label||roleDisplayName(currentUser?.role))}</span>
      <h1>Mi semana</h1>
      <p>${escapeHtml(dashboardRoleCopy_(role))} · ${escapeHtml(season)}</p>
    </section>
    <section class="dashboard-summary-grid">
      <article class="panel dashboard-next-panel"><div class="section-heading"><div><span class="eyebrow">Próximo</span><h2>Próximo evento</h2></div></div><div id="dashboard-next"><div class="skeleton-block"></div></div></article>
      <article class="panel dashboard-pending-panel"><div class="section-heading"><div><span class="eyebrow">Acciones</span><h2>Pendientes</h2></div><button class="button secondary mini" id="dashboard-refresh">Actualizar</button></div><div id="dashboard-task-summary" class="dashboard-task-summary"><span>Calculando…</span></div></article>
    </section>
    <section class="panel dashboard-week-panel"><div class="section-heading"><div><h2>Calendario de la semana</h2><p>Eventos dentro del contexto ${escapeHtml(ctx.label||'actual')}.</p></div><button class="button secondary" id="dashboard-open-calendar">Abrir calendario</button></div><div id="dashboard-week"><div class="skeleton-block tall"></div></div></section>
    <section class="panel"><div class="section-heading"><div><h2>Qué necesita tu atención</h2><p>Acciones detectadas automáticamente según tu rol y ámbito.</p></div></div><div id="dashboard-tasks"><div class="skeleton-block tall"></div></div></section>
    <div id="message" class="message" aria-live="polite"></div>`, 'home');
  document.getElementById('dashboard-open-calendar').onclick=renderCalendar;
  const load=async()=>{const refresh=document.getElementById('dashboard-refresh');if(refresh)refresh.disabled=true;try{const {data}=await call('getHomeDashboard',{seasonId:selectedSeasonId_(),roleCategory:role,divisionIds:contextDivisionIds_(),eventIds:contextEventIds_(),contextLabel:ctx.label||''});const next=document.getElementById('dashboard-next'),week=document.getElementById('dashboard-week'),tasks=document.getElementById('dashboard-tasks'),summary=document.getElementById('dashboard-task-summary');if(next)next.innerHTML=dashboardEventCompactHtml_(data.nextEvent);if(week)week.innerHTML=dashboardWeekHtml_(data);if(tasks)tasks.innerHTML=dashboardTasksHtml_(data.tasks||[]);if(summary)summary.innerHTML=`<strong>${Number(data.taskCount||0)}</strong><span>${Number(data.taskCount||0)===1?'acción pendiente':'acciones / avisos pendientes'}</span>`;wireDashboardActions_();if(dashboardNextRefreshTimer){clearTimeout(dashboardNextRefreshTimer);dashboardNextRefreshTimer=null;}const refreshMs=Number(data.nextRefreshMs||0);if(refreshMs>0){dashboardNextRefreshTimer=setTimeout(()=>{dashboardNextRefreshTimer=null;if(document.getElementById('dashboard-next'))void load();},Math.min(refreshMs,2147480000));}}catch(error){showMessage(error.message,'error');const tasks=document.getElementById('dashboard-tasks');if(tasks)tasks.innerHTML='<div class="message error">No se pudieron cargar los pendientes.</div>';}finally{if(refresh)refresh.disabled=false;}};
  document.getElementById('dashboard-refresh').onclick=load;
  void load();
}

async function loadStatus() {
  const button = document.getElementById('refresh-status');
  if (button) button.disabled = true;
  const clientStarted=performance.now();
  try {
    const { data } = await call('status');
    const roundTrip=Math.max(0,Math.round(performance.now()-clientStarted));
    currentUser = { email:data.actor.email, displayName:data.actor.displayName||'', role:data.actor.role, personId:data.actor.personId||'', accessProfile:currentUser?.accessProfile||data.actor.accessProfile||{} };
    const versionMatch=String(data.backend?.version||'')===String(FRONTEND_BUILD||'');
    const grid = document.getElementById('status-grid');
    if (grid) grid.innerHTML = [
      statusCard('Autenticación', data.authenticated, `${data.actor.email} · ${currentAccessSummary_()}`),
      statusCard('Backend', data.backend.ok, `v${data.backend.version} · ${data.backend.environment} · ${data.backend.responseMs||data.totalResponseMs||0} ms`),
      statusCard('Frontend', versionMatch, `v${FRONTEND_BUILD}${versionMatch?' · sincronizado':' · no coincide con backend'}`),
      statusCard('Google Sheets', data.sheets.ok, `${data.sheets.spreadsheetName} · ${data.sheets.requiredSheets} hojas · ${data.sheets.responseMs||0} ms`),
      statusCard('Google Drive', data.drive.ok, `${data.drive.rootFolderName} · ${data.drive.responseMs||0} ms`),
      statusCard('Drive API v3', !!data.ocr?.ok, data.ocr?.ok ? `${data.ocr.apiVersion} · ${data.ocr.method} · ${data.ocr.responseMs||0} ms` : (data.ocr?.detail || 'No disponible')),
      statusCard('OCR PDF', !!data.ocr?.ocrPdfReady, data.ocr?.ocrPdfReady ? 'Preparado · idioma español' : 'No disponible'),
      statusCard('Respuesta completa', roundTrip<5000, `${roundTrip} ms · comprobado ${formatAppDateTime_(data.checkedAt||new Date().toISOString())}`)
    ].join('');
    const summary=document.getElementById('system-status-summary');if(summary){summary.className=`system-status-summary ${versionMatch?'ok':'warning'}`;summary.innerHTML=`<strong>${versionMatch?'Sistema disponible':'Advertencia de versión'}</strong><span>${versionMatch?'Frontend y backend están sincronizados.':`Frontend ${escapeHtml(FRONTEND_BUILD)} / Backend ${escapeHtml(data.backend?.version||'—')}`}</span>`;}
    showMessage(versionMatch?'Sistema disponible.':'El sistema responde, pero frontend y backend no coinciden.', versionMatch?'success':'warning','system-message');
  } catch (error) {
    if (!sessionToken) return renderLogin();
    showMessage(`${error.message}${error.requestId ? ` · Solicitud ${error.requestId}` : ''}`, 'error','system-message');
  } finally {
    if (button) button.disabled = false;
  }
}

function performanceAggregateClient_(rows){
  const groups={};
  (rows||[]).forEach(r=>{
    const category=String(r.category||performanceCategoryClient_(r.action)),key=category+':'+(r.action||'unknown');
    const g=groups[key]||(groups[key]={action:r.action||'unknown',category,count:0,durations:[],server:0,sheet:0,rows:0,payload:0,hits:0,misses:0,errors:0,baseReads:0,snapshotStoreReads:0,snapshotReadMs:0,snapshotRebuildMs:0,snapshotHits:0,snapshotMisses:0,snapshotStales:0,snapshotRebuilds:0});
    g.count++;g.durations.push(Number(r.roundTripMs||0));g.server+=Number(r.serverMs||0);g.sheet+=Number(r.sheetReadMs||0);g.rows+=Number(r.rowsRead||0);g.payload+=Number(r.payloadBytes||0);
    g.hits+=Number(r.requestCacheHits||0)+Number(r.scriptCacheHits||0);g.misses+=Number(r.requestCacheMisses||0)+Number(r.scriptCacheMisses||0);g.baseReads+=Number(r.baseSheetReads||0);g.snapshotStoreReads+=Number(r.snapshotStoreReads||0);g.snapshotReadMs+=Number(r.snapshotReadMs||0);g.snapshotRebuildMs+=Number(r.snapshotRebuildMs||0);g.snapshotHits+=Number(r.snapshotHits||0);g.snapshotMisses+=Number(r.snapshotMisses||0);g.snapshotStales+=Number(r.snapshotStales||0);g.snapshotRebuilds+=Number(r.snapshotRebuilds||0);if(!r.success)g.errors++;
  });
  return Object.values(groups).map(g=>{
    const snapshotSamples=g.snapshotHits+g.snapshotMisses+g.snapshotStales;
    return {action:g.action,category:g.category,count:g.count,avgMs:g.count?Math.round(g.durations.reduce((a,b)=>a+b,0)/g.count):0,p95Ms:performancePercentileClient_(g.durations,95),maxMs:g.durations.length?Math.max(...g.durations):0,avgServerMs:g.count?Math.round(g.server/g.count):0,avgSheetMs:g.count?Math.round(g.sheet/g.count):0,avgRows:g.count?Math.round(g.rows/g.count):0,avgPayload:g.count?Math.round(g.payload/g.count):0,cachePct:(g.hits+g.misses)?Math.round(g.hits*100/(g.hits+g.misses)):0,avgBaseReads:g.count?Math.round(g.baseReads*10/g.count)/10:0,avgSnapshotReadMs:snapshotSamples?Math.round(g.snapshotReadMs/snapshotSamples):0,avgSnapshotRebuildMs:g.snapshotRebuilds?Math.round(g.snapshotRebuildMs/g.snapshotRebuilds):0,snapshotHitPct:snapshotSamples?Math.round(g.snapshotHits*1000/snapshotSamples)/10:0,snapshotRebuilds:g.snapshotRebuilds,errors:g.errors};
  }).sort((a,b)=>b.p95Ms-a.p95Ms);
}
function performanceHealthClass_(ms,thresholds){const t=thresholds||{warningMs:1500,slowMs:2500,criticalMs:5000};return ms>=t.criticalMs?'critical':ms>=t.slowMs?'slow':ms>=t.warningMs?'warning':'ok';}
function performanceHealthLabel_(ms,thresholds){const c=performanceHealthClass_(ms,thresholds);return c==='critical'?'Crítico':c==='slow'?'Lento':c==='warning'?'Atención':'OK';}
function performanceRecommendations_(rows,thresholds,targets){
  const ranking=performanceAggregateClient_(rows),out=[],target=targets||{},p95Target=Number(target.interactiveP95Ms||6000),snapshotTarget=Number(target.snapshotHitPct||80),rebuildTarget=Number(target.eventShellMs||1500);
  if(!rows.length)return ['Todavía no hay suficientes mediciones en este navegador. Usá la aplicación o ejecutá el diagnóstico.'];
  const p95=performancePercentileClient_(rows.map(x=>x.roundTripMs),95),slow=ranking[0];
  if(p95>=p95Target)out.push(`El P95 interactivo está en ${p95} ms y supera el objetivo de ${Math.round(p95Target/1000)} s.`);
  else if(p95>=Number(thresholds?.slowMs||2500))out.push(`El P95 está en ${p95} ms. Conviene priorizar las operaciones que superan 2,5 s.`);
  const snapshotRows=rows.filter(r=>String(r.snapshotType||r.snapshotState||''));
  const snapshotHits=snapshotRows.reduce((a,r)=>a+Number(r.snapshotHits||0),0),snapshotMisses=snapshotRows.reduce((a,r)=>a+Number(r.snapshotMisses||0),0),snapshotStales=snapshotRows.reduce((a,r)=>a+Number(r.snapshotStales||0),0),snapshotSamples=snapshotHits+snapshotMisses+snapshotStales,snapshotPct=snapshotSamples?Math.round(snapshotHits*1000/snapshotSamples)/10:0;
  if(snapshotSamples>=5&&snapshotPct<snapshotTarget)out.push(`El hit-rate de snapshots es ${snapshotPct}% y está por debajo del objetivo del ${snapshotTarget}%.`);
  const dirtyHits=snapshotRows.filter(r=>String(r.snapshotState||'').toUpperCase()==='HIT'&&Number(r.baseSheetReads||0)>0);
  if(dirtyHits.length)out.push(`${dirtyHits.length} HIT de snapshot realizaron lecturas de tablas base. Ese recorrido debe revisarse.`);
  const rebuildRows=snapshotRows.filter(r=>Number(r.snapshotRebuildMs||0)>rebuildTarget);
  if(rebuildRows.length)out.push(`Hay ${rebuildRows.length} reconstrucciones de snapshot por encima de ${rebuildTarget} ms; conviene revisar su volumen o frecuencia.`);
  if(slow&&slow.avgSheetMs>slow.avgServerMs*.55&&slow.avgSheetMs>400)out.push(`${performanceActionLabel_(slow.action)} dedica gran parte del backend a Google Sheets (${slow.avgSheetMs} ms de media): revisar lecturas y filtros.`);
  if(slow&&slow.avgRows>5000)out.push(`${performanceActionLabel_(slow.action)} procesa unas ${slow.avgRows.toLocaleString('es-ES')} filas por consulta: conviene reducir el conjunto leído o precalcular agregados.`);
  if(slow&&slow.avgPayload>500000)out.push(`${performanceActionLabel_(slow.action)} devuelve alrededor de ${performanceFormatBytes_(slow.avgPayload)}: revisar campos enviados y carga diferida.`);
  const hits=rows.reduce((a,r)=>a+Number(r.requestCacheHits||0)+Number(r.scriptCacheHits||0),0),misses=rows.reduce((a,r)=>a+Number(r.requestCacheMisses||0)+Number(r.scriptCacheMisses||0),0);if(hits+misses>10&&hits/(hits+misses)<.35)out.push('El aprovechamiento de caché general es bajo. Hay margen para evitar lecturas repetidas.');
  if(rows.some(r=>!r.success))out.push('Hay errores registrados en el período. Revisá las últimas llamadas para distinguir timeout, backend o integración externa.');
  if(!out.length)out.push('El hot path no muestra un cuello dominante: snapshots estables, sin lecturas base en HIT y tiempos dentro de objetivo.');
  return out.slice(0,6);
}
function farSyncSystemPanelMarkup_(){return `<section class="panel settings-section-panel"><div class="panel-heading"><div><span class="eyebrow">FAR / MatchReady</span><h2>Sincronización automática</h2><p>Una única ejecución diaria actualiza competiciones de Marbella, designaciones arbitrales y documentos oficiales.</p></div><button class="button secondary" id="system-far-sync-now" disabled>Actualizar ahora (respaldo)</button></div><div id="system-far-sync-status" class="info-strip">Comprobando trigger y última ejecución…</div><div id="system-far-sync-message" class="message"></div></section>`;}
async function loadFarSyncSystemStatus_(){
  const host=document.getElementById('system-far-sync-status'),button=document.getElementById('system-far-sync-now');if(!host)return;
  try{
    const {data:far}=await call('getFarSyncStatus'),last=far.lastRun||{},state=String(far.lastStatus||'NEVER'),stateLabel=state==='NEVER'?'Sin ejecutar':state;
    const auth=far.triggerAuthorization||{},needsAuth=auth.status==='REQUIRED',authAction=needsAuth&&auth.authorizationUrl?`<div class="button-row"><a class="button mini primary" href="${escapeHtml(auth.authorizationUrl)}" target="_blank" rel="noopener">Autorizar automática</a><button class="button mini secondary" type="button" id="system-far-recheck">Ya autoricé · comprobar</button></div>`:'';
    host.innerHTML=`<div><strong>${far.enabled?'Automática activa':needsAuth?'Automática pendiente de autorización':'Automática no disponible'}</strong><br><span class="status-pill ${state==='OK'?'success':state==='WARNING'||state==='ERROR'?'warning':'muted'}">${escapeHtml(stateLabel)}</span> · ${escapeHtml(far.window||'04:00–04:30 Europe/Madrid')} · Próxima: ${escapeHtml(far.nextRun||'—')}${far.lastCompletedAt?`<br><small>Última ${escapeHtml(formatAppDateTime_(far.lastCompletedAt))} · Competiciones ${Number(last.competitions?.ok||0)}/${Number(last.competitions?.total||0)} · Fuentes ${Number(last.refereeSources?.ok||0)}/${Number(last.refereeSources?.total||0)} · Documentos nuevos ${Number(last.documents?.newDocuments||0)} · ${Number(last.durationMs||0).toLocaleString('es-ES')} ms</small>`:''}${needsAuth?`<br><small>Google requiere una autorización única del usuario que publicó Apps Script para crear el trigger diario.</small>`:far.triggerError?`<br><small>Trigger: ${escapeHtml(far.triggerError)}</small>`:''}</div>${authAction}`;
    const recheck=document.getElementById('system-far-recheck');if(recheck)recheck.onclick=()=>loadFarSyncSystemStatus_();
    if(button){button.disabled=state==='RUNNING';button.onclick=async()=>{if(!confirm('¿Ejecutar ahora la sincronización FAR completa? El proceso automático diario seguirá activo.'))return;button.disabled=true;showMessage('Sincronizando FAR / MatchReady… Podés seguir navegando; esta operación puede tardar varios minutos.','info','system-far-sync-message');try{const {data}=await call('syncAllFar',{seasonId:selectedSeasonId_()});showMessage(`Sincronización ${escapeHtml(String(data.status||'OK'))}: competiciones ${Number(data.competitions?.ok||0)}/${Number(data.competitions?.total||0)} · fuentes ${Number(data.refereeSources?.ok||0)}/${Number(data.refereeSources?.total||0)} · documentos nuevos ${Number(data.documents?.newDocuments||0)}.` ,data.status==='OK'?'success':'warning','system-far-sync-message');await loadFarSyncSystemStatus_();await loadPerformancePanel_();}catch(error){showMessage(error.message,'error','system-far-sync-message');button.disabled=false;}};}
  }catch(error){host.innerHTML=`<div><strong>No se pudo comprobar la sincronización FAR</strong><br><small>${escapeHtml(error.message)}</small></div>`;if(button)button.disabled=false;}
}

function performancePanelMarkup_(){return `<section class="panel settings-section-panel performance-panel"><div class="panel-heading"><div><span class="eyebrow">Rendimiento</span><h2>Monitorización y optimización</h2><p>Mediciones reales por versión, con estado HIT / MISS / STALE / REBUILD y separación entre snapshots y tablas base.</p></div><div class="button-row"><button class="button secondary" id="performance-refresh">Actualizar</button><button class="button primary" id="performance-diagnostic">Ejecutar diagnóstico</button></div></div><div class="filter-bar"><label>Versión<select id="performance-version-filter"><option value="CURRENT">Versión actual</option><option value="ALL">Todas</option></select></label><label>Período<select id="performance-period-filter"><option value="1H">Última hora</option><option value="TODAY" selected>Hoy</option><option value="7D">7 días</option></select></label></div><div id="performance-summary" class="performance-summary"><strong>Recopilando métricas…</strong><span>Un snapshot HIT correcto debe registrar 0 lecturas de tablas base.</span></div><div id="performance-kpis" class="performance-kpis"></div><div class="performance-two-col"><article><div class="section-heading"><div><h3>Operaciones más lentas</h3><p>P50/P95 y comportamiento del snapshot por operación.</p></div></div><div id="performance-ranking"></div></article><article><div class="section-heading"><div><h3>Diagnóstico</h3><p>Alertas del hot path y objetivos de rendimiento.</p></div></div><div id="performance-recommendations"></div></article></div><div class="section-heading"><div><h3>Últimas llamadas</h3><p>Estado del snapshot, lecturas base, tiempos y payload por operación.</p></div></div><div id="performance-recent"></div><details class="performance-central-log"><summary>Registro central de llamadas lentas / errores</summary><div id="performance-server-log"></div></details><div id="performance-message" class="message"></div></section>`;}
function performanceScopedRows_(){
  const all=performanceHistory_().filter(r=>!['getPerformanceData'].includes(r.action)),f=performanceFilterState_||{version:'CURRENT',period:'TODAY'},now=Date.now();
  return all.filter(r=>{
    const version=String(r.appVersion||'');if(f.version==='CURRENT'&&version&&version!==FRONTEND_BUILD)return false;if(f.version!=='CURRENT'&&f.version!=='ALL'&&version!==f.version)return false;
    if(f.period==='1H')return Number(r.at||0)>=now-3600000;
    if(f.period==='TODAY'){const d=new Date(Number(r.at||0));const n=new Date();return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate();}
    return Number(r.at||0)>=now-7*86400000;
  });
}
function performancePreviousVersionComparison_(interactive,thresholds){
  if((performanceFilterState_||{}).version!=='CURRENT')return '';
  const all=performanceHistory_().filter(r=>String(r.category||performanceCategoryClient_(r.action))==='INTERACTIVE'),versions=[...new Set(all.map(r=>String(r.appVersion||'')).filter(v=>v&&v!==FRONTEND_BUILD))];
  if(!versions.length||!interactive.length)return '';
  const previous=versions.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).pop(),prevRows=all.filter(r=>String(r.appVersion||'')===previous),curP95=performancePercentileClient_(interactive.map(r=>r.roundTripMs),95),prevP95=performancePercentileClient_(prevRows.map(r=>r.roundTripMs),95);
  if(!prevP95)return '';
  const delta=Math.round((curP95-prevP95)*100/prevP95),label=delta<0?`${Math.abs(delta)}% mejor`:delta>0?`${delta}% peor`:'sin cambio';
  return `<div class="info-strip"><strong>${escapeHtml(FRONTEND_BUILD)} vs ${escapeHtml(previous)}</strong> · P95 ${curP95} ms vs ${prevP95} ms · ${escapeHtml(label)}.</div>`;
}
function renderPerformanceLocalPanel_(data){
  const host=document.getElementById('performance-kpis');if(!host)return;
  const remote=data&&typeof data==='object'?data:{};
  const allRows=performanceScopedRows_();
  const rows=allRows.filter(r=>String(r.category||performanceCategoryClient_(r.action))==='INTERACTIVE');
  const thresholds=remote.thresholds||{warningMs:1500,slowMs:2500,criticalMs:5000};
  const targets=remote.targets||{eventShellMs:1500,matchSummaryHitMs:1500,availabilityHitMs:1500,homeHitMs:2000,calendarMs:3000,interactiveP95Ms:6000,snapshotHitPct:80,baseReadsOnHit:0};
  const durations=rows.map(r=>r.roundTripMs),p50=performancePercentileClient_(durations,50),p95=performancePercentileClient_(durations,95),avg=durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):0;
  const slowCount=rows.filter(r=>r.roundTripMs>=thresholds.slowMs).length,errors=rows.filter(r=>!r.success).length,ranking=performanceAggregateClient_(rows);
  const cacheHits=rows.reduce((a,r)=>a+Number(r.requestCacheHits||0)+Number(r.scriptCacheHits||0),0),cacheMisses=rows.reduce((a,r)=>a+Number(r.requestCacheMisses||0)+Number(r.scriptCacheMisses||0),0),cachePct=cacheHits+cacheMisses?Math.round(cacheHits*100/(cacheHits+cacheMisses)):0;
  const snapshotRows=rows.filter(r=>String(r.snapshotType||r.snapshotState||''));
  const localSnapshotHits=snapshotRows.reduce((a,r)=>a+Number(r.snapshotHits||0),0),localSnapshotMisses=snapshotRows.reduce((a,r)=>a+Number(r.snapshotMisses||0),0),localSnapshotStales=snapshotRows.reduce((a,r)=>a+Number(r.snapshotStales||0),0),localSnapshotRebuilds=snapshotRows.reduce((a,r)=>a+Number(r.snapshotRebuilds||0),0),localSamples=localSnapshotHits+localSnapshotMisses+localSnapshotStales;
  const remoteSnapshots=remote.snapshots||{},snapshotHits=localSamples?localSnapshotHits:Number(remoteSnapshots.hits||0),snapshotMisses=localSamples?localSnapshotMisses:Number(remoteSnapshots.misses||0),snapshotStales=localSamples?localSnapshotStales:Number(remoteSnapshots.stales||0),snapshotRebuilds=localSamples?localSnapshotRebuilds:Number(remoteSnapshots.rebuilds||0),snapshotSamples=snapshotHits+snapshotMisses+snapshotStales,snapshotPct=snapshotSamples?Math.round(snapshotHits*1000/snapshotSamples)/10:Number(remoteSnapshots.hitPct||0);
  const snapshotReadTotal=snapshotRows.reduce((a,r)=>a+Number(r.snapshotReadMs||0),0),snapshotRebuildTotal=snapshotRows.reduce((a,r)=>a+Number(r.snapshotRebuildMs||0),0),snapshotReadAvg=localSamples?Math.round(snapshotReadTotal/localSamples):Number(remoteSnapshots.avgReadMs||0),snapshotRebuildAvg=localSnapshotRebuilds?Math.round(snapshotRebuildTotal/localSnapshotRebuilds):Number(remoteSnapshots.avgRebuildMs||0);
  const baseReadsOnHit=snapshotRows.filter(r=>String(r.snapshotState||'').toUpperCase()==='HIT').reduce((a,r)=>a+Number(r.baseSheetReads||0),0);
  const health=performanceHealthClass_(p95,thresholds),summary=document.getElementById('performance-summary'),snapshotHealthy=!snapshotSamples||snapshotPct>=Number(targets.snapshotHitPct||80);
  if(summary){summary.className=`performance-summary ${baseReadsOnHit?'critical':!snapshotHealthy?'warning':health}`;summary.innerHTML=`<strong>${rows.length?`Estado ${baseReadsOnHit?'Hot path con lecturas base':performanceHealthLabel_(p95,thresholds)}`:'Sin muestra suficiente'}</strong><span>${rows.length?`${rows.length} llamadas · P95 ${p95} ms · snapshot HIT ${snapshotPct}% · base en HIT ${baseReadsOnHit}`:'Ejecutá el diagnóstico o usá la plataforma para empezar a medir.'}</span>`;}
  host.innerHTML=`<article><span>Promedio</span><strong>${avg} ms</strong><small>ida y vuelta</small></article><article><span>P50</span><strong>${p50} ms</strong><small>mediana</small></article><article class="${p95>=Number(targets.interactiveP95Ms||6000)?'critical':performanceHealthClass_(p95,thresholds)}"><span>P95 interactivo</span><strong>${p95} ms</strong><small>objetivo &lt; ${Number(targets.interactiveP95Ms||6000).toLocaleString('es-ES')} ms</small></article><article class="${snapshotSamples&&snapshotPct<Number(targets.snapshotHitPct||80)?'warning':''}"><span>Snapshot hit-rate</span><strong>${snapshotPct}%</strong><small>${snapshotHits} HIT / ${snapshotMisses} MISS / ${snapshotStales} STALE</small></article><article class="${baseReadsOnHit?'critical':'ok'}"><span>Base en snapshot HIT</span><strong>${baseReadsOnHit}</strong><small>objetivo: 0 lecturas</small></article><article><span>Lectura snapshot</span><strong>${snapshotReadAvg} ms</strong><small>media HIT/MISS/STALE</small></article><article class="${snapshotRebuildAvg>1500?'warning':''}"><span>Reconstrucción</span><strong>${snapshotRebuildAvg} ms</strong><small>${snapshotRebuilds} REBUILD</small></article><article><span>Caché general</span><strong>${cachePct}%</strong><small>${cacheHits} hits / ${cacheMisses} misses</small></article><article><span>Lentas</span><strong>${slowCount}</strong><small>≥ ${thresholds.slowMs} ms</small></article><article class="${errors?'warning':''}"><span>Errores</span><strong>${errors}</strong><small>período seleccionado</small></article>`;
  const rankHost=document.getElementById('performance-ranking');if(rankHost)rankHost.innerHTML=ranking.length?`<div class="table-wrap"><table class="performance-table"><thead><tr><th>Operación</th><th>Llam.</th><th>Media</th><th>P95</th><th>Snapshot</th><th>Base</th><th>Sheets</th><th>Filas</th><th>Payload</th></tr></thead><tbody>${ranking.slice(0,10).map(r=>`<tr><td><strong>${escapeHtml(performanceActionLabel_(r.action))}</strong><small>${escapeHtml(r.action)}</small></td><td>${r.count}</td><td>${r.avgMs} ms</td><td><span class="performance-pill ${performanceHealthClass_(r.p95Ms,thresholds)}">${r.p95Ms} ms</span></td><td>${r.snapshotHitPct}%<small>${r.avgSnapshotReadMs} ms lectura</small></td><td>${r.avgBaseReads}</td><td>${r.avgSheetMs} ms</td><td>${r.avgRows.toLocaleString('es-ES')}</td><td>${performanceFormatBytes_(r.avgPayload)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state">Todavía no hay llamadas medidas.</div>';
  const rec=document.getElementById('performance-recommendations');if(rec){const active=remote.optimizations?.scriptCacheSheets||[];rec.innerHTML=`<div class="performance-recommendation-list">${performanceRecommendations_(rows,thresholds,targets).map((x,i)=>`<article><span>${i+1}</span><p>${escapeHtml(x)}</p></article>`).join('')}</div>${performancePreviousVersionComparison_(rows,thresholds)}${remote.optimizations?.snapshotHotPath?`<div class="info-strip"><strong>Snapshot Hot Path activo.</strong> Revisión por evento/dominio, lectura directa y reconstrucción al escribir. Objetivo de HIT ≥ ${Number(remoteSnapshots.targetHitPct||80)}%.</div>`:active.length?`<div class="info-strip">Optimización activa: caché por petición + slices por evento + caché versionada de ${escapeHtml(active.join(', '))} (${escapeHtml(String(remote.optimizations?.scriptCacheSeconds||'180/600 s'))}).</div>`:'<div class="info-strip">Métricas locales disponibles. Cargando información complementaria del backend…</div>'}`;}
  const recent=document.getElementById('performance-recent');if(recent){const recentRows=rows.slice().sort((a,b)=>b.at-a.at).slice(0,20);recent.innerHTML=recentRows.length?`<div class="table-wrap"><table class="performance-table"><thead><tr><th>Hora</th><th>Operación</th><th>Total</th><th>Snapshot</th><th>Lectura / rebuild</th><th>Base</th><th>Store</th><th>Sheets</th><th>Fases</th><th>Filas</th><th>Payload</th></tr></thead><tbody>${recentRows.map(r=>{const state=String(r.snapshotState||'—').toUpperCase(),stateClass=state==='HIT'?'ok':state==='REBUILD'?'warning':state==='MISS'||state==='STALE'?'slow':'';return `<tr><td>${escapeHtml(formatAppDateTime_(new Date(r.at).toISOString()).slice(11))}</td><td><strong>${escapeHtml(performanceActionLabel_(r.action))}</strong><small>${escapeHtml(r.action)}</small></td><td><span class="performance-pill ${performanceHealthClass_(r.roundTripMs,thresholds)}">${r.roundTripMs} ms</span></td><td><span class="performance-pill ${stateClass}">${escapeHtml(state)}</span><small>${escapeHtml(r.snapshotType||'')}</small></td><td>${Number(r.snapshotReadMs||0)} / ${Number(r.snapshotRebuildMs||0)} ms</td><td>${Number(r.baseSheetReads||0)}</td><td>${Number(r.snapshotStoreReads||0)}</td><td>${Number(r.sheetReadMs||0)} ms</td><td><small>${escapeHtml(performancePhaseText_(r.phases)||'—')}</small></td><td>${Number(r.rowsRead||0).toLocaleString('es-ES')}</td><td>${performanceFormatBytes_(r.payloadBytes)}</td></tr>`;}).join('')}</tbody></table></div>`:'<div class="empty-state">Todavía no hay llamadas medidas.</div>';}
}
function renderPerformanceServerLog_(data,error){
  const server=document.getElementById('performance-server-log');if(!server)return;
  if(error){server.innerHTML=`<div class="message warning">Registro central no disponible temporalmente. Las métricas locales siguen funcionando.<br><small>${escapeHtml(error.message||'')}</small></div>`;return;}
  const d=data||{},rr=d.recent||[];
  server.innerHTML=!d.serverLogAvailable?`<div class="message warning">${escapeHtml(d.serverLogError||'El registro central no está disponible temporalmente. Las métricas locales siguen funcionando.')}</div>`:rr.length?`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Versión</th><th>Operación</th><th>Backend</th><th>Snapshot</th><th>Base</th><th>Lectura / rebuild</th><th>Estado</th></tr></thead><tbody>${rr.slice(0,30).map(r=>`<tr><td>${escapeHtml(formatAppDateTime_(r.occurredAt))}</td><td>${escapeHtml(r.appVersion||'—')}</td><td>${escapeHtml(performanceActionLabel_(r.action))}</td><td>${escapeHtml(r.serverMs||'0')} ms</td><td>${escapeHtml(r.snapshotState||'—')}<small>${escapeHtml(r.snapshotType||'')}</small></td><td>${escapeHtml(r.baseSheetReads||'0')}</td><td>${escapeHtml(r.snapshotReadMs||'0')} / ${escapeHtml(r.snapshotRebuildMs||'0')} ms</td><td>${String(r.success).toUpperCase()==='TRUE'?escapeHtml(r.level||'SLOW'):`Error ${escapeHtml(r.errorCode||'')}`}</td></tr>`).join('')}</tbody></table></div><p class="muted">${escapeHtml(d.retention?.mode||'')} · máximo ${Number(d.retention?.maxRows||0)} registros.</p>`:'<div class="empty-state">Todavía no se registraron errores, interacciones ≥ 5 s ni resúmenes de sincronización.</div>';
}
async function loadPerformancePanel_(){
  const host=document.getElementById('performance-kpis');if(!host)return;
  const vf=document.getElementById('performance-version-filter'),pf=document.getElementById('performance-period-filter');
  if(vf){const versions=[...new Set(performanceHistory_().map(r=>String(r.appVersion||'')).filter(Boolean))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));vf.innerHTML='<option value="CURRENT">Versión actual ('+escapeHtml(FRONTEND_BUILD)+')</option>'+versions.filter(v=>v!==FRONTEND_BUILD).map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')+'<option value="ALL">Todas</option>';vf.value=performanceFilterState_.version;vf.onchange=()=>{performanceFilterState_.version=vf.value;void loadPerformancePanel_();};}
  if(pf){pf.value=performanceFilterState_.period;pf.onchange=()=>{performanceFilterState_.period=pf.value;void loadPerformancePanel_();};}
  // 0.6.86: el panel local no depende del registro central. Se pinta primero y
  // luego se enriquece con datos del backend. Un fallo de telemetría no vacía la pantalla.
  renderPerformanceLocalPanel_(null);
  renderPerformanceServerLog_(null,new Error('Cargando registro central…'));
  try{
    const version=(performanceFilterState_.version==='CURRENT'?FRONTEND_BUILD:performanceFilterState_.version);const {data}=await call('getPerformanceData',{version,period:performanceFilterState_.period});
    renderPerformanceLocalPanel_(data||{});
    renderPerformanceServerLog_(data||{},null);
    const message=document.getElementById('performance-message');if(message){message.textContent='';message.className='message';}
  }catch(error){
    renderPerformanceServerLog_(null,error);
    showMessage('Las métricas locales están disponibles. El registro central no pudo cargarse y se puede reintentar con “Actualizar”.','warning','performance-message');
  }
}
async function runPerformanceDiagnostic_(){
  const button=document.getElementById('performance-diagnostic');if(button)button.disabled=true;showMessage('Ejecutando Mi semana, Calendario y Estadísticas…','info','performance-message');
  const ctx=currentRoleContext_(),seasonId=selectedSeasonId_(),tests=[['getHomeDashboard',{seasonId,roleCategory:contextRoleCategory_(),divisionIds:contextDivisionIds_(),eventIds:contextEventIds_(),contextLabel:ctx.label||''}],['getCalendarListData',Object.assign({seasonId},calendarVisibleRange_())],['getStatisticsData',{seasonId,contextDivisionIds:contextDivisionIds_(),contextRoleCategory:ctx.roleCategory||'',divisionId:contextSingleDivisionId_()||''}]];
  let ok=0;for(const [action,payload] of tests){try{await call(action,payload);ok++;}catch(_){}}
  showMessage(`Diagnóstico completado: ${ok}/${tests.length} operaciones respondieron correctamente.` ,ok===tests.length?'success':'warning','performance-message');if(button)button.disabled=false;await loadPerformancePanel_();
}

function settingsTabsMarkup_(active){
  const tabs=[['general','General'],['identity','Identidad visual'],['users','Usuarios y accesos'],['seasons','Temporadas'],['refereeing','Arbitraje'],['imports','Importaciones'],['system','Sistema']];
  return `<nav class="settings-tabs" aria-label="Secciones de configuración">${tabs.map(([key,label])=>`<button type="button" class="settings-tab ${active===key?'active':''}" data-settings-tab="${key}">${label}</button>`).join('')}</nav>`;
}
function wireSettingsTabs_(){
  document.querySelectorAll('[data-settings-tab]').forEach(btn=>btn.onclick=()=>renderClubSettings(btn.dataset.settingsTab));
}

function refereeSourceSummaryText_(summary){
  const s=summary||{};
  return `${s.matched||0} designaciones propias · ${s.created||0} nuevas · ${s.updated||0} actualizadas · ${s.removed||0} retiradas${s.pendingAliases?' · '+s.pendingAliases+' nombres por revisar':''}${s.failedCalendars?' · '+s.failedCalendars+' calendarios con error':''}`;
}

async function loadRefereeSourceSettings_(){
  const host=document.getElementById('referee-source-settings-host');if(!host)return;
  try{
    const {data}=await call('getRefereeSourcesData',{seasonId:selectedSeasonId_()}),sources=data.sources||[],aliases=data.aliases||[],referees=data.referees||[],occ=data.occupancySettings||{},refById=Object.fromEntries(referees.map(x=>[x.personId,x]));
    const far=data.farSyncStatus||{},lastFar=far.lastRun||{},farState=String(far.lastStatus||'NEVER'),farClass=farState==='OK'?'success':farState==='WARNING'?'warning':farState==='ERROR'?'warning':'muted';
    const farStatusHtml=`<div class="info-strip"><div><strong>Sincronización FAR automática</strong><br><span class="status-pill ${farClass}">${escapeHtml(farState==='NEVER'?'Sin ejecutar':farState)}</span> · Diaria ${escapeHtml(far.window||'04:00–04:30 Europe/Madrid')} · Próxima: ${escapeHtml(far.nextRun||'—')}${far.lastCompletedAt?`<br><small>Última: ${escapeHtml(formatAppDateTime_(far.lastCompletedAt))} · Competiciones ${Number(lastFar.competitions?.ok||0)}/${Number(lastFar.competitions?.total||0)} · Fuentes arbitrales ${Number(lastFar.refereeSources?.ok||0)}/${Number(lastFar.refereeSources?.total||0)} · Documentos nuevos ${Number(lastFar.documents?.newDocuments||0)}</small>`:''}</div><div class="button-row"><button class="button secondary" id="ref-source-sync-all">Actualizar ahora (respaldo)</button></div></div>`;
    const sourceRows=sources.map(src=>{
      let summary={};try{summary=JSON.parse(src.lastSyncSummary||'{}');}catch(_){summary={};}
      const state=src.lastSyncStatus==='OK'?'<span class="status-pill success">OK</span>':src.lastSyncStatus==='WARNING'?'<span class="status-pill warning">Con avisos</span>':src.lastSyncStatus==='ERROR'?'<span class="status-pill warning">Error</span>':'<span class="status-pill muted">Sin sincronizar</span>';
      return `<tr><td><strong>${escapeHtml(src.name||'Fuente FAR')}</strong><small>${escapeHtml(src.sourceUrl||'')}</small></td><td>${src.status==='ACTIVE'?'<span class="badge active">Activa</span>':'<span class="status-pill muted">Inactiva</span>'}</td><td>${state}${src.lastSyncAt?`<small>${escapeHtml(formatAppDateTime_(src.lastSyncAt))}</small>`:''}${src.lastSyncAt?`<small>${escapeHtml(refereeSourceSummaryText_(summary))}</small>`:'<small>Sin ejecutar todavía.</small>'}</td><td><div class="button-row"><button class="button mini secondary" data-ref-source-edit="${escapeHtml(src.sourceId)}">Editar</button><button class="button mini primary" data-ref-source-sync="${escapeHtml(src.sourceId)}">Reintentar fuente</button></div></td></tr>`;
    }).join('');
    const pending=aliases.filter(a=>String(a.status||'PENDING').toUpperCase()==='PENDING');
    const activeAliases=aliases.filter(a=>String(a.status||'').toUpperCase()==='ACTIVE');
    const pendingRows=pending.map(a=>{
      const suggested=(a.candidatePersonIds||[]).find(id=>refById[id])||'';
      const options=['<option value="">Seleccionar árbitro…</option>'].concat(referees.map(r=>`<option value="${escapeHtml(r.personId)}" ${r.personId===suggested?'selected':''}>${escapeHtml(r.displayName||'')}</option>`)).join('');
      const sample=[a.sampleEventDate,[a.sampleHomeTeam,a.sampleAwayTeam].filter(Boolean).join(' vs ')].filter(Boolean).join(' · ');
      return `<tr><td><strong>${escapeHtml(a.rawName||'—')}</strong><small>${escapeHtml(a.sourceName||'FAR')}${sample?' · '+escapeHtml(sample):''}</small></td><td><select data-ref-alias-person="${escapeHtml(a.aliasId)}">${options}</select></td><td><div class="button-row"><button class="button mini primary" data-ref-alias-link="${escapeHtml(a.aliasId)}">Vincular</button><button class="button mini secondary" data-ref-alias-ignore="${escapeHtml(a.aliasId)}">Ignorar</button></div></td></tr>`;
    }).join('');
    const aliasRows=activeAliases.map(a=>`<tr><td><strong>${escapeHtml(a.rawName||'—')}</strong><small>${escapeHtml(a.sourceName||'Alias FAR')}</small></td><td>${escapeHtml((refById[a.personId]||{}).displayName||'Árbitro no activo')}</td><td><button class="button mini secondary" data-ref-alias-reset="${escapeHtml(a.aliasId)}">Quitar vínculo</button></td></tr>`).join('');
    const externalAuthHtml=typeof competitionExternalAuthHtml_==='function'?competitionExternalAuthHtml_(data.externalAuthorization||{}):'';
    host.innerHTML=`${externalAuthHtml}${farStatusHtml}<div class="section-heading"><h3>Ocupación por designaciones FAR</h3><p>Solo se aplica a partidos designados por FAR. Las asignaciones internas del club usan únicamente el horario real de la actividad.</p></div><form id="ref-occupancy-form" class="form-grid two"><label>Llegada previa (min)<input id="ref-occ-arrival" type="number" min="0" max="180" value="${escapeHtml(String(occ.arrivalBeforeMinutes??60))}"></label><label>Descanso del partido (min)<input id="ref-occ-halftime" type="number" min="0" max="30" value="${escapeHtml(String(occ.halftimeMinutes??10))}"></label><label>Tiempo posterior / comida (min)<input id="ref-occ-post" type="number" min="0" max="180" value="${escapeHtml(String(occ.postMatchMinutes??60))}"></label><label>Duración de juego por defecto (min)<input id="ref-occ-playing" type="number" min="40" max="120" value="${escapeHtml(String(occ.defaultPlayingMinutes??80))}"></label><label>Viaje local por trayecto (min)<input id="ref-occ-local" type="number" min="0" max="180" value="${escapeHtml(String(occ.localTravelEachWay??0))}"></label><label>Viaje cercano por trayecto (min)<input id="ref-occ-near" type="number" min="0" max="240" value="${escapeHtml(String(occ.nearTravelEachWay??45))}"></label><label>Viaje normal por trayecto (min)<input id="ref-occ-normal" type="number" min="0" max="360" value="${escapeHtml(String(occ.normalTravelEachWay??120))}"></label><label>Viaje largo por trayecto (min)<input id="ref-occ-long" type="number" min="0" max="480" value="${escapeHtml(String(occ.longTravelEachWay??180))}"></label><label>Perfil por defecto<select id="ref-occ-profile"><option value="LOCAL" ${occ.defaultProfile==='LOCAL'?'selected':''}>Local</option><option value="NEAR" ${occ.defaultProfile==='NEAR'?'selected':''}>Cercano</option><option value="NORMAL" ${!occ.defaultProfile||occ.defaultProfile==='NORMAL'?'selected':''}>Normal</option><option value="LONG" ${occ.defaultProfile==='LONG'?'selected':''}>Largo</option></select></label><div class="full info-strip"><div><strong>Ejemplo normal:</strong> 2 h de ida + 1 h previa + partido + 1 h posterior + 2 h de vuelta. La franja ampliada se usa para conflictos y posibles ausencias; en Calendario se sigue mostrando solo el horario del partido.</div></div><div class="full button-row"><button class="button primary" type="submit">Guardar ocupación FAR</button></div></form><div class="section-divider"></div><div class="panel-heading"><div><h2>Fuentes arbitrales FAR</h2><p>Estas fuentes son independientes de las competiciones de Marbella. Se leen todos sus calendarios y solo se crean partidos cuando el árbitro pertenece al club.</p></div></div>${sourceRows?`<div class="table-wrap"><table><thead><tr><th>Fuente</th><th>Estado</th><th>Última sincronización</th><th></th></tr></thead><tbody>${sourceRows}</tbody></table></div>`:emptyTable('No hay fuentes arbitrales configuradas todavía.')}<div class="section-divider"></div><div class="section-heading"><h3>Nueva fuente / edición</h3><p>Podés pegar una URL directa de calendario MatchReady o una página FAR que contenga varios calendarios.</p></div><form id="ref-source-form" class="form-grid two"><input id="ref-source-id" type="hidden"><label>Nombre<input id="ref-source-name" required maxlength="140" placeholder="Ej. Calendarios FAR Andalucía"></label><label>Estado<select id="ref-source-status"><option value="ACTIVE">Activa</option><option value="INACTIVE">Inactiva</option></select></label><label class="full">URL FAR / MatchReady<input id="ref-source-url" type="url" required placeholder="https://farugby.com/... o https://farugby.matchready.es/..."></label><label>Orden<input id="ref-source-sort" type="number" min="0" max="9999" value="0"></label><label>Notas<input id="ref-source-notes" maxlength="500" placeholder="Opcional"></label><div class="full button-row"><button class="button primary" type="submit">Guardar fuente</button><button class="button secondary" type="button" id="ref-source-cancel">Limpiar</button></div></form><div id="ref-source-message" class="message"></div><div class="section-divider"></div><div class="section-heading"><h3>Nombres FAR por revisar</h3><p>Solo aparecen nombres que podrían corresponder con alguno de los árbitros activos del club. Vincularlos una vez permite reconocerlos automáticamente en futuras sincronizaciones.</p></div>${pendingRows?`<div class="table-wrap"><table><thead><tr><th>Nombre encontrado</th><th>Árbitro del club</th><th></th></tr></thead><tbody>${pendingRows}</tbody></table></div>`:emptyTable('No hay nombres pendientes de vincular.')}<div class="section-divider"></div><div class="section-heading"><h3>Alias vinculados</h3><p>Equivalencias de nombres FAR ya confirmadas.</p></div>${aliasRows?`<div class="table-wrap"><table><thead><tr><th>Nombre FAR</th><th>Árbitro</th><th></th></tr></thead><tbody>${aliasRows}</tbody></table></div>`:emptyTable('No hay alias manuales todavía.')}`;
    if(typeof wireCompetitionExternalAuth_==='function')wireCompetitionExternalAuth_(data.externalAuthorization||{},()=>loadRefereeSourceSettings_());
    const occForm=document.getElementById('ref-occupancy-form');if(occForm)occForm.onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{await call('saveRefereeOccupancySettings',{seasonId:selectedSeasonId_(),arrivalBeforeMinutes:val('ref-occ-arrival'),halftimeMinutes:val('ref-occ-halftime'),postMatchMinutes:val('ref-occ-post'),defaultPlayingMinutes:val('ref-occ-playing'),localTravelEachWay:val('ref-occ-local'),nearTravelEachWay:val('ref-occ-near'),normalTravelEachWay:val('ref-occ-normal'),longTravelEachWay:val('ref-occ-long'),defaultProfile:val('ref-occ-profile')});invalidateCalendarCaches_();showToast_('Ocupación arbitral FAR actualizada.');await loadRefereeSourceSettings_();}catch(err){showToast_(userErrorText_(err),'warning',6500);if(button)button.disabled=false;}};
    const resetForm=()=>{document.getElementById('ref-source-form')?.reset();const id=document.getElementById('ref-source-id');if(id)id.value='';const sort=document.getElementById('ref-source-sort');if(sort)sort.value='0';};
    document.getElementById('ref-source-cancel')?.addEventListener('click',resetForm);
    document.querySelectorAll('[data-ref-source-edit]').forEach(btn=>btn.onclick=()=>{const src=sources.find(x=>x.sourceId===btn.dataset.refSourceEdit);if(!src)return;document.getElementById('ref-source-id').value=src.sourceId||'';document.getElementById('ref-source-name').value=src.name||'';document.getElementById('ref-source-url').value=src.sourceUrl||'';document.getElementById('ref-source-status').value=src.status||'ACTIVE';document.getElementById('ref-source-sort').value=src.sortOrder||'0';document.getElementById('ref-source-notes').value=src.notes||'';document.getElementById('ref-source-form').scrollIntoView({behavior:'smooth',block:'center'});});
    document.getElementById('ref-source-form').onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{await call('saveRefereeSource',{sourceId:val('ref-source-id'),seasonId:selectedSeasonId_(),name:val('ref-source-name'),sourceUrl:val('ref-source-url'),status:val('ref-source-status'),sortOrder:val('ref-source-sort'),notes:val('ref-source-notes')});showToast_('Fuente arbitral guardada.');await loadRefereeSourceSettings_();}catch(err){showMessage(userErrorText_(err),'error','ref-source-message');if(button)button.disabled=false;}};
    document.querySelectorAll('[data-ref-source-sync]').forEach(btn=>btn.onclick=async()=>{btn.disabled=true;const old=btn.textContent;btn.textContent='Actualizando…';try{const result=(await call('syncRefereeSource',{sourceId:btn.dataset.refSourceSync})).data;invalidateCalendarCaches_();showToast_('Arbitraje FAR: '+refereeSourceSummaryText_(result),result.failedCalendars?'warning':'success',7500);await loadRefereeSourceSettings_();}catch(err){showToast_(userErrorText_(err),'warning',7500);btn.disabled=false;btn.textContent=old;}});
    const syncAll=document.getElementById('ref-source-sync-all');if(syncAll)syncAll.onclick=async()=>{syncAll.disabled=true;const old=syncAll.textContent;syncAll.textContent='Actualizando todo FAR…';try{const r=(await call('syncAllFar',{seasonId:data.seasonId})).data||{};invalidateCalendarCaches_();const cs=r.competitions||{},rs=r.refereeSources||{},docs=r.documents||{};showToast_(`FAR ${r.status||'OK'}: competiciones ${cs.ok||0}/${cs.total||0} · fuentes arbitrales ${rs.ok||0}/${rs.total||0} · designaciones ${rs.matched||0} · documentos nuevos ${docs.newDocuments||0}${r.errors?.length?' · '+r.errors.length+' incidencia(s)':''}`,r.status==='OK'?'success':'warning',9000);await loadRefereeSourceSettings_();}catch(err){showToast_(userErrorText_(err),'warning',9000);syncAll.disabled=false;syncAll.textContent=old;}};

    document.querySelectorAll('[data-ref-alias-link]').forEach(btn=>btn.onclick=async()=>{const alias=aliases.find(x=>x.aliasId===btn.dataset.refAliasLink),select=document.querySelector(`[data-ref-alias-person="${CSS.escape(btn.dataset.refAliasLink)}"]`),personId=select?.value||'';if(!alias||!personId)return showToast_('Seleccioná el árbitro del club.','warning');btn.disabled=true;try{await call('saveRefereeAlias',{aliasId:alias.aliasId,seasonId:data.seasonId,status:'ACTIVE',personId});if(alias.sourceId){try{await call('syncRefereeSource',{sourceId:alias.sourceId});invalidateCalendarCaches_();}catch(err){console.warn('No se pudo resincronizar la fuente tras vincular alias',err);}}showToast_('Nombre FAR vinculado.');await loadRefereeSourceSettings_();}catch(err){showToast_(userErrorText_(err),'warning');btn.disabled=false;}});
    document.querySelectorAll('[data-ref-alias-ignore]').forEach(btn=>btn.onclick=async()=>{const alias=aliases.find(x=>x.aliasId===btn.dataset.refAliasIgnore);if(!alias)return;await call('saveRefereeAlias',{aliasId:alias.aliasId,seasonId:data.seasonId,status:'IGNORED'});showToast_('Nombre FAR ignorado.');await loadRefereeSourceSettings_();});
    document.querySelectorAll('[data-ref-alias-reset]').forEach(btn=>btn.onclick=async()=>{const alias=aliases.find(x=>x.aliasId===btn.dataset.refAliasReset);if(!alias)return;await call('saveRefereeAlias',{aliasId:alias.aliasId,seasonId:data.seasonId,status:'PENDING'});if(alias.sourceId){try{await call('syncRefereeSource',{sourceId:alias.sourceId});invalidateCalendarCaches_();}catch(err){console.warn('No se pudo resincronizar la fuente tras quitar alias',err);}}showToast_('Vínculo retirado.');await loadRefereeSourceSettings_();});
  }catch(err){host.innerHTML=`<div class="message error">${escapeHtml(userErrorText_(err))}</div>`;}
}

async function renderSeasons(){
  settingsSection='seasons';
  if(currentUser?.role!=='ADMIN')return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>Solo un administrador puede gestionar las temporadas.</p></section>','settings');
  if(!seasonContext)await loadSeasonContext_();
  shell(`<section class="hero compact"><span class="eyebrow">Administración</span><h1>Configuración</h1><p>Usuarios, temporadas, identidad e importaciones se administran desde un único lugar.</p></section>${settingsTabsMarkup_('seasons')}<section class="panel"><div class="section-heading"><h2>Temporadas</h2><p>Creá, editá y activá temporadas. Equipos, asignaciones, calendario y estadísticas se separan por temporada.</p></div><div id="season-manager-content"><p>Cargando temporadas…</p></div></section>`,'settings');
  wireSettingsTabs_();
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

async function renderClubSettings(section=settingsSection) {
  settingsSection=section||'general';
  if (currentUser?.role !== 'ADMIN') return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>Solo un administrador puede modificar la configuración del club.</p></section>', 'settings');
  if(settingsSection==='users')return renderUsers();
  if(settingsSection==='seasons')return renderSeasons();
  try { if (!clubConfig) await loadClubConfig(); }
  catch (error) { return shell(`<section class="panel narrow"><h1>No se pudo cargar la configuración</h1><p>${escapeHtml(error.message)}</p></section>`, 'settings'); }
  const s=clubConfig||{};
  const tabsHtml=settingsTabsMarkup_(settingsSection);
  let content='';
  if(settingsSection==='general'){
    content=`<form id="club-general-form" class="panel settings-section-panel"><div class="section-heading"><h2>Datos generales</h2><p>Estos datos se reutilizan en la aplicación y en la pantalla de acceso.</p></div><div class="form-grid two"><label>Nombre del club<input id="official-name" maxlength="120" required value="${escapeHtml(s.officialName||'')}"></label><label class="full">Descripción<textarea id="club-description" maxlength="220" rows="3" placeholder="Ej. Gestión deportiva del club">${escapeHtml(s.description||'')}</textarea><small>Reemplaza el antiguo “nombre corto” y también se muestra en el login.</small></label><label>Correo de contacto<input id="contact-email" type="email" maxlength="254" value="${escapeHtml(s.contactEmail||'')}"></label><label>Teléfono de contacto<input id="contact-phone" maxlength="40" value="${escapeHtml(s.contactPhone||'')}"></label></div><div class="settings-info-grid"><article><span>Temporada activa</span><strong>${escapeHtml(s.activeSeason?.name||'Sin configurar')}</strong></article><article><span>Zona horaria</span><strong>${escapeHtml(APP_TIMEZONE)}</strong></article></div><div class="settings-actions"><div id="message" class="message" aria-live="polite"></div><div class="button-row"><button class="button secondary" type="button" id="settings-open-seasons">Gestionar temporadas</button><button class="button primary" type="submit">Guardar cambios</button></div></div></form>`;
  }else if(settingsSection==='identity'){
    const logoPreview=s.logoDataUrl?`<img id="logo-preview" class="logo-preview" src="${escapeHtml(s.logoDataUrl)}" alt="Logo actual">`:`<div id="logo-preview" class="logo-placeholder">Sin logo</div>`;
    content=`<section class="settings-identity-grid"><form id="club-identity-form" class="panel"><div class="section-heading"><h2>Identidad visual</h2><p>Logo y colores compartidos por login, cabecera y aplicación.</p></div><div class="logo-box">${logoPreview}</div><input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="button-row"><button class="button secondary" type="button" id="choose-logo">Elegir logo</button>${s.logoDataUrl?'<button class="button link danger-text" type="button" id="remove-logo">Quitar</button>':''}</div><div id="logo-message" class="message"></div><div class="color-list"><label>Principal<div class="color-control"><input id="primary-color" type="color" value="${escapeHtml(s.primaryColor||'#176b4d')}"><input id="primary-text" class="color-text" value="${escapeHtml(s.primaryColor||'#176b4d')}" maxlength="7"></div></label><label>Secundario<div class="color-control"><input id="secondary-color" type="color" value="${escapeHtml(s.secondaryColor||'#12372a')}"><input id="secondary-text" class="color-text" value="${escapeHtml(s.secondaryColor||'#12372a')}" maxlength="7"></div></label><label>Acento<div class="color-control"><input id="accent-color" type="color" value="${escapeHtml(s.accentColor||'#d8a53b')}"><input id="accent-text" class="color-text" value="${escapeHtml(s.accentColor||'#d8a53b')}" maxlength="7"></div></label></div><button class="button secondary full" type="button" id="suggest-colors">Sugerir desde logo</button><div class="settings-actions"><div id="message" class="message"></div><button class="button primary" type="submit">Guardar identidad</button></div></form><aside class="panel branding-preview-card"><span class="eyebrow">Vista previa</span><div class="branding-preview-head" id="branding-preview-head">${s.logoDataUrl?`<img src="${escapeHtml(s.logoDataUrl)}" alt="Logo">`:`<span>${escapeHtml(brandInitials_(s.officialName||config.appName))}</span>`}<div><strong>${escapeHtml(s.officialName||config.appName||'Gestión Club')}</strong><small>${escapeHtml(s.description||'Gestión deportiva del club')}</small></div></div><div class="branding-preview-login"><h3>Acceso al club</h3><p>Así se verá la identidad antes de iniciar sesión.</p><button class="button primary" type="button" disabled>Entrar</button></div></aside></section>`;
  }else if(settingsSection==='refereeing'){
    content=`<section class="panel settings-section-panel"><div id="referee-source-settings-host"><p>Cargando fuentes arbitrales FAR…</p></div></section>`;
  }else if(settingsSection==='imports'){
    content=`<section class="panel settings-section-panel"><div class="section-heading"><h2>Importaciones</h2><p>Cargas masivas controladas para mantener la información del club.</p></div><div class="settings-action-cards"><article><span class="eyebrow">Entrenamiento</span><h3>Biblioteca de ejercicios</h3><p>Importá archivos XLSX con vista previa y detección de duplicados por nombre + categoría.</p><div class="button-row"><button class="button primary" id="settings-import-exercises">Importar ejercicios</button><button class="button secondary" id="settings-open-exercises">Abrir biblioteca</button></div></article><article class="muted-card"><span class="eyebrow">Próximamente</span><h3>Más importaciones</h3><p>Este mismo patrón podrá reutilizarse para plantillas u otros catálogos sin editar Google Sheets manualmente.</p></article></div><div id="settings-import-host"></div></section>`;
  }else{
    content=`<section class="panel settings-section-panel system-panel"><div class="panel-heading"><div><h2>Estado técnico</h2><p>Comprobación de backend, almacenamiento, OCR y sincronización del frontend.</p></div><button class="button secondary" id="refresh-status">Actualizar</button></div><div id="system-status-summary" class="system-status-summary"><strong>Comprobando…</strong><span>Validando servicios de Gestión Club.</span></div><div id="status-grid" class="status-grid system-status-grid">${statusCard('Autenticación',true,currentUser?.email||'Sesión activa')}${statusCard('Backend',false,'Comprobando…')}${statusCard('Frontend',true,`v${FRONTEND_BUILD}`)}${statusCard('Google Sheets',false,'Comprobando…')}${statusCard('Google Drive',false,'Comprobando…')}${statusCard('Drive API v3',false,'Comprobando…')}${statusCard('OCR PDF',false,'Comprobando…')}${statusCard('Respuesta completa',false,'Midiendo…')}</div><div id="system-message" class="message"></div><div class="settings-system-grid compact"><article><span>Entorno</span><strong>${escapeHtml(config.environment||'—')}</strong></article><article><span>Zona horaria</span><strong>${escapeHtml(APP_TIMEZONE)}</strong></article><article><span>Autenticación</span><strong>${escapeHtml(config.authMode||'SHEETS_PASSWORD')}</strong></article><article><span>Temporada activa</span><strong>${escapeHtml(s.activeSeason?.name||'Sin configurar')}</strong></article></div><div class="info-strip">Las operaciones de inicialización destructiva no se exponen desde esta pantalla.</div></section>${farSyncSystemPanelMarkup_()}${performancePanelMarkup_()}`;
  }
  shell(`<section class="hero compact"><span class="eyebrow">Administración</span><h1>Configuración</h1><p>Identidad, datos generales, importaciones y estado del sistema en una única sección.</p></section>${tabsHtml}${content}`,'settings');
  wireSettingsTabs_();
  if(settingsSection==='general'){
    document.getElementById('settings-open-seasons')?.addEventListener('click',()=>renderClubSettings('seasons'));
    document.getElementById('club-general-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;if(button)button.disabled=true;try{const payload={officialName:val('official-name'),description:val('club-description'),contactEmail:val('contact-email'),contactPhone:val('contact-phone'),primaryColor:s.primaryColor||'#176b4d',secondaryColor:s.secondaryColor||'#12372a',accentColor:s.accentColor||'#d8a53b'};const {data}=await call('saveClubConfig',payload);clubConfig=data;Object.assign(publicBranding,{officialName:data.officialName,description:data.description,primaryColor:data.primaryColor,secondaryColor:data.secondaryColor,accentColor:data.accentColor,logoDataUrl:data.logoDataUrl||''});applyClubTheme(data);showToast_('Configuración general guardada.');await renderClubSettings('general');}catch(error){showMessage(error.message,'error');if(button)button.disabled=false;}};
  }
  if(settingsSection==='identity'){
    wireColorPair('primary');wireColorPair('secondary');wireColorPair('accent');let selectedLogo=null,removeLogo=false;const fileInput=document.getElementById('logo-file');
    const refreshBrandPreview=()=>{const host=document.getElementById('branding-preview-head');if(!host)return;const logo=selectedLogo?.dataUrl||(!removeLogo?s.logoDataUrl:'');host.innerHTML=`${logo?`<img src="${escapeHtml(logo)}" alt="Logo">`:`<span>${escapeHtml(brandInitials_(s.officialName||config.appName))}</span>`}<div><strong>${escapeHtml(s.officialName||config.appName||'Gestión Club')}</strong><small>${escapeHtml(s.description||'Gestión deportiva del club')}</small></div>`;};
    document.getElementById('choose-logo').onclick=()=>fileInput.click();fileInput.onchange=async()=>{const file=fileInput.files?.[0];if(!file)return;if(file.size>1500000)return showMessage('El logo supera 1,5 MB.','error','logo-message');if(!['image/png','image/jpeg','image/webp'].includes(file.type))return showMessage('Formato de logo no permitido.','error','logo-message');selectedLogo={file,dataUrl:await fileToDataUrl(file)};removeLogo=false;document.getElementById('logo-preview').outerHTML=`<img id="logo-preview" class="logo-preview" src="${escapeHtml(selectedLogo.dataUrl)}" alt="Vista previa">`;refreshBrandPreview();showMessage(file.name,'success','logo-message');};
    document.getElementById('remove-logo')?.addEventListener('click',()=>{selectedLogo=null;removeLogo=true;document.getElementById('logo-preview').outerHTML='<div id="logo-preview" class="logo-placeholder">Sin logo</div>';refreshBrandPreview();showMessage('El logo se eliminará al guardar.','info','logo-message');});
    document.getElementById('suggest-colors').onclick=async()=>{const dataUrl=selectedLogo?.dataUrl||s.logoDataUrl;if(!dataUrl)return showMessage('Primero seleccioná un logo.','error','logo-message');try{const palette=await extractPalette(dataUrl);setColor('primary',palette[0]);setColor('secondary',palette[1]);setColor('accent',palette[2]);applyClubTheme({primaryColor:palette[0],secondaryColor:palette[1],accentColor:palette[2]});showMessage('Paleta sugerida. Podés ajustarla antes de guardar.','success','logo-message');}catch(_){showMessage('No se pudo analizar el logo.','error','logo-message');}};
    document.getElementById('club-identity-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;if(button)button.disabled=true;try{const payload={officialName:s.officialName||config.appName||'Gestión Club',description:s.description||'',contactEmail:s.contactEmail||'',contactPhone:s.contactPhone||'',primaryColor:val('primary-text'),secondaryColor:val('secondary-text'),accentColor:val('accent-text'),logoDataUrl:selectedLogo?.dataUrl||'',logoOriginalName:selectedLogo?.file?.name||'',removeLogo};const {data}=await call('saveClubConfig',payload);clubConfig=data;Object.assign(publicBranding,{officialName:data.officialName,description:data.description,primaryColor:data.primaryColor,secondaryColor:data.secondaryColor,accentColor:data.accentColor,logoDataUrl:data.logoDataUrl||''});applyClubTheme(data);showToast_('Identidad visual guardada. Se aplicará también al próximo login.');await renderClubSettings('identity');}catch(error){showMessage(error.message,'error');if(button)button.disabled=false;}};
  }
  if(settingsSection==='refereeing'){
    await loadRefereeSourceSettings_();
  }
  if(settingsSection==='imports'){
    document.getElementById('settings-open-exercises')?.addEventListener('click',renderTrainingExercises);
    document.getElementById('settings-import-exercises')?.addEventListener('click',()=>openTrainingExerciseImport_('settings-import-host',()=>renderClubSettings('imports')));
  }
  if(settingsSection==='system'){
    document.getElementById('refresh-status')?.addEventListener('click',loadStatus);
    document.getElementById('performance-refresh')?.addEventListener('click',loadPerformancePanel_);
    document.getElementById('performance-diagnostic')?.addEventListener('click',runPerformanceDiagnostic_);
    void loadStatus();
    void loadFarSyncSystemStatus_();
    void loadPerformancePanel_();
  }
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

function recommendedRoleCategories_(){return ['PLAYER','COACH','MANAGER','COORDINATOR','REFEREE_COORDINATOR','REFEREE','COLLABORATOR'];}
function roleCategoryLabel_(category){return ({PLAYER:'Jugador',COACH:'Entrenador',MANAGER:'Manager / Delegado',COORDINATOR:'Coordinador',REFEREE_COORDINATOR:'Coordinador de Árbitros',REFEREE:'Árbitro',COLLABORATOR:'Colaborador'})[category]||category||'—';}
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
  const state=Object.assign({},loadUiState_().peopleFilters||{});state.divisionId=contextScopedDivisionId_(state.divisionId||'');
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
  const divisions=(structureData?.divisions||[]).filter(x=>x.status==='ACTIVE'&&contextAllowsDivisionId_(x.divisionId));
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
  const canManageTraining=!!structureData?.accessProfile?.isAdmin||((structureData?.accessProfile?.scopes?.trainingPlanManageDivisionIds||[]).includes(divisionId));
  const list=plans.length?`<div class="table-wrap"><table><thead><tr><th>Plan</th><th>Vigencia</th><th>Horarios</th><th>Estado</th><th></th></tr></thead><tbody>${plans.map(x=>`<tr><td><strong>${escapeHtml(x.name||'Entrenamiento')}</strong><small>${escapeHtml((teams.find(t=>t.teamId===x.teamId)||{}).name||'Toda la división')}${x.location?' · '+escapeHtml(x.location):''}</small></td><td>${escapeHtml(x.startDate||'—')} → ${escapeHtml(x.endDate||'—')}</td><td><small>${escapeHtml(trainingScheduleSummary_(x))}</small></td><td>${statusBadge(x.status)}</td><td>${canManageTraining?`<div class="button-row"><button type="button" class="button mini secondary" data-edit-training-plan="${escapeHtml(x.trainingPlanId)}">Editar</button><button type="button" class="button mini secondary" data-generate-training-plan="${escapeHtml(x.trainingPlanId)}">Regenerar</button></div>`:'<span class="status-pill muted">Solo lectura</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state">Todavía no hay planes de entrenamiento para esta división.</div>';
  const dayRows=[1,2,3,4,5,6,7].map(day=>{const row=byDay[day]||{};return `<div class="training-day-row"><label class="check-row"><input type="checkbox" data-training-day="${day}" ${row.weekday?'checked':''}> ${trainingDayLabel_(day)}</label><label>Desde<input type="time" data-training-start="${day}" value="${escapeHtml(row.startTime||'')}"></label><label>Hasta<input type="time" data-training-end="${day}" value="${escapeHtml(row.endTime||'')}"></label></div>`;}).join('');
  host.innerHTML=`<section class="inline-editor"><div class="editor-heading"><div><span class="eyebrow">${escapeHtml(division.name)}</span><h3>Planificación de entrenamientos</h3><p>Definí periodos con días y horarios. Al guardar se crean o actualizan los entrenamientos futuros; los cancelados, postergados o editados manualmente no se pisan.</p></div><button type="button" class="button link" id="close-editor">Cerrar</button></div>${list}${canManageTraining?`<div class="section-divider"></div><form id="training-plan-form" class="form-stack"><div class="section-heading"><h3>${plan.trainingPlanId?'Editar plan':'Nuevo plan'}</h3><p>Podés crear un plan de pretemporada y otro de temporada con rangos diferentes.</p></div><div class="form-grid three"><label>Nombre<input id="training-plan-name" maxlength="120" value="${escapeHtml(plan.name||'Entrenamiento')}" required></label><label>Equipo<select id="training-plan-team"><option value="">Toda la división</option>${teams.map(t=>`<option value="${escapeHtml(t.teamId)}" ${plan.teamId===t.teamId?'selected':''}>${escapeHtml(t.name)}</option>`).join('')}</select></label><label>Estado<select id="training-plan-status"><option value="ACTIVE" ${plan.status!=='INACTIVE'?'selected':''}>Activo</option><option value="INACTIVE" ${plan.status==='INACTIVE'?'selected':''}>Inactivo</option></select></label><label>Desde<input id="training-plan-start" type="date" value="${escapeHtml(plan.startDate||season.startDate||'')}" required></label><label>Hasta<input id="training-plan-end" type="date" value="${escapeHtml(plan.endDate||season.endDate||'')}" required></label><label>Ubicación<input id="training-plan-location" maxlength="180" value="${escapeHtml(plan.location||'')}"></label></div><div class="section-heading"><h3>Días y horarios semanales</h3><p>Marcá los días que correspondan y completá horario de inicio y fin.</p></div><div class="training-days-grid">${dayRows}</div><div class="editor-actions"><div id="training-plan-message" class="message"></div><button type="submit" class="button primary">Guardar y generar actividades</button></div></form>`:`<div class="info-strip"><strong>Solo lectura.</strong> Podés consultar la planificación de ${escapeHtml(division.name)}, pero solo los entrenadores/coordinadores con alcance sobre esta división pueden modificarla.</div>`}</section>`;
  host.scrollIntoView({behavior:'smooth',block:'start'});
  document.getElementById('close-editor').onclick=()=>host.innerHTML='';
  document.querySelectorAll('[data-edit-training-plan]').forEach(b=>b.onclick=()=>showTrainingPlansEditor_(divisionId,b.dataset.editTrainingPlan));
  document.querySelectorAll('[data-generate-training-plan]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=(await call('generateTrainingPlanEvents',{trainingPlanId:b.dataset.generateTrainingPlan})).data;showToast_(`Entrenamientos: ${r.created||0} creados · ${r.updated||0} actualizados · ${r.protected||0} protegidos · ${r.removed||0} retirados.`,'success',6500);await loadStructureData();showTrainingPlansEditor_(divisionId,b.dataset.generateTrainingPlan);}catch(err){showMessage(err.message,'error','training-plan-message');b.disabled=false;}});
  if(document.getElementById('training-plan-form'))document.getElementById('training-plan-form').onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;const schedule=[];document.querySelectorAll('[data-training-day]').forEach(ch=>{if(ch.checked){const day=Number(ch.dataset.trainingDay),start=document.querySelector(`[data-training-start="${day}"]`).value,end=document.querySelector(`[data-training-end="${day}"]`).value;schedule.push({weekday:day,startTime:start,endTime:end});}});try{showMessage('Guardando plan y generando entrenamientos…','info','training-plan-message');const res=(await call('saveTrainingPlan',{trainingPlanId:plan.trainingPlanId||'',seasonId:structureData.selectedSeasonId||selectedSeasonId_(),divisionId:divisionId,teamId:val('training-plan-team'),name:val('training-plan-name'),startDate:val('training-plan-start'),endDate:val('training-plan-end'),location:val('training-plan-location'),status:val('training-plan-status'),schedule:schedule,generate:true})).data;const g=res.generation||{};showToast_(`Plan guardado · ${g.created||0} entrenamientos creados · ${g.updated||0} actualizados · ${g.protected||0} protegidos.`,'success',6500);await loadStructureData();showTrainingPlansEditor_(divisionId,res.plan?.trainingPlanId||'');}catch(err){showMessage(err.message,'error','training-plan-message');if(button)button.disabled=false;}};
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

function availabilityPeriodTypeLabelClient_(type){return ({SPORTS_LEAVE:'Baja deportiva',VACATION:'Vacaciones',STUDIES:'Estudios',WORK:'Trabajo',TRAVEL:'Viaje',SUSPENSION:'Sanción deportiva',PERSONAL:'Motivo personal',EVENT_STAFF_ABSENCE:'Ausencia en esta actividad',OTHER:'Otra ausencia'})[type]||'Ausencia';}
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
    <div class="form-grid two"><label>Categoría<select id="role-category">${[['PLAYER','Jugador'],['COACH','Entrenador'],['MANAGER','Manager / Delegado'],['COORDINATOR','Coordinador'],['REFEREE_COORDINATOR','Coordinador de Árbitros'],['REFEREE','Árbitro'],['COLLABORATOR','Colaborador']].map(([v,l]) => `<option value="${v}" ${role.category===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Alcance<select id="role-scope">${[['FLEXIBLE','Flexible'],['TRANSVERSAL','Transversal'],['DIVISION','División']].map(([v,l]) => `<option value="${v}" ${role.scopeType===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
    <div class="info-strip" id="role-scope-help"></div>
    <label>Descripción<textarea id="role-description" maxlength="300" rows="3">${escapeHtml(role.description || '')}</textarea></label>
    <label>Estado<select id="role-status"><option value="ACTIVE" ${role.status !== 'INACTIVE' ? 'selected' : ''}>Activo</option><option value="INACTIVE" ${role.status === 'INACTIVE' ? 'selected' : ''}>Inactivo</option></select></label>`);
  const sync=()=>{const cat=val('role-category'),scope=document.getElementById('role-scope'),help=document.getElementById('role-scope-help');if(['PLAYER','COACH','MANAGER'].includes(cat)){scope.value='DIVISION';scope.disabled=true;help.textContent=cat==='PLAYER'?'Jugador: siempre se asigna a una división.':cat==='COACH'?'Entrenador: el acceso se limita a las divisiones asignadas.':'Manager/Delegado: el acceso y la gestión documental se limitan a las divisiones asignadas.';}else if(cat==='REFEREE'){scope.value='TRANSVERSAL';scope.disabled=true;help.textContent='Árbitro: el acceso se limita a las actividades donde esté asignado.';}else if(cat==='REFEREE_COORDINATOR'){scope.value='TRANSVERSAL';scope.disabled=true;help.textContent='Coordinador de Árbitros: gestiona designaciones internas de todo el club.';}else{scope.disabled=false;help.textContent='Coordinador y Colaborador pueden asignarse a una división o ser transversales para todas las divisiones.';}};
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
  if(!role)return 'OPTIONAL';if(['PLAYER','COACH','MANAGER'].includes(role.category)||role.scopeType==='DIVISION')return 'REQUIRED';if(['REFEREE','REFEREE_COORDINATOR'].includes(role.category)||role.scopeType==='TRANSVERSAL')return 'FORBIDDEN';return 'OPTIONAL';
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
  settingsSection='users';
  if(!currentAccessProfile_().capabilities?.manageUsers) return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>Solo un administrador puede gestionar cuentas de usuario.</p></section>','settings');
  try{
    const {data}=await call('getUsersData'); const people=data.persons||[], users=data.users||[], roles=data.securityRoles||[], personAccessRoles=data.personAccessRoles||{};
    const st=loadUiState_().userFilters||{}, q=textNorm_(st.q||''), status=st.status||'', role=st.role||'';
    const filtered=users.filter(u=>(!q||textNorm_([u.email,personNameById(people,u.personId),(u.accessLabels||[]).join(' ')].join(' ')).includes(q))&&(!status||u.status===status)&&(!role||u.securityRole===role));
    const rows=filtered.map(u=>{const personName=personNameById(people,u.personId),systemPermission=u.securityRole==='ADMIN'?'Administrador':'Acceso por Persona',labels=(u.accessLabels||[]).filter(x=>!/^Administrador/.test(x));return `<tr><td><strong>${escapeHtml(u.email)}</strong><small>${escapeHtml(personName)}</small>${u.personId?`<button class="button mini link" data-user-person="${escapeHtml(u.personId)}">Ver persona</button>`:''}</td><td><strong>${escapeHtml(systemPermission)}</strong><small>${escapeHtml(labels.join(' · ')||'Sin cargos/relaciones con acceso')}</small></td><td>${statusBadge(u.status)}</td><td>${escapeHtml(u.lastLoginAt||'Nunca')}</td><td><div class="button-row"><button class="button mini secondary" data-reset-user="${u.userId}">Reset</button><button class="button mini secondary" data-toggle-user="${u.userId}" data-status="${u.status}" data-role="${u.securityRole}">${u.status==='ACTIVE'?'Desactivar':'Activar'}</button><button class="button mini secondary" data-admin-user="${u.userId}" data-status="${u.status}" data-role="${u.securityRole}">${u.securityRole==='ADMIN'?'Quitar Admin':'Hacer Admin'}</button></div></td></tr>`;}).join('');
    shell(`<section class="hero compact"><span class="eyebrow">Administración</span><h1>Configuración</h1><p>Usuarios, temporadas, identidad e importaciones se administran desde un único lugar.</p></section>${settingsTabsMarkup_('users')}
    <section class="panel"><div class="section-heading"><h2>Usuarios y accesos</h2><p>La cuenta se vincula a una Persona. ADMIN es el único permiso global; el resto se deriva de cargos, divisiones, tutorías y actividades asignadas.</p></div><div class="panel-heading"><div><h2>Cuentas</h2></div></div><div class="filter-bar"><label class="filter-grow">Buscar<input id="user-filter-q" placeholder="Nombre, correo o acceso" value="${escapeHtml(st.q||'')}"></label><label>Permiso<select id="user-filter-role"><option value="">Todos</option>${roles.map(r=>`<option value="${r}" ${role===r?'selected':''}>${escapeHtml(r==='ADMIN'?'Administrador':'Acceso por Persona')}</option>`).join('')}</select></label><label>Estado<select id="user-filter-status"><option value="">Todos</option><option value="ACTIVE" ${status==='ACTIVE'?'selected':''}>Activos</option><option value="DISABLED" ${status==='DISABLED'?'selected':''}>Desactivados</option><option value="LOCKED" ${status==='LOCKED'?'selected':''}>Bloqueados</option></select></label><button class="button secondary filter-clear" id="user-filter-clear">Limpiar</button></div><p class="filter-count">${filtered.length} de ${users.length} usuarios</p>${filtered.length?`<div class="table-wrap"><table><thead><tr><th>Usuario / Persona</th><th>Permiso y accesos efectivos</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay usuarios que coincidan con los filtros.')}
    <form id="user-form" class="form-grid two" style="margin-top:1rem">
      <label>Persona<select id="user-person" required>${optionList(people,'personId',p=>p.displayName,preselectedPersonId||'',false)}</select></label><label>Correo<input id="user-email" type="email" required></label><label>Cargos / relaciones<input id="user-derived-roles" readonly placeholder="Se deriva de la Persona"></label>
      <label>Permiso del sistema<select id="user-security-role"><option value="MEMBER">Acceso por Persona</option><option value="ADMIN">Administrador global</option></select></label>
      <label>Contraseña temporal<input id="user-password" type="password" minlength="10" required></label>
      <div><button class="button primary" type="submit">Crear usuario</button></div>
    </form><div id="message" class="message"></div></section>`,'settings');
    wireSettingsTabs_();
    const applyFilters=()=>{saveUiStatePatch_({userFilters:{q:val('user-filter-q'),role:val('user-filter-role'),status:val('user-filter-status')}});renderUsers();};
    document.getElementById('user-filter-q').onchange=applyFilters;document.getElementById('user-filter-q').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyFilters();}};document.getElementById('user-filter-role').onchange=applyFilters;document.getElementById('user-filter-status').onchange=applyFilters;document.getElementById('user-filter-clear').onclick=()=>{saveUiStatePatch_({userFilters:{}});renderUsers();};
    const syncUserPerson=()=>{const pid=val('user-person'),p=people.find(x=>x.personId===pid);if(p&&p.email)document.getElementById('user-email').value=p.email;const rs=personAccessRoles[pid]||[];const el=document.getElementById('user-derived-roles');if(el)el.value=rs.length?rs.map(roleDisplayName).join(' · '):'Solo datos/documentación propia';};document.getElementById('user-person').onchange=syncUserPerson;syncUserPerson();
    document.getElementById('user-form').onsubmit=async e=>{e.preventDefault();try{await call('createUser',{personId:val('user-person'),email:val('user-email'),securityRole:val('user-security-role'),temporaryPassword:val('user-password')});await renderUsers();}catch(err){showMessage(err.message,'error');}};
    document.querySelectorAll('[data-user-person]').forEach(b=>b.onclick=()=>openUserPerson_(b.dataset.userPerson));
    document.querySelectorAll('[data-reset-user]').forEach(b=>b.onclick=async()=>{const pwd=prompt('Nueva contraseña temporal (mínimo 10 caracteres):');if(!pwd)return;try{await call('resetUserPassword',{userId:b.dataset.resetUser,temporaryPassword:pwd});showMessage('Contraseña restablecida.','success');}catch(err){showMessage(err.message,'error');}});
    document.querySelectorAll('[data-toggle-user]').forEach(b=>b.onclick=async()=>{try{await call('updateUserAccess',{userId:b.dataset.toggleUser,status:b.dataset.status==='ACTIVE'?'DISABLED':'ACTIVE',securityRole:b.dataset.role});await renderUsers();}catch(err){showMessage(err.message,'error');}});
    document.querySelectorAll('[data-admin-user]').forEach(b=>b.onclick=async()=>{const next=b.dataset.role==='ADMIN'?'MEMBER':'ADMIN';try{await call('updateUserAccess',{userId:b.dataset.adminUser,status:b.dataset.status==='ACTIVE'?'ACTIVE':'DISABLED',securityRole:next});await renderUsers();}catch(err){showMessage(err.message,'error');}});
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudieron cargar usuarios</h1><p>${escapeHtml(err.message)}</p></section>`,'settings');}
}


let calendarData=null;
let calendarDataLoadedAt_=0;
let calendarListCache_=null;
function invalidateCalendarCaches_(){calendarData=null;calendarDataLoadedAt_=0;calendarListCache_=null;try{invalidateMatchPlanningCache_();}catch(_){}}
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
function divisionColorForEvent_(e){if(isExternalRefereeMatchClient_(e))return '#B45309';if(e?.divisionColor)return normalizeHexColor_(e.divisionColor);const d=(calendarData?.divisions||[]).find(x=>x.divisionId===e.divisionId);return d?.color||'#64748B';}
function normalizeHexColor_(value){const v=String(value||'').trim().toUpperCase();return /^#[0-9A-F]{6}$/.test(v)?v:'#64748B';}
function mixHexColor_(base,target,amount){
  const a=normalizeHexColor_(base),b=normalizeHexColor_(target);const t=Math.max(0,Math.min(1,amount));
  const c=x=>parseInt(x,16),h=n=>Math.round(n).toString(16).padStart(2,'0');
  const ar=[c(a.slice(1,3)),c(a.slice(3,5)),c(a.slice(5,7))],br=[c(b.slice(1,3)),c(b.slice(3,5)),c(b.slice(5,7))];
  return '#'+h(ar[0]+(br[0]-ar[0])*t)+h(ar[1]+(br[1]-ar[1])*t)+h(ar[2]+(br[2]-ar[2])*t);
}
function divisionColorVariants_(base){const c=normalizeHexColor_(base);return {strong:mixHexColor_(c,'#000000',.12),medium:mixHexColor_(c,'#FFFFFF',.46),light:mixHexColor_(c,'#FFFFFF',.82)};}
function divisionEventStyle_(e){const base=divisionColorForEvent_(e),v=divisionColorVariants_(base);return `--division-color:${escapeHtml(base)};--division-strong:${escapeHtml(v.strong)};--division-medium:${escapeHtml(v.medium)};--division-light:${escapeHtml(v.light)}`;}
function teamPatternForEvent_(e){if(isExternalRefereeMatchClient_(e)||e.eventType==='TRAINING'||!e.teamId)return 'SOLID';if(e?.teamPattern)return e.teamPattern;const t=(calendarData?.teams||[]).find(x=>x.teamId===e.teamId);return t?.displayPattern||'SOLID';}
function teamPatternClass_(e){const p=teamPatternForEvent_(e);return p==='STRIPED'?'team-pattern-striped':p==='DOTTED'?'team-pattern-dotted':'team-pattern-solid';}
function eventStatusLabel(s){return ({PENDING:'Pendiente',SCHEDULED:'Programado',IN_PROGRESS:'En curso',COMPLETED:'Finalizado',CANCELLED:'Cancelado',POSTPONED:'Postergado'})[s]||s;}
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
function calendarEventLine(e){const time=displayEventTime_(e),tm=time?` · ${escapeHtml(time)}`:'',opp=e.eventType==='MATCH'&&e.opponent?` · vs ${escapeHtml(e.opponent)}`:'',ref=isExternalRefereeMatchClient_(e)?' · Árbitro FAR':'';return `<button class="calendar-event ${eventVisualClass_(e)} ${teamPatternClass_(e)} status-${String(e.status||'').toLowerCase()}" style="${divisionEventStyle_(e)}" data-open-event="${e.eventId}"><strong>${escapeHtml(e.title||eventTypeLabel(e.eventType))}</strong><small>${tm}${opp}${ref}</small></button>`;}

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
function statisticsResultLabel_(m){if(m&&m.hasResult===false)return 'Sin resultado';const pf=Number(m.resultFor||0),pa=Number(m.resultAgainst||0);return pf>pa?'Victoria':pf<pa?'Derrota':'Empate';}

function trainingExerciseJsonListClient_(value){
  if(Array.isArray(value))return value;
  try{const parsed=JSON.parse(String(value||'[]'));return Array.isArray(parsed)?parsed:[];}catch(_){return [];}
}
function trainingExerciseCategoryClient_(value){
  const labels={ACTIVATION:'Activación',SKILL:'Destreza',PASSING:'Pase',KICKING:'Patada',CONTACT:'Contacto',TACKLE:'Placaje',RUCK:'Ruck',MAUL:'Maul',SCRUM:'Melé',LINEOUT:'Touch / line-out',ATTACK:'Ataque',DEFENCE:'Defensa',GAME:'Juego',FITNESS:'Preparación física',RECOVERY:'Recuperación',OTHER:'Otro'};
  return labels[String(value||'').toUpperCase()]||'Otro';
}
function trainingExerciseTagsClient_(value){return String(value||'').split(',').map(x=>x.trim()).filter(Boolean);}
function trainingExerciseScopeLabel_(exercise,divisions){
  const ids=trainingExerciseJsonListClient_(exercise?.divisionIdsJson);if(!ids.length)return 'Todas las divisiones';
  const byId=Object.fromEntries((divisions||[]).map(d=>[d.divisionId,d.name]));
  return ids.map(id=>byId[id]||id).join(' · ');
}
async function loadTrainingLibraryData_(force=false){
  if(trainingLibraryData&&!force)return trainingLibraryData;
  const {data}=await call('getTrainingExercisesData',{seasonId:selectedSeasonId_()});trainingLibraryData=data||{exercises:[],divisions:[],categories:[],canManage:false};return trainingLibraryData;
}
function trainingExerciseCard_(exercise,data){
  const coaching=trainingExerciseJsonListClient_(exercise.coachingPointsJson),tags=trainingExerciseTagsClient_(exercise.tags),duration=Number(exercise.recommendedDurationMinutes||0);
  const image=exercise.imageUrl?`<div class="exercise-card-media"><img src="${escapeHtml(exercise.imageUrl)}" alt="${escapeHtml(exercise.name||'Ejercicio')}" loading="lazy" onerror="this.parentElement.classList.add('media-error');this.remove()"></div>`:'';
  return `<article class="exercise-card ${exercise.status==='INACTIVE'?'is-inactive':''}" data-exercise-card="${escapeHtml(exercise.exerciseId)}">${image}<div class="exercise-card-body"><div class="exercise-card-meta"><span class="badge active">${escapeHtml(trainingExerciseCategoryClient_(exercise.category))}</span>${duration?`<span class="exercise-duration">${duration} min</span>`:''}${exercise.status==='INACTIVE'?'<span class="badge inactive">INACTIVO</span>':''}</div><h3>${escapeHtml(exercise.name||'Ejercicio')}</h3><p>${escapeHtml(exercise.objective||exercise.description||'Sin objetivo definido.')}</p>${coaching.length?`<ul class="exercise-points-preview">${coaching.slice(0,3).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:''}<div class="exercise-card-footer"><small>${escapeHtml(trainingExerciseScopeLabel_(exercise,data.divisions))}</small>${tags.length?`<div class="tag-row">${tags.slice(0,4).map(t=>`<span>${escapeHtml(t)}</span>`).join('')}</div>`:''}</div><div class="button-row"><button type="button" class="button mini secondary" data-view-exercise="${escapeHtml(exercise.exerciseId)}">Ver</button>${exercise.canEdit?`<button type="button" class="button mini secondary" data-edit-exercise="${escapeHtml(exercise.exerciseId)}">Editar</button>`:''}${exercise.videoUrl?`<a class="button mini link" href="${escapeHtml(exercise.videoUrl)}" target="_blank" rel="noopener">Vídeo / enlace</a>`:''}</div></div></article>`;
}
async function openTrainingExerciseImport_(hostId='exercise-import-host',afterImport=null){
  const host=document.getElementById(hostId);if(!host)return;
  let data;try{data=await loadTrainingLibraryData_();}catch(err){host.innerHTML=`<div class="message error">${escapeHtml(err.message)}</div>`;return;}
  if(!data.canManage){host.innerHTML='<div class="message error">No tienes permiso para importar ejercicios.</div>';return;}
  host.innerHTML=`<section class="inline-editor exercise-import-panel"><div class="editor-heading"><div><span class="eyebrow">Importación XLSX</span><h2>Importar ejercicios</h2><p>Se detectan duplicados por <strong>nombre + categoría</strong> antes de modificar la biblioteca.</p></div><button class="button link" type="button" id="exercise-import-close">Cerrar</button></div><div class="form-grid two"><label>Archivo XLSX<input id="exercise-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label><label>Si ya existe<select id="exercise-import-duplicates"><option value="SKIP">Omitir duplicado</option><option value="UPDATE">Actualizar ejercicio existente</option></select></label></div><fieldset class="exercise-division-fieldset"><legend>Aplicar a divisiones</legend><p>Si no seleccionás ninguna, se respeta el archivo para Administrador; Entrenadores y Coordinadores quedan limitados automáticamente a las divisiones de su alcance.</p><div class="exercise-division-grid">${(data.divisions||[]).map(d=>`<label class="check-row"><input type="checkbox" data-exercise-import-division="${escapeHtml(d.divisionId)}"> ${escapeHtml(d.name)}</label>`).join('')}</div></fieldset><div class="button-row"><button class="button secondary" type="button" id="exercise-import-preview">Analizar archivo</button></div><div id="exercise-import-preview-host"></div><div id="exercise-import-message" class="message"></div></section>`;
  document.getElementById('exercise-import-close').onclick=()=>host.innerHTML='';
  let selectedFile=null,dataUrl='';
  document.getElementById('exercise-import-file').onchange=()=>{selectedFile=document.getElementById('exercise-import-file').files?.[0]||null;dataUrl='';document.getElementById('exercise-import-preview-host').innerHTML='';showMessage('','','exercise-import-message');};
  document.getElementById('exercise-import-preview').onclick=async()=>{selectedFile=document.getElementById('exercise-import-file').files?.[0]||selectedFile;if(!selectedFile)return showMessage('Seleccioná un archivo XLSX.','error','exercise-import-message');if(!/\.xlsx$/i.test(selectedFile.name))return showMessage('El archivo debe ser .xlsx.','error','exercise-import-message');if(selectedFile.size>4500000)return showMessage('El archivo supera 4,5 MB.','error','exercise-import-message');try{dataUrl=dataUrl||await fileToDataUrl(selectedFile);const {data:preview}=await call('previewTrainingExerciseImport',{seasonId:selectedSeasonId_(),fileName:selectedFile.name,dataUrl});const rows=(preview.items||[]).slice(0,40).map(x=>`<tr><td>${escapeHtml(x.sourceRow)}</td><td><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml(x.objective||'')}</small></td><td>${escapeHtml(x.categoryLabel)}</td><td>${escapeHtml(x.recommendedDurationMinutes||'—')}</td><td>${x.duplicate?'<span class="status-pill warning">Ya existe</span>':'<span class="status-pill success">Nuevo</span>'}</td></tr>`).join('');document.getElementById('exercise-import-preview-host').innerHTML=`<div class="import-summary"><strong>${preview.count} ejercicio(s)</strong><span>${preview.newCount} nuevos · ${preview.duplicateCount} duplicados</span></div><div class="table-wrap compact-table"><table><thead><tr><th>Fila</th><th>Ejercicio</th><th>Categoría</th><th>Min.</th><th>Resultado</th></tr></thead><tbody>${rows}</tbody></table></div>${preview.count>40?`<p class="helper">Vista previa de los primeros 40 de ${preview.count}.</p>`:''}<button class="button primary" type="button" id="exercise-import-confirm">Importar ${preview.count} ejercicio(s)</button>`;document.getElementById('exercise-import-confirm').onclick=async()=>{const divisionIds=[...document.querySelectorAll('[data-exercise-import-division]:checked')].map(x=>x.dataset.exerciseImportDivision);try{const {data:result}=await call('importTrainingExercises',{seasonId:selectedSeasonId_(),fileName:selectedFile.name,dataUrl,duplicateMode:val('exercise-import-duplicates'),divisionIds});trainingLibraryData=null;showToast_(`Importación completada: ${result.created} nuevos · ${result.updated} actualizados · ${result.skipped} omitidos.`,'success',6000);if(afterImport)await afterImport();else await renderTrainingExercises();}catch(err){showMessage(err.message,'error','exercise-import-message');}};showMessage('Vista previa lista. Revisá los duplicados antes de importar.','success','exercise-import-message');}catch(err){showMessage(err.message,'error','exercise-import-message');}};
  host.scrollIntoView({behavior:'smooth',block:'start'});
}

async function renderTrainingExercises(){
  if(!currentAccessProfile_().capabilities?.viewTrainingLibrary)return shell('<section class="panel narrow"><h1>Acceso restringido</h1><p>No tienes acceso a la biblioteca de ejercicios.</p></section>','exercises');
  try{await loadTrainingLibraryData_();}catch(err){return shell(`<section class="panel narrow"><h1>No se pudo cargar la biblioteca</h1><p>${escapeHtml(err.message)}</p><button class="button secondary" id="exercise-retry">Reintentar</button></section>`,'exercises');}
  const data=trainingLibraryData||{},state=Object.assign({},loadUiState_().exerciseFilters||{});state.divisionId=contextScopedDivisionId_(state.divisionId||'');const q=textNorm_(state.q||''),category=state.category||'',status=state.status||'ACTIVE',divisionId=state.divisionId||'';
  const filtered=(data.exercises||[]).filter(ex=>{
    const divs=trainingExerciseJsonListClient_(ex.divisionIdsJson),haystack=textNorm_([ex.name,ex.objective,ex.description,ex.materials,ex.tags,trainingExerciseCategoryClient_(ex.category)].join(' '));
    return (!q||haystack.includes(q))&&(!category||ex.category===category)&&(!status||ex.status===status)&&(!divisionId||!divs.length||divs.includes(divisionId));
  });
  shell(`<section class="hero compact"><span class="eyebrow">Entrenamiento</span><h1>Biblioteca de ejercicios</h1><p>Creá ejercicios reutilizables con objetivos, coaching points, material y variantes. En la siguiente fase podrán incorporarse directamente al plan de cada sesión.</p></section><section class="panel management-panel"><div class="panel-heading"><div><h2>Ejercicios</h2><p>${filtered.length} de ${(data.exercises||[]).length} ejercicio(s).</p></div>${data.canManage?'<div class="button-row compact-actions"><button class="button secondary" id="import-training-exercises">Importar XLSX</button><button class="button primary" id="new-training-exercise">Nuevo ejercicio</button></div>':''}</div><div class="filter-bar"><label class="filter-grow">Buscar<input id="exercise-filter-q" value="${escapeHtml(state.q||'')}" placeholder="Nombre, objetivo, material, etiqueta…"></label><label>Categoría<select id="exercise-filter-category"><option value="">Todas</option>${(data.categories||[]).map(c=>`<option value="${escapeHtml(c.value)}" ${category===c.value?'selected':''}>${escapeHtml(c.label)}</option>`).join('')}</select></label><label>División<select id="exercise-filter-division"><option value="">Todas</option>${(data.divisions||[]).filter(d=>contextAllowsDivisionId_(d.divisionId)).map(d=>`<option value="${escapeHtml(d.divisionId)}" ${divisionId===d.divisionId?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}</select></label><label>Estado<select id="exercise-filter-status"><option value="ACTIVE" ${status==='ACTIVE'?'selected':''}>Activos</option><option value="" ${status===''?'selected':''}>Todos</option><option value="INACTIVE" ${status==='INACTIVE'?'selected':''}>Inactivos</option></select></label><button class="button secondary filter-clear" id="exercise-filter-clear">Limpiar</button></div>${filtered.length?`<div class="exercise-library-grid">${filtered.map(ex=>trainingExerciseCard_(ex,data)).join('')}</div>`:emptyTable('No hay ejercicios que coincidan con los filtros.')}<div id="exercise-import-host"></div><div id="exercise-editor-host"></div><div id="exercise-message" class="message"></div></section>`,'exercises');
  const apply=()=>{saveUiStatePatch_({exerciseFilters:{q:val('exercise-filter-q'),category:val('exercise-filter-category'),divisionId:val('exercise-filter-division'),status:val('exercise-filter-status')}});renderTrainingExercises();};
  ['exercise-filter-category','exercise-filter-division','exercise-filter-status'].forEach(id=>document.getElementById(id)?.addEventListener('change',apply));
  document.getElementById('exercise-filter-q')?.addEventListener('change',apply);document.getElementById('exercise-filter-q')?.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();apply();}});
  document.getElementById('exercise-filter-clear')?.addEventListener('click',()=>{saveUiStatePatch_({exerciseFilters:{status:'ACTIVE'}});renderTrainingExercises();});
  document.getElementById('import-training-exercises')?.addEventListener('click',()=>openTrainingExerciseImport_('exercise-import-host'));
  document.getElementById('new-training-exercise')?.addEventListener('click',()=>showTrainingExerciseEditor_({status:'ACTIVE'}));
  document.querySelectorAll('[data-view-exercise]').forEach(b=>b.onclick=()=>showTrainingExerciseDetail_((data.exercises||[]).find(x=>x.exerciseId===b.dataset.viewExercise)));
  document.querySelectorAll('[data-edit-exercise]').forEach(b=>b.onclick=()=>showTrainingExerciseEditor_((data.exercises||[]).find(x=>x.exerciseId===b.dataset.editExercise)));
  document.getElementById('exercise-retry')?.addEventListener('click',async()=>{trainingLibraryData=null;await renderTrainingExercises();});
}
function showTrainingExerciseDetail_(exercise){
  if(!exercise)return;const data=trainingLibraryData||{},host=document.getElementById('exercise-editor-host');if(!host)return;
  const points=trainingExerciseJsonListClient_(exercise.coachingPointsJson),tags=trainingExerciseTagsClient_(exercise.tags),duration=Number(exercise.recommendedDurationMinutes||0);
  host.innerHTML=`<section class="inline-editor exercise-detail"><div class="editor-heading"><div><span class="eyebrow">${escapeHtml(trainingExerciseCategoryClient_(exercise.category))}</span><h2>${escapeHtml(exercise.name)}</h2><p>${escapeHtml(trainingExerciseScopeLabel_(exercise,data.divisions))}${duration?` · ${duration} min`:''}</p></div><div class="button-row">${exercise.canEdit?`<button type="button" class="button secondary" id="exercise-detail-edit">Editar</button>`:''}<button type="button" class="button link" id="exercise-detail-close">Cerrar</button></div></div>${exercise.imageUrl?`<img class="exercise-detail-image" src="${escapeHtml(exercise.imageUrl)}" alt="${escapeHtml(exercise.name)}">`:''}<div class="exercise-detail-grid"><div><h3>Objetivo</h3><p>${escapeHtml(exercise.objective||'Sin objetivo definido.')}</p><h3>Descripción / configuración</h3><p class="pre-line">${escapeHtml(exercise.description||'Sin descripción.')}</p>${exercise.materials?`<h3>Material</h3><p>${escapeHtml(exercise.materials)}</p>`:''}</div><div><h3>Coaching points</h3>${points.length?`<ol>${points.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ol>`:'<p class="muted">Sin coaching points.</p>'}${exercise.progressions?`<h3>Progresiones</h3><p class="pre-line">${escapeHtml(exercise.progressions)}</p>`:''}${exercise.regressions?`<h3>Regresiones / simplificaciones</h3><p class="pre-line">${escapeHtml(exercise.regressions)}</p>`:''}${tags.length?`<div class="tag-row">${tags.map(t=>`<span>${escapeHtml(t)}</span>`).join('')}</div>`:''}${exercise.videoUrl?`<p><a class="button secondary" href="${escapeHtml(exercise.videoUrl)}" target="_blank" rel="noopener">Abrir vídeo / enlace</a></p>`:''}</div></div></section>`;
  host.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('exercise-detail-close').onclick=()=>host.innerHTML='';document.getElementById('exercise-detail-edit')?.addEventListener('click',()=>showTrainingExerciseEditor_(exercise));
}
function showTrainingExerciseEditor_(exercise={}){
  const data=trainingLibraryData||{},host=document.getElementById('exercise-editor-host');if(!host||!data.canManage||((exercise||{}).exerciseId&&!(exercise||{}).canEdit))return;
  const points=trainingExerciseJsonListClient_(exercise.coachingPointsJson),selectedDivisions=trainingExerciseJsonListClient_(exercise.divisionIdsJson);
  host.innerHTML=`<section class="inline-editor"><div class="editor-heading"><div><span class="eyebrow">Biblioteca</span><h2>${exercise.exerciseId?'Editar ejercicio':'Nuevo ejercicio'}</h2><p>Los campos quedan disponibles para reutilizarlos después en el constructor de sesiones.</p></div><button type="button" class="button link" id="exercise-editor-close">Cerrar</button></div><form id="training-exercise-form" class="form-stack"><div class="form-grid three"><label>Nombre<input id="exercise-name" maxlength="140" required value="${escapeHtml(exercise.name||'')}"></label><label>Categoría<select id="exercise-category">${(data.categories||[]).map(c=>`<option value="${escapeHtml(c.value)}" ${exercise.category===c.value?'selected':''}>${escapeHtml(c.label)}</option>`).join('')}</select></label><label>Duración sugerida (min)<input id="exercise-duration" type="number" min="0" max="240" step="1" value="${escapeHtml(exercise.recommendedDurationMinutes||'')}"></label></div><label>Objetivo<textarea id="exercise-objective" rows="2" maxlength="700" placeholder="Qué queremos conseguir con este ejercicio">${escapeHtml(exercise.objective||'')}</textarea></label><label>Descripción / configuración<textarea id="exercise-description" rows="5" maxlength="3500" placeholder="Jugadores, espacio, organización y desarrollo">${escapeHtml(exercise.description||'')}</textarea></label><div class="form-grid two"><label>Coaching points<textarea id="exercise-coaching" rows="6" placeholder="Un punto por línea">${escapeHtml(points.join('\n'))}</textarea><small>Un foco técnico por línea. Máximo 12.</small></label><div class="form-stack compact"><label>Material<textarea id="exercise-materials" rows="3" maxlength="1000" placeholder="Conos, balones, escudos…">${escapeHtml(exercise.materials||'')}</textarea></label><label>Etiquetas<input id="exercise-tags" maxlength="500" value="${escapeHtml(exercise.tags||'')}" placeholder="pase, decisión, continuidad"></label></div></div><div class="form-grid two"><label>Progresiones<textarea id="exercise-progressions" rows="4" maxlength="1800" placeholder="Cómo aumentar dificultad">${escapeHtml(exercise.progressions||'')}</textarea></label><label>Regresiones / simplificaciones<textarea id="exercise-regressions" rows="4" maxlength="1800" placeholder="Cómo simplificar el ejercicio">${escapeHtml(exercise.regressions||'')}</textarea></label></div><div class="form-grid two"><label>Imagen / diagrama (URL)<input id="exercise-image-url" type="url" maxlength="1000" value="${escapeHtml(exercise.imageUrl||'')}" placeholder="https://…"></label><label>Vídeo / enlace (URL)<input id="exercise-video-url" type="url" maxlength="1000" value="${escapeHtml(exercise.videoUrl||'')}" placeholder="https://youtube.com/…"></label></div><fieldset class="exercise-division-fieldset"><legend>Aplicación por división</legend><p>Si no marcás ninguna, se aplicará a todas las divisiones dentro de tu alcance. Solo Administrador o un Coordinador transversal pueden abarcar todo el club.</p><div class="exercise-division-grid">${(data.divisions||[]).map(d=>`<label class="check-row"><input type="checkbox" data-exercise-division="${escapeHtml(d.divisionId)}" ${selectedDivisions.includes(d.divisionId)?'checked':''}> ${escapeHtml(d.name)}</label>`).join('')}</div></fieldset><div class="form-grid two"><label>Estado<select id="exercise-status"><option value="ACTIVE" ${exercise.status!=='INACTIVE'?'selected':''}>Activo</option><option value="INACTIVE" ${exercise.status==='INACTIVE'?'selected':''}>Inactivo</option></select></label></div><div class="editor-actions"><div id="exercise-editor-message" class="message"></div><button type="submit" class="button primary">Guardar ejercicio</button></div></form></section>`;
  host.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('exercise-editor-close').onclick=()=>host.innerHTML='';
  document.getElementById('training-exercise-form').onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;const divisionIds=[...document.querySelectorAll('[data-exercise-division]:checked')].map(x=>x.dataset.exerciseDivision);try{const saved=(await call('saveTrainingExercise',{exerciseId:exercise.exerciseId||'',seasonId:selectedSeasonId_(),name:val('exercise-name'),category:val('exercise-category'),recommendedDurationMinutes:val('exercise-duration'),objective:val('exercise-objective'),description:val('exercise-description'),coachingPoints:val('exercise-coaching').split(/\r?\n/),materials:val('exercise-materials'),progressions:val('exercise-progressions'),regressions:val('exercise-regressions'),imageUrl:val('exercise-image-url'),videoUrl:val('exercise-video-url'),tags:val('exercise-tags'),divisionIds:divisionIds,status:val('exercise-status')})).data;showToast_('Ejercicio guardado.');trainingLibraryData=null;await renderTrainingExercises();setTimeout(()=>{const ex=(trainingLibraryData?.exercises||[]).find(x=>x.exerciseId===saved.exerciseId);if(ex)showTrainingExerciseDetail_(ex);},0);}catch(err){showMessage(err.message,'error','exercise-editor-message');if(button)button.disabled=false;}};
}


function statsPctLabel_(value){return `${Number(value||0).toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:1})}%`;}
function statsRoleLabel_(role){return ({STARTER:'Titular',SUBSTITUTE:'Suplente'})[String(role||'').toUpperCase()]||'—';}
function statsParticipationLabel_(row){if(row.played)return 'Jugó';if(row.called)return 'Convocado · no jugó';if(row.available===true)return 'Disponible · no convocado';if(row.available===false)return 'No disponible';return '—';}
function statsQualityMarkup_(data){
  const q=data.dataQuality||{},items=[];
  if(q.pendingTrainingAttendance)items.push(`${q.pendingTrainingAttendance} entreno(s) finalizado(s) sin asistencia confirmada`);
  if(q.missingTrainingSnapshots)items.push(`${q.missingTrainingSnapshots} entreno(s) sin foto histórica de disponibilidad`);
  if(q.missingMatchSnapshots)items.push(`${q.missingMatchSnapshots} partido(s) sin foto histórica de disponibilidad`);
  if(q.unmatchedOfficialPlayers)items.push(`${q.unmatchedOfficialPlayers} jugador(es) del acta todavía sin vincular`);
  if(!items.length)return '<div class="stats-quality ok"><strong>Datos consolidados</strong><span>Las métricas del período tienen trazabilidad disponible.</span></div>';
  return `<div class="stats-quality warning"><strong>Calidad de datos</strong><span>${escapeHtml(items.join(' · '))}</span></div>`;
}
function statsMonthlyMarkup_(data){
  const rows=(data.monthly||[]).map(m=>`<tr><td><strong>${escapeHtml(m.label||m.month)}</strong></td><td>${m.trainings||0}</td><td>${statsPctLabel_(m.attendancePct)}</td><td>${statsPctLabel_(m.attendanceAvailabilityPct)}</td><td>${m.matches||0}</td><td>${m.playersUsed||0}</td></tr>`).join('');
  return rows?`<div class="table-wrap"><table><thead><tr><th>Mes</th><th>Entrenos</th><th>Asistencia</th><th>Sobre disponibilidad</th><th>Partidos</th><th>Jugadores utilizados</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('Todavía no hay evolución mensual para el período seleccionado.');
}
function statsSummaryTab_(data){
  const s=data.summary||{},self=!!data.access?.selfOnly,p=(data.players||[])[0];
  if(self&&p){
    return `<section class="stats-summary-grid"><article class="metric-card"><span>Entrenamientos</span><strong>${p.trainingsAttended}/${p.trainingsPlanned}</strong><small>${statsPctLabel_(p.attendancePct)} asistencia general</small></article><article class="metric-card"><span>Sobre disponibilidad</span><strong>${statsPctLabel_(p.attendanceAvailabilityPct)}</strong><small>${p.availableTrainings} entrenamientos disponibles</small></article><article class="metric-card"><span>Partidos</span><strong>${p.matchesPlayed}/${p.callups}</strong><small>${p.starts} titular · ${p.bench} suplente</small></article><article class="metric-card"><span>Participación</span><strong>${statsNumber_(p.minutes)} min</strong><small>${p.points||0} pts · ${p.availableNotCalled||0} disponible no convocado</small></article></section><section class="panel"><div class="panel-heading"><div><h2>Evolución mensual</h2><p>Tu asistencia y participación dentro del período seleccionado.</p></div></div>${statsMonthlyMarkup_(data)}</section>${statsPlayerDetailHtml_(p,true)}`;
  }
  return `<section class="stats-summary-grid"><article class="metric-card stats-click-card" data-stats-go-tab="training"><span>Entrenamientos</span><strong>${statsNumber_(s.confirmedTrainings)}/${statsNumber_(s.trainings)}</strong><small>${statsPctLabel_(s.attendancePct)} asistencia general</small></article><article class="metric-card stats-click-card" data-stats-go-tab="training"><span>Sobre disponibilidad</span><strong>${statsPctLabel_(s.attendanceAvailabilityPct)}</strong><small>${s.pendingTrainingAttendance||0} pendientes de confirmar</small></article><article class="metric-card stats-click-card" data-stats-go-tab="matches"><span>Partidos</span><strong>${statsNumber_(s.matches)}</strong><small>${s.wins||0} V · ${s.draws||0} E · ${s.losses||0} D</small></article><article class="metric-card stats-click-card" data-stats-go-tab="players"><span>Plantilla / uso</span><strong>${statsNumber_(s.playersUsed)}/${statsNumber_(s.rosterPlayers)}</strong><small>${s.activeLeaves||0} bajas / ausencias activas</small></article></section><section class="panel"><div class="panel-heading"><div><h2>Evolución mensual</h2><p>Asistencia, disponibilidad y utilización de plantilla.</p></div></div>${statsMonthlyMarkup_(data)}</section>`;
}
function statsPlayersTab_(data){
  const rows=(data.players||[]).map((p,i)=>`<tr class="clickable-row" data-stats-player="${escapeHtml(p.key)}"><td><span class="rank-number">${i+1}</span></td><td><strong>${escapeHtml(p.playerName||'Jugador')}</strong>${p.licenseNumber?`<small>${escapeHtml(p.licenseNumber)}</small>`:''}</td><td>${p.trainingsAttended}/${p.trainingsPlanned}<small>${statsPctLabel_(p.attendancePct)}</small></td><td><strong>${statsPctLabel_(p.attendanceAvailabilityPct)}</strong><small>${p.availableTrainings} disponibles</small></td><td>${p.callups}</td><td>${p.availableNotCalled}</td><td>${p.matchesPlayed}</td><td>${p.starts}</td><td>${p.bench}</td><td>${statsNumber_(p.minutes)}</td><td>${p.leaveDays}</td><td>${p.absenceDays}</td></tr>`).join('');
  return `<section class="panel"><div class="panel-heading"><div><h2>Jugadores</h2><p>Entrenamientos, disponibilidad, convocatorias y participación real. Seleccioná una fila para ver el detalle.</p></div></div>${rows?`<div class="table-wrap"><table class="stats-table"><thead><tr><th>#</th><th>Jugador</th><th>Entrenos</th><th>Disp. real</th><th>Conv.</th><th>Disp. no conv.</th><th>Jugados</th><th>Tit.</th><th>Sup.</th><th>Min.</th><th>Días baja</th><th>Días ausencia</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay jugadores con datos en este período.')}<div id="stats-player-detail"></div></section>`;
}
function statsTrainingTab_(data,divMap,teamMap){
  const rows=(data.trainings||[]).map(t=>`<tr class="clickable-row" data-stats-event="${escapeHtml(t.eventId)}"><td>${escapeHtml(t.eventDate||'—')}</td><td>${escapeHtml((divMap[t.divisionId]||{}).name||'—')}<small>${escapeHtml((teamMap[t.teamId]||{}).name||'')}</small></td><td><strong>${escapeHtml(t.title||'Entrenamiento')}</strong><small>${t.confirmed?'Asistencia confirmada':'Pendiente de confirmar'}</small></td><td>${t.expected}</td><td>${t.present}</td><td>${t.adapted}</td><td>${t.rehab}</td><td>${t.absent}</td><td>${t.excused}${t.farExcused?`<small>${t.farExcused} por arbitraje FAR</small>`:''}</td><td><strong>${t.confirmed?statsPctLabel_(t.attendancePct):'—'}</strong></td><td><strong>${t.confirmed?statsPctLabel_(t.attendanceAvailabilityPct):'—'}</strong></td></tr>`).join('');
  return `<section class="panel"><div class="panel-heading"><div><h2>Entrenamientos</h2><p>La asistencia cuenta Presente + Adaptado + Rehabilitación. La segunda tasa excluye indisponibilidades justificadas.</p></div></div>${rows?`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>División</th><th>Actividad</th><th>Previstos</th><th>Presentes</th><th>Adapt.</th><th>Rehab.</th><th>Ausentes</th><th>Justif.</th><th>Asistencia</th><th>Sobre disp.</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay entrenamientos finalizados en este período.')}</section>`;
}
function statsMatchesTab_(data,divMap,teamMap){
  const rows=(data.matches||[]).map(m=>`<tr class="clickable-row" data-stats-event="${escapeHtml(m.eventId)}" data-match-competition="${escapeHtml(String(m.competition||'').toLowerCase())}" data-match-condition="${escapeHtml(m.condition||'')}" data-match-search="${escapeHtml(String([m.opponent,m.title,m.competition,m.roundName].filter(Boolean).join(' ')).toLowerCase())}"><td>${escapeHtml(m.eventDate||'—')}</td><td>${escapeHtml((divMap[m.divisionId]||{}).name||'—')}<small>${escapeHtml((teamMap[m.teamId]||{}).name||'')}</small></td><td>${m.condition==='HOME'?'Local':m.condition==='AWAY'?'Visitante':'—'}</td><td><strong>${escapeHtml(m.opponent||m.title||'Partido')}</strong><small>${escapeHtml([m.competition,m.roundName].filter(Boolean).join(' · '))}</small></td><td><strong>${m.hasResult?`${escapeHtml(m.resultFor||'0')} - ${escapeHtml(m.resultAgainst||'0')}`:'—'}</strong><small>${statisticsResultLabel_(m)}</small></td><td>${m.callups||0}</td><td>${m.played||0}</td></tr>`).join('');
  return `<section class="panel"><div class="panel-heading"><div><h2>Partidos</h2><p>Resultados, convocatorias y participación real. Los filtros de esta pestaña no alteran el resto de estadísticas.</p></div></div><div class="stats-local-filters"><label>Competición<select id="stats-match-competition"><option value="">Todas</option>${(data.competitions||[]).map(x=>`<option value="${escapeHtml(String(x).toLowerCase())}">${escapeHtml(x)}</option>`).join('')}</select></label><label>Condición<select id="stats-match-condition"><option value="">Local y visitante</option><option value="HOME">Local</option><option value="AWAY">Visitante</option></select></label><label class="filter-grow">Rival / título<input id="stats-match-search" placeholder="Buscar rival o partido"></label></div>${rows?`<div class="table-wrap"><table id="stats-match-table"><thead><tr><th>Fecha</th><th>División</th><th>Condición</th><th>Rival / competición</th><th>Resultado</th><th>Conv.</th><th>Jugados</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay partidos finalizados en este período.')}<div id="stats-match-filter-empty" class="empty-state" style="display:none">No hay partidos que coincidan con esos filtros.</div></section>`;
}
function statsComparisonTab_(data){
  const rows=(data.comparison||[]).map(c=>`<tr><td><strong>${escapeHtml(c.divisionName||'—')}</strong></td><td>${c.rosterPlayers}</td><td>${statsPctLabel_(c.attendancePct)}</td><td><strong>${statsPctLabel_(c.attendanceAvailabilityPct)}</strong></td><td>${c.activeLeaves}</td><td>${c.playersUsed}</td><td>${c.trainings}</td><td>${c.matches}</td><td>${c.wins}-${c.draws}-${c.losses}</td></tr>`).join('');
  return `<section class="panel"><div class="panel-heading"><div><h2>Comparativa por división</h2><p>Lectura transversal dentro del contexto activo. No mezcla divisiones fuera de tus permisos.</p></div></div>${rows?`<div class="table-wrap"><table><thead><tr><th>División</th><th>Plantilla</th><th>Asistencia</th><th>Sobre disp.</th><th>Bajas activas</th><th>Utilizados</th><th>Entrenos</th><th>Partidos</th><th>V-E-D</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay más de una división disponible para comparar.')}</section>`;
}
function statsPlayerDetailHtml_(p,embedded=false){
  if(!p)return '';
  const trainingRows=(p.trainingDetails||[]).map(t=>`<tr data-stats-event="${escapeHtml(t.eventId)}" class="clickable-row"><td>${escapeHtml(t.eventDate)}</td><td>${escapeHtml(t.statusLabel||'—')}</td><td>${t.available?'Sí':'No'}</td><td>${escapeHtml(t.reason||'—')}</td></tr>`).join('');
  const matchRows=(p.matchDetails||[]).map(m=>`<tr data-stats-event="${escapeHtml(m.eventId)}" class="clickable-row"><td>${escapeHtml(m.eventDate)}</td><td>${escapeHtml(m.opponent||m.title||'Partido')}</td><td>${statsParticipationLabel_(m)}</td><td>${statsRoleLabel_(m.lineupRole)}</td><td>${statsNumber_(m.minutes)}</td><td>${m.points||0}</td></tr>`).join('');
  return `<section class="${embedded?'panel':'stats-player-detail-card'}"><div class="panel-heading"><div><span class="eyebrow">Ficha estadística</span><h2>${escapeHtml(p.playerName||'Jugador')}</h2><p>${p.trainingsAttended}/${p.trainingsPlanned} entrenamientos · ${p.matchesPlayed} partidos jugados · ${statsNumber_(p.minutes)} minutos.</p></div>${embedded?'':'<button type="button" class="button mini secondary" id="stats-player-detail-close">Cerrar</button>'}</div><div class="stats-detail-kpis"><div><span>Asistencia</span><strong>${statsPctLabel_(p.attendancePct)}</strong></div><div><span>Sobre disponibilidad</span><strong>${statsPctLabel_(p.attendanceAvailabilityPct)}</strong></div><div><span>Convocatorias</span><strong>${p.callups}</strong></div><div><span>Disponible no convocado</span><strong>${p.availableNotCalled}</strong></div><div><span>Titular / suplente</span><strong>${p.starts} / ${p.bench}</strong></div><div><span>Puntos</span><strong>${p.points||0}</strong></div></div><details open><summary>Entrenamientos</summary>${trainingRows?`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Estado</th><th>Disponible</th><th>Motivo</th></tr></thead><tbody>${trainingRows}</tbody></table></div>`:emptyTable('Sin entrenamientos confirmados.')}</details><details><summary>Partidos</summary>${matchRows?`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Partido</th><th>Participación</th><th>Rol</th><th>Min.</th><th>Pts.</th></tr></thead><tbody>${matchRows}</tbody></table></div>`:emptyTable('Sin partidos en el período.')}</details></section>`;
}
function statsTabBody_(tab,data,divMap,teamMap){
  if(tab==='players')return data.access?.selfOnly?statsPlayerDetailHtml_((data.players||[])[0],true):statsPlayersTab_(data);
  if(tab==='training')return statsTrainingTab_(data,divMap,teamMap);
  if(tab==='matches')return statsMatchesTab_(data,divMap,teamMap);
  if(tab==='comparison')return statsComparisonTab_(data);
  return statsSummaryTab_(data);
}
function wireStatsBody_(tab,data){
  document.querySelectorAll('[data-stats-event]').forEach(row=>row.onclick=()=>renderEventDetail(row.dataset.statsEvent));
  document.querySelectorAll('[data-stats-go-tab]').forEach(x=>x.onclick=()=>{saveUiStatePatch_({statisticsTab:x.dataset.statsGoTab});renderStatistics();});
  document.querySelectorAll('[data-stats-player]').forEach(row=>row.onclick=()=>{const p=(data.players||[]).find(x=>x.key===row.dataset.statsPlayer),host=document.getElementById('stats-player-detail');if(!host||!p)return;host.innerHTML=statsPlayerDetailHtml_(p,false);host.scrollIntoView({behavior:'smooth',block:'start'});host.querySelector('#stats-player-detail-close')?.addEventListener('click',()=>host.innerHTML='');host.querySelectorAll('[data-stats-event]').forEach(x=>x.onclick=()=>renderEventDetail(x.dataset.statsEvent));});
  if(tab==='matches'){
    const apply=()=>{const comp=String(val('stats-match-competition')||'').toLowerCase(),cond=val('stats-match-condition'),q=String(val('stats-match-search')||'').trim().toLowerCase();let visible=0;document.querySelectorAll('#stats-match-table tbody tr').forEach(r=>{const ok=(!comp||r.dataset.matchCompetition===comp)&&(!cond||r.dataset.matchCondition===cond)&&(!q||String(r.dataset.matchSearch||'').includes(q));r.style.display=ok?'':'none';if(ok)visible++;});const empty=document.getElementById('stats-match-filter-empty');if(empty)empty.style.display=visible?'none':'block';};
    ['stats-match-competition','stats-match-condition'].forEach(id=>document.getElementById(id)?.addEventListener('change',apply));document.getElementById('stats-match-search')?.addEventListener('input',apply);
  }
}

function refereeStatsOriginLabel_(origin){return String(origin||'').toUpperCase()==='FAR'?'FAR':'Club';}
function refereeStatsStatusLabel_(row){if(row?.completed)return 'Realizado';const s=String(row?.status||'').toUpperCase();return s==='IN_PROGRESS'?'En curso':s==='CANCELLED'?'Cancelado':'Próximo';}
function refereeStatsProfileLabel_(profile){const p=String(profile||'').toUpperCase();return p==='CLUB'?'Club / horario real':refereeOccupationProfileLabelClient_(p);}
function refereeStatsSummaryHtml_(data){
  const s=data.summary||{};
  const monthly=(data.monthly||[]).slice(-6).map(m=>`<tr><td>${escapeHtml(m.label)}</td><td>${m.designations||0}</td><td>${m.far||0}</td><td>${m.club||0}</td><td>${escapeHtml(String(m.occupationHours||0))} h</td><td>${m.avgRating?escapeHtml(String(m.avgRating))+'/10':'—'}</td></tr>`).join('');
  const cats=(data.categories||[]).slice(0,8).map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${x.count||0}</td></tr>`).join('');
  return `<div class="stats-summary-grid"><article class="metric-card"><span>Designaciones</span><strong>${s.designations||0}</strong><small>${s.matchesCompleted||0} realizadas · ${s.upcoming||0} próximas</small></article><article class="metric-card"><span>Origen</span><strong>${s.far||0} FAR</strong><small>${s.club||0} internas</small></article><article class="metric-card"><span>Ocupación estimada</span><strong>${escapeHtml(String(s.occupationHours||0))} h</strong><small>Ventana completa de cada designación</small></article><article class="metric-card"><span>Seguimiento</span><strong>${escapeHtml(String(s.postRate||0))}%</strong><small>Post completado · Pre ${escapeHtml(String(s.preRate||0))}%</small></article><article class="metric-card"><span>Autoevaluación</span><strong>${s.avgRating?escapeHtml(String(s.avgRating))+'/10':'—'}</strong><small>Media de post-partido completados</small></article><article class="metric-card"><span>Conflictos</span><strong>${s.conflicts||0}</strong><small>Designaciones arbitrales solapadas</small></article></div><div class="form-grid two stats-dual-grid"><section class="panel inset"><div class="panel-heading"><div><h2>Evolución reciente</h2><p>Designaciones y dedicación por mes.</p></div></div>${monthly?`<div class="table-wrap"><table class="stats-table"><thead><tr><th>Mes</th><th>Total</th><th>FAR</th><th>Club</th><th>Horas</th><th>Valoración</th></tr></thead><tbody>${monthly}</tbody></table></div>`:emptyTable('Sin actividad arbitral en el período.')}</section><section class="panel inset"><div class="panel-heading"><div><h2>Categorías</h2><p>Distribución de partidos arbitrados/designados.</p></div></div>${cats?`<div class="table-wrap"><table class="stats-table"><thead><tr><th>Categoría / competición</th><th>Partidos</th></tr></thead><tbody>${cats}</tbody></table></div>`:emptyTable('Sin categorías registradas.')}</section></div>`;
}
function refereeStatsRefereeDetailHtml_(ref,selfOnly=false){
  if(!ref)return emptyTable('Sin datos arbitrales.');
  const assignments=(ref.assignments||[]).map(a=>`<tr class="clickable-row" data-ref-stats-event="${escapeHtml(a.eventId)}"><td>${escapeHtml(a.eventDate||'—')}<small>${escapeHtml(a.startTime||'')}</small></td><td><strong>${escapeHtml(a.title||'Partido')}</strong><small>${escapeHtml(a.category||'')}</small></td><td>${escapeHtml(refereeStatsOriginLabel_(a.origin))}<small>${escapeHtml(refereeStatsProfileLabel_(a.profile))}</small></td><td>${escapeHtml(String(a.occupationHours||0))} h</td><td>${a.preCompleted?'✓':'—'} / ${a.postCompleted?'✓':'—'}</td><td>${a.rating?escapeHtml(String(a.rating))+'/10':'—'}</td><td>${a.conflict?'<span class="status-pill warning">Conflicto</span>':escapeHtml(refereeStatsStatusLabel_(a))}</td></tr>`).join('');
  const cats=Object.entries(ref.categories||{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${escapeHtml(k)} (${v})`).join(' · ');
  const focus=Object.entries(ref.focus||{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${escapeHtml(k)} (${v})`).join(' · ');
  return `<section class="stats-player-detail-card"><div class="panel-heading"><div><span class="eyebrow">${selfOnly?'Mi temporada arbitral':'Detalle de árbitro'}</span><h2>${escapeHtml(ref.displayName||'Árbitro')}</h2><p>${ref.designations||0} designaciones · ${escapeHtml(String(ref.occupationHours||0))} h estimadas.</p></div>${selfOnly?'':'<button class="button mini secondary" id="ref-stats-detail-close">Cerrar</button>'}</div><div class="stats-detail-kpis"><div><span>Realizados</span><strong>${ref.matchesCompleted||0}</strong></div><div><span>FAR / Club</span><strong>${ref.far||0} / ${ref.club||0}</strong></div><div><span>Pre</span><strong>${escapeHtml(String(ref.preRate||0))}%</strong></div><div><span>Post</span><strong>${escapeHtml(String(ref.postRate||0))}%</strong></div><div><span>Valoración</span><strong>${ref.avgRating?escapeHtml(String(ref.avgRating))+'/10':'—'}</strong></div><div><span>Conflictos</span><strong>${ref.conflicts||0}</strong></div></div>${cats?`<p><strong>Categorías:</strong> ${cats}</p>`:''}${focus?`<p><strong>Focos trabajados:</strong> ${focus}</p>`:''}${assignments?`<div class="table-wrap"><table class="stats-table"><thead><tr><th>Fecha</th><th>Partido</th><th>Origen</th><th>Ocupación</th><th>Pre / Post</th><th>Valoración</th><th>Estado</th></tr></thead><tbody>${assignments}</tbody></table></div>`:emptyTable('Sin designaciones en el período.')}</section>`;
}
function refereeStatsRefereesHtml_(data){
  if(data.access?.selfOnly)return refereeStatsRefereeDetailHtml_((data.referees||[])[0],true);
  const rows=(data.referees||[]).filter(r=>r.designations>0).map(r=>`<tr class="clickable-row" data-ref-stats-person="${escapeHtml(r.personId)}"><td><strong>${escapeHtml(r.displayName)}</strong></td><td>${r.designations||0}</td><td>${r.far||0}</td><td>${r.club||0}</td><td>${escapeHtml(String(r.occupationHours||0))} h</td><td>${escapeHtml(String(r.preRate||0))}%</td><td>${escapeHtml(String(r.postRate||0))}%</td><td>${r.avgRating?escapeHtml(String(r.avgRating))+'/10':'—'}</td><td>${r.conflicts||0}</td></tr>`).join('');
  return `<section class="panel"><div class="panel-heading"><div><h2>Árbitros</h2><p>Seleccioná una persona para consultar el detalle completo de la temporada.</p></div></div>${rows?`<div class="table-wrap"><table class="stats-table"><thead><tr><th>Árbitro</th><th>Design.</th><th>FAR</th><th>Club</th><th>Horas</th><th>Pre</th><th>Post</th><th>Valoración</th><th>Conf.</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('No hay designaciones arbitrales en el período.')}<div id="ref-stats-person-detail"></div></section>`;
}
function refereeStatsEvolutionHtml_(data){
  const rows=(data.monthly||[]).map(m=>`<tr><td>${escapeHtml(m.label)}</td><td>${m.designations||0}</td><td>${m.far||0}</td><td>${m.club||0}</td><td>${escapeHtml(String(m.occupationHours||0))} h</td><td>${m.avgRating?escapeHtml(String(m.avgRating))+'/10':'—'}</td></tr>`).join('');
  return `<section class="panel"><div class="panel-heading"><div><h2>Evolución mensual</h2><p>Actividad arbitral y dedicación estimada a lo largo de la temporada.</p></div></div>${rows?`<div class="table-wrap"><table class="stats-table"><thead><tr><th>Mes</th><th>Designaciones</th><th>FAR</th><th>Club</th><th>Ocupación</th><th>Valoración</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('Sin actividad arbitral en el período.')}</section>`;
}
function refereeStatsFocusHtml_(data){
  const focus=(data.focus||[]).map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${x.count||0}</td></tr>`).join('');
  const cats=(data.categories||[]).map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${x.count||0}</td></tr>`).join('');
  const profiles=(data.profiles||[]).map(x=>`<tr><td>${escapeHtml(refereeStatsProfileLabel_(x.name))}</td><td>${x.count||0}</td></tr>`).join('');
  return `<div class="form-grid two stats-dual-grid"><section class="panel"><div class="panel-heading"><div><h2>Focos técnicos</h2><p>Temas seleccionados en los post-partido.</p></div></div>${focus?`<div class="table-wrap"><table><thead><tr><th>Foco</th><th>Veces</th></tr></thead><tbody>${focus}</tbody></table></div>`:emptyTable('Todavía no hay focos registrados.')}</section><section class="panel"><div class="panel-heading"><div><h2>Desplazamiento</h2><p>Perfil de ocupación utilizado en las designaciones.</p></div></div>${profiles?`<div class="table-wrap"><table><thead><tr><th>Perfil</th><th>Partidos</th></tr></thead><tbody>${profiles}</tbody></table></div>`:emptyTable('Sin perfiles registrados.')}</section></div><section class="panel"><div class="panel-heading"><div><h2>Categorías / competiciones</h2><p>Distribución de la temporada arbitral.</p></div></div>${cats?`<div class="table-wrap"><table><thead><tr><th>Categoría</th><th>Partidos</th></tr></thead><tbody>${cats}</tbody></table></div>`:emptyTable('Sin categorías registradas.')}</section>`;
}
function refereeStatsBody_(tab,data){if(tab==='referees')return refereeStatsRefereesHtml_(data);if(tab==='evolution')return refereeStatsEvolutionHtml_(data);if(tab==='focus')return refereeStatsFocusHtml_(data);return refereeStatsSummaryHtml_(data);}
function wireRefereeStatsBody_(tab,data){
  document.querySelectorAll('[data-ref-stats-event]').forEach(row=>row.onclick=()=>renderRefereeMatchWorkspace(row.dataset.refStatsEvent,'summary'));
  document.querySelectorAll('[data-ref-stats-person]').forEach(row=>row.onclick=()=>{const ref=(data.referees||[]).find(x=>x.personId===row.dataset.refStatsPerson),host=document.getElementById('ref-stats-person-detail');if(!host||!ref)return;host.innerHTML=refereeStatsRefereeDetailHtml_(ref,false);host.scrollIntoView({behavior:'smooth',block:'start'});host.querySelector('#ref-stats-detail-close')?.addEventListener('click',()=>host.innerHTML='');host.querySelectorAll('[data-ref-stats-event]').forEach(x=>x.onclick=()=>renderRefereeMatchWorkspace(x.dataset.refStatsEvent,'summary'));});
}
async function renderRefereeStatistics(filters={}){
  try{
    const ui=loadUiState_(),previous=ui.refereeStatisticsFilters||{},ctx=currentRoleContext_(),requested=Object.assign({},Object.keys(filters||{}).length?filters:previous,{seasonId:selectedSeasonId_(),contextRoleCategory:ctx.roleCategory||''});
    const key=JSON.stringify(requested);let data=null;if(refereeStatisticsData&&refereeStatisticsDataCacheKey===key&&(Date.now()-refereeStatisticsDataCachedAt)<30000)data=refereeStatisticsData;else{const response=await call('getRefereeStatisticsData',requested);data=response.data;refereeStatisticsData=data;refereeStatisticsDataCacheKey=key;refereeStatisticsDataCachedAt=Date.now();}
    const f=data.filters||{},activeTab=['summary','referees','evolution','focus'].includes(ui.refereeStatisticsTab)?ui.refereeStatisticsTab:'summary',tabs=[['summary','Resumen'],['referees',data.access?.selfOnly?'Mi temporada':'Árbitros'],['evolution','Evolución'],['focus','Focos']].map(([id,label])=>`<button type="button" class="stats-tab ${activeTab===id?'active':''}" data-ref-stats-tab="${id}">${label}</button>`).join('');
    const refOptions=data.access?.canFilterReferee?`<option value="">Todos los árbitros</option>`+(data.refereeOptions||data.referees||[]).map(r=>`<option value="${escapeHtml(r.personId)}" ${f.personId===r.personId?'selected':''}>${escapeHtml(r.displayName)}</option>`).join(''):'';
    shell(`<section class="hero compact"><span class="eyebrow">Área arbitral · Estadísticas</span><h1>Estadísticas arbitrales</h1><p>${data.access?.selfOnly?'Tus designaciones, dedicación y seguimiento durante la temporada.':'Designaciones FAR e internas, ocupación estimada y seguimiento de los árbitros del club.'}</p>${currentAccessProfile_().isAdmin?'<div class="button-row"><button class="button secondary" id="ref-stats-open-sport">Ver estadísticas deportivas</button></div>':''}</section><section class="panel stats-filter-panel"><div class="form-grid ${data.access?.canFilterReferee?'three':'two'}">${data.access?.canFilterReferee?`<label>Árbitro<select id="ref-stats-person">${refOptions}</select></label>`:''}<label>Desde<input id="ref-stats-from" type="date" value="${escapeHtml(f.fromDate||'')}"></label><label>Hasta<input id="ref-stats-to" type="date" value="${escapeHtml(f.toDate||'')}"></label></div><div class="button-row stats-filter-actions"><button class="button secondary" id="ref-stats-clear">Limpiar período</button></div></section><nav class="stats-tabs" aria-label="Secciones de estadísticas arbitrales">${tabs}</nav><div id="ref-stats-tab-host">${refereeStatsBody_(activeTab,data)}</div>`,'statistics');
    document.getElementById('ref-stats-open-sport')?.addEventListener('click',()=>{saveUiStatePatch_({statisticsMode:'sport'});renderStatistics();});
    const collect=()=>({seasonId:selectedSeasonId_(),personId:document.getElementById('ref-stats-person')?.value||'',fromDate:val('ref-stats-from'),toDate:val('ref-stats-to')});const reload=()=>{const next=collect();saveUiStatePatch_({refereeStatisticsFilters:next});renderRefereeStatistics(next);};
    ['ref-stats-person','ref-stats-from','ref-stats-to'].forEach(id=>document.getElementById(id)?.addEventListener('change',reload));document.getElementById('ref-stats-clear')?.addEventListener('click',()=>{const next={seasonId:selectedSeasonId_(),personId:'',fromDate:'',toDate:''};saveUiStatePatch_({refereeStatisticsFilters:next});renderRefereeStatistics(next);});
    document.querySelectorAll('[data-ref-stats-tab]').forEach(b=>b.onclick=()=>{saveUiStatePatch_({refereeStatisticsTab:b.dataset.refStatsTab});renderRefereeStatistics();});wireRefereeStatsBody_(activeTab,data);
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudieron cargar las estadísticas arbitrales</h1><p>${escapeHtml(userErrorText_(err))}</p><button class="button primary" id="ref-stats-retry">Reintentar</button></section>`,'statistics');document.getElementById('ref-stats-retry')?.addEventListener('click',()=>renderRefereeStatistics(filters));}
}

async function renderStatistics(filters={}){
  try{
    const preUi=loadUiState_(),preRole=String(currentRoleContext_().roleCategory||'').toUpperCase();
    if(['REFEREE','REFEREE_COORDINATOR'].includes(preRole)||(currentAccessProfile_().isAdmin&&preUi.statisticsMode==='referee'))return renderRefereeStatistics(filters);
    const ui=preUi,previous=ui.statisticsFilters||{},ctx=currentRoleContext_(),requested=Object.assign({},Object.keys(filters||{}).length?filters:previous,{seasonId:selectedSeasonId_(),contextDivisionIds:contextDivisionIds_(),contextRoleCategory:ctx.roleCategory||''});requested.divisionId=contextScopedDivisionId_(requested.divisionId||'');
    const statsKey=JSON.stringify(requested);let data=null;
    if(statisticsData&&statisticsDataCacheKey===statsKey&&(Date.now()-statisticsDataCachedAt)<30000)data=statisticsData;
    else{const response=await call('getStatisticsData',requested);data=response.data;statisticsData=data;statisticsDataCacheKey=statsKey;statisticsDataCachedAt=Date.now();}
    const divMap=Object.fromEntries((data.divisions||[]).map(x=>[x.divisionId,x])),teamMap=Object.fromEntries((data.teams||[]).map(x=>[x.teamId,x])),f=data.filters||{};
    let activeTab=ui.statisticsTab||'summary';const allowedTabs=['summary','players','training','matches'].concat(data.access?.canCompare?['comparison']:[]);if(!allowedTabs.includes(activeTab))activeTab='summary';
    const divisionOptions=`<option value="">${data.divisions?.length>1?'Todas las divisiones':'División'}</option>`+(data.divisions||[]).map(d=>`<option value="${escapeHtml(d.divisionId)}" ${f.divisionId===d.divisionId?'selected':''}>${escapeHtml(d.name)}</option>`).join('');
    const teamOptions=`<option value="">Todos los equipos</option>`+(data.teams||[]).filter(t=>!f.divisionId||t.divisionId===f.divisionId).map(t=>`<option value="${escapeHtml(t.teamId)}" ${f.teamId===t.teamId?'selected':''}>${escapeHtml(t.name)}</option>`).join('');
    const tabLabels={summary:'Resumen',players:data.access?.selfOnly?'Mi temporada':'Jugadores',training:'Entrenamientos',matches:'Partidos',comparison:'Comparativa'};
    const tabs=allowedTabs.map(tab=>`<button type="button" class="stats-tab ${activeTab===tab?'active':''}" data-stats-tab="${tab}">${tabLabels[tab]}</button>`).join('');
    shell(`<section class="hero compact"><span class="eyebrow">Rendimiento · Estadísticas 2.0</span><h1>Estadísticas</h1><p>${data.access?.selfOnly?'Tu temporada deportiva, asistencia y participación real.':'Asistencia, disponibilidad, convocatorias, participación y resultados con trazabilidad.'}</p>${currentAccessProfile_().isAdmin?'<div class="button-row"><button class="button secondary" id="stats-open-referee">Ver estadísticas arbitrales</button></div>':''}</section><section class="panel stats-filter-panel"><div class="form-grid four"><label>División<select id="stats-division">${divisionOptions}</select></label><label>Equipo<select id="stats-team">${teamOptions}</select></label><label>Desde<input id="stats-from" type="date" value="${escapeHtml(f.fromDate||'')}"></label><label>Hasta<input id="stats-to" type="date" value="${escapeHtml(f.toDate||'')}"></label></div><div class="button-row stats-filter-actions"><button class="button secondary" id="stats-clear">Limpiar período</button></div></section>${statsQualityMarkup_(data)}<nav class="stats-tabs" aria-label="Secciones de estadísticas">${tabs}</nav><div id="stats-tab-host">${statsTabBody_(activeTab,data,divMap,teamMap)}</div>`,'statistics');
    document.getElementById('stats-open-referee')?.addEventListener('click',()=>{saveUiStatePatch_({statisticsMode:'referee'});renderStatistics();});
    const collect=()=>({seasonId:selectedSeasonId_(),divisionId:val('stats-division'),teamId:val('stats-team'),fromDate:val('stats-from'),toDate:val('stats-to')});const reload=()=>{const next=collect();saveUiStatePatch_({statisticsFilters:next});renderStatistics(next);};
    ['stats-team','stats-from','stats-to'].forEach(id=>document.getElementById(id).onchange=reload);document.getElementById('stats-division').onchange=()=>{const next=collect();next.teamId='';saveUiStatePatch_({statisticsFilters:next});renderStatistics(next);};document.getElementById('stats-clear').onclick=()=>{const div=contextSingleDivisionId_();saveUiStatePatch_({statisticsFilters:{seasonId:selectedSeasonId_(),divisionId:div,teamId:'',fromDate:'',toDate:''}});renderStatistics({seasonId:selectedSeasonId_(),divisionId:div});};
    document.querySelectorAll('[data-stats-tab]').forEach(b=>b.onclick=()=>{saveUiStatePatch_({statisticsTab:b.dataset.statsTab});renderStatistics();});wireStatsBody_(activeTab,data);
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudieron cargar las estadísticas</h1><p>${escapeHtml(err.message)}</p><button class="button primary" id="stats-retry">Reintentar</button></section>`,'statistics');document.getElementById('stats-retry')?.addEventListener('click',()=>renderStatistics());}
}


async function renderRefereeCoordination_(){
  try{
    const {data}=await call('getRefereeCoordinationData',{seasonId:selectedSeasonId_()});
    const rows=data.rows||[],farCount=rows.filter(r=>r.readOnly).length,clubCount=rows.length-farCount;
    const rowHtml=rows.map(r=>{
      const e=r.event||{},selected=r.refereePersonId||'';
      if(r.readOnly){
        const external=isExternalRefereeMatchClient_(e),kind=external?'Partido externo · FAR':'Partido oficial · FAR';
        const occ=r.occupation;return `<tr><td>${escapeHtml(e.eventDate||'—')}<small>${escapeHtml(displayEventTime_(e))}</small>${occ?.known?`<small>Ocupación ${escapeHtml(occ.startTime)}–${escapeHtml(occ.endTime)}</small>`:''}</td><td><strong>${escapeHtml(e.title||eventTypeLabel(e.eventType))}</strong><small>${escapeHtml(kind)}</small></td><td><strong>${escapeHtml(r.refereeName||'—')}</strong></td><td><span class="status-pill active">FAR</span></td><td><button class="button mini secondary" data-open-referee-event="${escapeHtml(e.eventId)}">Ver</button></td></tr>`;
      }
      const options=(r.candidates||[]).map(c=>`<option value="${escapeHtml(c.personId)}" ${selected===c.personId?'selected':''} ${(!c.available||c.hardConflict)&&selected!==c.personId?'disabled':''}>${escapeHtml(c.displayName)}${!c.available?' · AUSENTE':c.hardConflict?' · CONFLICTO':''}</option>`).join('');
      const current=(r.candidates||[]).find(c=>c.personId===selected),warns=current?.conflicts?.filter(c=>c.level==='WARN')||[];
      return `<tr><td>${escapeHtml(e.eventDate||'—')}<small>${escapeHtml(displayEventTime_(e))}</small></td><td><strong>${escapeHtml(e.title||eventTypeLabel(e.eventType))}</strong><small>${escapeHtml(e.eventType==='MATCH'?'Amistoso / manual':'Entrenamiento')}</small></td><td><select data-referee-select="${escapeHtml(e.eventId)}"><option value="">— Sin designar —</option>${options}</select>${warns.length?`<small class="warning-text">⚠ ${escapeHtml(warns.map(x=>x.reason).join(' · '))}</small>`:''}</td><td>${selected?'<span class="status-pill success">Club</span>':'<span class="status-pill warning">Pendiente</span>'}</td><td><button class="button mini primary" data-save-referee="${escapeHtml(e.eventId)}">Guardar</button></td></tr>`;
    }).join('');
    shell(`<section class="hero compact"><span class="eyebrow">Área arbitral</span><h1>Coordinación de árbitros</h1><p>Designaciones FAR y asignaciones internas del club en una única vista.</p></section><section class="panel"><div class="panel-heading"><div><h2>Próximas designaciones</h2><p>${rows.length} actividad(es) · ${farCount} FAR · ${clubCount} internas.</p></div><button class="button secondary" id="referee-coordination-back">Volver al calendario</button></div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Actividad</th><th>Árbitro</th><th>Origen</th><th></th></tr></thead><tbody>${rowHtml}</tbody></table></div>`:'<div class="empty-state">No hay designaciones próximas.</div>'}<div id="message" class="message"></div></section>`,'calendar');
    document.getElementById('referee-coordination-back').onclick=renderCalendar;
    document.querySelectorAll('[data-open-referee-event]').forEach(b=>b.onclick=()=>renderEventDetail(b.dataset.openRefereeEvent));
    document.querySelectorAll('[data-save-referee]').forEach(b=>b.onclick=async()=>{const eventId=b.dataset.saveReferee,sel=document.querySelector(`[data-referee-select="${CSS.escape(eventId)}"]`);b.disabled=true;try{await call('assignEventReferee',{eventId,personId:sel?.value||''});showToast_('Designación actualizada.');await renderRefereeCoordination_();}catch(err){showMessage(err.message,'error');b.disabled=false;}});
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudieron cargar las designaciones</h1><p>${escapeHtml(err.message)}</p><button class="button secondary" id="referee-coordination-back">Volver</button></section>`,'calendar');document.getElementById('referee-coordination-back')?.addEventListener('click',renderCalendar);}
}

function calendarVisibleRange_(){
  const cursor=new Date(calendarCursor);let from,to;
  if(calendarView==='month'){
    const first=new Date(cursor.getFullYear(),cursor.getMonth(),1),last=new Date(cursor.getFullYear(),cursor.getMonth()+1,0);
    from=startOfWeek(first);to=startOfWeek(last);to.setDate(to.getDate()+6);
  }else{from=startOfWeek(cursor);to=new Date(from);to.setDate(to.getDate()+6);}
  return {fromDate:isoLocalDate(from),toDate:isoLocalDate(to)};
}

async function renderCalendar(forceReload=false){
  const state=Object.assign({},loadUiState_().calendarFilters||{});state.divisionId=contextScopedDivisionId_(state.divisionId||'');
  const seasonId=selectedSeasonId_(),range=calendarVisibleRange_(),calendarCacheKey=[seasonId,calendarView,range.fromDate,range.toDate,contextRoleCategory_(),contextDivisionIds_().join(',')].join('|');let d=null;
  if(!forceReload&&calendarListCache_&&calendarListCache_.key===calendarCacheKey&&(Date.now()-calendarListCache_.at)<30000)d=calendarListCache_.data;
  if(!d){try{const response=await call('getCalendarListData',{seasonId,fromDate:range.fromDate,toDate:range.toDate});d=response.data;calendarListCache_={key:calendarCacheKey,at:Date.now(),data:d};}catch(err){shell(`<section class="panel narrow"><h1>No se pudo cargar calendario</h1><p>${escapeHtml(err.message)}</p><button class="button primary" id="calendar-retry">Reintentar</button></section>`,'calendar');document.getElementById('calendar-retry')?.addEventListener('click',()=>renderCalendar(true));return;}}
  if(!calendarViewTouched&&loadUiState_().calendarView)calendarView=loadUiState_().calendarView;
  const monthLabel=calendarCursor.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  const reportSet=new Set(d.matchReportEventIds||[]);
  const renderCurrentCalendar=(events)=>calendarView==='month'?renderMonthGrid(events):calendarView==='week'?renderWeekGrid(events):renderAgenda(events);
  shell(`<section class="hero compact"><span class="eyebrow">Actividad deportiva</span><h1>Calendario</h1><p>Entrenamientos y partidos en una única vista.</p>${(currentRoleContext_()?.roleCategory==='REFEREE_COORDINATOR'||currentAccessProfile_().isAdmin)?'<div class="button-row"><button class="button secondary" id="open-referee-coordination">Designaciones de árbitros</button></div>':''}</section>
  <section class="panel"><div class="calendar-toolbar"><div class="button-row"><button class="button secondary" id="cal-prev">‹</button><button class="button secondary" id="cal-today">Hoy</button><button class="button secondary" id="cal-next">›</button></div><h2>${escapeHtml(monthLabel)}</h2><div class="button-row"><button class="button ${calendarView==='agenda'?'primary':'secondary'}" id="cal-agenda">Agenda</button><button class="button ${calendarView==='month'?'primary':'secondary'}" id="cal-month">Mes</button><button class="button ${calendarView==='week'?'primary':'secondary'}" id="cal-week">Semana</button>${d.canManageCompetitions?'<button class="button secondary" id="manage-competitions">Actualizar desde WEB</button>':''}${d.canImportLeague?'<button class="button secondary" id="manual-load">Carga manual</button>':''}${d.canCreate?'<button class="button primary" id="new-event">Nueva actividad</button>':''}</div></div>
  <div class="filter-bar calendar-filters"><label>División<select id="cal-filter-division"><option value="">Todas las divisiones</option>${(d.divisions||[]).filter(x=>contextAllowsDivisionId_(x.divisionId)).map(x=>`<option value="${escapeHtml(x.divisionId)}" ${state.divisionId===x.divisionId?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}</select></label><label id="cal-filter-team-wrap">Equipo<select id="cal-filter-team"><option value="">Todos los equipos</option></select></label><label>Competición<select id="cal-filter-competition"><option value="">Todas las competiciones</option>${(d.competitions||[]).filter(c=>c.status==='ACTIVE'||state.competitionId===c.competitionId).map(c=>`<option value="${escapeHtml(c.competitionId)}" ${state.competitionId===c.competitionId?'selected':''}>${escapeHtml(competitionDisplayNameClient_(c))}</option>`).join('')}</select></label><label>Tipo<select id="cal-filter-type"><option value="">Todos</option><option value="TRAINING" ${state.type==='TRAINING'?'selected':''}>Entrenamientos</option><option value="MATCH" ${state.type==='MATCH'?'selected':''}>Partidos</option><option value="REST" ${state.type==='REST'?'selected':''}>Descansos</option><option value="RECOVERY" ${state.type==='RECOVERY'?'selected':''}>Jornadas de recuperación</option></select></label><label>Estado<select id="cal-filter-status"><option value="">Todos</option>${['PENDING','SCHEDULED','IN_PROGRESS','COMPLETED','POSTPONED','CANCELLED'].map(x=>`<option value="${x}" ${state.status===x?'selected':''}>${escapeHtml(eventStatusLabel(x))}</option>`).join('')}</select></label><label>Acta<select id="cal-filter-report"><option value="">Todas</option><option value="WITH" ${state.report==='WITH'?'selected':''}>Con acta</option><option value="WITHOUT" ${state.report==='WITHOUT'?'selected':''}>Sin acta</option></select></label><label class="filter-grow">Rival / título<input id="cal-filter-q" value="${escapeHtml(state.q||'')}" placeholder="Buscar partido o rival"></label><button class="button secondary filter-clear" id="cal-filter-clear">Limpiar</button></div>
  <div id="calendar-host"></div><div id="message" class="message"></div></section>`,'calendar');
  const move=n=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+(calendarView==='month'?n:0),calendarCursor.getDate()+((calendarView==='week'||calendarView==='agenda')?7*n:0));renderCalendar();};
  document.getElementById('cal-prev').onclick=()=>move(-1);document.getElementById('cal-next').onclick=()=>move(1);document.getElementById('cal-today').onclick=()=>{calendarCursor=new Date();renderCalendar();};
  document.getElementById('cal-agenda').onclick=()=>{calendarViewTouched=true;calendarView='agenda';saveUiStatePatch_({calendarView});renderCalendar();};document.getElementById('cal-month').onclick=()=>{calendarViewTouched=true;calendarView='month';saveUiStatePatch_({calendarView});renderCalendar();};document.getElementById('cal-week').onclick=()=>{calendarViewTouched=true;calendarView='week';saveUiStatePatch_({calendarView});renderCalendar();};
  const cb=document.getElementById('manage-competitions');if(cb)cb.onclick=renderCompetitions;const ml=document.getElementById('manual-load');if(ml)ml.onclick=renderManualLoad_;const nb=document.getElementById('new-event');if(nb)nb.onclick=()=>renderEventEditor();
  document.getElementById('open-referee-coordination')?.addEventListener('click',renderRefereeCoordination_);
  const teamWrap=document.getElementById('cal-filter-team-wrap'),teamSelect=document.getElementById('cal-filter-team');
  const syncCalendarTeams=()=>{const div=val('cal-filter-division');const teams=div?(d.teams||[]).filter(t=>t.divisionId===div):[];teamWrap.hidden=!div;teamSelect.innerHTML='<option value="">Todos los equipos</option>'+teams.map(t=>`<option value="${escapeHtml(t.teamId)}" ${state.teamId===t.teamId?'selected':''}>${escapeHtml(t.name)}</option>`).join('');if(!div)teamSelect.value='';};
  const applyFilters=()=>{const f={divisionId:val('cal-filter-division'),teamId:val('cal-filter-team'),competitionId:val('cal-filter-competition'),type:val('cal-filter-type'),status:val('cal-filter-status'),report:val('cal-filter-report'),q:val('cal-filter-q')};saveUiStatePatch_({calendarFilters:f});const q=textNorm_(f.q);const filtered=d.events.filter(e=>contextAllowsEvent_(e)&&(!f.divisionId||e.divisionId===f.divisionId)&&(!f.teamId||e.teamId===f.teamId||(e.eventType==='TRAINING'&&e.divisionId===f.divisionId&&!e.teamId))&&(!f.competitionId||e.competitionId===f.competitionId)&&(!f.type||e.eventType===f.type)&&(!f.status||e.status===f.status)&&(!f.report||(f.report==='WITH'?reportSet.has(e.eventId):!reportSet.has(e.eventId)))&&(!q||textNorm_([e.title,e.opponent,e.competition,e.location].join(' ')).includes(q)));document.getElementById('calendar-host').innerHTML=renderCurrentCalendar(filtered);document.querySelectorAll('[data-open-event]').forEach(b=>b.onclick=()=>renderEventDetail(b.dataset.openEvent));};
  syncCalendarTeams();applyFilters();
  document.getElementById('cal-filter-division').onchange=()=>{state.teamId='';syncCalendarTeams();applyFilters();};teamSelect.onchange=applyFilters;document.getElementById('cal-filter-competition').onchange=applyFilters;document.getElementById('cal-filter-type').onchange=applyFilters;document.getElementById('cal-filter-status').onchange=applyFilters;document.getElementById('cal-filter-report').onchange=applyFilters;document.getElementById('cal-filter-q').onchange=applyFilters;document.getElementById('cal-filter-q').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyFilters();}};document.getElementById('cal-filter-clear').onclick=()=>{saveUiStatePatch_({calendarFilters:{divisionId:contextSingleDivisionId_()}});renderCalendar();};
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
  invalidateCalendarCaches_();
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
      return `<tr><td><strong>${escapeHtml((divMap[c.divisionId]||{}).name||'—')}</strong><small>${escapeHtml((teamMap[c.teamId]||{}).name||'Toda la división')}</small></td><td><strong>${escapeHtml(c.name||'—')}</strong>${c.phase?`<small>${escapeHtml(c.phase)}</small>`:''}${c.externalClubName?`<small>Club FAR: ${escapeHtml(c.externalClubName)}</small>`:''}</td><td>${escapeHtml(competitionTypeLabelClient_(c.competitionType))}<small>${escapeHtml(c.federationName||'')}</small></td><td><div class="button-row compact-links">${links}</div></td><td>${syncState}${syncText}</td><td>${c.canManage?`<div class="button-row"><button class="button mini secondary" data-edit-competition="${escapeHtml(c.competitionId)}">Editar</button>${webSync?`<button class="button mini primary" data-sync-competition="${escapeHtml(c.competitionId)}">Actualizar desde FAR</button>`:''}</div>`:'<span class="muted">Solo lectura</span>'}</td></tr>`;
    }).join('');
    shell(`<section class="hero compact"><span class="eyebrow">Calendario federativo</span><h1>Actualizar desde WEB</h1><p>La actualización FAR se ejecuta automáticamente una vez al día. Usá la actualización manual solo como respaldo o reintento.</p></section><section class="panel"><div class="panel-heading"><div><h2>${escapeHtml(selectedSeason_()?.name||'Temporada')}</h2><p>${(data.competitions||[]).length} competición(es) configurada(s).</p></div><div class="button-row"><button class="button secondary" id="competitions-back">Volver al calendario</button>${data.canManage?'<button class="button primary" id="competition-sync-all">Actualizar ahora (respaldo)</button><button class="button secondary" id="competition-new">Nueva competición</button>':''}${currentUser?.role==='ADMIN'?'<button class="button secondary" id="competition-referee-sources">Fuentes arbitrales FAR</button>':''}</div></div>${externalAuthHtml}${rows?`<div class="table-wrap"><table><thead><tr><th>División / equipo</th><th>Competición / fase</th><th>Tipo</th><th>Enlaces oficiales</th><th>Sincronización</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyTable('Todavía no hay competiciones configuradas para esta temporada.')}<div id="message" class="message"></div></section>`,'calendar');
    document.getElementById('competitions-back').onclick=renderCalendar;
    wireCompetitionExternalAuth_(externalAccess,renderCompetitions);
    const nb=document.getElementById('competition-new');if(nb)nb.onclick=()=>renderCompetitionEditor('');
    const rs=document.getElementById('competition-referee-sources');if(rs)rs.onclick=()=>renderClubSettings('refereeing');
    const syncAll=document.getElementById('competition-sync-all');if(syncAll)syncAll.onclick=async()=>{syncAll.disabled=true;const original=syncAll.textContent;syncAll.textContent='Actualizando todo FAR…';try{const r=(await call('syncAllFar',{seasonId:selectedSeasonId_()})).data||{},cs=r.competitions||{},rs=r.refereeSources||{},docs=r.documents||{};invalidateCalendarCaches_();showToast_(`FAR ${r.status||'OK'}: competiciones ${cs.ok||0}/${cs.total||0} · fuentes arbitrales ${rs.ok||0}/${rs.total||0} · documentos nuevos ${docs.newDocuments||0}${r.errors?.length?' · '+r.errors.length+' incidencia(s)':''}`,r.status==='OK'?'success':'warning',9000);await renderCompetitions();}catch(err){showToast_(userErrorText_(err),'warning',9000);}finally{syncAll.disabled=false;syncAll.textContent=original;}};

    document.querySelectorAll('[data-edit-competition]').forEach(b=>b.onclick=()=>renderCompetitionEditor(b.dataset.editCompetition));
    document.querySelectorAll('[data-sync-competition]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const result=await syncCompetitionAndReports_(b.dataset.syncCompetition),sync=result.sync||{},r=result.reportSummary||{};showToast_(`FAR actualizado: ${sync.imported||0} nuevos · ${sync.updated||0} actualizados · ${sync.duplicatesMerged||0} duplicados conciliados · ${sync.rests||0} descansos Marbella · ${sync.recoveries||0} jornadas de recuperación · ${sync.staleRestsRemoved||0} descansos incorrectos eliminados · ${sync.staleRecoveriesRemoved||0} recuperaciones retiradas · ${sync.refereeChanges||0} cambios de árbitro${sync.refereeFieldsMissing?' · '+sync.refereeFieldsMissing+' árbitros no verificables':''} · ${r.downloaded||0} acta(s) descargada(s) · ${r.applied||0} aplicada(s)${r.needsReview?' · '+r.needsReview+' para revisión':''}.`,'success',7000);await renderCompetitions();}catch(err){if(err.code==='EXTERNAL_REQUEST_AUTH_REQUIRED'){showToast_('Falta autorizar la conexión FAR.','warning',4000);await renderCompetitions();return;}showMessage(userErrorText_(err),'error');b.disabled=false;}});
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudieron cargar las competiciones</h1><p>${escapeHtml(err.message)}</p><button class="button secondary" id="competitions-back">Volver</button></section>`,'calendar');document.getElementById('competitions-back')?.addEventListener('click',renderCalendar);}
}

async function renderCompetitionEditor(competitionId=''){
  const {data}=await call('getCompetitionsData',{seasonId:selectedSeasonId_()});
  const c=(data.competitions||[]).find(x=>x.competitionId===competitionId)||{};
  if(competitionId&&c.competitionId&&!c.canManage)return renderCompetitions();
  const manageable=new Set(data.manageableDivisionIds||[]),divs=(data.divisions||[]).filter(d=>manageable.has(d.divisionId)||currentAccessProfile_().isAdmin),teams=(data.teams||[]).filter(t=>manageable.has(t.divisionId)||currentAccessProfile_().isAdmin);
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
  document.getElementById('competition-form').onsubmit=async ev=>{ev.preventDefault();syncTechnicalInputs();const source=val('competition-source-url'),calendarUrl=val('competition-calendar-url');if(source&&!calendarUrl&&!c.calendarUrl)return showMessage('Analizá la URL oficial antes de guardar para seleccionar la competición correcta.','error');const button=ev.submitter;if(button)button.disabled=true;const shouldSync=!!(document.getElementById('competition-sync-on-save').checked&&calendarUrl);try{const {data:saved}=await call('saveCompetition',{competitionId:c.competitionId||'',seasonId:selectedSeasonId_(),divisionId:val('competition-division'),teamId:val('competition-team'),name:val('competition-name'),competitionType:val('competition-type'),phase:val('competition-phase'),federationName:val('competition-federation'),federationPageUrl:source,calendarUrl:calendarUrl,matchCenterUrl:val('competition-match-center-url'),externalCompetitionId:val('competition-external-id'),externalClubName:val('competition-external-club-name'),sourceProvider:val('competition-source-provider'),sortOrder:val('competition-sort'),status:val('competition-status'),notes:val('competition-notes')});invalidateCalendarCaches_();const savedCompetition=saved&&saved.competition?saved.competition:null;if(shouldSync&&savedCompetition&&savedCompetition.competitionId){showToast_('Competición guardada. Iniciando sincronización con FAR…','success',2200);try{const result=await syncCompetitionAndReports_(savedCompetition.competitionId),sync=result.sync||{},r=result.reportSummary||{};invalidateCalendarCaches_();showToast_(`FAR actualizado: ${sync.imported||0} nuevos · ${sync.updated||0} actualizados · ${sync.duplicatesMerged||0} duplicados conciliados · ${sync.refereeChanges||0} cambios de árbitro${sync.refereeFieldsMissing?' · '+sync.refereeFieldsMissing+' árbitros no verificables':''} · ${r.downloaded||0} acta(s) procesada(s)${r.needsReview?' · '+r.needsReview+' para revisión':''}.`,'success',6500);}catch(syncErr){if(syncErr.code==='EXTERNAL_REQUEST_AUTH_REQUIRED')showToast_('La competición quedó guardada. Falta autorizar la conexión FAR para sincronizar.','warning',6000);else showToast_('La competición quedó guardada, pero la sincronización no terminó: '+userErrorText_(syncErr),'warning',7000);}}else showToast_('Competición guardada.');await renderCompetitions();}catch(err){showMessage(userErrorText_(err),'error');if(button)button.disabled=false;}};
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
function manualEventRefereeAllowedClient_(eventType,matchType='',competitionId=''){const type=String(eventType||'').toUpperCase(),mt=String(matchType||'').toUpperCase();if(type==='TRAINING')return true;if(type!=='MATCH')return false;return mt!=='COMPETITION';}
function eventEditorParticipants(e,divisionId,eventDate,selectedOverride,eventType='',matchType='',competitionId=''){
  const groups=eventCandidateGroups_(divisionId,eventDate),selected=selectedOverride||eventExistingParticipantSelection_(e,groups);
  if(!divisionId)return '<div class="info-strip">Seleccioná primero una división para cargar las vinculaciones específicas.</div>';
  const type=eventType||e?.eventType||'TRAINING',mt=matchType||e?.matchType||'',comp=competitionId||e?.competitionId||'';
  if(!manualEventRefereeAllowedClient_(type,mt,comp))return '<div class="info-strip"><strong>Árbitro oficial.</strong> En partidos de competición la designación se toma de FAR/MatchReady y no se gestiona como participante interno.</div>';
  const rows=groups.REFEREE||[];
  return `<div class="participant-role-groups"><div class="info-strip"><strong>Disponibilidad automática.</strong> Jugadores y staff activos de la división se calculan automáticamente según bajas y ausencias. Acá solo vinculás un árbitro específico cuando corresponde.</div><section class="participant-role-group"><div class="participant-role-heading"><h3>Árbitro</h3><small>Opcional para entrenamientos y partidos amistosos/actividades manuales.</small></div>${rows.length?`<div class="participant-role-list">${rows.map(x=>`<label class="participant-choice role-fixed"><input type="checkbox" data-event-person="${escapeHtml(x.person.personId)}" data-event-role-category="REFEREE" ${selected[x.person.personId]==='REFEREE'?'checked':''}><span><strong>${escapeHtml(x.person.displayName)}</strong>${x.roleName?`<small>${escapeHtml(x.roleName)}</small>`:''}</span><span class="badge active">Árbitro</span></label>`).join('')}</div>`:'<div class="muted-text">Sin árbitros activos.</div>'}</section></div>`;
}
function wireParticipantRoleChoices_(){document.querySelectorAll('[data-event-person]').forEach(ch=>ch.onchange=()=>{if(!ch.checked)return;document.querySelectorAll(`[data-event-person="${CSS.escape(ch.dataset.eventPerson)}"]`).forEach(other=>{if(other!==ch)other.checked=false;});});}
async function renderEventEditor(eventId=''){
  if(!calendarData||Date.now()-calendarDataLoadedAt_>20000){const r=await call('getCalendarData',{seasonId:selectedSeasonId_()});calendarData=r.data;calendarDataLoadedAt_=Date.now();}const d=calendarData,e=(d.events||[]).find(x=>x.eventId===eventId)||{};
  const teams=d.teams||[],divs=d.divisions||[];
  shell(`<section class="hero compact"><span class="eyebrow">${e.eventId?'Editar':'Nueva'} actividad</span><h1>${e.eventId?escapeHtml(e.title):'Entrenamiento o partido'}</h1></section>
  <form id="event-form" class="panel form-stack"><div class="form-grid three"><label>Tipo<select id="event-type"><option value="TRAINING" ${e.eventType==='TRAINING'||!e.eventType?'selected':''}>Entrenamiento</option><option value="MATCH" ${e.eventType==='MATCH'?'selected':''}>Partido</option>${e.eventType==='REST'?'<option value="REST" selected>Descanso</option>':''}</select></label><label>Título<input id="event-title" value="${escapeHtml(e.title||'')}" maxlength="120"></label><label>Estado<div class="readonly-field">${escapeHtml(eventStatusLabel(e.status||'SCHEDULED'))}</div><small>${e.eventId?'El estado se cambia desde el detalle de la actividad.':'Las nuevas actividades se crean siempre como Programadas.'}</small></label><label>División<select id="event-division" required><option value="">— Seleccionar división —</option>${optionList(divs,'divisionId',x=>x.name,e.divisionId||'',false)}</select></label><label>Equipo<select id="event-team"><option value="">Toda la división</option></select></label><label>Fecha<input id="event-date" type="date" required value="${escapeHtml(e.eventDate||isoLocalDate(new Date()))}"></label><label>Hora inicio<input id="event-start" type="time" value="${escapeHtml(e.startTime||'')}"></label><label>Hora fin<input id="event-end" type="time" value="${escapeHtml(e.endTime||'')}"></label><label>Ubicación<input id="event-location" value="${escapeHtml(e.location||'')}" maxlength="180"></label></div><div id="match-fields" class="form-grid three"><label>Rival<input id="event-opponent" value="${escapeHtml(e.opponent||'')}" maxlength="120"></label><label>Tipo partido<select id="event-match-type"><option value="FRIENDLY" ${e.matchType==='FRIENDLY'||!e.matchType?'selected':''}>Amistoso</option><option value="OTHER" ${e.matchType==='OTHER'?'selected':''}>Otro</option>${e.matchType==='COMPETITION'?'<option value="COMPETITION" selected>Competición importada</option>':''}</select></label><label>Competición<select id="event-competition-id"><option value="">— Sin competición configurada —</option></select><small id="event-competition-legacy">${e.competition&&!e.competitionId?'Actual: '+escapeHtml(e.competition):''}</small></label><label>Resultado club<input id="event-result-for" type="number" min="0" value="${escapeHtml(e.resultFor||'')}"></label><label>Resultado rival<input id="event-result-against" type="number" min="0" value="${escapeHtml(e.resultAgainst||'')}"></label><label>Formato de partido/jornada<select id="event-match-format"><option value="SINGLE" ${!e.matchFormat||e.matchFormat==='SINGLE'?'selected':''}>Partido único</option><option value="TRIANGULAR" ${e.matchFormat==='TRIANGULAR'?'selected':''}>Triangular</option><option value="QUADRANGULAR" ${e.matchFormat==='QUADRANGULAR'?'selected':''}>Cuadrangular</option><option value="CUSTOM" ${e.matchFormat==='CUSTOM'?'selected':''}>Personalizado</option></select></label><label>Duración partido (min)<input id="event-match-duration" type="number" min="1" max="120" value="${escapeHtml(e.matchDurationMinutes||'')}" placeholder="Usa división"></label><label>Minutos por tiempo<input id="event-half-duration" type="number" min="1" max="60" value="${escapeHtml(e.halfDurationMinutes||'')}" placeholder="Usa división"></label><div class="form-hint span-three" id="event-duration-hint">Partido único usa la duración de la división salvo que la sobrescribas.</div></div><label>Observaciones<textarea id="event-notes" maxlength="1000">${escapeHtml(e.notes||'')}</textarea></label><div class="section-divider"></div><div class="section-heading"><h2>Vinculaciones específicas</h2><p>La disponibilidad de jugadores y staff se calcula automáticamente. El árbitro manual solo aplica a entrenamientos y partidos amistosos/actividades no oficiales.</p></div><div id="event-participants-grid">${eventEditorParticipants(e,e.divisionId||'',e.eventDate||isoLocalDate(new Date()),null,e.eventType||'TRAINING',e.matchType||'FRIENDLY',e.competitionId||'')}</div><div class="button-row"><button class="button secondary" type="button" id="cancel-event">Cancelar</button><button class="button primary" type="submit">Guardar actividad</button></div><div id="message" class="message"></div></form>`,'calendar');
  const updateMatch=()=>{document.getElementById('match-fields').style.display=val('event-type')==='MATCH'?'grid':'none';};document.getElementById('event-type').onchange=()=>{updateMatch();refreshParticipants(true);};updateMatch();
  const teamSelect=document.getElementById('event-team'),competitionSelect=document.getElementById('event-competition-id');
  const syncEventTeams=(preferred='')=>{const divisionId=val('event-division'),scoped=teams.filter(t=>t.divisionId===divisionId);teamSelect.innerHTML='<option value="">Toda la división</option>'+scoped.map(t=>`<option value="${escapeHtml(t.teamId)}">${escapeHtml(t.name)}</option>`).join('');if(preferred&&scoped.some(t=>t.teamId===preferred))teamSelect.value=preferred;else if(!preferred&&scoped.length===1)teamSelect.value=scoped[0].teamId;else teamSelect.value='';};
  const syncEventCompetitions=(preferred='')=>{const divisionId=val('event-division'),teamId=val('event-team');const scoped=(d.competitions||[]).filter(c=>(c.status==='ACTIVE'||c.competitionId===e.competitionId)&&c.divisionId===divisionId&&(!c.teamId||c.teamId===teamId));competitionSelect.innerHTML='<option value="">— Sin competición configurada —</option>'+scoped.map(c=>`<option value="${escapeHtml(c.competitionId)}">${escapeHtml(competitionDisplayNameClient_(c))}${c.teamId?' · equipo':''}</option>`).join('');if(preferred&&scoped.some(c=>c.competitionId===preferred))competitionSelect.value=preferred;};
  const refreshParticipants=(preserve=true)=>{const current=preserve?currentEventParticipantSelection_():null;document.getElementById('event-participants-grid').innerHTML=eventEditorParticipants(e,val('event-division'),val('event-date'),current,val('event-type'),val('event-match-type'),val('event-competition-id'));wireParticipantRoleChoices_();};
  syncEventTeams(e.teamId||'');syncEventCompetitions(e.competitionId||'');wireParticipantRoleChoices_();
  const divisionDefaults=()=>{const d0=divs.find(x=>x.divisionId===val('event-division'))||{};return {single:{total:String(d0.defaultMatchMinutes||''),half:String(d0.defaultHalfMinutes||'')},triangular:{total:String(d0.triangularMatchMinutes||''),half:String(d0.triangularHalfMinutes||'')},quadrangular:{total:String(d0.quadrangularMatchMinutes||''),half:String(d0.quadrangularHalfMinutes||'')}};};
  let eventDurationSource=e.durationSource||'';
  const syncMatchFormat=(force=false)=>{const f=val('event-match-format')||'SINGLE',total=document.getElementById('event-match-duration'),half=document.getElementById('event-half-duration'),hint=document.getElementById('event-duration-hint'),dd=divisionDefaults();let rule=f==='TRIANGULAR'?dd.triangular:f==='QUADRANGULAR'?dd.quadrangular:dd.single;if(force){total.value=f==='SINGLE'?'':rule.total;half.value=f==='SINGLE'?'':rule.half;eventDurationSource=rule.total?'SEASON_RULE':'PENDING';}if(f==='SINGLE')hint.textContent=`Partido único: usa ${dd.single.total?(dd.single.total+' min'+(dd.single.half?' ('+dd.single.half+'+'+dd.single.half+')':'')):'la duración configurada en la división'} salvo que indiques una duración específica.`;else if(f==='TRIANGULAR')hint.textContent=rule.total?`Triangular: regla de la división ${rule.total} min${rule.half?' ('+rule.half+'+'+rule.half+')':''}.`:'Triangular detectado, pero esta división no tiene duración configurada.';else if(f==='QUADRANGULAR')hint.textContent=rule.total?`Cuadrangular: regla de la división ${rule.total} min${rule.half?' ('+rule.half+'+'+rule.half+')':''}.`:'Cuadrangular detectado, pero esta división no tiene duración configurada.';else hint.textContent='Personalizado: indica la duración real del encuentro.';};
  document.getElementById('event-division').addEventListener('change',()=>{syncEventTeams('');syncEventCompetitions('');refreshParticipants(false);syncMatchFormat(true);});
  document.getElementById('event-team').addEventListener('change',()=>{syncEventCompetitions('');refreshParticipants(true);});
  document.getElementById('event-date').addEventListener('change',()=>refreshParticipants(true));document.getElementById('event-match-type').addEventListener('change',()=>refreshParticipants(true));document.getElementById('event-competition-id').addEventListener('change',()=>refreshParticipants(true));
  document.getElementById('event-match-format').onchange=()=>syncMatchFormat(true);['event-match-duration','event-half-duration'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{eventDurationSource='MANUAL';}));syncMatchFormat(false);
  document.getElementById('cancel-event').onclick=renderCalendar;
  document.getElementById('event-form').onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{showMessage('Guardando actividad…');const payload={eventId:e.eventId||'',seasonId:e.seasonId||d.selectedSeasonId||d.activeSeasonId||'',eventType:val('event-type'),title:val('event-title'),status:e.eventId?(e.status||'SCHEDULED'):'SCHEDULED',divisionId:val('event-division'),teamId:val('event-team'),eventDate:val('event-date'),startTime:val('event-start'),endTime:val('event-end'),location:val('event-location'),opponent:val('event-opponent'),matchType:val('event-match-type'),competitionId:val('event-competition-id'),competition:e.competition||'',resultFor:val('event-result-for'),resultAgainst:val('event-result-against'),matchDurationMinutes:val('event-match-duration'),halfDurationMinutes:val('event-half-duration'),durationSource:val('event-match-duration')?(eventDurationSource||'MANUAL'):'',matchFormat:val('event-match-format'),notes:val('event-notes')};const saved=(await call('saveEvent',payload)).data;const participants=[];document.querySelectorAll('[data-event-person]:checked').forEach(ch=>participants.push({personId:ch.dataset.eventPerson,roleCategory:ch.dataset.eventRoleCategory}));await call('replaceEventParticipants',{eventId:saved.eventId,participants});invalidateCalendarCaches_();await renderCalendar();}catch(err){showMessage(err.message,'error');if(button)button.disabled=false;}};
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
  document.getElementById('entity-form').onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{showMessage('Guardando formato y duración…','info','editor-message');await call('updateEventMatchFormatDuration',{eventId:e.eventId,matchFormat:format.value,matchDurationMinutes:total.value,halfDurationMinutes:half.value});invalidateCalendarCaches_();showToast_('Formato y duración actualizados.');await renderEventDetail(e.eventId);}catch(err){showMessage(err.message,'error','editor-message');if(button)button.disabled=false;}};
}

function openOfficialLinksEditor_(e){
  if(!document.getElementById('editor-host')){const h=document.createElement('div');h.id='editor-host';(document.querySelector('.match-detail-panel')||document.getElementById('app')).appendChild(h);}
  const competitions=(calendarData?.competitions||[]).filter(c=>(c.status==='ACTIVE'||c.competitionId===e.competitionId)&&c.divisionId===e.divisionId&&(!c.teamId||c.teamId===e.teamId));
  const options='<option value="">— Sin competición configurada —</option>'+competitions.map(c=>`<option value="${escapeHtml(c.competitionId)}" ${c.competitionId===e.competitionId?'selected':''}>${escapeHtml(competitionDisplayNameClient_(c))}</option>`).join('');
  editorShell('Enlaces oficiales','Asociá el partido con su competición y, cuando estén disponibles, pegá los enlaces directos de MatchReady/FAR al partido y al PDF del acta.',`<div class="form-grid two"><label>Competición<select id="official-competition-id">${options}</select></label><label>ID externo del partido<input id="official-external-match-id" value="${escapeHtml(e.externalMatchId||'')}" maxlength="160" placeholder="Ej. 4842"></label><label>URL del partido oficial<input id="official-match-url" type="url" value="${escapeHtml(e.officialMatchUrl||'')}" placeholder="https://farugby.matchready.es/..."></label><label>URL del acta oficial / PDF<input id="official-report-url" type="url" value="${escapeHtml(e.officialReportUrl||'')}" placeholder="https://..."></label></div><div class="form-hint">Los enlaces son opcionales. Aunque todavía no exista el acta, podés dejar configurada la competición y completarla cuando FAR publique el partido.</div>`, 'Guardar enlaces');
  document.getElementById('entity-form').onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{showMessage('Guardando enlaces oficiales…','info','editor-message');await call('updateEventOfficialLinks',{eventId:e.eventId,competitionId:val('official-competition-id'),externalMatchId:val('official-external-match-id'),officialMatchUrl:val('official-match-url'),officialReportUrl:val('official-report-url')});invalidateCalendarCaches_();showToast_('Enlaces oficiales actualizados.');await renderEventDetail(e.eventId);}catch(err){showMessage(err.message,'error','editor-message');if(button)button.disabled=false;}};
}

function attendanceStatusLabel_(value){return ({PRESENT:'Presente',ADAPTED:'Adaptado',REHAB:'Rehabilitación',ABSENT:'Ausente',EXCUSED:'Justificado'})[value]||value||'Presente';}
function attendanceSelectHtml_(participant,editable){
  const status=participant.attendanceStatus||'PRESENT';
  if(!editable)return `<strong>${escapeHtml(attendanceStatusLabel_(status))}</strong>`;
  const player=(participant.roleCategory||participant.participantType)==='PLAYER';
  return `<select class="attendance-select" data-attendance="${escapeHtml(participant.eventParticipantId)}"><option value="PRESENT" ${status==='PRESENT'?'selected':''}>Presente</option>${player?`<option value="ADAPTED" ${status==='ADAPTED'?'selected':''}>Adaptado</option><option value="REHAB" ${status==='REHAB'?'selected':''}>Rehabilitación</option>`:''}<option value="ABSENT" ${status==='ABSENT'?'selected':''}>Ausente</option><option value="EXCUSED" ${status==='EXCUSED'?'selected':''}>Justificado</option></select>`;
}
function trainingAttendanceHtml_(parts,persons,event,canManage){
  const rows=(parts||[]).slice().sort((a,b)=>String(persons[a.personId]?.displayName||'').localeCompare(String(persons[b.personId]?.displayName||''),'es'));
  const players=rows.filter(p=>(p.roleCategory||p.participantType)==='PLAYER');
  const staff=rows.filter(p=>(p.roleCategory||p.participantType)!=='PLAYER'&&(p.roleCategory||p.participantType)!=='REFEREE');
  const referees=rows.filter(p=>(p.roleCategory||p.participantType)==='REFEREE');
  const countRows=list=>{const c={PRESENT:0,ADAPTED:0,REHAB:0,ABSENT:0,EXCUSED:0};list.forEach(p=>{const st=p.attendanceStatus||'PRESENT';c[st]=(c[st]||0)+1;});return c;};
  const playerCounts=countRows(players),staffCounts=countRows(staff),refCounts=countRows(referees);
  const roleLabel=p=>p.roleCategory==='COACH'?'Entrenador':p.roleCategory==='MANAGER'?'Manager / Delegado':p.roleCategory==='REFEREE'?'Árbitro':p.roleCategory==='COLLABORATOR'?'Colaborador':p.roleCategory==='COORDINATOR'?'Coordinador':'Staff';
  const closed=!!event.attendanceClosedAt,editable=!!canManage&&!closed;
  const table=(list,title,subtitle)=>`<section class="attendance-role-group"><div class="section-heading compact"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div><span class="badge">${list.length}</span></div>${list.length?`<div class="table-wrap"><table><thead><tr><th>Persona${title==='Jugadores'?'':' / rol'}</th><th>Asistencia real</th></tr></thead><tbody>${list.map(p=>`<tr><td><strong>${escapeHtml(persons[p.personId]?.displayName||p.personId)}</strong>${title==='Jugadores'?'':`<small>${escapeHtml(roleLabel(p))}</small>`}</td><td>${attendanceSelectHtml_(p,editable)}</td></tr>`).join('')}</tbody></table></div>`:emptyTable('Sin personas previstas en esta sección.')}</section>`;
  const statusText=closed?'Asistencia confirmada':'Pendiente de confirmar';
  const helpText=closed?'La asistencia quedó cerrada para conservar el histórico. Si necesitás corregirla, reabrila; la acción queda auditada.':'La disponibilidad previa ya está cerrada. Los previstos parten según esa foto; marcá lo que ocurrió realmente y confirmá cuando esté revisado.';
  const actions=!canManage?'':closed?`<div class="button-row"><button class="button secondary" id="reopen-training-attendance">Reabrir asistencia</button></div>`:`<div class="button-row"><button class="button primary" id="confirm-training-attendance">Confirmar asistencia</button></div>`;
  return `<section class="training-attendance"><div class="panel-heading"><div><h2>Asistencia al entrenamiento</h2><p>${escapeHtml(helpText)}</p></div>${closed?'<span class="status-pill active">'+statusText+'</span>':'<span class="status-pill warning">'+statusText+'</span>'}</div><div class="attendance-summary"><span><strong>${players.length}</strong> jugadores previstos</span><span><strong>${playerCounts.PRESENT||0}</strong> presentes</span><span><strong>${playerCounts.ADAPTED||0}</strong> adaptados</span><span><strong>${playerCounts.REHAB||0}</strong> rehabilitación</span><span><strong>${playerCounts.ABSENT||0}</strong> ausentes</span><span><strong>${playerCounts.EXCUSED||0}</strong> justificados</span></div>${table(players,'Jugadores','Asistencia deportiva de los jugadores.')}${table(staff,'Staff',`Presentes ${staffCounts.PRESENT||0} · Ausentes ${staffCounts.ABSENT||0} · Justificados ${staffCounts.EXCUSED||0}`)}${referees.length?table(referees,'Árbitro',`Presentes ${refCounts.PRESENT||0} · Ausentes ${refCounts.ABSENT||0} · Justificados ${refCounts.EXCUSED||0}`):''}${actions}</section>`;
}

function eventAvailabilityRoleLabelClient_(category){return ({PLAYER:'Jugador',COACH:'Entrenador',MANAGER:'Manager / Delegado',COLLABORATOR:'Colaborador',COORDINATOR:'Coordinador',REFEREE:'Árbitro'})[category]||category||'Otro';}
function eventAvailabilityRoleCategoriesClient_(person){
  const raw=Array.isArray(person?.availabilityRoleCategories)?person.availabilityRoleCategories:[person?.availabilityRoleCategory];
  return [...new Set(raw.map(x=>String(x||'').toUpperCase()).filter(Boolean))];
}
function eventAvailabilityStaffRoleTextClient_(person){
  const priority=['COACH','MANAGER','COLLABORATOR','COORDINATOR','REFEREE'];
  const cats=eventAvailabilityRoleCategoriesClient_(person).filter(x=>x!=='PLAYER').sort((a,b)=>priority.indexOf(a)-priority.indexOf(b));
  return cats.map(eventAvailabilityRoleLabelClient_).join(' · ')||eventAvailabilityRoleLabelClient_(person?.availabilityRoleCategory);
}
function availabilityRestrictionText_(effect,eventType){
  if(!effect)return 'Sin restricciones';
  const first=(effect.periods||[])[0],reason=effect.summary|| (first?(availabilityPeriodTypeLabelClient_(first.periodType)+(first.reason?' · '+first.reason:'')):'');
  if(effect.blocked){
    if(eventType==='MATCH')return `No seleccionable${reason?' · '+reason:''}`;
    if(effect.state==='ADAPTED')return `Entrenamiento adaptado${reason?' · '+reason:''}`;
    if(effect.state==='REHAB')return `Rehabilitación / recuperación${reason?' · '+reason:''}`;
    return `No participa${reason?' · '+reason:''}`;
  }
  if(effect.state==='ADAPTED')return `Entrenamiento adaptado${reason?' · '+reason:''}`;
  if(effect.state==='REHAB')return `Rehabilitación / recuperación${reason?' · '+reason:''}`;
  if(effect.possibleAbsence)return effect.scheduleConflictSummary||'Posible ausencia · designación arbitral FAR';
  return 'Sin restricciones';
}
function availabilitySurnameSortKey_(person){
  const p=person||{},last=String(p.lastName||'').trim(),display=String(p.displayName||'').trim();
  if(last)return last.toLocaleLowerCase('es');
  if(display.includes(','))return display.split(',')[0].trim().toLocaleLowerCase('es');
  const bits=display.split(/\s+/).filter(Boolean);return (bits.length>1?bits.slice(-2).join(' '):display).toLocaleLowerCase('es');
}
function availabilitySortPeople_(rows){return (rows||[]).slice().sort((a,b)=>availabilitySurnameSortKey_(a).localeCompare(availabilitySurnameSortKey_(b),'es')||String(a.displayName||'').localeCompare(String(b.displayName||''),'es'));}
function availabilityIsSportsLeave_(effect){return !!(effect?.isSportsLeave||(effect?.periods||[]).some(p=>String(p.periodType||'').toUpperCase()==='SPORTS_LEAVE'));}
function eventAvailabilityPreviewHtml_(data,event){
  if(!data||!event)return '';
  const candidates=data.candidates||[],effects=data.effects||{};
  const players=availabilitySortPeople_(candidates.filter(p=>eventAvailabilityRoleCategoriesClient_(p).includes('PLAYER')));
  const staff=availabilitySortPeople_(candidates.filter(p=>{const cats=eventAvailabilityRoleCategoriesClient_(p);return !cats.includes('PLAYER')&&cats.some(x=>['COACH','MANAGER','COLLABORATOR','COORDINATOR'].includes(x));}));
  const referees=availabilitySortPeople_(candidates.filter(p=>{const cats=eventAvailabilityRoleCategoriesClient_(p);return !cats.includes('PLAYER')&&!cats.some(x=>['COACH','MANAGER','COLLABORATOR','COORDINATOR'].includes(x))&&cats.includes('REFEREE');}));
  const available=players.filter(p=>{const eff=effects[p.personId]||{};return !availabilityIsSportsLeave_(eff)&&!eff.blocked;});
  const absences=players.filter(p=>{const eff=effects[p.personId]||{};return !availabilityIsSportsLeave_(eff)&&!!eff.blocked;});
  const injured=players.filter(p=>availabilityIsSportsLeave_(effects[p.personId]||{}));
  const possible=candidates.filter(p=>!!effects[p.personId]?.possibleAbsence);
  const nameList=(rows,empty)=>rows.length?`<ul class="availability-preview-list">${rows.map(p=>`<li>${escapeHtml(p.displayName||p.personId)}</li>`).join('')}</ul>`:`<p class="muted compact-copy">${escapeHtml(empty)}</p>`;
  const staffList=staff.length?`<ul class="availability-preview-list staff">${staff.map(p=>{const eff=effects[p.personId]||{};return `<li><span>${escapeHtml(p.displayName||p.personId)}</span><small>${escapeHtml(eventAvailabilityStaffRoleTextClient_(p))} · ${eff.blocked?'Ausente':eff.possibleAbsence?'⚠ Posible ausencia':'Disponible'}</small></li>`;}).join('')}</ul>`:'<p class="muted compact-copy">Sin staff en el alcance.</p>';
  const refereeList=referees.length?`<div class="availability-preview-referee"><h4>Árbitro</h4><ul class="availability-preview-list staff">${referees.map(p=>{const eff=effects[p.personId]||{};return `<li><span>${escapeHtml(p.displayName||p.personId)}</span><small>${eff.blocked?'Ausente':eff.possibleAbsence?'⚠ Posible ausencia':'Disponible'}</small></li>`;}).join('')}</ul></div>`:'';
  const open=!!data.isOpenForAvailability;
  return `<section class="availability-preview"><div class="panel-heading"><div><span class="eyebrow">Antes de la actividad</span><h2>Disponibilidad previa</h2><p>${open?'Se calcula automáticamente. Si necesitás cambiar una baja o ausencia, entrá en Gestionar disponibilidad.':'Foto congelada al comenzar la actividad. Desde este momento los cambios se registran en asistencia/participación real.'}</p></div><span class="status-pill ${open?'active':''}">${open?'Editable':'Cerrada'}</span></div><div class="attendance-summary"><span><strong>${players.length}</strong> jugadores</span><span><strong>${available.length}</strong> disponibles</span><span><strong>${absences.length}</strong> ausencias</span><span><strong>${injured.length}</strong> bajas</span><span><strong>${possible.length}</strong> posibles conflictos FAR</span></div><div class="availability-preview-grid"><div><h3>Disponibles</h3>${nameList(available,'Sin jugadores disponibles.')}</div><div><h3>Ausencias</h3>${nameList(absences,'Sin ausencias.')}</div><div><h3>Bajas / lesionados</h3>${nameList(injured,'Sin bajas activas.')}</div><div><h3>Staff</h3>${staffList}${refereeList}</div></div></section>`;
}
function clockToMinutes_(value){const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));return m?Number(m[1])*60+Number(m[2]):null;}
function minutesToClock_(value){if(value===null||value===undefined||Number.isNaN(Number(value)))return '';const v=((Number(value)%1440)+1440)%1440;return `${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;}
function trainingSessionComputedBlocks_(data){
  const e=data?.event||{},blocks=(data?.blocks||[]).slice().sort((a,b)=>Number(a.sortOrder||999)-Number(b.sortOrder||999));
  let cursor=clockToMinutes_(e.startTime);return blocks.map((b,index)=>{const duration=Math.max(0,Number(b.durationMinutes||0)),explicit=clockToMinutes_(b.startTime),start=explicit===null?cursor:explicit,end=start===null?null:start+duration;if(end!==null)cursor=end;return Object.assign({},b,{computedStartTime:start===null?'':minutesToClock_(start),computedEndTime:end===null?'':minutesToClock_(end),computedOrder:index+1});});
}
function trainingSessionPersonName_(data,id){return (data?.staff||[]).find(p=>p.personId===id)?.displayName||'';}
function trainingSessionExercise_(data,id){return (data?.exercises||[]).find(x=>x.exerciseId===id)||null;}
function trainingSessionPlanHtml_(data){
  const e=data?.event||{},blocks=trainingSessionComputedBlocks_(data),total=blocks.reduce((n,b)=>n+Number(b.durationMinutes||0),0),eventStart=clockToMinutes_(e.startTime),eventEnd=clockToMinutes_(e.endTime),eventMinutes=eventStart!==null&&eventEnd!==null?Math.max(0,eventEnd-eventStart):0;
  const previous=data?.previousTraining,manage=!!data?.canManage;
  const previousHint=previous?`<div class="info-strip"><strong>Último entrenamiento con plan:</strong> ${escapeHtml(previous.event?.title||'Entrenamiento')} · ${escapeHtml(previous.event?.eventDate||'')} · ${previous.blockCount||0} bloque(s).</div>`:'';
  const durationStatus=eventMinutes?`<span class="status-pill ${total>eventMinutes?'warning':'active'}">${total} / ${eventMinutes} min</span>`:`<span class="status-pill">${total} min planificados</span>`;
  const cards=blocks.map((b,index)=>{const ex=trainingSessionExercise_(data,b.exerciseId),responsible=trainingSessionPersonName_(data,b.responsiblePersonId),referee=trainingSessionPersonName_(data,b.refereePersonId),same=!!responsible&&!!referee&&b.responsiblePersonId===b.refereePersonId;const points=ex?trainingExerciseCoachingPoints_(ex).slice(0,3):[];return `<article class="training-plan-block" data-training-block="${escapeHtml(b.trainingBlockId)}"><div class="training-plan-time"><strong>${escapeHtml(b.computedStartTime||'—')}</strong><span>${escapeHtml(b.computedEndTime||'')}</span><small>${escapeHtml(String(b.durationMinutes||0))} min</small></div><div class="training-plan-main"><div class="training-plan-block-head"><div><span class="eyebrow">Bloque ${index+1}${ex?' · '+escapeHtml(trainingExerciseCategoryClient_(ex.category)):''}</span><h3>${escapeHtml(b.title||ex?.name||'Bloque')}</h3></div>${manage?`<div class="button-row compact-actions"><button class="button mini secondary" data-plan-move-up="${escapeHtml(b.trainingBlockId)}" ${index===0?'disabled':''}>↑</button><button class="button mini secondary" data-plan-move-down="${escapeHtml(b.trainingBlockId)}" ${index===blocks.length-1?'disabled':''}>↓</button><button class="button mini secondary" data-plan-edit="${escapeHtml(b.trainingBlockId)}">Editar</button><button class="button mini link danger-text" data-plan-delete="${escapeHtml(b.trainingBlockId)}">Borrar</button></div>`:''}</div>${ex?.objective?`<p>${escapeHtml(ex.objective)}</p>`:''}<div class="training-plan-meta">${b.groupName?`<span><strong>Grupo:</strong> ${escapeHtml(b.groupName)}</span>`:''}${responsible?`<span><strong>Responsable:</strong> ${escapeHtml(responsible)}</span>`:''}${referee?`<span><strong>Árbitro:</strong> ${escapeHtml(referee)}</span>`:''}</div>${same?'<div class="message warning compact-message">La misma persona figura como responsable y árbitro en este bloque.</div>':''}${points.length?`<ul class="exercise-points-preview">${points.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:''}${b.notes?`<p class="muted pre-line">${escapeHtml(b.notes)}</p>`:''}${ex?.videoUrl?`<a class="button mini link" href="${escapeHtml(ex.videoUrl)}" target="_blank" rel="noopener">Vídeo / enlace</a>`:''}</div></article>`;}).join('');
  return `<section class="training-plan-section"><div class="panel-heading"><div><span class="eyebrow">Planificación</span><h2>Plan del entrenamiento</h2><p>Construí la sesión por bloques reutilizando la biblioteca de ejercicios. La planificación queda en solo lectura cuando empieza el entrenamiento.</p></div>${durationStatus}</div>${previousHint}${manage?`<div class="button-row"><button class="button primary" id="new-training-block">Añadir bloque</button>${previous?'<button class="button secondary" id="copy-previous-training-plan">Copiar último entrenamiento</button>':''}<button class="button secondary" id="open-exercise-library">Biblioteca de ejercicios</button></div>`:''}${cards?`<div class="training-plan-timeline">${cards}</div>`:emptyTable(manage?'Todavía no hay bloques. Añadí el primero o copiá el último entrenamiento.':'Todavía no hay un plan cargado para este entrenamiento.')}${eventMinutes&&total>eventMinutes?`<div class="message warning">El plan suma ${total} min y supera en ${total-eventMinutes} min la duración del entrenamiento.</div>`:''}</section>`;
}
function nextTrainingBlockStart_(data){const blocks=trainingSessionComputedBlocks_(data);if(blocks.length)return blocks[blocks.length-1].computedEndTime||data?.event?.startTime||'';return data?.event?.startTime||'';}
function openTrainingBlockEditor_(eventId,data,block={}){
  const exercises=data?.exercises||[],staff=data?.staff||[],currentExercise=trainingSessionExercise_(data,block.exerciseId),computedCurrent=trainingSessionComputedBlocks_(data).find(x=>x.trainingBlockId===block.trainingBlockId),defaultStart=block.startTime||computedCurrent?.computedStartTime||nextTrainingBlockStart_(data),duration=block.durationMinutes||currentExercise?.recommendedDurationMinutes||'10';
  const exOptions='<option value="">Bloque libre / sin ejercicio</option>'+exercises.map(ex=>`<option value="${escapeHtml(ex.exerciseId)}" ${ex.exerciseId===block.exerciseId?'selected':''}>${escapeHtml(ex.name)} · ${escapeHtml(trainingExerciseCategoryClient_(ex.category))}</option>`).join('');
  const staffOptions='<option value="">— Sin asignar —</option>'+staff.map(p=>`<option value="${escapeHtml(p.personId)}">${escapeHtml(p.displayName)}</option>`).join('');
  editorShell(block.trainingBlockId?'Editar bloque':'Nuevo bloque','El responsable y la persona que arbitra son opcionales. Si coinciden, se mostrará una advertencia en el plan.',`<div class="form-grid two"><label>Ejercicio<select id="plan-exercise">${exOptions}</select></label><label>Nombre del bloque<input id="plan-title" maxlength="160" value="${escapeHtml(block.title||currentExercise?.name||'')}"></label><label>Hora inicio<input id="plan-start" type="time" value="${escapeHtml(defaultStart)}"></label><label>Duración (min)<input id="plan-duration" type="number" min="1" max="240" required value="${escapeHtml(duration)}"></label><label>Responsable<select id="plan-responsible">${staffOptions}</select></label><label>Árbitro / oposición arbitral<select id="plan-referee">${staffOptions}</select></label><label>Grupo / unidad<input id="plan-group" maxlength="120" value="${escapeHtml(block.groupName||'')}" placeholder="Ej. delanteros, backs, grupo 1"></label></div><label>Observaciones del bloque<textarea id="plan-notes" rows="3" maxlength="1200" placeholder="Ajustes específicos para esta sesión">${escapeHtml(block.notes||'')}</textarea></label>`,'Guardar bloque');
  document.getElementById('plan-responsible').value=block.responsiblePersonId||'';document.getElementById('plan-referee').value=block.refereePersonId||'';
  const exSelect=document.getElementById('plan-exercise');exSelect.onchange=()=>{const ex=trainingSessionExercise_(data,exSelect.value);if(!ex)return;const title=document.getElementById('plan-title'),dur=document.getElementById('plan-duration');if(!title.value.trim())title.value=ex.name||'';if(!dur.value&&ex.recommendedDurationMinutes)dur.value=ex.recommendedDurationMinutes;};
  document.getElementById('entity-form').onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{await call('saveTrainingSessionBlock',{eventId,trainingBlockId:block.trainingBlockId||'',exerciseId:val('plan-exercise'),title:val('plan-title'),startTime:val('plan-start'),durationMinutes:val('plan-duration'),responsiblePersonId:val('plan-responsible'),refereePersonId:val('plan-referee'),groupName:val('plan-group'),notes:val('plan-notes'),sortOrder:block.sortOrder||''});showToast_('Bloque guardado.');await renderEventDetail(eventId,'plan');}catch(err){showMessage(err.message,'error','editor-message');if(button)button.disabled=false;}};
}
function wireTrainingSessionPlan_(eventId,data){
  document.getElementById('new-training-block')?.addEventListener('click',()=>openTrainingBlockEditor_(eventId,data,{}));
  document.getElementById('open-exercise-library')?.addEventListener('click',()=>renderTrainingExercises());
  document.getElementById('copy-previous-training-plan')?.addEventListener('click',async()=>{const has=(data.blocks||[]).length>0;if(has&&!confirm('El plan actual será reemplazado por el último entrenamiento. ¿Continuar?'))return;try{await call('copyPreviousTrainingSessionPlan',{eventId,overwrite:has});showToast_('Plan anterior copiado.');await renderEventDetail(eventId,'plan');}catch(err){showMessage(err.message,'error');}});
  document.querySelectorAll('[data-plan-edit]').forEach(btn=>btn.onclick=()=>{const block=(data.blocks||[]).find(x=>x.trainingBlockId===btn.dataset.planEdit);if(block)openTrainingBlockEditor_(eventId,data,block);});
  document.querySelectorAll('[data-plan-delete]').forEach(btn=>btn.onclick=async()=>{if(!confirm('¿Borrar este bloque del entrenamiento?'))return;try{await call('deleteTrainingSessionBlock',{eventId,trainingBlockId:btn.dataset.planDelete});showToast_('Bloque eliminado.');await renderEventDetail(eventId,'plan');}catch(err){showMessage(err.message,'error');}});
  const move=async(id,delta)=>{const ids=(data.blocks||[]).slice().sort((a,b)=>Number(a.sortOrder||999)-Number(b.sortOrder||999)).map(x=>x.trainingBlockId),i=ids.indexOf(id),j=i+delta;if(i<0||j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];try{await call('reorderTrainingSessionBlocks',{eventId,trainingBlockIds:ids});await renderEventDetail(eventId,'plan');}catch(err){showMessage(err.message,'error');}};
  document.querySelectorAll('[data-plan-move-up]').forEach(btn=>btn.onclick=()=>move(btn.dataset.planMoveUp,-1));
  document.querySelectorAll('[data-plan-move-down]').forEach(btn=>btn.onclick=()=>move(btn.dataset.planMoveDown,1));
}

async function renderEventAvailability(eventId){
  try{
    const {data}=await call('getEventAvailabilityData',{eventId});const e=data.event,candidates=data.candidates||[];
    let matchTabState=null;if(e.eventType==='MATCH'){try{matchTabState=(await call('getMatchSectionState',{eventId})).data;}catch(ignore){matchTabState=null;}}
    const players=availabilitySortPeople_(candidates.filter(p=>eventAvailabilityRoleCategoriesClient_(p).includes('PLAYER')));
    const staff=availabilitySortPeople_(candidates.filter(p=>{const cats=eventAvailabilityRoleCategoriesClient_(p);return !cats.includes('PLAYER')&&cats.some(x=>['COACH','MANAGER','COLLABORATOR','COORDINATOR'].includes(x));}));
    const referees=availabilitySortPeople_(candidates.filter(p=>{const cats=eventAvailabilityRoleCategoriesClient_(p);return !cats.includes('PLAYER')&&!cats.some(x=>['COACH','MANAGER','COLLABORATOR','COORDINATOR'].includes(x))&&cats.includes('REFEREE');}));
    const availablePlayers=availabilitySortPeople_(players.filter(p=>{const eff=data.effects?.[p.personId]||{};return !availabilityIsSportsLeave_(eff)&&!eff.blocked;}));
    const absentPlayers=availabilitySortPeople_(players.filter(p=>{const eff=data.effects?.[p.personId]||{};return !availabilityIsSportsLeave_(eff)&&!!eff.blocked;}));
    const injuredPlayers=availabilitySortPeople_(players.filter(p=>availabilityIsSportsLeave_(data.effects?.[p.personId]||{})));
    const possibleConflictPeople=availabilitySortPeople_(candidates.filter(p=>!!data.effects?.[p.personId]?.possibleAbsence));
    const activeSportsLeave=eff=>(eff?.periods||[]).find(x=>String(x.periodType||'').toUpperCase()==='SPORTS_LEAVE'&&x.availabilityPeriodId);
    const playerRow=p=>{const eff=data.effects?.[p.personId]||{state:'NORMAL',blocked:false},blocked=!!eff.blocked,possible=!!eff.possibleAbsence,leave=activeSportsLeave(eff);
      const stateLabel=blocked?(e.eventType==='MATCH'?'No seleccionable':'No participa'):(eff.state==='ADAPTED'?'Adaptado':eff.state==='REHAB'?'Rehabilitación':possible?'Posible ausencia':'Disponible');
      const stateClass=blocked?'danger':(eff.state==='ADAPTED'||eff.state==='REHAB'||possible?'warning':'active');
      let action='—';
      if(data.canEditAvailability){
        if(leave)action=`<div class="inline-actions"><button class="button mini secondary" data-edit-leave="${escapeHtml(p.personId)}" data-period-id="${escapeHtml(leave.availabilityPeriodId)}">Ver / editar baja</button><button class="button mini secondary" data-end-leave="${escapeHtml(leave.availabilityPeriodId)}" data-person-id="${escapeHtml(p.personId)}">Dar alta</button><button class="button mini secondary" data-new-event-absence="${escapeHtml(p.personId)}">Registrar ausencia</button></div>`;
        else action=`<button class="button mini secondary" data-new-event-period="${escapeHtml(p.personId)}">Registrar baja / ausencia</button>`;
      }
      return `<tr class="${blocked?'availability-blocked-row':''}"><td><strong>${escapeHtml(p.displayName||p.personId)}</strong></td><td><span class="status-pill ${stateClass}">${escapeHtml(stateLabel)}</span></td><td><small>${escapeHtml(availabilityRestrictionText_(eff,e.eventType))}</small></td><td>${action}</td></tr>`;
    };
    const playerSection=(title,subtitle,rows,kind)=>`<section class="availability-group ${kind||''}"><div class="section-heading compact"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div><span class="badge">${rows.length}</span></div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Jugador</th><th>Estado</th><th>Motivo / modalidad</th><th></th></tr></thead><tbody>${rows.map(playerRow).join('')}</tbody></table></div>`:emptyTable('Sin personas en esta sección.')}</section>`;
    const staffRows=(rows,isReferee=false)=>rows.map(p=>{const eff=data.effects?.[p.personId]||{blocked:false},punctual=!!eff.eventStaffAbsent,blocked=!!eff.blocked,possible=!!eff.possibleAbsence,role=eventAvailabilityStaffRoleTextClient_(p);
      let action='—';if(data.canEditAvailability){if(punctual)action=`<button class="button mini secondary" data-staff-absence="${escapeHtml(p.personId)}" data-absent="false">Quitar ausencia</button>`;else if(!blocked)action=`<button class="button mini secondary" data-staff-absence="${escapeHtml(p.personId)}" data-absent="true">Marcar ausencia</button>`;else action='<small>Ausencia registrada</small>';}
      const status=blocked?'<span class="status-pill danger">Ausente</span>':possible?'<span class="status-pill warning">Posible ausencia</span>':'<span class="status-pill success">Disponible</span>';
      return `<tr class="${blocked?'availability-blocked-row':''}"><td><strong>${escapeHtml(p.displayName||p.personId)}</strong></td>${isReferee?'':`<td>${escapeHtml(role)}</td>`}<td>${status}</td><td><small>${possible||blocked?escapeHtml(availabilityRestrictionText_(eff,e.eventType)):'Disponible por defecto'}</small></td><td>${action}</td></tr>`;
    }).join('');
    const staffSection=staff.length?`<section class="availability-group staff-group"><div class="section-heading compact"><div><h3>Staff</h3><p>Cada persona aparece una sola vez aunque tenga varios cargos. Disponibles por defecto; solo se marca la ausencia para esta actividad.</p></div><span class="badge">${staff.length}</span></div><div class="table-wrap"><table><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Detalle</th><th></th></tr></thead><tbody>${staffRows(staff,false)}</tbody></table></div></section>`:'';
    const refereeSection=referees.length?`<section class="availability-group staff-group"><div class="section-heading compact"><div><h3>Árbitro</h3><p>Solo para entrenamientos y partidos amistosos/actividades manuales. En liga oficial la designación viene de FAR.</p></div><span class="badge">${referees.length}</span></div><div class="table-wrap"><table><thead><tr><th>Persona</th><th>Estado</th><th>Detalle</th><th></th></tr></thead><tbody>${staffRows(referees,true)}</tbody></table></div></section>`:'';
    const header=e.eventType==='MATCH'?matchHeaderHtml_(e,(calendarData?.leagueMeta||[]).find(m=>m.eventId===e.eventId)||null,{compact:true}):activityHeaderHtml_(e,null);
    const open=!!data.isOpenForAvailability;
    const modeText=open?'Jugadores activos disponibles por defecto. Las bajas y ausencias los excluyen automáticamente; una designación arbitral FAR se muestra como posible ausencia hasta que se confirme. Para el staff solo se marca la ausencia puntual.':'La actividad ya comenzó. La disponibilidad previa está congelada y se muestra solo como histórico; cualquier diferencia real se registra en asistencia o participación.';
    const tabs=['MATCH','TRAINING'].includes(e.eventType)?eventWorkspaceTabsHtml_(e,'availability',{summaryExists:!!matchTabState?.summaryExists,summaryVisible:!!matchTabState?.summaryVisible,attendanceExists:e.eventType==='TRAINING'&&['IN_PROGRESS','COMPLETED'].includes(e.status),officialLinks:e.eventType==='MATCH'&&!!currentAccessProfile_().capabilities?.manageCompetitions,refereeView:e.eventType==='MATCH'&&!!currentAccessProfile_().isAdmin&&eventHasClubRefereeClient_(eventId)}):'';
    shell(`${header}<section class="panel">${tabs}<div class="panel-heading"><div><h2>${open?'Disponibilidad':'Disponibilidad previa'}</h2><p>${escapeHtml(modeText)}</p></div>${open?'<span class="status-pill active">Abierta</span>':'<span class="status-pill">Cerrada</span>'}</div><div class="attendance-summary"><span><strong>${players.length}</strong> jugadores</span><span><strong>${availablePlayers.length}</strong> disponibles</span><span><strong>${absentPlayers.length}</strong> ausencias</span><span><strong>${injuredPlayers.length}</strong> lesionados / baja</span><span><strong>${possibleConflictPeople.length}</strong> posibles conflictos FAR</span></div>${playerSection('Jugadores disponibles','Ordenados por apellido de A a Z.',availablePlayers,'available')}${absentPlayers.length?playerSection('Ausencias','Ausencias vigentes para esta actividad.',absentPlayers,'absent'):''}${injuredPlayers.length?playerSection('Lesionados / baja deportiva','Se muestran al final. La baja puede editarse o finalizarse antes de la fecha prevista; además puede coexistir con una ausencia.',injuredPlayers,'injured'):''}<div class="section-divider"></div>${staffSection||emptyTable('No hay staff en el alcance de esta actividad.')}${refereeSection}<div id="editor-host"></div><div class="button-row"><button class="button secondary" id="availability-back">Volver al calendario</button></div><div id="message" class="message"></div></section>`,'calendar');
    document.getElementById('availability-back').onclick=renderCalendar;wireEventWorkspaceTabs_(eventId,e,{summaryExists:!!matchTabState?.summaryExists,summaryVisible:!!matchTabState?.summaryVisible,attendanceExists:e.eventType==='TRAINING'&&['IN_PROGRESS','COMPLETED'].includes(e.status),officialLinks:e.eventType==='MATCH'&&!!currentAccessProfile_().capabilities?.manageCompetitions,refereeView:e.eventType==='MATCH'&&!!currentAccessProfile_().isAdmin&&eventHasClubRefereeClient_(eventId)});
    document.querySelectorAll('[data-new-event-period]').forEach(btn=>btn.onclick=()=>{const person=candidates.find(p=>p.personId===btn.dataset.newEventPeriod);showAvailabilityPeriodEditor_(person,{eventId,onDone:()=>renderEventAvailability(eventId),onCancel:()=>renderEventAvailability(eventId)});});
    document.querySelectorAll('[data-new-event-absence]').forEach(btn=>btn.onclick=()=>{const person=candidates.find(p=>p.personId===btn.dataset.newEventAbsence),date=e.eventDate||new Date().toISOString().slice(0,10);showAvailabilityPeriodEditor_(person,{eventId,period:{periodType:'PERSONAL',startDate:date,endDate:date,affectsTraining:e.eventType==='TRAINING'?'TRUE':'FALSE',affectsMatches:e.eventType==='MATCH'?'TRUE':'FALSE',trainingMode:'UNAVAILABLE',matchSelectable:'FALSE'},onDone:()=>renderEventAvailability(eventId),onCancel:()=>renderEventAvailability(eventId)});});
    document.querySelectorAll('[data-edit-leave]').forEach(btn=>btn.onclick=()=>{const person=candidates.find(p=>p.personId===btn.dataset.editLeave),eff=data.effects?.[btn.dataset.editLeave]||{},period=(eff.periods||[]).find(x=>x.availabilityPeriodId===btn.dataset.periodId);showAvailabilityPeriodEditor_(person,{eventId,period,onDone:()=>renderEventAvailability(eventId),onCancel:()=>renderEventAvailability(eventId)});});
    document.querySelectorAll('[data-end-leave]').forEach(btn=>btn.onclick=async()=>{const person=candidates.find(p=>p.personId===btn.dataset.personId),today=new Date().toISOString().slice(0,10),availableFrom=prompt(`¿Desde qué fecha vuelve a estar disponible ${person?.displayName||'el jugador'}? (AAAA-MM-DD)`,today);if(!availableFrom)return;try{await call('endAvailabilityPeriod',{availabilityPeriodId:btn.dataset.endLeave,availableFromDate:availableFrom});showToast_('Baja finalizada.');await renderEventAvailability(eventId);}catch(err){showMessage(err.message,'error');}});
    document.querySelectorAll('[data-staff-absence]').forEach(btn=>btn.onclick=async()=>{try{const person=candidates.find(p=>p.personId===btn.dataset.staffAbsence),absent=btn.dataset.absent==='true';await call('setEventStaffAbsence',{eventId,personId:btn.dataset.staffAbsence,absent,comment:absent?'Ausencia marcada por el staff':''});showToast_(`${person?.displayName||'Persona'}: ${absent?'ausencia registrada':'ausencia quitada'}.`,'success',2200);await renderEventAvailability(eventId);}catch(err){showMessage(err.message,'error');}});
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudo cargar la disponibilidad</h1><p>${escapeHtml(err.message)}</p><button class="button secondary" id="availability-error-back">Volver</button></section>`,'calendar');document.getElementById('availability-error-back')?.addEventListener('click',()=>renderEventDetail(eventId));}
}

function renderExternalRefereeMatchDetail_(e,d){
  const meta=(d.leagueMeta||[]).find(m=>m.eventId===e.eventId)||{},persons=Object.fromEntries((d.persons||[]).map(p=>[p.personId,p]));
  const refereeRow=(d.participants||[]).find(p=>p.eventId===e.eventId&&String(p.roleCategory||p.participantType||'').toUpperCase()==='REFEREE');
  const referee=refereeRow?(persons[refereeRow.personId]||{}):{},competition=competitionForEvent_(e),links=competitionLinkButtons_(competition,e),occ=e.refereeOccupation||null;
  const competitionName=meta.calendarCategory||meta.calendarCompetition||e.competition||'—',canManageOcc=currentUser?.role==='ADMIN'||!!d.accessProfile?.capabilities?.manageRefereeAssignments;
  const occupationHtml=occ?.known?`<div class="info-strip"><div><strong>Disponibilidad comprometida estimada: ${escapeHtml(occ.startTime)}–${escapeHtml(occ.endTime)} (${escapeHtml(refereeOccupationDurationLabelClient_(occ.durationMinutes))})</strong><br>Viaje ida ${escapeHtml(String(occ.travelEachWay))} min · llegada previa ${escapeHtml(String(occ.arrivalBeforeMinutes))} min · partido ${escapeHtml(String(occ.playingMinutes))}${occ.halftimeMinutes?` + ${escapeHtml(String(occ.halftimeMinutes))} min de descanso`:''} · posterior/comida ${escapeHtml(String(occ.postMatchMinutes))} min · viaje vuelta ${escapeHtml(String(occ.travelEachWay))} min. Esta franja solo se usa para conflictos y posibles ausencias; el Calendario muestra únicamente el partido.</div></div>`:`<div class="info-strip"><div><strong>Ocupación estimada pendiente</strong><br>Falta el horario oficial del partido; mientras tanto se tratará como posible conflicto si coincide el día.</div></div>`;
  const profile=String(occ?.profileOverride||e.refereeTravelProfile||'AUTO').toUpperCase();
  const overrideHtml=canManageOcc?`<div class="section-divider"></div><div class="section-heading"><h3>Ajustar desplazamiento</h3><p>Solo modifica la ventana de ocupación de esta designación FAR. No cambia la hora oficial del partido.</p></div><form id="ref-occ-event-form" class="form-grid two"><label>Tipo de desplazamiento<select id="ref-occ-event-profile"><option value="AUTO" ${profile==='AUTO'?'selected':''}>Automático</option><option value="LOCAL" ${profile==='LOCAL'?'selected':''}>Local / mismo club</option><option value="NEAR" ${profile==='NEAR'?'selected':''}>Cercano</option><option value="NORMAL" ${profile==='NORMAL'?'selected':''}>Normal</option><option value="LONG" ${profile==='LONG'?'selected':''}>Largo</option><option value="CUSTOM" ${profile==='CUSTOM'?'selected':''}>Personalizado</option></select></label><label>Viaje por trayecto (min, solo personalizado)<input id="ref-occ-event-custom" type="number" min="0" max="480" value="${escapeHtml(String(e.refereeTravelMinutesEachWay||occ?.travelEachWay||120))}"></label><div class="full"><small>Perfil aplicado actualmente: ${escapeHtml(refereeOccupationProfileLabelClient_(occ?.profile||profile))}.</small></div><div class="full button-row"><button class="button primary" type="submit">Guardar ocupación</button></div></form><div id="ref-occ-event-message" class="message"></div>`:'';
  shell(`<section class="match-overview compact"><div class="match-overview-title"><span class="eyebrow">Designación arbitral · FAR</span><h1>${escapeHtml(e.title||'Partido')}</h1></div><div class="match-overview-card"><div class="match-overview-primary"><div class="match-info competition"><span>Competición</span><strong>${escapeHtml(competitionName)}</strong>${meta.calendarCompetition&&meta.calendarCompetition!==competitionName?`<small>${escapeHtml(meta.calendarCompetition)}</small>`:''}</div><div class="match-info"><span>Jornada</span><strong>${escapeHtml(meta.roundName||'—')}</strong></div><div class="match-info"><span>Fecha</span><strong>${escapeHtml(e.eventDate||'—')}</strong></div><div class="match-info"><span>Hora del partido</span><strong>${escapeHtml(displayEventTime_(e)||'Pendiente')}</strong></div><div class="match-info"><span>Árbitro</span><strong>${escapeHtml(referee.displayName||meta.refereeName||'—')}</strong></div><div class="match-info"><span>Origen</span><strong>FAR / MatchReady</strong></div></div><div class="match-overview-location"><span>Ubicación</span><strong>${escapeHtml(e.location||'Pendiente')}</strong></div>${links?`<div class="official-link-bar"><span>Fuente oficial</span><div class="button-row">${links}</div></div>`:''}</div></section><section class="panel match-detail-panel">${occupationHtml}<div class="info-strip"><div><strong>Partido externo por designación arbitral</strong><br>Esta actividad se muestra al árbitro designado, al Coordinador de Árbitros y a Administración. No forma parte de las estadísticas deportivas de Marbella.</div></div>${overrideHtml}<div class="button-row"><button class="button secondary" id="back-calendar">Volver al calendario</button></div></section>`,'calendar');
  document.getElementById('back-calendar').onclick=renderCalendar;
  const form=document.getElementById('ref-occ-event-form');if(form)form.onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{await call('saveRefereeOccupancyOverride',{eventId:e.eventId,refereeTravelProfile:val('ref-occ-event-profile'),refereeTravelMinutesEachWay:val('ref-occ-event-custom')});invalidateCalendarCaches_();showToast_('Ocupación de la designación actualizada.');calendarData=null;await renderEventDetail(e.eventId);}catch(err){showMessage(userErrorText_(err),'error','ref-occ-event-message');if(button)button.disabled=false;}};
}


function refereeMatchTabsHtml_(active){
  return `<nav class="event-section-tabs button-row" aria-label="Área arbitral"><button class="button ${active==='summary'?'primary':'secondary'}" data-referee-tab="summary">Resumen</button><button class="button ${active==='pre'?'primary':'secondary'}" data-referee-tab="pre">Pre-partido</button><button class="button ${active==='post'?'primary':'secondary'}" data-referee-tab="post">Post-partido</button><button class="button ${active==='documents'?'primary':'secondary'}" data-referee-tab="documents">Documentos</button><button class="button ${active==='links'?'primary':'secondary'}" data-referee-tab="links">Enlaces</button></nav>`;
}
function refereeMatchFocusOptions_(){return ['Comunicación','Posicionamiento','Ventaja','Breakdown','Scrum','Line-out','Espacios','Juego peligroso','Gestión del partido'];}
function refereeMatchFocusValues_(workflow){try{return JSON.parse(workflow?.postFocusJson||'[]')||[];}catch(_){return [];}}
function refereeReadOnly_(disabled){return disabled?' disabled':'';}
function refereeMatchSummaryHtml_(data){
  const e=data.event||{},w=data.workflow||{},occ=data.occupation,origin=data.origin==='FAR'?'FAR / MatchReady':'Club',external=!!data.externalMatch;
  const occupation=data.origin==='FAR'?(occ?.known?`<div class="info-strip"><div><strong>Disponibilidad comprometida estimada: ${escapeHtml(occ.startTime)}–${escapeHtml(occ.endTime)} (${escapeHtml(refereeOccupationDurationLabelClient_(occ.durationMinutes))})</strong><br>La franja ampliada se usa únicamente para conflictos y posibles ausencias. En el calendario se muestra solo el horario del partido.</div></div>`:`<div class="info-strip"><div><strong>Ocupación estimada pendiente</strong><br>Falta el horario necesario para calcular desplazamiento, previa y regreso.</div></div>`):`<div class="info-strip"><div><strong>Designación interna del club</strong><br>La ocupación arbitral coincide con el horario real del partido; no se añade desplazamiento automático.</div></div>`;
  return `${occupation}<div class="dashboard-summary-grid"><article class="panel"><span class="eyebrow">Árbitro</span><h3>${escapeHtml(data.referee?.displayName||'—')}</h3><p>${escapeHtml(origin)}</p></article><article class="panel"><span class="eyebrow">Pre-partido</span><h3>${escapeHtml(w.preStatus==='COMPLETED'?'Completado':w.preStatus==='DRAFT'?'Borrador':'Pendiente')}</h3><p>${w.preCompletedAt?escapeHtml(formatAppDateTime_(w.preCompletedAt)):'Preparación arbitral'}</p></article><article class="panel"><span class="eyebrow">Post-partido</span><h3>${escapeHtml(w.postStatus==='COMPLETED'?'Completado':w.postStatus==='DRAFT'?'Borrador':'Pendiente')}</h3><p>${w.postCompletedAt?escapeHtml(formatAppDateTime_(w.postCompletedAt)):'Seguimiento arbitral'}</p></article></div><div class="info-strip"><div><strong>${external?'Partido externo seguido por designación arbitral':'Vista arbitral del mismo partido del club'}</strong><br>${external?'No tiene convocatoria, disponibilidad de jugadores ni acta deportiva de Marbella.':'Jugadores y staff de Marbella conservan su flujo deportivo normal; esta vista es exclusiva del árbitro y Coordinación de Árbitros.'}</div></div>`;
}
function refereeMatchPreHtml_(data){
  const w=data.workflow||{},disabled=!data.canEditPre,far=data.origin==='FAR';
  return `<section><div class="section-heading"><div><span class="eyebrow">Preparación arbitral</span><h2>Pre-partido</h2><p>Preparación personal del árbitro. Coordinación puede consultarla, pero el contenido pertenece al árbitro designado.</p></div><span class="status-pill ${w.preStatus==='COMPLETED'?'active':'warning'}">${escapeHtml(w.preStatus==='COMPLETED'?'Completado':w.preStatus==='DRAFT'?'Borrador':'Pendiente')}</span></div><form id="referee-pre-form" class="form-grid two">${far?`<label>Hora prevista de salida<input id="ref-pre-departure" type="time" value="${escapeHtml(w.departureTime||data.occupation?.startTime||'')}"${refereeReadOnly_(disabled)}></label><label>Hora objetivo de llegada<input id="ref-pre-arrival" type="time" value="${escapeHtml(w.targetArrivalTime||'')}"${refereeReadOnly_(disabled)}></label><label class="full">Logística / desplazamiento<textarea id="ref-pre-travel" rows="2"${refereeReadOnly_(disabled)}>${escapeHtml(w.travelNotes||'')}</textarea></label>`:''}<label class="full">Objetivo personal<textarea id="ref-pre-objective" rows="2"${refereeReadOnly_(disabled)}>${escapeHtml(w.preObjective||'')}</textarea></label><label class="full">Aspectos técnicos en los que poner foco<textarea id="ref-pre-focus" rows="2"${refereeReadOnly_(disabled)}>${escapeHtml(w.preFocus||'')}</textarea></label><label>Estado físico<select id="ref-pre-physical"${refereeReadOnly_(disabled)}><option value="">Sin indicar</option><option value="OK" ${w.prePhysicalStatus==='OK'?'selected':''}>OK</option><option value="MINOR_DISCOMFORT" ${w.prePhysicalStatus==='MINOR_DISCOMFORT'?'selected':''}>Molestias leves</option><option value="LIMITED" ${w.prePhysicalStatus==='LIMITED'?'selected':''}>Condicionado</option></select></label><label class="full">Observaciones previas<textarea id="ref-pre-notes" rows="3"${refereeReadOnly_(disabled)}>${escapeHtml(w.preNotes||'')}</textarea></label>${data.canEditPre?`<div class="full button-row"><button class="button secondary" type="submit" data-complete="false">Guardar borrador</button><button class="button primary" type="submit" data-complete="true">Completar preparación</button></div>`:`<div class="full form-hint">${data.canEdit?'La preparación queda cerrada al comenzar el partido.':'Vista de consulta para Coordinación de Árbitros.'}</div>`}</form><div id="referee-workflow-message" class="message"></div></section>`;
}
function refereeMatchPostHtml_(data){
  const w=data.workflow||{},disabled=!data.canEditPost,selected=refereeMatchFocusValues_(w);
  const checks=refereeMatchFocusOptions_().map(x=>`<label class="checkbox-row"><input type="checkbox" data-ref-post-focus value="${escapeHtml(x)}" ${selected.includes(x)?'checked':''}${refereeReadOnly_(disabled)}><span>${escapeHtml(x)}</span></label>`).join('');
  return `<section><div class="section-heading"><div><span class="eyebrow">Seguimiento arbitral</span><h2>Post-partido</h2><p>Autoevaluación breve para construir histórico y evolución del área arbitral.</p></div><span class="status-pill ${w.postStatus==='COMPLETED'?'active':'warning'}">${escapeHtml(w.postStatus==='COMPLETED'?'Completado':w.postStatus==='DRAFT'?'Borrador':'Pendiente')}</span></div><form id="referee-post-form" class="form-grid two"><label>Partido realizado<select id="ref-post-played"${refereeReadOnly_(disabled)}><option value="">Sin indicar</option><option value="YES" ${w.matchPlayed==='YES'?'selected':''}>Sí</option><option value="NO" ${w.matchPlayed==='NO'?'selected':''}>No</option><option value="CANCELLED" ${w.matchPlayed==='CANCELLED'?'selected':''}>Suspendido / cancelado</option></select></label><label>Valoración general (1–10)<input id="ref-post-rating" type="number" min="1" max="10" value="${escapeHtml(w.postRating||'')}"${refereeReadOnly_(disabled)}></label><div class="full"><span class="form-label">Focos del partido</span><div class="checkbox-grid">${checks}</div></div><label class="full">Qué salió bien<textarea id="ref-post-good" rows="3"${refereeReadOnly_(disabled)}>${escapeHtml(w.postWentWell||'')}</textarea></label><label class="full">Qué mejoraría<textarea id="ref-post-improve" rows="3"${refereeReadOnly_(disabled)}>${escapeHtml(w.postImprove||'')}</textarea></label><label class="full">Situaciones a revisar<textarea id="ref-post-review" rows="3"${refereeReadOnly_(disabled)}>${escapeHtml(w.postReviewSituations||'')}</textarea></label><label class="full">Incidencias relevantes<textarea id="ref-post-incidents" rows="3"${refereeReadOnly_(disabled)}>${escapeHtml(w.postIncidents||'')}</textarea></label><label class="full">Comentario adicional<textarea id="ref-post-notes" rows="3"${refereeReadOnly_(disabled)}>${escapeHtml(w.postNotes||'')}</textarea></label>${data.canEditPost?`<div class="full button-row"><button class="button secondary" type="submit" data-complete="false">Guardar borrador</button><button class="button primary" type="submit" data-complete="true">Completar seguimiento</button></div>`:`<div class="full form-hint">${data.canEdit?'El seguimiento se habilita cuando comienza el partido.':'Vista de consulta para Coordinación de Árbitros.'}</div>`}</form><div id="referee-workflow-message" class="message"></div></section>`;
}
function refereeMatchDocumentsHtml_(data){
  const doc=data.officialDocument;
  if(!doc)return `<section><div class="section-heading"><div><span class="eyebrow">Documentación oficial</span><h2>Documentos</h2><p>Este partido no tiene acta FAR disponible.</p></div></div><div class="empty-state">Cuando FAR publique un acta y la sincronización la detecte, se guardará aquí como documento. No se procesará para estadísticas ni jugadores.</div></section>`;
  const stored=doc.status==='STORED'&&doc.documentId;
  return `<section><div class="section-heading"><div><span class="eyebrow">Documentación oficial</span><h2>Documentos</h2><p>El acta FAR se conserva únicamente como documento oficial del área arbitral. <strong>No se procesa.</strong></p></div></div><article class="file-card"><div><strong>Acta oficial FAR</strong><small>${escapeHtml(stored?(doc.originalName||'Acta oficial FAR.pdf'):doc.status==='ERROR'?'No se pudo guardar todavía':'Disponible en FAR')}</small>${doc.fetchedAt?`<small>Guardada ${escapeHtml(formatAppDateTime_(doc.fetchedAt))}</small>`:''}${doc.lastError?`<small class="danger-text">${escapeHtml(doc.lastError)}</small>`:''}</div><div class="button-row">${stored?`<button class="button secondary" id="referee-document-view" data-document-id="${escapeHtml(doc.documentId)}">Ver documento</button>`:''}${doc.sourceUrl?`<a class="button secondary" href="${escapeHtml(doc.sourceUrl)}" target="_blank" rel="noopener">Ver en FAR</a>`:''}<button class="button secondary" id="referee-document-refresh">Actualizar</button></div></article><div id="referee-workflow-message" class="message"></div></section>`;
}
function refereeMatchLinksHtml_(data){const e=data.event||{};const links=[];if(e.officialMatchUrl)links.push(`<a class="button secondary" href="${escapeHtml(e.officialMatchUrl)}" target="_blank" rel="noopener">Partido en FAR / MatchReady</a>`);if(e.officialReportUrl)links.push(`<a class="button secondary" href="${escapeHtml(e.officialReportUrl)}" target="_blank" rel="noopener">Acta oficial FAR</a>`);return `<section><div class="section-heading"><div><span class="eyebrow">Fuentes oficiales</span><h2>Enlaces</h2><p>Accesos de consulta. El acta del área arbitral se guarda también como documento cuando está disponible.</p></div></div>${links.length?`<div class="button-row">${links.join('')}</div>`:'<div class="empty-state">No hay enlaces oficiales asociados.</div>'}</section>`;}

async function renderRefereeMatchWorkspace(eventId,requestedSection='summary'){
  try{
    const {data}=await call('getRefereeMatchWorkspaceData',{eventId,contextRoleCategory:contextRoleCategory_()});
    const e=data.event||{},section=['summary','pre','post','documents','links'].includes(requestedSection)?requestedSection:'summary',meta=data.meta||{};
    let content=section==='pre'?refereeMatchPreHtml_(data):section==='post'?refereeMatchPostHtml_(data):section==='documents'?refereeMatchDocumentsHtml_(data):section==='links'?refereeMatchLinksHtml_(data):refereeMatchSummaryHtml_(data);
    const source=data.origin==='FAR'?'FAR / MatchReady':'Designación del club';
    shell(`<section class="match-overview compact referee-workspace-header"><div class="match-overview-title"><span class="eyebrow">Área arbitral · ${escapeHtml(source)}</span><h1>${escapeHtml(e.title||'Partido')}</h1></div><div class="match-overview-card"><div class="match-overview-primary"><div class="match-info competition"><span>Competición</span><strong>${escapeHtml(meta.calendarCompetition||e.competition||'—')}</strong></div><div class="match-info"><span>Fecha</span><strong>${escapeHtml(e.eventDate||'—')}</strong></div><div class="match-info"><span>Hora</span><strong>${escapeHtml(displayEventTime_(e)||'Pendiente')}</strong></div><div class="match-info"><span>Árbitro</span><strong>${escapeHtml(data.referee?.displayName||'—')}</strong></div><div class="match-info"><span>Origen</span><strong>${escapeHtml(source)}</strong></div></div><div class="match-overview-location"><span>Ubicación</span><strong>${escapeHtml(e.location||'Pendiente')}</strong></div></div></section><section class="panel match-workspace-panel">${refereeMatchTabsHtml_(section)}<div class="event-section-host">${content}</div><div class="button-row"><button class="button secondary" id="referee-workspace-back">Volver al calendario</button>${data.clubMatch&&(currentAccessProfile_().isAdmin||!['REFEREE','REFEREE_COORDINATOR'].includes(contextRoleCategory_().toUpperCase()))?`<button class="button secondary" id="referee-workspace-sport">Ver ficha deportiva</button>`:''}</div></section>`,'calendar');
    document.querySelectorAll('[data-referee-tab]').forEach(btn=>btn.onclick=()=>renderRefereeMatchWorkspace(eventId,btn.dataset.refereeTab));
    document.getElementById('referee-workspace-back').onclick=renderCalendar;
    document.getElementById('referee-workspace-sport')?.addEventListener('click',()=>renderMatchPlanning(eventId,'auto'));
    const pre=document.getElementById('referee-pre-form');if(pre)pre.onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{await call('saveRefereeMatchPre',{eventId,complete:button?.dataset.complete==='true',departureTime:val('ref-pre-departure'),targetArrivalTime:val('ref-pre-arrival'),travelNotes:val('ref-pre-travel'),preObjective:val('ref-pre-objective'),preFocus:val('ref-pre-focus'),prePhysicalStatus:val('ref-pre-physical'),preNotes:val('ref-pre-notes')});showToast_(button?.dataset.complete==='true'?'Preparación arbitral completada.':'Borrador guardado.');await renderRefereeMatchWorkspace(eventId,'pre');}catch(err){showMessage(userErrorText_(err),'error','referee-workflow-message');if(button)button.disabled=false;}};
    const post=document.getElementById('referee-post-form');if(post)post.onsubmit=async ev=>{ev.preventDefault();const button=ev.submitter;if(button)button.disabled=true;try{const focus=[...document.querySelectorAll('[data-ref-post-focus]:checked')].map(x=>x.value);await call('saveRefereeMatchPost',{eventId,complete:button?.dataset.complete==='true',matchPlayed:val('ref-post-played'),postRating:val('ref-post-rating'),postFocus:focus,postWentWell:val('ref-post-good'),postImprove:val('ref-post-improve'),postReviewSituations:val('ref-post-review'),postIncidents:val('ref-post-incidents'),postNotes:val('ref-post-notes')});showToast_(button?.dataset.complete==='true'?'Seguimiento arbitral completado.':'Borrador guardado.');await renderRefereeMatchWorkspace(eventId,'post');}catch(err){showMessage(userErrorText_(err),'error','referee-workflow-message');if(button)button.disabled=false;}};
    document.getElementById('referee-document-refresh')?.addEventListener('click',async()=>{try{await call('refreshRefereeMatchOfficialDocument',{eventId});showToast_('Documento FAR actualizado.');await renderRefereeMatchWorkspace(eventId,'documents');}catch(err){showMessage(userErrorText_(err),'error','referee-workflow-message');}});
    document.getElementById('referee-document-view')?.addEventListener('click',async ev=>{try{const {data:file}=await call('getRefereeMatchDocumentFile',{documentId:ev.currentTarget.dataset.documentId});const w=window.open();if(w)w.document.write(`<iframe src="${file.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`);}catch(err){showMessage(userErrorText_(err),'error','referee-workflow-message');}});
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudo cargar el área arbitral</h1><p>${escapeHtml(userErrorText_(err))}</p><button class="button secondary" id="referee-workspace-error-back">Volver</button></section>`,'calendar');document.getElementById('referee-workspace-error-back')?.addEventListener('click',renderCalendar);}
}

async function renderEventDetail(eventId,requestedSection=''){
  let d=calendarData,e=d?.events?.find(x=>x.eventId===eventId)||null,detailHeader=null;
  const fullCalendarReady=!!(d&&Date.now()-calendarDataLoadedAt_<=20000&&Array.isArray(d.persons)&&e);
  // 0.6.87: al abrir un partido pedimos primero sólo su cabecera. Así evitamos
  // descargar personas, roles, asignaciones y toda la temporada para decidir
  // si corresponde ficha deportiva o arbitral.
  if(!fullCalendarReady){
    try{detailHeader=(await call('getEventDetailHeaderData',{eventId})).data;e=detailHeader.event;}catch(err){shell(`<section class="panel narrow"><h1>No se pudo cargar la actividad</h1><p>${escapeHtml(userErrorText_(err))}</p><button class="button secondary" id="event-fast-error-back">Volver</button></section>`,'calendar');document.getElementById('event-fast-error-back')?.addEventListener('click',renderCalendar);return;}
  }
  if(!e)return renderCalendar();
  if(e.eventType==='MATCH'){
    const role=contextRoleCategory_().toUpperCase(),hasClubReferee=detailHeader?!!detailHeader.hasClubReferee:eventHasClubRefereeClient_(eventId,d);
    const refereeView=isExternalRefereeMatchClient_(e)||(hasClubReferee&&(role==='REFEREE_COORDINATOR'||(role==='REFEREE'&&contextEventIds_().includes(String(eventId||'')))));
    if(refereeView){const refSection=['pre','post','documents','links','summary'].includes(requestedSection)?requestedSection:'summary';return renderRefereeMatchWorkspace(eventId,refSection);}
    if(requestedSection&&requestedSection!=='availability')return renderMatchPlanning(eventId,requestedSection);
    if(requestedSection==='availability')return renderEventAvailability(eventId);
    try{
      // 0.6.90: la cabecera rápida ya trae el estado mínimo del partido. Cuando
      // abrimos desde Calendario evitamos una segunda llamada sólo para decidir
      // qué pestaña mostrar.
      const state=detailHeader?.matchState||(await call('getMatchSectionState',{eventId})).data;
      if(state?.summaryVisible||state?.summaryExists)return renderMatchPlanning(eventId,'summary');
      if(Number(state?.lineupCount||0)>0)return renderMatchPlanning(eventId,'convocados');
      return renderEventAvailability(eventId);
    }catch(_){return renderEventAvailability(eventId);}
  }
  if(!fullCalendarReady){const r=await call('getCalendarData',{seasonId:selectedSeasonId_()});calendarData=r.data;calendarDataLoadedAt_=Date.now();d=calendarData;e=(d.events||[]).find(x=>x.eventId===eventId);if(!e)return renderCalendar();}
  const persons={};(d.persons||[]).forEach(p=>persons[p.personId]=p);const parts=(d.participants||[]).filter(p=>p.eventId===eventId);
  const canEdit=d.canCreate&&['ADMIN','MANAGER','COACH'].includes(currentUser?.role);const meta=(d.leagueMeta||[]).find(m=>m.eventId===eventId);const reportProtected=(d.matchReportEventIds||[]).includes(eventId);
  if(e.eventType==='TRAINING'){
    const attendanceExists=['IN_PROGRESS','COMPLETED'].includes(e.status)||!!e.attendanceClosedAt;
    const section=requestedSection||(attendanceExists?'attendance':'availability');
    let availabilityData=null,trainingPlanData=null;
    if(section==='plan'){
      try{trainingPlanData=(await call('getTrainingSessionPlanData',{eventId})).data;}catch(err){trainingPlanData={event:e,blocks:[],exercises:[],staff:[],canManage:false,error:err.message};}
    }
    if(section==='availability'||(section==='attendance'&&['IN_PROGRESS','COMPLETED'].includes(e.status)&&!parts.length)){
      try{availabilityData=(await call('getEventAvailabilityData',{eventId})).data;}catch(ignore){availabilityData=null;}
      if(availabilityData?.attendanceBackfilled){invalidateCalendarCaches_();return renderEventDetail(eventId,section);}
    }
    const header=activityHeaderHtml_(e,meta);
    const tabs=eventWorkspaceTabsHtml_(e,section,{attendanceExists:true});
    let content='';
    if(section==='plan')content=trainingPlanData?.error?`<div class="message error">${escapeHtml(trainingPlanData.error)}</div>`:trainingSessionPlanHtml_(trainingPlanData);
    else if(section==='attendance')content=trainingAttendanceHtml_(parts,persons,e,canEdit);
    else if(section==='survey')content=`<section class="post-training-survey"><div><span class="eyebrow">Post-entrenamiento</span><h2>Encuesta del entrenamiento</h2><p>${e.status==='COMPLETED'?'La actividad finalizó. La encuesta quedará asociada a este entrenamiento cuando definamos sus preguntas.':'La encuesta se habilitará al finalizar el entrenamiento.'}</p></div><span class="status-pill warning">Pendiente</span></section>`;
    else {
      if(!availabilityData){try{availabilityData=(await call('getEventAvailabilityData',{eventId})).data;}catch(ignore){availabilityData=null;}}
      content=eventAvailabilityPreviewHtml_(availabilityData,e)+(availabilityData?.isOpenForAvailability&&canEdit?'<div class="button-row"><button class="button primary" id="manage-availability-inline">Gestionar disponibilidad</button></div>':'');
    }
    const adminActions=canEdit?`<div class="button-row event-actions secondary-actions">${['PENDING','SCHEDULED'].includes(e.status)?'<button class="button secondary" id="edit-event">Editar</button>':''}${reportProtected?(e.status==='CANCELLED'?'<button class="button secondary" id="reactivate-activity">Reactivar</button>':''):((['PENDING','SCHEDULED'].includes(e.status))?'<button class="button secondary" id="cancel-activity">Cancelar actividad</button>':e.status==='CANCELLED'?'<button class="button secondary" id="reactivate-activity">Reactivar</button>':'')}${['PENDING','SCHEDULED'].includes(e.status)?'<button class="button secondary" id="postpone-activity">Postergar</button>':''}${e.status==='POSTPONED'?'<button class="button secondary" id="reschedule-event">Reprogramar</button>':''}${reportProtected||e.sourceType==='TRAINING_PLAN'?'':`<button class="button link danger-text" id="delete-event">Borrar</button>`}</div>`:'';
    shell(`${header}<section class="panel match-detail-panel">${tabs}${e.notes?`<div class="match-note">${escapeHtml(e.notes)}</div>`:''}<div id="editor-host"></div><div class="event-section-host">${content}</div>${adminActions}<div class="button-row"><button class="button secondary" id="back-calendar">Volver al calendario</button></div><div id="message" class="message"></div></section>`,'calendar');
    wireEventWorkspaceTabs_(eventId,e,{attendanceExists:true});
    document.getElementById('back-calendar').onclick=renderCalendar;const ma=document.getElementById('manage-availability-inline');if(ma)ma.onclick=()=>renderEventAvailability(eventId);
    if(section==='plan'&&trainingPlanData&&!trainingPlanData.error)wireTrainingSessionPlan_(eventId,trainingPlanData);
    const eb=document.getElementById('edit-event');if(eb)eb.onclick=()=>renderEventEditor(eventId);
    const changeState=async(status,payload={})=>{try{await call('setEventState',Object.assign({eventId,status},payload));invalidateCalendarCaches_();await renderEventDetail(eventId);}catch(err){showMessage(err.message,'error');}};
    const cb=document.getElementById('cancel-activity');if(cb)cb.onclick=()=>{if(confirm('¿Cancelar esta actividad? Se conservará en el historial.'))changeState('CANCELLED');};
    const pb=document.getElementById('postpone-activity');if(pb)pb.onclick=()=>{if(confirm('¿Marcar esta actividad como postergada?'))changeState('POSTPONED');};
    const rb=document.getElementById('reactivate-activity');if(rb)rb.onclick=()=>changeState('SCHEDULED');
    const rs=document.getElementById('reschedule-event');if(rs)rs.onclick=async()=>{const nd=prompt('Nueva fecha (AAAA-MM-DD):',e.eventDate||'');if(!nd)return;const nt=prompt('Nueva hora (HH:MM):',e.startTime||'')??'';await changeState('SCHEDULED',{eventDate:nd,startTime:nt});};
    const db=document.getElementById('delete-event');if(db)db.onclick=async()=>{if(!confirm('¿Borrar definitivamente esta actividad?'))return;try{await call('deleteEvent',{eventId});invalidateCalendarCaches_();await renderCalendar();}catch(err){showMessage(err.message,'error');}};
    document.querySelectorAll('[data-attendance]').forEach(sel=>sel.onchange=async()=>{try{await call('updateEventAttendance',{eventParticipantId:sel.dataset.attendance,attendanceStatus:sel.value});invalidateCalendarCaches_();showToast_('Asistencia actualizada.','success',1800);await renderEventDetail(eventId,'attendance');}catch(err){showMessage(err.message,'error');}});
    const confirmAttendance=document.getElementById('confirm-training-attendance');if(confirmAttendance)confirmAttendance.onclick=async()=>{try{confirmAttendance.disabled=true;await call('closeTrainingAttendance',{eventId});invalidateCalendarCaches_();showToast_('Asistencia confirmada.','success',1800);await renderEventDetail(eventId,'attendance');}catch(err){showMessage(err.message,'error');confirmAttendance.disabled=false;}};
    const reopenAttendance=document.getElementById('reopen-training-attendance');if(reopenAttendance)reopenAttendance.onclick=async()=>{if(!confirm('¿Reabrir la asistencia para hacer correcciones? La reapertura quedará registrada en auditoría.'))return;try{reopenAttendance.disabled=true;await call('reopenTrainingAttendance',{eventId});invalidateCalendarCaches_();showToast_('Asistencia reabierta.','success',1800);await renderEventDetail(eventId,'attendance');}catch(err){showMessage(err.message,'error');reopenAttendance.disabled=false;}};
    return;
  }
  const header=activityHeaderHtml_(e,meta);
  shell(`${header}<section class="panel match-detail-panel">${e.notes?`<div class="match-note">${escapeHtml(e.notes)}</div>`:''}<div class="button-row"><button class="button secondary" id="back-calendar">Volver al calendario</button></div></section>`,'calendar');
  document.getElementById('back-calendar').onclick=renderCalendar;
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
  if(!calendarData||Date.now()-calendarDataLoadedAt_>20000){const r=await call('getCalendarData',{seasonId:selectedSeasonId_()});calendarData=r.data;calendarDataLoadedAt_=Date.now();}const d=calendarData;
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
async function commitLeagueImport(withResolutions=false){if(!leagueImportState)return;const club=val('league-club-name'),division=val('league-division');if(!club)return showMessage('Selecciona cómo figura nuestro club en el calendario.','error');if(!division)return showMessage('Selecciona la división antes de importar.','error');const button=document.getElementById(withResolutions?'league-conflicts-apply':'league-import-confirm');if(button)button.disabled=true;try{const conflictResolutions={};if(withResolutions&&(leagueImportState.conflicts||[]).length){leagueImportState.conflicts.forEach(c=>{const checked=document.querySelector(`input[name="conflict-${c.conflictId}"]:checked`);if(checked)conflictResolutions[c.conflictId]=checked.value;});}showMessage(withResolutions?'Aplicando decisiones…':'Importando partidos…');const {data}=await call('importLeagueCalendar',{previewId:leagueImportState.previewId,fileName:leagueImportState.fileName,seasonId:selectedSeasonId_(),clubCalendarName:club,divisionId:division,teamId:val('league-team'),competitionId:val('league-competition'),conflictResolutions});if(data.requiresResolution){leagueImportState.conflicts=data.conflicts||[];const old=document.getElementById('league-conflicts');if(old)old.remove();renderLeagueConflicts_(leagueImportState.conflicts);showMessage('El calendario oficial cambió. Revisa los conflictos antes de importar.','info');if(button)button.disabled=false;return;}invalidateCalendarCaches_();leagueImportPreferredCompetitionId='';const pending=(data.formatPlan||[]).filter(x=>x.durationSource==='PENDING').length;alert(`Importación completada: ${data.imported} partidos nuevos, ${data.updated} actualizados, ${data.restImported||0} descansos. Formatos detectados: ${(data.formatPlan||[]).length}${pending?' · '+pending+' jornada(s) con duración pendiente':''}. Conflictos mantenidos: ${data.keptConflicts||0}; reemplazados: ${data.replacedConflicts||0}.`);renderCalendar();}catch(err){showMessage(err.message+(err.requestId?` · Solicitud ${err.requestId}`:''),'error');if(button)button.disabled=false;}}

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
function matchPresenceSegmentsLabel_(stat,data){
  const key=stat.personId||stat.licenseNumber||stat.jerseyNumber;
  const summary=(data.presenceSummary||{})[key];
  const duration=Number(data.matchDurationMinutes||0);
  if(!summary||!Array.isArray(summary.segments)||!summary.segments.length)return '';
  return summary.segments.map(seg=>{
    const start=Number(seg.in||0);
    const rawEnd=(seg.out===''||seg.out==null)?duration:Number(seg.out);
    const end=Number.isFinite(rawEnd)&&rawEnd>=0?rawEnd:duration;
    return `${start}–${end}`;
  }).join(' · ');
}
function officialMatchSummaryHtml_(data,{compact=false}={}){
  const stats=uniqueBy_(data?.stats||[],x=>`${x.personId||x.licenseNumber||x.playerName}|${x.jerseyNumber}|${x.lineupRole}`), scores=uniqueBy_(data?.scoringEvents||[],x=>`${x.teamSide}|${x.jerseyNumber}|${x.eventType}|${x.minute}|${x.points}`), subs=uniqueBy_(data?.substitutionEvents||[],x=>`${x.teamSide}|${x.jerseyIn}|${x.jerseyOut}|${x.changeType}|${x.minute}`), cards=uniqueBy_(data?.disciplinaryEvents||[],x=>`${x.teamSide}|${x.jerseyNumber}|${x.cardType}|${x.reasonCode||''}|${x.minute}`), staff=uniqueBy_(data?.staffAppearances||[],x=>`${x.teamSide}|${x.personId||x.licenseNumber||x.staffName}|${x.staffRole}`);
  if(!stats.length&&!scores.length&&!subs.length&&!cards.length&&!staff.length)return '';
  const starters=stats.filter(x=>x.lineupRole==='STARTER');
  const substitutes=stats.filter(x=>x.lineupRole==='SUBSTITUTE');
  const unmatchedPlayers=stats.filter(x=>String(x.status||'').toUpperCase()==='UNMATCHED').length;
  const captain=stats.find(x=>x.isCaptain==='TRUE');
  const points=scores.reduce((n,x)=>n+Number(x.points||0),0);
  const yellows=cards.filter(x=>x.cardType!=='RED').length, reds=cards.filter(x=>x.cardType==='RED').length;
  const scoreRows=scores.slice().sort((a,b)=>Number(a.minute||999)-Number(b.minute||999)).map(x=>`<li><span class="incident-minute">${escapeHtml(x.minute||'—')}'</span><strong>#${escapeHtml(x.jerseyNumber||'—')} ${escapeHtml(x.playerName||'')}</strong><span>${escapeHtml(matchScoreTypeLabel_(x.eventType))} · ${escapeHtml(String(x.points||0))} pts</span></li>`).join('');
  const subRows=subs.slice().sort((a,b)=>Number(a.minute||999)-Number(b.minute||999)).map(x=>`<li><span class="incident-minute">${escapeHtml(x.minute||'—')}'</span><strong>#${escapeHtml(x.jerseyIn||'—')} ${escapeHtml(x.playerInName||'')}</strong><span>entra por #${escapeHtml(x.jerseyOut||'—')} ${escapeHtml(x.playerOutName||'')} · ${escapeHtml(matchChangeTypeLabel_(x.changeType))}</span></li>`).join('');
  const cardRows=cards.slice().sort((a,b)=>Number(a.minute||999)-Number(b.minute||999)).map(x=>`<li><span class="incident-minute">${escapeHtml(x.minute||'—')}'</span><strong>#${escapeHtml(x.jerseyNumber||'—')} ${escapeHtml(x.playerName||'')}</strong><span>${x.cardType==='RED'?'Roja':'Amarilla'}${x.reasonCode?' · '+escapeHtml(x.reasonCode):''}</span></li>`).join('');
  const staffRows=staff.map(x=>`<li><strong>${escapeHtml(({COACH:'Entrenador',MANAGER:'Delegado',FIELD_DELEGATE:'Delegado de campo'})[x.staffRole]||x.staffRole||'Staff')}</strong><span>${escapeHtml(x.staffName||'—')}</span></li>`).join('');
  const substituteCards=substitutes.map(s=>{const minutes=matchPresenceLabel_(s,data),segments=matchPresenceSegmentsLabel_(s,data),played=minutes!=='0 min'&&minutes!=='—';return `<article class="squad-person-card"><div><strong>#${escapeHtml(s.jerseyNumber||'—')} ${escapeHtml(s.playerName||'')}</strong><small>${escapeHtml(s.licenseNumber||'')}${s.status==='UNMATCHED'?' · Sin vincular':''}${segments?` · ${escapeHtml(segments)}`:''}</small></div><span class="badge ${played?'':'muted'}">${played?escapeHtml(minutes):'No ingresó'}</span></article>`}).join('');
  const starterRows=starters.map(s=>{const cardCount=Number(s.yellowCards||0)+Number(s.redCards||0),segments=matchPresenceSegmentsLabel_(s,data);return `<tr><td><strong>#${escapeHtml(s.jerseyNumber||'—')} ${escapeHtml(s.playerName||'')}</strong>${s.isCaptain==='TRUE'?'<span class="badge">Capitán</span>':''}<small>${escapeHtml(s.licenseNumber||'')}${s.status==='UNMATCHED'?' · Sin vincular':''}${segments?` · ${escapeHtml(segments)}`:''}</small></td><td><strong>${escapeHtml(matchPresenceLabel_(s,data))}</strong></td><td>${escapeHtml(String(s.points||0))}</td><td>${cardCount?`${Number(s.yellowCards||0)?Number(s.yellowCards||0)+' A ':''}${Number(s.redCards||0)?Number(s.redCards||0)+' R':''}`:'—'}</td></tr>`}).join('');
  const sectionTitle=compact?'Resumen oficial del acta':'Resumen oficial de Marbella';
  return `<section class="official-match-summary ${compact?'compact':''}"><div class="section-heading"><h2>${sectionTitle}</h2><p>${stats.length} convocados · ${starters.length} titulares · ${substitutes.length} suplentes${captain?' · Capitán: '+escapeHtml(captain.playerName||''):''}${unmatchedPlayers?' · '+unmatchedPlayers+' sin vincular':''}</p></div>${unmatchedPlayers?`<div class="message warning"><strong>${unmatchedPlayers} jugador(es) del acta siguen sin vincular.</strong> El Resumen se aplica igualmente; un administrador puede resolver las coincidencias pendientes.</div>`:''}<div class="match-kpi-row"><div class="match-kpi"><strong>${points}</strong><span>Puntos</span></div><div class="match-kpi"><strong>${subs.length}</strong><span>Cambios</span></div><div class="match-kpi"><strong>${yellows}</strong><span>Amarillas</span></div><div class="match-kpi"><strong>${reds}</strong><span>Rojas</span></div></div>${compact?'':`<div class="official-roster-grid"><div><h3>Titulares</h3><div class="table-wrap compact-table"><table><thead><tr><th>Jugador</th><th>Minutos</th><th>Pts</th><th>Tarjetas</th></tr></thead><tbody>${starterRows||'<tr><td colspan="4">Sin titulares consolidados</td></tr>'}</tbody></table></div></div><div><h3>Suplentes</h3><div class="squad-card-list">${substituteCards||'<p>Sin suplentes consolidados.</p>'}</div></div></div>`}<div class="official-incidents-grid">${scoreRows?`<div><h3>Puntos</h3><ul class="incident-list">${scoreRows}</ul></div>`:''}${subRows?`<div><h3>Cambios</h3><ul class="incident-list">${subRows}</ul></div>`:''}${cardRows?`<div><h3>Disciplina</h3><ul class="incident-list">${cardRows}</ul></div>`:''}${staffRows&&!compact?`<div><h3>Staff</h3><ul class="incident-list">${staffRows}</ul></div>`:''}</div></section>`;
}
function lineupRoleForOrderClient_(value){
  const n=Number(value||0);if(!Number.isInteger(n)||n<1||n>23)return '';
  return n<=15?'STARTER':'SUBSTITUTE';
}
function lineupRoleLabelForOrderClient_(value){const role=lineupRoleForOrderClient_(value);return role==='STARTER'?'Titular':role==='SUBSTITUTE'?'Suplente':'Sin orden';}
function lineupOrderOptionsHtml_(selected=''){
  const current=String(selected||'');let html='<option value="">Orden</option>';
  for(let n=1;n<=23;n+=1)html+=`<option value="${n}" ${current===String(n)?'selected':''}>${n}</option>`;
  return html;
}
function refreshLineupBuilder_(){
  const rows=[...document.querySelectorAll('[data-lineup-person]')],usedOrders={};
  rows.forEach(ch=>{if(!ch.checked)return;const id=ch.dataset.lineupPerson,sel=document.querySelector(`[data-lineup-order="${id}"]`),v=String(sel?.value||'');if(v)usedOrders[v]=(usedOrders[v]||0)+1;});
  rows.forEach(ch=>{const id=ch.dataset.lineupPerson,sel=document.querySelector(`[data-lineup-order="${id}"]`),label=document.querySelector(`[data-lineup-role-label="${id}"]`),current=String(sel?.value||'');if(sel)[...sel.options].forEach(opt=>{if(!opt.value)return;const unavailable=!!usedOrders[opt.value]&&opt.value!==current;opt.disabled=unavailable;opt.hidden=unavailable;});if(label){const role=lineupRoleForOrderClient_(current);label.textContent=lineupRoleLabelForOrderClient_(current);label.classList.toggle('success',role==='STARTER');label.classList.toggle('warning',role==='SUBSTITUTE');label.classList.toggle('muted',!role);}});
}
function validateLineupBuilder_(){
  const selected=[...document.querySelectorAll('[data-lineup-person]')].filter(ch=>ch.checked);if(selected.length>23)throw new Error('La convocatoria admite un máximo de 23 jugadores.');
  const orders={};
  selected.forEach(ch=>{const id=ch.dataset.lineupPerson,order=String(document.querySelector(`[data-lineup-order="${id}"]`)?.value||'');if(!lineupRoleForOrderClient_(order))throw new Error('Cada convocado debe tener un orden entre 1 y 23.');if(orders[order])throw new Error(`El orden ${order} está repetido.`);orders[order]=true;});
}

function matchParticipationStatusLabel_(value){return ({PENDING:'Pendiente',PLAYED:'Participó',DID_NOT_PLAY:'No participó'})[String(value||'PENDING').toUpperCase()]||'Pendiente';}
function matchParticipationBlockHtml_(data){
  const e=data.event||{},rows=(data.lineup||[]).slice().sort((a,b)=>Number(a.plannedOrderNo||a.orderNo||999)-Number(b.plannedOrderNo||b.orderNo||999));
  if(!['IN_PROGRESS','COMPLETED'].includes(e.status))return '';
  if(!data.manualParticipation)return `<div class="section-divider"></div><section class="match-participation"><div class="panel-heading"><div><h2>Participación real</h2><p>En este partido oficial la participación se consolida desde el acta FAR. La convocatoria previa queda preservada como histórico.</p></div><span class="status-pill">Acta oficial</span></div></section>`;
  if(!rows.length)return `<div class="section-divider"></div><section class="match-participation"><div class="panel-heading"><div><h2>Participación real</h2><p>No hay convocatoria guardada para confirmar.</p></div></div></section>`;
  const editable=!!data.canEditParticipation,closed=!!data.participationClosed;
  const body=rows.map(l=>{const p=(data.players||[]).find(x=>x.personId===l.personId),st=String(l.participationStatus||'PENDING').toUpperCase();return `<tr><td>${escapeHtml(l.plannedOrderNo||l.orderNo||'—')}</td><td>${escapeHtml(l.jerseyNumber||'—')}</td><td><strong>${escapeHtml(p?.displayName||l.personId)}</strong></td><td>${editable?`<select data-match-participation="${escapeHtml(l.lineupId)}"><option value="PENDING" ${st==='PENDING'?'selected':''}>Pendiente</option><option value="PLAYED" ${st==='PLAYED'?'selected':''}>Participó</option><option value="DID_NOT_PLAY" ${st==='DID_NOT_PLAY'?'selected':''}>No participó</option></select>`:`<strong>${escapeHtml(matchParticipationStatusLabel_(st))}</strong>`}</td></tr>`;}).join('');
  const pending=rows.filter(x=>!['PLAYED','DID_NOT_PLAY'].includes(String(x.participationStatus||'').toUpperCase())).length;
  const actions=!data.canManage?'':closed?'<div class="button-row"><button class="button secondary" id="reopen-match-participation">Reabrir participación</button></div>':`<div class="button-row"><button class="button secondary" id="mark-all-match-played">Marcar todos como participaron</button><button class="button secondary" id="save-match-participation-draft">Guardar borrador</button><button class="button primary" id="confirm-match-participation" ${pending?'disabled':''}>Confirmar participación</button></div>`;
  return `<div class="section-divider"></div><section class="match-participation"><div class="panel-heading"><div><h2>Participación real</h2><p>${closed?'Participación confirmada y cerrada. Si necesitás corregirla, reabrila; queda auditado.':'Marcá lo que ocurrió realmente. La disponibilidad y convocatoria previas no se modifican.'}</p></div><span class="status-pill ${closed?'active':'warning'}">${closed?'Confirmada':pending?pending+' pendiente(s)':'Lista para confirmar'}</span></div><div class="table-wrap compact-table"><table><thead><tr><th>Orden</th><th>Dorsal</th><th>Jugador</th><th>Participación</th></tr></thead><tbody>${body}</tbody></table></div>${actions}</section>`;
}

const matchPlanningCache_=new Map();
function invalidateMatchPlanningCache_(eventId){
  if(!eventId){matchPlanningCache_.clear();return;}
  const prefix=String(eventId)+'|';[...matchPlanningCache_.keys()].forEach(k=>{if(String(k).startsWith(prefix))matchPlanningCache_.delete(k);});
}
function primeMatchPlanningCache_(eventId,section,data){if(!eventId||!data)return;matchPlanningCache_.set(String(eventId)+'|'+String(section||'summary'),{at:Date.now(),data});}
async function getMatchPlanningCached_(eventId,section='summary',force=false){
  const normalized=String(section||'summary'),key=String(eventId)+'|'+normalized,now=Date.now(),hit=matchPlanningCache_.get(key);if(!force&&hit&&now-hit.at<45000)return hit.data;
  const action=normalized==='summary'?'getMatchSummaryFast':normalized==='convocados'?'getMatchLineupFast':normalized==='survey'?'getMatchSurveyFast':'getMatchPlanningData';
  const payload=action==='getMatchPlanningData'?{eventId,section:normalized}:{eventId};
  const {data}=await call(action,payload);matchPlanningCache_.set(key,{at:now,data});return data;
}
function matchSummaryExistsClient_(data){
  const e=data?.event||{},after=['IN_PROGRESS','COMPLETED'].includes(String(e.status||''));
  return after&&((data?.reports||[]).length>0||(data?.stats||[]).length>0||String(e.resultFor||'')!==''||String(e.resultAgainst||'')!==''||!!data?.participationClosed);
}
function matchSummaryVisibleClient_(data){
  const e=data?.event||{};
  return matchSummaryExistsClient_(data)||String(e.status||'').toUpperCase()==='COMPLETED';
}
function officialReportUiState_(data){
  const e=data?.event||{},reports=data?.reports||[],latest=reports.length?reports[reports.length-1]:null,status=String(latest?.status||'').toUpperCase();
  if(status==='REVIEWED')return {code:'PROCESSED',label:'Procesada',kind:'success',text:'Acta oficial cargada, procesada y aplicada al partido.'};
  if(status==='PARSED')return {code:'REVIEW',label:'Revisión pendiente',kind:'warning',text:'El PDF fue interpretado y está pendiente de revisión/aplicación.'};
  if(status==='UPLOADED'||status==='ERROR')return {code:'ERROR',label:'Requiere revisión',kind:'warning',text:'El PDF está guardado, pero necesita reproceso o revisión.'};
  if(String(e.officialReportUrl||''))return {code:'AVAILABLE',label:'Disponible en FAR',kind:'warning',text:'FAR ya publica un acta para este partido. Podés descargarla y procesarla ahora.'};
  if(String(e.matchType||'').toUpperCase()==='COMPETITION'&&(e.competitionId||e.officialMatchUrl||String(e.sourceType||'').indexOf('FAR')===0))return {code:'PENDING',label:'Pendiente FAR',kind:'muted',text:'FAR todavía no publicó o no detectamos el acta. La sincronización diaria volverá a comprobarla.'};
  return {code:'MANUAL',label:'Sin acta',kind:'muted',text:'No hay acta asociada. Podés adjuntar el PDF manualmente.'};
}
async function recoverMatchReportOperation_(eventId,error){
  // 0.6.87: si Apps Script devuelve un error después del commit (por ejemplo,
  // telemetría/auditoría), verificamos el estado autoritativo antes de decirle
  // al usuario que el procesamiento falló.
  invalidateMatchPlanningCache_(eventId);invalidateCalendarCaches_();
  try{
    const data=await getMatchPlanningCached_(eventId,'summary',true),state=officialReportUiState_(data);
    if(state.code==='PROCESSED'){showToast_('Acta procesada y aplicada. Una operación secundaria no pudo confirmarse, pero los datos quedaron guardados.','warning',5200);await renderMatchPlanning(eventId,'summary');return true;}
  }catch(recoveryError){console.warn('No se pudo verificar el estado del acta tras el error.',recoveryError);}
  showMessage(userErrorText_(error),'error');return false;
}
function eventWorkspaceTabsHtml_(event,active,opts={}){
  const e=event||{},match=e.eventType==='MATCH',training=e.eventType==='TRAINING';
  const buttons=[];
  if(match&&(opts.summaryVisible||opts.summaryExists))buttons.push(`<button class="button ${active==='summary'?'primary':'secondary'}" data-event-tab="summary">Resumen</button>`);
  if(match)buttons.push(`<button class="button ${active==='convocados'?'primary':'secondary'}" data-event-tab="convocados">Convocados</button>`);
  if(training)buttons.push(`<button class="button ${active==='plan'?'primary':'secondary'}" data-event-tab="plan">Plan</button>`);
  if(training&&opts.attendanceExists)buttons.push(`<button class="button ${active==='attendance'?'primary':'secondary'}" data-event-tab="attendance">Asistencia</button>`);
  if(match||training)buttons.push(`<button class="button ${active==='availability'?'primary':'secondary'}" data-event-tab="availability">Disponibilidad previa</button>`);
  if(training)buttons.push(`<button class="button ${active==='survey'?'primary':'secondary'}" data-event-tab="survey">Encuesta del entreno</button>`);
  if(match)buttons.push(`<button class="button ${active==='survey'?'primary':'secondary'}" data-event-tab="survey">Encuesta post-partido</button>`);
  if(match)buttons.push('<button class="button secondary" id="match-format-duration" data-event-action="format">Formato / duración</button>');
  if(match&&opts.officialLinks)buttons.push('<button class="button secondary" id="official-links" data-event-action="links">Enlaces oficiales</button>');
  if(match&&opts.refereeView)buttons.push('<button class="button secondary" data-event-action="referee">Área arbitral</button>');
  return `<nav class="event-section-tabs button-row" aria-label="Secciones de la actividad">${buttons.join('')}</nav>`;
}
function wireEventWorkspaceTabs_(eventId,event,opts={}){
  document.querySelectorAll('[data-event-tab]').forEach(btn=>btn.onclick=()=>{
    const tab=btn.dataset.eventTab;if(event.eventType==='MATCH'){
      if(tab==='availability')return renderEventAvailability(eventId);
      return renderMatchPlanning(eventId,tab);
    }
    return renderEventDetail(eventId,tab);
  });
  document.querySelectorAll('[data-event-action="format"]').forEach(btn=>btn.onclick=()=>openMatchFormatDurationEditor_(event));
  document.querySelectorAll('[data-event-action="links"]').forEach(btn=>btn.onclick=()=>openOfficialLinksEditor_(event));
  document.querySelectorAll('[data-event-action="referee"]').forEach(btn=>btn.onclick=()=>renderRefereeMatchWorkspace(eventId,'summary'));
}
async function renderMatchPlanning(eventId,requestedSection='auto'){
  try{
    let section=requestedSection||'auto';
    // 0.6.87: primero decide qué pestaña necesita y sólo después solicita sus
    // datos. Abrir Resumen ya no carga disponibilidad/roster/partido anterior.
    if(section==='auto'){
      const {data:state}=await call('getMatchSectionState',{eventId});
      section=(state.summaryVisible||state.summaryExists)?'summary':Number(state.lineupCount||0)>0?'convocados':'availability';
    }
    if(section==='availability')return renderEventAvailability(eventId);
    const data=await getMatchPlanningCached_(eventId,section);const e=data.event,lineMap={};(data.lineup||[]).forEach(l=>lineMap[l.personId]=l);
    const summaryExists=matchSummaryExistsClient_(data),summaryVisible=matchSummaryVisibleClient_(data),lineupExists=(data.lineup||[]).length>0;
    const previousMap={};(data.previousLineup||[]).forEach(l=>previousMap[l.personId]=l);
    const hasPrevious=data.canEditLineup&&(data.previousLineup||[]).length>0;
    const usePrevious=hasPrevious&&(data.lineup||[]).length===0;
    const proposalMap=usePrevious?previousMap:{};
    const selectablePlayers=(data.players||[]).filter(p=>!(data.availabilityEffects?.[p.personId]||{}).blocked).slice().sort((a,b)=>{
      const la=lineMap[a.personId]||proposalMap[a.personId],lb=lineMap[b.personId]||proposalMap[b.personId];
      const oa=Number(la?.proposalOrderNo||la?.plannedOrderNo||la?.orderNo||999),ob=Number(lb?.proposalOrderNo||lb?.plannedOrderNo||lb?.orderNo||999);if(oa!==ob)return oa-ob;
      return availabilitySurnameSortKey_(a).localeCompare(availabilitySurnameSortKey_(b),'es')||String(a.displayName||'').localeCompare(String(b.displayName||''),'es');
    });
    const previousHint=hasPrevious&&data.previousMatch?`<div class="info-strip"><strong>Propuesta basada en:</strong> ${escapeHtml(data.previousMatch.title||data.previousMatch.opponent||'Partido anterior')} · ${escapeHtml(data.previousMatch.eventDate||'')}${data.previousLineupSource==='ACTA'?' · acta oficial':' · convocatoria guardada'}. ${usePrevious?'Se aplicó automáticamente como punto de partida.':'Está disponible como referencia.'} Se recuperan jugadores y orden; el dorsal se completa con la realidad del partido/acta.</div>`:'';
    const lineupEditor=data.canEditLineup?`<div class="section-heading"><div><h2>Convocados</h2><p>Seleccioná quiénes van convocados y asigná el <strong>orden 1-23</strong>. Del 1 al 15 queda Titular y del 16 al 23 Suplente. El dorsal no se define en la convocatoria previa.</p></div><span class="badge">${selectablePlayers.length} disponibles</span></div>${previousHint}${hasPrevious?`<div class="button-row compact-actions"><button class="button secondary" id="load-previous-lineup">Cargar equipo anterior</button><button class="button secondary" id="clear-lineup">Empezar desde cero</button></div>`:''}<div class="lineup-builder">${selectablePlayers.map(p=>{const current=lineMap[p.personId],proposal=proposalMap[p.personId],checked=!!current||(!Object.keys(lineMap).length&&!!proposal),plannedOrder=current?(current.plannedOrderNo||current.orderNo||''):(proposal?.proposalOrderNo||proposal?.orderNo||proposal?.plannedOrderNo||'');const role=lineupRoleForOrderClient_(plannedOrder);return `<label class="lineup-row ${proposal&&!current?'lineup-proposed':''}"><input type="checkbox" data-lineup-person="${p.personId}" ${checked?'checked':''}><span><strong>${escapeHtml(p.displayName)}</strong>${proposal&&!current?'<small>Del partido anterior</small>':''}</span><span class="status-pill lineup-role ${role==='STARTER'?'success':role==='SUBSTITUTE'?'warning':'muted'}" data-lineup-role-label="${p.personId}">${escapeHtml(lineupRoleLabelForOrderClient_(plannedOrder))}</span><select data-lineup-order="${p.personId}" title="Orden de convocatoria">${lineupOrderOptionsHtml_(plannedOrder)}</select></label>`}).join('')}</div><div class="form-hint">El orden no se puede repetir. 1-15 = Titular · 16-23 = Suplente.</div><button class="button primary" id="save-lineup">Confirmar convocatoria</button>`:(data.canManage?`<div class="section-heading"><div><h2>Convocados</h2><p>Convocatoria previa preservada como histórico.</p></div></div>${(data.lineup||[]).length?`<div class="table-wrap compact-table"><table><thead><tr><th>Orden</th><th>Jugador</th><th>Condición</th></tr></thead><tbody>${(data.lineup||[]).slice().sort((a,b)=>Number(a.plannedOrderNo||a.orderNo||999)-Number(b.plannedOrderNo||b.orderNo||999)).map(l=>`<tr><td>${escapeHtml(l.plannedOrderNo||l.orderNo||'—')}</td><td>${escapeHtml((data.players||[]).find(p=>p.personId===l.personId)?.displayName||l.personId)}</td><td>${lineupRoleForOrderClient_(l.plannedOrderNo||l.orderNo)==='STARTER'?'Titular':'Suplente'}</td></tr>`).join('')}</tbody></table></div>`:emptyTable('Sin convocatoria confirmada.')}`:'');
    const participationBlock=matchParticipationBlockHtml_(data);
    const reports=(data.reports||[]).map(r=>`<li><strong>${escapeHtml(r.originalName)}</strong> · ${escapeHtml(r.status)}${r.parsedAt?` · <small>extraído ${escapeHtml(r.parsedAt)}</small>`:''} <button class="button mini secondary" data-report-view="${r.reportId}">Ver</button> <button class="button mini secondary" data-report-refresh="${r.reportId}">Reprocesar acta</button>${r.status==='PARSED'||r.status==='REVIEWED'?` <button class="button mini secondary" data-report-people="${r.reportId}">Vincular personas</button> <button class="button mini primary" data-report-apply="${r.reportId}">${r.status==='REVIEWED'?'Ver datos del acta':'Revisar datos'}</button>`:''}</li>`).join('');
    const reportStatusLabel_=status=>({REVIEWED:'Revisado',PARSED:'Procesado',UPLOADED:'Cargado',ERROR:'Con error'})[String(status||'').toUpperCase()]||String(status||'Pendiente');
    const reportSummary=(data.reports||[]).length?`PDF cargado · ${escapeHtml(reportStatusLabel_((data.reports||[])[0]?.status))}`:'Pendiente';
    const reportUi=officialReportUiState_(data),farMatch=String(e.matchType||'').toUpperCase()==='COMPETITION'&&(e.competitionId||e.officialMatchUrl||String(e.sourceType||'').indexOf('FAR')===0);
    const farRefreshButton=farMatch&&data.canManageReport?`<button class="button primary" id="refresh-match-report-far">Actualizar desde FAR</button>`:'';
    const reportBlock=data.canManageReport?`<div class="section-divider"></div><section class="official-report-status"><div class="panel-heading"><div><span class="eyebrow">Acta oficial</span><h2>Acta del partido</h2><p>${escapeHtml(reportUi.text)}</p></div><span class="status-pill ${escapeHtml(reportUi.kind)}">${escapeHtml(reportUi.label)}</span></div><div class="button-row">${farRefreshButton}</div><details class="official-report-details" ${reportUi.code==='PROCESSED'?'':'open'}><summary><span>Documento / carga manual</span><small>${reportSummary}</small></summary><div class="official-report-details-body"><p>La sincronización FAR es automática. La carga manual queda disponible como respaldo si el PDF todavía no se detectó o si necesitás reemplazarlo.</p><form id="report-form" class="form-grid two"><label>Acta PDF<input id="report-file" type="file" accept="application/pdf,.pdf" required></label><div><button class="button secondary" type="submit">${(data.reports||[]).length?'Reemplazar / subir acta':'Adjuntar acta PDF'}</button></div></form>${reports?`<ul class="file-list">${reports}</ul>`:''}<div id="match-report-operation-status" class="message"></div><div id="report-review-panel"></div></div></details></section>`:'';
    const starterStats=(data.stats||[]).filter(s=>s.lineupRole==='STARTER');
    const advancedRows=starterStats.map(s=>`<tr data-stat-row><td><strong>${escapeHtml(s.playerName||'Sin identificar')}</strong><small>#${escapeHtml(s.jerseyNumber||'—')} · ${escapeHtml(s.licenseNumber||'')}${s.isCaptain==='TRUE'?' · Capitán':''}</small><input type="hidden" data-stat-field="isCaptain" value="${escapeHtml(s.isCaptain||'FALSE')}"><input type="hidden" data-stat-field="personId" value="${escapeHtml(s.personId||'')}"><input type="hidden" data-stat-field="playerName" value="${escapeHtml(s.playerName||'')}"><input type="hidden" data-stat-field="licenseNumber" value="${escapeHtml(s.licenseNumber||'')}"><input type="hidden" data-stat-field="jerseyNumber" value="${escapeHtml(s.jerseyNumber||'')}"><input type="hidden" data-stat-field="lineupRole" value="STARTER"></td><td>${escapeHtml(matchPresenceLabel_(s,data))}</td><td><input class="stat-mini" data-stat-field="tries" type="number" min="0" value="${escapeHtml(s.tries||'0')}"></td><td><input class="stat-mini" data-stat-field="conversions" type="number" min="0" value="${escapeHtml(s.conversions||'0')}"></td><td><input class="stat-mini" data-stat-field="penalties" type="number" min="0" value="${escapeHtml(s.penalties||'0')}"></td><td><input class="stat-mini" data-stat-field="drops" type="number" min="0" value="${escapeHtml(s.drops||'0')}"></td><td><input class="stat-mini" data-stat-field="points" type="number" min="0" value="${escapeHtml(s.points||'0')}"></td><td><input class="stat-mini" data-stat-field="yellowCards" type="number" min="0" value="${escapeHtml(s.yellowCards||'0')}"></td><td><input class="stat-mini" data-stat-field="redCards" type="number" min="0" value="${escapeHtml(s.redCards||'0')}"></td></tr>`).join('');
    const statsBlock=(data.stats||[]).length?`${officialMatchSummaryHtml_(data)}${data.canManage&&advancedRows?`<details class="advanced-stats"><summary>Correcciones avanzadas de titulares</summary><p>Usá esta tabla solo si necesitás corregir manualmente los totales consolidados del acta.</p><div class="table-wrap"><table><thead><tr><th>Jugador</th><th>Minutos</th><th>E</th><th>T</th><th>PC</th><th>D</th><th>Pts</th><th>Amar.</th><th>Rojas</th></tr></thead><tbody>${advancedRows}</tbody></table></div><button class="button secondary" id="save-match-stats">Guardar correcciones</button></details>`:''}`:'';
    const surveyBlock=`<section class="post-training-survey"><div><span class="eyebrow">Post-partido</span><h2>Encuesta post-partido</h2><p>${['IN_PROGRESS','COMPLETED'].includes(e.status)?'La encuesta quedará asociada a este partido cuando definamos sus preguntas.':'Se habilitará después del partido.'}</p></div><span class="status-pill warning">Pendiente</span></section>`;
    const summaryBody=`${participationBlock}${reportBlock}${statsBlock||(!summaryExists?`<div class="info-strip"><strong>Resumen deportivo pendiente.</strong> Se completará cuando el acta oficial sea procesada o se registren datos del partido.</div>`:'')}`;
    let content=section==='convocados'?lineupEditor:section==='survey'?surveyBlock:summaryBody;
    const planningHeader=matchHeaderHtml_(e,data.leagueMeta||data.meta||null,{compact:true});
    const tabs=eventWorkspaceTabsHtml_(e,section,{summaryExists:summaryExists,summaryVisible:summaryVisible,attendanceExists:false,officialLinks:!!currentAccessProfile_().capabilities?.manageCompetitions,refereeView:!!currentAccessProfile_().isAdmin&&eventHasClubRefereeClient_(eventId)});
    shell(`${planningHeader}<section class="panel match-workspace-panel">${tabs}<div class="event-section-host">${content}</div><div class="button-row"><button class="button secondary" id="planning-back">Volver al calendario</button></div><div id="message" class="message"></div></section>`,'calendar');
    wireEventWorkspaceTabs_(eventId,e,{summaryExists:summaryExists,summaryVisible:summaryVisible,officialLinks:!!currentAccessProfile_().capabilities?.manageCompetitions,refereeView:!!currentAccessProfile_().isAdmin&&eventHasClubRefereeClient_(eventId)});
    document.getElementById('planning-back').onclick=renderCalendar;
    const loadPrevious=document.getElementById('load-previous-lineup');if(loadPrevious)loadPrevious.onclick=()=>{if((data.lineup||[]).length&&!confirm('Esto reemplazará en pantalla la convocatoria actual por la del partido anterior. ¿Continuar?'))return;document.querySelectorAll('[data-lineup-person]').forEach(ch=>{const id=ch.dataset.lineupPerson,p=previousMap[id],order=document.querySelector(`[data-lineup-order="${id}"]`);ch.checked=!!p;if(p){const proposed=String(p.proposalOrderNo||p.orderNo||p.plannedOrderNo||'');if(order)order.value=lineupRoleForOrderClient_(proposed)?proposed:'';}else if(order)order.value='';});refreshLineupBuilder_();showToast_('Convocatoria anterior cargada como propuesta.');};
    const clearLineup=document.getElementById('clear-lineup');if(clearLineup)clearLineup.onclick=()=>{document.querySelectorAll('[data-lineup-person]').forEach(ch=>{const id=ch.dataset.lineupPerson;ch.checked=false;const order=document.querySelector(`[data-lineup-order="${id}"]`);if(order)order.value='';});refreshLineupBuilder_();showToast_('Propuesta limpiada.');};
    document.querySelectorAll('[data-lineup-person]').forEach(ch=>ch.addEventListener('change',refreshLineupBuilder_));document.querySelectorAll('[data-lineup-order]').forEach(sel=>sel.addEventListener('change',refreshLineupBuilder_));refreshLineupBuilder_();
    const sb=document.getElementById('save-lineup');if(sb)sb.onclick=async()=>{try{validateLineupBuilder_();const lineup=[];document.querySelectorAll('[data-lineup-person]').forEach(ch=>{if(ch.checked){const id=ch.dataset.lineupPerson,orderNo=document.querySelector(`[data-lineup-order="${id}"]`)?.value||'';lineup.push({personId:id,lineupRole:lineupRoleForOrderClient_(orderNo),orderNo});}});await call('saveMatchLineup',{eventId,lineup});invalidateMatchPlanningCache_(eventId);showToast_('Convocatoria confirmada.');await renderMatchPlanning(eventId,'convocados');}catch(err){showMessage(err.message,'error');}};
    const participationSelects=()=>[...document.querySelectorAll('[data-match-participation]')];
    const refreshParticipationConfirm_=()=>{const confirm=document.getElementById('confirm-match-participation');if(confirm)confirm.disabled=participationSelects().some(sel=>sel.value==='PENDING');};participationSelects().forEach(sel=>sel.onchange=refreshParticipationConfirm_);
    const participationPayload_=()=>participationSelects().map(sel=>({lineupId:sel.dataset.matchParticipation,participationStatus:sel.value}));
    const allPlayed=document.getElementById('mark-all-match-played');if(allPlayed)allPlayed.onclick=()=>{participationSelects().forEach(sel=>{sel.value='PLAYED';});refreshParticipationConfirm_();};
    const saveParticipationDraft=document.getElementById('save-match-participation-draft');if(saveParticipationDraft)saveParticipationDraft.onclick=async()=>{try{await call('saveMatchParticipationBatch',{eventId,participation:participationPayload_(),confirm:false});invalidateMatchPlanningCache_(eventId);showToast_('Borrador guardado.');await renderMatchPlanning(eventId,'summary');}catch(err){showMessage(err.message,'error');}};
    const confirmParticipation=document.getElementById('confirm-match-participation');if(confirmParticipation)confirmParticipation.onclick=async()=>{try{await call('saveMatchParticipationBatch',{eventId,participation:participationPayload_(),confirm:true});invalidateMatchPlanningCache_(eventId);invalidateCalendarCaches_();showToast_('Participación confirmada.');await renderMatchPlanning(eventId,'summary');}catch(err){showMessage(err.message,'error');}};
    const reopenParticipation=document.getElementById('reopen-match-participation');if(reopenParticipation)reopenParticipation.onclick=async()=>{if(!confirm('¿Reabrir la participación real?'))return;try{await call('reopenMatchParticipation',{eventId});invalidateMatchPlanningCache_(eventId);invalidateCalendarCaches_();await renderMatchPlanning(eventId,'summary');}catch(err){showMessage(err.message,'error');}};
    const ss=document.getElementById('save-match-stats');if(ss)ss.onclick=async()=>showMessage('Las correcciones manuales de totales se deshabilitaron temporalmente para no eliminar suplentes. Las incidencias del acta son la fuente de verdad.','warning');
    const farRefresh=document.getElementById('refresh-match-report-far');if(farRefresh)farRefresh.onclick=async()=>{farRefresh.disabled=true;showMessage('1/4 Consultando FAR y descargando acta…','info','match-report-operation-status');try{const {data:r}=await call('refreshMatchOfficialReport',{eventId});invalidateMatchPlanningCache_(eventId);if(r?.summaryData)primeMatchPlanningCache_(eventId,'summary',r.summaryData);invalidateCalendarCaches_();if(r.status==='PENDING')showToast_(r.message||'FAR todavía no publicó el acta.','warning',3200);else if(r.status==='ALREADY_PROCESSED')showToast_(r.message||'El acta oficial ya estaba procesada.','success',2800);else if(r.status==='REVIEW')showToast_(r.message||'Acta descargada; requiere revisión.','warning',3600);else showToast_(r.message||'Acta FAR actualizada, vinculada y aplicada al Resumen.','success',3600);await renderMatchPlanning(eventId,'summary');}catch(err){await recoverMatchReportOperation_(eventId,err);}finally{farRefresh.disabled=false;}};
    const rf=document.getElementById('report-form');if(rf)rf.onsubmit=async ev=>{ev.preventDefault();const f=document.getElementById('report-file').files?.[0];if(!f)return;let uploaded=false,result=null;const localBusy=beginUiBusy_('Leyendo PDF…');try{const dataUrl=await fileToDataUrl(f);let nativeText='';try{nativeText=await extractNativePdfText_(f);}catch(ignore){}endUiBusy_(localBusy);result=(await call('uploadMatchReport',{eventId,fileDataUrl:dataUrl,originalName:f.name,sourceText:nativeText})).data;uploaded=true;invalidateMatchPlanningCache_(eventId);if(result?.summaryData)primeMatchPlanningCache_(eventId,'summary',result.summaryData);invalidateCalendarCaches_();const msg=result?.autoApplied?`Acta procesada y aplicada al Resumen.${result.createdPlayers?` ${result.createdPlayers} jugador(es) nuevo(s) creado(s) y vinculado(s).`:''}${result.unmatchedPlayers?` ${result.unmatchedPlayers} pendiente(s) de vincular.`:''}`:'Acta guardada; requiere revisión antes de completar el Resumen.';showToast_(msg,result?.autoApplied?'success':'warning',3600);}catch(err){endUiBusy_(localBusy);await recoverMatchReportOperation_(eventId,err);return;}if(uploaded)await renderMatchPlanning(eventId,'summary');};
    document.querySelectorAll('[data-report-view]').forEach(b=>b.onclick=async()=>{try{const {data:f}=await call('getMatchReportFile',{reportId:b.dataset.reportView});const w=window.open();if(w)w.document.write(`<iframe src="${f.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`);}catch(err){showMessage(userErrorText_(err),'error');}});
    document.querySelectorAll('[data-report-refresh]').forEach(b=>b.onclick=async()=>{const btn=b;btn.disabled=true;const localBusy=beginUiBusy_('Leyendo y aplicando acta original…');try{let sourceText='';try{const {data:file}=await call('getMatchReportFile',{reportId:b.dataset.reportRefresh});if(file?.dataUrl)sourceText=await extractNativePdfText_(file.dataUrl);}catch(nativeErr){console.warn('No se pudo refrescar el texto nativo del PDF; se usará caché/OCR.',nativeErr);}endUiBusy_(localBusy);const {data:r}=await call('refreshMatchReportOfficialData',{reportId:b.dataset.reportRefresh,sourceText});invalidateMatchPlanningCache_(eventId);if(r?.summaryData)primeMatchPlanningCache_(eventId,'summary',r.summaryData);invalidateCalendarCaches_();if(r?.ok)showToast_(`Acta reprocesada y aplicada al Resumen sin crear duplicados.${r.createdPlayers?` ${r.createdPlayers} jugador(es) nuevo(s) vinculado(s).`:''}`,'success',3400);else showToast_('El acta requiere revisión antes de aplicarse.','warning',3400);await renderMatchPlanning(eventId,'summary');}catch(err){await recoverMatchReportOperation_(eventId,err);}finally{endUiBusy_(localBusy);btn.disabled=false;}});
    document.querySelectorAll('[data-report-people]').forEach(b=>b.onclick=()=>reviewAndCreateReportPeople(b.dataset.reportPeople,eventId));document.querySelectorAll('[data-report-apply]').forEach(b=>b.onclick=()=>reviewAndApplyReport(b.dataset.reportApply,eventId));
  }catch(err){shell(`<section class="panel narrow"><h1>No se pudo cargar el partido</h1><p>${escapeHtml(err.message)}</p><button class="button secondary" id="match-error-back">Volver al calendario</button></section>`,'calendar');document.getElementById('match-error-back')?.addEventListener('click',renderCalendar);}
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
  const apply=document.getElementById('report-review-apply');if(apply)apply.onclick=async()=>{try{if(v.ok===false)return showMessage('Corrige o reprocesa el acta antes de aplicarla.','error');const confirmed={homeTeam:ex.homeTeam||'',awayTeam:ex.awayTeam||'',resultHome:val('report-review-rh'),resultAway:val('report-review-ra'),refereeName:val('report-review-referee'),eventDate:ex.eventDate||'',startTime:ex.startTime||'',location:val('report-review-location')};showMessage('Aplicando datos del acta…');const {data:applied}=await call('applyMatchReport',{reportId,confirmed,reviewNotes:'Revisado desde interfaz · parser '+(review.parserVersion||'')});invalidateMatchPlanningCache_(eventId);if(applied?.summaryData)primeMatchPlanningCache_(eventId,'summary',applied.summaryData);invalidateCalendarCaches_();alert('Acta aplicada y sincronizada: los datos oficiales anteriores de este partido fueron actualizados, no duplicados.');renderMatchPlanning(eventId,'summary');}catch(err){showMessage(err.message,'error');}};
}
async function reviewAndApplyReport(reportId,eventId){try{
  let {data:review}=await call('getMatchReportReview',{reportId});
  const unmatched=(review.unmatched||[]).filter(x=>x.kind==='PLAYER'||['COACH','MANAGER'].includes(x.staffRole));
  if(unmatched.length){const preview=unmatched.slice(0,12).map(x=>`• ${x.name}${x.staffRole&&x.staffRole!=='PLAYER'?' · '+({COACH:'Entrenador',MANAGER:'Delegado',FIELD_DELEGATE:'Delegado de campo'}[x.staffRole]||x.staffRole):''}${x.licenseNumber?' · '+x.licenseNumber:''}`).join('\n');const more=unmatched.length>12?`\n… y ${unmatched.length-12} más.`:'';const canCreatePeople=!!currentAccessProfile_().isAdmin;if(canCreatePeople&&confirm(`Hay ${unmatched.length} personas de Marbella sin vincular:\n\n${preview}${more}\n\n¿Crear estas personas desde el acta?\nLos jugadores se asignarán a la división; entrenador/delegado conservarán su alcance correspondiente. El delegado de campo solo se registrará como dato del partido.`)){showMessage('Vinculando personas del acta…');const created=await call('createMatchReportPeople',{reportId,keys:unmatched.map(x=>x.key)});review=created.data.review;}else if(!canCreatePeople){alert(`Hay ${unmatched.length} personas sin vincular. Un administrador puede crearlas desde el acta.\n\n${preview}${more}`);}}
  renderMatchReportReviewPanel_(review,reportId,eventId);
}catch(err){showMessage(err.message,'error');}}
