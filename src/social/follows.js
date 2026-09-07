// Follow graph — flat top-level collection, one doc per relationship,
// composite id so both directions ("who does X follow" / "who follows
// X") are plain indexed queries rather than needing mirrored subcollections.
// Schema: follows/{followerUid}_{followeeUid} — {followerUid, followeeUid, createdAt}
import { getCloud } from '../legacy.js';

function followDocId(followerUid, followeeUid) {
  return `${followerUid}_${followeeUid}`;
}

export async function followUser(followerUid, followeeUid) {
  if (followerUid === followeeUid) throw new Error("Can't follow yourself");
  const db = await getCloud();
  await db.setDoc(db.doc(db.firestore, 'follows', followDocId(followerUid, followeeUid)), {
    followerUid,
    followeeUid,
    createdAt: db.serverTimestamp(),
  });
}

export async function unfollowUser(followerUid, followeeUid) {
  const db = await getCloud();
  await db.deleteDoc(db.doc(db.firestore, 'follows', followDocId(followerUid, followeeUid)));
}

export async function isFollowing(followerUid, followeeUid) {
  const db = await getCloud();
  const snap = await db.getDoc(db.doc(db.firestore, 'follows', followDocId(followerUid, followeeUid)));
  return snap.exists();
}

export async function listFollowingUids(uid) {
  const db = await getCloud();
  const snap = await db.getDocs(db.query(db.collection(db.firestore, 'follows'), db.where('followerUid', '==', uid)));
  return snap.docs.map((d) => d.data().followeeUid);
}

export async function listFollowerUids(uid) {
  const db = await getCloud();
  const snap = await db.getDocs(db.query(db.collection(db.firestore, 'follows'), db.where('followeeUid', '==', uid)));
  return snap.docs.map((d) => d.data().followerUid);
}
