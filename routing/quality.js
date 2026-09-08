// Route quality — roadmap items 4-7.
//
// 4. OSM-steered generation: the loop builder used to pick anchor points
//    geometrically and only score the finished route against OpenStreetMap.
//    cyclewayAnchors() turns the fetched OSM network into candidate
//    destinations *before* routing, so the data steers the route instead of
//    just grading it.
// 5. Rider preferences: avoid hills, quiet roads, paved only, tailwind home,
//    back before sunset — each applied to the candidate score.
// 6. whyThisRoute(): one honest sentence per candidate from its real numbers.
// 7. compareRoutes(): the head-to-head used by the comparison view.

const QUIET = { cycleway: 1, path: 0.9, track: 0.75, living_street: 0.7, residential: 0.5, unclassified: 0.45, tertiary: 0.25, secondary: 0.1, primary: 0 };

export function defaultPrefs() {
  return {
    avoidHills: false, quietRoads: true, pavedOnly: false, tailwindHome: false, beforeSunset: false,
    // Metres trimmed from each end of a shared route. 0 shares the whole line.
    privacyRadiusM: 400,
  };
}

/**
 * Clusters the OSM cycle network into anchor points the loop builder can route
 * through. Returns destination-shaped records so they merge straight into the
 * existing corridor-planning list.
 */
export function cyclewayAnchors(overpassData, start, radiusKm, turf, max = 12) {
  const ways = overpassData?.ways || [];
  if (!ways.length) return [];
  const cell = 0.01; // ~1.1 km grid
  const cells = new Map();
  for (const way of ways) {
    const weight = QUIET[way.highway] ?? 0.2;
    if (weight < 0.7) continue; // only genuinely good cycling surface seeds an anchor
    for (const [lng, lat] of way.coords) {
      const key = `${Math.round(lng / cell)}:${Math.round(lat / cell)}`;
      const c = cells.get(key) || { lng: 0, lat: 0, n: 0, weight: 0 };
      c.lng += lng; c.lat += lat; c.n += 1; c.weight += weight;
      cells.set(key, c);
    }
  }
  const out = [];
  for (const c of cells.values()) {
    if (c.n < 8) continue; // ignore thin fragments
    const coord = [c.lng / c.n, c.lat / c.n];
    let distance;
    try { distance = turf.distance(start, coord, { units: 'kilometers' }); } catch { continue; }
    if (distance < 1.2 || distance > radiusKm) continue;
    out.push({
      coord,
      name: 'Cycle network',
      category: 'cycleway osm',
      distance,
      bearing: (turf.bearing(start, coord) + 360) % 360,
      score: 24 + Math.min(20, c.weight / 4),
      fromOsm: true,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

/** Metres climbed per kilometre — the number "avoid hills" acts on. */
export function climbRate(route) {
  const km = (route?.distance || 0) / 1000;
  return km > 0.5 && Number.isFinite(route?.ascent) ? route.ascent / km : null;
}

/**
 * Adjusts a candidate's loopQuality for the rider's preferences, and records
 * what was applied so the UI can explain it. Returns the route.
 */
export function applyPreferences(route, prefs, ctx = {}) {
  if (!route || !prefs) return route;
  const notes = [];
  let delta = 0;

  if (prefs.avoidHills) {
    const rate = climbRate(route);
    if (Number.isFinite(rate)) {
      delta -= Math.max(0, rate - 8) * 2.2;
      if (rate < 8) notes.push('gentle gradients');
    }
  }
  if (prefs.quietRoads) {
    const infra = Number.isFinite(route.osmCycleScore) ? route.osmCycleScore : route.cycleScore;
    if (Number.isFinite(infra)) {
      delta += (infra - 40) * 0.35;
      if (infra >= 55) notes.push('mostly quiet roads and cycleway');
    }
  }
  if (prefs.pavedOnly && Number.isFinite(route.surfaceUnpavedShare)) {
    delta -= route.surfaceUnpavedShare * 90;
    if (route.surfaceUnpavedShare < 0.08) notes.push('paved throughout');
  }
  if (prefs.tailwindHome && Number.isFinite(ctx.windBearing)) {
    const bonus = tailwindHomeScore(route, ctx.windBearing, ctx.turf);
    if (Number.isFinite(bonus)) {
      delta += bonus;
      if (bonus > 6) notes.push('tailwind on the way home');
    }
  }
  if (prefs.beforeSunset && Number.isFinite(ctx.maxKmForDaylight)) {
    const km = (route.distance || 0) / 1000;
    if (km > ctx.maxKmForDaylight) delta -= (km - ctx.maxKmForDaylight) * 6;
    else notes.push('finishes before dark');
  }

  route.prefAdjust = Math.round(delta);
  route.prefNotes = notes;
  route.loopQuality = (route.loopQuality || 0) + delta;
  return route;
}

/**
 * Rewards loops whose second half runs with the wind. Wind bearing is the
 * direction the wind comes FROM, so travelling toward bearing+180 is a tailwind.
 */
function tailwindHomeScore(route, windBearing, turf) {
  const coords = route?.geometry?.coordinates;
  if (!coords || coords.length < 8 || !turf) return null;
  try {
    const half = Math.floor(coords.length / 2);
    const legs = [];
    for (let i = half; i < coords.length - 1; i += Math.max(1, Math.floor((coords.length - half) / 12))) {
      legs.push(turf.bearing(coords[i], coords[i + 1]));
    }
    if (!legs.length) return null;
    const tailwindDir = (windBearing + 180) % 360;
    const alignment = legs.reduce((sum, b) => {
      const diff = Math.abs(((b - tailwindDir + 540) % 360) - 180);
      return sum + Math.cos((diff * Math.PI) / 180);
    }, 0) / legs.length;
    return alignment * 14;
  } catch { return null; }
}

/** Distance you can still cover before sunset, from remaining daylight. */
export function daylightLimitKm(sunsetMs, nowMs, avgSpeedKmh = 18) {
  if (!Number.isFinite(sunsetMs)) return null;
  const hours = (sunsetMs - nowMs) / 3600000;
  return hours > 0 ? Math.max(3, hours * avgSpeedKmh * 0.9) : 0;
}

/**
 * A single honest sentence comparing this candidate with the others, built
 * only from numbers the routing actually produced.
 */
export function whyThisRoute(route, others) {
  const rest = (others || []).filter((r) => r !== route);
  const bits = [];
  const infra = Number.isFinite(route.osmCycleScore) ? route.osmCycleScore : route.cycleScore;
  const km = (route.distance || 0) / 1000;

  if (Number.isFinite(infra) && rest.length) {
    const best = Math.max(...rest.map((r) => (Number.isFinite(r.osmCycleScore) ? r.osmCycleScore : r.cycleScore) ?? 0));
    if (infra >= best) bits.push(`most cycle infrastructure (${infra}%)`);
  }
  if (Number.isFinite(route.ascent) && rest.length) {
    const climbs = rest.map((r) => r.ascent).filter(Number.isFinite);
    if (climbs.length) {
      const min = Math.min(...climbs);
      const diff = Math.round(min - route.ascent);
      if (diff > 40) bits.push(`${diff} m less climbing`);
      else if (route.ascent - min > 60) bits.push(`${Math.round(route.ascent - min)} m more climbing`);
    }
  }
  if (rest.length) {
    const lengths = rest.map((r) => (r.distance || 0) / 1000).filter((n) => n > 0);
    if (lengths.length) {
      const shortest = Math.min(...lengths);
      const diff = km - shortest;
      if (diff > 3) bits.push(`${diff.toFixed(1)} km longer`);
      else if (shortest - km > 3) bits.push(`${(shortest - km).toFixed(1)} km shorter`);
    }
  }
  if (Number.isFinite(route.retrace) && route.retrace < 0.08) bits.push('almost no repeated road');
  if (route.prefNotes?.length) bits.push(...route.prefNotes);

  if (!bits.length) return null;
  const s = bits.slice(0, 3).join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

/** Head-to-head rows for the comparison view. */
export function compareRoutes(a, b) {
  const val = (r, f) => f(r);
  const rows = [
    { label: 'Distance', get: (r) => (r.distance || 0) / 1000, fmt: (v) => `${v.toFixed(1)} km`, lowerIsBetter: false },
    { label: 'Climbing', get: (r) => r.ascent, fmt: (v) => (Number.isFinite(v) ? `${Math.round(v)} m` : '—'), lowerIsBetter: true },
    { label: 'Climb rate', get: (r) => climbRate(r), fmt: (v) => (Number.isFinite(v) ? `${v.toFixed(1)} m/km` : '—'), lowerIsBetter: true },
    { label: 'Est. time', get: (r) => r.duration, fmt: (v) => (v ? `${Math.floor(v / 3600)}h ${Math.round((v % 3600) / 60)}m` : '—'), lowerIsBetter: true },
    { label: 'Cycle infra', get: (r) => (Number.isFinite(r.osmCycleScore) ? r.osmCycleScore : r.cycleScore), fmt: (v) => (Number.isFinite(v) ? `${v}%` : '—'), lowerIsBetter: false },
    { label: 'Unpaved', get: (r) => (Number.isFinite(r.surfaceUnpavedShare) ? r.surfaceUnpavedShare * 100 : null), fmt: (v) => (Number.isFinite(v) ? `${Math.round(v)}%` : '—'), lowerIsBetter: true },
    { label: 'New road', get: (r) => (Number.isFinite(r.retrace) ? (1 - r.retrace) * 100 : null), fmt: (v) => (Number.isFinite(v) ? `${Math.round(v)}%` : '—'), lowerIsBetter: false },
  ];
  return rows.map((row) => {
    const av = val(a, row.get);
    const bv = val(b, row.get);
    let winner = null;
    if (Number.isFinite(av) && Number.isFinite(bv) && Math.abs(av - bv) > 1e-6) {
      const aWins = row.lowerIsBetter ? av < bv : av > bv;
      winner = aWins ? 'a' : 'b';
    }
    return { label: row.label, a: row.fmt(av), b: row.fmt(bv), winner };
  });
}

/** Today's sunset for a location, used by the "back before sunset" preference. */
export async function fetchSunset(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunset&timezone=auto&forecast_days=1`;
    const data = await fetch(url).then((r) => r.json());
    const iso = data?.daily?.sunset?.[0];
    return iso ? new Date(iso).getTime() : null;
  } catch (error) {
    console.warn('Sunset lookup failed', error);
    return null;
  }
}
