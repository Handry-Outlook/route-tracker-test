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
          <div class="muted" style="font-size:11px;font-weight:600">${route.cycleScorePending && !Number.isFinite(route.osmCycleScore) ? 'Checking cycle infrastructure…' : Number.isFinite(infra) ? `${infra}% cycle infrastructure` : 'Cycle infrastructure unknown'}</div>
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
      ${elevationChart(route.elev, 340, 78, { distanceKm: km, pending: !route.elev?.length && !route.elevUnavailable })}
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

/* ------------------------------ stop list -------------------------------

   The planner used to show the same stops three ways at once — a Start field,
   an A/B reorder list, and separate waypoint fields that only existed after
   pressing "Add waypoint" — plus a Finish field. A stop added on the map landed
   in none of them. Now every stop is one row: its letter (matching the pin on
   the map), its own search field, and reorder / remove / locate controls. The
   first row is the start and the last is the finish; there is nothing else. */

function stops() {
  const S = state();
  if (!Array.isArray(S.waypoints)) S.waypoints = [];
  if (!Array.isArray(S.names)) S.names = [];
  while (S.waypoints.length < 2) S.waypoints.push(null);
  while (S.names.length < S.waypoints.length) S.names.push('');
  return S.waypoints;
}

function stopsHtml() {
  const list = stops();
  const n = list.length;
  const rows = list.map((_, i) => {
    const role = i === 0 ? 'start' : i === n - 1 ? 'finish' : 'via';
    const label = role === 'start' ? 'Start' : role === 'finish' ? 'Finish' : `Stop ${i}`;
    const action = role === 'start' || (role === 'finish' && n === 2)
      ? `<button class="iconbtn plain stop-action" data-here="${i}" title="Use my location" aria-label="Use my location for ${label}">${icon('pin', 18)}</button>`
      : `<button class="iconbtn plain stop-action" data-remove-stop="${i}" title="Remove" aria-label="Remove ${label}">${icon('x', 16)}</button>`;
    return `<div class="stop-row" data-stop="${i}">
      <button class="stop-grip" data-grip="${i}" aria-label="Reorder ${label}" ${n < 3 ? 'disabled' : ''}>${icon('drag', 16)}</button>
      <span class="stop-badge ${role}" aria-hidden="true">${APP.stopLetter(i)}</span>
      <div class="stop-field" id="stop-${i}" aria-label="${label}"></div>
      ${action}
    </div>`;
  }).join('');
  return `<div class="stops" id="stops">${rows}</div>
    <div class="stops-foot">
      <button class="btn light sm" id="addStop">${icon('plus', 16)}Add stop</button>
      <span class="muted">or tap and hold the map</span>
    </div>`;
}

function wireStops() {
  const S = state();
  const { $ } = APP;
  const list = stops();
  const n = list.length;

  list.forEach((_, i) => {
    const id = `#stop-${i}`;
    APP.geo(id, i);
    const g = S.geocoders[id];
    const role = i === 0 ? 'Start' : i === n - 1 ? 'Finish' : `Stop ${i}`;
    g?.setPlaceholder?.(i === 0 ? 'Start — search or use your location' : i === n - 1 ? 'Finish — search or tap the map' : `${role} — search or tap the map`);
    const name = S.names[i];
    if (name) g?.setInput(name);
  });

  const host = $('#stops');
  const replan = () => { if (S.waypoints.length >= 2 && S.waypoints.every(Array.isArray)) APP.pointRoutes(false); };

  host.onclick = async (e) => {
    const here = e.target.closest('[data-here]');
    const remove = e.target.closest('[data-remove-stop]');
    if (here) {
      await APP.setHere(+here.dataset.here);
      render();
      return;
    }
    if (remove) {
      const i = +remove.dataset.removeStop;
      if (S.waypoints.length <= 2) return;
      S.waypoints.splice(i, 1);
      S.names.splice(i, 1);
      APP.markers();
      render();
      replan();
    }
  };

  $('#addStop').onclick = () => {
    // New empty stop just before the finish, focused so the rider can type.
    const at = Math.max(1, S.waypoints.length - 1);
    S.waypoints.splice(at, 0, null);
    S.names.splice(at, 0, '');
    render();
    requestAnimationFrame(() => APP.$(`#stop-${at} input`)?.focus());
  };

  /* Reorder with a pointer drag on the grip. HTML5 drag-and-drop, which the old
     list used, never fires for touch, so reordering did not work on phones. */
  if (n < 3) return;
  host.querySelectorAll('[data-grip]').forEach((grip) => {
    grip.onpointerdown = (e) => {
      e.preventDefault();
      const from = +grip.dataset.grip;
      const rows = [...host.querySelectorAll('.stop-row')];
      const dragged = rows[from];
      grip.setPointerCapture?.(e.pointerId);
      dragged.classList.add('dragging');
      let to = from;
      const move = (ev) => {
        const y = ev.clientY;
        to = rows.reduce((best, row, idx) => {
          const r = row.getBoundingClientRect();
          return y > r.top + r.height / 2 ? idx : best;
        }, 0);
        rows.forEach((row, idx) => row.classList.toggle('drop-above', idx === to && to !== from));
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        rows.forEach((row) => row.classList.remove('dragging', 'drop-above'));
        if (to === from) return;
        const [p] = S.waypoints.splice(from, 1);
        const [name] = S.names.splice(from, 1);
        S.waypoints.splice(to, 0, p);
        S.names.splice(to, 0, name);
        APP.markers();
        render();
        replan();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    };
  });
}

function plannerHtml() {
  const S = state();
  const routes = Array.isArray(S.routes) ? S.routes : [];
  const finishIndex = Math.max(1, (S.waypoints?.length || 2) - 1);
  return `
  <div class="card pad flat">${stopsHtml()}</div>

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

  wireStops();

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
        <div class="row" style="gap:2px">
          <button class="iconbtn plain" data-share-saved="${i}" title="Share" aria-label="Share ${APP.escapeHtml(item.name || 'route')}">${icon('share', 18)}</button>
          <button class="iconbtn plain danger" data-del="${i}" title="Delete" aria-label="Delete ${APP.escapeHtml(item.name || 'route')}">${icon('trash', 18)}</button>
        </div>
      </div>
      <div class="row" style="gap:8px;margin-top:10px">
        <button class="btn primary sm" data-ride="${i}" style="flex:1">${icon('navArrow', 16)}Ride</button>
        <button class="btn light sm" data-edit="${i}" style="flex:1">${icon('edit', 16)}Edit</button>
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
    const ride = e.target.closest('[data-ride]');
    const edit = e.target.closest('[data-edit]');
    const share = e.target.closest('[data-share-saved]');
    const del = e.target.closest('[data-del]');
    const card = e.target.closest('[data-saved]');
    if (ride) { e.stopPropagation(); APP.loadSavedRoute(saved[+ride.dataset.ride], false); await APP.startNavigation(); return; }
    if (edit) { e.stopPropagation(); APP.loadSavedRoute(saved[+edit.dataset.edit], true); return; }
    if (share) { e.stopPropagation(); APP.shareSavedRouteByIndex(+share.dataset.shareSaved); return; }
    if (del) {
      e.stopPropagation();
      const item = saved[+del.dataset.del];
      if (!item || !confirm(`Delete "${item.name || 'this route'}"?`)) return;
      await APP.deleteAccountItem('routes', item.id);
      render();
      return;
    }
    // Tapping the card itself previews the route, ready to ride — not edit mode.
    if (card) APP.loadSavedRoute(saved[+card.dataset.saved], false);
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
  // Superseded: the rider has moved to another tab since this was queued.
  if (!APP.isCurrentPage('plan')) return;
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
