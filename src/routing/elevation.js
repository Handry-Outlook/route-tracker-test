// Elevation along a route, from two independent sources.
//
// Open-Meteo is tried first: one request covers up to 100 points. It is a free
// service with a per-connection daily quota, and when that quota is spent it
// answers 429 for the rest of the day. Elevation was then simply missing — the
// planner cards spun on "Loading elevation" forever and the navigation strip
// never appeared. Mapbox's terrain tiles are the second source: the same token
// the map already uses, decoded in the browser, and they share the tile cache
// with the map itself.

const OPEN_METEO_MAX_POINTS = 100;
const DEM_MAX_ZOOM = 14;       // terrain-dem-v1 has no data above z14
const DEM_MIN_ZOOM = 10;
const DEM_MAX_TILES = 32;      // per request; zoom drops until the route fits
const DEM_CACHE_TILES = 40;    // decoded tiles kept (256 × 256 × 4 bytes each)
const DEM_CONCURRENCY = 6;

let openMeteoBlockedUntil = 0;
const demCache = new Map();    // "z/x/y" -> Promise<{size, data}>

async function fromOpenMeteo(points, signal) {
  if (points.length > OPEN_METEO_MAX_POINTS) throw new Error('Too many points for Open-Meteo');
  if (Date.now() < openMeteoBlockedUntil) throw new Error('Open-Meteo quota spent');
  const lat = points.map((p) => +p[1].toFixed(5)).join(',');
  const lng = points.map((p) => +p[0].toFixed(5)).join(',');
  const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`, { signal });
  if (!res.ok) {
    // A spent quota stays spent: stop asking, so every route does not wait on a
    // request that is certain to fail. A daily limit is rechecked hourly.
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      openMeteoBlockedUntil = Date.now() + (/daily/i.test(body?.reason || '') ? 3600000 : 60000);
    }
    throw new Error(`Open-Meteo ${res.status}`);
  }
  const elevation = (await res.json())?.elevation;
  if (!Array.isArray(elevation) || elevation.length !== points.length || !elevation.every(Number.isFinite)) {
    throw new Error('Open-Meteo returned an incomplete profile');
  }
  return elevation;
}

function tileCoords(lng, lat, z) {
  const n = 2 ** z, rad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

async function decodeTile(blob) {
  // No colour management or premultiplication: the RGB bytes ARE the height,
  // and a browser "correcting" them would shift every value.
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const size = bitmap.width;
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(size, size)
    : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return { size, data: ctx.getImageData(0, 0, size, size).data };
}

function demTile(z, x, y, token, signal) {
  const key = `${z}/${x}/${y}`;
  if (demCache.has(key)) {
    const hit = demCache.get(key);
    demCache.delete(key); demCache.set(key, hit); // most recently used last
    return hit;
  }
  const job = fetch(`https://api.mapbox.com/v4/mapbox.mapbox-terrain-dem-v1/${key}.pngraw?access_token=${token}`, { signal })
    .then((res) => { if (!res.ok) throw new Error(`Mapbox terrain ${res.status}`); return res.blob(); })
    .then(decodeTile);
  job.catch(() => demCache.delete(key)); // a failed tile is retried next time
  demCache.set(key, job);
  while (demCache.size > DEM_CACHE_TILES) demCache.delete(demCache.keys().next().value);
  return job;
}

function heightAt(tile, px, py) {
  const { size, data } = tile;
  const read = (x, y) => {
    const i = (Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))) * 4;
    return -10000 + (data[i] * 65536 + data[i + 1] * 256 + data[i + 2]) * 0.1;
  };
  // Bilinear, so neighbouring samples do not step between whole pixels.
  const x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5), fx = px - 0.5 - x0, fy = py - 0.5 - y0;
  const top = read(x0, y0) * (1 - fx) + read(x0 + 1, y0) * fx;
  const bottom = read(x0, y0 + 1) * (1 - fx) + read(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

async function fromMapboxTerrain(points, token, signal) {
  if (!token) throw new Error('No Mapbox token');
  if (typeof createImageBitmap !== 'function') throw new Error('Terrain decoding unsupported');
  let z = DEM_MAX_ZOOM, placed;
  for (; z >= DEM_MIN_ZOOM; z--) {
    placed = points.map((p) => {
      const t = tileCoords(p[0], p[1], z), tx = Math.floor(t.x), ty = Math.floor(t.y);
      return { key: `${tx}/${ty}`, tx, ty, fx: t.x - tx, fy: t.y - ty };
    });
    if (new Set(placed.map((p) => p.key)).size <= DEM_MAX_TILES || z === DEM_MIN_ZOOM) break;
  }
  const keys = [...new Set(placed.map((p) => p.key))];
  const tiles = new Map();
  for (let i = 0; i < keys.length; i += DEM_CONCURRENCY) {
    await Promise.all(keys.slice(i, i + DEM_CONCURRENCY).map(async (key) => {
      const [tx, ty] = key.split('/').map(Number);
      tiles.set(key, await demTile(z, tx, ty, token, signal).catch(() => null));
    }));
  }
  const heights = placed.map((p) => {
    const tile = tiles.get(p.key);
    return tile ? heightAt(tile, p.fx * tile.size, p.fy * tile.size) : null;
  });
  const missing = heights.filter((h) => !Number.isFinite(h)).length;
  if (missing > heights.length * 0.2) throw new Error('Mapbox terrain tiles unavailable');
  return fillGaps(heights);
}

// A few points in a tile that failed to load are filled from their neighbours.
function fillGaps(values) {
  const out = values.slice();
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i])) continue;
    let a = i - 1; while (a >= 0 && !Number.isFinite(out[a])) a--;
    let b = i + 1; while (b < out.length && !Number.isFinite(values[b])) b++;
    const left = a >= 0 ? out[a] : null, right = b < out.length ? values[b] : null;
    out[i] = left === null ? right : right === null ? left : left + ((right - left) * (i - a)) / (b - a);
  }
  return out.map((v) => Math.round(v * 10) / 10);
}

/**
 * Heights in metres for each [lng, lat] point, in order.
 * Resolves {elev, source}; rejects only when both sources failed.
 */
export async function fetchElevations(points, { token, signal } = {}) {
  if (!Array.isArray(points) || points.length < 2) throw new Error('Need at least two points');
  const errors = [];
  if (points.length <= OPEN_METEO_MAX_POINTS) {
    try { return { elev: await fromOpenMeteo(points, signal), source: 'open-meteo' }; }
    catch (error) { if (signal?.aborted) throw error; errors.push(error.message); }
  }
  try { return { elev: await fromMapboxTerrain(points, token, signal), source: 'mapbox-terrain' }; }
  catch (error) { errors.push(error.message); }
  throw new Error(`Elevation unavailable (${errors.join('; ')})`);
}

/**
 * Evenly spaced points along a line, by distance — never by vertex index. The
 * elevation profile and the rider's place on it both assume equal spacing, and
 * a route's vertices bunch up at every bend.
 */
export function elevationSamplePoints(coords, turf, maxPoints = OPEN_METEO_MAX_POINTS) {
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + turf.distance(coords[i - 1], coords[i], { units: 'meters' }));
  const total = cum.at(-1);
  if (!(total > 0)) return [coords[0], coords.at(-1)];
  // About one point every 25 m on a short route, never fewer than 10.
  const count = Math.max(10, Math.min(maxPoints, Math.round(total / 25) + 1));
  const out = [];
  let seg = 1;
  for (let k = 0; k < count; k++) {
    const d = (total * k) / (count - 1);
    while (seg < coords.length - 1 && cum[seg] < d) seg++;
    const a = coords[seg - 1], b = coords[seg], span = cum[seg] - cum[seg - 1];
    const t = span > 0 ? Math.min(1, Math.max(0, (d - cum[seg - 1]) / span)) : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
