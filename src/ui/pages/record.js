// Record — live recording, the post-ride summary and the activity library,
// from the mockup's LiveStats and PostRide artboards. All metrics come from
// the recorder's real GPS samples; achievements are only shown when they can
// be proven against the rider's own saved activities.
import { APP } from '../../legacy.js';
import { icon } from '../icons.js';
import { viewHeader, rootHeader, wireHeader } from '../shell.js';
import { routeThumb, staticRouteImage, fmtKm, fmtM } from '../graphics.js';

const SORTS = [
  ['date-desc', 'Newest first'], ['distance-desc', 'Distance: high to low'], ['distance-asc', 'Distance: low to high'],
  ['gain-desc', 'Elevation: high to low'], ['gain-asc', 'Elevation: low to high'],
  ['speed-desc', 'Speed: high to low'], ['speed-asc', 'Speed: low to high'],
  ['effort-desc', 'Effort: high to low'], ['effort-asc', 'Effort: low to high'],
];

const recordedTrace = (a) => (a?.samples || []).map((s) => s.pos).filter(Boolean);
const traceOf = (a) => {
  const recorded = recordedTrace(a);
  if (recorded.length > 1) return recorded;
  return Array.isArray(a?.plannedRoute) && a.plannedRoute.length > 1 ? a.plannedRoute : recorded;
};
/* True when the only line we have is the route the rider intended, not the one
   they rode -- the previews say so rather than implying it was ridden. */
const traceIsPlanned = (a) => recordedTrace(a).length <= 1 && Array.isArray(a?.plannedRoute) && a.plannedRoute.length > 1;

/* Only genuine, checkable achievements — each is computed against every other
   saved activity, and nothing is shown when it cannot be proven. */
function achievementsFor(activity, others) {
  const out = [];
  const rest = others.filter((x) => x !== activity && x.id !== activity.id);
  if (!rest.length) { out.push({ icon: 'flag', label: 'First saved ride', tone: 'var(--green)' }); return out; }
  if (rest.every((x) => (x.distance || 0) < (activity.distance || 0))) out.push({ icon: 'route', label: 'Longest ride yet', tone: 'var(--blue)' });
  if (rest.every((x) => (x.gain || 0) < (activity.gain || 0))) out.push({ icon: 'mtn', label: 'Biggest climb yet', tone: 'var(--accent)' });
  if (rest.every((x) => (x.avgSpeed || 0) < (activity.avgSpeed || 0))) out.push({ icon: 'bolt', label: 'Fastest average yet', tone: 'var(--gold)' });
  return out;
}

/* ---------------------------- activity detail ---------------------------- */

function detailHtml(a, index) {
  const S = APP.state;
  const trace = traceOf(a);
  const img = trace.length > 1 ? staticRouteImage(trace, APP.MAPBOX_TOKEN, { w: 640, h: 300 }) : null;
  const weight = APP.profileData().weight || 70;
  const photos = a.photos || [a.photo].filter(Boolean);
  const wins = achievementsFor(a, S.accountActivities || []);
  return `<div class="page">
    ${viewHeader(a.name || 'Activity', new Date(a.ended || a.started || Date.now()).toLocaleString())}
    <div class="card hero-card">
      <div class="hero-media" style="height:170px">${img ? `<img src="${img}" alt="${traceIsPlanned(a) ? 'Planned route' : 'Route ridden'}" loading="lazy">` : routeThumb(trace, 358, 170, { radius: 0 })}
        ${traceIsPlanned(a) ? '<span class="mini-tag">Planned route</span>' : ''}</div>
    </div>
    ${wins.length ? `<section><p class="section-title" style="margin-bottom:8px">Achievements</p><div class="row" style="gap:8px;flex-wrap:wrap">${wins.map((w) => `<span class="badge gold" style="min-height:30px;padding:0 12px">${icon(w.icon, 14)}${w.label}</span>`).join('')}</div></section>` : ''}
    <div class="stats">
      <div class="stat tile"><b>${fmtKm(a.distance)}</b><small>distance</small></div>
      <div class="stat tile"><b>${(a.avgSpeed || 0).toFixed(1)}</b><small>avg km/h</small></div>
      <div class="stat tile"><b>${fmtM(a.gain)}</b><small>climb</small></div>
      <div class="stat tile"><b>${APP.formatClock(a.elapsed || 0)}</b><small>moving</small></div>
      <div class="stat tile"><b>${Math.round(a.effortScore || 0)}</b><small>effort</small></div>
      <div class="stat tile"><b>${Math.round(a.avgPower || 0)}</b><small>est. watts</small></div>
      <div class="stat tile"><b>${((a.avgPower || 0) / weight).toFixed(2)}</b><small>W/kg</small></div>
      <div class="stat tile"><b>${Math.round(a.maxSpeed || 0)}</b><small>max km/h</small></div>
    </div>
    <p class="metric-note">Power and effort are estimates from GPS speed, elevation and your rider profile — not power-meter readings.</p>
    <section>
      <div class="between" style="margin-bottom:6px"><span class="section-title">Photos</span>
        <label class="btn light sm" style="cursor:pointer">${icon('plus', 16)}Add<input id="addPhotos" type="file" accept="image/*" multiple hidden></label>
      </div>
      ${photos.length ? `<div class="photo-grid">${photos.map((p, i) => `<div><img src="${p}" alt=""><button data-del-photo="${i}">×</button></div>`).join('')}</div>` : '<div class="empty" style="padding:14px">No photos on this ride.</div>'}
    </section>
    <section class="card pad flat">
      <div class="label">Speed (km/h)</div><canvas id="activitySpeed" class="chart detail-chart"></canvas>
      <div class="label">Elevation (m)</div><canvas id="activityElevation" class="chart detail-chart"></canvas>
      <div class="label">Wind at ride time</div><canvas id="activityWind" class="chart detail-chart"></canvas>
      <div class="label">Estimated power (W)</div><canvas id="activityPower" class="chart detail-chart"></canvas>
      ${(a.samples || []).some((x) => Number.isFinite(x.heartRate)) ? '<div class="label">Heart rate (bpm)</div><canvas id="activityHr" class="chart detail-chart"></canvas>' : ''}
      ${(a.samples || []).some((x) => Number.isFinite(x.cadence)) ? '<div class="label">Cadence (rpm)</div><canvas id="activityCad" class="chart detail-chart"></canvas>' : ''}
    </section>
    <div class="actions">
      <button class="btn primary" id="useRoute">${icon('route', 16)}Use this route</button>
      <button class="btn light" id="renameAct">${icon('sliders', 16)}Rename</button>
      <button class="btn light" id="shareAct">${icon('share', 16)}Share</button>
      <button class="btn light" id="pngAct">${icon('camera', 16)}Export PNG</button>
    </div>
  </div>`;
}

function wireDetail(a, index) {
  const S = APP.state;
  const { $ } = APP;
  APP.displayActivityRoute(a);
  requestAnimationFrame(() => {
    const s = a.samples || [];
    APP.plot($('#activitySpeed'), s.map((x) => (x.speed || 0) * 3.6), '#f28b30', 'km/h');
    APP.plot($('#activityElevation'), s.map((x) => x.elevation).filter(Number.isFinite), '#139b66', 'm');
    APP.plot($('#activityWind'), s.map((x) => x.windSpeed).filter(Number.isFinite), '#176bdb', 'km/h');
    APP.plot($('#activityPower'), s.map((x) => x.estimatedPower || 0), '#8b5bd6', 'W');
    if ($('#activityHr')) APP.plot($('#activityHr'), s.map((x) => x.heartRate).filter(Number.isFinite), '#d94d4d', 'bpm');
    if ($('#activityCad')) APP.plot($('#activityCad'), s.map((x) => x.cadence).filter(Number.isFinite), '#00a6a6', 'rpm');
  });
  wireHeader(() => { S.activityDetailIndex = null; render(); });
  $('#addPhotos').onchange = (e) => APP.addPhotosToSavedActivity(index, [...e.target.files]);
  $('#useRoute').onclick = () => APP.useSavedActivityRoute(a);
  $('#renameAct').onclick = () => APP.renameSavedActivity(index);
  $('#shareAct').onclick = () => APP.shareSavedActivity(a);
  $('#pngAct').onclick = () => APP.exportActivityPng(a);
  APP.panel.querySelectorAll('[data-del-photo]').forEach((b) => {
    b.onclick = () => APP.deleteSavedPhoto(index, +b.dataset.delPhoto);
  });
}

/* --------------------------- post-ride summary --------------------------- */

function pendingHtml(d) {
  const S = APP.state;
  const trace = traceOf(d);
  const img = trace.length > 1 ? staticRouteImage(trace, APP.MAPBOX_TOKEN, { w: 640, h: 300 }) : null;
  const photos = d.photos || [];
  const wins = achievementsFor(d, S.accountActivities || []);
  return `<div class="page">
    ${rootHeader('Ride complete', 'Name it, add photos, then save')}
    <div class="card hero-card"><div class="hero-media" style="height:170px">${img ? `<img src="${img}" alt="">` : routeThumb(trace, 358, 170, { radius: 0 })}</div></div>
    <div class="field"><label>Activity name</label><input id="activityName" type="text" value="${APP.escapeHtml(d.name || '')}"></div>
    <div class="stats">
      <div class="stat tile"><b>${fmtKm(d.distance)}</b><small>distance</small></div>
      <div class="stat tile"><b>${(d.avgSpeed || 0).toFixed(1)}</b><small>avg km/h</small></div>
      <div class="stat tile"><b>${fmtM(d.gain)}</b><small>climb</small></div>
      <div class="stat tile"><b>${Math.round(d.effortScore || 0)}</b><small>effort</small></div>
    </div>
    ${wins.length ? `<section><p class="section-title" style="margin-bottom:8px">Achievements</p><div class="row" style="gap:8px;flex-wrap:wrap">${wins.map((w) => `<span class="badge gold" style="min-height:30px;padding:0 12px">${icon(w.icon, 14)}${w.label}</span>`).join('')}</div></section>` : ''}
    <section>
      <div class="between" style="margin-bottom:6px"><span class="section-title">Photos</span><span class="muted" style="font-size:12px;font-weight:600">${photos.length}/6</span></div>
      <div class="photo-grid">
        ${photos.map((p, i) => `<div><img src="${p}" alt=""><button data-del-pending="${i}">×</button></div>`).join('')}
        ${photos.length < 6 ? `<label class="photo-add" style="cursor:pointer">${icon('plus', 22)}<input id="activityPhotos" type="file" accept="image/*" multiple hidden></label>` : ''}
      </div>
    </section>
    <div class="card pad flat between">
      <div><b style="font-size:14px;display:block">Share to feed</b><span class="muted" style="font-size:12px;font-weight:600">Visible to riders who follow you</span></div>
      <input type="checkbox" id="shareToFeed" checked hidden>
      <button class="toggle on" id="shareToggle" aria-pressed="true"><i></i></button>
    </div>
    <div class="row" style="gap:10px">
      <button class="btn light" id="discardActivity" style="flex:1">Discard</button>
      <button class="btn cta" id="saveActivity" style="flex:2">Save ride</button>
    </div>
  </div>`;
}

function wirePending() {
  const S = APP.state;
  const { $ } = APP;
  const photos = $('#activityPhotos');
  if (photos) photos.onchange = (e) => APP.attachActivityPhotos([...e.target.files]);
  $('#shareToggle').onclick = (e) => {
    const box = $('#shareToFeed');
    box.checked = !box.checked;
    e.currentTarget.classList.toggle('on', box.checked);
    e.currentTarget.setAttribute('aria-pressed', String(box.checked));
  };
  $('#saveActivity').onclick = () => APP.savePendingActivity();
  $('#discardActivity').onclick = () => { S.pendingActivity = null; render(); };
  APP.panel.querySelectorAll('[data-del-pending]').forEach((b) => {
    b.onclick = () => { S.pendingActivity.photos.splice(+b.dataset.delPending, 1); render(); };
  });
}

/* ------------------------------ record home ------------------------------ */

function activityRowHtml(a, index) {
  const trace = traceOf(a);
  return `<article class="route-card" data-activity="${index}" style="display:grid;grid-template-columns:96px 1fr">
    <div class="route-media" style="height:100%;min-height:86px">${trace.length > 1
      ? `<img src="${staticRouteImage(trace, APP.MAPBOX_TOKEN, { w: 192, h: 172 })}" alt="${traceIsPlanned(a) ? 'Planned route' : 'Route ridden'}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">
         ${traceIsPlanned(a) ? '<span class="mini-tag">Planned</span>' : ''}`
      : `<div class="mini-media-empty">${icon('route', 15)}<span>No route</span></div>`}</div>
    <div class="route-body">
      <b>${APP.escapeHtml(a.name || 'Cycling activity')}</b>
      <span>${new Date(a.ended || a.started || Date.now()).toLocaleDateString()}</span>
      <div class="row" style="gap:12px;font-size:12px;font-weight:700">
        <span>${fmtKm(a.distance)}</span><span>${fmtM(a.gain)}</span><span>${(a.avgSpeed || 0).toFixed(1)} km/h</span>
      </div>
    </div>
  </article>`;
}

function homeHtml() {
  const S = APP.state;
  const r = S.record;
  const list = APP.sortedActivities();
  const live = r
    ? `<div class="card pad flat">
        <div class="between" style="margin-bottom:10px"><span class="row" style="gap:8px;font-weight:800">${icon('record', 18)}${r.paused ? 'Paused' : 'Recording'}</span><span class="badge ${r.paused ? 'orange' : 'green'}">${APP.formatClock(r.movingMs)}</span></div>
        <div class="stats">
          <div class="stat tile"><b>${APP.displaySpeed(r).toFixed(1)}</b><small>${r.paused ? 'avg' : 'current'} km/h</small></div>
          <div class="stat tile"><b>${(r.distance || 0).toFixed(2)}</b><small>km</small></div>
          <div class="stat tile"><b>${Math.round(r.gain || 0)}</b><small>m gain</small></div>
          <div class="stat tile"><b>${Math.round(r.samples?.at(-1)?.estimatedPower || 0)}</b><small>est. W</small></div>
        </div>
        <div class="row" style="gap:10px;margin-top:12px">
          <button class="btn light" id="stopRec" style="flex:1">Stop recording</button>
          ${S.navState ? '<button class="btn danger" id="endNav" style="flex:1">End navigation</button>' : ''}
        </div>
      </div>`
    : `<button class="btn cta block" id="startRec" style="min-height:56px">${icon('record', 22)}Start recording</button>`;

  return `<div class="page">
    ${rootHeader('Record', r ? 'Ride in progress' : 'Track a ride and review your activities')}
    ${live}
    <div class="card pad flat">
      <div class="between" style="margin-bottom:8px"><span class="section-title">Sensors</span><span class="muted" style="font-size:11px;font-weight:700" id="sensorState"></span></div>
      <div class="row" style="gap:8px">
        <button class="btn light sm" id="connectHr" style="flex:1">${icon('heartRate', 16)}Heart rate</button>
        <button class="btn light sm" id="connectCad" style="flex:1">${icon('cadence', 16)}Cadence</button>
      </div>
    </div>
    <div class="between">
      <span class="section-title">Activities</span>
      <select id="activitySort" style="width:auto;min-height:38px;font-size:13px">${SORTS.map(([v, l]) => `<option value="${v}" ${S.activitySort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    ${list.length ? `<div class="route-grid list" id="activityList">${list.map((x) => activityRowHtml(x.activity, x.index)).join('')}</div>` : '<div class="empty">Completed rides appear here once you record and save one.</div>'}
  </div>`;
}

function wireHome() {
  const S = APP.state;
  const { $ } = APP;
  const start = $('#startRec');
  if (start) start.onclick = () => APP.startRecord(false);
  const stop = $('#stopRec');
  if (stop) stop.onclick = () => APP.stopRecording();
  const end = $('#endNav');
  if (end) end.onclick = () => APP.endNavigation();
  const sensors = APP.sensors;
  const sensorState = $('#sensorState');
  const paintSensors = () => {
    if (!sensorState) return;
    if (!sensors.isSupported()) { sensorState.textContent = 'Not supported on this browser'; return; }
    const bits = [];
    if (sensors.hrConnected()) bits.push('HR connected');
    if (sensors.cadenceConnected()) bits.push('Cadence connected');
    sensorState.textContent = bits.length ? bits.join(' · ') : 'Not connected';
  };
  paintSensors();
  const connect = async (fn, btn) => {
    if (!sensors.isSupported()) return APP.toast('Bluetooth sensors need Chrome on Android or desktop');
    btn.disabled = true;
    try { const name = await fn(); APP.toast(`Connected ${name}`); }
    catch (e) { if (e?.name !== 'NotFoundError') APP.toast(e.message || 'Could not connect'); }
    finally { btn.disabled = false; paintSensors(); }
  };
  const hrBtn = $('#connectHr'); if (hrBtn) hrBtn.onclick = () => connect(sensors.connectHeartRate, hrBtn);
  const cadBtn = $('#connectCad'); if (cadBtn) cadBtn.onclick = () => connect(sensors.connectCadence, cadBtn);
  const sort = $('#activitySort');
  if (sort) sort.onchange = (e) => { S.activitySort = e.target.value; render(); };
  const list = $('#activityList');
  if (list) list.onclick = (e) => {
    const card = e.target.closest('[data-activity]');
    if (!card) return;
    S.activityDetailIndex = +card.dataset.activity;
    render();
  };
}

/* -------------------------------- render -------------------------------- */

export async function render() {
  const S = APP.state;
  const activities = S.accountActivities || [];

  if (Number.isInteger(S.activityDetailIndex) && activities[S.activityDetailIndex]) {
    const a = activities[S.activityDetailIndex];
    APP.panel.innerHTML = detailHtml(a, S.activityDetailIndex);
    wireDetail(a, S.activityDetailIndex);
    return;
  }
  if (S.pendingActivity) {
    APP.panel.innerHTML = pendingHtml(S.pendingActivity);
    wirePending();
    return;
  }
  if (!S.user && !S.record) {
    APP.panel.innerHTML = `<div class="page">${rootHeader('Record', 'Ride recording and activities')}
      <div class="card account-required"><h2>Sign in required</h2><p>Recorded rides are stored in your account so they sync across devices.</p><button class="btn primary" id="recSignIn">Sign in</button></div></div>`;
    APP.$('#recSignIn').onclick = () => APP.open('profile');
    return;
  }
  APP.panel.innerHTML = homeHtml();
  wireHome();
}
