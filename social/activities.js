// Public activity feed: a top-level, queryable `activities` collection —
// distinct from the pre-existing `users/{uid}/activities` blob store
// (kept as-is for the rider's own private full-detail history). Feed
// entries are lightweight summaries with owner info denormalized onto
// the doc so a feed screen never needs a join per card, plus a
// simplified route line for a thumbnail (not the full GPS trace).
//
// Schema: activities/{id} — {ownerId, ownerDisplayName, ownerPhotoURL,
//   title, startedAt, distanceKm, elevationGainM, avgSpeedKmh,
//   routeSummaryGeoJson, routeIsPlanned, routeEndsHidden, plannedDistanceKm,
//   photoUrls, kudosCount, commentCount, visibility}
//
// The stored summary never includes the first or last few hundred metres: see
// clipPrivacyEnds. Riders start and finish at home, and every signed-in rider
// can read this collection.
// activities/{id}/kudos/{uid} — {uid, createdAt}
// activities/{id}/comments/{commentId} — {authorUid, authorDisplayName, authorPhotoURL, text, createdAt}
import { getCloud } from '../legacy.js';
import { uploadActivityPhotos } from './storageUpload.js';
import { incrementRiderStats } from './firestoreClient.js';

const FEED_UID_CHUNK = 30; // Firestore's `in` operator limit.

function simplifyRoute(coords, turf, maxPoints = 60) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  if (coords.length <= maxPoints) return { type: 'LineString', coordinates: coords };
  const line = turf.lineString(coords);
  const length = turf.length(line);
  const pts = Array.from({ length: maxPoints }, (_, i) => turf.along(line, (length * i) / (maxPoints - 1)).geometry.coordinates);
  return { type: 'LineString', coordinates: pts };
}

/**
 * Which line to show for a ride.
 *
 * The recorded trace is what actually happened, so it wins whenever there is
 * one. But a ride abandoned early, or saved without GPS at all, used to leave
 * the feed card with no preview whatsoever. Falling back to the route the rider
 * was following means there is almost always something to show, and the flag
 * lets the card say which of the two it is drawing rather than passing a plan
 * off as a ride.
 */
export const DEFAULT_PRIVACY_RADIUS_M = 400;

/**
 * Drops the portion of a line within `metres` of each end. A ride that starts
 * and finishes at home otherwise publishes that address twice, precisely and
 * permanently. Returns null when trimming would leave nothing meaningful —
 * better no preview than a preview that still points at the door.
 */
export function clipPrivacyEnds(coords, turf, metres = DEFAULT_PRIVACY_RADIUS_M) {
  if (!Array.isArray(coords) || coords.length < 2 || !(metres > 0)) return coords || null;
  const beyond = (a, b) => {
    try { return turf.distance(a, b, { units: 'meters' }) > metres; } catch { return true; }
  };
  const first = coords[0];
  const last = coords[coords.length - 1];
  let start = 0;
  while (start < coords.length && !beyond(coords[start], first)) start++;
  let end = coords.length - 1;
  while (end > start && !beyond(coords[end], last)) end--;
  const clipped = coords.slice(start, end + 1);
  return clipped.length >= 2 ? clipped : null;
}

function plannedDistanceKm(coords, turf) {
  try { return turf.length(turf.lineString(coords), { units: 'kilometers' }); } catch { return 0; }
}
function routeSummaryFields(coords, plannedRoute, turf, privacyRadiusM = DEFAULT_PRIVACY_RADIUS_M) {
  if (coords.length >= 2) {
    const shown = clipPrivacyEnds(coords, turf, privacyRadiusM);
    return {
      routeSummaryGeoJson: shown ? JSON.stringify(simplifyRoute(shown, turf)) : null,
      routeIsPlanned: false,
      routeEndsHidden: !!privacyRadiusM,
    };
  }
  if (Array.isArray(plannedRoute) && plannedRoute.length >= 2) {
    // The plan starts at the door too.
    const shown = clipPrivacyEnds(plannedRoute, turf, privacyRadiusM);
    if (!shown) return { routeSummaryGeoJson: null, routeIsPlanned: false, routeEndsHidden: !!privacyRadiusM };
    return {
      routeSummaryGeoJson: JSON.stringify(simplifyRoute(shown, turf)),
      routeIsPlanned: true,
      routeEndsHidden: !!privacyRadiusM,
      // The recorded distance is ~0 on these, so the card needs the plan's own
      // length to have any honest number to show.
      plannedDistanceKm: plannedDistanceKm(plannedRoute, turf),
    };
  }
  return { routeSummaryGeoJson: null, routeIsPlanned: false, routeEndsHidden: false };
}

/**
 * Publishes a completed ride as a public feed entry. This runs alongside
 * (not instead of) the existing private putAccountItem('activities', …)
 * save, so a user's own full-detail history is untouched either way.
 */
export async function publishActivityToFeed(user, activity, turf, privacyRadiusM = DEFAULT_PRIVACY_RADIUS_M) {
  const db = await getCloud();
  const id = activity.id || crypto.randomUUID();
  const coords = (activity.samples || []).map((s) => s.pos).filter(Boolean);
  let photoUrls = [];
  if (activity.photos?.length) {
    try {
      photoUrls = await uploadActivityPhotos(user.uid, id, activity.photos);
    } catch (error) {
      console.warn('Activity photo upload failed; publishing without photos', error);
    }
  }
  await db.setDoc(db.doc(db.firestore, 'activities', id), {
    ownerId: user.uid,
    ownerDisplayName: user.displayName || user.email?.split('@')[0] || 'Rider',
    ownerPhotoURL: user.photoURL || null,
    title: activity.name || 'Cycling activity',
    startedAt: activity.started || Date.now(),
    distanceKm: activity.distance || 0,
    elevationGainM: activity.gain || 0,
    avgSpeedKmh: activity.avgSpeed || 0,
    ...routeSummaryFields(coords, activity.plannedRoute, turf, privacyRadiusM),
    photoUrls,
    kudosCount: 0,
    commentCount: 0,
    visibility: 'public',
  });
  await incrementRiderStats(user.uid, { distanceKm: activity.distance || 0, elevationM: activity.gain || 0 }).catch(() => {});
  return id;
}

export async function fetchFeed(ownFollowedUids, { limitPerChunk = 20 } = {}) {
  if (!ownFollowedUids.length) return [];
  const db = await getCloud();
  const chunks = [];
  for (let i = 0; i < ownFollowedUids.length; i += FEED_UID_CHUNK) chunks.push(ownFollowedUids.slice(i, i + FEED_UID_CHUNK));
  const results = await Promise.all(
    chunks.map((chunk) =>
      db.getDocs(
        db.query(
          db.collection(db.firestore, 'activities'),
          db.where('ownerId', 'in', chunk),
          db.orderBy('startedAt', 'desc'),
          db.limit(limitPerChunk)
        )
      )
    )
  );
  const items = results.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  items.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return items;
}

export async function toggleKudos(activityId, uid, currentlyGiven) {
  const db = await getCloud();
  const kudosRef = db.doc(db.firestore, 'activities', activityId, 'kudos', uid);
  const activityRef = db.doc(db.firestore, 'activities', activityId);
  if (currentlyGiven) {
    await db.deleteDoc(kudosRef);
    await db.setDoc(activityRef, { kudosCount: db.increment(-1) }, { merge: true });
  } else {
    await db.setDoc(kudosRef, { uid, createdAt: db.serverTimestamp() });
    await db.setDoc(activityRef, { kudosCount: db.increment(1) }, { merge: true });
  }
}

export async function hasGivenKudos(activityId, uid) {
  const db = await getCloud();
  const snap = await db.getDoc(db.doc(db.firestore, 'activities', activityId, 'kudos', uid));
  return snap.exists();
}

export async function addComment(activityId, author, text) {
  const db = await getCloud();
  await db.addDoc(db.collection(db.firestore, 'activities', activityId, 'comments'), {
    authorUid: author.uid,
    authorDisplayName: author.displayName || 'Rider',
    authorPhotoURL: author.photoURL || null,
    text: text.slice(0, 500),
    createdAt: db.serverTimestamp(),
  });
  await db.setDoc(db.doc(db.firestore, 'activities', activityId), { commentCount: db.increment(1) }, { merge: true });
}

export async function listComments(activityId) {
  const db = await getCloud();
  const snap = await db.getDocs(db.query(db.collection(db.firestore, 'activities', activityId, 'comments'), db.orderBy('createdAt', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
