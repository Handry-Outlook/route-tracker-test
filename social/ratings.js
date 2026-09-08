// Route ratings and ride counts — roadmap item 13.
//
// Ratings hang off a stable route id (a saved route's id, or a shared-route
// id), so only routes that actually have an identity can be rated — a
// freshly generated loop has nothing to attach to until it is saved.
//
//   routeStats/{routeId}                 {avg, count, rideCount}
//   routeStats/{routeId}/ratings/{uid}   {stars, createdAt}
import { getCloud } from '../legacy.js';

export function routeIdOf(item) {
  return item?.savedId || item?.id || null;
}

export async function getRouteStats(routeId) {
  if (!routeId) return null;
  try {
    const db = await getCloud();
    const snap = await db.getDoc(db.doc(db.firestore, 'routeStats', routeId));
    return snap.exists() ? snap.data() : { avg: 0, count: 0, rideCount: 0 };
  } catch (error) {
    console.warn('Route stats unavailable', error);
    return null;
  }
}

export async function getMyRating(routeId, uid) {
  if (!routeId || !uid) return 0;
  try {
    const db = await getCloud();
    const snap = await db.getDoc(db.doc(db.firestore, 'routeStats', routeId, 'ratings', uid));
    return snap.exists() ? snap.data().stars || 0 : 0;
  } catch { return 0; }
}

/**
 * Writes the rider's own star rating, then recomputes the average from the
 * ratings actually stored — the aggregate is never trusted as an input.
 */
export async function rateRoute(routeId, uid, stars) {
  const db = await getCloud();
  await db.setDoc(db.doc(db.firestore, 'routeStats', routeId, 'ratings', uid), {
    uid, stars: Math.max(1, Math.min(5, Math.round(stars))), createdAt: db.serverTimestamp(),
  });
  const all = await db.getDocs(db.collection(db.firestore, 'routeStats', routeId, 'ratings'));
  let sum = 0, n = 0;
  all.docs.forEach((d) => { const s = d.data().stars; if (Number.isFinite(s)) { sum += s; n += 1; } });
  const avg = n ? sum / n : 0;
  await db.setDoc(db.doc(db.firestore, 'routeStats', routeId), { avg, count: n }, { merge: true });
  return { avg, count: n };
}

/** Counts a completed ride against the route it was ridden from. */
export async function recordRouteRidden(routeId) {
  if (!routeId) return;
  try {
    const db = await getCloud();
    await db.setDoc(db.doc(db.firestore, 'routeStats', routeId), { rideCount: db.increment(1) }, { merge: true });
  } catch (error) {
    console.warn('Ride count not recorded', error);
  }
}

/** Public ride photos taken on this route — the detail-screen carousel (item 14). */
export async function routePhotos(routeId, max = 12) {
  if (!routeId) return [];
  try {
    const db = await getCloud();
    const snap = await db.getDocs(
      db.query(db.collection(db.firestore, 'activities'), db.where('routeId', '==', routeId), db.limit(max))
    );
    return snap.docs.flatMap((d) => {
      const a = d.data();
      return (a.photoUrls || []).map((url) => ({ url, by: a.ownerDisplayName || 'Rider', activityId: d.id }));
    }).slice(0, max);
  } catch (error) {
    console.warn('Route photos unavailable', error);
    return [];
  }
}

export function starsHtml(avg, size = 14) {
  const full = Math.round(avg || 0);
  const star = '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>';
  return `<span class="stars">${Array.from({ length: 5 }, (_, i) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" style="opacity:${i < full ? 1 : 0.25}">${star}</svg>`).join('')}</span>`;
}
