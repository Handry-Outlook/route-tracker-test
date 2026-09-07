// Real OpenStreetMap cycle-infrastructure, surface, and POI data via the
// public Overpass API — replaces the regex-over-step-names heuristic and
// the two stubbed discovery functions the app shipped with. This is the
// single highest-leverage change for making route recommendations feel
// like Komoot's instead of a keyword guess.
//
// The public Overpass instance has no SLA and is rate-limited, so every
// call here is short-timeout-and-fall-back: a slow or failed Overpass
// request must never block route generation, it should just mean the
// caller falls back to its own heuristic for that one request.

import { getCached, setCached, cacheKey } from './overpassCache.js';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const TIMEOUT_MS = 6000;

const INFRA_WEIGHTS = {
  cycleway: 1.0,
  path: 0.9,
  track: 0.7,
  living_street: 0.6,
  pedestrian: 0.55,
  residential: 0.4,
  unclassified: 0.3,
  tertiary: 0.2,
  secondary: 0.1,
  primary: 0.05,
};

async function runQuery(query) {
  for (const endpoint of ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json, */*' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn(`Overpass request failed at ${endpoint}`, error);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function bboxQL([west, south, east, north]) {
  return `${south},${west},${north},${east}`;
}

// One combined query per bbox: cycle/road infrastructure with surface
// tags, plus a handful of POI categories useful as scenic/rest-stop
// waypoints for Adventure loops. Kept as a single request (rather than
// one per data type) to minimize round-trips against a rate-limited
// public instance.
function buildQuery(bbox) {
  const bb = bboxQL(bbox);
  return `[out:json][timeout:25];(
    way["highway"~"^(cycleway|path|track|living_street|pedestrian|residential|unclassified|tertiary|secondary|primary)$"](${bb});
    node["tourism"~"^(viewpoint|attraction)$"](${bb});
    node["leisure"~"^(park|nature_reserve)$"](${bb});
    node["natural"~"^(peak|water)$"](${bb});
    node["amenity"~"^(cafe|drinking_water)$"](${bb});
  );out geom;`;
}

async function fetchBbox(bbox) {
  const key = cacheKey('bbox', bbox);
  const cached = await getCached(key);
  if (cached) return cached;
  const raw = await runQuery(buildQuery(bbox));
  if (!raw?.elements) return null;
  const ways = [];
  const pois = [];
  for (const el of raw.elements) {
    if (el.type === 'way' && el.geometry?.length) {
      ways.push({
        highway: el.tags?.highway || '',
        surface: el.tags?.surface || '',
        coords: el.geometry.map((p) => [p.lon, p.lat]),
      });
    } else if (el.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
      const category = el.tags?.tourism || el.tags?.leisure || el.tags?.natural || el.tags?.amenity;
      if (category) pois.push({ coord: [el.lon, el.lat], name: el.tags?.name || category, category });
    }
  }
  const data = { ways, pois, fetchedAt: Date.now() };
  setCached(key, data);
  return data;
}

/**
 * Fetches infrastructure + POI data for the union bbox of one or more
 * candidate routes/loops in a single Overpass call, so N candidates cost
 * one request instead of N. Returns null on total failure (caller should
 * fall back to its own heuristic) rather than throwing.
 */
export async function fetchOverpassArea(bbox, bufferDeg = 0.01) {
  const buffered = [bbox[0] - bufferDeg, bbox[1] - bufferDeg, bbox[2] + bufferDeg, bbox[3] + bufferDeg];
  try {
    return await fetchBbox(buffered);
  } catch (error) {
    console.warn('Overpass area fetch failed', error);
    return null;
  }
}

function pointNearWay(point, way, toleranceKm, turf) {
  if (way.coords.length < 2) return false;
  try {
    const line = turf.lineString(way.coords);
    const snap = turf.nearestPointOnLine(line, turf.point(point));
    return (snap.properties.dist || Infinity) <= toleranceKm;
  } catch {
    return false;
  }
}

/**
 * Scores how much of a route's distance runs on real dedicated/quiet
 * cycling infrastructure, using actual OSM highway+surface tags rather
 * than matching keywords in a Mapbox step name. Returns a 0-100 score
 * and a surface breakdown, or null if no Overpass data is available
 * (caller should fall back to the regex heuristic in that case).
 */
export function scoreRouteAgainstOverpass(routeCoords, overpassData, turf, sampleEveryKm = 0.12) {
  if (!overpassData?.ways?.length || !routeCoords?.length) return null;
  const line = turf.lineString(routeCoords);
  const totalKm = turf.length(line);
  if (totalKm < 0.05) return null;
  let weightedKm = 0;
  let unpavedKm = 0;
  let sampledKm = 0;
  for (let d = 0; d < totalKm; d += sampleEveryKm) {
    const point = turf.along(line, d).geometry.coordinates;
    let bestWeight = 0;
    let unpaved = false;
    for (const way of overpassData.ways) {
      if (!pointNearWay(point, way, 0.02, turf)) continue;
      const weight = INFRA_WEIGHTS[way.highway] ?? 0.15;
      if (weight > bestWeight) bestWeight = weight;
      if (/unpaved|gravel|dirt|ground|grass/.test(way.surface)) unpaved = true;
    }
    weightedKm += bestWeight * sampleEveryKm;
    if (unpaved) unpavedKm += sampleEveryKm;
    sampledKm += sampleEveryKm;
  }
  const score = Math.round(Math.min(100, (weightedKm / Math.max(0.05, sampledKm)) * 100));
  const unpavedShare = unpavedKm / Math.max(0.05, sampledKm);
  return { score, unpavedShare };
}

/**
 * Real POI-driven waypoint candidates for Adventure loops — replaces the
 * previously-stubbed discoverAdventurePlacesFast(), which always
 * returned []. Scores each POI by category and distance from the ring's
 * ideal radius so the loop builder can pick genuinely interesting stops
 * (viewpoints, parks, cafes) instead of only geometric anchor points.
 */
export function poisFromOverpass(overpassData, start, turf, maxDistanceKm = 30) {
  if (!overpassData?.pois?.length) return [];
  const CATEGORY_SCORE = { viewpoint: 22, peak: 20, attraction: 16, nature_reserve: 15, park: 12, water: 14, cafe: 8, drinking_water: 5 };
  return overpassData.pois
    .map((poi) => {
      const distance = turf.distance(start, poi.coord, { units: 'kilometers' });
      return {
        coord: poi.coord,
        name: poi.name,
        category: poi.category,
        distance,
        bearing: (turf.bearing(start, poi.coord) + 360) % 360,
        score: (CATEGORY_SCORE[poi.category] || 6) - distance * 0.4,
      };
    })
    .filter((p) => p.distance > 0.3 && p.distance <= maxDistanceKm)
    .sort((a, b) => b.score - a.score);
}
