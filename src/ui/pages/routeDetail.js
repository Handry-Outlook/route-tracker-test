// Route detail — the mockup's RouteDetail artboard, for whichever route is
// currently selected. Badges, highlights and surface come only from fields
// the routing engine actually produced; sections with no data are omitted
// rather than filled with invented content.
import { APP } from '../../legacy.js';
import { icon } from '../icons.js';
import { viewHeader, wireHeader } from '../shell.js';
import { staticRouteImage, routeThumb, elevationChart, gradientLegend, difficultyFor, fmtKm, fmtM, fmtDuration } from '../graphics.js';

const PLACE_ICON = (category = '') => {
  const c = String(category).toLowerCase();
  if (c.includes('view') || c.includes('peak')) return 'eye';
  if (c.includes('cafe') || c.includes('food')) return 'cup';
  if (c.includes('water')) return 'drop';
  if (c.includes('park') || c.includes('nature') || c.includes('forest')) return 'leaf';
  if (c.includes('castle') || c.includes('historic') || c.includes('attraction')) return 'landmark';
  return 'pin';
};

function surfaceBadge(route) {
  if (!Number.isFinite(route.surfaceUnpavedShare)) return '';
  const pct = Math.round(route.surfaceUnpavedShare * 100);
  const tone = pct >= 55 ? 'orange' : pct >= 12 ? 'blue' : 'green';
  const label = pct >= 55 ? `${pct}% unpaved` : pct >= 12 ? `Mixed · ${pct}% unpaved` : 'Mostly paved';
  return `<span class="badge ${tone}">${label}</span>`;
}

export async function render() {
  const S = APP.state;
  const back = () => { S.routeDetailOpen = false; S.adventureView = 'home'; APP.open('explore'); };
  const index = Number.isInteger(S.selected) ? S.selected : 0;
  const route = S.routes?.[index] || S.route;

  if (!route?.geometry?.coordinates?.length) {
    APP.panel.innerHTML = `<div class="page">${viewHeader('Route', 'No route selected')}
      <div class="empty">Pick a route from Adventure or the planner to see its detail here.</div>
      <button class="btn cta block" id="toAdventure">${icon('compass', 18)}Find adventures</button></div>`;
    wireHeader(back);
    APP.$('#toAdventure').onclick = back;
    return;
  }

  const coords = route.geometry.coordinates;
  const km = (route.distance || 0) / 1000;
  const diff = difficultyFor(km, route.ascent || 0);
  const infra = Number.isFinite(route.osmCycleScore) ? route.osmCycleScore : route.cycleScore;
  const img = staticRouteImage(coords, APP.MAPBOX_TOKEN, { w: 640, h: 300 });
  const places = Array.isArray(route.adventurePlaces) ? route.adventurePlaces.filter((p) => p?.coord) : [];
  const hasWind = Array.isArray(route.wind) && route.wind.length;

  const actions = `<button class="iconbtn" id="detailSave" title="Save route">${icon('heart', 18)}</button>
    <button class="iconbtn" id="detailShare" title="Share route">${icon('share', 18)}</button>`;

  APP.panel.innerHTML = `<div class="page">
    ${viewHeader(route.savedName || route.name || 'Route', `${fmtKm(km)} · ${diff.label}`, { actions })}
    <div class="card hero-card">
      <div class="hero-media" style="height:172px">
        ${img ? `<img src="${img}" alt="" loading="lazy">` : routeThumb(coords, 358, 172, { radius: 0 })}
      </div>
    </div>

    <div class="row" style="gap:6px;flex-wrap:wrap">
      <span class="badge ${diff.tone}">${diff.label}</span>
      ${surfaceBadge(route)}
      ${route.qualityLabel ? `<span class="badge blue">${APP.escapeHtml(String(route.qualityLabel))}</span>` : ''}
      ${route.rangeStatus ? `<span class="badge orange">${APP.escapeHtml(String(route.rangeStatus))}</span>` : ''}
    </div>

    ${route.whyThisRoute ? `<div class="card pad flat" style="border-left:3px solid var(--blue)"><p style="font-size:13px;font-weight:600;line-height:1.45">${APP.escapeHtml(route.whyThisRoute)}</p></div>` : ''}
    <div class="stats">
      <div class="stat tile"><b>${fmtKm(km)}</b><small>distance</small></div>
      <div class="stat tile"><b>${Number.isFinite(route.ascent) ? fmtM(route.ascent) : '—'}</b><small>elevation</small></div>
      <div class="stat tile"><b>${fmtDuration(route.duration)}</b><small>est. time</small></div>
      <div class="stat tile"><b>${Number.isFinite(infra) ? `${infra}%` : '—'}</b><small>${Number.isFinite(route.osmCycleScore) ? 'OSM cycle infra' : 'cycle estimate'}</small></div>
    </div>

    <section>
      <div class="between" style="margin-bottom:6px"><span class="section-title">Elevation</span>${gradientLegend()}</div>
      ${elevationChart(route.elev, 340, 92, { distanceKm: km, pending: !route.elev?.length && !route.elevUnavailable })}
    </section>

    ${hasWind ? `<section><div class="between" style="margin-bottom:6px"><span class="section-title">Wind along the route</span><span class="muted" style="font-size:11px;font-weight:700">tailwind + / headwind −</span></div><canvas id="routeWindChart" class="chart"></canvas></section>` : ''}

    ${places.length ? `<section>
      <p class="section-title" style="margin-bottom:6px">Highlights along the way</p>
      ${places.slice(0, 6).map((p) => `<div class="highlight-row">
        <span class="ico" style="background:color-mix(in srgb, var(--blue) 14%, transparent);color:var(--blue)">${icon(PLACE_ICON(p.category), 18)}</span>
        <div><b>${APP.escapeHtml(p.name || 'Point of interest')}</b><span>${APP.escapeHtml(String(p.category || '').replace(/_/g, ' '))}${Number.isFinite(p.distance) ? ` · ${p.distance.toFixed(1)} km from start` : ''}</span></div>
      </div>`).join('')}
    </section>` : ''}

    <div id="routeSocial"></div>
    <div id="cueHost"></div>
    <button class="btn light block" id="routeToClub">${icon('flag', 16)}Plan this as a club ride</button>

    <div class="action-bar">
      <button class="iconbtn" id="detailOffline" title="Save for offline" style="width:52px;height:52px">${icon('cloudDown', 22)}</button>
      <button class="iconbtn" id="detailGpx" title="Export GPX" style="width:52px;height:52px">${icon('download', 22)}</button>
      <button class="btn cta" id="detailStart" style="flex:1;min-height:52px">${icon('compass', 20)}Start navigation</button>
    </div>
  </div>`;

  const { $ } = APP;
  const routeId = route.savedId || route.id || `route-${Math.round((route.distance || 0))}-${coords.length}`;
  const rateableId = route.savedId || S.editingSavedId || null;

  // Ratings, ride count and rider photos (items 13 and 14)
  const social = $('#routeSocial');
  if (social) {
    if (!rateableId) {
      social.innerHTML = '<p class="muted" style="font-size:12px;font-weight:600">Save this route to rate it and collect ride photos from it.</p>';
    } else {
      Promise.all([
        APP.ratings.getRouteStats(rateableId),
        S.user ? APP.ratings.getMyRating(rateableId, S.user.uid) : 0,
        APP.ratings.routePhotos(rateableId),
      ]).then(([stats, mine, photos]) => {
        if (!APP.$('#routeSocial')) return;
        social.innerHTML = `<section>
          <div class="between" style="margin-bottom:6px">
            <span class="section-title">Rider feedback</span>
            <span class="muted" style="font-size:12px;font-weight:700">${stats?.rideCount ? `ridden ${stats.rideCount} time${stats.rideCount === 1 ? '' : 's'}` : 'not ridden yet'}</span>
          </div>
          <div class="card pad flat">
            <div class="row" style="gap:10px">
              ${APP.ratings.starsHtml(stats?.avg || 0, 16)}
              <span class="muted" style="font-size:12px;font-weight:700">${stats?.count ? `${(stats.avg || 0).toFixed(1)} from ${stats.count} rating${stats.count === 1 ? '' : 's'}` : 'No ratings yet'}</span>
            </div>
            ${S.user ? `<div class="row" style="gap:6px;margin-top:10px" id="rateRow">
              ${[1, 2, 3, 4, 5].map((n) => `<button class="btn ${mine >= n ? 'primary' : 'light'} sm" data-star="${n}" style="flex:1">${n}</button>`).join('')}
            </div>` : ''}
          </div>
          ${photos.length ? `<div class="carousel-host" style="margin-top:10px"><div class="hscroll">${photos.map((p) => `<img src="${APP.escapeHtml(p.url)}" alt="Ride photo by ${APP.escapeHtml(p.by)}" style="height:150px;border-radius:14px;object-fit:cover;flex:0 0 auto">`).join('')}</div></div>` : ''}
        </section>`;
        const row = APP.$('#rateRow');
        if (row) row.onclick = async (e) => {
          const b = e.target.closest('[data-star]');
          if (!b) return;
          try { await APP.ratings.rateRoute(rateableId, S.user.uid, +b.dataset.star); APP.toast('Rating saved'); render(); }
          catch (err) { console.warn('Rating failed', err); APP.toast('Could not save rating'); }
        };
      }).catch((e) => console.warn('Route social unavailable', e));
    }
  }

  // Turn this route into a club ride (item 16)
  const clubBtn = $('#routeToClub');
  if (clubBtn) clubBtn.onclick = async () => {
    if (!S.user) return APP.toast('Sign in to plan a club ride');
    S.clubRideFromRoute = { name: route.savedName || route.name || 'Club ride', distanceKm: km };
    S.segmentsView = 'newEvent';
    APP.open('segments');
  };

  // Cue sheet (item 11)
  const cueList = APP.cues.buildCues(route);
  const cueHost = $('#cueHost');
  if (cueHost && cueList.length) {
    cueHost.innerHTML = `<section>
      <div class="between" style="margin-bottom:6px"><span class="section-title">Cue sheet</span><span class="muted" style="font-size:12px;font-weight:700">${cueList.length} cues</span></div>
      <div class="card flat" style="padding:4px 12px;max-height:260px;overflow:auto">
        ${cueList.map((c, i) => `<div class="item" style="gap:10px;padding:8px 0">
          <span class="muted" style="width:22px;font-size:11px;font-weight:700">${i + 1}</span>
          <span style="width:56px;font-size:12px;font-weight:700">${APP.escapeHtml(c.atLabel)}</span>
          <span style="width:22px;font-size:16px">${c.arrow}</span>
          <span style="flex:1;font-size:13px;font-weight:600">${APP.escapeHtml(c.instruction)}</span>
        </div>`).join('')}
      </div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button class="btn light sm" id="printCues" style="flex:1">Print cue sheet</button>
        <button class="btn light sm" id="shareCues" style="flex:1">Share as text</button>
      </div>
    </section>`;
    $('#printCues').onclick = () => { if (!APP.cues.printCues(route, cueList)) APP.toast('Allow pop-ups to print the cue sheet'); };
    $('#shareCues').onclick = async () => {
      const text = APP.cues.cuesToText(route, cueList);
      try {
        if (navigator.share) await navigator.share({ title: route.savedName || route.name || 'Cue sheet', text });
        else { await navigator.clipboard.writeText(text); APP.toast('Cue sheet copied'); }
      } catch (e) { if (e?.name !== 'AbortError') { try { await navigator.clipboard.writeText(text); APP.toast('Cue sheet copied'); } catch { APP.toast('Could not share the cue sheet'); } } }
    };
  }

  // Offline download (item 8)
  const offlineBtn = $('#detailOffline');
  if (offlineBtn) {
    const paint = (saved) => {
      offlineBtn.classList.toggle('active', !!saved);
      offlineBtn.title = saved ? 'Saved for offline — tap to remove' : 'Save for offline';
    };
    APP.offline.getOffline(routeId).then((r) => paint(!!r));
    offlineBtn.onclick = async () => {
      if (!APP.offline.isSupported()) return APP.toast('This browser cannot store routes offline');
      offlineBtn.disabled = true;
      try {
        const existing = await APP.offline.getOffline(routeId);
        if (existing) { await APP.offline.removeOffline(routeId); paint(false); APP.toast('Removed from offline'); }
        else {
          await APP.offline.saveOffline(routeId, route, { cues: cueList, imageUrl: img, name: route.savedName || route.name });
          paint(true);
          APP.toast('Saved offline — route, cues and map image');
        }
      } catch (e) { console.warn('Offline save failed', e); APP.toast('Could not save offline'); }
      finally { offlineBtn.disabled = false; }
    };
  }

  if (hasWind) requestAnimationFrame(() => APP.plot($('#routeWindChart'), route.wind, '#176bdb', 'km/h'));
  wireHeader(back);
  $('#detailSave').onclick = () => APP.saveRouteByIndex(index);
  $('#detailShare').onclick = () => APP.shareRouteByIndex(index);
  $('#detailGpx').onclick = () => { APP.select(index); APP.exportSelectedRouteGpx(); };
  $('#detailStart').onclick = () => { APP.select(index); APP.startNavigation(); };
}
