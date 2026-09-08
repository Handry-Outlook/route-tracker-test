// Club chat and per-ride chat.
//
//   clubs/{clubId}/messages/{id}                     — the club's main channel
//   clubs/{clubId}/events/{eventId}/messages/{id}    — one ride's own thread
//
// Both are the same shape, so one module serves both and the only difference is
// the collection path. Messages stream over onSnapshot so a conversation
// updates without anyone refreshing, and every watcher returns its own
// unsubscribe — leaving one attached after the view is gone would keep
// repainting a panel that no longer exists.
import { getCloud } from '../legacy.js';

const MAX_LENGTH = 800;
const PAGE = 100;

function messagePath(clubId, eventId) {
  return eventId
    ? ['clubs', clubId, 'events', eventId, 'messages']
    : ['clubs', clubId, 'messages'];
}

export function messageAuthor(user) {
  return {
    uid: user.uid,
    displayName: user.displayName || user.email?.split('@')[0] || 'Rider',
    photoURL: user.photoURL || null,
  };
}

export async function sendMessage(user, { clubId, eventId, text }) {
  const body = (text || '').trim().slice(0, MAX_LENGTH);
  if (!body) throw new Error('Nothing to send');
  if (!clubId) throw new Error('No club');
  const db = await getCloud();
  await db.addDoc(db.collection(db.firestore, ...messagePath(clubId, eventId)), {
    ...messageAuthor(user),
    text: body,
    // A client clock, so an optimistic local echo and the stored value sort the
    // same way. Ordering within a busy second is not worth a server round trip.
    sentAt: Date.now(),
  });
}

/**
 * Streams the newest messages, oldest first. `onChange` receives null when the
 * channel cannot be read, so the caller can show an honest failure rather than
 * an empty room. Returns the unsubscribe.
 */
export function watchMessages({ clubId, eventId }, onChange, max = PAGE) {
  let stop = null;
  let cancelled = false;
  getCloud()
    .then((db) => {
      if (cancelled) return;
      const q = db.query(
        db.collection(db.firestore, ...messagePath(clubId, eventId)),
        db.orderBy('sentAt', 'desc'),
        db.limit(max)
      );
      stop = db.onSnapshot(
        q,
        (snap) => {
          if (cancelled) return;
          onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse());
        },
        (error) => {
          console.warn('Chat stream failed', error);
          if (!cancelled) onChange(null);
        }
      );
    })
    .catch((error) => {
      console.warn('Chat unavailable', error);
      if (!cancelled) onChange(null);
    });

  return () => {
    cancelled = true;
    if (stop) stop();
    stop = null;
  };
}

/** A rider can withdraw their own message. */
export async function deleteMessage({ clubId, eventId, id }) {
  const db = await getCloud();
  await db.deleteDoc(db.doc(db.firestore, ...messagePath(clubId, eventId), id));
}
