// src/config.js
var MAPBOX_TOKEN = "pk.eyJ1IjoibWV0ZW9ncm91cC1tYXBib3giLCJhIjoiY2pudWJyMWVhMDQ0bjNxdXFsNWJ5M2ZtbSJ9.ANOKYyv5s0VFVbnesnGGUQ";
var firebaseConfig = { apiKey: "AIzaSyBjfLYgpiZLJ8ucR7XqY7cBsrfD1UCs_V4", authDomain: "route-planner-942bd.firebaseapp.com", projectId: "route-planner-942bd", storageBucket: "route-planner-942bd.firebasestorage.app", messagingSenderId: "305443119883", appId: "1:305443119883:web:e83a8ef2dc5334a753380e" };
var X_WEATHER_ID = "wgE96YE3scTQLKjnqiMsv";
var X_WEATHER_SECRET = "1XwHqbCjiTqtzWi8txyN4JtM0ezVNuEfaDXQdkjq";

// src/weather-api.js
var BASE_URL = "https://data.api.xweather.com/conditions";
async function fetchWindAtLocation(lat, lon, timestamp = null) {
  if (X_WEATHER_ID && X_WEATHER_SECRET) {
    let url = `${BASE_URL}/${lat},${lon}?client_id=${encodeURIComponent(X_WEATHER_ID)}&client_secret=${encodeURIComponent(X_WEATHER_SECRET)}&units=metric`;
    if (timestamp) {
      const ts = timestamp instanceof Date ? Math.floor(timestamp.getTime() / 1e3) : timestamp;
      url += `&for=${ts}`;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Xweather ${response.status}`);
      const data = await response.json(), current2 = data?.response?.[0]?.periods?.[0];
      if (!data?.success || !current2) throw new Error("No Xweather conditions");
      return { time: current2.timestamp, speed: current2.windSpeedMPS, bearing: current2.windDirDEG, gust: current2.windGustMPS, temp: current2.tempC, feelsLike: current2.feelslikeC, humidity: current2.humidity, desc: current2.weatherPrimary, icon: current2.icon, source: "Xweather" };
    } catch (error) {
      console.warn("Xweather failed; using Open-Meteo fallback", error);
    }
  }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&timezone=auto`, data = await fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
      return r.json();
    }), c = data.current;
    return { time: Math.floor(new Date(c.time).getTime() / 1e3), speed: c.wind_speed_10m, bearing: c.wind_direction_10m, gust: c.wind_gusts_10m, temp: c.temperature_2m, feelsLike: c.apparent_temperature, humidity: c.relative_humidity_2m, desc: weatherCodeDescription(c.weather_code), icon: weatherCodeIcon(c.weather_code, new Date(c.time).getHours()), code: c.weather_code, source: "Open-Meteo" };
  } catch (error) {
    console.error("Weather fetch failed", error);
    return null;
  }
}
async function fetchRouteForecast(points) {
  const results = await Promise.all(points.slice(0, 12).map((p) => fetchWindAtLocation(p.lat, p.lon, p.time)));
  return results.filter(Boolean);
}
async function fetchHourlyForecast(lat, lon, hours = 72) {
  if (X_WEATHER_ID && X_WEATHER_SECRET) {
    try {
      const now = Math.floor(Date.now() / 1e3), to = now + hours * 3600, url2 = `${BASE_URL}/${lat},${lon}?client_id=${encodeURIComponent(X_WEATHER_ID)}&client_secret=${encodeURIComponent(X_WEATHER_SECRET)}&units=metric&from=${now}&to=${to}&limit=${hours}`, response = await fetch(url2);
      if (response.ok) {
        const data = await response.json(), periods = data?.response?.[0]?.periods || [];
        if (periods.length) return periods.slice(0, hours).map((p) => ({ time: p.timestamp, temp: p.tempC, feelsLike: p.feelslikeC, humidity: p.humidity, precip: p.precipMM ?? 0, probability: p.pop ?? 0, speed: p.windSpeedMPS, bearing: p.windDirDEG, gust: p.windGustMPS, desc: p.weatherPrimary, icon: p.icon, source: "Xweather" }));
      }
    } catch (e) {
      console.warn("Xweather hourly failed", e);
    }
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&forecast_days=4&timezone=auto`, d = await fetch(url).then((r) => r.json());
  return d.hourly.time.slice(0, hours).map((time, i) => ({ time: Math.floor(new Date(time).getTime() / 1e3), temp: d.hourly.temperature_2m[i], feelsLike: d.hourly.apparent_temperature[i], humidity: d.hourly.relative_humidity_2m[i], probability: d.hourly.precipitation_probability[i], precip: d.hourly.precipitation[i], speed: d.hourly.wind_speed_10m[i], bearing: d.hourly.wind_direction_10m[i], gust: d.hourly.wind_gusts_10m[i], desc: weatherCodeDescription(d.hourly.weather_code[i]), icon: weatherCodeIcon(d.hourly.weather_code[i], new Date(time).getHours()), code: d.hourly.weather_code[i], source: "Open-Meteo" }));
}
function cardinalDirection(deg) {
  if (!Number.isFinite(deg)) return "Unknown";
  return ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round((deg % 360 + 360) % 360 / 22.5) % 16];
}
function weatherCodeDescription(c) {
  return c === 0 ? "Clear" : c < 4 ? "Partly cloudy" : c < 50 ? "Fog" : c < 70 ? "Rain" : c < 80 ? "Snow" : c < 90 ? "Showers" : "Thunderstorm";
}
function weatherCodeIcon(c, hour = 12) {
  const night = hour < 6 || hour >= 20, n = night ? "n" : "";
  if (c === 0) return night ? "clearn.png" : "sunny.png";
  if (c <= 2) return `pcloudy${n}.png`;
  if (c === 3) return `cloudy${n}.png`;
  if (c <= 48) return `fog${n}.png`;
  if (c <= 57) return `drizzle${n}.png`;
  if (c <= 67) return `rain${n}.png`;
  if (c <= 77) return `snow${n}.png`;
  if (c <= 82) return `showers${n}.png`;
  if (c <= 86) return `snowshowers${n}.png`;
  return `tstorm${n}.png`;
}

// src/ui/components/bottomSheet.js
var SNAP_HEIGHTS = { peek: 0.16, half: 0.5, full: 0.92 };
var VELOCITY_FLING_PX_PER_MS = 0.5;
function createBottomSheet(panel2, { mobile: mobile2 }) {
  let state = "half";
  let handle = panel2.querySelector(".sheet-handle");
  if (!handle) {
    handle = document.createElement("div");
    handle.className = "sheet-handle";
    handle.setAttribute("aria-hidden", "true");
    panel2.prepend(handle);
  }
  let dragStartY = null;
  let dragStartHeight = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  function containerHeightPx() {
    return (panel2.offsetParent || panel2.parentElement).getBoundingClientRect().height;
  }
  function heightPxFor(fraction) {
    return Math.round(containerHeightPx() * fraction);
  }
  function applyHeight(value, animate) {
    panel2.style.transition = animate ? "" : "none";
    panel2.style.setProperty("--sheet-height", value);
  }
  function setState(next, { animate = true } = {}) {
    if (!SNAP_HEIGHTS[next]) next = "half";
    state = next;
    panel2.dataset.sheetState = state;
    if (mobile2()) applyHeight(`${SNAP_HEIGHTS[state] * 100}%`, animate);
  }
  function onPointerDown(e) {
    if (!mobile2()) return;
    dragStartY = e.clientY;
    lastY = e.clientY;
    lastT = performance.now();
    velocity = 0;
    dragStartHeight = panel2.getBoundingClientRect().height;
    panel2.setPointerCapture(e.pointerId);
    panel2.style.transition = "none";
  }
  function onPointerMove(e) {
    if (dragStartY === null) return;
    const dy = e.clientY - dragStartY;
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY;
    lastT = now;
    const nextHeight = Math.max(
      heightPxFor(SNAP_HEIGHTS.peek) * 0.6,
      Math.min(heightPxFor(0.97), dragStartHeight - dy)
    );
    panel2.style.setProperty("--sheet-height", `${nextHeight}px`);
  }
  function onPointerUp() {
    if (dragStartY === null) return;
    dragStartY = null;
    const currentPx = panel2.getBoundingClientRect().height;
    const currentFraction = currentPx / innerHeight;
    let next;
    if (velocity > VELOCITY_FLING_PX_PER_MS) next = currentFraction > SNAP_HEIGHTS.half ? "half" : "peek";
    else if (velocity < -VELOCITY_FLING_PX_PER_MS) next = currentFraction < SNAP_HEIGHTS.half ? "half" : "full";
    else {
      const distances = Object.entries(SNAP_HEIGHTS).map(([key, f]) => [key, Math.abs(f - currentFraction)]);
      distances.sort((a, b) => a[1] - b[1]);
      next = distances[0][0];
    }
    setState(next);
  }
  handle.addEventListener("pointerdown", onPointerDown);
  addEventListener("pointermove", onPointerMove);
  addEventListener("pointerup", onPointerUp);
  addEventListener("pointercancel", onPointerUp);
  addEventListener("resize", () => setState(state, { animate: false }));
  setState("half", { animate: false });
  return { setState, getState: () => state };
}

// src/ui/pages/feed.js
function feedSignInPromptHtml(head2) {
  return head2("Feed", "Rides from people you follow") + `<div class="card account-required">
      <h2>Sign in required</h2>
      <p>Follow other riders to see their rides here, give kudos, and leave comments.</p>
      <button class="btn primary" id="feedSignIn">Sign in</button>
    </div>`;
}
function findPeopleHtml() {
  return `<div class="card find-people-card">
    <h3>Find people</h3>
    <div class="location-row">
      <input id="findPeopleInput" placeholder="Search riders by name" autocomplete="off">
      <button class="btn light" id="findPeopleBtn">Search</button>
    </div>
    <div id="findPeopleResults"></div>
  </div>`;
}
function personResultHtml(person, isFollowing2, isSelf) {
  const escape2 = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  return `<div class="item person-result" data-uid="${escape2(person.uid)}">
    <span>${escape2(person.displayName)}</span>
    ${isSelf ? '<small class="muted">You</small>' : `<button class="btn ${isFollowing2 ? "light" : "primary"}" data-follow-toggle="${escape2(person.uid)}" data-following="${isFollowing2 ? "1" : "0"}">${isFollowing2 ? "Following" : "Follow"}</button>`}
  </div>`;
}
function feedEmptyHtml(hasFollows) {
  return `<div class="empty">${hasFollows ? "No recent rides from people you follow yet." : "Follow some riders above to see their rides here."}</div>`;
}
function activityCardHtml(activity, hasKudos) {
  const escape2 = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const when = activity.startedAt ? new Date(activity.startedAt).toLocaleDateString([], { day: "numeric", month: "short" }) : "";
  const cover = activity.photoUrls?.[0];
  return `<article class="card feed-activity-card" data-activity-id="${escape2(activity.id)}">
    <div class="row">
      <div><b>${escape2(activity.ownerDisplayName)}</b><br><small class="muted">${escape2(when)}</small></div>
    </div>
    <h3 style="margin:8px 0 4px">${escape2(activity.title)}</h3>
    ${cover ? `<img class="activity-photo" src="${escape2(cover)}" alt="Activity photo">` : ""}
    <div class="stats">
      <div class="stat"><b>${(activity.distanceKm || 0).toFixed(1)}</b><small>km</small></div>
      <div class="stat"><b>${Math.round(activity.elevationGainM || 0)}</b><small>gain m</small></div>
      <div class="stat"><b>${(activity.avgSpeedKmh || 0).toFixed(1)}</b><small>avg km/h</small></div>
    </div>
    <div class="actions">
      <button class="btn ${hasKudos ? "primary" : "light"}" data-kudos="${escape2(activity.id)}" data-given="${hasKudos ? "1" : "0"}">\u{1F44D} Kudos${activity.kudosCount ? ` (${activity.kudosCount})` : ""}</button>
      <button class="btn light" data-comments="${escape2(activity.id)}">\u{1F4AC} Comments${activity.commentCount ? ` (${activity.commentCount})` : ""}</button>
    </div>
    <div class="feed-comments" id="comments-${escape2(activity.id)}" hidden></div>
  </article>`;
}
function commentHtml(comment) {
  const escape2 = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  return `<div class="item"><b>${escape2(comment.authorDisplayName)}</b><span>${escape2(comment.text)}</span></div>`;
}
function commentsPanelHtml(comments, activityId) {
  const escape2 = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  return `${comments.map(commentHtml).join("") || '<p class="muted">No comments yet.</p>'}
    <div class="location-row">
      <input id="commentInput-${escape2(activityId)}" placeholder="Add a comment" autocomplete="off">
      <button class="btn light" data-send-comment="${escape2(activityId)}">Send</button>
    </div>`;
}

// src/social/firestoreClient.js
async function ensurePublicProfile(user) {
  if (!user) return null;
  const db = await getCloud();
  const ref = db.doc(db.firestore, "users", user.uid);
  const existing = await db.getDoc(ref);
  const displayName = user.displayName || user.email?.split("@")[0] || "Rider";
  const base = {
    uid: user.uid,
    displayName,
    displayNameLower: displayName.toLowerCase(),
    photoURL: user.photoURL || null,
    visibility: "public"
  };
  if (!existing.exists()) {
    await db.setDoc(ref, {
      ...base,
      bio: "",
      createdAt: db.serverTimestamp(),
      stats: { totalDistanceKm: 0, totalRides: 0, totalElevationM: 0 },
      weightKg: null,
      heightCm: null,
      bikeWeightKg: null
    });
  } else {
    await db.setDoc(ref, base, { merge: true });
  }
  return ref;
}
async function updateRiderMeasurements(uid, { weightKg, heightCm, bikeWeightKg }) {
  const db = await getCloud();
  await db.setDoc(db.doc(db.firestore, "users", uid), { weightKg, heightCm, bikeWeightKg }, { merge: true });
}
async function incrementRiderStats(uid, { distanceKm = 0, elevationM = 0 }) {
  const db = await getCloud();
  const ref = db.doc(db.firestore, "users", uid);
  const snap = await db.getDoc(ref);
  const stats = snap.exists() ? snap.data().stats || {} : {};
  await db.setDoc(
    ref,
    {
      stats: {
        totalDistanceKm: (stats.totalDistanceKm || 0) + distanceKm,
        totalRides: (stats.totalRides || 0) + 1,
        totalElevationM: (stats.totalElevationM || 0) + elevationM
      }
    },
    { merge: true }
  );
}
async function searchProfilesByName(prefix, limit = 15) {
  const q = prefix.trim().toLowerCase();
  if (!q) return [];
  const db = await getCloud();
  const snap = await db.getDocs(
    db.query(
      db.collection(db.firestore, "users"),
      db.where("displayNameLower", ">=", q),
      db.where("displayNameLower", "<", q + "\uF8FF"),
      db.limit(limit)
    )
  );
  return snap.docs.map((d) => d.data());
}

// src/social/follows.js
function followDocId(followerUid, followeeUid) {
  return `${followerUid}_${followeeUid}`;
}
async function followUser(followerUid, followeeUid) {
  if (followerUid === followeeUid) throw new Error("Can't follow yourself");
  const db = await getCloud();
  await db.setDoc(db.doc(db.firestore, "follows", followDocId(followerUid, followeeUid)), {
    followerUid,
    followeeUid,
    createdAt: db.serverTimestamp()
  });
}
async function unfollowUser(followerUid, followeeUid) {
  const db = await getCloud();
  await db.deleteDoc(db.doc(db.firestore, "follows", followDocId(followerUid, followeeUid)));
}
async function isFollowing(followerUid, followeeUid) {
  const db = await getCloud();
  const snap = await db.getDoc(db.doc(db.firestore, "follows", followDocId(followerUid, followeeUid)));
  return snap.exists();
}
async function listFollowingUids(uid) {
  const db = await getCloud();
  const snap = await db.getDocs(db.query(db.collection(db.firestore, "follows"), db.where("followerUid", "==", uid)));
  return snap.docs.map((d) => d.data().followeeUid);
}

// src/social/storageUpload.js
var storageModulePromise = null;
async function getStorage() {
  if (!storageModulePromise) {
    storageModulePromise = (async () => {
      const [storageMod, appMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js"),
        import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js")
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
async function uploadActivityPhoto(uid, activityId, index, photo) {
  const storage = await getStorage();
  const blob = typeof photo === "string" ? await dataUrlToBlob(photo) : photo;
  const path = `activity-photos/${uid}/${activityId}/${index}.jpg`;
  const ref = storage.ref(storage.storage, path);
  await storage.uploadBytes(ref, blob, { contentType: "image/jpeg" });
  return storage.getDownloadURL(ref);
}
async function uploadActivityPhotos(uid, activityId, photos) {
  return Promise.all(photos.map((photo, i) => uploadActivityPhoto(uid, activityId, i, photo)));
}

// src/social/activities.js
var FEED_UID_CHUNK = 30;
function simplifyRoute(coords, turf2, maxPoints = 60) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  if (coords.length <= maxPoints) return { type: "LineString", coordinates: coords };
  const line2 = turf2.lineString(coords);
  const length = turf2.length(line2);
  const pts = Array.from({ length: maxPoints }, (_, i) => turf2.along(line2, length * i / (maxPoints - 1)).geometry.coordinates);
  return { type: "LineString", coordinates: pts };
}
async function publishActivityToFeed(user, activity, turf2) {
  const db = await getCloud();
  const id = activity.id || crypto.randomUUID();
  const coords = (activity.samples || []).map((s) => s.pos).filter(Boolean);
  let photoUrls = [];
  if (activity.photos?.length) {
    try {
      photoUrls = await uploadActivityPhotos(user.uid, id, activity.photos);
    } catch (error) {
      console.warn("Activity photo upload failed; publishing without photos", error);
    }
  }
  await db.setDoc(db.doc(db.firestore, "activities", id), {
    ownerId: user.uid,
    ownerDisplayName: user.displayName || user.email?.split("@")[0] || "Rider",
    ownerPhotoURL: user.photoURL || null,
    title: activity.name || "Cycling activity",
    startedAt: activity.started || Date.now(),
    distanceKm: activity.distance || 0,
    elevationGainM: activity.gain || 0,
    avgSpeedKmh: activity.avgSpeed || 0,
    routeSummaryGeoJson: coords.length >= 2 ? JSON.stringify(simplifyRoute(coords, turf2)) : null,
    photoUrls,
    kudosCount: 0,
    commentCount: 0,
    visibility: "public"
  });
  await incrementRiderStats(user.uid, { distanceKm: activity.distance || 0, elevationM: activity.gain || 0 }).catch(() => {
  });
  return id;
}
async function fetchFeed(ownFollowedUids, { limitPerChunk = 20 } = {}) {
  if (!ownFollowedUids.length) return [];
  const db = await getCloud();
  const chunks = [];
  for (let i = 0; i < ownFollowedUids.length; i += FEED_UID_CHUNK) chunks.push(ownFollowedUids.slice(i, i + FEED_UID_CHUNK));
  const results = await Promise.all(
    chunks.map(
      (chunk) => db.getDocs(
        db.query(
          db.collection(db.firestore, "activities"),
          db.where("ownerId", "in", chunk),
          db.orderBy("startedAt", "desc"),
          db.limit(limitPerChunk)
        )
      )
    )
  );
  const items = results.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  items.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return items;
}
async function toggleKudos(activityId, uid, currentlyGiven) {
  const db = await getCloud();
  const kudosRef = db.doc(db.firestore, "activities", activityId, "kudos", uid);
  const activityRef = db.doc(db.firestore, "activities", activityId);
  if (currentlyGiven) {
    await db.deleteDoc(kudosRef);
    await db.setDoc(activityRef, { kudosCount: db.increment(-1) }, { merge: true });
  } else {
    await db.setDoc(kudosRef, { uid, createdAt: db.serverTimestamp() });
    await db.setDoc(activityRef, { kudosCount: db.increment(1) }, { merge: true });
  }
}
async function hasGivenKudos(activityId, uid) {
  const db = await getCloud();
  const snap = await db.getDoc(db.doc(db.firestore, "activities", activityId, "kudos", uid));
  return snap.exists();
}
async function addComment(activityId, author, text) {
  const db = await getCloud();
  await db.addDoc(db.collection(db.firestore, "activities", activityId, "comments"), {
    authorUid: author.uid,
    authorDisplayName: author.displayName || "Rider",
    authorPhotoURL: author.photoURL || null,
    text: text.slice(0, 500),
    createdAt: db.serverTimestamp()
  });
  await db.setDoc(db.doc(db.firestore, "activities", activityId), { commentCount: db.increment(1) }, { merge: true });
}
async function listComments(activityId) {
  const db = await getCloud();
  const snap = await db.getDocs(db.query(db.collection(db.firestore, "activities", activityId, "comments"), db.orderBy("createdAt", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// src/nav/compass.js
var compassHeading = null;
var compassAvailable = false;
var permissionState = "unknown";
function handleOrientation(e) {
  let heading = null;
  if (typeof e.webkitCompassHeading === "number") {
    heading = e.webkitCompassHeading;
  } else if (e.absolute && typeof e.alpha === "number") {
    heading = (360 - e.alpha) % 360;
  }
  if (heading === null || !Number.isFinite(heading)) return;
  compassAvailable = true;
  if (compassHeading === null) {
    compassHeading = heading;
    return;
  }
  const alpha = 0.15;
  const a = compassHeading * Math.PI / 180;
  const b = heading * Math.PI / 180;
  const x = Math.cos(a) * (1 - alpha) + Math.cos(b) * alpha;
  const y = Math.sin(a) * (1 - alpha) + Math.sin(b) * alpha;
  compassHeading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
async function enableCompass() {
  if (permissionState === "granted" || permissionState === "denied" || permissionState === "unsupported") {
    return permissionState;
  }
  if (typeof DeviceOrientationEvent === "undefined") {
    permissionState = "unsupported";
    return permissionState;
  }
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      permissionState = result === "granted" ? "granted" : "denied";
    } catch {
      permissionState = "denied";
    }
  } else {
    permissionState = "granted";
  }
  if (permissionState === "granted") {
    addEventListener("deviceorientationabsolute", handleOrientation, true);
    addEventListener("deviceorientation", handleOrientation, true);
  }
  return permissionState;
}
function getCompassHeading() {
  return compassHeading;
}
function isCompassAvailable() {
  return compassAvailable;
}

// src/routing/overpassCache.js
var DB_NAME = "ridewise-overpass-cache";
var STORE = "responses";
var TTL_MS = 14 * 24 * 60 * 60 * 1e3;
var dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}
function quantizeBbox([west, south, east, north], gridDeg = 0.01) {
  const q = (v) => Math.round(v / gridDeg) * gridDeg;
  return [q(west), q(south), q(east), q(north)];
}
function cacheKey(kind, bbox) {
  return `${kind}:${quantizeBbox(bbox).map((v) => v.toFixed(3)).join(",")}`;
}
async function getCached(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      tx.onsuccess = () => {
        const entry = tx.result;
        if (!entry || Date.now() - entry.savedAt > TTL_MS) return resolve(null);
        resolve(entry.data);
      };
      tx.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
async function setCached(key, data) {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ data, savedAt: Date.now() }, key);
  } catch {
  }
}

// src/routing/overpass.js
var ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
var TIMEOUT_MS = 6e3;
var INFRA_WEIGHTS = {
  cycleway: 1,
  path: 0.9,
  track: 0.7,
  living_street: 0.6,
  pedestrian: 0.55,
  residential: 0.4,
  unclassified: 0.3,
  tertiary: 0.2,
  secondary: 0.1,
  primary: 0.05
};
async function runQuery(query) {
  for (const endpoint of ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json, */*" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn(`Overpass request failed at ${endpoint}`, error);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
function bboxQL([west, south, east, north]) {
  return `${south},${west},${north},${east}`;
}
function buildQuery(bbox) {
  const bb = bboxQL(bbox);
  return `[out:json][timeout:25];(
    way["highway"~"^(cycleway|path|track|living_street|pedestrian|residential|unclassified|tertiary|secondary|primary)$"](${bb});
    node["tourism"~"^(viewpoint|attraction)$"](${bb});
    node["leisure"~"^(park|nature_reserve)$"](${bb});
    node["natural"~"^(peak|water)$"](${bb});
    node["amenity"~"^(cafe|drinking_water)$"](${bb});
  );out geom;`;
}
async function fetchBbox(bbox) {
  const key = cacheKey("bbox", bbox);
  const cached = await getCached(key);
  if (cached) return cached;
  const raw = await runQuery(buildQuery(bbox));
  if (!raw?.elements) return null;
  const ways = [];
  const pois = [];
  for (const el of raw.elements) {
    if (el.type === "way" && el.geometry?.length) {
      ways.push({
        highway: el.tags?.highway || "",
        surface: el.tags?.surface || "",
        coords: el.geometry.map((p) => [p.lon, p.lat])
      });
    } else if (el.type === "node" && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
      const category = el.tags?.tourism || el.tags?.leisure || el.tags?.natural || el.tags?.amenity;
      if (category) pois.push({ coord: [el.lon, el.lat], name: el.tags?.name || category, category });
    }
  }
  const data = { ways, pois, fetchedAt: Date.now() };
  setCached(key, data);
  return data;
}
async function fetchOverpassArea(bbox, bufferDeg = 0.01) {
  const buffered = [bbox[0] - bufferDeg, bbox[1] - bufferDeg, bbox[2] + bufferDeg, bbox[3] + bufferDeg];
  try {
    return await fetchBbox(buffered);
  } catch (error) {
    console.warn("Overpass area fetch failed", error);
    return null;
  }
}
function pointNearWay(point, way, toleranceKm, turf2) {
  if (way.coords.length < 2) return false;
  try {
    const line2 = turf2.lineString(way.coords);
    const snap = turf2.nearestPointOnLine(line2, turf2.point(point));
    return (snap.properties.dist || Infinity) <= toleranceKm;
  } catch {
    return false;
  }
}
function scoreRouteAgainstOverpass(routeCoords, overpassData, turf2, sampleEveryKm = 0.12) {
  if (!overpassData?.ways?.length || !routeCoords?.length) return null;
  const line2 = turf2.lineString(routeCoords);
  const totalKm = turf2.length(line2);
  if (totalKm < 0.05) return null;
  let weightedKm = 0;
  let unpavedKm = 0;
  let sampledKm = 0;
  for (let d = 0; d < totalKm; d += sampleEveryKm) {
    const point = turf2.along(line2, d).geometry.coordinates;
    let bestWeight = 0;
    let unpaved = false;
    for (const way of overpassData.ways) {
      if (!pointNearWay(point, way, 0.02, turf2)) continue;
      const weight = INFRA_WEIGHTS[way.highway] ?? 0.15;
      if (weight > bestWeight) bestWeight = weight;
      if (/unpaved|gravel|dirt|ground|grass/.test(way.surface)) unpaved = true;
    }
    weightedKm += bestWeight * sampleEveryKm;
    if (unpaved) unpavedKm += sampleEveryKm;
    sampledKm += sampleEveryKm;
  }
  const score = Math.round(Math.min(100, weightedKm / Math.max(0.05, sampledKm) * 100));
  const unpavedShare = unpavedKm / Math.max(0.05, sampledKm);
  return { score, unpavedShare };
}
function poisFromOverpass(overpassData, start, turf2, maxDistanceKm = 30) {
  if (!overpassData?.pois?.length) return [];
  const CATEGORY_SCORE = { viewpoint: 22, peak: 20, attraction: 16, nature_reserve: 15, park: 12, water: 14, cafe: 8, drinking_water: 5 };
  return overpassData.pois.map((poi) => {
    const distance = turf2.distance(start, poi.coord, { units: "kilometers" });
    return {
      coord: poi.coord,
      name: poi.name,
      category: poi.category,
      distance,
      bearing: (turf2.bearing(start, poi.coord) + 360) % 360,
      score: (CATEGORY_SCORE[poi.category] || 6) - distance * 0.4
    };
  }).filter((p) => p.distance > 0.3 && p.distance <= maxDistanceKm).sort((a, b) => b.score - a.score);
}

// src/legacy.js
var $ = (s, r = document) => r.querySelector(s);
var panel = $("#panel");
var S = { page: "explore", mode: "point", waypoints: [], names: [], routes: [], route: null, selected: null, markers: [], nodes: [], layers: [], poiMarkers: [], geocoders: {}, weather: null, weatherOn: false, wind: { speed: 15, dir: 240 }, windGrid: null, windGridKey: "", windLoading: false, record: null, watch: null, user: null, navState: null, styleIndex: 0, pendingActivity: null, activityView: null, activitySort: "date-desc", lastVoiceKey: "", lastRerouteAt: 0, wakeLock: null, wakeLockWanted: false, audioNavigation: localStorage.getItem("audioNavigation") !== "off", audioUnlocked: false, headingSamples: [], smoothedHeading: null, headingUnstable: false, manualExploreUntil: 0, wrongWaySince: null, userMarker: null, visualHeading: null, routeUndo: [], previewRun: 0, liveJourney: null, liveUnsub: null, cloud: null, sharedJourneyState: null, cycleLayerOn: false, hourlyWeather: [], adventureWaypoints: [], contextPressTimer: null, editingSavedId: null, accountRoutes: [], accountActivities: [], accountSyncing: false, navCamera: { lastAt: 0, zoom: 16.2, state: "normal", postTurnUntil: 0, lastStep: -1 }, sharedRouteLoading: false, sharedRouteLoaded: false, sharedRiderMarker: null, viewerMarker: null, sharedJourneyId: null, sharedJourneyFitted: false, viewerWatch: null };
var mobile = () => innerWidth <= 760;
var toast = (t) => {
  const e = $("#toast");
  e.textContent = t;
  e.classList.add("show");
  setTimeout(() => e.classList.remove("show"), 1900);
};
var gain = (a) => a.reduce((g, v, i) => g + (i && v > a[i - 1] ? v - a[i - 1] : 0), 0);
var fmt = (n) => Number(n || 0).toFixed(1);
mapboxgl.accessToken = MAPBOX_TOKEN;
var map = new mapboxgl.Map({ container: "map", style: "mapbox://styles/mapbox/outdoors-v12", center: [-2.5879, 51.4545], zoom: 11, preserveDrawingBuffer: true });
map.addControl(new mapboxgl.NavigationControl(), "top-right");
var MAP_PAGES = ["explore", "journey", "adventure"];
var NAV = [["explore", "\u2302", "Map"], ["routes", "\u25A4", "Routes"], ["record", "\u25CF", "Record"], ["feed", "\u25D4", "Feed"], ["profile", "\u25CD", "Profile"]];
$("#nav").insertAdjacentHTML("beforeend", NAV.map(([p, i, label]) => `<button class="nav${p === "record" ? " nav-record" : ""}" data-p="${p}"><i>${i}</i><small>${label}</small></button>`).join(""));
$("#nav").onclick = (e) => {
  const b = e.target.closest("[data-p]");
  if (b) open(b.dataset.p === "explore" ? S.lastMapPage || "explore" : b.dataset.p);
};
var sheet = createBottomSheet(panel, { mobile });
function stop3DPreview() {
  S.previewRun++;
  map.stop();
  document.body.classList.remove("route-previewing");
}
function open(p) {
  stop3DPreview();
  if (p !== "adventure") hideRouteLoading();
  S.page = p;
  if (MAP_PAGES.includes(p)) S.lastMapPage = p;
  const isMapPage = MAP_PAGES.includes(p);
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("active", b.dataset.p === p || b.dataset.p === "explore" && isMapPage || b.dataset.p === "profile" && p === "weather"));
  document.body.classList.toggle("panel-open", !isMapPage || !mobile());
  document.body.classList.toggle("map-view", isMapPage);
  document.body.classList.toggle("navigating", !!S.navState && isMapPage);
  const guidance = $("#nav-guidance");
  if (guidance) guidance.hidden = !(S.navState && isMapPage);
  render();
  panel.scrollTop = 0;
  requestAnimationFrame(() => panel.scrollTop = 0);
  if (mobile()) {
    if (S.navState && isMapPage) sheet.setState("peek");
    else if (p === "explore") sheet.setState("peek");
    else if (isMapPage) sheet.setState("half");
    else sheet.setState("full");
  }
  setTimeout(() => map.resize(), 30);
}
function head(t, s) {
  return `<div class="head"><div><h1>${t}</h1><p>${s}</p></div><button class="close">\xD7</button></div>`;
}
function bind() {
  const b = $(".close");
  if (b) b.onclick = () => open(S.page === "weather" ? "profile" : "explore");
}
async function feedPage() {
  if (!S.user) {
    panel.innerHTML = feedSignInPromptHtml(head);
    $("#feedSignIn").onclick = () => open("profile");
    return;
  }
  panel.innerHTML = head("Feed", "Rides from people you follow") + findPeopleHtml() + '<div id="feedList" class="empty">Loading feed\u2026</div>';
  wireFindPeople();
  try {
    const followedUids = await listFollowingUids(S.user.uid), activities = followedUids.length ? await fetchFeed(followedUids) : [], list = $("#feedList");
    if (!activities.length) {
      list.outerHTML = feedEmptyHtml(followedUids.length > 0);
      return;
    }
    const givenChecks = await Promise.all(activities.map((a) => hasGivenKudos(a.id, S.user.uid).catch(() => false)));
    list.outerHTML = `<div id="feedList">${activities.map((a, i) => activityCardHtml(a, givenChecks[i])).join("")}</div>`;
    wireFeedCards();
  } catch (error) {
    console.warn("Feed load failed", error);
    const list = $("#feedList");
    if (list) list.outerHTML = '<div class="empty">Feed unavailable right now.</div>';
  }
}
function wireFindPeople() {
  const run = async () => {
    const q = $("#findPeopleInput").value.trim();
    const results = $("#findPeopleResults");
    if (!q) {
      results.innerHTML = "";
      return;
    }
    results.innerHTML = '<p class="muted">Searching\u2026</p>';
    try {
      const people = (await searchProfilesByName(q)).filter((p) => p.uid !== S.user?.uid);
      if (!people.length) {
        results.innerHTML = '<p class="muted">No riders found.</p>';
        return;
      }
      const flags = await Promise.all(people.map((p) => isFollowing(S.user.uid, p.uid).catch(() => false)));
      results.innerHTML = people.map((p, i) => personResultHtml(p, flags[i], p.uid === S.user?.uid)).join("");
      results.querySelectorAll("[data-follow-toggle]").forEach((b) => b.onclick = async () => {
        const uid = b.dataset.followToggle, following = b.dataset.following === "1";
        try {
          if (following) await unfollowUser(S.user.uid, uid);
          else await followUser(S.user.uid, uid);
          b.dataset.following = following ? "0" : "1";
          b.textContent = following ? "Follow" : "Following";
          b.className = `btn ${following ? "primary" : "light"}`;
          toast(following ? "Unfollowed" : "Now following");
        } catch (error) {
          console.warn("Follow toggle failed", error);
          toast("Could not update follow status");
        }
      });
    } catch (error) {
      console.warn("People search failed", error);
      results.innerHTML = '<p class="muted">Search unavailable right now.</p>';
    }
  };
  $("#findPeopleBtn").onclick = run;
  $("#findPeopleInput").onkeydown = (e) => {
    if (e.key === "Enter") run();
  };
}
function wireFeedCards() {
  panel.querySelectorAll("[data-kudos]").forEach((b) => b.onclick = async () => {
    const id = b.dataset.kudos, given = b.dataset.given === "1";
    b.disabled = true;
    try {
      await toggleKudos(id, S.user.uid, given);
      b.dataset.given = given ? "0" : "1";
      b.className = `btn ${given ? "light" : "primary"}`;
      const count = (b.textContent.match(/\((\d+)\)/)?.[1] | 0) + (given ? -1 : 1);
      b.textContent = `\u{1F44D} Kudos${count > 0 ? ` (${count})` : ""}`;
    } catch (error) {
      console.warn("Kudos failed", error);
      toast("Could not update kudos");
    } finally {
      b.disabled = false;
    }
  });
  panel.querySelectorAll("[data-comments]").forEach((b) => b.onclick = async () => {
    const id = b.dataset.comments, box = $(`#comments-${id}`);
    if (!box) return;
    if (!box.hidden) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    await reloadComments(box, id);
  });
}
async function reloadComments(box, id) {
  box.innerHTML = '<p class="muted">Loading comments\u2026</p>';
  try {
    const comments = await listComments(id);
    box.innerHTML = commentsPanelHtml(comments, id);
    const sendBtn = box.querySelector("[data-send-comment]"), input = box.querySelector(`#commentInput-${id}`);
    sendBtn.onclick = async () => {
      const text = input.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      try {
        await addComment(id, S.user, text);
        await reloadComments(box, id);
      } catch (error) {
        console.warn("Comment failed", error);
        toast("Could not post comment");
        sendBtn.disabled = false;
      }
    };
  } catch (error) {
    console.warn("Comments load failed", error);
    box.innerHTML = '<p class="muted">Comments unavailable right now.</p>';
  }
}
function render() {
  ({ explore, journey, adventure, routes, record, weather, profile, feed: feedPage }[S.page] || explore)();
  bind();
  updateQuickNav();
}
function explore() {
  panel.innerHTML = head("Explore", "Choose transport, adventure, or navigate the displayed route") + `<div class="card hero"><h2>Ride somewhere great</h2><p>Point-to-point cycling, scenic loops, known cycle-route preference and live ride recording. Tap any coloured route on the map to select it and navigate.</p><div class="actions"><button class="btn green" id="p">Point-to-point</button><button class="btn light" id="a">Adventure</button></div></div>`;
  $("#p").onclick = () => open("journey");
  $("#a").onclick = () => open("adventure");
}
function journey() {
  S.mode = "point";
  if (S.waypoints.length < 2) {
    S.waypoints = [S.waypoints[0] || null, S.waypoints[1] || null];
    S.names = [S.names[0] || "", S.names[1] || ""];
  }
  panel.innerHTML = head("Point-to-point", "Routes calculate when Start and Finish are set") + `<div class="card"><div class="field"><label>Start</label><div class="location-row"><div id="g0"></div><button class="loc" id="l0">\u25CE</button></div></div><div id="waypointFields"></div><button class="btn light" id="addWaypoint">\uFF0B Add waypoint</button><div class="field"><label>Finish</label><div class="location-row"><div id="gFinish"></div><button class="loc" id="lFinish">\u25CE</button></div></div><div class="actions"><button class="btn light" id="more" style="display:${S.routes.length ? "block" : "none"}">Show more options</button><button class="btn light" id="showAllMap" style="display:${S.routes.length > 1 ? "block" : "none"}">Show all routes on map</button></div></div><div id="cards"></div>`;
  geo("#g0", 0);
  const finish = S.waypoints.length - 1;
  geo("#gFinish", finish);
  if (S.names[0]) S.geocoders["#g0"]?.setInput(S.names[0]);
  if (S.names[finish]) S.geocoders["#gFinish"]?.setInput(S.names[finish]);
  $("#l0").onclick = () => setHere(0);
  $("#lFinish").onclick = () => setHere(S.waypoints.length - 1);
  $("#addWaypoint").onclick = addPointToPointWaypoint;
  $("#more").onclick = () => pointRoutes(true);
  $("#showAllMap").onclick = showAllRoutesOnMap;
  renderWaypointFields();
  cards();
}
function addPointToPointWaypoint() {
  S.waypoints.splice(S.waypoints.length - 1, 0, null);
  S.names.splice(S.names.length - 1, 0, "");
  journey();
}
function renderWaypointFields() {
  const host = $("#waypointFields");
  if (!host) return;
  host.innerHTML = "";
  for (let i = 1; i < S.waypoints.length - 1; i++) {
    const field = document.createElement("div");
    field.className = "field waypoint-field";
    field.innerHTML = `<label>Waypoint ${i}</label><div class="location-row"><div id="gw${i}"></div><button class="loc" data-remove-waypoint="${i}">\xD7</button></div>`;
    host.appendChild(field);
    geo(`#gw${i}`, i);
    if (S.names[i]) S.geocoders[`#gw${i}`]?.setInput(S.names[i]);
  }
  host.querySelectorAll("[data-remove-waypoint]").forEach((b) => b.onclick = () => {
    const i = +b.dataset.removeWaypoint;
    S.waypoints.splice(i, 1);
    S.names.splice(i, 1);
    journey();
    if (S.waypoints.every(Boolean)) pointRoutes(false);
  });
}
function adventure() {
  S.mode = "loop";
  panel.innerHTML = head("Adventure", "Generate practical loops with minimal repeated road") + `<div class="card"><div class="field"><label>Start and finish</label><div class="location-row"><div id="ga"></div><button class="loc" id="la">\u25CE</button></div></div><div id="adventureWaypoints"></div><button class="btn light" id="addAdventureWaypoint">\uFF0B Add optional waypoint</button><div class="field"><label>Distance range <b id="distanceV">20\u201370 km</b></label><div class="dual-range"><div class="range-track"></div><div id="distanceFill" class="range-fill"></div><input id="distanceMin" type="range" min="5" max="150" step="5" value="20"><input id="distanceMax" type="range" min="5" max="150" step="5" value="70"></div><div class="range-values"><span>Minimum <b id="distanceMinV">20 km</b></span><span>Maximum <b id="distanceMaxV">70 km</b></span></div><small class="muted">Required waypoints can extend the route beyond the range.</small></div><div class="field"><label>Preference</label><select id="pref"><option value="mixed">Balanced</option><option value="scenic">Scenic views</option><option value="landmark">Landmarks</option><option value="food">Food stops</option><option value="cycle">Known cycle routes</option></select></div><div class="actions"><button class="btn primary" id="make">Recommend adventures</button><button class="btn light" id="more">Calculate one more route</button></div></div><div id="cards"></div>`;
  geo("#ga", 0, true);
  $("#la").onclick = () => setHere(0, true);
  $("#addAdventureWaypoint").onclick = () => {
    S.adventureWaypoints.push({ coord: null, name: "" });
    adventure();
  };
  renderAdventureWaypointFields();
  const update = (changed) => {
    let min = +$("#distanceMin").value, max = +$("#distanceMax").value;
    if (min > max) {
      if (changed === "min") max = min;
      else min = max;
      $("#distanceMin").value = min;
      $("#distanceMax").value = max;
    }
    $("#distanceV").textContent = `${min}\u2013${max} km`;
    $("#distanceMinV").textContent = `${min} km`;
    $("#distanceMaxV").textContent = `${max} km`;
    const low = (min - 5) / 145 * 100, high = (max - 5) / 145 * 100;
    $("#distanceFill").style.left = `${low}%`;
    $("#distanceFill").style.width = `${high - low}%`;
  };
  $("#distanceMin").oninput = () => update("min");
  $("#distanceMax").oninput = () => update("max");
  update();
  $("#make").onclick = () => adventureRoutes(false);
  $("#more").onclick = () => adventureRoutes(true);
  cards();
}
function renderAdventureWaypointFields() {
  const host = $("#adventureWaypoints");
  if (!host) return;
  host.innerHTML = "";
  S.adventureWaypoints.forEach((w, i) => {
    const field = document.createElement("div");
    field.className = "field adventure-waypoint";
    field.innerHTML = `<label>Optional waypoint ${i + 1}</label><div class="location-row"><div id="gaw${i}"></div><button class="loc" data-remove-aw="${i}">\xD7</button></div>`;
    host.appendChild(field);
    const g = new MapboxGeocoder({ accessToken: MAPBOX_TOKEN, mapboxgl, marker: false, placeholder: "Search waypoint" });
    g.addTo(`#gaw${i}`);
    if (w.name) g.setInput(w.name);
    g.on("result", (e) => {
      w.coord = e.result.center;
      w.name = e.result.place_name;
      markers();
      scheduleAdventureRebuild();
    });
  });
  host.querySelectorAll("[data-remove-aw]").forEach((b) => b.onclick = () => {
    S.adventureWaypoints.splice(+b.dataset.removeAw, 1);
    adventure();
    scheduleAdventureRebuild();
  });
}
function geo(id, i, loop = false) {
  const host = $(id), g = new MapboxGeocoder({ accessToken: MAPBOX_TOKEN, mapboxgl, marker: false, placeholder: loop ? "Adventure start location" : i ? "Finish location" : "Start location" });
  g.addTo(id);
  S.geocoders[id] = g;
  host.closest(".field")?.classList.add("geocoder-field");
  host.addEventListener("focusin", () => {
    document.querySelectorAll(".geocoder-field").forEach((f) => f.classList.remove("geocoder-active"));
    host.closest(".geocoder-field")?.classList.add("geocoder-active");
  });
  host.addEventListener("focusout", () => setTimeout(() => host.closest(".geocoder-field")?.classList.remove("geocoder-active"), 180));
  g.on("result", (e) => {
    host.closest(".geocoder-field")?.classList.remove("geocoder-active");
    S.waypoints[i] = e.result.center;
    S.names[i] = e.result.place_name;
    if (loop) {
      S.waypoints = [e.result.center, e.result.center];
      S.names = [e.result.place_name, e.result.place_name];
    }
    markers();
    if (!loop && S.waypoints[0] && S.waypoints[1]) pointRoutes(false);
  });
}
async function setHere(i, loop = false) {
  const p = await current();
  if (!p) return;
  const name = await getRecognisableLocationName(p);
  S.waypoints[i] = p;
  S.names[i] = name;
  if (loop) {
    S.waypoints = [p, p];
    S.names = [name, name];
  }
  S.geocoders[loop ? "#ga" : i ? "#g1" : "#g0"]?.setInput(name);
  markers();
  map.flyTo({ center: p, zoom: 14 });
  toast(loop ? `Adventure starts and finishes at ${name}` : `${i ? "Finish" : "Start"} set to ${name}`);
  if (!loop && S.waypoints[0] && S.waypoints[1]) pointRoutes(false);
}
async function getRecognisableLocationName(p) {
  const [lng, lat] = p, token = `access_token=${MAPBOX_TOKEN}`;
  try {
    const addressData = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address&limit=5&${token}`).then((r) => r.json()), addresses = (addressData.features || []).map((f) => ({ ...f, _distance: turf.distance(p, f.center, { units: "kilometers" }) })).sort((a, b) => a._distance - b._distance), nearest = addresses.find((f) => f._distance <= 0.25) || addresses[0];
    if (nearest) {
      const number = nearest.address || "", street = nearest.text || "", place = (nearest.context || []).find((x) => x.id?.startsWith("place."))?.text || "";
      const exact = `${number} ${street}`.trim();
      if (exact) return place ? `${exact}, ${place}` : exact;
    }
    const fallback = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=neighborhood,locality,place&limit=1&${token}`).then((r) => r.json());
    return fallback.features?.[0]?.place_name || "Current location";
  } catch (e) {
    console.warn("Address lookup failed", e);
    return "Current location";
  }
}
async function pointRoutes(append) {
  if (!append) S.editingSavedId = null;
  toast("Finding cycle-friendly routes\u2026");
  const points = structuredClone(S.waypoints), names = structuredClone(S.names);
  if (points.length < 2 || points.some((point) => !Array.isArray(point))) return toast("Choose every waypoint, Start and Finish");
  const base = await directions(points, true), extra = [];
  if (append && S.route) {
    const coordinates = S.route.geometry.coordinates, middle = coordinates[Math.floor(coordinates.length / 2)], bearing = turf.bearing(coordinates[0], coordinates.at(-1));
    for (const side of [-90, 90, -55]) {
      const route = (await directions([points[0], turf.destination(middle, 5, bearing + side).geometry.coordinates, ...points.slice(1)], false))[0];
      if (route) extra.push(route);
    }
  }
  const routes2 = [...base, ...extra];
  routes2.forEach((route) => {
    route._requestPoints = structuredClone(points);
    route.requiredNavigationWaypoints = structuredClone(points.slice(1));
    route.requiredWaypointNames = structuredClone(names.slice(1));
  });
  await accept(routes2, append);
}
function ensureRouteLoading() {
  let box = document.querySelector("#route-loading");
  if (!box) {
    box = document.createElement("div");
    box.id = "route-loading";
    box.className = "route-loading";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    box.innerHTML = '<span class="route-spinner" aria-hidden="true"></span><div><b>Calculating route</b><small id="route-loading-message"></small></div>';
    document.querySelector("#map-wrap")?.appendChild(box);
  }
  return box;
}
function showRouteLoading(message = "Calculating route\u2026", compact = false) {
  const box = ensureRouteLoading();
  if (!box) return;
  box.classList.toggle("compact", compact);
  const label = box.querySelector("#route-loading-message");
  if (label) label.textContent = message;
  box.hidden = false;
  box.style.display = "flex";
  const host = document.querySelector("#cards");
  if (host && !S.routes.length) host.innerHTML = `<div class="card route-loading-card"><span class="route-spinner" aria-hidden="true"></span><div><b>Calculating route</b><small>${escapeHtml(message)}</small></div></div>`;
}
function hideRouteLoading() {
  const box = document.querySelector("#route-loading");
  if (box) {
    box.hidden = true;
    box.style.display = "none";
  }
}
var adventureBuildTimer = 0;
var adventureBuildToken = 0;
function scheduleAdventureRebuild() {
  clearTimeout(adventureBuildTimer);
  showRouteLoading("Preparing waypoint route\u2026", false);
  adventureBuildTimer = setTimeout(() => {
    if (S.page === "adventure" && S.waypoints[0]) adventureRoutes(false);
  }, 500);
}
var adventureRouteCache = /* @__PURE__ */ new Map();
function adventureCacheKey(start, required, minKm, maxKm) {
  return JSON.stringify([start, ...required, minKm, maxKm].map((x) => Array.isArray(x) ? x.map((v) => +v.toFixed(4)) : x));
}
function getCachedAdventureRoutes(key) {
  const item = adventureRouteCache.get(key);
  return item && Date.now() - item.time < 6e5 ? structuredClone(item.routes) : null;
}
function setCachedAdventureRoutes(key, routes2) {
  adventureRouteCache.set(key, { time: Date.now(), routes: structuredClone(routes2) });
}
function validateAdventureLoop(route, start) {
  const coords = route?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 3) return { valid: false, gapKm: Infinity };
  const startGap = turf.distance(coords[0], start), endGap = turf.distance(coords.at(-1), start), closureGap = turf.distance(coords[0], coords.at(-1)), valid = startGap <= 0.18 && endGap <= 0.18 && closureGap <= 0.18;
  return { valid, startGap, endGap, closureGap, gapKm: Math.max(startGap, endGap, closureGap) };
}
function closeAdventureGeometry(route, start) {
  const coords = route?.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length > 1 && turf.distance(coords[0], start) <= 0.18 && turf.distance(coords.at(-1), start) <= 0.18) {
    coords[0] = start;
    coords[coords.length - 1] = start;
  }
  return route;
}
function corridorLoopQuality(route) {
  const coords = route?.geometry?.coordinates || [];
  if (coords.length < 4) return { valid: false, retrace: 1, parallelKm: 0, narrow: false };
  const line2 = turf.lineString(coords), length = Math.max(0.1, turf.length(line2)), spacing = Math.max(0.16, length / 150), samples = [];
  for (let d = 0; d <= length; d += spacing) {
    const point = turf.along(line2, d).geometry.coordinates, next = turf.along(line2, Math.min(length, d + Math.max(0.06, spacing * 0.45))).geometry.coordinates;
    samples.push({ d, point, bearing: turf.bearing(point, next) });
  }
  let same = 0, parallel = 0, longest = 0, run = 0;
  for (let i = 0; i < samples.length; i++) {
    let repeated = false, nearbyDistinct = false;
    for (let j = 0; j < i - 5; j++) {
      if (Math.abs(samples[i].d - samples[j].d) < 0.65) continue;
      const separation = turf.distance(samples[i].point, samples[j].point), difference = Math.abs((samples[i].bearing - samples[j].bearing + 540) % 360 - 180), aligned = difference < 35 || difference > 145;
      if (separation < 0.065 && aligned) {
        repeated = true;
        break;
      }
      if (separation >= 0.065 && separation < 0.22 && aligned) nearbyDistinct = true;
    }
    if (repeated) {
      same += spacing;
      run += spacing;
      longest = Math.max(longest, run);
    } else {
      run = 0;
      if (nearbyDistinct) parallel += spacing;
    }
  }
  const bbox = turf.bbox(line2), w = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[1]]), h = turf.distance([bbox[0], bbox[1]], [bbox[0], bbox[3]]), narrow = Math.min(w, h) < Math.max(1.2, length * 0.08), retrace = Math.min(1, same / length);
  return { valid: retrace <= 0.21 && longest <= 0.8, retrace, parallelKm: parallel, narrow, longestSameKm: longest };
}
function quickAdventureAcceptance(route, start, requiredCount = 0) {
  if (!validateAdventureLoop(route, start).valid || hasMotorway(route)) return { valid: false };
  const q = quickAdventureQuality(route.geometry.coordinates, Math.max(0.1, (route.distance || 0) / 1e3)), corridor = corridorLoopQuality(route), maxRetrace = requiredCount ? 0.34 : 0.21, maxDeadEnd = requiredCount ? 1.2 : 0.8;
  return { ...q, retrace: Math.min(q.retrace, corridor.retrace), parallelDistinctKm: corridor.parallelKm, narrowLoop: corridor.narrow, valid: requiredCount > 0 || corridor.valid && q.deadEndKm <= maxDeadEnd };
}
var ADVENTURE_CORRIDOR_QUERIES = { balanced: ["park", "nature reserve", "historic place", "cycle path"], scenic: ["river", "lake", "seaside", "viewpoint", "castle", "garden"], established: ["greenway", "cycle trail", "canal", "railway path", "national cycle route"] };
async function forceOneMoreAdventureRoute(start, required, minKm, maxKm, effectiveMax, minimumReturn, token) {
  const attempts = [];
  for (let i = 0; i < 8; i++) {
    const seed = S.routes.length * 11 + i, target = minKm + (maxKm - minKm) * (0.22 + i % 6 * 0.13), bearing = (23 + seed * 137.508) % 360, count = 3 + i % 3, radius = Math.max(1.1, target / (2 * Math.PI) * (0.56 + i % 4 * 0.08)), ring = [...required];
    for (let n = 0; n < count; n++) ring.push(turf.destination(start, radius, bearing + n * 360 / count).geometry.coordinates);
    attempts.push({ profile: i % 3 === 0 ? "balanced" : i % 3 === 1 ? "scenic" : "established", target, points: [start, ...ring, start], places: [], forceFallback: true });
  }
  for (const plan of attempts) {
    if (token !== adventureBuildToken) return null;
    const routes2 = await fastDirections(plan.points, 5600, false).catch(() => []);
    for (const raw of routes2) {
      if (!validateAdventureLoop(raw, start).valid || hasMotorway(raw)) continue;
      const route = closeAdventureGeometry(raw, start), quick = quickAdventureQuality(route.geometry.coordinates, Math.max(0.1, (route.distance || 0) / 1e3)), candidate = scoreAdventureCandidateFast(route, plan.target, minKm, Math.max(effectiveMax, maxKm * 1.35), minimumReturn, { waypointEfficient: required.length > 0 }, quick);
      if (!candidate?.route) continue;
      route._requestPoints = plan.points;
      route.adventureProfile = plan.profile;
      route.adventureCompromise = "Unfiltered extra";
      route.qualityLabel = "Extra route \xB7 quality filters relaxed";
      route.rangeStatus = (route.distance || 0) / 1e3 <= maxKm ? "Within selected range" : `${Math.max(0, (route.distance || 0) / 1e3 - maxKm).toFixed(1)} km over maximum`;
      route.recommended = false;
      return route;
    }
  }
  return null;
}
async function adventureWaypointRoutes({ token, start, required, minKm, maxKm, effectiveMax, minimumReturn, cacheKey: cacheKey2, append }) {
  showRouteLoading("Calculating the shortest waypoint return\u2026", false);
  const directPoints = [start, ...required, start], directRoutes = await fastDirections(directPoints, 6500, true).catch(() => []);
  if (token !== adventureBuildToken) return;
  let candidates = collectWaypointCandidates(directRoutes, directPoints, start, required, minKm, maxKm, effectiveMax, minimumReturn, "Efficient waypoint return");
  if (!candidates.length) {
    hideRouteLoading();
    toast("No safe route through the required waypoint was found.");
    return;
  }
  const baselineKm = Math.min(...candidates.map((route) => (route.distance || 0) / 1e3));
  candidates.forEach((route) => {
    route.waypointBaselineKm = baselineKm;
    route.waypointExcessKm = Math.max(0, (route.distance || 0) / 1e3 - baselineKm);
  });
  if (!append && candidates.length < 3) {
    showRouteLoading("Shortest route ready \xB7 finding distinct returns\u2026", true);
    const variations = buildWaypointVariationPlans(start, required, baselineKm), results = await Promise.all(variations.map((plan) => fastDirections(plan.points, 6500, false).then((routes3) => ({ plan, routes: routes3 })).catch(() => ({ plan, routes: [] }))));
    if (token !== adventureBuildToken) return;
    for (const { plan, routes: routes3 } of results) {
      for (const route of collectWaypointCandidates(routes3, plan.points, start, required, minKm, maxKm, effectiveMax, minimumReturn, plan.label)) {
        const km = (route.distance || 0) / 1e3;
        route.waypointBaselineKm = baselineKm;
        route.waypointExcessKm = Math.max(0, km - baselineKm);
        if (km <= Math.max(maxKm * 1.06, baselineKm * 1.16) && !candidates.some((existing) => routeOverlapRatio(existing, route) > 0.82)) candidates.push(route);
      }
    }
  }
  if (append) {
    const variations = buildWaypointVariationPlans(start, required, baselineKm, S.routes.length), results = await Promise.all(variations.map((plan) => fastDirections(plan.points, 6200, false).catch(() => [])));
    for (let i = 0; i < results.length; i++) for (const route of collectWaypointCandidates(results[i], variations[i].points, start, required, minKm, maxKm, effectiveMax, minimumReturn, variations[i].label)) {
      route.waypointBaselineKm = baselineKm;
      route.waypointExcessKm = Math.max(0, (route.distance || 0) / 1e3 - baselineKm);
      candidates.push(route);
    }
  }
  candidates.sort((a, b) => waypointRouteRank(a, b, baselineKm, minKm, maxKm));
  const hardCeiling = Math.max(maxKm * 1.08, baselineKm * 1.16), usable = candidates.filter((route) => (route.distance || 0) / 1e3 <= hardCeiling), pool = usable.length ? usable : candidates.slice(0, 1), additional = append ? pool.find((route) => !S.routes.some((existing) => routeSignature(existing) === routeSignature(route))) || pool[0] : null, routes2 = append ? [...S.routes, additional].filter(Boolean) : pool.slice(0, 3);
  routes2.forEach((route, index) => {
    const km = (route.distance || 0) / 1e3, extra = Math.max(0, km - baselineKm);
    route.waypointEfficient = true;
    route.adventureCompromise = index === 0 ? "Shortest waypoint return" : "Distinct waypoint return";
    route.qualityLabel = index === 0 ? "Shortest waypoint return" : `Distinct return \xB7 +${extra.toFixed(1)} km`;
    route.rangeStatus = km <= maxKm ? "Within selected range" : baselineKm > maxKm ? `Shortest practical trip \xB7 ${Math.max(0, km - maxKm).toFixed(1)} km over range` : `${Math.max(0, km - maxKm).toFixed(1)} km over maximum`;
  });
  setCachedAdventureRoutes(cacheKey2, routes2);
  publishAdventureRoutes(routes2, false);
  hideRouteLoading();
  toast(append ? "One more waypoint route added" : routes2.length >= 3 ? "3 waypoint routes ready" : `${routes2.length} practical waypoint route${routes2.length === 1 ? "" : "s"} ready`);
  routes2.slice(append ? -1 : 0).forEach((route) => enrichAdventureCards([route], token));
}
function collectWaypointCandidates(routes2, points, start, required, minKm, maxKm, effectiveMax, minimumReturn, label) {
  const out = [];
  for (const raw of routes2.slice(0, 3)) {
    if (!validateAdventureLoop(raw, start).valid || hasMotorway(raw)) continue;
    const route = closeAdventureGeometry(raw, start), quick = quickAdventureQuality(route.geometry.coordinates, Math.max(0.1, (route.distance || 0) / 1e3)), candidate = scoreAdventureCandidateFast(route, Math.max(minKm, minimumReturn), minKm, effectiveMax, minimumReturn, { waypointEfficient: true }, quick);
    if (!candidate?.route) continue;
    route._requestPoints = structuredClone(points);
    route.requiredNavigationWaypoints = structuredClone([...required, start]);
    route.requiredWaypointNames = structuredClone([...required.map((_, index) => S.adventureWaypoints[index]?.name || `Waypoint ${index + 1}`), S.names[0] || "Start"]);
    route.waypointEfficient = true;
    route.qualityLabel = label;
    route.rangeStatus = (route.distance || 0) / 1e3 <= maxKm ? "Within selected range" : `${Math.max(0, (route.distance || 0) / 1e3 - maxKm).toFixed(1)} km over maximum`;
    out.push(route);
  }
  return out;
}
function buildWaypointVariationPlans(start, required, baselineKm, seed = 0) {
  const far = required.at(-1), bearing = turf.bearing(start, far), mid = turf.midpoint(start, far).geometry.coordinates, offset = Math.max(0.35, Math.min(2.2, baselineKm * (0.012 + seed * 1e-3))), left = turf.destination(mid, offset, bearing - 90 - seed * 7).geometry.coordinates, right = turf.destination(mid, offset, bearing + 90 + seed * 7).geometry.coordinates;
  return [{ label: "Distinct return west side", points: [start, left, ...required, right, start] }, { label: "Distinct return east side", points: [start, right, ...required, left, start] }, { label: "Direct reverse variation", points: [start, ...required.slice().reverse(), start] }];
}
function waypointRouteRank(a, b, baselineKm, minKm, maxKm) {
  const ak = (a.distance || 0) / 1e3, bk = (b.distance || 0) / 1e3, aEx = Math.max(0, ak - baselineKm), bEx = Math.max(0, bk - baselineKm);
  if (Math.abs(aEx - bEx) > 0.15) return aEx - bEx;
  const ain = ak >= minKm && ak <= maxKm, bin = bk >= minKm && bk <= maxKm;
  if (ain !== bin) return ain ? -1 : 1;
  return (a.retrace || 0) - (b.retrace || 0) || (a.duration || 0) - (b.duration || 0);
}
async function adventureRoutes(append = false) {
  if (!append) S.editingSavedId = null;
  const token = ++adventureBuildToken;
  showRouteLoading(append ? "Finding another distinct route\u2026" : "Finding rivers, greenways and known places\u2026", false);
  const start = S.waypoints[0] || await current();
  if (!start) {
    hideRouteLoading();
    return;
  }
  const minKm = +$("#distanceMin").value, maxKm = +$("#distanceMax").value, required = S.adventureWaypoints.map((x) => x.coord).filter(Boolean), minimumReturn = required.length ? required.reduce((sum, p, i) => sum + turf.distance(i ? required[i - 1] : start, p), 0) + turf.distance(required.at(-1), start) : 0, effectiveMax = Math.max(maxKm, minimumReturn * 1.04), cacheKey2 = adventureCacheKey(start, required, minKm, maxKm) + (append ? `:more:${S.routes.length}` : "");
  if (!append) {
    const cached = getCachedAdventureRoutes(cacheKey2);
    if (cached?.length >= 3 && cached.every((r) => quickAdventureAcceptance(r, start, required.length).valid) && routesAreDistinctStrict(cached.slice(0, 3))) {
      publishAdventureRoutes(cached.slice(0, 3), false);
      hideRouteLoading();
      toast("3 distinct routes ready");
      enrichAdventureCards(cached.slice(0, 3), token);
      return;
    }
  }
  if (required.length) {
    await adventureWaypointRoutes({ token, start, required, minKm, maxKm, effectiveMax, minimumReturn, cacheKey: cacheKey2, append });
    return;
  }
  const profiles = append ? [["balanced", "scenic", "established"][(S.routes.length + 1) % 3]] : ["balanced", "scenic", "established"], destinations = await discoverCorridorDestinations(start, maxKm, profiles, 1900).catch(() => []);
  if (token !== adventureBuildToken) {
    hideRouteLoading();
    return;
  }
  const plans = profiles.map((profile2, i) => buildCorridorLoopPlan(start, required, destinations, minKm, maxKm, profile2, i + S.routes.length));
  showRouteLoading(append ? "Connecting one full route\u2026" : "Connecting 3 destination-led loops\u2026", false);
  const results = await Promise.all(plans.map((plan) => fastDirections(plan.points, 6500, false).then((routes3) => ({ plan, routes: routes3 })).catch(() => ({ plan, routes: [] }))));
  if (token !== adventureBuildToken) {
    hideRouteLoading();
    return;
  }
  let candidates = rankDistinctAdventureCandidates(results, start, required, minKm, maxKm, effectiveMax, minimumReturn);
  if (!append && candidates.length < 3) {
    showRouteLoading(`${candidates.length || "No"} distinct routes ready \xB7 searching different directions\u2026`, true);
    const retryPlans = [...profiles.map((profile2, i) => buildCorridorLoopPlan(start, required, destinations, minKm, maxKm, profile2, i + profiles.length + S.routes.length, true)), ...buildNarrowCorridorPlans(start, required, minKm, maxKm, S.routes.length)], retryResults = await Promise.all(retryPlans.map((plan) => fastDirections(plan.points, 6500, false).then((routes3) => ({ plan, routes: routes3 })).catch(() => ({ plan, routes: [] }))));
    candidates = mergeDistinctAdventureCandidates(candidates, rankDistinctAdventureCandidates(retryResults, start, required, minKm, maxKm, effectiveMax, minimumReturn));
  }
  if (token !== adventureBuildToken) {
    hideRouteLoading();
    return;
  }
  if (!append && candidates.length < 3) {
    showRouteLoading(`${candidates.length} route${candidates.length === 1 ? "" : "s"} \xB7 filling remaining options\u2026`, true);
    const availability = await collectAvailabilityFallbacks(buildAvailabilityFallbackPlans(start, required, minKm, maxKm, S.routes.length), start, required, minKm, maxKm, effectiveMax, minimumReturn, candidates, token);
    candidates = [...candidates, ...availability];
  }
  if (token !== adventureBuildToken) {
    hideRouteLoading();
    return;
  }
  if (append && !candidates.length) {
    showRouteLoading("Quality filters found nothing \xB7 forcing one more route\u2026", false);
    const forced = await forceOneMoreAdventureRoute(start, required, minKm, maxKm, effectiveMax, minimumReturn, token);
    if (forced) candidates = [forced];
  }
  if (token !== adventureBuildToken) {
    hideRouteLoading();
    return;
  }
  if (!candidates.length) {
    hideRouteLoading();
    toast(append ? "Mapbox could not return any closed cycling route" : "No safe closed route found. Try a wider range.");
    return;
  }
  const routes2 = append ? [...S.routes, candidates[0]] : candidates.slice(0, 3);
  setCachedAdventureRoutes(cacheKey2, routes2);
  publishAdventureRoutes(routes2, false);
  hideRouteLoading();
  toast(routes2.length >= 3 ? "3 distinct destination-led routes ready" : `${routes2.length} genuinely distinct route${routes2.length === 1 ? "" : "s"} found`);
  routes2.forEach((route) => enrichAdventureCards([route], token));
}
async function discoverCorridorDestinations(start, maxKm, profiles, budgetMs = 1900) {
  const queries = [...new Set(profiles.flatMap((profile2) => ADVENTURE_CORRIDOR_QUERIES[profile2] || []))], radiusKm = Math.max(3, Math.min(28, maxKm / 4)), controller = new AbortController(), timer = setTimeout(() => controller.abort(), budgetMs), jobs = queries.map((query) => fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${start.join(",")}&types=poi,place&limit=6&access_token=${MAPBOX_TOKEN}`, { signal: controller.signal }).then((r) => r.ok ? r.json() : { features: [] }).catch(() => ({ features: [] })));
  try {
    const results = await Promise.all(jobs), seen = /* @__PURE__ */ new Set(), items = [];
    for (let q = 0; q < results.length; q++) for (const feature of results[q].features || []) {
      const coord = feature.center;
      if (!coord?.every(Number.isFinite)) continue;
      const distance = turf.distance(start, coord);
      if (distance < 1.5 || distance > radiusKm) continue;
      const key = coord.map((v) => v.toFixed(4)).join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ coord, name: feature.text || feature.place_name?.split(",")[0] || queries[q], category: `${queries[q]} ${feature.properties?.category || ""}`.toLowerCase(), distance, bearing: (turf.bearing(start, coord) + 360) % 360, score: corridorDestinationScore(feature, queries[q]) });
    }
    try {
      const bboxDeg = radiusKm / 111, overpassData = await fetchOverpassArea([start[0] - bboxDeg, start[1] - bboxDeg, start[0] + bboxDeg, start[1] + bboxDeg], 0);
      if (overpassData) for (const poi of poisFromOverpass(overpassData, start, turf, radiusKm)) {
        const key = poi.coord.map((v) => v.toFixed(4)).join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(poi);
      }
    } catch (error) {
      console.warn("Overpass corridor POIs unavailable; using Mapbox search only", error);
    }
    return items.sort((a, b) => b.score - a.score);
  } finally {
    clearTimeout(timer);
  }
}
function corridorDestinationScore(feature, query) {
  const text = `${query} ${feature.text || ""} ${feature.properties?.category || ""}`.toLowerCase();
  let score = 12;
  if (/river|lake|seaside|coast|canal|water/.test(text)) score += 20;
  if (/greenway|cycle trail|railway path|national cycle route/.test(text)) score += 22;
  if (/viewpoint|nature reserve|castle|historic|park|garden/.test(text)) score += 15;
  return score + (feature.relevance || 0) * 7;
}
function buildCorridorLoopPlan(start, required, destinations, minKm, maxKm, profile2, index, retry = false) {
  const target = minKm + (maxKm - minKm) * ({ balanced: 0.42, scenic: 0.52, established: 0.46 }[profile2] || 0.42), base = (22 + index * 119 + (retry ? 61 : 0)) % 360, count = Math.max(2, 4 - required.length), queries = ADVENTURE_CORRIDOR_QUERIES[profile2] || [], chosen = [];
  for (let slot = 0; slot < count; slot++) {
    const ideal = (base + slot * 360 / count) % 360, candidate = destinations.filter((p) => !chosen.includes(p) && !required.some((r) => turf.distance(r, p.coord) < 0.4)).map((p) => {
      const angular = Math.abs((p.bearing - ideal + 540) % 360 - 180), match = queries.some((q) => p.category.includes(q)) ? 18 : 0, spacing = chosen.reduce((penalty, x) => penalty + Math.max(0, 55 - Math.abs((p.bearing - x.bearing + 540) % 360 - 180)), 0), idealRadius = target / (2 * Math.PI);
      return { p, value: p.score + match - angular * 0.18 - spacing * 0.45 - Math.abs(p.distance - idealRadius) * 0.9 };
    }).sort((a, b) => b.value - a.value)[0];
    if (candidate) chosen.push(candidate.p);
  }
  let ring = [...required, ...chosen.map((p) => p.coord)].sort((a, b) => (turf.bearing(start, a) + 360) % 360 - (turf.bearing(start, b) + 360) % 360);
  while (ring.length < 4) {
    const radius = Math.max(1.5, target / (2 * Math.PI) * 0.78), angle = base + ring.length * 90;
    ring.push(turf.destination(start, radius, angle).geometry.coordinates);
  }
  return { profile: profile2, target, points: [start, ...ring, start], places: chosen };
}
function buildNarrowCorridorPlans(start, required, minKm, maxKm, seed = 0) {
  return [0, 90, 180, 270].map((bearing, i) => {
    const target = minKm + (maxKm - minKm) * (0.34 + i * 0.14), outward = Math.max(2, target * 0.2), side = Math.max(0.7, Math.min(2.8, target * 0.038)), far = turf.destination(start, outward, bearing + seed * 31).geometry.coordinates, left = turf.destination(far, side, bearing - 90).geometry.coordinates, right = turf.destination(far, side, bearing + 90).geometry.coordinates, nearLeft = turf.destination(start, side, bearing - 90).geometry.coordinates, nearRight = turf.destination(start, side, bearing + 90).geometry.coordinates;
    return { profile: i % 2 ? "scenic" : "established", target, points: [start, ...required, nearLeft, left, far, right, nearRight, start], places: [], corridorPlan: true };
  });
}
function buildAvailabilityFallbackPlans(start, required, minKm, maxKm, seed = 0) {
  const plans = [], fractions = [0.28, 0.38, 0.48, 0.58, 0.68, 0.78], counts = [3, 4, 5, 3, 4, 5];
  for (let i = 0; i < fractions.length; i++) {
    const target = minKm + (maxKm - minKm) * fractions[i], bearing = (15 + seed * 71 + i * 57) % 360, radius = Math.max(1.2, target / (2 * Math.PI) * (0.6 + i % 3 * 0.08)), ring = [...required];
    for (let n = 0; n < counts[i]; n++) ring.push(turf.destination(start, radius, bearing + n * 360 / counts[i]).geometry.coordinates);
    plans.push({ profile: i % 3 === 0 ? "balanced" : i % 3 === 1 ? "scenic" : "established", target, points: [start, ...ring, start], places: [], availabilityFallback: true });
  }
  return plans;
}
function relaxedAvailabilityAcceptance(route, start, requiredCount = 0) {
  if (!validateAdventureLoop(route, start).valid || hasMotorway(route)) return { valid: false };
  const q = quickAdventureQuality(route.geometry.coordinates, Math.max(0.1, (route.distance || 0) / 1e3)), corridor = corridorLoopQuality(route), valid = requiredCount > 0 || corridor.retrace <= 0.27 && corridor.longestSameKm <= 1.05 && q.deadEndKm <= 1;
  return { ...q, retrace: Math.min(q.retrace, corridor.retrace), parallelDistinctKm: corridor.parallelKm, narrowLoop: corridor.narrow, valid };
}
async function collectAvailabilityFallbacks(plans, start, required, minKm, maxKm, effectiveMax, minimumReturn, existing, token) {
  const results = await Promise.all(plans.map((plan) => fastDirections(plan.points, 6200, false).then((routes2) => ({ plan, routes: routes2 })).catch(() => ({ plan, routes: [] })))), out = [];
  if (token !== adventureBuildToken) return out;
  for (const { plan, routes: routes2 } of results) {
    for (const raw of routes2.slice(0, 2)) {
      const quick = relaxedAvailabilityAcceptance(raw, start, required.length);
      if (!quick.valid) continue;
      const route = closeAdventureGeometry(raw, start), candidate = scoreAdventureCandidateFast(route, plan.target, minKm, effectiveMax, minimumReturn, { waypointEfficient: required.length > 0 }, quick);
      if (!candidate?.route) continue;
      route._requestPoints = plan.points;
      route.adventureProfile = plan.profile;
      route.adventureCompromise = "Best available";
      route.qualityLabel = `${route.narrowLoop ? "Corridor loop \xB7 " : ""}Best available \xB7 ${adventureProfileTitle(plan.profile)}`;
      route.rangeStatus = (route.distance || 0) / 1e3 <= maxKm ? "Within selected range" : `${Math.max(0, (route.distance || 0) / 1e3 - maxKm).toFixed(1)} km over maximum`;
      if (![...existing, ...out].some((current2) => routeOverlapRatio(current2, route) > 0.78)) out.push(route);
    }
  }
  return out;
}
function rankDistinctAdventureCandidates(results, start, required, minKm, maxKm, effectiveMax, minimumReturn) {
  let out = [];
  for (const { plan, routes: routes2 } of results) {
    for (const route of collectAdventureCandidatesQuick(plan, routes2, start, required, minKm, maxKm, effectiveMax, minimumReturn)) {
      route.adventurePlaces = plan.places;
      route.adventureProfile = plan.profile;
      route.qualityLabel = `${route.narrowLoop ? "Corridor loop \xB7 " : ""}${adventureProfileTitle(plan.profile)} route${plan.places.length ? ` \xB7 ${plan.places.slice(0, 2).map((p) => p.name).join(" + ")}` : ""}`;
      route.routeInterestScore = plan.places.reduce((n, p) => n + p.score, 0);
      if (!hasAnonymousSpur(route, plan.places, required) && !out.some((existing) => routeOverlapRatio(existing, route) > 0.55)) out.push(route);
    }
  }
  return out.sort((a, b) => (b.routeInterestScore || 0) - (a.routeInterestScore || 0) || (a.retrace || 0) - (b.retrace || 0) || compareAdventureCandidates(a, b, minKm, maxKm));
}
function routeOverlapRatio(a, b) {
  const aCoords = a?.geometry?.coordinates || [], bCoords = b?.geometry?.coordinates || [];
  if (aCoords.length < 2 || bCoords.length < 2) return 0;
  const aPoints = sample(aCoords, 36), bLine = turf.lineString(bCoords);
  let matched = 0;
  for (const point of aPoints) {
    try {
      const snap = turf.nearestPointOnLine(bLine, turf.point(point));
      if (Number.isFinite(snap.properties.dist) && snap.properties.dist < 0.12) matched++;
    } catch {
    }
  }
  return matched / Math.max(1, aPoints.length);
}
function mergeDistinctAdventureCandidates(existing, incoming) {
  const out = [...existing];
  for (const route of incoming) if (!out.some((current2) => routeOverlapRatio(current2, route) > 0.55)) out.push(route);
  return out;
}
function routesAreDistinctStrict(routes2) {
  for (let i = 0; i < routes2.length; i++) for (let j = 0; j < i; j++) if (routeOverlapRatio(routes2[i], routes2[j]) > 0.55) return false;
  return true;
}
function hasAnonymousSpur(route, places, required) {
  if (required.length || !route?.geometry?.coordinates?.length) return false;
  const coords = route.geometry.coordinates, line2 = turf.lineString(coords), length = turf.length(line2), placesNear = places.some((place) => (turf.nearestPointOnLine(line2, turf.point(place.coord)).properties.dist || Infinity) < 0.3);
  return (route.deadEndKm || 0) > 0.45 && !placesNear;
}
function adventureProfileTitle(profile2) {
  return profile2 === "established" ? "Established path" : profile2[0].toUpperCase() + profile2.slice(1);
}
function collectAdventureCandidatesQuick(plan, routes2, start, required, minKm, maxKm, effectiveMax, minimumReturn) {
  const out = [];
  for (const raw of routes2.slice(0, 3)) {
    const quick = quickAdventureAcceptance(raw, start, required.length);
    if (!quick.valid) continue;
    const route = closeAdventureGeometry(raw, start), candidate = scoreAdventureCandidateFast(route, plan.target, minKm, effectiveMax, minimumReturn, { waypointEfficient: required.length > 0 }, quick);
    if (!candidate?.route) continue;
    route._requestPoints = plan.points;
    route.adventureProfile = plan.profile;
    route.qualityLabel = `${plan.profile[0].toUpperCase() + plan.profile.slice(1)} loop`;
    route.rangeStatus = (route.distance || 0) / 1e3 > maxKm ? `${((route.distance || 0) / 1e3 - maxKm).toFixed(1)} km over maximum` : "Within selected range";
    out.push(route);
  }
  return dedupeAdventureCandidates(out).sort((a, b) => compareAdventureCandidates(a, b, minKm, maxKm));
}
function scoreAdventureCandidateFast(route, target, minKm, effectiveMax, minimumLoop, context, quick) {
  const safety = routeSafetyAndDirectness(route);
  if (!safety.safe) return null;
  const routeKm = (route.distance || 0) / 1e3, rangeOverflow = Math.max(0, routeKm - effectiveMax), rangeUnder = Math.max(0, minKm - routeKm), waypointEfficient = !!context.waypointEfficient;
  route._quickQualityScore = quick.score;
  route.retrace = quick.retrace;
  route.overlapKm = quick.overlapKm;
  route.compactness = quick.compactness;
  route.deadEndKm = quick.deadEndKm;
  route.routePenalty = safety.penalty;
  route.rangeOverflow = rangeOverflow;
  route.waypointEfficient = waypointEfficient;
  route.loopQuality = 100 - quick.retrace * 180 - quick.deadEndKm * 24 - safety.penalty - rangeOverflow * 24 - rangeUnder * 10 + Math.min(12, (quick.parallelDistinctKm || 0) * 1.5);
  route.narrowLoop = !!quick.narrowLoop;
  route.recommended = true;
  route.cycleScore = cycleScore(route);
  route.osmCycleScore = null;
  route.cycleScorePending = false;
  route.name = "Adventure route";
  return { route, recommended: true };
}
async function fastDirections(points, timeoutMs = 5200, alternatives = false) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const coordinates = points.map((point) => point.join(",")).join(";"), url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${coordinates}?alternatives=${alternatives}&geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`, response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`Directions ${response.status}`);
    const data = await response.json();
    return data.routes || [];
  } finally {
    clearTimeout(timer);
  }
}
async function hydrateRouteInstructions(route, points) {
  if (!route || route.legs?.some((l) => l.steps?.length)) return;
  try {
    const full = await directionsWithTimeout(points, false, 6500), details = full[0];
    if (details) {
      route.legs = details.legs || [];
      route.duration = details.duration || route.duration;
      route.distance = details.distance || route.distance;
      route.geometry = details.geometry || route.geometry;
    }
  } catch {
  } finally {
    cards();
  }
}
function routeSafetyAndDirectness(route) {
  const steps = route?.legs?.flatMap((leg) => leg.steps || []) || [];
  let motorwayDistance = 0, cycleDistance = 0, directionChanges = 0, crossings = 0, lastTurn = "";
  for (const step of steps) {
    const name = `${step.name || ""}`.trim().toLowerCase(), ref = `${step.ref || ""}`.trim().toLowerCase(), roadClass = `${step.metadata?.class || step.class || ""}`.toLowerCase(), distance = Number(step.distance) || 0, isMotorway = roadClass === "motorway" || roadClass === "motorway_link" || /\bmotorway(?:[_ -]?link)?\b/.test(name) || /^m\d{1,3}(?:\s|$)/.test(ref);
    if (isMotorway) motorwayDistance += distance;
    const description = `${name} ${ref} ${step.maneuver?.instruction || ""}`.toLowerCase();
    if (/cycleway|cycle lane|ncn|greenway|shared path|towpath/.test(description)) cycleDistance += distance;
    if (/cross|roundabout|traffic signal/.test(description)) crossings++;
    const turn = step.maneuver?.modifier || "";
    if (lastTurn && turn && lastTurn !== turn && /left|right/.test(`${lastTurn} ${turn}`)) directionChanges++;
    if (turn) lastTurn = turn;
  }
  const coords = route?.geometry?.coordinates || [], routeKm = (Number(route?.distance) || 0) / 1e3, directKm = coords.length > 1 ? turf.distance(coords[0], coords.at(-1)) : 0, detourRatio = directKm > 0.2 ? routeKm / directKm : 1, crossingPenalty = Math.max(0, crossings - 5), roadSwitchPenalty = Math.max(0, directionChanges - 6), unnecessaryCycleDetour = Math.max(0, detourRatio - 1.45) * (cycleDistance > 0 ? 1.25 : 1);
  return { safe: motorwayDistance === 0, motorwayDistance, cycleDistance, detourRatio, crossingPenalty, roadSwitchPenalty, unnecessaryCycleDetour, penalty: motorwayDistance / 25 + crossingPenalty * 4 + roadSwitchPenalty * 3 + unnecessaryCycleDetour * 18 };
}
function hasMotorway(route) {
  return !routeSafetyAndDirectness(route).safe;
}
function compareAdventureCandidates(a, b, minKm, maxKm) {
  const ak = (a.distance || 0) / 1e3, bk = (b.distance || 0) / 1e3;
  if (a.waypointEfficient !== b.waypointEfficient) {
    const efficient = a.waypointEfficient ? a : b, other = a.waypointEfficient ? b : a, ek = (efficient.distance || 0) / 1e3, ok = (other.distance || 0) / 1e3;
    if (ek <= ok * 1.18) return a.waypointEfficient ? -1 : 1;
  }
  const ain = ak >= minKm && ak <= maxKm, bin = bk >= minKm && bk <= maxKm;
  if (ain !== bin) return ain ? -1 : 1;
  const aOverflow = Math.max(0, ak - maxKm), bOverflow = Math.max(0, bk - maxKm);
  if (aOverflow !== bOverflow) return aOverflow - bOverflow;
  const aUnder = Math.max(0, minKm - ak), bUnder = Math.max(0, minKm - bk);
  if (aUnder !== bUnder) return aUnder - bUnder;
  return (b.loopQuality || 0) - (a.loopQuality || 0);
}
function prepareImmediateRouteMetrics(route) {
  route.cycleScore = Number.isFinite(route.cycleScore) ? route.cycleScore : cycleScore(route);
  route.osmCycleScore = Number.isFinite(route.osmCycleScore) ? route.osmCycleScore : null;
  route.cycleScorePending = route.osmCycleScore === null;
  route.elev = Array.isArray(route.elev) ? route.elev : [];
  route.wind = Array.isArray(route.wind) ? route.wind : [];
  route.ascent = Number.isFinite(route.ascent) ? route.ascent : null;
  return route;
}
function publishAdventureRoutes(routes2, append = false) {
  if (S.mode === "loop" && S.waypoints[0]) routes2 = routes2.filter((r) => validateAdventureLoop(r, S.waypoints[0]).valid).map((r) => closeAdventureGeometry(r, S.waypoints[0]));
  routes2.forEach(prepareImmediateRouteMetrics);
  routes2.forEach((r) => {
    r.cycleScorePending = true;
    refineCycleScoreWithOverpass(r);
  });
  S.routes = append ? [...S.routes, ...routes2] : routes2;
  S.routes = append ? S.routes : S.routes.sort((a, b) => (b.loopQuality || 0) - (a.loopQuality || 0));
  S.routes.forEach((r, i) => r.name = `Adventure ${i + 1}`);
  S.selected = null;
  S.route = null;
  drawAll();
  cards();
  stars();
  updateQuickNav();
}
async function enrichAdventureCards(routes2, token) {
  for (const route of routes2) {
    if (token !== adventureBuildToken) return;
    await enrich(route);
    if (token !== adventureBuildToken) return;
    prepareImmediateRouteMetrics(route);
    cards();
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
}
function quickAdventureQuality(coords, targetKm) {
  if (!coords?.length) return { closed: false, retrace: 1, overlapKm: Infinity, compactness: 0, deadEndKm: Infinity, score: -999 };
  const line2 = turf.lineString(coords), length = turf.length(line2), closed = turf.distance(coords[0], coords.at(-1)) < 0.15, bbox = turf.bbox(line2), diag = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[3]]), compactness = Math.min(1, diag / Math.max(1, length) * 2.2), step = Math.max(0.18, length / 180), seen = /* @__PURE__ */ new Map();
  let repeated = 0, maxRun = 0, run = 0, index = 0;
  for (let d = 0; d <= length; d += step, index++) {
    const p = turf.along(line2, d).geometry.coordinates, key = `${Math.round(p[0] * 900)},${Math.round(p[1] * 900)}`, previous = seen.get(key);
    if (previous !== void 0 && index - previous > 3) {
      repeated += step;
      run += step;
      maxRun = Math.max(maxRun, run);
    } else run = 0;
    seen.set(key, index);
  }
  const retrace = Math.min(1, repeated / Math.max(0.1, length)), distancePenalty = Math.abs(length - targetKm) / Math.max(5, targetKm), score = (closed ? 100 : 0) - retrace * 210 - maxRun * 20 + compactness * 32 - distancePenalty * 22;
  return { closed, retrace, overlapKm: repeated, compactness, deadEndKm: maxRun, score };
}
function dedupeAdventureCandidates(routes2) {
  const out = [];
  for (const route of routes2) {
    const sig = sample(route.geometry.coordinates, 20);
    const duplicate = out.some((existing) => {
      const other = sample(existing.geometry.coordinates, 20);
      let close = 0;
      for (const p of sig) if (other.some((q) => turf.distance(p, q, { units: "kilometers" }) < 0.15)) close++;
      return close / sig.length > 0.72;
    });
    if (!duplicate) out.push(route);
  }
  return out;
}
async function directions(p, alternatives) {
  try {
    const c = p.map((x) => x.join(",")).join(";"), d = await fetch(`https://api.mapbox.com/directions/v5/mapbox/cycling/${c}?alternatives=${alternatives}&geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`).then((r) => r.json());
    return d.routes || [];
  } catch {
    return [];
  }
}
async function accept(rs, append) {
  rs = rs.filter(Boolean);
  await Promise.all(rs.map(enrich));
  rs.forEach((r) => r.cycleScore = cycleScore(r));
  rs.sort((a, b) => b.cycleScore - a.cycleScore);
  S.routes = append ? [...S.routes, ...rs] : rs;
  S.selected = null;
  S.route = null;
  drawAll();
  cards();
  stars();
  updateQuickNav();
}
async function enrich(r) {
  prepareImmediateRouteMetrics(r);
  const points = sample(r.geometry.coordinates, 24);
  try {
    const d = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${points.map((x) => x[1])}&longitude=${points.map((x) => x[0])}`).then((r2) => r2.json());
    r.elev = d.elevation || [];
    r.ascent = gain(r.elev);
  } catch {
    r.elev = [];
    r.ascent = 0;
  }
  try {
    const now = Date.now(), forecastPoints = points.slice(0, 12).map((p, i) => ({ lat: p[1], lon: p[0], time: new Date(now + (r.duration || 3600) * 1e3 * i / 11) })), weather2 = await fetchRouteForecast(forecastPoints);
    r.wind = weather2.map((w, i) => {
      const a = points[Math.min(i, points.length - 2)], b = points[Math.min(i + 1, points.length - 1)], routeBearing = turf.bearing(a, b), windTo = (w.bearing + 180) % 360, component = w.speed * 3.6 * Math.cos((windTo - routeBearing) * Math.PI / 180);
      return Math.round(component * 10) / 10;
    });
    r.windSource = weather2[0]?.source || "live weather";
  } catch {
    r.wind = [];
    r.windSource = "unavailable";
  }
  const fallbackCycle = cycleScore(r);
  r.cycleScore = fallbackCycle;
  r.osmCycleScore = null;
  r.cycleScorePending = true;
  r.elev = Array.isArray(r.elev) ? r.elev : [];
  r.wind = Array.isArray(r.wind) ? r.wind : [];
  refineCycleScoreWithOverpass(r);
}
async function refineCycleScoreWithOverpass(route) {
  try {
    const coords = route?.geometry?.coordinates;
    if (!coords?.length) return;
    const bbox = turf.bbox(turf.lineString(coords));
    const data = await fetchOverpassArea(bbox);
    const result = data && scoreRouteAgainstOverpass(coords, data, turf);
    if (result) {
      route.osmCycleScore = result.score;
      route.surfaceUnpavedShare = result.unpavedShare;
    }
  } catch (error) {
    console.warn("Overpass cycle-infra scoring unavailable; keeping estimate", error);
  } finally {
    route.cycleScorePending = false;
    if (S.routes.includes(route)) cards();
  }
}
function cycleScore(r) {
  let d = 0, t = r.distance || 1;
  (r.legs || []).forEach((l) => (l.steps || []).forEach((s) => {
    const text = `${s.name || ""} ${s.ref || ""}`.toLowerCase();
    if (/cycle|ncn|greenway|trail|towpath|shared path/.test(text)) d += s.distance || 0;
  }));
  return Math.round(100 * d / t);
}
function sample(c, n) {
  if (c.length <= n) return c;
  const l = turf.lineString(c), d = turf.length(l);
  return Array.from({ length: n }, (_, i) => turf.along(l, d * i / (n - 1)).geometry.coordinates);
}
var colors = ["#176bdb", "#e34f4f", "#139b66", "#f28b30", "#8b5bd6", "#00a6a6"];
function drawAll() {
  S.nodes.forEach((m) => m.remove());
  S.nodes = [];
  clearLines();
  S.routes.forEach((r, i) => line(`r${i}`, r.geometry, colors[i % colors.length], i ? 5 : 7));
  if (S.routes.length) {
    const f = { type: "FeatureCollection", features: S.routes.map((r) => ({ type: "Feature", geometry: r.geometry, properties: {} })) }, b = turf.bbox(f);
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: mobile() ? 45 : { left: 560, right: 45, top: 45, bottom: 45 } });
  }
}
function line(id, g, c, w) {
  map.addSource(id, { type: "geojson", data: { type: "Feature", geometry: g, properties: { routeIndex: id.startsWith("r") ? Number(id.slice(1)) : S.selected } } });
  map.addLayer({ id, type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c, "line-width": w, "line-opacity": 0.9 } });
  S.layers.push(id);
  addRouteDirectionArrows(id, c, w);
  if (id.startsWith("r")) bindMapRouteSelection(id, Number(id.slice(1)));
}
function ensureRouteArrowImage(id, color) {
  if (map.hasImage(id)) return;
  const size = 48, canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const x = canvas.getContext("2d");
  x.translate(size / 2, size / 2);
  x.fillStyle = color;
  x.strokeStyle = "#fff";
  x.lineWidth = 5;
  x.lineJoin = "round";
  x.beginPath();
  x.moveTo(-15, -12);
  x.lineTo(14, 0);
  x.lineTo(-15, 12);
  x.lineTo(-8, 0);
  x.closePath();
  x.stroke();
  x.fill();
  map.addImage(id, x.getImageData(0, 0, size, size), { pixelRatio: 2 });
}
function addRouteDirectionArrows(sourceId, color, width) {
  const layerId = `${sourceId}-direction`, imageId = `route-arrow-${color.replace("#", "")}`;
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  ensureRouteArrowImage(imageId, color);
  map.addLayer({ id: layerId, type: "symbol", source: sourceId, layout: { "symbol-placement": "line", "symbol-spacing": width >= 8 ? 90 : 130, "icon-image": imageId, "icon-size": width >= 8 ? 0.65 : 0.48, "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-rotation-alignment": "map" }, paint: { "icon-opacity": width >= 8 ? 0.95 : 0.62 } });
  S.layers.push(layerId);
}
function clearLines() {
  const ids = [...new Set(S.layers)];
  ids.forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  ids.forEach((id) => {
    if (map.getSource(id)) map.removeSource(id);
  });
  S.layers = [];
  S.nodes.forEach((marker) => marker.remove());
  S.nodes = [];
}
function bindMapRouteSelection(layerId, index) {
  map.on("mouseenter", layerId, () => {
    map.getCanvas().style.cursor = "pointer";
    setRouteHover(layerId, true);
  });
  map.on("mouseleave", layerId, () => {
    map.getCanvas().style.cursor = "";
    setRouteHover(layerId, false);
  });
  map.on("click", layerId, (e) => {
    e.originalEvent?.preventDefault?.();
    selectRouteFromMap(index);
  });
}
function setRouteHover(layerId, on) {
  if (!map.getLayer(layerId)) return;
  map.setPaintProperty(layerId, "line-width", on ? 9 : layerId === "r0" ? 7 : 5);
  map.setPaintProperty(layerId, "line-opacity", on ? 1 : 0.9);
}
function selectRouteFromMap(index) {
  if (!Number.isInteger(index) || !S.routes[index]) return;
  select(index);
  open("explore");
  toast(`Route ${index + 1} selected. Press Navigation and record now to begin.`);
  const b = $("#quick-nav");
  if (b && !b.hidden) b.animate([{ transform: "scale(.97)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }], { duration: 420 });
}
function cards() {
  const x = $("#cards");
  if (!x) return;
  if (!S.routes.length) {
    x.innerHTML = '<div class="empty">Routes will appear here.</div>';
    return;
  }
  x.innerHTML = S.routes.map((r, i) => `<div class="card route ${S.selected === i ? "selected" : ""}" data-i="${i}" style="--route-color:${colors[i % colors.length]};border-left:7px solid ${colors[i % colors.length]}"><div class="row"><b>${i ? "Option " + (i + 1) : "Recommended"}</b><div class="card-icon-actions">${S.editingSavedId && i === S.selected ? `<button data-update-saved="${i}" title="Update saved route">\u2713</button>` : ""}<button data-save-route="${i}" title="Save route as a copy">\u25A3</button><button data-share-route="${i}" title="Share route">\u2197</button><button data-preview-route="${i}" title="Animate route preview">\u25B6</button></div></div><span class="pill ${r.recommended === false ? "route-compromise" : ""}">${r.qualityLabel ? `${r.qualityLabel} \xB7 ` : ""}${Number.isFinite(r.cycleScore) ? r.cycleScore : 0}% cycle-route cues${r.cycleScorePending ? " \xB7 refining\u2026" : ""}${r.rangeStatus ? ` \xB7 ${r.rangeStatus}` : ""}${r.waypointEfficient ? " \xB7 repeated access accepted to minimise distance" : Number.isFinite(r.retrace) ? ` \xB7 ${Math.round((1 - r.retrace) * 100)}% non-repeated` : ""}${Number.isFinite(r.surfaceUnpavedShare) && r.surfaceUnpavedShare > 0.05 ? ` \xB7 ${Math.round(r.surfaceUnpavedShare * 100)}% unpaved` : ""}</span><div class="stats"><div class="stat"><b>${fmt(r.distance / 1e3)}</b><small>km</small></div><div class="stat"><b>${Math.round(r.duration / 60)}</b><small>min</small></div><div class="stat"><b>${Number.isFinite(r.ascent) ? Math.round(r.ascent) : "\u2026"}</b><small>${Number.isFinite(r.ascent) ? "climb m" : "climb loading"}</small></div><div class="stat"><b>${Number.isFinite(r.osmCycleScore) ? r.osmCycleScore : Number.isFinite(r.cycleScore) ? r.cycleScore : 0}%</b><small>${Number.isFinite(r.osmCycleScore) ? "OSM cycle infra" : "cycle-route estimate"}</small></div></div><div class="profiles"><div><div class="label">Elevation (m)</div>${r.elev?.length ? `<canvas class="chart" data-e="${i}"></canvas>` : '<div class="profile-pending"><span class="mini-spinner"></span>Loading elevation</div>'}</div><div><div class="label">Tailwind + / headwind \u2212 (km/h)</div>${r.wind?.length ? `<canvas class="chart" data-w="${i}"></canvas>` : '<div class="profile-pending"><span class="mini-spinner"></span>Loading live wind</div>'}</div></div>${S.mode === "loop" ? `<button class="btn green card-navigate" data-nav-route="${i}">Navigate adventure route</button>` : ""}</div>`).join("");
  x.onclick = (e) => {
    const updateSaved = e.target.closest("[data-update-saved]"), save = e.target.closest("[data-save-route]"), share = e.target.closest("[data-share-route]"), preview = e.target.closest("[data-preview-route]"), nav = e.target.closest("[data-nav-route]"), card = e.target.closest("[data-i]");
    if (updateSaved) {
      e.stopPropagation();
      saveEditedSavedRoute();
      return;
    }
    if (save) {
      e.stopPropagation();
      saveRouteByIndex(+save.dataset.saveRoute);
      return;
    }
    if (share) {
      e.stopPropagation();
      shareRouteByIndex(+share.dataset.shareRoute);
      return;
    }
    if (preview) {
      e.stopPropagation();
      select(+preview.dataset.previewRoute);
      previewRoute3D();
      return;
    }
    if (nav) {
      e.stopPropagation();
      select(+nav.dataset.navRoute);
      startNavigation();
      return;
    }
    if (card) select(+card.dataset.i);
  };
  requestAnimationFrame(drawCharts);
}
function showAllRoutesOnMap() {
  S.selected = null;
  S.route = null;
  drawAll();
  cards();
  updateQuickNav();
}
function requireAccount(action = "use this feature") {
  if (S.user) return true;
  toast(`Sign in to ${action}`);
  S.page = "profile";
  document.body.classList.add("panel-open");
  render();
  return false;
}
function accountCacheKey(kind) {
  return S.user ? `account-${S.user.uid}-${kind}` : null;
}
function accountCollection(kind) {
  return `users/${S.user.uid}/${kind}`;
}
function cacheAccountData(kind, items) {
  if (!S.user) return;
  localStorage.setItem(accountCacheKey(kind), JSON.stringify(items));
  if (kind === "routes") S.accountRoutes = items;
  else S.accountActivities = items;
}
function loadAccountCache(kind) {
  if (!S.user) return [];
  try {
    return JSON.parse(localStorage.getItem(accountCacheKey(kind))) || [];
  } catch {
    return [];
  }
}
async function syncAccountLibrary() {
  if (!S.user || S.accountSyncing) return;
  S.accountSyncing = true;
  S.accountRoutes = loadAccountCache("routes");
  S.accountActivities = loadAccountCache("activities");
  try {
    const db = await getCloud(), load = async (kind) => {
      const snap = await db.getDocs(db.collection(db.firestore, accountCollection(kind))), items = snap.docs.map((doc) => decodeAccountDocument(doc.id, doc.data())).filter(Boolean);
      cacheAccountData(kind, items);
      return items;
    };
    await Promise.all([load("routes"), load("activities")]);
    if (S.page === "routes") routes();
    if (S.page === "record") record();
  } catch (error) {
    console.warn("Account library sync unavailable; using account cache", error);
  } finally {
    S.accountSyncing = false;
  }
}
function encodeAccountDocument(kind, item) {
  return { ownerId: S.user.uid, kind, name: item.name || "", createdAt: item.createdAt || item.importedAt || Date.now(), updatedAt: item.updatedAt || Date.now(), payloadJson: JSON.stringify(item) };
}
function decodeAccountDocument(id, data) {
  try {
    const item = data?.payloadJson ? JSON.parse(data.payloadJson) : data;
    return { id, ...item, id };
  } catch (error) {
    console.warn("Invalid account document", id, error);
    return null;
  }
}
async function putAccountItem(kind, item) {
  if (!requireAccount(`save ${kind === "routes" ? "routes" : "activities"}`)) throw new Error("Sign-in required");
  const items = kind === "routes" ? S.accountRoutes : S.accountActivities, index = items.findIndex((x) => x.id === item.id), next = { ...item, ownerId: S.user.uid, updatedAt: Date.now() };
  if (index >= 0) items[index] = next;
  else items.unshift(next);
  cacheAccountData(kind, items);
  try {
    const db = await getCloud();
    await db.setDoc(db.doc(db.firestore, accountCollection(kind), next.id), encodeAccountDocument(kind, next));
  } catch (error) {
    console.warn(`Cloud ${kind} save queued locally`, error);
  }
  return next;
}
async function deleteAccountItem(kind, id) {
  if (!requireAccount("manage account data")) return;
  const items = (kind === "routes" ? S.accountRoutes : S.accountActivities).filter((x) => x.id !== id);
  cacheAccountData(kind, items);
  try {
    const db = await getCloud();
    await db.deleteDoc(db.doc(db.firestore, accountCollection(kind), id));
  } catch (error) {
    console.warn(`Cloud ${kind} delete queued locally`, error);
  }
}
async function previewRoute3D() {
  if (!S.route) return toast("Select one route first");
  open("explore");
  setTimeout(() => {
    const run = ++S.previewRun, coords = sample(S.route.geometry.coordinates, Math.min(80, S.route.geometry.coordinates.length));
    if (coords.length < 2) return toast("Route is too short to animate");
    let i = 0;
    document.body.classList.add("route-previewing");
    toast("3D route preview started");
    const step = () => {
      if (run !== S.previewRun || i >= coords.length - 1) {
        document.body.classList.remove("route-previewing");
        if (i >= coords.length - 1) toast("3D preview complete");
        return;
      }
      map.easeTo({ center: coords[i], bearing: turf.bearing(coords[i], coords[i + 1]), pitch: 68, zoom: 16.8, duration: 520, essential: true });
      i++;
      setTimeout(step, 550);
    };
    step();
  }, 80);
}
async function saveRouteByIndex(i) {
  if (!requireAccount("save routes")) return;
  const route = S.routes[i];
  if (!route) return;
  if (!Array.isArray(route.requiredNavigationWaypoints)) route.requiredNavigationWaypoints = navigationWaypointSequence();
  const name = prompt("Route name", S.mode === "loop" ? `${S.names[0] || "Adventure"} loop` : `${S.names[0] || "Start"} to ${S.names.at(-1) || "Finish"}`);
  if (!name?.trim()) return;
  await putAccountItem("routes", { id: crypto.randomUUID(), name: name.trim(), route: structuredClone(route), names: structuredClone(S.names), waypoints: structuredClone(S.waypoints), mode: S.mode, createdAt: Date.now() });
  toast("Route saved to your account");
}
async function renameSavedRoute(saved, index) {
  if (!requireAccount("rename routes")) return;
  const item = saved[index];
  if (!item) return;
  const name = prompt("Rename saved route", item.name || "Saved route");
  if (!name?.trim() || name.trim() === item.name) return;
  item.name = name.trim();
  await putAccountItem("routes", item);
  toast("Account route renamed");
  routes();
}
async function saveEditedSavedRoute() {
  if (!requireAccount("update routes")) return;
  if (!S.editingSavedId || !S.route) return toast("Open a saved route first");
  const item = S.accountRoutes.find((x) => x.id === S.editingSavedId);
  if (!item) return toast("Saved route could not be found");
  await putAccountItem("routes", { ...item, route: structuredClone(S.route), waypoints: structuredClone(S.waypoints), names: structuredClone(S.names), mode: S.mode });
  toast("Saved route updated on your account");
}
function pushRouteUndo() {
  if (S.route && S.selected !== null) {
    S.routeUndo.push({ route: structuredClone(S.route), index: S.selected });
    if (S.routeUndo.length > 10) S.routeUndo.shift();
    updateUndoButton();
  }
}
function undoRouteEdit() {
  const u = S.routeUndo.pop();
  if (!u) return;
  S.selected = u.index;
  S.route = u.route;
  S.routes[u.index] = u.route;
  clearLines();
  line("chosen", u.route.geometry, colors[u.index % colors.length], 8);
  nodes();
  cards();
  updateUndoButton();
}
function updateUndoButton() {
  const b = $("#route-undo");
  if (b) {
    b.hidden = !S.routeUndo.length || S.page !== "explore";
    b.onclick = undoRouteEdit;
  }
}
function savedRouteBadges(item) {
  const route = item.route || {}, badges = [];
  if (item.mode === "loop" || isClosedLoop(route.geometry?.coordinates || [])) badges.push("Loop");
  if (route.imported || item.importedAt) badges.push("Imported GPX");
  if (route.waypointEfficient) badges.push("Waypoint return");
  if (route.narrowLoop) badges.push("Corridor loop");
  if (route.adventureProfile) badges.push(adventureProfileTitle(route.adventureProfile));
  return badges.slice(0, 4);
}
function savedRouteDate(item) {
  const stamp = item.updatedAt || item.importedAt || item.savedAt;
  return stamp ? new Date(stamp).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "Saved route";
}
function savedRouteMiniChart(values, color) {
  if (!Array.isArray(values) || values.length < 2) return '<div class="saved-mini-empty">Profile unavailable</div>';
  const lo = Math.min(...values), hi = Math.max(...values), points = values.map((v, i) => `${(i / (values.length - 1) * 100).toFixed(1)},${(34 - (v - lo) / (hi - lo || 1) * 28).toFixed(1)}`).join(" ");
  return `<svg class="saved-mini-chart" viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>`;
}
function loadSavedRoute(x, edit = true) {
  S.route = structuredClone(x.route);
  S.routes = [S.route];
  S.selected = 0;
  S.waypoints = structuredClone(x.waypoints || []);
  S.names = structuredClone(x.names || []);
  S.mode = x.mode || "point";
  S.editingSavedId = x.id || null;
  S.route.savedName = x.name || "Saved route";
  clearLines();
  line("chosen", S.route.geometry, colors[0], 8);
  open("explore");
  cards();
  if (edit) nodes();
  updateQuickNav();
  toast(edit ? "Saved route opened in edit mode" : "Saved route opened");
}
function exportSelectedRouteGpx() {
  if (!S.route) return toast("Select a route first");
  const name = S.names.length ? `${S.names[0]} to ${S.names.at(-1)}` : "Ridewise route", xml = `<?xml version="1.0"?><gpx version="1.1" creator="Ridewise" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${escapeHtml(name)}</name><trkseg>${S.route.geometry.coordinates.map((c) => `<trkpt lat="${c[1]}" lon="${c[0]}"></trkpt>`).join("")}</trkseg></trk></gpx>`, a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([xml], { type: "application/gpx+xml" }));
  a.download = "ridewise-route.gpx";
  a.click();
}
async function getCloud() {
  if (S.cloud) return S.cloud;
  const m = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"), app = (await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js")).getApp();
  S.cloud = { ...m, firestore: m.getFirestore(app) };
  return S.cloud;
}
async function startLiveJourney() {
  if (!S.route) return toast("Select a route first");
  if (!S.user) return toast("Sign in first");
  const db = await getCloud(), ref = await db.addDoc(db.collection(db.firestore, "journeys_v4"), { ownerId: S.user.uid, active: true, paused: false, routeJson: JSON.stringify(S.route.geometry), routeName: S.route.savedName || S.route.name || "Live Ridewise route", location: S.pos ? { lng: S.pos[0], lat: S.pos[1], accuracy: null, heading: S.visualHeading ?? S.smoothedHeading ?? null } : null, updatedAt: db.serverTimestamp() });
  S.liveJourney = { ref, id: ref.id, paused: false };
  toast("Live progression started");
}
async function updateLiveJourney(pos, accuracy = null, heading = null) {
  if (!S.liveJourney || S.liveJourney.paused) return;
  const now = Date.now();
  if (S.liveJourney.lastUpdate && now - S.liveJourney.lastUpdate < 1500) return;
  S.liveJourney.lastUpdate = now;
  try {
    const db = await getCloud();
    await db.setDoc(S.liveJourney.ref, { location: { lng: pos[0], lat: pos[1], accuracy: Number.isFinite(accuracy) ? accuracy : null, heading: Number.isFinite(heading) ? heading : null }, active: true, paused: false, updatedAt: /* @__PURE__ */ new Date() }, { merge: true });
  } catch (error) {
    console.warn("Live location update failed", error);
  }
}
function sharedJourneyMarker(kind) {
  const element = document.createElement("div");
  element.className = `live-map-marker ${kind}`;
  element.innerHTML = kind === "rider" ? '<span class="live-marker-ring"></span><span class="live-marker-dot"></span><b>Rider</b>' : '<span class="viewer-marker-halo"></span><span class="viewer-marker-dot"></span><b>You</b>';
  return element;
}
function ensureSharedJourneyStatus() {
  let box = $("#shared-journey-status");
  if (!box) {
    box = document.createElement("section");
    box.id = "shared-journey-status";
    box.className = "shared-journey-status";
    box.innerHTML = '<b>Live journey</b><span id="shared-journey-state">Connecting\u2026</span><small id="shared-journey-updated"></small>';
    $("#map-wrap")?.appendChild(box);
  }
  return box;
}
function drawSharedJourneyRoute(geometry) {
  if (!geometry?.coordinates?.length) return;
  for (const id of ["shared-journey-route"]) {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  }
  map.addSource("shared-journey-route", { type: "geojson", data: { type: "Feature", geometry, properties: {} } });
  map.addLayer({ id: "shared-journey-route", type: "line", source: "shared-journey-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#8b5bd6", "line-width": 7, "line-opacity": 0.9 } });
}
function fitSharedJourneyView(routeGeometry, rider, viewer) {
  if (S.sharedJourneyFitted) return;
  const features = [];
  if (routeGeometry?.coordinates?.length) features.push({ type: "Feature", geometry: routeGeometry, properties: {} });
  if (rider) features.push(turf.point(rider));
  if (viewer) features.push(turf.point(viewer));
  if (!features.length) return;
  const bbox = turf.bbox({ type: "FeatureCollection", features });
  map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: mobile() ? { top: 100, left: 35, right: 35, bottom: 170 } : { top: 70, left: 120, right: 70, bottom: 70 }, maxZoom: 16.5, duration: 900 });
  S.sharedJourneyFitted = true;
}
function beginViewerLocation() {
  if (S.viewerWatch !== null) return;
  S.viewerWatch = navigator.geolocation.watchPosition((position2) => {
    const point = [position2.coords.longitude, position2.coords.latitude];
    if (!S.viewerMarker) S.viewerMarker = new mapboxgl.Marker({ element: sharedJourneyMarker("viewer") }).setLngLat(point).addTo(map);
    else S.viewerMarker.setLngLat(point);
    const route = S.sharedJourneyState?.routeJson ? JSON.parse(S.sharedJourneyState.routeJson) : null, rider = S.sharedJourneyState?.location ? [S.sharedJourneyState.location.lng, S.sharedJourneyState.location.lat] : null;
    fitSharedJourneyView(route, rider, point);
  }, (error) => console.warn("Viewer location unavailable", error), { enableHighAccuracy: true, maximumAge: 5e3, timeout: 1e4 });
}
function renderSharedJourneySnapshot(data) {
  S.sharedJourneyState = data;
  let geometry = null;
  try {
    geometry = typeof data.routeJson === "string" ? JSON.parse(data.routeJson) : data.routeJson;
  } catch (error) {
    console.warn("Invalid live route geometry", error);
  }
  if (geometry?.coordinates?.length) drawSharedJourneyRoute(geometry);
  const rider = data.location && Number.isFinite(data.location.lng) && Number.isFinite(data.location.lat) ? [data.location.lng, data.location.lat] : null;
  if (rider) {
    if (!S.sharedRiderMarker) S.sharedRiderMarker = new mapboxgl.Marker({ element: sharedJourneyMarker("rider") }).setLngLat(rider).addTo(map);
    else S.sharedRiderMarker.setLngLat(rider);
    const heading = data.location.heading;
    if (Number.isFinite(heading)) S.sharedRiderMarker.getElement().style.setProperty("--rider-heading", `${heading}deg`);
  }
  const status = ensureSharedJourneyStatus(), state = $("#shared-journey-state"), updated = $("#shared-journey-updated");
  state.textContent = !data.active ? "Journey ended" : data.paused ? "Live sharing paused" : rider ? "Rider position is live" : "Waiting for rider GPS";
  const date = data.updatedAt?.toDate?.() || new Date(data.updatedAt || Date.now());
  updated.textContent = `Last update ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  const viewer = S.viewerMarker?.getLngLat?.();
  fitSharedJourneyView(geometry, rider, viewer ? [viewer.lng, viewer.lat] : null);
}
async function watchSharedJourney(id) {
  if (!id || S.sharedJourneyId === id) return;
  const user = await authReady;
  if (!user) {
    open("profile");
    toast("Sign in to view this live journey");
    return;
  }
  S.sharedJourneyId = id;
  S.sharedJourneyFitted = false;
  open("explore");
  ensureSharedJourneyStatus();
  beginViewerLocation();
  try {
    const db = await getCloud();
    S.liveUnsub?.();
    S.liveUnsub = db.onSnapshot(db.doc(db.firestore, "journeys_v4", id), (snapshot) => {
      if (!snapshot.exists()) {
        ensureSharedJourneyStatus();
        $("#shared-journey-state").textContent = "Journey not found";
        return;
      }
      renderSharedJourneySnapshot(snapshot.data());
    }, (error) => {
      console.error("Live journey subscription failed", error);
      $("#shared-journey-state").textContent = error.code === "permission-denied" ? "Sign in required to view" : "Live journey unavailable";
    });
  } catch (error) {
    console.error("Could not watch live journey", error);
    toast("Could not open live journey");
  }
}
async function loadJourneyFromUrl() {
  const id = new URLSearchParams(location.search).get("journey");
  if (id) await watchSharedJourney(id);
}
function navigationRouteStyle(pos) {
  if (!S.route || !pos) return;
  const l = turf.lineString(S.route.geometry.coordinates), total = turf.length(l), snap = turf.nearestPointOnLine(l, turf.point(pos)), at = snap.properties.location || 0;
  ["nav-travelled", "nav-upcoming", "nav-future"].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  });
  const add = (id, a, b, color, opacity, width) => {
    if (b - a < 5e-3) return;
    map.addSource(id, { type: "geojson", data: turf.lineSliceAlong(l, a, b) });
    map.addLayer({ id, type: "line", source: id, paint: { "line-color": color, "line-opacity": opacity, "line-width": width } });
  };
  add("nav-travelled", 0, at, "#687789", 0.6, 6);
  add("nav-upcoming", at, Math.min(total, at + 1.25), "#00a8ff", 1, 9);
  add("nav-future", Math.min(total, at + 1.25), total, "#176bdb", 0.24, 6);
}
function showNavigationAlternatives() {
  if (!S.navState) return;
  S.routes.forEach((route, i) => {
    if (i === S.selected || !route?.geometry || hasMotorway(route)) return;
    const id = `nav-alt-${i}`;
    if (map.getLayer(id)) return;
    map.addSource(id, { type: "geojson", data: { type: "Feature", geometry: route.geometry } });
    map.addLayer({ id, type: "line", source: id, paint: { "line-color": "#687789", "line-width": 5, "line-opacity": 0.48, "line-dasharray": [2, 2] } });
    addRouteDirectionArrows(id, "#687789", 5);
    map.on("mouseenter", id, () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", id, () => map.getCanvas().style.cursor = "");
    map.on("click", id, (e) => {
      const previous = S.route, timeDifference = Math.round(((route.duration || 0) - (previous?.duration || 0)) / 60), distanceDifference = ((route.distance || 0) - (previous?.distance || 0)) / 1e3;
      S.selected = i;
      S.route = route;
      S.navState.steps = route.legs?.flatMap((l) => l.steps || []) || [];
      S.navState.index = 0;
      clearNavigationAlternativeLayers();
      line("chosen", route.geometry, colors[i % colors.length], 8);
      showNavigationAlternatives();
      updateNavigationGuidance(S.pos || route.geometry.coordinates[0]);
      const reason = timeDifference < 0 ? `${Math.abs(timeDifference)} min faster` : distanceDifference < -0.2 ? `${Math.abs(distanceDifference).toFixed(1)} km shorter` : timeDifference > 0 ? `${timeDifference} min longer` : "similar time";
      new mapboxgl.Popup({ closeButton: true }).setLngLat(e.lngLat).setHTML(`<b>Alternative selected</b><br>${reason}`).addTo(map);
      toast(`Alternative route selected \xB7 ${reason}`);
    });
  });
}
function clearNavigationAlternativeLayers() {
  [...S.layers.filter((id) => id.startsWith("nav-alt-"))].forEach((id) => {
    if (map.getLayer(`${id}-direction`)) map.removeLayer(`${id}-direction`);
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  });
  S.layers = S.layers.filter((id) => !id.startsWith("nav-alt-"));
}
function toggleAudioNavigation() {
  S.audioNavigation = !S.audioNavigation;
  localStorage.setItem("audioNavigation", S.audioNavigation ? "on" : "off");
  $("#audio-nav").textContent = S.audioNavigation ? "\u{1F50A}" : "\u{1F507}";
  if (S.audioNavigation) unlockAudioNavigation();
  else speechSynthesis.cancel();
}
function unlockAudioNavigation() {
  S.audioUnlocked = true;
  if ("speechSynthesis" in window) {
    speechSynthesis.getVoices();
    const u = new SpeechSynthesisUtterance("Voice guidance on");
    speechSynthesis.speak(u);
  }
}
function blendHeadings(a, b, weightB) {
  const ar = a * Math.PI / 180, br = b * Math.PI / 180, x = Math.cos(ar) * (1 - weightB) + Math.cos(br) * weightB, y = Math.sin(ar) * (1 - weightB) + Math.sin(br) * weightB;
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function updateTravelHeading(pos, time = Date.now(), speedMps = 0) {
  S.headingSamples.push({ pos, time });
  S.headingSamples = S.headingSamples.filter((x) => time - x.time <= 4e3);
  let gpsHeading = null;
  if (S.headingSamples.length >= 2) {
    const f = S.headingSamples[0];
    if (turf.distance(f.pos, pos, { units: "meters" }) < 3) S.headingUnstable = true;
    else {
      gpsHeading = (turf.bearing(f.pos, pos) + 360) % 360;
      S.headingUnstable = false;
    }
  }
  const compass = getCompassHeading();
  let fused = null;
  if (compass != null && isCompassAvailable()) {
    if (speedMps < 1.5) {
      fused = compass;
      S.headingSource = "compass";
    } else if (speedMps > 4) {
      fused = gpsHeading ?? compass;
      S.headingSource = gpsHeading != null ? "gps" : "compass";
    } else if (gpsHeading != null) {
      fused = blendHeadings(gpsHeading, compass, (4 - speedMps) / 2.5);
      S.headingSource = "blend";
    } else {
      fused = compass;
      S.headingSource = "compass";
    }
  } else {
    fused = gpsHeading;
    S.headingSource = gpsHeading != null ? "gps" : "stale";
  }
  if (fused != null) S.smoothedHeading = fused;
  return S.smoothedHeading;
}
function checkWrongDirection(pos, speed, heading) {
  if (!S.route || !Number.isFinite(heading) || speed < 1.5) return;
  const snap = turf.nearestPointOnLine(turf.lineString(S.route.geometry.coordinates), turf.point(pos)), i = Math.min((snap.properties.index || 0) + 2, S.route.geometry.coordinates.length - 1), expected = turf.bearing(pos, S.route.geometry.coordinates[i]), diff = Math.abs((heading - expected + 540) % 360 - 180);
  if (diff > 105) {
    if (!S.wrongWaySince) S.wrongWaySince = Date.now();
    if (Date.now() - S.wrongWaySince > 7e3) recalculateFrom(pos);
  } else S.wrongWaySince = null;
}
function toggleRecordingPause() {
  if (!S.record) return;
  S.record.manualPaused = !S.record.manualPaused;
  syncPauseControls();
}
function toggleNavigationPause() {
  if (!S.navState) return;
  S.navState.paused = !S.navState.paused;
  syncPauseControls();
}
function syncPauseControls() {
  const pr = $("#pause-recording"), pn = $("#pause-navigation"), er = $("#end-recording"), en = $("#end-navigation");
  if (pr) pr.textContent = S.record?.manualPaused ? "Resume recording" : "Pause recording";
  if (pn) pn.textContent = S.navState?.paused ? "Resume navigation" : "Pause navigation";
  if (er) er.hidden = !S.record?.manualPaused;
  if (en) en.hidden = !S.navState?.paused;
}
function select(i) {
  stop3DPreview();
  S.selected = i;
  S.route = S.routes[i];
  clearLines();
  line("chosen", S.route.geometry, colors[i % colors.length], 8);
  nodes();
  cards();
  updateQuickNav();
}
function drawCharts() {
  document.querySelectorAll("[data-e]").forEach((c) => {
    const r = S.routes[+c.dataset.e];
    plot(c, Array.isArray(r?.elev) ? r.elev : [], "#139b66", "m");
  });
  document.querySelectorAll("[data-w]").forEach((c) => {
    const r = S.routes[+c.dataset.w];
    plotSignedWind(c, Array.isArray(r?.wind) ? r.wind : [], "km/h");
  });
}
function plot(c, a = [], col, unit = "") {
  if (!c || !Array.isArray(a) || !a.length) {
    drawChartPlaceholder(c, "Loading data\u2026");
    return;
  }
  const d = devicePixelRatio || 1, rect = c.getBoundingClientRect(), w = Math.max(280, Math.round(rect.width)), h = Math.max(120, Math.round(rect.height));
  c.width = w * d;
  c.height = h * d;
  const x = c.getContext("2d");
  x.setTransform(d, 0, 0, d, 0, 0);
  x.clearRect(0, 0, w, h);
  const lo = Math.min(...a), hi = Math.max(...a), left = 44, right = 8, top = 10, bottom = 24;
  x.strokeStyle = "#dbe2ea";
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(left, top);
  x.lineTo(left, h - bottom);
  x.lineTo(w - right, h - bottom);
  x.stroke();
  x.fillStyle = "#657186";
  x.font = "10px system-ui";
  x.fillText(`${Math.round(hi)}${unit ? " " + unit : ""}`, 3, top + 4);
  x.fillText(`${Math.round(lo)}${unit ? " " + unit : ""}`, 3, h - bottom + 4);
  x.fillText("start", left, h - 6);
  x.fillText("finish", w - 38, h - 6);
  x.strokeStyle = col;
  x.lineWidth = 2.5;
  x.beginPath();
  a.forEach((v, i) => {
    const px = left + i * (w - left - right) / Math.max(1, a.length - 1), py = h - bottom - (v - lo) * (h - top - bottom) / (hi - lo || 1);
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  });
  x.stroke();
}
function plotSignedWind(c, a = [], unit = "km/h") {
  if (!c || !Array.isArray(a) || !a.length) {
    drawChartPlaceholder(c, "Loading wind\u2026");
    return;
  }
  const d = devicePixelRatio || 1, rect = c.getBoundingClientRect(), w = Math.max(280, Math.round(rect.width)), h = Math.max(120, Math.round(rect.height));
  c.width = w * d;
  c.height = h * d;
  const x = c.getContext("2d");
  x.setTransform(d, 0, 0, d, 0, 0);
  const max = Math.max(5, ...a.map((v) => Math.abs(v))), left = 45, right = 8, mid = h / 2;
  x.clearRect(0, 0, w, h);
  x.strokeStyle = "#9aa7b5";
  x.beginPath();
  x.moveTo(left, mid);
  x.lineTo(w - right, mid);
  x.stroke();
  x.font = "10px system-ui";
  x.fillStyle = "#657186";
  x.fillText(`+${Math.round(max)} ${unit}`, 2, 12);
  x.fillText("0", 25, mid + 3);
  x.fillText(`\u2212${Math.round(max)} ${unit}`, 2, h - 5);
  a.forEach((v, i) => {
    const x0 = left + i * (w - left - right) / a.length, x1 = left + (i + 1) * (w - left - right) / a.length, y = mid - v / max * (h / 2 - 14);
    x.fillStyle = v >= 0 ? "#139b66" : "#d94d4d";
    x.fillRect(x0, Math.min(mid, y), Math.max(2, x1 - x0 - 1), Math.abs(mid - y));
  });
  x.fillStyle = "#139b66";
  x.fillText("tailwind", left + 3, 12);
  x.fillStyle = "#d94d4d";
  x.fillText("headwind", left + 3, h - 5);
}
function drawChartPlaceholder(c, text) {
  if (!c) return;
  const d = devicePixelRatio || 1, rect = c.getBoundingClientRect(), w = Math.max(280, Math.round(rect.width || 280)), h = Math.max(120, Math.round(rect.height || 120));
  c.width = w * d;
  c.height = h * d;
  const x = c.getContext("2d");
  x.setTransform(d, 0, 0, d, 0, 0);
  x.clearRect(0, 0, w, h);
  x.fillStyle = "#657186";
  x.font = "11px system-ui";
  x.textAlign = "center";
  x.fillText(text, w / 2, h / 2);
  x.textAlign = "start";
}
function nodes() {
  S.nodes.forEach((m) => m.remove());
  S.nodes = [];
  const steps = S.route?.legs?.flatMap((l) => l.steps) || [];
  steps.slice(1, -1).forEach((step, stepIndex) => {
    const el = document.createElement("div");
    el.className = "turn";
    el.title = "Drag to reshape this route";
    const marker = new mapboxgl.Marker({ element: el, draggable: true }).setLngLat(step.maneuver.location).addTo(map);
    marker.on("dragend", async () => {
      const dragged = marker.getLngLat().toArray();
      await reshapeSelectedRoute(dragged, step.maneuver.location);
    });
    S.nodes.push(marker);
  });
}
function isClosedLoop(coords, toleranceKm = 0.18) {
  return Array.isArray(coords) && coords.length > 2 && Array.isArray(coords[0]) && Array.isArray(coords.at(-1)) && turf.distance(coords[0], coords.at(-1), { units: "kilometers" }) <= toleranceKm;
}
function dedupeViaPoints(points, toleranceKm = 0.015) {
  const out = [];
  for (const point of points || []) {
    if (!Array.isArray(point) || point.length < 2 || !point.every(Number.isFinite)) continue;
    if (!out.length || turf.distance(out.at(-1), point, { units: "kilometers" }) > toleranceKm) out.push([...point]);
  }
  return out;
}
function buildLoopViaPoints(coords, dragged, original) {
  const lineString = turf.lineString(coords), length = turf.length(lineString), snap = turf.nearestPointOnLine(lineString, turf.point(original)), fraction = Math.max(0, Math.min(1, (snap.properties.location || 0) / (length || 1))), anchors = [];
  for (let i = 0; i < 8; i++) {
    const f = i / 8;
    if (Math.abs(f - fraction) > 0.075) anchors.push({ f, coord: turf.along(lineString, length * f).geometry.coordinates });
  }
  anchors.push({ f: fraction, coord: [...dragged] });
  anchors.sort((a, b) => a.f - b.f);
  const start = [...coords[0]], ordered = [start, ...anchors.filter((anchor) => anchor.f > 0.02 && anchor.f < 0.98).map((anchor) => anchor.coord), start];
  return dedupeViaPoints(ordered);
}
function routeRequiredWaypoints(route) {
  if (Array.isArray(route?.requiredNavigationWaypoints) && route.requiredNavigationWaypoints.length) return route.requiredNavigationWaypoints.filter((point) => Array.isArray(point)).map((point) => [...point]);
  const request = route?._requestPoints;
  if (Array.isArray(request) && request.length > 2) return request.slice(1).filter((point) => Array.isArray(point)).map((point) => [...point]);
  if (S.mode === "loop") {
    const start = route?.geometry?.coordinates?.[0], required = S.adventureWaypoints.map((item) => item?.coord).filter((point) => Array.isArray(point));
    return [...required, ...start ? [start] : []].map((point) => [...point]);
  }
  return (S.waypoints || []).slice(1).filter((point) => Array.isArray(point)).map((point) => [...point]);
}
function insertDraggedPointByRouteProgress(route, required, dragged, original) {
  const coords = route.geometry.coordinates, line2 = turf.lineString(coords), requiredWithProgress = required.map((point, index) => {
    const snap = turf.nearestPointOnLine(line2, turf.point(point));
    return { point, index, at: snap.properties.location || 0 };
  }), dragSnap = turf.nearestPointOnLine(line2, turf.point(original)), dragAt = dragSnap.properties.location || 0;
  let inserted = false;
  const ordered = [];
  for (const item of requiredWithProgress.sort((a, b) => a.at - b.at)) {
    if (!inserted && dragAt <= item.at) {
      ordered.push(dragged);
      inserted = true;
    }
    ordered.push(item.point);
  }
  if (!inserted) ordered.push(dragged);
  return ordered;
}
function buildWaypointPreservingEditPoints(route, dragged, original) {
  const start = route.geometry.coordinates[0], required = routeRequiredWaypoints(route), isLoop = isClosedLoop(route.geometry.coordinates);
  if (!required.length) return isLoop ? buildLoopViaPoints(route.geometry.coordinates, dragged, original) : [start, dragged, route.geometry.coordinates.at(-1)];
  const ordered = insertDraggedPointByRouteProgress(route, required, dragged, original), points = [start, ...ordered];
  if (!isLoop) {
    const finish = route.geometry.coordinates.at(-1);
    if (turf.distance(points.at(-1), finish) > 5e-3) points.push(finish);
  } else if (turf.distance(points.at(-1), start) > 5e-3) points.push(start);
  return dedupeNavigationPoints(points).slice(0, 24);
}
function routeContainsRequiredWaypoints(route, required, toleranceM = 90) {
  if (!required.length) return true;
  const line2 = turf.lineString(route.geometry.coordinates);
  return required.every((point) => {
    try {
      return (turf.nearestPointOnLine(line2, turf.point(point)).properties.dist || Infinity) * 1e3 <= toleranceM;
    } catch {
      return false;
    }
  });
}
async function reshapeSelectedRoute(dragged, original) {
  if (!S.route || S.selected === null) return;
  const oldRoute = S.route, isLoop = isClosedLoop(oldRoute.geometry.coordinates), required = routeRequiredWaypoints(oldRoute);
  toast(required.length ? "Reshaping while preserving every waypoint\u2026" : isLoop ? "Reshaping loop while preserving its circuit\u2026" : "Reshaping selected route\u2026");
  pushRouteUndo();
  try {
    const via = buildWaypointPreservingEditPoints(oldRoute, dragged, original), candidates = await directions(via, false), next = candidates[0];
    if (!next) throw new Error("No reshaped route returned");
    if (isLoop && !validLoop(next.geometry.coordinates, oldRoute.geometry.coordinates)) throw new Error("The reshaped result collapsed the loop");
    if (!routeContainsRequiredWaypoints(next, required)) throw new Error("The reshaped route omitted a required waypoint");
    next._requestPoints = structuredClone(via);
    next.requiredNavigationWaypoints = structuredClone(required);
    next.requiredWaypointNames = structuredClone(oldRoute.requiredWaypointNames || []);
    next.waypointEfficient = oldRoute.waypointEfficient;
    next.qualityLabel = oldRoute.qualityLabel;
    next.rangeStatus = oldRoute.rangeStatus;
    next.savedName = oldRoute.savedName;
    await enrich(next);
    next.poi = oldRoute.poi;
    next.name = oldRoute.name;
    next.cycleScore = cycleScore(next);
    S.routes[S.selected] = next;
    S.route = next;
    if (S.editingSavedId) await saveEditedSavedRoute();
    clearLines();
    line("chosen", next.geometry, colors[S.selected % colors.length], 8);
    nodes();
    cards();
    updateQuickNav();
    toast(required.length ? "Route reshaped \xB7 all waypoints preserved" : isLoop ? "Loop reshaped and preserved" : "Route reshaped");
  } catch (error) {
    console.warn("Route reshaping rejected:", error);
    S.route = oldRoute;
    S.routes[S.selected] = oldRoute;
    clearLines();
    line("chosen", oldRoute.geometry, colors[S.selected % colors.length], 8);
    nodes();
    cards();
    toast(required.length ? "Edit rejected because a required waypoint would be lost" : "That edit would collapse the loop, so the previous route was restored");
  }
}
function validLoop(next, previous) {
  if (!isClosedLoop(next)) return false;
  const oldLength = turf.length(turf.lineString(previous)), newLength = turf.length(turf.lineString(next));
  if (newLength < oldLength * 0.55) return false;
  const oldArea = loopAreaScore(previous), newArea = loopAreaScore(next);
  return newArea >= Math.max(0.05, oldArea * 0.22);
}
function loopAreaScore(coords) {
  try {
    const ring = isClosedLoop(coords) ? coords : [...coords, coords[0]];
    return turf.area(turf.polygon([ring])) / 1e6;
  } catch {
    return 0;
  }
}
function stars() {
  S.poiMarkers.forEach((m) => m.remove());
  S.poiMarkers = [];
  S.routes.forEach((r, i) => {
    if (!r.poi) return;
    const e = document.createElement("button");
    e.className = "poi-star";
    e.textContent = "\u2605";
    S.poiMarkers.push(new mapboxgl.Marker({ element: e }).setLngLat(r.poi.center).setPopup(new mapboxgl.Popup().setHTML(`<b>\u2605 ${r.poi.name}</b><br>Considered for option ${i + 1}`)).addTo(map));
  });
}
function markers() {
  S.markers.forEach((m) => m.remove());
  S.markers = [];
  S.waypoints.filter(Boolean).forEach((p) => S.markers.push(new mapboxgl.Marker().setLngLat(p).addTo(map)));
}
function updateQuickNav() {
  const box = $("#quick-nav"), quickStart = $("#quick-start"), live = $("#ride-live");
  if (!box || !quickStart || !live) return;
  const routeReady = !!S.route && S.selected !== null, active = !!S.record || !!S.navState;
  box.hidden = !routeReady && !active;
  quickStart.hidden = active;
  live.hidden = !active;
  box.classList.toggle("recording-active", active);
  if (routeReady && !active) quickStart.onclick = startNavigation;
  if (active) {
    box.style.display = "block";
    box.style.visibility = "visible";
    box.style.opacity = "1";
    live.style.display = "block";
    quickStart.style.display = "none";
  } else {
    box.style.display = box.hidden ? "none" : "";
    live.style.display = "none";
    quickStart.style.display = "";
  }
}
function forceNavigationControlsVisible() {
  const box = $("#quick-nav"), live = $("#ride-live"), start = $("#quick-start");
  if (!box || !live || !start) return;
  box.hidden = false;
  live.hidden = false;
  start.hidden = true;
  box.classList.add("recording-active");
  requestAnimationFrame(() => {
    box.hidden = false;
    live.hidden = false;
    start.hidden = true;
    box.style.display = "block";
    live.style.display = "block";
    start.style.display = "none";
    syncPauseControls();
  });
}
function updateOfflineNavigationStatus() {
  let badge = $("#offline-nav-status");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "offline-nav-status";
    badge.className = "offline-nav-status";
    $("#map-wrap")?.appendChild(badge);
  }
  const active = !!S.navState && !navigator.onLine;
  badge.hidden = !active;
  if (active) badge.textContent = "Offline navigation \xB7 GPS guidance active \xB7 rerouting unavailable";
}
var ACTIVE_SESSION_KEY = "ridewise-active-session-v1";
var sessionSaveTimer = 0;
function serialisableSession() {
  if (!S.record && !S.navState) return null;
  return { version: 1, ownerId: S.user?.uid || null, savedAt: Date.now(), route: S.route ? structuredClone(S.route) : null, routes: structuredClone(S.routes || []), selected: S.selected, waypoints: structuredClone(S.waypoints || []), names: structuredClone(S.names || []), mode: S.mode, record: S.record ? structuredClone(S.record) : null, navState: S.navState ? { ...structuredClone(S.navState), recalculating: false } : null, pos: S.pos || null, visualHeading: S.visualHeading ?? S.smoothedHeading ?? null };
}
function persistActiveSession(force = false) {
  clearTimeout(sessionSaveTimer);
  const commit = () => {
    const data = serialisableSession();
    if (data) localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(data));
    else localStorage.removeItem(ACTIVE_SESSION_KEY);
  };
  if (force) commit();
  else sessionSaveTimer = setTimeout(commit, 800);
}
function clearActiveSession() {
  clearTimeout(sessionSaveTimer);
  localStorage.removeItem(ACTIVE_SESSION_KEY);
}
function getRecoverableSession() {
  try {
    const data = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY));
    return data && S.user && data.ownerId === S.user.uid && Date.now() - data.savedAt < 7 * 864e5 ? data : null;
  } catch {
    return null;
  }
}
function restoreActiveSession(data) {
  if (!data) return;
  S.route = data.route;
  S.routes = data.routes?.length ? data.routes : data.route ? [data.route] : [];
  S.selected = Number.isInteger(data.selected) ? data.selected : S.route ? 0 : null;
  S.waypoints = data.waypoints || [];
  S.names = data.names || [];
  S.mode = data.mode || "point";
  S.record = data.record || null;
  S.navState = data.navState || null;
  if (S.navState && !Array.isArray(S.navState.requiredWaypoints)) {
    S.navState.requiredWaypoints = navigationWaypointSequence();
    S.navState.requiredWaypointIndex = 0;
    S.navState.visitedWaypoints = [];
  }
  if (S.navState) S.navState.waypointArrivalHits = 0;
  S.pos = data.pos || S.pos;
  S.visualHeading = data.visualHeading ?? null;
  if (S.record) {
    S.record.lastTick = Date.now();
    S.record.paused = false;
    S.record.stationarySince = null;
  }
  if (S.route) {
    clearLines();
    line("chosen", S.route.geometry, colors[(S.selected || 0) % colors.length], 8);
  }
  watch();
  open("explore");
  if (S.navState) {
    $("#nav-guidance").hidden = false;
    showNavigationAlternatives();
    updateNavigationGuidance(S.pos || S.route?.geometry?.coordinates?.[0]);
  }
  updateQuickNav();
  persistActiveSession(true);
  toast(S.navState ? "Navigation restored" : "Recording restored");
}
function promptSessionRecovery() {
  const data = getRecoverableSession();
  if (!data) return;
  const box = createChoiceModal("Unfinished ride found", `<p>${data.navState ? "Navigation and recording" : "Recording"} from ${new Date(data.savedAt).toLocaleString()}.</p><button id="resumeSession">${data.navState ? "Resume navigation" : "Resume recording"}</button><button id="savePartialSession">Save partial activity</button><button id="discardSession">Discard</button>`);
  $("#resumeSession").onclick = () => {
    box.remove();
    restoreActiveSession(data);
  };
  $("#savePartialSession").onclick = () => {
    box.remove();
    restoreActiveSession(data);
    finishRecord(true);
  };
  $("#discardSession").onclick = () => {
    clearActiveSession();
    box.remove();
    toast("Unfinished ride discarded");
  };
}
function navigationWaypointSequence() {
  const attached = S.route?.requiredNavigationWaypoints;
  if (Array.isArray(attached) && attached.length) return attached.filter((point) => Array.isArray(point)).map((point) => [...point]);
  const request = S.route?._requestPoints;
  if (Array.isArray(request) && request.length > 1) return request.slice(1).filter((point) => Array.isArray(point)).map((point) => [...point]);
  const start = S.route?.geometry?.coordinates?.[0];
  if (S.mode === "loop") {
    const required = S.adventureWaypoints.map((item) => item?.coord).filter((point) => Array.isArray(point));
    return [...required, ...start ? [start] : []].map((point) => [...point]);
  }
  return (S.waypoints || []).slice(1).filter((point) => Array.isArray(point)).map((point) => [...point]);
}
function dedupeNavigationPoints(points) {
  const out = [];
  for (const point of points) if (!out.length || turf.distance(out.at(-1), point) > 5e-3) out.push([...point]);
  return out;
}
function initialiseNavigationWaypoints() {
  const requiredWaypoints = navigationWaypointSequence();
  S.route.requiredNavigationWaypoints = structuredClone(requiredWaypoints);
  S.navState.requiredWaypoints = structuredClone(requiredWaypoints);
  S.navState.requiredWaypointIndex = 0;
  S.navState.visitedWaypoints = [];
  S.navState.waypointArrivalHits = 0;
  S.navState.originalRequestPoints = structuredClone(S.route?._requestPoints || S.waypoints || []);
}
function updateNavigationWaypointProgress(pos, accuracy = Infinity) {
  const nav = S.navState;
  if (!nav || !Array.isArray(nav.requiredWaypoints) || nav.requiredWaypointIndex >= nav.requiredWaypoints.length) return;
  const target = nav.requiredWaypoints[nav.requiredWaypointIndex], distance = turf.distance(pos, target, { units: "meters" }), inside = distance <= 25 && (!Number.isFinite(accuracy) || accuracy <= 35);
  if (!inside) {
    nav.waypointArrivalHits = 0;
    return;
  }
  nav.waypointArrivalHits = (nav.waypointArrivalHits || 0) + 1;
  if (nav.waypointArrivalHits < 2) return;
  nav.visitedWaypoints.push([...target]);
  nav.requiredWaypointIndex++;
  nav.waypointArrivalHits = 0;
  const remaining = nav.requiredWaypoints.length - nav.requiredWaypointIndex;
  toast(remaining ? `Waypoint reached \xB7 ${remaining} remaining` : "Final waypoint reached");
  persistActiveSession(true);
}
function remainingNavigationWaypoints() {
  const nav = S.navState;
  if (!nav) return [];
  return (nav.requiredWaypoints || []).slice(nav.requiredWaypointIndex).filter((point) => Array.isArray(point)).map((point) => [...point]);
}
async function startNavigation() {
  if (!S.route) {
    toast("Select a route first");
    return false;
  }
  if (!S.route.legs?.some((l) => l.steps?.length) && S.route._requestPoints?.length) {
    toast("Preparing turn instructions\u2026");
    await hydrateRouteInstructions(S.route, S.route._requestPoints);
  }
  if (hasMotorway(S.route)) {
    toast("Route rejected: motorway cycling is not permitted. Choose another route.");
    return false;
  }
  unlockAudioNavigation();
  enableCompass();
  await requestScreenWakeLock();
  S.nodes.forEach((m) => m.remove());
  S.nodes = [];
  const steps = S.route.legs?.flatMap((l) => l.steps || []) || [];
  S.navState = { steps, index: 0, totalDistance: S.route.distance || 0, totalDuration: S.route.duration || 0, started: Date.now(), offRouteSince: null, recalculating: false, lastSpokenStep: -1, lastSpokenBand: "" };
  initialiseNavigationWaypoints();
  const recordingStarted = await startRecord(true);
  if (recordingStarted === false) {
    S.navState = null;
    updateQuickNav();
    return;
  }
  open("explore");
  document.body.classList.add("navigating", "map-view");
  document.body.classList.remove("panel-open");
  updateQuickNav();
  forceNavigationControlsVisible();
  const initialPos = S.pos || S.route.geometry.coordinates[0];
  const guidance = $("#nav-guidance");
  if (guidance) guidance.hidden = false;
  showNavigationAlternatives();
  updateNavigationGuidance(initialPos);
  updateAdaptiveNavigationCamera(initialPos, S.smoothedHeading, 0, true);
  syncPauseControls();
  persistActiveSession(true);
  updateOfflineNavigationStatus();
  setTimeout(forceNavigationControlsVisible, 80);
  toast("Navigation and recording started");
  return true;
}
async function startRecord(nav = false) {
  if (!requireAccount(nav ? "start navigation and recording" : "record rides")) return false;
  await requestScreenWakeLock();
  if (!S.record) S.record = { started: Date.now(), movingMs: 0, lastTick: Date.now(), distance: 0, gain: 0, speed: 0, avgSpeed: 0, last: null, samples: [], nav, paused: false, stationarySince: null };
  else S.record.nav = S.record.nav || nav;
  watch();
  updateQuickNav();
  if (nav) forceNavigationControlsVisible();
  persistActiveSession(true);
  if (S.page === "record") record();
  return true;
}
function record() {
  if (!S.user && !S.record && !S.pendingActivity) {
    panel.innerHTML = head("Record", "Account-specific ride recording") + '<div class="card account-required"><h2>Sign in required</h2><p>Recording and completed activities are stored only in your account.</p><button class="btn primary" id="recordSignIn">Sign in</button></div>';
    $("#recordSignIn").onclick = () => open("profile");
    return;
  }
  if (S.activityView !== null) {
    renderActivityDetail(S.activityView);
    return;
  }
  const r = S.record, d = S.pendingActivity, activities = sortedActivities();
  panel.innerHTML = head("Record", "Record rides and review activity analysis") + (r ? `<div class="stats"><div class="stat"><b id="speed">${displaySpeed(r).toFixed(1)}</b><small>${r.paused ? "average" : "current"} km/h</small></div><div class="stat"><b id="dist">${r.distance.toFixed(2)}</b><small>km</small></div><div class="stat"><b id="gain">${Math.round(r.gain)}</b><small>gain m</small></div><div class="stat"><b id="elapsed">${formatClock(r.movingMs)}</b><small>moving time</small></div></div><p class="muted">${r.paused ? "Auto-paused after 10 seconds without movement." : "Recording movement."}</p><div class="actions"><button class="btn light" id="stopPanel">Stop recording</button><button class="btn primary" id="endPanel">End navigation</button></div>` : d ? pendingEditor(d) : `<div class="card"><button class="btn green" id="start">Start recording</button></div>`) + `<div class="activity-toolbar"><h2>Activities</h2><select id="activitySort"><option value="date-desc">Newest first</option><option value="distance-asc">Distance: low to high</option><option value="distance-desc">Distance: high to low</option><option value="gain-asc">Elevation: low to high</option><option value="gain-desc">Elevation: high to low</option><option value="speed-asc">Speed: low to high</option><option value="speed-desc">Speed: high to low</option><option value="effort-asc">Effort: low to high</option><option value="effort-desc">Effort: high to low</option></select></div><div id="activityCards">${activities.length ? activities.map((x) => activityCard(x.activity, x.index)).join("") : '<div class="empty">Completed rides will appear here.</div>'}</div>`;
  if ($("#activitySort")) {
    $("#activitySort").value = S.activitySort;
    $("#activitySort").onchange = (e) => {
      S.activitySort = e.target.value;
      record();
    };
  }
  if ($("#start")) $("#start").onclick = () => startRecord(false);
  if ($("#stopPanel")) $("#stopPanel").onclick = stopRecording;
  if ($("#endPanel")) $("#endPanel").onclick = endNavigation;
  if ($("#activityPhotos")) $("#activityPhotos").onchange = (e) => attachActivityPhotos([...e.target.files]);
  if ($("#saveActivity")) $("#saveActivity").onclick = savePendingActivity;
  if ($("#discardActivity")) $("#discardActivity").onclick = () => {
    S.pendingActivity = null;
    record();
  };
  panel.querySelectorAll("[data-remove-pending-photo]").forEach((b) => b.onclick = () => {
    S.pendingActivity.photos.splice(+b.dataset.removePendingPhoto, 1);
    record();
  });
  panel.querySelectorAll("[data-activity]").forEach((el) => el.onclick = () => {
    S.activityView = +el.dataset.activity;
    record();
  });
}
function pendingEditor(d) {
  d.photos = d.photos || [];
  return `<div class="card"><h2>Ride complete</h2><p class="muted">Name the activity and add up to six photos.</p><div class="field"><label>Activity name</label><input id="activityName" value="${escapeHtml(d.name)}"></div><div class="field"><label>Photos</label><input id="activityPhotos" type="file" accept="image/*" multiple></div><div class="photo-grid">${d.photos.map((x, i) => `<div><img src="${x}"><button data-remove-pending-photo="${i}">\xD7</button></div>`).join("")}</div><div class="stats"><div class="stat"><b>${d.distance.toFixed(2)}</b><small>km</small></div><div class="stat"><b>${d.avgSpeed.toFixed(1)}</b><small>avg km/h</small></div><div class="stat"><b>${Math.round(d.gain)}</b><small>gain m</small></div><div class="stat"><b>${Math.round(d.effortScore || 0)}</b><small>effort</small></div></div><label class="row" style="margin-top:9px"><span>Share to feed for followers</span><input id="shareToFeed" type="checkbox" checked></label><div class="actions"><button class="btn green" id="saveActivity">Save activity</button><button class="btn light" id="discardActivity">Discard</button></div></div>`;
}
function sortedActivities() {
  const a = S.accountActivities.map((activity, index) => ({ activity, index })), [key, dir] = S.activitySort.split("-"), value = (x) => key === "distance" ? x.activity.distance : key === "gain" ? x.activity.gain : key === "speed" ? x.activity.avgSpeed : key === "effort" ? x.activity.effortScore : new Date(x.activity.ended || x.activity.started).getTime();
  return a.sort((x, y) => (value(x) - value(y)) * (dir === "asc" ? 1 : -1));
}
function activityCard(a, i) {
  const cover = (a.photos || [])[0] || a.photo;
  return `<button class="activity-card" data-activity="${i}">${cover ? `<img src="${cover}" alt="Activity photo">` : '<div class="activity-map-thumb">\u2301</div>'}<div><b>${escapeHtml(a.name || "Cycling activity")}</b><span>${a.distance.toFixed(1)} km \xB7 ${a.avgSpeed.toFixed(1)} km/h \xB7 ${Math.round(a.gain || 0)} m \xB7 effort ${Math.round(a.effortScore || 0)}</span></div></button>`;
}
function renderActivityDetail(index) {
  const activities = S.accountActivities, a = activities[index];
  if (!a) {
    S.activityView = null;
    record();
    return;
  }
  a.photos = a.photos || [a.photo].filter(Boolean);
  displayActivityRoute(a);
  panel.innerHTML = head(a.name || "Activity", "Route, photos and performance analysis") + `<div class="activity-gallery">${a.photos.length ? a.photos.map((p, i) => `<div><img src="${p}" alt="Activity photo"><button data-delete-photo="${i}">\xD7</button></div>`).join("") : '<div class="empty">No photos yet.</div>'}</div><div class="actions"><label class="btn light file-label">Add photos<input id="addActivityPhotos" type="file" accept="image/*" multiple hidden></label><button class="btn light" id="renameActivity">Rename</button><button class="btn green" id="useActivityRoute">Use this route</button><button class="btn light" id="shareActivity">Share</button><button class="btn primary" id="socialPng">Export social PNG</button></div><div class="stats"><div class="stat"><b>${a.distance.toFixed(2)}</b><small>km</small></div><div class="stat"><b>${a.avgSpeed.toFixed(1)}</b><small>avg km/h</small></div><div class="stat"><b>${Math.round(a.gain || 0)}</b><small>gain m</small></div><div class="stat"><b>${formatClock(a.elapsed)}</b><small>moving time</small></div><div class="stat"><b>${Math.round(a.effortScore || 0)}</b><small>effort score</small></div><div class="stat"><b>${Math.round(a.avgPower || 0)}</b><small>estimated watts</small></div><div class="stat"><b>${(a.avgPower / (profileData().weight || 70)).toFixed(2)}</b><small>W/kg</small></div><div class="stat"><b>${Math.round(a.maxSpeed || 0)}</b><small>max km/h</small></div></div><p class="metric-note">Power and effort are estimates based on GPS speed, elevation, rider profile and a simplified cycling-resistance model. They are not power-meter or medical measurements.</p><div class="card"><div class="label">Speed profile</div><canvas id="activitySpeed" class="chart detail-chart" width="500" height="160"></canvas><div class="label">Elevation profile</div><canvas id="activityElevation" class="chart detail-chart" width="500" height="160"></canvas><div class="label">Wind profile at ride time</div><canvas id="activityWind" class="chart detail-chart" width="500" height="160"></canvas><div class="label">Estimated power</div><canvas id="activityPower" class="chart detail-chart" width="500" height="160"></canvas></div><button class="btn light" id="backActivities">Back to activities</button>`;
  requestAnimationFrame(() => {
    plot($("#activitySpeed"), (a.samples || []).map((x) => (x.speed || 0) * 3.6), "#f28b30");
    plot($("#activityElevation"), (a.samples || []).map((x) => x.elevation).filter(Number.isFinite), "#139b66");
    plot($("#activityWind"), (a.samples || []).map((x) => x.windSpeed).filter(Number.isFinite), "#176bdb");
    plot($("#activityPower"), (a.samples || []).map((x) => x.estimatedPower || 0), "#8b5bd6");
  });
  $("#backActivities").onclick = () => {
    S.activityView = null;
    record();
  };
  $("#addActivityPhotos").onchange = (e) => addPhotosToSavedActivity(index, [...e.target.files]);
  $("#renameActivity").onclick = () => renameSavedActivity(index);
  $("#useActivityRoute").onclick = () => useSavedActivityRoute(a);
  $("#shareActivity").onclick = () => shareSavedActivity(a);
  $("#socialPng").onclick = () => exportActivityPng(a);
  panel.querySelectorAll("[data-delete-photo]").forEach((b) => b.onclick = () => deleteSavedPhoto(index, +b.dataset.deletePhoto));
}
async function useSavedActivityRoute(a) {
  const coords = (a.samples || []).map((x) => x.pos).filter(Boolean);
  if (coords.length < 2) return toast("This activity has no route");
  const points = sample(coords, Math.min(20, coords.length)), r = (await directions(points, false))[0];
  S.route = r || { geometry: { type: "LineString", coordinates: coords }, distance: (a.distance || 0) * 1e3, duration: a.elapsed / 1e3, legs: [] };
  S.routes = [S.route];
  S.selected = 0;
  S.mode = "point";
  S.names = [a.name || "Activity route", a.name || "Finish"];
  clearLines();
  line("chosen", S.route.geometry, "#f28b30", 8);
  open("explore");
  updateQuickNav();
  toast("Activity route ready");
}
function displayActivityRoute(a) {
  const coords = (a.samples || []).map((x) => x.pos).filter(Boolean);
  if (coords.length < 2) return;
  clearLines();
  line("activity-display", { type: "LineString", coordinates: coords }, "#f28b30", 7);
  const b = turf.bbox(turf.lineString(coords));
  map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: mobile() ? 45 : { left: 560, right: 45, top: 45, bottom: 45 } });
}
async function attachActivityPhotos(files) {
  if (!S.pendingActivity) return;
  S.pendingActivity.photos = S.pendingActivity.photos || [];
  const remaining = Math.max(0, 6 - S.pendingActivity.photos.length);
  for (const file of files.slice(0, remaining)) S.pendingActivity.photos.push(await compressPhoto(file));
  record();
}
async function addPhotosToSavedActivity(index, files) {
  if (!requireAccount("edit activities")) return;
  const activity = S.accountActivities[index];
  if (!activity) return;
  activity.photos = activity.photos || [activity.photo].filter(Boolean);
  for (const file of files.slice(0, Math.max(0, 6 - activity.photos.length))) activity.photos.push(await compressPhoto(file));
  delete activity.photo;
  await putAccountItem("activities", activity);
  renderActivityDetail(index);
}
async function deleteSavedPhoto(index, photoIndex) {
  if (!requireAccount("edit activities")) return;
  const activity = S.accountActivities[index];
  if (!activity) return;
  activity.photos = (activity.photos || []).filter((_, i) => i !== photoIndex);
  await putAccountItem("activities", activity);
  renderActivityDetail(index);
}
async function renameSavedActivity(index) {
  if (!requireAccount("rename activities")) return;
  const activity = S.accountActivities[index];
  if (!activity) return;
  const name = prompt("Activity name", activity.name || "Cycling activity");
  if (name?.trim()) {
    activity.name = name.trim();
    await putAccountItem("activities", activity);
    renderActivityDetail(index);
  }
}
function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1e3, scale = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.68));
    };
    img.onerror = reject;
    img.src = url;
  });
}
async function savePendingActivity() {
  if (!S.pendingActivity) return;
  if (!requireAccount("save activities")) return;
  S.pendingActivity.name = $("#activityName").value.trim() || S.pendingActivity.name;
  const shareToFeed = $("#shareToFeed")?.checked !== false;
  const saved = await putAccountItem("activities", S.pendingActivity);
  if (shareToFeed) {
    try {
      await publishActivityToFeed(S.user, saved, turf);
    } catch (error) {
      console.warn("Publishing to feed failed; activity is still saved privately", error);
    }
  }
  S.pendingActivity = null;
  toast(shareToFeed ? "Activity saved and shared to your feed" : "Activity saved to your account");
  record();
}
function escapeHtml(v = "") {
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function profileData() {
  return { weight: +localStorage.getItem("profileWeight") || 70, height: +localStorage.getItem("profileHeight") || 175, bikeWeight: +localStorage.getItem("bikeWeight") || 10 };
}
function estimatePower(speedMs, grade = 0, headwind = 0) {
  const p = profileData(), mass = p.weight + p.bikeWeight, g = 9.80665, crr = 6e-3, rho = 1.225, heightM = p.height / 100, area = Math.max(0.28, Math.min(0.55, 0.34 + (heightM - 1.7) * 0.12)), cd = 0.88, air = Math.max(0, speedMs + headwind), rolling = mass * g * crr, climb = mass * g * grade, aero = 0.5 * rho * cd * area * air * air;
  return Math.max(0, (rolling + climb + aero) * speedMs / 0.96);
}
function activityMetrics(r) {
  const samples = r.samples || [], powers = samples.map((x) => x.estimatedPower || 0), avgPower = powers.length ? powers.reduce((a, b) => a + b, 0) / powers.length : 0, maxSpeed = Math.max(0, ...samples.map((x) => (x.speed || 0) * 3.6)), durationHours = r.movingMs / 36e5, effort = Math.round(Math.max(1, avgPower / 100) * durationHours * 60 + (r.gain || 0) / 20 + (r.distance || 0) * 1.5);
  return { avgPower, maxSpeed, effortScore: effort };
}
function ensureUserLocationMarker() {
  if (S.userMarker) return S.userMarker;
  const el = document.createElement("div");
  el.className = "user-location-marker";
  el.innerHTML = '<div class="user-heading-cone"></div><div class="user-location-halo"></div><div class="user-location-dot"></div>';
  S.userMarker = new mapboxgl.Marker({ element: el, anchor: "center", rotationAlignment: "map", pitchAlignment: "map" });
  return S.userMarker;
}
function updateUserLocationVisual(pos, heading = null) {
  if (!Array.isArray(pos)) return;
  const m = ensureUserLocationMarker(), el = m.getElement();
  m.setLngLat(pos);
  if (!m._map) m.addTo(map);
  if (Number.isFinite(heading)) S.visualHeading = heading;
  el.querySelector(".user-heading-cone").style.transform = `translate(-50%,-88%) rotate(${S.visualHeading || 0}deg)`;
}
function watch() {
  if (S.watch !== null) return;
  S.watch = navigator.geolocation.watchPosition((p) => position(p.coords), (e) => toast("Location permission required"), { enableHighAccuracy: true, maximumAge: 1e3, timeout: 15e3 });
}
function position(c) {
  const p = [c.longitude, c.latitude], r = S.record;
  S.pos = p;
  const rawSpeedForHeading = Math.max(0, c.speed || 0);
  const heading = updateTravelHeading(p, void 0, rawSpeedForHeading);
  updateUserLocationVisual(p, heading);
  updateLiveJourney(p, c.accuracy, heading);
  if (S.navState) updateNavigationWaypointProgress(p, c.accuracy);
  if (!r) return;
  const now = Date.now(), rawSpeed = rawSpeedForHeading, moved = r.last ? turf.distance(r.last.pos, p) : 0, isMoving = rawSpeed > 0.6 || moved > 8e-3;
  if (r.manualPaused) {
    r.last = { pos: p, elevation: c.altitude, time: now };
    syncPauseControls();
    return;
  }
  if (isMoving) {
    if (r.paused) {
      r.paused = false;
      r.stationarySince = null;
      r.lastTick = now;
    }
    r.movingMs += Math.max(0, now - r.lastTick);
    if (r.last && moved < 0.25) r.distance += moved;
    if (Number.isFinite(c.altitude) && Number.isFinite(r.last?.elevation) && c.altitude > r.last.elevation) r.gain += c.altitude - r.last.elevation;
    r.speed = rawSpeed;
    r.avgSpeed = r.movingMs > 0 ? r.distance / (r.movingMs / 36e5) : 0;
    r.last = { pos: p, elevation: c.altitude, time: now };
    const prevElevation = r.last?.elevation, segmentM = Math.max(1, moved * 1e3), grade = Number.isFinite(c.altitude) && Number.isFinite(prevElevation) ? Math.max(-0.25, Math.min(0.25, (c.altitude - prevElevation) / segmentM)) : 0, windSpeedKmh = S.windAtPoint?.speed ?? S.wind.speed, estimatedPower = estimatePower(rawSpeed, grade, Math.max(0, windSpeedKmh / 3.6 * 0.25));
    r.samples.push({ pos: p, speed: rawSpeed, elevation: c.altitude, time: now, windSpeed: windSpeedKmh, windDir: S.windAtPoint?.dir ?? S.wind.dir, grade, estimatedPower });
    r.stationarySince = null;
  } else {
    if (!r.stationarySince) r.stationarySince = now;
    if (now - r.stationarySince >= 1e4) r.paused = true;
    r.speed = 0;
  }
  r.lastTick = now;
  if (r.nav && !S.navState?.paused) {
    updateAdaptiveNavigationCamera(p, heading, rawSpeed);
    navigationRouteStyle(p);
    updateNavigationGuidance(p);
    checkRouteDeviation(p, c.accuracy, rawSpeed);
    checkWrongDirection(p, rawSpeed, heading);
  }
  updateLiveDashboard();
  persistActiveSession();
  updateOfflineNavigationStatus();
  if (S.page === "record") record();
}
function updateLiveDashboard() {
  const r = S.record;
  if (!r) return;
  $("#live-speed").textContent = displaySpeed(r).toFixed(1);
  $("#live-speed-label").textContent = r.paused ? "average km/h" : "current km/h";
  $("#live-distance").textContent = r.distance.toFixed(2);
  $("#live-gain").textContent = Math.round(r.gain);
  $("#live-time").textContent = formatClock(r.movingMs);
  updateQuickNav();
}
function displaySpeed(r) {
  return r.paused ? r.avgSpeed : r.speed * 3.6;
}
function formatClock(ms) {
  const s = Math.floor(ms / 1e3), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
function navigationCameraTarget(pos, heading, speedMps = 0) {
  const nav = S.navState, steps = nav?.steps || [], index = Math.max(0, nav?.index || 0), next = steps[index], nextLocation = next?.maneuver?.location, turnDistance = nextLocation ? turf.distance(pos, nextLocation, { units: "meters" }) : Infinity, nearby = steps.slice(index, index + 5).filter((step) => step.maneuver?.location && turf.distance(pos, step.maneuver.location, { units: "meters" }) <= 320).length, type = String(next?.maneuver?.type || "").toLowerCase(), modifier = String(next?.maneuver?.modifier || "").toLowerCase(), complex = /roundabout|rotary|fork|merge|off ramp|on ramp|arrive/.test(type) || /sharp|uturn/.test(modifier) || nearby >= 3;
  let state = "normal", zoom = 16.15, pitch = 49;
  if (complex || turnDistance < 90) {
    state = "complex";
    zoom = 17.35;
    pitch = 59;
  } else if (turnDistance < 220) {
    state = "approach";
    zoom = 16.85;
    pitch = 56;
  } else if (turnDistance < 550) {
    state = "prepare";
    zoom = 16.35;
    pitch = 52;
  } else if (turnDistance > 1800) {
    state = "cruise";
    zoom = 15.15;
    pitch = 42;
  } else if (turnDistance > 900) {
    state = "open";
    zoom = 15.55;
    pitch = 46;
  }
  const speedKmh = Math.max(0, speedMps * 3.6);
  if (speedKmh > 30) zoom -= 0.28;
  else if (speedKmh < 12 && (state === "complex" || state === "approach")) zoom += 0.16;
  if (S.navCamera.postTurnUntil > Date.now()) {
    state = "post-turn";
    zoom = Math.max(16.7, zoom);
    pitch = Math.max(54, pitch);
  }
  const bearing = Number.isFinite(heading) ? heading : nextLocation ? turf.bearing(pos, nextLocation) : map.getBearing();
  return { state, zoom: Math.max(14.8, Math.min(17.65, zoom)), pitch, bearing, turnDistance, stepIndex: index };
}
function updateAdaptiveNavigationCamera(pos, heading, speedMps = 0, force = false) {
  if (!S.navState || Date.now() < S.manualExploreUntil) return;
  const now = Date.now(), target = navigationCameraTarget(pos, heading, speedMps), camera = S.navCamera;
  if (target.stepIndex !== camera.lastStep && camera.lastStep >= 0) camera.postTurnUntil = now + 4500;
  camera.lastStep = target.stepIndex;
  if (!force && now - camera.lastAt < 1200) return;
  if (!force && Math.abs(target.zoom - camera.zoom) < 0.14 && target.state === camera.state && now - camera.lastAt < 2600) return;
  camera.lastAt = now;
  camera.zoom = target.zoom;
  camera.state = target.state;
  map.easeTo({ center: pos, zoom: target.zoom, pitch: target.pitch, bearing: target.bearing, duration: force ? 650 : 780, essential: true });
}
function updateNavigationGuidance(pos) {
  const n = S.navState, r = S.route;
  if (!n || !r || n.paused) return;
  const lineString = turf.lineString(r.geometry.coordinates), snap = turf.nearestPointOnLine(lineString, turf.point(pos), { units: "kilometers" }), travelled = (snap.properties.location || 0) * 1e3, remaining = Math.max(0, (r.distance || 0) - travelled);
  let chosen = n.steps.at(-1), idx = n.steps.length - 1;
  for (let i = n.index; i < n.steps.length; i++) {
    const loc = n.steps[i].maneuver?.location;
    if (loc && turf.distance(pos, loc, { units: "meters" }) > 12) {
      chosen = n.steps[i];
      idx = i;
      break;
    }
  }
  n.index = idx;
  const turnDistance = chosen?.maneuver?.location ? turf.distance(pos, chosen.maneuver.location, { units: "meters" }) : remaining, instruction = chosen?.maneuver?.instruction || chosen?.name || "Continue on route", lanes = laneText(chosen), arrow = turnArrow(chosen?.maneuver);
  $("#nav-instruction").textContent = instruction;
  $("#nav-next-distance").textContent = `${formatDistance(turnDistance)} to next turn`;
  $("#nav-lane").textContent = lanes;
  $("#nav-lane").style.display = lanes ? "block" : "none";
  $("#nav-arrow").textContent = arrow;
  $("#nav-remaining").textContent = `${formatDistance(remaining)} remaining`;
  const speed = Math.max(8, S.record?.avgSpeed || r.distance / 1e3 / (r.duration / 3600) || 18), mins = Math.ceil(remaining / 1e3 / speed * 60);
  $("#nav-eta").textContent = mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} min left` : `${mins} min left`;
  voiceGuidance(idx, instruction, turnDistance);
}
function voiceGuidance(stepIndex, instruction, distance) {
  let band = distance <= 35 ? "now" : distance <= 120 ? "soon" : distance <= 500 ? "advance" : "";
  if (!band) return;
  const key = `${stepIndex}:${band}`;
  if (key === S.lastVoiceKey) return;
  S.lastVoiceKey = key;
  const text = band === "now" ? `${instruction} now` : band === "soon" ? `In ${formatDistance(distance)}, ${instruction}` : `In ${formatDistance(distance)}, ${instruction}`;
  speak(text);
}
function speak(text) {
  if (!S.audioNavigation || !S.audioUnlocked || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = navigator.language || "en-GB";
  speechSynthesis.cancel();
  speechSynthesis.resume();
  setTimeout(() => speechSynthesis.speak(u), 40);
}
function adaptiveOffRouteThreshold(accuracy) {
  return Math.max(25, Math.min(60, 2.5 * (Number.isFinite(accuracy) ? accuracy : 30)));
}
function adaptiveRerouteConfirmMs(speedMps) {
  const speedKmh = Math.max(0, speedMps * 3.6);
  return Math.max(3e3, Math.min(8e3, 8e3 - speedKmh * 100));
}
async function checkRouteDeviation(pos, accuracy = 30, speedMps = 0) {
  const n = S.navState, r = S.route;
  if (!n || n.recalculating || Date.now() - S.lastRerouteAt < 12e3) return;
  const snap = turf.nearestPointOnLine(turf.lineString(r.geometry.coordinates), turf.point(pos), { units: "meters" }), off = snap.properties.dist || 0;
  if (off > adaptiveOffRouteThreshold(accuracy)) {
    if (!n.offRouteSince) {
      n.offRouteSince = Date.now();
      prefetchReroute(pos);
    }
    if (Date.now() - n.offRouteSince > adaptiveRerouteConfirmMs(speedMps)) await recalculateFrom(pos);
  } else {
    n.offRouteSince = null;
    n.rerouteSpeculative = null;
  }
}
async function fetchRerouteRoute(pos) {
  const nav = S.navState;
  let remaining = remainingNavigationWaypoints();
  if (!remaining.length) {
    const destination = S.route.geometry.coordinates.at(-1);
    if (turf.distance(pos, destination) > 0.03) remaining = [destination];
  }
  const via = dedupeNavigationPoints([pos, ...remaining]).slice(0, 24);
  if (via.length < 2) throw new Error("No remaining destination");
  const coordinates = via.map((point) => point.join(",")).join(";"), response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/cycling/${coordinates}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`), data = await response.json(), route = data.routes?.[0];
  if (!response.ok || !route) throw new Error(data.message || "No reroute");
  route._requestPoints = structuredClone(via);
  route._rerouteRemaining = remaining;
  return route;
}
function prefetchReroute(pos) {
  const nav = S.navState;
  if (!nav || nav.rerouteSpeculative) return;
  nav.rerouteSpeculative = { startedAt: Date.now(), promise: fetchRerouteRoute(pos).catch(() => null) };
}
function crossfadeRouteLine(newGeometry, color, width, onDone) {
  const tempId = "chosen-incoming";
  if (map.getLayer(tempId)) map.removeLayer(tempId);
  if (map.getSource(tempId)) map.removeSource(tempId);
  map.addSource(tempId, { type: "geojson", data: { type: "Feature", geometry: newGeometry, properties: {} } });
  map.addLayer({ id: tempId, type: "line", source: tempId, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": width, "line-opacity": 0 } });
  const duration = 400, start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    if (map.getLayer("chosen")) map.setPaintProperty("chosen", "line-opacity", 0.9 * (1 - t));
    if (map.getLayer(tempId)) map.setPaintProperty(tempId, "line-opacity", 0.9 * t);
    if (t < 1) requestAnimationFrame(step);
    else {
      clearLines();
      line("chosen", newGeometry, color, width);
      onDone?.();
    }
  }
  requestAnimationFrame(step);
}
async function recalculateFrom(pos) {
  const nav = S.navState;
  if (!nav || nav.recalculating) return;
  nav.recalculating = true;
  S.lastRerouteAt = Date.now();
  speak("You are off route. Recalculating through your remaining waypoints.");
  toast("Off route \xB7 preserving remaining waypoints\u2026");
  try {
    let route, remaining;
    const speculative = nav.rerouteSpeculative;
    if (speculative && Date.now() - speculative.startedAt < 8e3) {
      route = await speculative.promise;
    }
    if (!route) route = await fetchRerouteRoute(pos);
    remaining = route._rerouteRemaining || remainingNavigationWaypoints();
    nav.rerouteSpeculative = null;
    const previous = S.route;
    route.requiredNavigationWaypoints = structuredClone(nav.requiredWaypoints || previous?.requiredNavigationWaypoints || remaining);
    route.requiredWaypointNames = structuredClone(previous?.requiredWaypointNames || []);
    route.waypointEfficient = previous?.waypointEfficient;
    route.qualityLabel = previous?.qualityLabel;
    route.rangeStatus = previous?.rangeStatus;
    route.savedName = previous?.savedName;
    S.route = { ...route, elev: previous?.elev || [], wind: previous?.wind || [], ascent: previous?.ascent };
    S.routes[S.selected ?? 0] = S.route;
    S.selected = S.selected ?? 0;
    nav.steps = route.legs?.flatMap((leg) => leg.steps || []) || [];
    nav.index = 0;
    nav.totalDistance = route.distance;
    nav.totalDuration = route.duration;
    nav.offRouteSince = null;
    S.lastVoiceKey = "";
    crossfadeRouteLine(route.geometry, colors[S.selected % colors.length], 8, showNavigationAlternatives);
    speak(remaining.length > 1 ? "New route ready. Your remaining waypoints are preserved." : "New route ready. Continue to the highlighted route.");
    toast(remaining.length > 1 ? `${remaining.length - 1} waypoint${remaining.length === 2 ? "" : "s"} still required` : "Reroute ready");
    updateNavigationGuidance(pos);
    persistActiveSession(true);
  } catch (error) {
    console.error("Waypoint-preserving reroute failed", error);
    toast("Could not recalculate through the remaining waypoints");
  } finally {
    nav.recalculating = false;
  }
}
function laneText(step) {
  const lanes = step?.intersections?.flatMap((i) => i.lanes || []).filter((l) => l.valid || l.active);
  if (lanes?.length) return `Use ${lanes.map((l) => (l.indications || []).join("/")).filter(Boolean).join(", ")} lane`;
  const road = step?.name || step?.ref;
  return road ? `Continue toward ${road}` : "";
}
function turnArrow(m = {}) {
  const mod = m.modifier || "", type = m.type || "";
  if (type === "roundabout" || type === "rotary") return "\u21BB";
  if (mod.includes("left")) return mod.includes("slight") ? "\u2196" : "\u2190";
  if (mod.includes("right")) return mod.includes("slight") ? "\u2197" : "\u2192";
  if (mod.includes("uturn")) return "\u21A9";
  return "\u2191";
}
function formatDistance(m) {
  return m >= 1e3 ? `${(m / 1e3).toFixed(m >= 1e4 ? 0 : 1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`;
}
function stopRecording() {
  finishRecord(false);
}
function endNavigation() {
  finishRecord(true);
}
async function finishRecord(endNav = true) {
  const r = S.record;
  if (!r) return;
  if (S.watch !== null) navigator.geolocation.clearWatch(S.watch);
  S.watch = null;
  const startPos = r.samples?.[0]?.pos, endPos = r.samples?.at(-1)?.pos;
  let defaultName = S.names.length ? `${S.names[0]} to ${S.names.at(-1)}` : "Cycling activity";
  if ((!S.names.length || defaultName === "Cycling activity") && startPos && endPos) {
    try {
      const names = await Promise.all([startPos, endPos].map((p) => fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${p.join(",")}.json?limit=1&access_token=${MAPBOX_TOKEN}`).then((x) => x.json()).then((d) => d.features?.[0]?.text || "Start")));
      defaultName = `${names[0]} to ${names[1]}`;
    } catch {
    }
  }
  const metrics = activityMetrics(r);
  S.pendingActivity = { ...r, ...metrics, id: crypto.randomUUID(), name: defaultName, ended: Date.now(), elapsed: r.movingMs, avgSpeed: r.movingMs > 0 ? r.distance / (r.movingMs / 36e5) : 0, photos: [] };
  S.record = null;
  clearActiveSession();
  clearLines();
  S.routes = [];
  S.route = null;
  S.selected = null;
  await releaseScreenWakeLock();
  if (endNav) {
    S.navState = null;
    $("#nav-guidance").hidden = true;
    window.speechSynthesis?.cancel();
  }
  updateQuickNav();
  S.page = "record";
  document.body.classList.add("panel-open");
  render();
  toast("Ride complete. Name it and add a photo.");
}
async function shareSavedActivity(a) {
  const text = `${a.name}: ${a.distance.toFixed(1)} km, ${Math.round(a.gain || 0)} m climbing, ${a.avgSpeed.toFixed(1)} km/h, effort ${Math.round(a.effortScore || 0)}.`;
  try {
    const blob = await activityPngBlob(a), file = new File([blob], `${safeName(a.name)}.png`, { type: "image/png" }), data = { title: a.name, text, files: [file] };
    if (navigator.canShare?.({ files: [file] })) await navigator.share(data);
    else if (navigator.share) await navigator.share({ title: a.name, text });
    else {
      await navigator.clipboard.writeText(text);
      toast("Activity summary copied");
    }
  } catch (e) {
    if (e.name !== "AbortError") {
      console.error(e);
      toast("Could not share activity");
    }
  }
}
async function exportActivityPng(a) {
  const blob = await activityPngBlob(a), url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url;
  link.download = `${safeName(a.name)}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
async function activityPngBlob(a) {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 1080, 1350);
  g.addColorStop(0, "#15324d");
  g.addColorStop(1, "#176bdb");
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#fff";
  x.font = "700 48px system-ui";
  x.fillText("RIDEWISE", 60, 78);
  x.font = "800 58px system-ui";
  wrapCanvasText(x, a.name || "Cycling activity", 60, 160, 950, 68);
  x.font = "800 82px system-ui";
  x.fillText(`${a.distance.toFixed(1)} KM`, 60, 300);
  x.font = "32px system-ui";
  x.fillText(`${a.avgSpeed.toFixed(1)} km/h avg   \xB7   ${Math.round(a.gain || 0)} m climbing`, 60, 350);
  x.fillText(`${Math.round(a.avgPower || 0)} W estimated   \xB7   effort ${Math.round(a.effortScore || 0)}`, 60, 395);
  try {
    x.drawImage(map.getCanvas(), 60, 445, 960, 570);
  } catch {
  }
  const photo = (a.photos || [])[0];
  if (photo) {
    try {
      const img = await loadImage(photo);
      x.drawImage(img, 60, 1040, 300, 230);
    } catch {
    }
  }
  x.fillStyle = "#fff";
  x.font = "26px system-ui";
  x.fillText("Ride planned and recorded with Ridewise", 60, 1320);
  return new Promise((resolve) => c.toBlob(resolve, "image/png", 0.92));
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}
function safeName(n = "activity") {
  return n.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "activity";
}
function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line2 = "";
  for (const word of words) {
    const test = line2 + word + " ";
    if (ctx.measureText(test).width > maxWidth && line2) {
      ctx.fillText(line2, x, y);
      line2 = word + " ";
      y += lineHeight;
    } else line2 = test;
  }
  ctx.fillText(line2, x, y);
}
function routes() {
  if (!S.user) {
    panel.innerHTML = head("Routes", "Account-specific saved routes") + '<div class="card account-required"><h2>Sign in required</h2><p>Saved routes are private to your account and synchronise across signed-in devices.</p><button class="btn primary" id="routeSignIn">Sign in</button></div>';
    $("#routeSignIn").onclick = () => open("profile");
    return;
  }
  const saved = S.accountRoutes;
  panel.innerHTML = head("Routes", "Saved, editable and ready to ride") + `<div class="saved-routes-toolbar"><label class="btn primary file-label">Import GPX<input id="importGpx" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden></label><span>${saved.length} saved route${saved.length === 1 ? "" : "s"}</span></div><div class="saved-route-grid">${saved.length ? saved.map((item, i) => {
    const route = item.route || {}, badges = savedRouteBadges(item), color = colors[i % colors.length], cycle = Number.isFinite(route.cycleScore) ? route.cycleScore : 0;
    return `<article class="saved-route-card" style="--saved-color:${color}"><div class="saved-route-accent"></div><div class="saved-route-head"><div><small>${escapeHtml(savedRouteDate(item))}</small><h2>${escapeHtml(item.name || "Saved route")}</h2></div><button class="saved-route-menu" data-rename="${i}" title="Rename route">\u270E</button></div><div class="saved-route-badges">${badges.length ? badges.map((b) => `<span>${escapeHtml(b)}</span>`).join("") : "<span>Saved cycling route</span>"}</div><div class="saved-route-stats"><div><b>${fmt((route.distance || 0) / 1e3)}</b><small>km</small></div><div><b>${Math.round((route.duration || 0) / 60)}</b><small>min</small></div><div><b>${Math.round(route.ascent || 0)}</b><small>climb m</small></div><div><b>${cycle}%</b><small>cycle cues</small></div></div><div class="saved-route-profiles"><div><small>Elevation</small>${savedRouteMiniChart(route.elev, "#16a36d")}</div><div><small>Wind</small>${savedRouteMiniChart(route.wind, "#176bdb")}</div></div><div class="saved-route-summary">${route.qualityLabel ? escapeHtml(route.qualityLabel) : item.mode === "loop" ? "Saved Adventure loop" : "Saved route"}${route.rangeStatus ? ` \xB7 ${escapeHtml(route.rangeStatus)}` : ""}</div><div class="saved-route-actions"><button class="btn primary" data-open="${i}">Open & edit</button><button data-share-saved="${i}">\u2197 Share</button><button data-preview-saved="${i}">\u25B6 Preview</button><button data-gpx="${i}">GPX</button><button data-delete="${i}" class="danger-soft">Delete</button></div></article>`;
  }).join("") : '<div class="empty saved-route-empty"><b>No saved routes yet</b><span>Save an Adventure or point-to-point route to edit it later.</span></div>'}</div>`;
  $("#importGpx").onchange = (e) => importGpxFile(e.target.files[0]);
  panel.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => loadSavedRoute(saved[+b.dataset.open], true));
  panel.querySelectorAll("[data-rename]").forEach((b) => b.onclick = () => renameSavedRoute(saved, +b.dataset.rename));
  panel.querySelectorAll("[data-share-saved]").forEach((b) => b.onclick = () => shareSavedRouteByIndex(+b.dataset.shareSaved));
  panel.querySelectorAll("[data-preview-saved]").forEach((b) => b.onclick = () => {
    loadSavedRoute(saved[+b.dataset.previewSaved], false);
    previewRoute3D();
  });
  panel.querySelectorAll("[data-gpx]").forEach((b) => b.onclick = () => {
    loadSavedRoute(saved[+b.dataset.gpx], false);
    exportSelectedRouteGpx();
  });
  panel.querySelectorAll("[data-delete]").forEach((b) => b.onclick = () => {
    if (!confirm("Delete this saved route?")) return;
    deleteAccountItem("routes", saved[+b.dataset.delete].id).then(routes);
  });
}
async function importGpxFile(file) {
  if (!file) return;
  if (!requireAccount("import and save routes")) return;
  try {
    const text = await file.text(), xml = new DOMParser().parseFromString(text, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("Invalid GPX XML");
    let points = [...xml.querySelectorAll("trkpt")];
    if (points.length < 2) points = [...xml.querySelectorAll("rtept")];
    const coords = points.map((p) => [+p.getAttribute("lon"), +p.getAttribute("lat")]).filter((p) => p.every(Number.isFinite));
    if (coords.length < 2) throw new Error("No track or route points");
    const geometry = { type: "LineString", coordinates: coords }, distance = turf.length(turf.lineString(coords), { units: "kilometers" }) * 1e3, elev = points.map((p) => +p.querySelector("ele")?.textContent).filter(Number.isFinite), name = xml.querySelector("trk>name,rte>name,metadata>name")?.textContent?.trim() || file.name.replace(/\.gpx$/i, "");
    const route = { geometry, distance, duration: 0, elev, ascent: gain(elev), legs: [], cycleScore: 0, imported: true };
    const item = await putAccountItem("routes", { id: crypto.randomUUID(), name, route, names: [name], waypoints: [coords[0], coords.at(-1)], mode: "point", importedAt: Date.now() });
    loadSavedRoute(item);
    toast("GPX imported to your account");
    routes();
  } catch (error) {
    console.error(error);
    toast(`GPX import failed: ${error.message}`);
  }
}
function absoluteAppUrl(params = {}) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== void 0 && value !== "") url.searchParams.set(key, String(value));
  return url.toString();
}
async function copyShareUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast("Share URL copied");
  } catch {
    prompt("Copy share URL", url);
  }
}
function showUrlShareWindow(title, url, text = "") {
  const box = createChoiceModal(title, `<p>${escapeHtml(text)}</p><label class="share-link-label">Share URL</label><div class="share-link-row"><input id="shareUrlValue" value="${escapeHtml(url)}" readonly><button id="copyShareUrl">Copy</button></div><button class="btn primary" id="nativeShareUrl">Share URL</button><button class="btn light" id="openShareUrl">Open URL</button>`), input = $("#shareUrlValue");
  input.onclick = () => input.select();
  $("#copyShareUrl").onclick = () => copyShareUrl(url);
  $("#nativeShareUrl").onclick = async () => {
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else await copyShareUrl(url);
    } catch (error) {
      if (error?.name !== "AbortError") await copyShareUrl(url);
    }
  };
  $("#openShareUrl").onclick = () => window.open(url, "_blank", "noopener,noreferrer");
  return box;
}
async function createSharedRouteUrl(route, title = "Ridewise route") {
  if (!route) return null;
  try {
    const db = await getCloud(), payload = { title, ownerId: S.user?.uid || null, payloadJson: JSON.stringify(route), createdAt: db.serverTimestamp() }, ref = await db.addDoc(db.collection(db.firestore, "shared_routes_v1"), payload);
    return absoluteAppUrl({ sharedRoute: ref.id });
  } catch (error) {
    console.warn("Cloud route sharing unavailable", error);
    const compact = { geometry: route.geometry, distance: route.distance, duration: route.duration, name: title };
    try {
      return absoluteAppUrl({ routeData: btoa(unescape(encodeURIComponent(JSON.stringify(compact)))) });
    } catch {
      return absoluteAppUrl();
    }
  }
}
async function shareRouteObject(route, title = "Ridewise route") {
  if (!route) return toast("Select a route first");
  toast("Creating share URL\u2026");
  const url = await createSharedRouteUrl(route, title), description = `${fmt((route.distance || 0) / 1e3)} km Ridewise cycling route`;
  showUrlShareWindow("Share route URL", url, description);
}
async function shareRouteByIndex(index) {
  const route = S.routes[index];
  if (!route) return toast("Select a route first");
  return shareRouteObject(route, route.savedName || route.name || `Ridewise route ${index + 1}`);
}
async function shareSavedRouteByIndex(index) {
  const item = S.accountRoutes[index];
  if (!item?.route) return toast("Saved route unavailable");
  return shareRouteObject(item.route, item.name || "Saved Ridewise route");
}
async function showLiveJourneyShare() {
  if (!S.liveJourney?.id) return toast("Start live navigation sharing first");
  const url = absoluteAppUrl({ journey: S.liveJourney.id });
  showUrlShareWindow("Share live navigation URL", url, "Follow this live Ridewise journey");
}
var resolveAuthReady;
var authReady = new Promise((resolve) => {
  resolveAuthReady = resolve;
});
async function loadSharedRouteFromUrl() {
  const params = new URLSearchParams(location.search), id = params.get("sharedRoute"), inline = params.get("routeData");
  if (!id && !inline || S.sharedRouteLoaded || S.sharedRouteLoading) return;
  S.sharedRouteLoading = true;
  try {
    if (id) {
      const user = await authReady;
      if (!user) {
        S.sharedRouteLoading = false;
        open("profile");
        toast("Sign in to open this shared route URL");
        return;
      }
    }
    let route;
    if (id) {
      const db = await getCloud(), reference = db.doc(db.firestore, "shared_routes_v1", id), snapshot = await db.getDoc(reference);
      if (!snapshot.exists()) throw new Error("Shared route not found");
      const data = snapshot.data();
      route = JSON.parse(data.payloadJson);
    } else route = JSON.parse(decodeURIComponent(escape(atob(inline))));
    if (!route?.geometry?.coordinates?.length) throw new Error("Invalid shared route");
    S.route = route;
    S.routes = [route];
    S.selected = 0;
    S.mode = "point";
    S.sharedRouteLoaded = true;
    clearLines();
    line("chosen", route.geometry, colors[0], 8);
    open("explore");
    cards();
    updateQuickNav();
    toast("Shared route opened");
  } catch (error) {
    console.error("Shared route open failed", error);
    if (error?.code === "permission-denied") {
      toast("Authentication is still restoring \xB7 retrying shared route");
      S.sharedRouteLoading = false;
      setTimeout(loadSharedRouteFromUrl, 900);
      return;
    }
    toast("Could not open shared route URL");
  } finally {
    if (S.sharedRouteLoaded || S.sharedRouteLoading) S.sharedRouteLoading = false;
  }
}
function createChoiceModal(title, body) {
  document.querySelector(".share-choice,.map-location-menu")?.remove();
  const box = document.createElement("div");
  box.className = "share-choice";
  box.innerHTML = `<button class="popup-close" aria-label="Close">\xD7</button><b>${escapeHtml(title)}</b>${body}`;
  $("#map-wrap").appendChild(box);
  box.querySelector(".popup-close").onclick = () => box.remove();
  return box;
}
function openMapShareMenu() {
  const box = createChoiceModal("Share URL", '<p>Choose what the URL should open.</p><button id="shareCurrentRoute">Selected route URL</button><button id="shareProgress">Live navigation URL</button>');
  $("#shareCurrentRoute").onclick = async () => {
    if (S.selected === null || !S.route) return toast("Select a route first");
    box.remove();
    await shareRouteByIndex(S.selected);
  };
  $("#shareProgress").onclick = async () => {
    if (!S.route) return toast("Select a route first");
    if (!S.user) {
      box.remove();
      open("profile");
      toast("Sign in to share live navigation");
      return;
    }
    if (!S.record) {
      const started = await startNavigation();
      if (started === false) return;
    }
    if (!S.liveJourney) await startLiveJourney();
    box.remove();
    await showLiveJourneyShare();
  };
}
function openGoogleMapsLocation(lngLat, threeD = false) {
  const [lng, lat] = lngLat;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return toast("Invalid map location");
  const standard = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`, threeDUrl = `https://www.google.com/maps/@${lat},${lng},250a,35y,0h,60t/data=!3m1!1e3`;
  const win = window.open(threeD ? threeDUrl : standard, "_blank", "noopener,noreferrer");
  if (!win) toast("Allow pop-ups to open Google Maps");
}
function showMapLocationMenu(lngLat) {
  document.querySelector(".map-location-menu")?.remove();
  const box = document.createElement("div");
  box.className = "map-location-menu";
  box.innerHTML = '<button class="popup-close" aria-label="Close">\xD7</button><b>Use this location</b><button id="navigateHere">Navigate there</button><button id="addMapWaypoint">Add as waypoint</button><button id="googleMapView">View in Google Maps</button><button id="googleMap3d">View in Google Maps 3D</button><button id="copyMapCoordinates">Copy coordinates</button>';
  box.querySelector(".popup-close").onclick = () => box.remove();
  $("#map-wrap").appendChild(box);
  const close = () => box.remove();
  $("#navigateHere").onclick = async () => {
    const start = S.pos || await current();
    if (!start) return;
    S.mode = "point";
    S.waypoints = [start, lngLat];
    S.names = ["Current location", "Dropped pin"];
    await pointRoutes(false);
    open("explore");
    close();
  };
  $("#addMapWaypoint").onclick = () => {
    if (S.mode === "loop") {
      S.adventureWaypoints.push({ coord: lngLat, name: "Dropped pin" });
      toast("Adventure waypoint added");
    } else {
      if (S.waypoints.length < 2) S.waypoints = [S.waypoints[0] || null, S.waypoints[1] || null];
      S.waypoints.splice(Math.max(1, S.waypoints.length - 1), 0, lngLat);
      S.names.splice(Math.max(1, S.names.length - 1), 0, "Dropped pin");
      toast("Waypoint added");
    }
    markers();
    close();
  };
  $("#googleMapView").onclick = () => {
    openGoogleMapsLocation(lngLat, false);
    close();
  };
  $("#googleMap3d").onclick = () => {
    openGoogleMapsLocation(lngLat, true);
    close();
  };
  $("#copyMapCoordinates").onclick = async () => {
    const value = `${lngLat[1].toFixed(6)}, ${lngLat[0].toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(value);
      toast("Coordinates copied");
    } catch {
      prompt("Copy coordinates", value);
    }
    close();
  };
}
function installMapLocationGestures() {
  map.on("contextmenu", (e) => showMapLocationMenu(e.lngLat.toArray()));
  let timer;
  map.getCanvas().addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    timer = setTimeout(() => showMapLocationMenu(map.unproject([t.clientX, t.clientY]).toArray()), 650);
  }, { passive: true });
  ["touchend", "touchmove", "touchcancel"].forEach((n) => map.getCanvas().addEventListener(n, () => clearTimeout(timer), { passive: true }));
}
var XWEATHER_ICON_BASE = "https://cdn.aerisapi.com/wxblox/icons/";
function weatherIconName(item) {
  const raw = String(item?.icon || "").split("/").pop().toLowerCase();
  if (/^[a-z0-9_-]+\.png$/.test(raw)) return raw;
  const d = String(item?.desc || "").toLowerCase(), night = new Date((item?.time || Date.now() / 1e3) * 1e3).getHours() < 6 || new Date((item?.time || Date.now() / 1e3) * 1e3).getHours() >= 20, n = night ? "n" : "";
  if (/thunder/.test(d)) return `tstorm${n}.png`;
  if (/snow|sleet|wintry/.test(d)) return `snow${n}.png`;
  if (/shower/.test(d)) return `showers${n}.png`;
  if (/rain|drizzle/.test(d)) return `rain${n}.png`;
  if (/fog|mist|haze/.test(d)) return `fog${n}.png`;
  if (/mostly cloudy/.test(d)) return `mcloudy${n}.png`;
  if (/partly cloudy/.test(d)) return `pcloudy${n}.png`;
  if (/cloud/.test(d)) return `cloudy${n}.png`;
  return night ? "clearn.png" : "sunny.png";
}
function weatherIconUrl(item) {
  return XWEATHER_ICON_BASE + weatherIconName(item);
}
function weatherMetric(icon, value, label, accent = "") {
  return `<div class="weather-metric ${accent}"><span class="weather-metric-icon">${icon}</span><b>${value}</b><small>${label}</small></div>`;
}
function groupHourlyByDay(items = []) {
  const groups = /* @__PURE__ */ new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !Number.isFinite(Number(item.time))) continue;
    const date = new Date(Number(item.time) * 1e3), key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!groups.has(key)) groups.set(key, { label: date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" }), items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()].slice(0, 4);
}
async function weather() {
  if (!S.weather) await loadWeather();
  const w = S.weather;
  if (!w) {
    panel.innerHTML = head("Weather", "Current weather") + '<div class="empty">Weather unavailable</div>';
    return;
  }
  const groups = groupHourlyByDay(S.hourlyWeather), rainNow = Math.round(S.hourlyWeather[0]?.probability || 0);
  panel.innerHTML = head("Weather", `Live conditions from ${w.source}`) + `<div class="weather-hero card"><div class="weather-hero-main"><img src="${weatherIconUrl(w)}" alt="${escapeHtml(w.desc || "Weather")}" class="weather-main-icon"><div><span class="weather-kicker">NOW</span><h2>${Math.round(w.temp)}\xB0C</h2><strong>${escapeHtml(w.desc || "Current conditions")}</strong><small>Feels like ${Math.round(w.feelsLike ?? w.temp)}\xB0C</small></div></div><div class="weather-metrics">${weatherMetric("\u2197", cardinalDirection(w.bearing), "wind direction", "wind")}${weatherMetric("\u2248", `${(w.speed * 3.6).toFixed(1)} km/h`, "mean wind", "wind")}${weatherMetric("\u224B", `${(w.gust * 3.6).toFixed(1)} km/h`, "gust", "gust")}${weatherMetric("\u{1F4A7}", `${rainNow}%`, "rain chance", "rain")}</div></div>${groups.map((day) => `<div class="weather-day card"><div class="weather-day-head"><div><span class="weather-kicker">FORECAST</span><h3>${day.label}</h3></div><span>${day.items.length} hours</span></div><div class="hourly weather-hourly">${day.items.map((x) => `<div class="hour weather-hour"><small class="weather-time">${new Date(x.time * 1e3).toLocaleTimeString([], { hour: "2-digit" })}</small><img src="${weatherIconUrl(x)}" alt="${escapeHtml(x.desc || "Weather")}" class="weather-hour-icon"><b>${Math.round(x.temp)}\xB0</b><span>${escapeHtml(x.desc || "")}</span><small class="weather-wind"><i style="transform:rotate(${Number(x.bearing) || 0}deg)">\u2191</i>${cardinalDirection(x.bearing)} ${(x.speed * 3.6).toFixed(0)}</small><small class="weather-rain">\u{1F4A7} ${Math.round(x.probability || 0)}%</small></div>`).join("")}</div></div>`).join("")}<button class="btn primary weather-map-button" id="toggleWind">${S.weatherOn ? "Hide" : "Show"} radar + wind</button>`;
  $("#toggleWind").onclick = toggleWeather;
}
async function loadWeather() {
  const p = map.getCenter(), [current2, hourly] = await Promise.all([fetchWindAtLocation(p.lat, p.lng), fetchHourlyForecast(p.lat, p.lng, 72)]);
  S.weather = current2;
  S.hourlyWeather = hourly || [];
  if (current2) S.wind = { speed: current2.speed * 3.6, dir: current2.bearing };
  await refreshWindGrid(true);
}
async function toggleWeather() {
  S.weatherOn = !S.weatherOn;
  $("#weather").classList.toggle("active", S.weatherOn);
  if (S.weatherOn) {
    if (!S.weather) await loadWeather();
    else await refreshWindGrid(true);
    await radar();
    windStart();
  } else {
    if (map.getLayer("radar")) map.removeLayer("radar");
    if (map.getSource("radar")) map.removeSource("radar");
    windStop();
  }
  if (S.page === "weather") weather();
}
async function radar() {
  try {
    const d = await fetch("https://api.rainviewer.com/public/weather-maps.json").then((r) => r.json()), f = d.radar.past.at(-1);
    if (map.getLayer("radar")) map.removeLayer("radar");
    if (map.getSource("radar")) map.removeSource("radar");
    map.addSource("radar", { type: "raster", tiles: [`${d.host}${f.path}/512/{z}/{x}/{y}/2/1_1.png`], tileSize: 512, maxzoom: 7 });
    map.addLayer({ id: "radar", type: "raster", source: "radar", paint: { "raster-opacity": 0.3 } });
  } catch {
    toast("Radar unavailable");
  }
}
async function refreshWindGrid(force = false) {
  if (S.windLoading) return;
  const b = map.getBounds(), zoom = map.getZoom(), cols = zoom < 5 ? 8 : zoom < 8 ? 7 : 6, rows = zoom < 5 ? 6 : zoom < 8 ? 5 : 4, key = [b.getWest().toFixed(1), b.getSouth().toFixed(1), b.getEast().toFixed(1), b.getNorth().toFixed(1), cols, rows].join("|");
  if (!force && key === S.windGridKey) return;
  S.windLoading = true;
  try {
    const lats = [], lons = [];
    for (let y = 0; y < rows; y++) {
      const fy = y / (rows - 1);
      for (let x = 0; x < cols; x++) {
        const fx = x / (cols - 1);
        lons.push(wrapLng(b.getWest() + (b.getEast() - b.getWest()) * fx));
        lats.push(b.getNorth() + (b.getSouth() - b.getNorth()) * fy);
      }
    }
    const q = new URLSearchParams({ latitude: lats.join(","), longitude: lons.join(","), current: "wind_speed_10m,wind_direction_10m" }), data = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then((r) => r.json()), items = Array.isArray(data) ? data : [data];
    S.windGrid = { cols, rows, bounds: { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() }, cells: items.map((d, i) => ({ speed: d?.current?.wind_speed_10m ?? S.wind.speed, dir: d?.current?.wind_direction_10m ?? S.wind.dir, lat: lats[i], lng: lons[i] })) };
    S.windGridKey = key;
  } catch (e) {
    console.warn("Spatial wind grid unavailable, using centre wind:", e);
    S.windGrid = null;
  } finally {
    S.windLoading = false;
  }
}
function wrapLng(lng) {
  return (lng + 540) % 360 - 180;
}
function windAtScreen(x, y, width, height) {
  const g = S.windGrid;
  if (!g?.cells?.length) return { speed: S.wind.speed, dir: S.wind.dir };
  const gx = Math.max(0, Math.min(g.cols - 1, x / Math.max(1, width) * (g.cols - 1))), gy = Math.max(0, Math.min(g.rows - 1, y / Math.max(1, height) * (g.rows - 1))), x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(g.cols - 1, x0 + 1), y1 = Math.min(g.rows - 1, y0 + 1), tx = gx - x0, ty = gy - y0, c00 = g.cells[y0 * g.cols + x0], c10 = g.cells[y0 * g.cols + x1], c01 = g.cells[y1 * g.cols + x0], c11 = g.cells[y1 * g.cols + x1];
  const vector = (c2) => {
    const a2 = (c2.dir + 180) % 360 * Math.PI / 180, s = Math.max(0.1, c2.speed);
    return { x: Math.sin(a2) * s, y: -Math.cos(a2) * s };
  }, a = vector(c00), b = vector(c10), c = vector(c01), d = vector(c11), vx = (a.x * (1 - tx) + b.x * tx) * (1 - ty) + (c.x * (1 - tx) + d.x * tx) * ty, vy = (a.y * (1 - tx) + b.y * tx) * (1 - ty) + (c.y * (1 - tx) + d.y * tx) * ty;
  return { vx, vy, speed: Math.hypot(vx, vy) };
}
var wf = 0;
function windStart() {
  const canvas = $("#wind"), ctx = canvas.getContext("2d"), wrap = $("#map-wrap"), d = devicePixelRatio || 1;
  let rect = wrap.getBoundingClientRect();
  canvas.width = Math.round(rect.width * d);
  canvas.height = Math.round(rect.height * d);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  canvas.style.display = "block";
  const particles = Array.from({ length: mobile() ? 180 : 340 }, () => spawnWindParticle(rect));
  cancelAnimationFrame(wf);
  const draw = () => {
    rect = wrap.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "rgba(70,210,255,.88)";
    ctx.lineWidth = 1.05;
    for (const p of particles) {
      const field = windAtScreen(p.x, p.y, rect.width, rect.height), mag = Math.max(0.2, field.speed), scale = Math.max(0.45, Math.min(2.8, mag / 8)), vx = field.vx !== void 0 ? field.vx / mag * scale : Math.sin((field.dir + 180) % 360 * Math.PI / 180) * scale, vy = field.vy !== void 0 ? field.vy / mag * scale : -Math.cos((field.dir + 180) % 360 * Math.PI / 180) * scale, ox = p.x, oy = p.y;
      p.x += vx;
      p.y += vy;
      p.age++;
      ctx.beginPath();
      ctx.moveTo(ox - vx * 5, oy - vy * 5);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (p.x < -25 || p.y < -25 || p.x > rect.width + 25 || p.y > rect.height + 25 || p.age > p.maxAge) Object.assign(p, spawnWindParticle(rect));
    }
    wf = requestAnimationFrame(draw);
  };
  draw();
}
function spawnWindParticle(rect) {
  return { x: Math.random() * rect.width, y: Math.random() * rect.height, age: Math.random() * 100, maxAge: 90 + Math.random() * 90 };
}
function windStop() {
  cancelAnimationFrame(wf);
  const c = $("#wind");
  c.style.display = "none";
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
}
var windRefreshTimer = 0;
function scheduleWindRefresh() {
  if (!S.weatherOn) return;
  clearTimeout(windRefreshTimer);
  windRefreshTimer = setTimeout(async () => {
    await refreshWindGrid(false);
    windStart();
  }, 450);
}
var auth;
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
async function initAuth() {
  try {
    const [{ initializeApp }, { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, setPersistence, indexedDBLocalPersistence, browserLocalPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail }] = await Promise.all([import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"), import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js")]);
    auth = getAuth(initializeApp(firebaseConfig));
    try {
      await setPersistence(auth, indexedDBLocalPersistence);
    } catch {
      await setPersistence(auth, browserLocalPersistence);
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    S.loginGoogle = async () => signInWithPopup(auth, provider);
    S.loginEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);
    S.createEmail = (email, password) => createUserWithEmailAndPassword(auth, email, password);
    S.resetEmail = (email) => sendPasswordResetEmail(auth, email);
    S.logout = () => signOut(auth);
    onAuthStateChanged(auth, (u) => {
      S.user = u;
      resolveAuthReady?.(u || null);
      resolveAuthReady = null;
      S.accountRoutes = [];
      S.accountActivities = [];
      S.editingSavedId = null;
      if (u) {
        syncAccountLibrary();
        ensurePublicProfile(u).catch((error) => console.warn("Public profile sync failed", error));
        if (new URLSearchParams(location.search).has("sharedRoute")) setTimeout(loadSharedRouteFromUrl, 0);
      }
      if (S.page === "profile") profile();
      if (S.page === "routes") routes();
      if (S.page === "record") record();
    });
  } catch (e) {
    console.error("Firebase authentication unavailable", e);
    resolveAuthReady?.(null);
    resolveAuthReady = null;
  }
}
function weatherWidgetCard() {
  const w = S.weather;
  return `<div class="card weather-widget-card"><div class="row"><div><b>Weather</b>${w ? `<p class="muted">${Math.round(w.temp)}\xB0C \xB7 ${escapeHtml(w.desc || "")}</p>` : '<p class="muted">Current conditions and forecast</p>'}</div><button class="btn light" id="openWeather">Full forecast \u2192</button></div></div>`;
}
function profile() {
  const standalone = isStandalone();
  panel.innerHTML = head("Profile", "Account, weather and Home Screen-safe sign-in") + weatherWidgetCard() + (S.user ? `<div class="card"><b>${S.user.displayName || S.user.email || "Rider"}</b><p>${S.user.email || ""}</p><button class="btn light" id="logout">Log out</button></div><div class="card"><h3>Rider profile</h3><div class="field"><label>Weight (kg)</label><input id="profileWeight" type="number" min="30" max="250" value="${profileData().weight}"></div><div class="field"><label>Height (cm)</label><input id="profileHeight" type="number" min="120" max="230" value="${profileData().height}"></div><div class="field"><label>Bike + equipment weight (kg)</label><input id="bikeWeight" type="number" min="5" max="40" value="${profileData().bikeWeight}"></div><button class="btn primary" id="saveProfile">Save rider profile</button><p class="metric-note">Used only for estimated cycling power. This estimate is not a power-meter reading.</p></div>` : `<div class="card"><h2>Sign in</h2>${standalone ? '<p class="muted"><b>Home Screen app detected.</b> Sign in with email/password below, or try Google sign-in. Your login is stored persistently on this device.</p>' : ""}<div class="field"><label>Email</label><input id="authEmail" type="email" autocomplete="email" placeholder="name@example.com"></div><div class="field"><label>Password</label><input id="authPassword" type="password" autocomplete="current-password" minlength="6" placeholder="At least 6 characters"></div><div class="actions"><button class="btn primary" id="emailLogin">Sign in</button><button class="btn light" id="emailCreate">Create account</button><button class="btn light" id="emailReset">Reset password</button></div></div><div class="card"><h3>Google account</h3><p class="muted">${standalone ? "Google sign-in opens in an account popup. If iOS blocks the popup, use email sign-in above." : "Google sign-in opens in a popup and does not use redirect authentication."}</p><div class="actions"><button class="btn light" id="googleLogin">Continue with Google</button></div></div>`);
  if ($("#openWeather")) $("#openWeather").onclick = () => open("weather");
  if ($("#logout")) $("#logout").onclick = () => S.logout?.();
  if ($("#saveProfile")) $("#saveProfile").onclick = () => {
    const weight = $("#profileWeight").value, height = $("#profileHeight").value, bike = $("#bikeWeight").value;
    localStorage.setItem("profileWeight", weight);
    localStorage.setItem("profileHeight", height);
    localStorage.setItem("bikeWeight", bike);
    if (S.user) updateRiderMeasurements(S.user.uid, { weightKg: +weight, heightCm: +height, bikeWeightKg: +bike }).catch((error) => console.warn("Rider measurement sync failed", error));
    toast("Rider profile saved");
  };
  if ($("#emailLogin")) $("#emailLogin").onclick = () => emailAction("login");
  if ($("#emailCreate")) $("#emailCreate").onclick = () => emailAction("create");
  if ($("#emailReset")) $("#emailReset").onclick = () => emailAction("reset");
  if ($("#googleLogin")) $("#googleLogin").onclick = () => S.loginGoogle?.().catch(showAuthError);
}
async function emailAction(kind) {
  const email = $("#authEmail")?.value.trim(), password = $("#authPassword")?.value || "";
  if (!email) return toast("Enter your email address");
  try {
    if (kind === "reset") {
      await S.resetEmail(email);
      toast("Password reset email sent");
    } else if (password.length < 6) toast("Password must contain at least 6 characters");
    else if (kind === "create") {
      await S.createEmail(email, password);
      toast("Account created");
    } else {
      await S.loginEmail(email, password);
      toast("Signed in");
    }
  } catch (e) {
    showAuthError(e);
  }
}
function showAuthError(e) {
  console.error(e);
  const messages = { "auth/invalid-credential": "Incorrect email or password.", "auth/email-already-in-use": "An account already uses this email.", "auth/popup-blocked": "Allow popups for this Home Screen app, or use email sign-in.", "auth/popup-closed-by-user": "Google sign-in was cancelled.", "auth/unauthorized-domain": "Add this website domain in Firebase Authentication \u2192 Settings \u2192 Authorized domains." };
  toast(messages[e?.code] || e?.message || "Sign-in failed");
}
initAuth();
async function requestScreenWakeLock() {
  S.wakeLockWanted = true;
  if (!("wakeLock" in navigator)) {
    toast("Keep-screen-awake is unavailable on this browser");
    return false;
  }
  if (document.visibilityState !== "visible") return false;
  if (S.wakeLock && !S.wakeLock.released) return true;
  try {
    S.wakeLock = await navigator.wakeLock.request("screen");
    S.wakeLock.addEventListener("release", () => {
      S.wakeLock = null;
      if (S.wakeLockWanted && document.visibilityState === "visible") setTimeout(requestScreenWakeLock, 500);
    });
    document.body.classList.add("wake-lock-active");
    return true;
  } catch (e) {
    console.warn("Screen wake lock was not granted:", e);
    document.body.classList.remove("wake-lock-active");
    toast("Could not keep the screen awake. Check Low Power Mode and browser permissions.");
    return false;
  }
}
async function releaseScreenWakeLock() {
  S.wakeLockWanted = false;
  document.body.classList.remove("wake-lock-active");
  if (S.wakeLock && !S.wakeLock.released) {
    try {
      await S.wakeLock.release();
    } catch (e) {
      console.warn("Wake lock release failed", e);
    }
  }
  S.wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.wakeLockWanted && (S.record || S.navState)) requestScreenWakeLock();
});
async function current() {
  if (Array.isArray(S.pos)) return S.pos;
  return new Promise((res) => navigator.geolocation.getCurrentPosition((p) => {
    S.pos = [p.coords.longitude, p.coords.latitude];
    res(S.pos);
  }, () => {
    const c = map?.getCenter?.();
    if (c) {
      toast("Using map centre while GPS is unavailable");
      res([c.lng, c.lat]);
    } else {
      toast("Allow location access");
      res(null);
    }
  }, { enableHighAccuracy: false, maximumAge: 3e5, timeout: 1800 }));
}
$("#locate").onclick = async () => {
  const p = await current();
  if (p) {
    S.manualExploreUntil = 0;
    if (S.navState) updateAdaptiveNavigationCamera(p, S.smoothedHeading, S.record?.speed || 0, true);
    else map.flyTo({ center: p, zoom: 14 });
  }
};
$("#weather").onclick = toggleWeather;
$("#audio-nav").textContent = S.audioNavigation ? "\u{1F50A}" : "\u{1F507}";
$("#audio-nav").onclick = toggleAudioNavigation;
$("#map-share").onclick = openMapShareMenu;
document.addEventListener("click", (e) => {
  const id = e.target.closest("button")?.id;
  if (id === "pause-recording") toggleRecordingPause();
  else if (id === "pause-navigation") toggleNavigationPause();
  else if (id === "end-recording") finishRecord(true);
  else if (id === "end-navigation") endNavigation();
});
$("#map-style").onclick = showMapStyles;
function toggleCycleLayer() {
  S.cycleLayerOn = !S.cycleLayerOn;
  if (S.cycleLayerOn) {
    if (!map.getSource("cyclosm")) map.addSource("cyclosm", { type: "raster", tiles: ["https://a.tile-cyclosm.openstreetmap.fr/cyclosm-lite/{z}/{x}/{y}.png", "https://b.tile-cyclosm.openstreetmap.fr/cyclosm-lite/{z}/{x}/{y}.png", "https://c.tile-cyclosm.openstreetmap.fr/cyclosm-lite/{z}/{x}/{y}.png"], tileSize: 256, attribution: "\xA9 OpenStreetMap contributors \xB7 CyclOSM" });
    if (!map.getLayer("cyclosm")) map.addLayer({ id: "cyclosm", type: "raster", source: "cyclosm", paint: { "raster-opacity": 0.72 } });
  } else {
    if (map.getLayer("cyclosm")) map.removeLayer("cyclosm");
    if (map.getSource("cyclosm")) map.removeSource("cyclosm");
  }
  toast(S.cycleLayerOn ? "Cycle infrastructure shown" : "Cycle infrastructure hidden");
}
function showMapStyles() {
  document.querySelector(".style-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "style-menu";
  const styles = [["Outdoors", "outdoors-v12"], ["Streets", "streets-v12"], ["Satellite", "satellite-streets-v12"], ["Navigation day", "navigation-day-v1"], ["Navigation night", "navigation-night-v1"]];
  menu.innerHTML = styles.map(([n, id]) => `<button data-style="${id}">${n}</button>`).join("") + `<button id="toggleCycleLayer">${S.cycleLayerOn ? "Hide" : "Show"} cycle infrastructure</button><button class="popup-close" aria-label="Close">\xD7</button>`;
  menu.querySelector(".popup-close").onclick = () => menu.remove();
  menu.querySelector("#toggleCycleLayer").onclick = () => {
    toggleCycleLayer();
    menu.remove();
  };
  $("#map-wrap").appendChild(menu);
  menu.onclick = (e) => {
    const id = e.target.dataset.style;
    if (!id) return;
    map.setStyle(`mapbox://styles/mapbox/${id}`);
    map.once("style.load", () => {
      if (S.selected === null && S.routes.length) drawAll();
      else if (S.route) {
        clearLines();
        line("chosen", S.route.geometry, colors[S.selected % colors.length], 8);
      }
      if (S.weatherOn) radar();
      if (S.cycleLayerOn) {
        S.cycleLayerOn = false;
        toggleCycleLayer();
      }
    });
    menu.remove();
  };
}
localStorage.removeItem("routes");
localStorage.removeItem("activities");
map.on("load", () => {
  installMapLocationGestures();
  open("explore");
  loadSharedRouteFromUrl();
  loadJourneyFromUrl();
  setTimeout(promptSessionRecovery, 250);
});
map.on("dragstart", () => {
  if (S.navState) S.manualExploreUntil = Date.now() + 15e3;
});
map.on("zoomstart", () => {
  if (S.navState) S.manualExploreUntil = Date.now() + 15e3;
});
map.on("moveend", scheduleWindRefresh);
map.on("zoomend", scheduleWindRefresh);
addEventListener("resize", () => {
  map.resize();
  if (S.weatherOn) {
    refreshWindGrid(true).then(windStart);
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) persistActiveSession(true);
});
window.addEventListener("pagehide", () => persistActiveSession(true));
window.addEventListener("beforeunload", () => persistActiveSession(true));
window.addEventListener("online", updateOfflineNavigationStatus);
window.addEventListener("offline", updateOfflineNavigationStatus);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(console.error);
//# sourceMappingURL=app.js.map
