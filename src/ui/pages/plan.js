// Plan Route — the planner and saved-route library from the mockup canvas.
// Two views behind a segmented control: 'planner' (Planner.dc.html) and
// 'library' (MyRoutes.dc.html). Every number shown comes from the real
// routing engine or the rider's saved routes.
import { APP } from '../../legacy.js';
import { icon } from '../icons.js';
import { rootHeader } from '../shell.js';
import { routeThumb, elevationChart, gradientLegend, staticRouteImage, difficultyFor, fmtKm, fmtM, fmtDuration } from '../graphics.js';

const SURFACES = ['Road', 'Gravel', 'MTB', 'Mixed'];

function state() {
  const S = APP.state;
  if (!S.planView) S.planView = 'planner';
  if (!S.libraryLayout) S.libraryLayout = 'grid';
  if (S.planRoundTrip === undefined) S.planRoundTrip = false;
  if (!S.planSurface) S.planSurface = 'Road';
  if (!Number.isFinite(S.planBearing)) S.planBearing = 35;
  if (!S.adventureRange) S.adventureRange = { minKm: 20, maxKm: 70 };
  return S;
}

function segmentedHtml(view) {
  return `<div class="segmented" id="planTabs">
    <button data-view="planner" class="${view === 'planner' ? 'on' : ''}">Planner</button>
    <button data-view="library" class="${view === 'library' ? 'on' : ''}">My routes</button>
  </div>`;
}

/* ------------------------------ planner ------------------------------ */

function dialHtml(bearing) {
  const label = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
  return `<div style="text-align:center">
    <svg id="dirDial" width="96" height="96" viewBox="0 0 96 96" style="display:block;touch-action:none;cursor:pointer">
      <circle cx="48" cy="48" r="44" fill="var(--surface-muted)" stroke="var(--line)"/>
      <g font-family="inherit" font-size="10" font-weight="700" fill="var(--muted)" text-anchor="middle">
        <text x="48" y="16">N</text><text x="84" y="52">E</text><text x="48" y="88">S</text><text x="12" y="52">W</text>
      </g>
      <g transform="rotate(${bearing} 48 48)">
        <path d="M48 18 L55 48 L48 43 L41 48z" fill="var(--accent)"/>
        <path d="M48 78 L41 48 L48 53 L55 48z" fill="var(--line)"/>
      </g>
      <circle cx="48" cy="48" r="5" fill="var(--surface)" stroke="var(--navy)" stroke-width="2"/>
    </svg>
    <small class="muted" style="font-size:11px;font-weight:700">Head ${label} · ${Math.round(bearing)}°</small>
  </div>`;
}

function routeResultHtml(route, i, selected) {
  const km = (route.distance || 0) / 1000;
  const diff = difficultyFor(km, route.ascent || 0);
  const infra = Number.isFinite(route.osmCycleScore) ? route.osmCycleScore : route.cycleScore;
  return `<article class="card ${selected ? '' : 'flat'}" style="padding:12px;${selected ? 'border-color:var(--blue);border-width:2px' : ''}" data-result="${i}">
    <div class="between">
      <div class="row" style="gap:10px">
        ${routeThumb(route.geometry?.coordinates, 44, 44, { radius: 10 })}
        <div>
          <b style="font-size:14px">${i === 0 ? 'Recommended' : `Option ${i + 1}`}</b>
          <div class="muted" style="font-size:11px;font-weight:600">${Number.isFinite(infra) ? `${infra}% cycle infrastructure` : 'Scoring…'}${route.cycleScorePending ? ' · refining' : ''}</div>
        </div>
      </div>
      <span class="badge ${diff.tone}">${diff.label}</span>
    </div>
    <div class="stats three" style="margin-top:10px">
      <div class="stat"><b>${fmtKm(km)}</b><small>distance</small></div>
      <div class="stat"><b>${Number.isFinite(route.ascent) ? fmtM(route.ascent) : '—'}</b><small>climb</small></div>
      <div class="stat"><b>${fmtDuration(route.duration)}</b><small>est. time</small></div>
    </div>
    <div style="margin-top:10px">
      <div class="between" style="margin-bottom:4px"><span class="label">Elevation</span>${gradientLegend()}</div>
      ${elevationChart(route.elev, 340, 78, { distanceKm: km })}
    </div>
    <div class="actions">
      <button class="btn primary sm" data-nav="${i}">${icon('navArrow', 16)}Navigate</button>
      <button class="btn light sm" data-save="${i}">${icon('heart', 16)}Save</button>
      <button class="btn light sm" data-share="${i}">${icon('share', 16)}Share</button>
      <button class="btn light sm" data-preview="${i}">${icon('eye', 16)}Preview</button>
      <button class="btn light sm" data-gpx="${i}">${icon('download', 16)}GPX</button>
    </div>
  </article>`;
}

function plannerHtml() {
  const S = state();
  const routes = Array.isArray(S.routes) ? S.routes : [];
  const finishIndex = Math.max(1, (S.waypoints?.length || 2) - 1);
  return `
  <div class="card pad flat">
    <div class="field">
      <label>Start</label>
      <div class="location-row"><div id="g0"></div><button class="iconbtn" id="useHereStart" title="Use my location">${icon('pin', 20)}</button></div>
    </div>
    <div id="waypointList"></div>
    <div id="waypointFields"></div>
    <button class="btn light sm" id="addWaypoint">${icon('plus', 16)}Add waypoint</button>
    <div class="field" style="margin-top:12px">
      <label>Finish</label>
      <div class="location-row"><div id="gFinish"></div><button class="iconbtn" id="useHereFinish" title="Use my location">${icon('pin', 20)}</button></div>
    </div>
  </div>

  <div class="card pad flat">
    <div class="between">
      <div><b style="font-size:14px;display:block">Round trip</b><span class="muted" style="font-size:12px;font-weight:600">Generate a loop back to the start</span></div>
      <button class="toggle ${S.planRoundTrip ? 'on' : ''}" id="roundTrip" aria-pressed="${S.planRoundTrip}"><i></i></button>
    </div>
    <div id="roundTripControls" ${S.planRoundTrip ? '' : 'hidden'} style="margin-top:12px">
      <div class="row" style="gap:14px;align-items:flex-start">
        <div style="flex:1">
          <div class="between" style="margin-bottom:2px"><span class="label">Distance</span><b style="color:var(--blue)" id="rangeLabel">${Math.round(S.adventureRange.minKm)}–${Math.round(S.adventureRange.maxKm)} km</b></div>
          <div class="dual-range">
            <div class="track"></div><div class="fill" id="rangeFill"></div>
            <input id="rangeMin" type="range" min="5" max="150" step="5" value="${Math.round(S.adventureRange.minKm)}">
            <input id="rangeMax" type="range" min="5" max="150" step="5" value="${Math.round(S.adventureRange.maxKm)}">
          </div>
        </div>
        ${dialHtml(S.planBearing)}
      </div>
    </div>
  </div>

  <div>
    <p class="section-title" style="margin-bottom:8px">Surface</p>
    <div class="row" id="surfaceChips" style="gap:8px;flex-wrap:wrap">${SURFACES.map((x) => `<button class="chip ${S.planSurface === x ? 'on' : ''}" data-surface="${x}">${x}</button>`).join('')}</div>
  </div>

  <button class="btn cta block" id="calcRoute">${icon('route', 18)}${S.planRoundTrip ? 'Generate loop' : 'Find routes'}</button>

  <div id="planResults" class="page" style="gap:12px">
    ${routes.length ? routes.map((r, i) => routeResultHtml(r, i, S.selected === i)).join('') : '<div class="empty">Set a start and finish, then find routes. Results show real distance, climbing and OpenStreetMap cycle-infrastructure coverage.</div>'}
  </div>`;
}

function wirePlanner() {
  const S = state();
  const { $ } = APP;

  APP.geo('#g0', 0);
  APP.geo('#gFinish', Math.max(1, (S.waypoints?.length || 2) - 1));
  if (S.names?.[0]) S.geocoders['#g0']?.setInput(S.names[0]);
  const fi = Math.max(1, (S.waypoints?.length || 2) - 1);
  if (S.names?.[fi]) S.geocoders['#gFinish']?.setInput(S.names[fi]);
  APP.renderWaypointFields();

  renderWaypointOrder();
  $('#useHereStart').onclick = () => APP.setHere(0);
  $('#useHereFinish').onclick = () => APP.setHere(Math.max(1, (S.waypoints?.length || 2) - 1));
  $('#addWaypoint').onclick = () => APP.addPointToPointWaypoint();

  $('#roundTrip').onclick = (e) => {
    S.planRoundTrip = !S.planRoundTrip;
    if (!S.planRoundTrip && S.pointPlan) {
      // Restore the start/finish the loop switch folded into via-points.
      S.waypoints = structuredClone(S.pointPlan.waypoints);
      S.names = structuredClone(S.pointPlan.names);
      S.pointPlan = null;
      S.adventureWaypoints = [];
      S.mode = 'point';
      render();
      return;
    }
    e.currentTarget.classList.toggle('on', S.planRoundTrip);
    const box = $('#roundTripControls');
    if (box) box.hidden = !S.planRoundTrip;
    const btn = $('#calcRoute');
    if (btn) btn.innerHTML = `${icon('route', 18)}${S.planRoundTrip ? 'Generate loop' : 'Find routes'}`;
  };

  const syncRange = () => {
    let lo = +$('#rangeMin').value, hi = +$('#rangeMax').value;
    if (lo > hi) [lo, hi] = [hi, lo];
    S.adventureRange = { minKm: lo, maxKm: hi };
    $('#rangeLabel').textContent = `${lo}–${hi} km`;
    const a = ((lo - 5) / 145) * 100, b = ((hi - 5) / 145) * 100;
    const fill = $('#rangeFill');
    fill.style.left = `${a}%`;
    fill.style.width = `${Math.max(0, b - a)}%`;
  };
  if ($('#rangeMin')) {
    $('#rangeMin').oninput = syncRange;
    $('#rangeMax').oninput = syncRange;
    syncRange();
  }

  const dial = $('#dirDial');
  if (dial) {
    const setFromEvent = (e) => {
      const r = dial.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      S.planBearing = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      const g = dial.querySelector('g[transform]');
      if (g) g.setAttribute('transform', `rotate(${S.planBearing} 48 48)`);
      const lbl = dial.parentElement.querySelector('small');
      const name = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(S.planBearing / 45) % 8];
      if (lbl) lbl.textContent = `Head ${name} · ${Math.round(S.planBearing)}°`;
    };
    dial.onpointerdown = (e) => { dial.setPointerCapture(e.pointerId); setFromEvent(e); dial.onpointermove = setFromEvent; };
    dial.onpointerup = () => { dial.onpointermove = null; };
  }

  $('#surfaceChips').onclick = (e) => {
    const b = e.target.closest('[data-surface]');
    if (!b) return;
    S.planSurface = b.dataset.surface;
    $('#surfaceChips').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  };

  $('#calcRoute').onclick = async () => {
    if (S.planRoundTrip) {
      const start = S.waypoints?.[0] || (await APP.current());
      if (!start) return APP.toast('Set a start point first');
      // A round trip is still a trip TO somewhere. Everything the rider set
      // after the start becomes a required via-point on the loop, so the
      // generated route goes past their destination instead of ignoring it.
      const turf = window.turf;
      const away = (p) => Array.isArray(p) && turf.distance(p, start, { units: 'kilometers' }) > 0.05;
      const vias = (S.waypoints || []).slice(1).filter(away);
      if (vias.length) {
        S.adventureWaypoints = vias.map((coord, i) => ({ coord, name: S.names?.[i + 1] || '' }));
      }
      // Keep the point-to-point pair so switching the toggle back restores it.
      S.pointPlan = { waypoints: structuredClone(S.waypoints || []), names: structuredClone(S.names || []) };
      S.mode = 'loop';
      S.waypoints = [start, start];
      S.names = [S.names?.[0] || '', S.names?.[0] || ''];
      await APP.adventureRoutes(false);
    } else {
      if (!S.waypoints?.[0] || !S.waypoints?.at(-1)) return APP.toast('Set both a start and a finish');
      S.mode = 'point';
      await APP.pointRoutes(false);
    }
    render();
  };

  wireResults();
}

function wireResults() {
  const { $ } = APP;
  const results = $('#planResults');
  if (results) results.onclick = (e) => {
    const hit = (sel) => e.target.closest(`[data-${sel}]`);
    const nav = hit('nav'), save = hit('save'), share = hit('share'), prev = hit('preview'), gpx = hit('gpx'), card = hit('result');
    if (nav) { e.stopPropagation(); APP.select(+nav.dataset.nav); APP.startNavigation(); return; }
    if (save) { e.stopPropagation(); APP.saveRouteByIndex(+save.dataset.save); return; }
    if (share) { e.stopPropagation(); APP.shareRouteByIndex(+share.dataset.share); return; }
    if (prev) { e.stopPropagation(); APP.select(+prev.dataset.preview); APP.previewRoute3D(); return; }
    if (gpx) { e.stopPropagation(); APP.select(+gpx.dataset.gpx); APP.exportSelectedRouteGpx(); return; }
    if (card) { APP.select(+card.dataset.result); refreshResults(); }
  };
}

/**
 * A/B/C list of the set waypoints, draggable to reorder (roadmap item 9).
 * Reordering rewrites S.waypoints/S.names and recalculates immediately.
 */
function renderWaypointOrder() {
  const S = state();
  const host = APP.$('#waypointList');
  if (!host) return;
  const pts = (S.waypoints || []).map((coord, i) => ({ coord, name: S.names?.[i] || '', i })).filter((p) => Array.isArray(p.coord));
  if (pts.length < 2) { host.innerHTML = ''; return; }
  const letter = (i) => String.fromCharCode(65 + i);
  const tone = (i) => (i === 0 ? 'var(--accent)' : i === pts.length - 1 ? 'var(--blue)' : 'var(--navy)');
  host.innerHTML = `<div class="card flat" style="padding:4px 12px;margin-bottom:10px">
    ${pts.map((p, i) => `<div class="item waypoint-row" draggable="true" data-wp="${p.i}" data-pos="${i}" style="gap:10px;padding:9px 0;cursor:grab">
      <span class="muted">${icon('drag', 18)}</span>
      <span style="width:26px;height:26px;border-radius:50%;background:${tone(i)};color:#fff;font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center">${letter(i)}</span>
      <span style="flex:1;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${APP.escapeHtml(p.name || 'Dropped pin')}</span>
      ${pts.length > 2 ? `<button class="iconbtn plain" data-wp-remove="${p.i}" title="Remove">${icon('x', 16)}</button>` : ''}
    </div>`).join('')}
  </div>`;

  let dragFrom = null;
  host.querySelectorAll('[data-wp]').forEach((row) => {
    row.ondragstart = (e) => { dragFrom = +row.dataset.pos; row.style.opacity = '.5'; e.dataTransfer.effectAllowed = 'move'; };
    row.ondragend = () => { row.style.opacity = ''; };
    row.ondragover = (e) => { e.preventDefault(); row.style.borderTop = '2px solid var(--blue)'; };
    row.ondragleave = () => { row.style.borderTop = ''; };
    row.ondrop = (e) => {
      e.preventDefault();
      row.style.borderTop = '';
      const to = +row.dataset.pos;
      if (dragFrom === null || dragFrom === to) return;
      const wp = [...S.waypoints], nm = [...(S.names || [])];
      const [movedWp] = wp.splice(dragFrom, 1);
      const [movedNm] = nm.splice(dragFrom, 1);
      wp.splice(to, 0, movedWp);
      nm.splice(to, 0, movedNm);
      S.waypoints = wp; S.names = nm;
      dragFrom = null;
      render();
      if (S.waypoints.length > 1 && S.waypoints.every(Boolean)) APP.pointRoutes(false);
    };
  });
  host.querySelectorAll('[data-wp-remove]').forEach((b) => {
    b.onclick = () => {
      const i = +b.dataset.wpRemove;
      S.waypoints.splice(i, 1);
      (S.names || []).splice(i, 1);
      render();
      if (S.waypoints.length > 1 && S.waypoints.every(Boolean)) APP.pointRoutes(false);
    };
  });
}

/* ------------------------------ library ------------------------------ */

function collectionsOf(items) {
  const set = new Set();
  items.forEach((x) => { if (x.collection) set.add(x.collection); });
  return [...set];
}

function savedCardHtml(item, i) {
  const route = item.route || {};
  const km = (route.distance || 0) / 1000;
  const diff = difficultyFor(km, route.ascent || 0);
  const coords = route.geometry?.coordinates;
  const img = coords ? staticRouteImage(coords, APP.MAPBOX_TOKEN, { w: 340, h: 190 }) : null;
  return `<article class="route-card" data-saved="${i}">
    <div class="route-media">
      ${img ? `<img src="${img}" alt="" loading="lazy">` : routeThumb(coords, 170, 96, { radius: 0 })}
      <div class="thumb-chip">${routeThumb(coords, 34, 34, { radius: 8 })}</div>
    </div>
    <div class="route-body">
      <b>${APP.escapeHtml(item.name || 'Saved route')}</b>
      <span>${fmtKm(km)} · ${fmtM(route.ascent || 0)}${item.mode === 'loop' ? ' · loop' : ''}</span>
      <div class="between">
        <span class="badge ${diff.tone}">${diff.label}</span>
        <div class="row" style="gap:4px">
          <button class="iconbtn plain" data-open="${i}" title="Open">${icon('route', 18)}</button>
          <button class="iconbtn plain" data-share-saved="${i}" title="Share">${icon('share', 18)}</button>
          <button class="iconbtn plain" data-del="${i}" title="Delete">${icon('x', 18)}</button>
        </div>
      </div>
    </div>
  </article>`;
}

function libraryHtml() {
  const S = state();
  if (!S.user) {
    return `<div class="card account-required"><h2>Sign in required</h2><p>Saved routes are private to your account and sync across your devices.</p><button class="btn primary" id="libSignIn">Sign in</button></div>`;
  }
  const all = S.accountRoutes || [];
  const cols = collectionsOf(all);
  const active = S.libraryCollection || 'All routes';
  const items = active === 'All routes' ? all : all.filter((x) => x.collection === active);
  return `
  <div class="between">
    <div class="hscroll" id="collections" style="flex:1">
      ${['All routes', ...cols].map((c) => `<button class="chip ${active === c ? 'on' : ''}" data-collection="${APP.escapeHtml(c)}">${c === 'All routes' ? '' : icon('folder', 14)}${APP.escapeHtml(c)}</button>`).join('')}
    </div>
    <div class="segmented" id="layoutToggle" style="width:88px;flex:0 0 auto">
      <button data-layout="grid" class="${S.libraryLayout === 'grid' ? 'on' : ''}">${icon('grid', 18)}</button>
      <button data-layout="list" class="${S.libraryLayout === 'list' ? 'on' : ''}">${icon('list', 18)}</button>
    </div>
  </div>
  <label class="btn light block" style="cursor:pointer">${icon('download', 18)}Import GPX<input id="importGpx" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden></label>
  ${items.length
    ? `<div class="route-grid ${S.libraryLayout === 'list' ? 'list' : ''}" id="savedGrid">${items.map((item) => savedCardHtml(item, all.indexOf(item))).join('')}</div>`
    : `<div class="empty">${all.length ? 'Nothing saved in this collection yet.' : 'No saved routes yet. Save a route from the planner or Adventure and it appears here.'}</div>`}`;
}

function wireLibrary() {
  const S = state();
  const { $ } = APP;
  if (!S.user) {
    const b = $('#libSignIn');
    if (b) b.onclick = () => APP.open('profile');
    return;
  }
  $('#importGpx').onchange = (e) => APP.importGpxFile(e.target.files[0]);
  $('#layoutToggle').onclick = (e) => {
    const b = e.target.closest('[data-layout]');
    if (!b) return;
    S.libraryLayout = b.dataset.layout;
    render();
  };
  $('#collections').onclick = (e) => {
    const b = e.target.closest('[data-collection]');
    if (!b) return;
    S.libraryCollection = b.dataset.collection;
    render();
  };
  const grid = $('#savedGrid');
  if (grid) grid.onclick = async (e) => {
    const saved = S.accountRoutes || [];
    const open = e.target.closest('[data-open]');
    const share = e.target.closest('[data-share-saved]');
    const del = e.target.closest('[data-del]');
    const card = e.target.closest('[data-saved]');
    if (open) { e.stopPropagation(); APP.loadSavedRoute(saved[+open.dataset.open], true); return; }
    if (share) { e.stopPropagation(); APP.shareSavedRouteByIndex(+share.dataset.shareSaved); return; }
    if (del) {
      e.stopPropagation();
      const item = saved[+del.dataset.del];
      if (!item || !confirm(`Delete "${item.name || 'this route'}"?`)) return;
      await APP.deleteAccountItem('routes', item.id);
      render();
      return;
    }
    if (card) APP.loadSavedRoute(saved[+card.dataset.saved], true);
  };
}

/* ------------------------------ render ------------------------------ */

/**
 * Repaints ONLY the results list. Route calculation finishing must never
 * tear down the geocoder fields the rider is still filling in.
 */
export function refreshResults() {
  const S = state();
  const host = APP.$('#planResults');
  if (!host) return false;
  const routes = Array.isArray(S.routes) ? S.routes : [];
  host.innerHTML = routes.length
    ? routes.map((r, i) => routeResultHtml(r, i, S.selected === i)).join('')
    : '<div class="empty">Set a start and finish, then find routes.</div>';
  wireResults();
  return true;
}

export async function render() {
  const S = state();
  APP.panel.innerHTML = `<div class="page">
    ${rootHeader('Plan route', 'Build a route, or open one you saved')}
    ${segmentedHtml(S.planView)}
    <div id="planBody" class="page">${S.planView === 'library' ? libraryHtml() : plannerHtml()}</div>
  </div>`;

  APP.$('#planTabs').onclick = (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    S.planView = b.dataset.view;
    render();
  };
  if (S.planView === 'library') wireLibrary();
  else wirePlanner();
}
