// Segments and personal records — roadmap item 15.
//
// Riders draw a segment from part of a route or a recorded ride. When a ride is
// saved, its GPS trace is matched against every segment nearby: the trace must
// pass the start, then the end, in order, within a tolerance — the same idea
// Strava uses, done client-side on the rider's own trace.
//
//   segments/{id}                  {name, createdBy, distanceKm, start, end, polyline, bbox}
//   segments/{id}/efforts/{uid_ts} {uid, displayName, seconds, activityId, riddenAt}
import { getCloud } from '../legacy.js';

const MATCH_TOLERANCE_M = 35;

export async function listSegmentsNear(center, radiusKm, turf, max = 40) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(db.query(db.collection(db.firestore, 'segments'), db.limit(max)));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => {
        if (!center || !Array.isArray(s.start)) return true;
        try { return turf.distance(center, s.start, { units: 'kilometers' }) <= radiusKm; } catch { return false; }
      });
  } catch (error) {
    console.warn('Segments unavailable', error);
    return [];
  }
}

export async function createSegment(user, { name, coords, turf }) {
  if (!Array.isArray(coords) || coords.length < 2) throw new Error('Segment needs a path');
  const db = await getCloud();
  const line = turf.lineString(coords);
  const distanceKm = turf.length(line, { units: 'kilometers' });
  const bbox = turf.bbox(line);
  const ref = await db.addDoc(db.collection(db.firestore, 'segments'), {
    name: (name || 'Segment').slice(0, 80),
    createdBy: user.uid,
    createdAt: db.serverTimestamp(),
    distanceKm,
    start: coords[0],
    end: coords[coords.length - 1],
    polyline: JSON.stringify(coords),
    bbox,
    effortCount: 0,
  });
  return ref.id;
}

export async function listEfforts(segmentId, max = 50) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(
      db.query(db.collection(db.firestore, 'segments', segmentId, 'efforts'), db.orderBy('seconds', 'asc'), db.limit(max))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

/**
 * Matches one activity trace against a segment. Returns elapsed seconds, or
 * null when the ride did not cover it. Requires passing the start and then the
 * end, in order, each within tolerance.
 */
export function matchEffort(samples, segment, turf) {
  const pts = (samples || []).filter((s) => Array.isArray(s.pos) && Number.isFinite(s.time));
  if (pts.length < 4 || !Array.isArray(segment.start) || !Array.isArray(segment.end)) return null;
  const near = (a, b) => {
    try { return turf.distance(a, b, { units: 'meters' }) <= MATCH_TOLERANCE_M; } catch { return false; }
  };
  let startIdx = -1;
  for (let i = 0; i < pts.length; i++) {
    if (near(pts[i].pos, segment.start)) { startIdx = i; break; }
  }
  if (startIdx < 0) return null;
  for (let j = startIdx + 1; j < pts.length; j++) {
    if (near(pts[j].pos, segment.end)) {
      const seconds = Math.round((pts[j].time - pts[startIdx].time) / 1000);
      return seconds > 5 ? { seconds, startIdx, endIdx: j } : null;
    }
  }
  return null;
}

export async function saveEffort(user, segmentId, { seconds, activityId, riddenAt }) {
  const db = await getCloud();
  const id = `${user.uid}_${riddenAt || Date.now()}`;
  await db.setDoc(db.doc(db.firestore, 'segments', segmentId, 'efforts', id), {
    uid: user.uid,
    displayName: user.displayName || user.email?.split('@')[0] || 'Rider',
    seconds,
    activityId: activityId || null,
    riddenAt: riddenAt || Date.now(),
  });
  await db.setDoc(db.doc(db.firestore, 'segments', segmentId), { effortCount: db.increment(1) }, { merge: true });
}

/**
 * Matches a saved activity against nearby segments and stores any efforts.
 * Returns the efforts found, flagged with whether each is the rider's own PR.
 */
export async function matchActivity(user, activity, turf) {
  const samples = activity?.samples || [];
  if (samples.length < 4) return [];
  const start = samples[0].pos;
  const segments = await listSegmentsNear(start, 60, turf);
  const found = [];
  for (const segment of segments) {
    const effort = matchEffort(samples, segment, turf);
    if (!effort) continue;
    const previous = (await listEfforts(segment.id)).filter((e) => e.uid === user.uid);
    const best = previous.length ? Math.min(...previous.map((e) => e.seconds)) : null;
    await saveEffort(user, segment.id, { seconds: effort.seconds, activityId: activity.id, riddenAt: activity.ended || Date.now() });
    found.push({
      segmentId: segment.id,
      name: segment.name,
      seconds: effort.seconds,
      isPR: best === null || effort.seconds < best,
      previousBest: best,
    });
  }
  return found;
}

/** Live timing while riding: are we inside this segment, and for how long? */
export function liveSegmentState(record, segment, turf) {
  const samples = record?.samples || [];
  if (!samples.length || !Array.isArray(segment?.start)) return null;
  const near = (a, b, m) => {
    try { return turf.distance(a, b, { units: 'meters' }) <= m; } catch { return false; }
  };
  const last = samples[samples.length - 1];
  if (!Array.isArray(last?.pos)) return null;
  let startIdx = -1;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (near(samples[i].pos, segment.start, MATCH_TOLERANCE_M)) { startIdx = i; break; }
  }
  if (startIdx < 0) return null;
  if (near(last.pos, segment.end, MATCH_TOLERANCE_M)) {
    return { state: 'finished', seconds: Math.round((last.time - samples[startIdx].time) / 1000) };
  }
  return { state: 'running', seconds: Math.round((last.time - samples[startIdx].time) / 1000) };
}

export const fmtSeconds = (s) => {
  const v = Math.max(0, Math.round(s || 0));
  const m = Math.floor(v / 60);
  return `${m}:${String(v % 60).padStart(2, '0')}`;
};
