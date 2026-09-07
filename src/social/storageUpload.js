// Firebase Storage uploads for activity photos. The Storage bucket was
// already configured in the Firebase project but never actually used —
// photos were base64-embedded directly inside Firestore documents, which
// both bloats documents toward Firestore's 1MB limit and is roughly 33%
// larger on the wire than the original binary. This moves photos to
// Storage and Firestore documents to holding a lightweight reference.
import { getCloud } from '../legacy.js';

let storageModulePromise = null;
async function getStorage() {
  if (!storageModulePromise) {
    storageModulePromise = (async () => {
      const [storageMod, appMod] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js'),
        import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'),
      ]);
      return { ...storageMod, storage: storageMod.getStorage(appMod.getApp()) };
    })();
  }
  return storageModulePromise;
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Uploads one activity photo (a data-URL, as produced by the existing
 * compressPhoto() canvas pipeline, or a File/Blob) to
 * activity-photos/{uid}/{activityId}/{index}.jpg and returns its
 * download URL for storing on the activity document.
 */
export async function uploadActivityPhoto(uid, activityId, index, photo) {
  const storage = await getStorage();
  const blob = typeof photo === 'string' ? await dataUrlToBlob(photo) : photo;
  const path = `activity-photos/${uid}/${activityId}/${index}.jpg`;
  const ref = storage.ref(storage.storage, path);
  await storage.uploadBytes(ref, blob, { contentType: 'image/jpeg' });
  return storage.getDownloadURL(ref);
}

export async function uploadActivityPhotos(uid, activityId, photos) {
  return Promise.all(photos.map((photo, i) => uploadActivityPhoto(uid, activityId, i, photo)));
}
