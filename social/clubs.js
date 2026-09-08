// Clubs, group-ride events, leaderboards and challenges — the data behind the
// mockup's Clubs artboard. All of it is real Firestore; leaderboards are
// computed from members' actual saved activities, and challenge progress from
// the rider's own rides inside the challenge window.
//
// Schema
//   clubs/{clubId}                     {name, blurb, createdBy, createdAt, memberCount}
//   clubs/{clubId}/members/{uid}       {uid, displayName, joinedAt}
//   clubs/{clubId}/events/{eventId}    {title, startsAt, meetPoint, distanceKm, createdBy, goingCount}
//   clubs/{clubId}/events/{eventId}/attendees/{uid}  {uid, displayName}
//   challenges/{challengeId}           {title, targetKm, startsAt, endsAt, createdBy}
//   challenges/{challengeId}/participants/{uid}      {uid, displayName, joinedAt}
import { getCloud } from '../legacy.js';

/* ------------------------------- clubs ------------------------------- */

export async function listClubs(max = 20) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(db.query(db.collection(db.firestore, 'clubs'), db.limit(max)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn('Clubs unavailable', error);
    return [];
  }
}

export async function createClub(user, { name, blurb = '' }) {
  const db = await getCloud();
  const ref = await db.addDoc(db.collection(db.firestore, 'clubs'), {
    name: name.slice(0, 80),
    blurb: blurb.slice(0, 200),
    createdBy: user.uid,
    createdAt: db.serverTimestamp(),
    memberCount: 1,
  });
  await joinClub(user, ref.id);
  return ref.id;
}

export async function joinClub(user, clubId) {
  const db = await getCloud();
  await db.setDoc(db.doc(db.firestore, 'clubs', clubId, 'members', user.uid), {
    uid: user.uid,
    displayName: user.displayName || user.email?.split('@')[0] || 'Rider',
    joinedAt: db.serverTimestamp(),
  });
  await db.setDoc(db.doc(db.firestore, 'clubs', clubId), { memberCount: db.increment(1) }, { merge: true });
}

export async function leaveClub(user, clubId) {
  const db = await getCloud();
  await db.deleteDoc(db.doc(db.firestore, 'clubs', clubId, 'members', user.uid));
  await db.setDoc(db.doc(db.firestore, 'clubs', clubId), { memberCount: db.increment(-1) }, { merge: true });
}

export async function isClubMember(uid, clubId) {
  try {
    const db = await getCloud();
    const snap = await db.getDoc(db.doc(db.firestore, 'clubs', clubId, 'members', uid));
    return snap.exists();
  } catch { return false; }
}

export async function listMembers(clubId, max = 60) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(db.query(db.collection(db.firestore, 'clubs', clubId, 'members'), db.limit(max)));
    return snap.docs.map((d) => d.data());
  } catch { return []; }
}

/* ------------------------------- events ------------------------------- */

export async function listEvents(clubId, max = 10) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(
      db.query(db.collection(db.firestore, 'clubs', clubId, 'events'), db.orderBy('startsAt', 'asc'), db.limit(max))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

export async function createEvent(user, clubId, { title, startsAt, meetPoint, distanceKm, route }) {
  if (!route?.id) throw new Error('A club ride needs a saved route');
  const db = await getCloud();
  const ref = await db.addDoc(db.collection(db.firestore, 'clubs', clubId, 'events'), {
    title: title.slice(0, 100),
    startsAt,
    meetPoint: (meetPoint || '').slice(0, 120),
    // Taken from the route itself rather than typed, so the figure on the
    // calendar always matches the line everyone will actually ride.
    distanceKm: Number(distanceKm) || 0,
    routeId: route.id,
    routeName: (route.name || 'Route').slice(0, 120),
    routeGeoJson: route.geoJson || null,
    createdBy: user.uid,
    goingCount: 0,
  });
  return ref.id;
}

export async function toggleAttendance(user, clubId, eventId, going) {
  const db = await getCloud();
  const ref = db.doc(db.firestore, 'clubs', clubId, 'events', eventId, 'attendees', user.uid);
  if (going) {
    await db.deleteDoc(ref);
  } else {
    await db.setDoc(ref, { uid: user.uid, displayName: user.displayName || 'Rider' });
  }
  await db.setDoc(
    db.doc(db.firestore, 'clubs', clubId, 'events', eventId),
    { goingCount: db.increment(going ? -1 : 1) },
    { merge: true }
  );
}

export async function isAttending(uid, clubId, eventId) {
  try {
    const db = await getCloud();
    const snap = await db.getDoc(db.doc(db.firestore, 'clubs', clubId, 'events', eventId, 'attendees', uid));
    return snap.exists();
  } catch { return false; }
}

/* ---------------------------- leaderboard ---------------------------- */

/**
 * Real leaderboard: sums each member's public activity distance since `sinceMs`.
 * Firestore's `in` operator caps at 30 values, so members are queried in chunks.
 */
export async function clubLeaderboard(clubId, sinceMs, metric = 'distanceKm') {
  const members = await listMembers(clubId);
  if (!members.length) return [];
  try {
    const db = await getCloud();
    const uids = members.map((m) => m.uid);
    const chunks = [];
    for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));
    const snaps = await Promise.all(
      chunks.map((chunk) =>
        db.getDocs(
          db.query(
            db.collection(db.firestore, 'activities'),
            db.where('ownerId', 'in', chunk),
            db.where('startedAt', '>=', sinceMs)
          )
        )
      )
    );
    const totals = new Map();
    snaps.forEach((snap) =>
      snap.docs.forEach((d) => {
        const a = d.data();
        const key = a.ownerId;
        const add = metric === 'elevationGainM' ? a.elevationGainM || 0 : a.distanceKm || 0;
        const row = totals.get(key) || { uid: key, name: a.ownerDisplayName || 'Rider', total: 0, rides: 0 };
        row.total += add;
        row.rides += 1;
        totals.set(key, row);
      })
    );
    // Members with no qualifying rides still belong on the board, at zero.
    members.forEach((m) => {
      if (!totals.has(m.uid)) totals.set(m.uid, { uid: m.uid, name: m.displayName || 'Rider', total: 0, rides: 0 });
    });
    return [...totals.values()].sort((a, b) => b.total - a.total);
  } catch (error) {
    console.warn('Leaderboard unavailable', error);
    return [];
  }
}

/* ----------------------------- challenges ----------------------------- */

export async function listChallenges(nowMs, max = 10) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(
      db.query(db.collection(db.firestore, 'challenges'), db.where('endsAt', '>=', nowMs), db.orderBy('endsAt', 'asc'), db.limit(max))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn('Challenges unavailable', error);
    return [];
  }
}

export async function createChallenge(user, { title, targetKm, startsAt, endsAt }) {
  const db = await getCloud();
  const ref = await db.addDoc(db.collection(db.firestore, 'challenges'), {
    title: title.slice(0, 100),
    targetKm: Number(targetKm) || 0,
    startsAt,
    endsAt,
    createdBy: user.uid,
  });
  await joinChallenge(user, ref.id);
  return ref.id;
}

export async function joinChallenge(user, challengeId) {
  const db = await getCloud();
  await db.setDoc(db.doc(db.firestore, 'challenges', challengeId, 'participants', user.uid), {
    uid: user.uid,
    displayName: user.displayName || 'Rider',
    joinedAt: db.serverTimestamp(),
  });
}

export async function leaveChallenge(user, challengeId) {
  const db = await getCloud();
  await db.deleteDoc(db.doc(db.firestore, 'challenges', challengeId, 'participants', user.uid));
}

export async function isInChallenge(uid, challengeId) {
  try {
    const db = await getCloud();
    const snap = await db.getDoc(db.doc(db.firestore, 'challenges', challengeId, 'participants', uid));
    return snap.exists();
  } catch { return false; }
}

/**
 * Progress is computed from the rider's own saved activities inside the
 * challenge window — never stored as a number someone could inflate.
 */
export function challengeProgressKm(activities, challenge) {
  const from = challenge.startsAt || 0;
  const to = challenge.endsAt || Infinity;
  return (activities || []).reduce((sum, a) => {
    const t = a.ended || a.started || 0;
    return t >= from && t <= to ? sum + (a.distance || 0) : sum;
  }, 0);
}
