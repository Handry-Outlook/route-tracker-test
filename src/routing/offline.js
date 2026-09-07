// Offline routes — roadmap item 8.
//
// Stores everything needed to ride a route with no signal: the geometry, the
// turn steps and cue sheet, the elevation and wind series, and a rendered
// static map image kept as a blob.
//
// Scope note, stated plainly in the UI too: this does NOT cache Mapbox's
// vector tiles, so the live slippy map still needs a connection. What you get
// offline is the route line, the full cue sheet and the saved map image —
// enough to ride and navigate by. Tile caching needs Mapbox's paid offline
// SDK, which the web SDK does not offer.

const DB_NAME = 'ridewise-offline';
const STORE = 'routes';
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      let out = null;
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const req = fn(store);
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => resolve(out);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    });
  });
}

export function isSupported() {
  return typeof indexedDB !== 'undefined';
}

/**
 * Saves a route for offline use. `imageUrl` is fetched and stored as a blob so
 * the map picture survives without a connection.
 */
export async function saveOffline(id, route, { cues = [], imageUrl = null, name = '' } = {}) {
  let image = null;
  if (imageUrl) {
    try {
      const res = await fetch(imageUrl);
      if (res.ok) image = await res.blob();
    } catch (error) {
      console.warn('Offline map image unavailable', error);
    }
  }
  const record = {
    id,
    name: name || route?.savedName || route?.name || 'Saved route',
    savedAt: Date.now(),
    distance: route?.distance || 0,
    ascent: route?.ascent ?? null,
    geometry: route?.geometry || null,
    legs: route?.legs || [],
    elev: route?.elev || [],
    wind: route?.wind || [],
    cues,
    image,
  };
  await tx('readwrite', (store) => store.put(record));
  return record;
}

export function getOffline(id) {
  return tx('readonly', (store) => store.get(id));
}

export function removeOffline(id) {
  return tx('readwrite', (store) => store.delete(id));
}

export async function listOffline() {
  const all = await tx('readonly', (store) => store.getAll());
  return Array.isArray(all) ? all.sort((a, b) => b.savedAt - a.savedAt) : [];
}

export async function offlineIds() {
  const all = await listOffline();
  return new Set(all.map((r) => r.id));
}

/** Rough footprint, so the UI can say how much space the offline set uses. */
export async function offlineSizeBytes() {
  const all = await listOffline();
  return all.reduce((n, r) => {
    const geo = JSON.stringify(r.geometry || {}).length;
    const legs = JSON.stringify(r.legs || []).length;
    return n + geo + legs + (r.image?.size || 0);
  }, 0);
}
