// Public profile documents — the piece the app never had: everything
// before this lived either in Firebase Auth's own user object (private,
// not queryable) or in localStorage (device-only, never synced). This
// collection is what the follow graph, feed, and kudos/comments below
// all point back to for a rider's display name and photo.
//
// Schema: users/{uid} — {uid, displayName, photoURL, bio, createdAt,
//   stats:{totalDistanceKm,totalRides,totalElevationM},
//   weightKg, heightCm, bikeWeightKg, displayNameLower, visibility}
import { getCloud } from '../legacy.js';

export async function ensurePublicProfile(user) {
  if (!user) return null;
  const db = await getCloud();
  const ref = db.doc(db.firestore, 'users', user.uid);
  const existing = await db.getDoc(ref);
  const displayName = user.displayName || user.email?.split('@')[0] || 'Rider';
  const base = {
    uid: user.uid,
    displayName,
    displayNameLower: displayName.toLowerCase(),
    photoURL: user.photoURL || null,
    visibility: 'public',
  };
  if (!existing.exists()) {
    await db.setDoc(ref, {
      ...base,
      bio: '',
      createdAt: db.serverTimestamp(),
      stats: { totalDistanceKm: 0, totalRides: 0, totalElevationM: 0 },
      weightKg: null,
      heightCm: null,
      bikeWeightKg: null,
    });
  } else {
    await db.setDoc(ref, base, { merge: true });
  }
  return ref;
}

export async function getPublicProfile(uid) {
  const db = await getCloud();
  const snap = await db.getDoc(db.doc(db.firestore, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function updateRiderMeasurements(uid, { weightKg, heightCm, bikeWeightKg }) {
  const db = await getCloud();
  await db.setDoc(db.doc(db.firestore, 'users', uid), { weightKg, heightCm, bikeWeightKg }, { merge: true });
}

export async function incrementRiderStats(uid, { distanceKm = 0, elevationM = 0 }) {
  const db = await getCloud();
  const ref = db.doc(db.firestore, 'users', uid);
  const snap = await db.getDoc(ref);
  const stats = snap.exists() ? snap.data().stats || {} : {};
  await db.setDoc(
    ref,
    {
      stats: {
        totalDistanceKm: (stats.totalDistanceKm || 0) + distanceKm,
        totalRides: (stats.totalRides || 0) + 1,
        totalElevationM: (stats.totalElevationM || 0) + elevationM,
      },
    },
    { merge: true }
  );
}

/**
 * Simple prefix search over displayNameLower. Firestore has no native
 * full-text search, so this is exact-prefix only (not fuzzy/typo
 * tolerant) — good enough for a v1 "find people" box, would need
 * something like Algolia/Typesense to go further.
 */
export async function searchProfilesByName(prefix, limit = 15) {
  const q = prefix.trim().toLowerCase();
  if (!q) return [];
  const db = await getCloud();
  const snap = await db.getDocs(
    db.query(
      db.collection(db.firestore, 'users'),
      db.where('displayNameLower', '>=', q),
      db.where('displayNameLower', '<', q + ''),
      db.limit(limit)
    )
  );
  return snap.docs.map((d) => d.data());
}
