// Community discovery queries over the public `activities` collection —
// what powers the "Community favourites" and "New this week" rails on the
// Adventure screen. Both are real Firestore reads; when the collection is
// empty (a fresh project) they simply return [], and the UI shows an
// honest empty state rather than invented content.
import { getCloud } from '../legacy.js';

async function queryActivities(build) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(build(db));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn('Discovery query unavailable', error);
    return [];
  }
}

/** Most-kudosed public rides — "Community favourites". */
export function popularActivities(max = 10) {
  return queryActivities((db) =>
    db.query(
      db.collection(db.firestore, 'activities'),
      db.where('visibility', '==', 'public'),
      db.orderBy('kudosCount', 'desc'),
      db.limit(max)
    )
  );
}

/** Public rides from the last 7 days — "New this week". */
export function recentActivities(max = 10, sinceMs) {
  const cutoff = sinceMs ?? 0;
  return queryActivities((db) =>
    db.query(
      db.collection(db.firestore, 'activities'),
      db.where('visibility', '==', 'public'),
      db.where('startedAt', '>=', cutoff),
      db.orderBy('startedAt', 'desc'),
      db.limit(max)
    )
  );
}

/** A single public activity, for the route/ride detail screen. */
export async function getActivity(id) {
  try {
    const db = await getCloud();
    const snap = await db.getDoc(db.doc(db.firestore, 'activities', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn('Activity fetch failed', error);
    return null;
  }
}

/**
 * How many riders you follow are recording right now — the "riding now"
 * badge on the feed. Reads the live-journey docs the app already writes.
 */
export async function ridingNowCount(followedUids) {
  if (!followedUids?.length) return 0;
  try {
    const db = await getCloud();
    const chunks = [];
    for (let i = 0; i < followedUids.length; i += 30) chunks.push(followedUids.slice(i, i + 30));
    const snaps = await Promise.all(
      chunks.map((chunk) =>
        db.getDocs(db.query(db.collection(db.firestore, 'journeys_v4'), db.where('ownerId', 'in', chunk), db.where('active', '==', true)))
      )
    );
    return snaps.reduce((n, s) => n + s.size, 0);
  } catch (error) {
    console.warn('Riding-now count unavailable', error);
    return 0;
  }
}
