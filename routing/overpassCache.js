// IndexedDB cache for Overpass responses, keyed by a coarsely-quantized
// bounding box (~1.1km grid cells) so nearby route requests share cache
// hits instead of re-querying Overpass for almost-identical areas.
// A plain object payload can be a few hundred KB to a few MB for a
// city-sized bbox, well past localStorage's ~5-10MB *total* origin quota,
// so this lives in IndexedDB instead.

const DB_NAME = 'ridewise-overpass-cache';
const STORE = 'responses';
const TTL_MS = 14 * 24 * 60 * 60 * 1000; // OSM infra/POI tags change slowly.

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null); // Cache is an optimization, never a hard dependency.
  });
  return dbPromise;
}

export function quantizeBbox([west, south, east, north], gridDeg = 0.01) {
  const q = (v) => Math.round(v / gridDeg) * gridDeg;
  return [q(west), q(south), q(east), q(north)];
}

export function cacheKey(kind, bbox) {
  return `${kind}:${quantizeBbox(bbox).map((v) => v.toFixed(3)).join(',')}`;
}

export async function getCached(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      tx.onsuccess = () => {
        const entry = tx.result;
        if (!entry || Date.now() - entry.savedAt > TTL_MS) return resolve(null);
        resolve(entry.data);
      };
      tx.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setCached(key, data) {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ data, savedAt: Date.now() }, key);
  } catch {
    // Quota errors etc. — cache is best-effort, ignore.
  }
}
