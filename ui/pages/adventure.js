// Adventure — discovery home.
//
// View model (S.adventureView): 'home' | 'search' | 'filters'.
// Route detail is a separate module reached with an explicit Details button,
// and every non-home view renders a flow-level header with a back button, so
// there is always a visible way back.
//
// Data honesty: the deck is the loop generator's real output and the two
// community rails are Firestore reads. Nothing here is invented.
import { APP } from '../../legacy.js';
import { icon } from '../icons.js';
import { viewHeader, rootHeader, wireHeader, searchField, mountSearch } from '../shell.js';
import { routeThumb, staticRouteImage, terrainPlaceholder, difficultyFor, fmtKm, fmtM, fmtDuration } from '../graphics.js';
import { popularActivities, recentActivities } from '../../social/discover.js';

const RIDE_TYPES = [{ id: 'road', label: 'Road' }, { id: 'gravel', label: 'Gravel' }, { id: 'mtb', label: 'MTB' }];
const DIFFICULTIES = ['Easy', 'Moderate', 'Hard'];
export const SCENERY = [
  { id: 'coastal', label: 'Coastal', icon: 'drop' },
  { id: 'forest', label: 'Forest', icon: 'leaf' },
  { id: 'mountain', label: 'Mountain', icon: 'mtn' },
  { id: 'countryside', label: 'Countryside', icon: 'sun' },
];

export function defaultFilters() {
  return { rideType: 'road', hours: 2.5, difficulty: 'Moderate', scenery: ['forest'] };
}
function filters() {
  const S = APP.state;
  if (!S.adventureFilters) S.adventureFilters = defaultFilters();
  return S.adventureFilters;
}
export function filterDistanceRange() {
  const f = filters();
  const speed = f.rideType === 'mtb' ? 14 : f.rideType === 'gravel' ? 18 : 22;
  const target = Math.max(6, f.hours * speed);
  return { minKm: Math.round(target * 0.75), maxKm: Math.round(target * 1.25) };
}

const goHome = () => { APP.state.adventureView = 'home'; render(); };

function infraLine(route) {
  if (Number.isFinite(route.osmCycleScore)) return `${route.osmCycleScore}% on cycle infrastructure`;
  if (route.cycleScorePending) return 'Checking cycle infrastructure…';
  return `${Number.isFinite(route.cycleScore) ? route.cycleScore : 0}% cycle-route estimate`;
}

function heroMedia(route, hue) {
  const coords = route?.geometry?.coordinates;
  const url = coords ? staticRouteImage(coords, APP.MAPBOX_TOKEN, { w: 600, h: 264 }) : null;
  return url ? `<img src="${url}" alt="" loading="lazy">` : terrainPlaceholder(300, 132, hue, 0);
}

function deckCardHtml(route, i, selected) {
  const km = (route.distance || 0) / 1000;
  const diff = difficultyFor(km, route.ascent || 0);
  return `<article class="card hero-card deck-card" style="${selected ? 'border-color:var(--blue);border-width:2px' : ''}">
    <div class="hero-media">${heroMedia(route, ['warm', 'forest', 'cool', 'coast'][i % 4])}
      <div class="hero-badges">${route.qualityLabel ? `<span class="badge dark">${APP.escapeHtml(String(route.qualityLabel).split('·')[0].trim())}</span>` : ''}</div>
      <div class="hero-actions">
        <button class="iconbtn" data-save="${i}" title="Save route">${icon('heart', 18)}</button>
        <button class="iconbtn" data-share="${i}" title="Share route">${icon('share', 18)}</button>
      </div>
      <div class="hero-thumb">${routeThumb(route.geometry?.coordinates, 48, 48)}</div>
    </div>
    <div class="hero-body">
      <div>
        <h2 style="font-size:16px">${APP.escapeHtml(route.name || `Adventure ${i + 1}`)}</h2>
        <p class="muted" style="font-size:12px;font-weight:600">${infraLine(route)}</p>
      </div>
      ${route.whyThisRoute ? `<p style="font-size:12px;font-weight:600;color:var(--blue);line-height:1.4">${APP.escapeHtml(route.whyThisRoute)}</p>` : ''}
      <div class="route-facts">
        <span class="row">${icon('route', 15)}${fmtKm(km)}</span>
        <span class="row">${icon('mtn', 15)}${Number.isFinite(route.ascent) ? fmtM(route.ascent) : '—'}</span>
        <span class="row">${icon('clock', 15)}${fmtDuration(route.duration)}</span>
        <span class="badge ${diff.tone}">${diff.label}</span>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn light sm" data-show="${i}" style="flex:1">${icon('eye', 16)}Show on map</button>
        <button class="btn primary sm" data-details="${i}" style="flex:1">Details</button>
      </div>
    </div>
  </article>`;
}

function safeCoords(json) {
  try {
    const g = typeof json === 'string' ? JSON.parse(json) : json;
    return g?.coordinates?.length >= 2 ? g.coordinates : null;
  } catch { return null; }
}

function communityCardHtml(a) {
  const coords = safeCoords(a.routeSummaryGeoJson);
  const url = coords ? staticRouteImage(coords, APP.MAPBOX_TOKEN, { w: 320, h: 160 }) : null;
  return `<button class="card mini-card${url ? '' : ' mini-card-flat'}" data-community="${APP.escapeHtml(a.id)}">
    <div class="mini-media">${url
      ? `<img src="${url}" alt="${a.routeIsPlanned ? 'Planned route' : 'Route ridden'} for ${APP.escapeHtml(a.title || 'this ride')}" loading="lazy">
         ${a.routeIsPlanned ? '<span class="mini-tag">Planned route</span>' : ''}`
      : `<div class="mini-media-empty">${icon('route', 16)}<span>No route recorded</span></div>`}
      ${a.kudosCount ? `<span class="badge dark" style="position:absolute;left:8px;top:8px;min-height:20px;font-size:10px">${icon('heart', 11)}${a.kudosCount}</span>` : ''}
    </div>
    <div class="mini-body"><b>${APP.escapeHtml(a.title || 'Ride')}</b>
      <span>${a.routeIsPlanned
        ? `${fmtKm(a.plannedDistanceKm)} planned · not ridden`
        : `${fmtKm(a.distanceKm)} · ${fmtM(a.elevationGainM)}`} · ${APP.escapeHtml(a.ownerDisplayName || 'Rider')}</span></div>
  </button>`;
}

function railHtml(title, items, emptyText) {
  return `<section>
    <div class="between" style="margin-bottom:8px"><span class="section-title">${title}</span></div>
    ${items.length ? `<div class="hscroll">${items.map(communityCardHtml).join('')}</div>` : `<div class="empty" style="padding:14px">${emptyText}</div>`}
  </section>`;
}

/* -------------------------------- search -------------------------------- */

function searchView() {
  APP.panel.innerHTML = `<div class="page">
    ${viewHeader('Search', 'Find a place to ride to')}
    <div id="searchBox"></div>
    <p class="muted" style="font-size:12px;font-weight:600">Pick a place and Ridewise plans a route to it from where you are.</p>
  </div>`;
  wireHeader(goHome);
  mountSearch('searchBox', async (result) => {
    const S = APP.state;
    const start = S.waypoints?.[0] || (await APP.current());
    if (!start) { APP.toast('Allow location access to plan from here'); return; }
    S.mode = 'point';
    S.waypoints = [start, result.center];
    S.names = [S.names?.[0] || 'Current location', result.place_name];
    S.adventureView = 'home';
    S.planView = 'planner';
    APP.open('plan');
    APP.pointRoutes(false);
  });
}

/* -------------------------------- filters -------------------------------- */

function filtersView() {
  const f = filters();
  const { minKm, maxKm } = filterDistanceRange();
  APP.panel.innerHTML = `<div class="page">
    ${viewHeader('Filters', 'Shapes the loops Ridewise generates')}
    <section><p class="section-title" style="margin-bottom:8px">Ride type</p>
      <div class="segmented" id="rideType">${RIDE_TYPES.map((r) => `<button data-ride="${r.id}" class="${f.rideType === r.id ? 'on' : ''}">${r.label}</button>`).join('')}</div>
    </section>
    <section>
      <div class="between" style="margin-bottom:4px"><span class="section-title">Duration</span><b style="color:var(--blue)" id="hoursLabel">${f.hours.toFixed(1)} h</b></div>
      <div class="slider"><div class="track"></div><div class="fill" id="hoursFill"></div><div class="knob" id="hoursKnob"></div>
        <input id="hoursInput" type="range" min="0.5" max="6" step="0.5" value="${f.hours}"></div>
      <p class="muted" style="font-size:12px;font-weight:600" id="rangeHint">Targets roughly ${minKm}–${maxKm} km</p>
    </section>
    <section><p class="section-title" style="margin-bottom:8px">Difficulty</p>
      <div class="row" id="difficulty" style="gap:8px">${DIFFICULTIES.map((d) => `<button class="chip ${f.difficulty === d ? 'on' : ''}" data-diff="${d}">${d}</button>`).join('')}</div>
    </section>
    <section><p class="section-title" style="margin-bottom:8px">Preferences</p>
      <div class="row" id="ridePrefs" style="gap:8px;flex-wrap:wrap">
        ${[['avoidHills', 'Avoid hills', 'mtn'], ['quietRoads', 'Quiet roads', 'leaf'], ['pavedOnly', 'Paved only', 'route'], ['tailwindHome', 'Tailwind home', 'wind'], ['beforeSunset', 'Back before sunset', 'clock']]
          .map(([id, label, ico]) => `<button class="chip ${APP.ridePrefs()[id] ? 'on' : ''}" data-pref="${id}">${icon(ico, 15)}${label}</button>`).join('')}
      </div>
      <p class="muted" style="font-size:12px;font-weight:600;margin-top:8px">These change how candidates are ranked, using the elevation, OpenStreetMap surface and live wind the app already reads.</p>
    </section>
    <div class="card pad flat between">
      <div><b style="font-size:14px;display:block">Round trip</b><span class="muted" style="font-size:12px;font-weight:600">Loop back to where you start</span></div>
      <button class="toggle ${f.roundTrip !== false ? 'on' : ''}" id="filterRoundTrip" aria-pressed="${f.roundTrip !== false}"><i></i></button>
    </div>
    <section><p class="section-title" style="margin-bottom:8px">Scenery</p>
      <div class="row" id="scenery" style="gap:8px;flex-wrap:wrap">${SCENERY.map((s) => `<button class="chip ${f.scenery.includes(s.id) ? 'on' : ''}" data-scenery="${s.id}">${icon(s.icon, 16)}${s.label}</button>`).join('')}</div>
    </section>
    <div class="action-bar"><button class="btn cta" id="applyFilters">${icon('compass', 18)}Find adventures</button></div>
  </div>`;

  wireHeader(goHome);
  const { $ } = APP;
  const sync = () => {
    const pct = ((f.hours - 0.5) / 5.5) * 100;
    $('#hoursFill').style.width = `${pct}%`;
    $('#hoursKnob').style.left = `${pct}%`;
    $('#hoursLabel').textContent = `${f.hours.toFixed(1)} h`;
    const r = filterDistanceRange();
    $('#rangeHint').textContent = `Targets roughly ${r.minKm}–${r.maxKm} km`;
  };
  sync();
  $('#hoursInput').oninput = (e) => { f.hours = +e.target.value; sync(); };
  $('#rideType').onclick = (e) => {
    const b = e.target.closest('[data-ride]'); if (!b) return;
    f.rideType = b.dataset.ride;
    $('#rideType').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    sync();
  };
  $('#difficulty').onclick = (e) => {
    const b = e.target.closest('[data-diff]'); if (!b) return;
    f.difficulty = b.dataset.diff;
    $('#difficulty').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  };
  $('#scenery').onclick = (e) => {
    const b = e.target.closest('[data-scenery]'); if (!b) return;
    const id = b.dataset.scenery;
    f.scenery = f.scenery.includes(id) ? f.scenery.filter((x) => x !== id) : [...f.scenery, id];
    b.classList.toggle('on', f.scenery.includes(id));
  };
  $('#ridePrefs').onclick = (e) => {
    const b = e.target.closest('[data-pref]');
    if (!b) return;
    const prefs = APP.ridePrefs();
    prefs[b.dataset.pref] = !prefs[b.dataset.pref];
    b.classList.toggle('on', prefs[b.dataset.pref]);
    APP.saveRidePrefs();
    if (b.dataset.pref === 'beforeSunset' && prefs.beforeSunset) APP.refreshDaylightLimit();
  };
  $('#filterRoundTrip').onclick = (e) => {
    f.roundTrip = f.roundTrip === false;
    e.currentTarget.classList.toggle('on', f.roundTrip !== false);
  };
  $('#applyFilters').onclick = () => generate(false);
}

/* ------------------------------- generate ------------------------------- */

export async function generate(surprise) {
  const S = APP.state;
  const { minKm, maxKm } = filterDistanceRange();
  S.mode = 'loop';
  S.adventureView = 'home';
  const start = S.waypoints?.[0] || (await APP.current());
  if (!start) { APP.toast('Allow location access to find adventures nearby'); return; }
  S.waypoints = [start, start];
  if (surprise) {
    const spread = Math.max(1, maxKm - minKm);
    S.adventureSurpriseSeed = (S.adventureSurpriseSeed || 0) + 1;
    const jitter = (S.adventureSurpriseSeed * 11) % spread;
    S.adventureRange = { minKm: Math.max(5, minKm + jitter * 0.3), maxKm: maxKm + jitter * 0.5 };
  } else {
    S.adventureRange = { minKm, maxKm };
  }
  APP.open('explore');
  await APP.adventureRoutes(false);
  await render();
}

/* --------------------------------- home --------------------------------- */

async function homeView() {
  const S = APP.state;
  const loops = S.mode === 'loop' && Array.isArray(S.routes) ? S.routes : [];
  const sel = Number.isInteger(S.selected) ? S.selected : null;
  const selRoute = sel !== null ? loops[sel] : null;

  APP.panel.innerHTML = `<div class="page">
    ${rootHeader('Adventure', loops.length ? `${loops.length} loop${loops.length === 1 ? '' : 's'} near you` : 'Loops near you')}
    ${searchField()}
    <div class="row" style="gap:8px">
      <button class="btn light sm" id="openFilters" style="flex:1">${icon('sliders', 16)}Filters</button>
      <button class="btn cta sm" id="surpriseMe" style="flex:1">${icon('shuffle', 16)}Surprise me</button>
    </div>
    ${selRoute ? `<div class="selected-strip">
        <span>${routeThumb(selRoute.geometry?.coordinates, 40, 40, { radius: 9 })}</span>
        <span class="grow"><b>${APP.escapeHtml(selRoute.name || 'Selected route')}</b><span>${fmtKm((selRoute.distance || 0) / 1000)} · shown on map</span></span>
        <button class="btn primary sm" id="selDetails">Details</button>
      </div>` : ''}
    <div id="routeProgressHost"></div>
    ${loops.length
      ? `<div class="hscroll deck-grid" id="deck">${loops.map((r, i) => deckCardHtml(r, i, i === sel)).join('')}</div>
         <div class="row" style="gap:8px">
           <span class="muted" data-carousel-count style="font-size:12px;font-weight:700"></span>
           ${loops.length > 1 ? `<button class="btn light" id="compareRoutes" style="flex:1">${icon('layers', 16)}Compare</button>` : ''}
           <button class="btn light" id="regenerate" style="flex:1">${icon('shuffle', 16)}Different loops</button>
         </div>`
      : `<div class="card pad flat" style="text-align:center">
           <p class="muted" style="font-size:13px;line-height:1.5;margin-bottom:12px">Ridewise builds loops from real OpenStreetMap cycle infrastructure around your location.</p>
           <button class="btn cta block" id="findAdventures">${icon('compass', 18)}Find adventures near me</button>
         </div>`}
    <div id="communityRails"><div class="empty" style="padding:14px">Loading community rides…</div></div>
  </div>`;

  const { $ } = APP;
  $('#openSearch').onclick = () => { S.adventureView = 'search'; render(); };
  $('#openFilters').onclick = () => { S.adventureView = 'filters'; render(); };
  $('#surpriseMe').onclick = () => generate(true);
  const find = $('#findAdventures'); if (find) find.onclick = () => generate(false);
  const regen = $('#regenerate'); if (regen) regen.onclick = () => generate(true);
  const cmp = $('#compareRoutes'); if (cmp) cmp.onclick = () => { S.adventureView = 'compare'; render(); };
  const selDetails = $('#selDetails');
  if (selDetails) selDetails.onclick = () => { S.routeDetailOpen = true; APP.open('explore'); };

  const deck = $('#deck');
  if (deck) deck.onclick = (e) => {
    const save = e.target.closest('[data-save]');
    const share = e.target.closest('[data-share]');
    if (save) { e.stopPropagation(); APP.saveRouteByIndex(+save.dataset.save); return; }
    if (share) { e.stopPropagation(); APP.shareRouteByIndex(+share.dataset.share); return; }
    const show = e.target.closest('[data-show]');
    const details = e.target.closest('[data-details]');
    if (show) { APP.select(+show.dataset.show); render(); return; }
    if (details) { APP.select(+details.dataset.details); S.routeDetailOpen = true; APP.open('explore'); }
  };

  const weekAgo = Date.now() - 7 * 86400000;
  const [popular, recent] = await Promise.all([popularActivities(8), recentActivities(8, weekAgo)]);
  const rails = $('#communityRails');
  if (!rails) return;
  rails.innerHTML =
    railHtml('Community favourites', popular, 'No shared rides yet. Rides you and riders you follow share appear here.') +
    railHtml('New this week', recent, 'Nothing shared in the last seven days.');
  rails.onclick = async (e) => {
    const b = e.target.closest('[data-community]');
    if (!b) return;
    const ride = [...popular, ...recent].find((x) => x.id === b.dataset.community);
    if (!ride) return;
    const coords = safeCoords(ride.routeSummaryGeoJson);
    if (!coords) return APP.toast('That ride has no recorded route to open');
    if (b.dataset.busy) return;
    b.dataset.busy = '1';
    APP.toast('Opening ride…');
    try {
      await APP.useSavedActivityRoute({
        name: ride.title || 'Community ride',
        distance: ride.distanceKm || 0,
        elapsed: 0,
        samples: coords.map((pos) => ({ pos })),
      });
    } catch (error) {
      console.warn('Could not open the community ride', error);
      APP.toast('Could not open that ride');
    } finally {
      delete b.dataset.busy;
    }
  };
}

function compareView() {
  const S = APP.state;
  const loops = Array.isArray(S.routes) ? S.routes : [];
  if (loops.length < 2) { S.adventureView = 'home'; return render(); }
  if (!Number.isInteger(S.compareA) || S.compareA >= loops.length) S.compareA = 0;
  if (!Number.isInteger(S.compareB) || S.compareB >= loops.length || S.compareB === S.compareA) S.compareB = S.compareA === 0 ? 1 : 0;
  const a = loops[S.compareA], b = loops[S.compareB];
  const rows = APP.quality.compareRoutes(a, b);
  const picker = (which, current) => `<select data-pick="${which}" style="min-height:40px;font-size:13px">${loops.map((r, i) => `<option value="${i}" ${i === current ? 'selected' : ''}>${APP.escapeHtml(r.name || 'Adventure ' + (i + 1))}</option>`).join('')}</select>`;

  APP.panel.innerHTML = `<div class="page">
    ${viewHeader('Compare routes', 'Same numbers, side by side')}
    <div class="row" style="gap:8px">${picker('a', S.compareA)}${picker('b', S.compareB)}</div>
    <div class="row" style="gap:8px">
      <div style="flex:1">${routeThumb(a.geometry?.coordinates, 150, 90, { radius: 12 })}</div>
      <div style="flex:1">${routeThumb(b.geometry?.coordinates, 150, 90, { radius: 12 })}</div>
    </div>
    <div class="card flat" style="padding:4px 14px">
      ${rows.map((r) => `<div class="item" style="gap:8px">
        <span style="flex:1;font-size:13px;font-weight:${r.winner === 'a' ? 800 : 600};color:${r.winner === 'a' ? 'var(--green)' : 'inherit'}">${r.a}</span>
        <span class="muted" style="font-size:11px;font-weight:700;text-align:center;width:92px">${r.label}</span>
        <span style="flex:1;text-align:right;font-size:13px;font-weight:${r.winner === 'b' ? 800 : 600};color:${r.winner === 'b' ? 'var(--green)' : 'inherit'}">${r.b}</span>
      </div>`).join('')}
    </div>
    ${[a, b].some((r) => r.whyThisRoute) ? `<div class="card pad flat">
      ${[a, b].map((r, i) => r.whyThisRoute ? `<p style="font-size:12px;font-weight:600;margin-bottom:6px"><b>${APP.escapeHtml(r.name || (i ? 'B' : 'A'))}:</b> ${APP.escapeHtml(r.whyThisRoute)}</p>` : '').join('')}
    </div>` : ''}
    <div class="action-bar">
      <button class="btn light" id="cmpA">Use ${APP.escapeHtml(a.name || 'A')}</button>
      <button class="btn cta" id="cmpB">Use ${APP.escapeHtml(b.name || 'B')}</button>
    </div>
  </div>`;

  wireHeader(goHome);
  APP.panel.querySelectorAll('[data-pick]').forEach((sel) => {
    sel.onchange = (e) => {
      const which = sel.dataset.pick === 'a' ? 'compareA' : 'compareB';
      S[which] = +e.target.value;
      compareView();
    };
  });
  APP.$('#cmpA').onclick = () => { APP.select(S.compareA); S.adventureView = 'home'; S.routeDetailOpen = true; APP.open('explore'); };
  APP.$('#cmpB').onclick = () => { APP.select(S.compareB); S.adventureView = 'home'; S.routeDetailOpen = true; APP.open('explore'); };
}

export async function render() {
  // Superseded: the rider has moved to another tab since this was queued.
  if (!APP.isCurrentPage('explore')) return;
  const S = APP.state;
  if (S.adventureView === 'compare') return compareView();
  if (S.adventureView === 'search') return searchView();
  if (S.adventureView === 'filters') return filtersView();
  return homeView();
}
