// Friends riding now, on the map — roadmap item 10.
//
// The app already writes a live-journey document while recording. This reads
// those documents for the riders you follow and keeps a marker on the map for
// each one, refreshing on an interval and cleaning up when they stop.
import { getCloud } from '../legacy.js';
import { listFollowingUids } from './follows.js';

const markers = new Map();
let timer = 0;
let running = false;

const initials = (n = '') => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || 'R';
const colorFor = (uid = '') => ['#8b5bd6', '#00a6a6', '#176bdb', '#f28b30', '#139b66'][[...uid].reduce((a, c) => a + c.charCodeAt(0), 0) % 5];

async function fetchActiveFriends(uid) {
  const uids = await listFollowingUids(uid).catch(() => []);
  if (!uids.length) return [];
  const db = await getCloud();
  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db.getDocs(db.query(db.collection(db.firestore, 'journeys_v4'), db.where('ownerId', 'in', chunk), db.where('active', '==', true)))
    )
  );
  const out = [];
  snaps.forEach((snap) => snap.docs.forEach((d) => {
    const data = d.data();
    if (data?.paused) return;
    const loc = data.location;
    if (!loc || !Number.isFinite(loc.lng) || !Number.isFinite(loc.lat)) return;
    out.push({ id: d.id, ownerId: data.ownerId, name: data.riderName || data.routeName || 'Rider', pos: [loc.lng, loc.lat] });
  }));
  return out;
}

function markerElement(friend) {
  const el = document.createElement('div');
  el.className = 'friend-marker';
  el.style.background = colorFor(friend.ownerId);
  el.textContent = initials(friend.name);
  el.title = `${friend.name} is riding now`;
  return el;
}

async function refresh(ctx) {
  const { state, map, mapboxgl } = ctx;
  if (!state.user) return;
  let friends = [];
  try { friends = await fetchActiveFriends(state.user.uid); }
  catch (error) { console.warn('Live friends unavailable', error); return; }

  const seen = new Set();
  friends.forEach((f) => {
    seen.add(f.id);
    const existing = markers.get(f.id);
    if (existing) existing.setLngLat(f.pos);
    else markers.set(f.id, new mapboxgl.Marker({ element: markerElement(f) }).setLngLat(f.pos).addTo(map));
  });
  [...markers.keys()].forEach((id) => {
    if (seen.has(id)) return;
    markers.get(id)?.remove();
    markers.delete(id);
  });
  ctx.onCount?.(friends.length);
}

/** Starts polling. Safe to call repeatedly. */
export function startLiveFriends(ctx, intervalMs = 25000) {
  if (running) return;
  running = true;
  refresh(ctx);
  timer = setInterval(() => refresh(ctx), intervalMs);
}

export function stopLiveFriends() {
  running = false;
  clearInterval(timer);
  markers.forEach((m) => m.remove());
  markers.clear();
}

export function isRunning() {
  return running;
}
