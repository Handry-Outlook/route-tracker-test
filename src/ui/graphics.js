// Inline SVG/image helpers that turn REAL route data into the visuals the
// mockup calls for: route thumbnails drawn from actual coordinates, elevation
// profiles with climb sections coloured by real gradient, and Mapbox static
// map images for route/activity heroes.
//
// Everything here is a pure function returning a markup string, so pages can
// drop it straight into an innerHTML template like the rest of the app.

const ORANGE = '#f28b30';
const BLUE = '#176bdb';

let uid = 0;
const nextId = (p) => `${p}${++uid}`;

/** Projects lng/lat pairs into a padded w x h box, preserving aspect ratio. */
function project(coords, w, h, pad = 6) {
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minX = Math.min(...lons), maxX = Math.max(...lons);
  const minY = Math.min(...lats), maxY = Math.max(...lats);
  // Mercator-ish: longitude degrees shrink with latitude.
  const midLat = (minY + maxY) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180) || 1;
  const spanX = Math.max(1e-6, (maxX - minX) * kx);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;
  return coords.map(([lng, lat]) => [
    offX + (lng - minX) * kx * scale,
    h - (offY + (lat - minY) * scale), // flip: SVG y grows downward
  ]);
}

/** Thins a coordinate list to at most `max` points, keeping first and last. */
export function thin(coords, max = 120) {
  if (!Array.isArray(coords) || coords.length <= max) return coords || [];
  const step = (coords.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * step)]);
}

/**
 * A route thumbnail drawn from real coordinates — the orange-to-blue gradient
 * line from the mockup, with a start dot. Falls back to a neutral tile when
 * there is no geometry yet.
 */
export function routeThumb(coords, w = 64, h = 64, { radius = 12, bg = '#eef2f6', showStart = true } = {}) {
  const id = nextId('rt');
  const pts = thin(coords, 90);
  if (pts.length < 2) {
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block"><rect width="${w}" height="${h}" rx="${radius}" fill="${bg}"/></svg>`;
  }
  const p = project(pts, w, h, Math.max(5, Math.round(w * 0.1)));
  const d = p.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [sx, sy] = p[0];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${ORANGE}"/><stop offset="1" stop-color="${BLUE}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" rx="${radius}" fill="${bg}"/>
    <path d="${d}" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>
    <path d="${d}" fill="none" stroke="url(#${id})" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    ${showStart ? `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3.2" fill="#fff" stroke="${ORANGE}" stroke-width="2"/>` : ''}
  </svg>`;
}

/**
 * Elevation profile with climb sections coloured by real gradient:
 * green under 4%, orange to 8%, red above. `elev` is metres, `distanceKm`
 * scales the gradient calculation.
 */
export function elevationChart(elev, w = 358, h = 92, { distanceKm = 0, dark = false, pending = false } = {}) {
  const vals = (elev || []).filter(Number.isFinite);
  if (vals.length < 2) {
    // "Unavailable" only once it has actually failed; before that it is on its way.
    return `<div style="height:${h}px;display:grid;place-items:center;border-radius:12px;background:var(--surface-muted);color:var(--muted);font-size:11px;font-weight:600">${pending ? 'Loading elevation…' : 'Elevation unavailable right now'}</div>`;
  }
  const id = nextId('ev');
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const range = hi - lo || 1;
  const pad = 4;
  const x = (i) => (i / (vals.length - 1)) * w;
  const y = (v) => pad + (1 - (v - lo) / range) * (h - pad * 2);
  const pts = vals.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const segMetres = ((distanceKm || 0) * 1000) / Math.max(1, vals.length - 1);

  // Colour each span by its gradient.
  let segs = '';
  for (let i = 1; i < pts.length; i++) {
    const rise = vals[i] - vals[i - 1];
    const grade = segMetres > 0 ? (rise / segMetres) * 100 : 0;
    const color = grade >= 8 ? '#d94d4d' : grade >= 4 ? ORANGE : grade > 0 ? '#139b66' : null;
    if (!color) continue;
    segs += `<line x1="${pts[i - 1][0].toFixed(1)}" y1="${pts[i - 1][1].toFixed(1)}" x2="${pts[i][0].toFixed(1)}" y2="${pts[i][1].toFixed(1)}" stroke="${color}" stroke-width="3.4" stroke-linecap="round"/>`;
  }
  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BLUE}" stop-opacity=".22"/><stop offset="1" stop-color="${BLUE}" stop-opacity="0"/></linearGradient></defs>
    <polygon points="0,${h} ${line} ${w},${h}" fill="url(#${id})"/>
    <polyline points="${line}" fill="none" stroke="${dark ? '#93a3b8' : '#9fb0c2'}" stroke-width="2"/>
    ${segs}
  </svg>`;
}

/** Legend for the elevation chart's climb colours. */
export function gradientLegend() {
  const item = (c, l) => `<span class="row" style="gap:4px"><i style="width:10px;height:3px;border-radius:2px;background:${c}"></i>${l}</span>`;
  return `<span class="row muted" style="gap:10px;font-size:11px;font-weight:700">${item('#139b66', '&lt;4%')}${item(ORANGE, '4-8%')}${item('#d94d4d', '8%+')}</span>`;
}

/**
 * Mapbox Static Images URL with the route drawn on it — the "hero terrain
 * photo" slot in the mockup, using a real map of the actual route.
 */
export function staticRouteImage(coords, token, { w = 600, h = 300, style = 'outdoors-v12', retina = true } = {}) {
  const pts = thin(coords, 60);
  if (pts.length < 2 || !token) return null;
  const encoded = encodeURIComponent(
    JSON.stringify({ type: 'LineString', coordinates: pts.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]) })
  );
  const overlay = `geojson(${encoded})`;
  const size = `${w}x${h}${retina ? '@2x' : ''}`;
  const url = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${overlay}/auto/${size}?padding=24&access_token=${token}&attribution=false&logo=false`;
  // Mapbox rejects requests over ~8kb; fall back to a plain map if too long.
  if (url.length > 7800) {
    const mid = pts[Math.floor(pts.length / 2)];
    return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${mid[0].toFixed(4)},${mid[1].toFixed(4)},11/${size}?access_token=${token}&attribution=false&logo=false`;
  }
  return url;
}

/** Layered-hills placeholder for cards with no route geometry or photo. */
export function terrainPlaceholder(w, h, hue = 'warm', radius = 0) {
  const skies = { warm: ['#f9d8a8', '#f4a76a'], cool: ['#cfe3f5', '#7fb3e6'], forest: ['#d9ead0', '#6f9f6a'], coast: ['#dbeefc', '#5aa2d8'] };
  const [a, b] = skies[hue] || skies.warm;
  const id = nextId('tp');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="display:block;border-radius:${radius}px">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#${id})"/>
    <path d="M0 ${h * .62} C ${w * .2} ${h * .45}, ${w * .35} ${h * .7}, ${w * .55} ${h * .5} S ${w * .85} ${h * .35}, ${w} ${h * .55} L ${w} ${h} L 0 ${h}z" fill="#2f5d4a" opacity=".55"/>
    <path d="M0 ${h * .78} C ${w * .25} ${h * .62}, ${w * .5} ${h * .9}, ${w * .7} ${h * .72} S ${w * .9} ${h * .6}, ${w} ${h * .75} L ${w} ${h} L 0 ${h}z" fill="#1f4a3a" opacity=".8"/>
  </svg>`;
}

/** Difficulty from distance + climbing, used for the badges in the mockup. */
export function difficultyFor(distanceKm, elevationM) {
  const km = distanceKm || 0;
  const m = elevationM || 0;
  const score = km + m / 12;
  if (score < 30) return { label: 'Easy', tone: 'green' };
  if (score < 75) return { label: 'Moderate', tone: 'orange' };
  return { label: 'Hard', tone: 'red' };
}

/** "42.3 km", "1h 24m", "610 m" style formatters used across the screens. */
export const fmtKm = (km) => `${(km || 0).toFixed((km || 0) < 100 ? 1 : 0)} km`;
export const fmtM = (m) => `${Math.round(m || 0)} m`;
export function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}
