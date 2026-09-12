var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// <define:__FIREBASE_CONFIG__>
var define_FIREBASE_CONFIG_default = { apiKey: "AIzaSyBjfLYgpiZLJ8ucR7XqY7cBsrfD1UCs_V4", authDomain: "route-planner-942bd.firebaseapp.com", projectId: "route-planner-942bd", storageBucket: "route-planner-942bd.firebasestorage.app", messagingSenderId: "305443119883", appId: "1:305443119883:web:e83a8ef2dc5334a753380e" };

// src/config.js
var read = (value, fallback) => typeof value === "undefined" ? fallback : value;
var MAPBOX_TOKEN = read("pk.eyJ1IjoibWV0ZW9ncm91cC1tYXBib3giLCJhIjoiY2pudWJyMWVhMDQ0bjNxdXFsNWJ5M2ZtbSJ9.ANOKYyv5s0VFVbnesnGGUQ", "");
var firebaseConfig = read(define_FIREBASE_CONFIG_default, {});
var X_WEATHER_ID = read("", "");
var X_WEATHER_SECRET = read("", "");

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
var forecastCache = /* @__PURE__ */ new Map();
var FORECAST_TTL_MS = 20 * 60 * 1e3;
async function cachedJson(url) {
  const hit = forecastCache.get(url);
  if (hit && Date.now() - hit.at < FORECAST_TTL_MS) return hit.data;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
  const data = await response.json();
  forecastCache.set(url, { at: Date.now(), data });
  if (forecastCache.size > 60) forecastCache.delete(forecastCache.keys().next().value);
  return data;
}
async function fetchRouteForecast(points) {
  const pts = (points || []).map((p) => ({ ...p, lat: +p.lat, lon: +p.lon }));
  if (!pts.length) return [];
  if (X_WEATHER_ID && X_WEATHER_SECRET) {
    const results = await Promise.all(pts.map((p) => fetchWindAtLocation(p.lat, p.lon, p.time)));
    return results;
  }
  const lat = pts.map((p) => p.lat.toFixed(2)).join(",");
  const lon = pts.map((p) => p.lon.toFixed(2)).join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&forecast_days=3&timeformat=unixtime&timezone=UTC`;
  let data;
  try {
    data = await cachedJson(url);
  } catch (error) {
    console.warn("Route forecast unavailable", error);
    return pts.map(() => null);
  }
  const list = Array.isArray(data) ? data : [data];
  return pts.map((p, i) => {
    const h = list[i]?.hourly;
    if (!h?.time?.length) return null;
    const target = Math.floor((p.time instanceof Date ? p.time.getTime() : Number.isFinite(p.time) ? p.time * 1e3 : Date.now()) / 1e3);
    let k = 0, best = Infinity;
    for (let j = 0; j < h.time.length; j++) {
      const d = Math.abs(h.time[j] - target);
      if (d < best) {
        best = d;
        k = j;
      }
    }
    return {
      time: h.time[k],
      speed: h.wind_speed_10m[k],
      bearing: h.wind_direction_10m[k],
      gust: h.wind_gusts_10m[k],
      temp: h.temperature_2m[k],
      feelsLike: h.apparent_temperature[k],
      humidity: h.relative_humidity_2m[k],
      desc: weatherCodeDescription(h.weather_code[k]),
      icon: weatherCodeIcon(h.weather_code[k], new Date(h.time[k] * 1e3).getHours()),
      code: h.weather_code[k],
      source: "Open-Meteo"
    };
  });
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
var SNAP = { closed: 0.06, peek: 0.17, half: 0.5, full: 0.92 };
var ORDER = ["closed", "peek", "half", "full"];
var FLING_PX_PER_MS = 0.45;
var DRAG_SLOP_PX = 4;
function createBottomSheet(panel2, { mobile: mobile2 }) {
  let state4 = "half";
  const grip = document.getElementById("sheet-grip");
  const container = () => panel2.offsetParent || panel2.parentElement;
  const containerHeight = () => container()?.getBoundingClientRect().height || innerHeight;
  const pxFor = (fraction) => Math.round(containerHeight() * fraction);
  function publish(px, animate) {
    const host = container();
    panel2.style.transition = animate ? "" : "none";
    const value = `${Math.round(px)}px`;
    panel2.style.setProperty("--sheet-height", value);
    if (host) {
      host.style.setProperty("--sheet-height", value);
      host.style.setProperty("--sheet-anim", animate ? ".3s cubic-bezier(.2,.8,.2,1)" : "0s");
    }
  }
  function setState(next, { animate = true } = {}) {
    if (!SNAP[next]) next = "half";
    state4 = next;
    panel2.dataset.sheetState = state4;
    document.body.dataset.sheet = state4;
    if (grip) grip.setAttribute("aria-valuenow", String(ORDER.indexOf(state4)));
    if (mobile2()) publish(pxFor(SNAP[state4]), animate);
    else {
      panel2.style.removeProperty("--sheet-height");
      container()?.style.removeProperty("--sheet-height");
    }
  }
  let dragging = false;
  let armed = null;
  let startY = 0;
  let startPx = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let moved = 0;
  function begin(clientY) {
    dragging = true;
    startY = lastY = clientY;
    lastT = performance.now();
    velocity = 0;
    moved = 0;
    startPx = panel2.getBoundingClientRect().height;
    panel2.style.transition = "none";
    document.body.classList.add("sheet-dragging");
  }
  function move(clientY) {
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    velocity = (clientY - lastY) / dt;
    lastY = clientY;
    lastT = now;
    moved = Math.max(moved, Math.abs(clientY - startY));
    const max = pxFor(0.94);
    const min = pxFor(SNAP.closed);
    publish(Math.max(min, Math.min(max, startPx - (clientY - startY))), false);
  }
  function end() {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("sheet-dragging");
    const fraction = panel2.getBoundingClientRect().height / containerHeight();
    let next;
    if (velocity > FLING_PX_PER_MS || velocity < -FLING_PX_PER_MS) {
      const dir = velocity > 0 ? -1 : 1;
      const from = ORDER.reduce((best, key) => Math.abs(SNAP[key] - fraction) < Math.abs(SNAP[best] - fraction) ? key : best, "half");
      next = ORDER[Math.max(0, Math.min(ORDER.length - 1, ORDER.indexOf(from) + dir))];
    } else {
      next = ORDER.reduce((best, key) => Math.abs(SNAP[key] - fraction) < Math.abs(SNAP[best] - fraction) ? key : best, "half");
    }
    setState(next);
  }
  if (grip) {
    grip.addEventListener("pointerdown", (e) => {
      if (!mobile2()) return;
      e.preventDefault();
      grip.setPointerCapture?.(e.pointerId);
      begin(e.clientY);
    });
    grip.addEventListener("click", () => {
      if (!mobile2() || moved > DRAG_SLOP_PX) return;
      setState(state4 === "full" ? "half" : "full");
    });
    grip.addEventListener("keydown", (e) => {
      const i = ORDER.indexOf(state4);
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setState(ORDER[Math.min(ORDER.length - 1, i + 1)]);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setState(ORDER[Math.max(0, i - 1)]);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setState(state4 === "full" ? "half" : "full");
      }
    });
  }
  panel2.addEventListener("pointerdown", (e) => {
    if (!mobile2() || dragging) return;
    if (e.target.closest("input, textarea, select, .mapboxgl-ctrl-geocoder")) return;
    armed = { y: e.clientY, x: e.clientX, atTop: panel2.scrollTop <= 0, id: e.pointerId };
  }, { passive: true });
  panel2.addEventListener("pointermove", (e) => {
    if (!armed || dragging) return;
    const dy = e.clientY - armed.y;
    const dx = e.clientX - armed.x;
    if (Math.abs(dx) > Math.abs(dy)) {
      armed = null;
      return;
    }
    if (dy <= DRAG_SLOP_PX || !armed.atTop) {
      if (Math.abs(dy) > DRAG_SLOP_PX) armed = null;
      return;
    }
    armed = null;
    begin(e.clientY - dy);
    move(e.clientY);
  }, { passive: true });
  addEventListener("pointermove", (e) => {
    if (dragging) move(e.clientY);
  }, { passive: true });
  addEventListener("pointerup", () => {
    armed = null;
    end();
  });
  addEventListener("pointercancel", () => {
    armed = null;
    end();
  });
  addEventListener("resize", () => setState(state4, { animate: false }));
  matchMedia("(orientation: portrait)").addEventListener?.("change", () => setState(state4, { animate: false }));
  setState("half", { animate: false });
  return { setState, getState: () => state4 };
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
async function updateRiderMeasurements(uid2, { weightKg, heightCm, bikeWeightKg }) {
  const db = await getCloud();
  await db.setDoc(db.doc(db.firestore, "users", uid2), { weightKg, heightCm, bikeWeightKg }, { merge: true });
}
async function incrementRiderStats(uid2, { distanceKm = 0, elevationM = 0 }) {
  const db = await getCloud();
  const ref = db.doc(db.firestore, "users", uid2);
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
async function listFollowingUids(uid2) {
  const db = await getCloud();
  const snap = await db.getDocs(db.query(db.collection(db.firestore, "follows"), db.where("followerUid", "==", uid2)));
  return snap.docs.map((d) => d.data().followeeUid);
}
async function listFollowerUids(uid2) {
  const db = await getCloud();
  const snap = await db.getDocs(db.query(db.collection(db.firestore, "follows"), db.where("followeeUid", "==", uid2)));
  return snap.docs.map((d) => d.data().followerUid);
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
async function uploadActivityPhoto(uid2, activityId, index, photo) {
  const storage = await getStorage();
  const blob = typeof photo === "string" ? await dataUrlToBlob(photo) : photo;
  const path = `activity-photos/${uid2}/${activityId}/${index}.jpg`;
  const ref = storage.ref(storage.storage, path);
  await storage.uploadBytes(ref, blob, { contentType: "image/jpeg" });
  return storage.getDownloadURL(ref);
}
async function uploadActivityPhotos(uid2, activityId, photos) {
  return Promise.all(photos.map((photo, i) => uploadActivityPhoto(uid2, activityId, i, photo)));
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
var DEFAULT_PRIVACY_RADIUS_M = 400;
function clipPrivacyEnds(coords, turf2, metres = DEFAULT_PRIVACY_RADIUS_M) {
  if (!Array.isArray(coords) || coords.length < 2 || !(metres > 0)) return coords || null;
  const beyond = (a, b) => {
    try {
      return turf2.distance(a, b, { units: "meters" }) > metres;
    } catch {
      return true;
    }
  };
  const first = coords[0];
  const last = coords[coords.length - 1];
  let start2 = 0;
  while (start2 < coords.length && !beyond(coords[start2], first)) start2++;
  let end = coords.length - 1;
  while (end > start2 && !beyond(coords[end], last)) end--;
  const clipped = coords.slice(start2, end + 1);
  return clipped.length >= 2 ? clipped : null;
}
function plannedDistanceKm(coords, turf2) {
  try {
    return turf2.length(turf2.lineString(coords), { units: "kilometers" });
  } catch {
    return 0;
  }
}
function routeSummaryFields(coords, plannedRoute, turf2, privacyRadiusM = DEFAULT_PRIVACY_RADIUS_M) {
  if (coords.length >= 2) {
    const shown = clipPrivacyEnds(coords, turf2, privacyRadiusM);
    return {
      routeSummaryGeoJson: shown ? JSON.stringify(simplifyRoute(shown, turf2)) : null,
      routeIsPlanned: false,
      routeEndsHidden: !!privacyRadiusM
    };
  }
  if (Array.isArray(plannedRoute) && plannedRoute.length >= 2) {
    const shown = clipPrivacyEnds(plannedRoute, turf2, privacyRadiusM);
    if (!shown) return { routeSummaryGeoJson: null, routeIsPlanned: false, routeEndsHidden: !!privacyRadiusM };
    return {
      routeSummaryGeoJson: JSON.stringify(simplifyRoute(shown, turf2)),
      routeIsPlanned: true,
      routeEndsHidden: !!privacyRadiusM,
      // The recorded distance is ~0 on these, so the card needs the plan's own
      // length to have any honest number to show.
      plannedDistanceKm: plannedDistanceKm(plannedRoute, turf2)
    };
  }
  return { routeSummaryGeoJson: null, routeIsPlanned: false, routeEndsHidden: false };
}
async function publishActivityToFeed(user, activity, turf2, privacyRadiusM = DEFAULT_PRIVACY_RADIUS_M) {
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
    ...routeSummaryFields(coords, activity.plannedRoute, turf2, privacyRadiusM),
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
async function toggleKudos(activityId, uid2, currentlyGiven) {
  const db = await getCloud();
  const kudosRef = db.doc(db.firestore, "activities", activityId, "kudos", uid2);
  const activityRef = db.doc(db.firestore, "activities", activityId);
  if (currentlyGiven) {
    await db.deleteDoc(kudosRef);
    await db.setDoc(activityRef, { kudosCount: db.increment(-1) }, { merge: true });
  } else {
    await db.setDoc(kudosRef, { uid: uid2, createdAt: db.serverTimestamp() });
    await db.setDoc(activityRef, { kudosCount: db.increment(1) }, { merge: true });
  }
}
async function hasGivenKudos(activityId, uid2) {
  const db = await getCloud();
  const snap = await db.getDoc(db.doc(db.firestore, "activities", activityId, "kudos", uid2));
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

// src/ui/icons.js
var ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8 17h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5"/>',
  record: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8M4 12h14"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/><circle cx="20" cy="12" r="2"/>',
  shuffle: '<path d="M4 7h4l8 10h4M4 17h4l2-2.5M14 9.5l2-2.5h4M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V4M8 8l4-4 4 4"/>',
  leaf: '<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19c3-4 6-7 10-9"/>',
  sun: '<path d="M4 18h16M6 14a6 6 0 0 1 12 0M12 4v2M5 8l1.5 1.5M19 8l-1.5 1.5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  landmark: '<path d="M3 21h18M5 21V10M10 21V10M14 21V10M19 21V10M3 10l9-6 9 6z"/>',
  cup: '<path d="M5 8h11v6a5 5 0 0 1-10 0zM16 9h2a2 2 0 0 1 0 4h-2M4 20h13"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  wrench: '<path d="M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 1-2-2z"/>',
  turnRight: '<path d="M6 20V10a4 4 0 0 1 4-4h8M14 2l4 4-4 4"/>',
  speaker: '<path d="M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  cloudDown: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4 4 0 0 1 0 9h-1M12 12v8M9 17l3 3 3-3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/>',
  crown: '<path d="M3 18h18l-1-10-5 4-3-6-3 6-5-4z"/>',
  bubble: '<path d="M4 5h16v11H9l-5 4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  navArrow: '<path d="M12 3l7 18-7-4-7 4z" fill="currentColor" stroke="none"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  list: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  check: '<path d="M5 12l4 4L19 7"/>',
  drag: '<path d="M8 6h.01M16 6h.01M8 12h.01M16 12h.01M8 18h.01M16 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mtn: '<path d="M3 20l6-10 4 6 3-4 5 8z"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  heartRate: '<path d="M3 12h4l2-5 3 10 2-6 2 3h5"/>',
  cadence: '<circle cx="12" cy="12" r="8"/><path d="M12 12l4-3M12 12v-6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  more: '<circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/>',
  pin: '<path d="M12 21s6-6.5 6-11a6 6 0 0 0-12 0c0 4.5 6 11 6 11z"/><circle cx="12" cy="10" r="2.5"/>',
  send: '<path d="M4 4l16 8-16 8 3-8z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'
};
function icon(name, size = 20, extraAttrs = "") {
  const path = ICONS[name];
  if (!path) return "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extraAttrs}>${path}</svg>`;
}

// src/ui/components/routeProgress.js
var STEPS = [
  { id: "places", label: "Finding places worth riding to" },
  { id: "connect", label: "Connecting candidate loops" },
  { id: "score", label: "Scoring cycle infrastructure" },
  { id: "enrich", label: "Adding elevation and wind" }
];
var state = { active: false, index: -1, detail: "", host: null };
var CHECK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 7"/></svg>';
function skeletons(n = 2) {
  return Array.from({ length: n }, () => `<div class="card skel-card">
    <div class="skel" style="width:44px;height:44px;border-radius:10px"></div>
    <div class="body">
      <div class="skel" style="height:12px;width:54%"></div>
      <div class="skel" style="height:10px;width:34%;margin-top:8px"></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">
        <div class="skel" style="height:34px"></div><div class="skel" style="height:34px"></div><div class="skel" style="height:34px"></div>
      </div>
      <div class="skel" style="height:48px;margin-top:10px"></div>
    </div>
  </div>`).join("");
}
function html() {
  const pct = Math.round((state.index + 1) / STEPS.length * 100);
  return `<div class="route-progress">
    <div class="between"><b style="font-size:13px">Building your route</b>
      <span class="muted" style="font-size:12px;font-weight:700">Step ${Math.min(STEPS.length, state.index + 1)} of ${STEPS.length}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="stage">${state.detail || STEPS[Math.max(0, state.index)]?.label || ""}</div>
    <div class="steps">${STEPS.map((s, i) => {
    const cls = i < state.index ? "done" : i === state.index ? "active" : "";
    return `<div class="${cls}"><span class="dot">${i < state.index ? CHECK : ""}</span>${s.label}</div>`;
  }).join("")}</div>
  </div>
  ${skeletons(2)}`;
}
function paint() {
  const host = document.querySelector("#planResults") || document.querySelector("#routeProgressHost");
  if (!host) return;
  state.host = host;
  host.innerHTML = html();
}
function start(detail2 = "") {
  state.active = true;
  state.index = 0;
  state.detail = detail2 || STEPS[0].label;
  paint();
}
function step(stepId, detail2 = "") {
  if (!state.active) return;
  const i = STEPS.findIndex((s) => s.id === stepId);
  if (i < 0) return;
  if (i > state.index) state.index = i;
  state.detail = detail2 || STEPS[state.index].label;
  paint();
}
function detail(text) {
  if (!state.active) return;
  state.detail = text;
  paint();
}
function finish() {
  state.active = false;
  state.index = -1;
  state.detail = "";
}
function isActive() {
  return state.active;
}

// src/ui/components/carousel.js
var CARD_GAP = 12;
function cardStep(track) {
  const first = track.querySelector(":scope > *");
  return first ? first.getBoundingClientRect().width + CARD_GAP : track.clientWidth * 0.8;
}
function updateControls(track, prev, next, counter) {
  const max = track.scrollWidth - track.clientWidth;
  track.parentNode?.classList?.toggle("no-scroll", max <= 2);
  const atStart = track.scrollLeft <= 2;
  const atEnd = track.scrollLeft >= max - 2;
  if (prev) prev.disabled = atStart;
  if (next) next.disabled = atEnd;
  if (counter) {
    if (max <= 2) {
      counter.textContent = "";
      return;
    }
    const step2 = cardStep(track);
    const total = track.children.length;
    const index = Math.min(total, Math.round(track.scrollLeft / Math.max(1, step2)) + 1);
    counter.textContent = total > 1 ? `${index} / ${total}` : "";
  }
}
function enhanceCarousel(track, { counter } = {}) {
  if (!track || track.dataset.carousel === "on") return;
  const pointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  track.dataset.carousel = "on";
  track.tabIndex = 0;
  if (!pointer) return;
  const wrap = document.createElement("div");
  wrap.className = "carousel-wrap";
  track.parentNode.insertBefore(wrap, track);
  wrap.appendChild(track);
  const mk = (dir, label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `carousel-arrow ${dir}`;
    b.setAttribute("aria-label", label);
    b.innerHTML = dir === "prev" ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
    wrap.appendChild(b);
    return b;
  };
  const prev = mk("prev", "Scroll left");
  const next = mk("next", "Scroll right");
  const by = (dir) => track.scrollBy({ left: dir * cardStep(track), behavior: "smooth" });
  prev.onclick = () => by(-1);
  next.onclick = () => by(1);
  track.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const max = track.scrollWidth - track.clientWidth;
    if (max <= 0) return;
    const atStart = track.scrollLeft <= 0 && e.deltaY < 0;
    const atEnd = track.scrollLeft >= max && e.deltaY > 0;
    if (atStart || atEnd) return;
    e.preventDefault();
    track.scrollLeft += e.deltaY;
  }, { passive: false });
  let down = false, startX = 0, startLeft = 0, moved = 0;
  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    down = true;
    moved = 0;
    startX = e.clientX;
    startLeft = track.scrollLeft;
    track.classList.add("dragging");
  });
  addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    track.scrollLeft = startLeft - dx;
  });
  addEventListener("pointerup", (e) => {
    if (!down) return;
    down = false;
    track.classList.remove("dragging");
    if (moved > 6) {
      const kill = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      track.addEventListener("click", kill, { capture: true, once: true });
      setTimeout(() => track.removeEventListener("click", kill, { capture: true }), 0);
    }
  });
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      by(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      by(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      track.scrollTo({ left: 0, behavior: "smooth" });
    } else if (e.key === "End") {
      e.preventDefault();
      track.scrollTo({ left: track.scrollWidth, behavior: "smooth" });
    }
  });
  const sync = () => updateControls(track, prev, next, counter);
  track.addEventListener("scroll", sync, { passive: true });
  addEventListener("resize", sync);
  requestAnimationFrame(sync);
}
function enhanceAll(root) {
  (root || document).querySelectorAll(".hscroll").forEach((track) => {
    const counter = track.closest("section")?.querySelector("[data-carousel-count]") || track.parentElement?.querySelector?.("[data-carousel-count]") || track.previousElementSibling?.querySelector?.("[data-carousel-count]");
    enhanceCarousel(track, { counter });
  });
}

// src/nav/sensors.js
var sensors_exports = {};
__export(sensors_exports, {
  cadenceConnected: () => cadenceConnected,
  connectCadence: () => connectCadence,
  connectHeartRate: () => connectHeartRate,
  disconnectAll: () => disconnectAll,
  getCadence: () => getCadence,
  getHeartRate: () => getHeartRate,
  heartRateZone: () => heartRateZone,
  hrConnected: () => hrConnected,
  isSupported: () => isSupported
});
var HR_SERVICE = "heart_rate";
var HR_CHAR = "heart_rate_measurement";
var CSC_SERVICE = "cycling_speed_and_cadence";
var CSC_CHAR = "csc_measurement";
var state2 = {
  heartRate: null,
  cadence: null,
  hrDevice: null,
  cscDevice: null,
  lastCrankRevs: null,
  lastCrankTime: null
};
function isSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}
function getHeartRate() {
  return state2.heartRate;
}
function getCadence() {
  return state2.cadence;
}
function hrConnected() {
  return !!state2.hrDevice?.gatt?.connected;
}
function cadenceConnected() {
  return !!state2.cscDevice?.gatt?.connected;
}
function parseHeartRate(view3) {
  const flags = view3.getUint8(0);
  return flags & 1 ? view3.getUint16(1, true) : view3.getUint8(1);
}
function parseCadence(view3) {
  const flags = view3.getUint8(0);
  const hasCrank = flags & 2;
  if (!hasCrank) return null;
  const offset = flags & 1 ? 7 : 1;
  const revs = view3.getUint16(offset, true);
  const time = view3.getUint16(offset + 2, true);
  const prevRevs = state2.lastCrankRevs;
  const prevTime = state2.lastCrankTime;
  state2.lastCrankRevs = revs;
  state2.lastCrankTime = time;
  if (prevRevs === null || prevTime === null) return null;
  let dRev = revs - prevRevs;
  let dTime = time - prevTime;
  if (dRev < 0) dRev += 65536;
  if (dTime < 0) dTime += 65536;
  if (dTime <= 0) return state2.cadence;
  const rpm = dRev * 1024 * 60 / dTime;
  return rpm >= 0 && rpm < 250 ? Math.round(rpm) : state2.cadence;
}
async function startNotifications(device, serviceName, charName, onValue) {
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(serviceName);
  const characteristic = await service.getCharacteristic(charName);
  await characteristic.startNotifications();
  characteristic.addEventListener("characteristicvaluechanged", (e) => onValue(e.target.value));
  return characteristic;
}
async function connectHeartRate() {
  if (!isSupported()) throw new Error("Web Bluetooth is not available on this browser");
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [HR_SERVICE] }] });
  state2.hrDevice = device;
  device.addEventListener("gattserverdisconnected", () => {
    state2.heartRate = null;
  });
  await startNotifications(device, HR_SERVICE, HR_CHAR, (view3) => {
    state2.heartRate = parseHeartRate(view3);
  });
  return device.name || "Heart-rate monitor";
}
async function connectCadence() {
  if (!isSupported()) throw new Error("Web Bluetooth is not available on this browser");
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [CSC_SERVICE] }] });
  state2.cscDevice = device;
  state2.lastCrankRevs = null;
  state2.lastCrankTime = null;
  device.addEventListener("gattserverdisconnected", () => {
    state2.cadence = null;
  });
  await startNotifications(device, CSC_SERVICE, CSC_CHAR, (view3) => {
    const rpm = parseCadence(view3);
    if (rpm !== null) state2.cadence = rpm;
  });
  return device.name || "Cadence sensor";
}
function disconnectAll() {
  [state2.hrDevice, state2.cscDevice].forEach((d) => {
    try {
      d?.gatt?.disconnect();
    } catch {
    }
  });
  state2.hrDevice = state2.cscDevice = null;
  state2.heartRate = state2.cadence = null;
}
function heartRateZone(bpm, age) {
  if (!Number.isFinite(bpm) || !Number.isFinite(age)) return null;
  const max = 208 - 0.7 * age;
  const pct = bpm / max;
  if (pct < 0.6) return 1;
  if (pct < 0.7) return 2;
  if (pct < 0.8) return 3;
  if (pct < 0.9) return 4;
  return 5;
}

// src/ui/shell.js
function viewHeader(title, subtitle, { back = true, actions = "" } = {}) {
  return `<header class="view-header">
    ${back ? `<button class="iconbtn" id="viewBack" aria-label="Back">${icon("chevL", 20)}</button>` : ""}
    <div class="view-title">
      <h1>${APP.escapeHtml(title)}</h1>
      ${subtitle ? `<p class="muted">${APP.escapeHtml(subtitle)}</p>` : ""}
    </div>
    ${actions ? `<div class="row" style="gap:6px">${actions}</div>` : ""}
  </header>`;
}
function rootHeader(title, subtitle, { actions = "" } = {}) {
  return `<header class="view-header">
    <div class="view-title">
      <h1>${APP.escapeHtml(title)}</h1>
      ${subtitle ? `<p class="muted">${APP.escapeHtml(subtitle)}</p>` : ""}
    </div>
    ${actions ? `<div class="row" style="gap:6px">${actions}</div>` : ""}
  </header>`;
}
function wireHeader(onBack) {
  const b = APP.$("#viewBack");
  if (b && onBack) b.onclick = onBack;
}
function searchField(label = "Search routes, places, riders", id = "openSearch") {
  return `<button class="search-field" id="${id}" type="button">${icon("search", 20)}<span>${APP.escapeHtml(label)}</span></button>`;
}
function mountSearch(containerId, onPick, placeholder = "Search for a place") {
  const host = APP.$(`#${containerId}`);
  if (!host || typeof MapboxGeocoder === "undefined") return null;
  const pos = APP.state.pos || APP.map?.getCenter?.() && [APP.map.getCenter().lng, APP.map.getCenter().lat];
  const g = new MapboxGeocoder({
    accessToken: APP.MAPBOX_TOKEN,
    mapboxgl: window.mapboxgl,
    marker: false,
    placeholder,
    proximity: Array.isArray(pos) ? { longitude: pos[0], latitude: pos[1] } : void 0
  });
  g.addTo(`#${containerId}`);
  g.on("result", (e) => onPick(e.result));
  setTimeout(() => host.querySelector("input")?.focus(), 60);
  return g;
}

// src/ui/graphics.js
var ORANGE = "#f28b30";
var BLUE = "#176bdb";
var uid = 0;
var nextId = (p) => `${p}${++uid}`;
function project(coords, w, h, pad = 6) {
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minX = Math.min(...lons), maxX = Math.max(...lons);
  const minY = Math.min(...lats), maxY = Math.max(...lats);
  const midLat = (minY + maxY) / 2;
  const kx = Math.cos(midLat * Math.PI / 180) || 1;
  const spanX = Math.max(1e-6, (maxX - minX) * kx);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;
  return coords.map(([lng, lat]) => [
    offX + (lng - minX) * kx * scale,
    h - (offY + (lat - minY) * scale)
    // flip: SVG y grows downward
  ]);
}
function thin(coords, max = 120) {
  if (!Array.isArray(coords) || coords.length <= max) return coords || [];
  const step2 = (coords.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * step2)]);
}
function routeThumb(coords, w = 64, h = 64, { radius = 12, bg = "#eef2f6", showStart = true } = {}) {
  const id = nextId("rt");
  const pts = thin(coords, 90);
  if (pts.length < 2) {
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block"><rect width="${w}" height="${h}" rx="${radius}" fill="${bg}"/></svg>`;
  }
  const p = project(pts, w, h, Math.max(5, Math.round(w * 0.1)));
  const d = p.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [sx, sy] = p[0];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${ORANGE}"/><stop offset="1" stop-color="${BLUE}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" rx="${radius}" fill="${bg}"/>
    <path d="${d}" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>
    <path d="${d}" fill="none" stroke="url(#${id})" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    ${showStart ? `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3.2" fill="#fff" stroke="${ORANGE}" stroke-width="2"/>` : ""}
  </svg>`;
}
function elevationChart(elev, w = 358, h = 92, { distanceKm = 0, dark = false, pending = false } = {}) {
  const vals = (elev || []).filter(Number.isFinite);
  if (vals.length < 2) {
    return `<div style="height:${h}px;display:grid;place-items:center;border-radius:12px;background:var(--surface-muted);color:var(--muted);font-size:11px;font-weight:600">${pending ? "Loading elevation\u2026" : "Elevation unavailable right now"}</div>`;
  }
  const id = nextId("ev");
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const range = hi - lo || 1;
  const pad = 4;
  const x = (i) => i / (vals.length - 1) * w;
  const y = (v) => pad + (1 - (v - lo) / range) * (h - pad * 2);
  const pts = vals.map((v, i) => [x(i), y(v)]);
  const line2 = pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
  const segMetres = (distanceKm || 0) * 1e3 / Math.max(1, vals.length - 1);
  let segs = "";
  for (let i = 1; i < pts.length; i++) {
    const rise = vals[i] - vals[i - 1];
    const grade = segMetres > 0 ? rise / segMetres * 100 : 0;
    const color = grade >= 8 ? "#d94d4d" : grade >= 4 ? ORANGE : grade > 0 ? "#139b66" : null;
    if (!color) continue;
    segs += `<line x1="${pts[i - 1][0].toFixed(1)}" y1="${pts[i - 1][1].toFixed(1)}" x2="${pts[i][0].toFixed(1)}" y2="${pts[i][1].toFixed(1)}" stroke="${color}" stroke-width="3.4" stroke-linecap="round"/>`;
  }
  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BLUE}" stop-opacity=".22"/><stop offset="1" stop-color="${BLUE}" stop-opacity="0"/></linearGradient></defs>
    <polygon points="0,${h} ${line2} ${w},${h}" fill="url(#${id})"/>
    <polyline points="${line2}" fill="none" stroke="${dark ? "#93a3b8" : "#9fb0c2"}" stroke-width="2"/>
    ${segs}
  </svg>`;
}
function gradientLegend() {
  const item = (c, l) => `<span class="row" style="gap:4px"><i style="width:10px;height:3px;border-radius:2px;background:${c}"></i>${l}</span>`;
  return `<span class="row muted" style="gap:10px;font-size:11px;font-weight:700">${item("#139b66", "&lt;4%")}${item(ORANGE, "4-8%")}${item("#d94d4d", "8%+")}</span>`;
}
function staticRouteImage(coords, token, { w = 600, h = 300, style = "outdoors-v12", retina = true } = {}) {
  const pts = thin(coords, 60);
  if (pts.length < 2 || !token) return null;
  const encoded = encodeURIComponent(
    JSON.stringify({ type: "LineString", coordinates: pts.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]) })
  );
  const overlay = `geojson(${encoded})`;
  const size = `${w}x${h}${retina ? "@2x" : ""}`;
  const url = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${overlay}/auto/${size}?padding=24&access_token=${token}&attribution=false&logo=false`;
  if (url.length > 7800) {
    const mid = pts[Math.floor(pts.length / 2)];
    return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${mid[0].toFixed(4)},${mid[1].toFixed(4)},11/${size}?access_token=${token}&attribution=false&logo=false`;
  }
  return url;
}
function terrainPlaceholder(w, h, hue = "warm", radius = 0) {
  const skies = { warm: ["#f9d8a8", "#f4a76a"], cool: ["#cfe3f5", "#7fb3e6"], forest: ["#d9ead0", "#6f9f6a"], coast: ["#dbeefc", "#5aa2d8"] };
  const [a, b] = skies[hue] || skies.warm;
  const id = nextId("tp");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="display:block;border-radius:${radius}px">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#${id})"/>
    <path d="M0 ${h * 0.62} C ${w * 0.2} ${h * 0.45}, ${w * 0.35} ${h * 0.7}, ${w * 0.55} ${h * 0.5} S ${w * 0.85} ${h * 0.35}, ${w} ${h * 0.55} L ${w} ${h} L 0 ${h}z" fill="#2f5d4a" opacity=".55"/>
    <path d="M0 ${h * 0.78} C ${w * 0.25} ${h * 0.62}, ${w * 0.5} ${h * 0.9}, ${w * 0.7} ${h * 0.72} S ${w * 0.9} ${h * 0.6}, ${w} ${h * 0.75} L ${w} ${h} L 0 ${h}z" fill="#1f4a3a" opacity=".8"/>
  </svg>`;
}
function difficultyFor(distanceKm, elevationM) {
  const km = distanceKm || 0;
  const m = elevationM || 0;
  const score = km + m / 12;
  if (score < 30) return { label: "Easy", tone: "green" };
  if (score < 75) return { label: "Moderate", tone: "orange" };
  return { label: "Hard", tone: "red" };
}
var fmtKm = (km) => `${(km || 0).toFixed((km || 0) < 100 ? 1 : 0)} km`;
var fmtM = (m) => `${Math.round(m || 0)} m`;
function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.round(s % 3600 / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m} min`;
}

// src/social/discover.js
async function queryActivities(build) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(build(db));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn("Discovery query unavailable", error);
    return [];
  }
}
function popularActivities(max = 10) {
  return queryActivities(
    (db) => db.query(
      db.collection(db.firestore, "activities"),
      db.where("visibility", "==", "public"),
      db.orderBy("kudosCount", "desc"),
      db.limit(max)
    )
  );
}
function recentActivities(max = 10, sinceMs) {
  const cutoff = sinceMs ?? 0;
  return queryActivities(
    (db) => db.query(
      db.collection(db.firestore, "activities"),
      db.where("visibility", "==", "public"),
      db.where("startedAt", ">=", cutoff),
      db.orderBy("startedAt", "desc"),
      db.limit(max)
    )
  );
}
async function ridingNowCount(followedUids) {
  if (!followedUids?.length) return 0;
  try {
    const db = await getCloud();
    const chunks = [];
    for (let i = 0; i < followedUids.length; i += 30) chunks.push(followedUids.slice(i, i + 30));
    const snaps = await Promise.all(
      chunks.map(
        (chunk) => db.getDocs(db.query(db.collection(db.firestore, "journeys_v4"), db.where("ownerId", "in", chunk), db.where("active", "==", true)))
      )
    );
    return snaps.reduce((n, s) => n + s.size, 0);
  } catch (error) {
    console.warn("Riding-now count unavailable", error);
    return 0;
  }
}

// src/ui/pages/adventure.js
var RIDE_TYPES = [{ id: "road", label: "Road" }, { id: "gravel", label: "Gravel" }, { id: "mtb", label: "MTB" }];
var DIFFICULTIES = ["Easy", "Moderate", "Hard"];
var SCENERY = [
  { id: "coastal", label: "Coastal", icon: "drop" },
  { id: "forest", label: "Forest", icon: "leaf" },
  { id: "mountain", label: "Mountain", icon: "mtn" },
  { id: "countryside", label: "Countryside", icon: "sun" }
];
function defaultFilters() {
  return { rideType: "road", hours: 2.5, difficulty: "Moderate", scenery: ["forest"] };
}
function filters() {
  const S2 = APP.state;
  if (!S2.adventureFilters) S2.adventureFilters = defaultFilters();
  return S2.adventureFilters;
}
function filterDistanceRange() {
  const f = filters();
  const speed = f.rideType === "mtb" ? 14 : f.rideType === "gravel" ? 18 : 22;
  const target = Math.max(6, f.hours * speed);
  return { minKm: Math.round(target * 0.75), maxKm: Math.round(target * 1.25) };
}
var goHome = () => {
  APP.state.adventureView = "home";
  render();
};
function infraLine(route) {
  if (Number.isFinite(route.osmCycleScore)) return `${route.osmCycleScore}% on cycle infrastructure`;
  if (route.cycleScorePending) return "Checking cycle infrastructure\u2026";
  return `${Number.isFinite(route.cycleScore) ? route.cycleScore : 0}% cycle-route estimate`;
}
function heroMedia(route, hue) {
  const coords = route?.geometry?.coordinates;
  const url = coords ? staticRouteImage(coords, APP.MAPBOX_TOKEN, { w: 600, h: 264 }) : null;
  return url ? `<img src="${url}" alt="" loading="lazy">` : terrainPlaceholder(300, 132, hue, 0);
}
function deckCardHtml(route, i, selected) {
  const km = (route.distance || 0) / 1e3;
  const diff = difficultyFor(km, route.ascent || 0);
  return `<article class="card hero-card deck-card" style="${selected ? "border-color:var(--blue);border-width:2px" : ""}">
    <div class="hero-media">${heroMedia(route, ["warm", "forest", "cool", "coast"][i % 4])}
      <div class="hero-badges">${route.qualityLabel ? `<span class="badge dark">${APP.escapeHtml(String(route.qualityLabel).split("\xB7")[0].trim())}</span>` : ""}</div>
      <div class="hero-actions">
        <button class="iconbtn" data-save="${i}" title="Save route">${icon("heart", 18)}</button>
        <button class="iconbtn" data-share="${i}" title="Share route">${icon("share", 18)}</button>
      </div>
      <div class="hero-thumb">${routeThumb(route.geometry?.coordinates, 48, 48)}</div>
    </div>
    <div class="hero-body">
      <div>
        <h2 style="font-size:16px">${APP.escapeHtml(route.name || `Adventure ${i + 1}`)}</h2>
        <p class="muted" style="font-size:12px;font-weight:600">${infraLine(route)}</p>
      </div>
      ${route.whyThisRoute ? `<p style="font-size:12px;font-weight:600;color:var(--blue);line-height:1.4">${APP.escapeHtml(route.whyThisRoute)}</p>` : ""}
      <div class="route-facts">
        <span class="row">${icon("route", 15)}${fmtKm(km)}</span>
        <span class="row">${icon("mtn", 15)}${Number.isFinite(route.ascent) ? fmtM(route.ascent) : "\u2014"}</span>
        <span class="row">${icon("clock", 15)}${fmtDuration(route.duration)}</span>
        <span class="badge ${diff.tone}">${diff.label}</span>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn light sm" data-show="${i}" style="flex:1">${icon("eye", 16)}Show on map</button>
        <button class="btn primary sm" data-details="${i}" style="flex:1">Details</button>
      </div>
    </div>
  </article>`;
}
function safeCoords(json) {
  try {
    const g = typeof json === "string" ? JSON.parse(json) : json;
    return g?.coordinates?.length >= 2 ? g.coordinates : null;
  } catch {
    return null;
  }
}
function communityCardHtml(a) {
  const coords = safeCoords(a.routeSummaryGeoJson);
  const url = coords ? staticRouteImage(coords, APP.MAPBOX_TOKEN, { w: 320, h: 160 }) : null;
  return `<button class="card mini-card${url ? "" : " mini-card-flat"}" data-community="${APP.escapeHtml(a.id)}">
    <div class="mini-media">${url ? `<img src="${url}" alt="${a.routeIsPlanned ? "Planned route" : "Route ridden"} for ${APP.escapeHtml(a.title || "this ride")}" loading="lazy">
         ${a.routeIsPlanned ? '<span class="mini-tag">Planned route</span>' : ""}` : `<div class="mini-media-empty">${icon("route", 16)}<span>No route recorded</span></div>`}
      ${a.kudosCount ? `<span class="badge dark" style="position:absolute;left:8px;top:8px;min-height:20px;font-size:10px">${icon("heart", 11)}${a.kudosCount}</span>` : ""}
    </div>
    <div class="mini-body"><b>${APP.escapeHtml(a.title || "Ride")}</b>
      <span>${a.routeIsPlanned ? `${fmtKm(a.plannedDistanceKm)} planned \xB7 not ridden` : `${fmtKm(a.distanceKm)} \xB7 ${fmtM(a.elevationGainM)}`} \xB7 ${APP.escapeHtml(a.ownerDisplayName || "Rider")}</span></div>
  </button>`;
}
function railHtml(title, items, emptyText) {
  return `<section>
    <div class="between" style="margin-bottom:8px"><span class="section-title">${title}</span></div>
    ${items.length ? `<div class="hscroll">${items.map(communityCardHtml).join("")}</div>` : `<div class="empty" style="padding:14px">${emptyText}</div>`}
  </section>`;
}
function searchView() {
  APP.panel.innerHTML = `<div class="page">
    ${viewHeader("Search", "Find a place to ride to")}
    <div id="searchBox"></div>
    <p class="muted" style="font-size:12px;font-weight:600">Pick a place and Ridewise plans a route to it from where you are.</p>
  </div>`;
  wireHeader(goHome);
  mountSearch("searchBox", async (result) => {
    const S2 = APP.state;
    const start2 = S2.waypoints?.[0] || await APP.current();
    if (!start2) {
      APP.toast("Allow location access to plan from here");
      return;
    }
    S2.mode = "point";
    S2.waypoints = [start2, result.center];
    S2.names = [S2.names?.[0] || "Current location", result.place_name];
    S2.adventureView = "home";
    S2.planView = "planner";
    APP.open("plan");
    APP.pointRoutes(false);
  });
}
function filtersView() {
  const f = filters();
  const { minKm, maxKm } = filterDistanceRange();
  APP.panel.innerHTML = `<div class="page">
    ${viewHeader("Filters", "Shapes the loops Ridewise generates")}
    <section><p class="section-title" style="margin-bottom:8px">Ride type</p>
      <div class="segmented" id="rideType">${RIDE_TYPES.map((r) => `<button data-ride="${r.id}" class="${f.rideType === r.id ? "on" : ""}">${r.label}</button>`).join("")}</div>
    </section>
    <section>
      <div class="between" style="margin-bottom:4px"><span class="section-title">Duration</span><b style="color:var(--blue)" id="hoursLabel">${f.hours.toFixed(1)} h</b></div>
      <div class="slider"><div class="track"></div><div class="fill" id="hoursFill"></div><div class="knob" id="hoursKnob"></div>
        <input id="hoursInput" type="range" min="0.5" max="6" step="0.5" value="${f.hours}"></div>
      <p class="muted" style="font-size:12px;font-weight:600" id="rangeHint">Targets roughly ${minKm}\u2013${maxKm} km</p>
    </section>
    <section><p class="section-title" style="margin-bottom:8px">Difficulty</p>
      <div class="row" id="difficulty" style="gap:8px">${DIFFICULTIES.map((d) => `<button class="chip ${f.difficulty === d ? "on" : ""}" data-diff="${d}">${d}</button>`).join("")}</div>
    </section>
    <section><p class="section-title" style="margin-bottom:8px">Preferences</p>
      <div class="row" id="ridePrefs" style="gap:8px;flex-wrap:wrap">
        ${[["avoidHills", "Avoid hills", "mtn"], ["quietRoads", "Quiet roads", "leaf"], ["pavedOnly", "Paved only", "route"], ["tailwindHome", "Tailwind home", "wind"], ["beforeSunset", "Back before sunset", "clock"]].map(([id, label, ico]) => `<button class="chip ${APP.ridePrefs()[id] ? "on" : ""}" data-pref="${id}">${icon(ico, 15)}${label}</button>`).join("")}
      </div>
      <p class="muted" style="font-size:12px;font-weight:600;margin-top:8px">These change how candidates are ranked, using the elevation, OpenStreetMap surface and live wind the app already reads.</p>
    </section>
    <div class="card pad flat between">
      <div><b style="font-size:14px;display:block">Round trip</b><span class="muted" style="font-size:12px;font-weight:600">Loop back to where you start</span></div>
      <button class="toggle ${f.roundTrip !== false ? "on" : ""}" id="filterRoundTrip" aria-pressed="${f.roundTrip !== false}"><i></i></button>
    </div>
    <section><p class="section-title" style="margin-bottom:8px">Scenery</p>
      <div class="row" id="scenery" style="gap:8px;flex-wrap:wrap">${SCENERY.map((s) => `<button class="chip ${f.scenery.includes(s.id) ? "on" : ""}" data-scenery="${s.id}">${icon(s.icon, 16)}${s.label}</button>`).join("")}</div>
    </section>
    <div class="action-bar"><button class="btn cta" id="applyFilters">${icon("compass", 18)}Find adventures</button></div>
  </div>`;
  wireHeader(goHome);
  const { $: $2 } = APP;
  const sync = () => {
    const pct = (f.hours - 0.5) / 5.5 * 100;
    $2("#hoursFill").style.width = `${pct}%`;
    $2("#hoursKnob").style.left = `${pct}%`;
    $2("#hoursLabel").textContent = `${f.hours.toFixed(1)} h`;
    const r = filterDistanceRange();
    $2("#rangeHint").textContent = `Targets roughly ${r.minKm}\u2013${r.maxKm} km`;
  };
  sync();
  $2("#hoursInput").oninput = (e) => {
    f.hours = +e.target.value;
    sync();
  };
  $2("#rideType").onclick = (e) => {
    const b = e.target.closest("[data-ride]");
    if (!b) return;
    f.rideType = b.dataset.ride;
    $2("#rideType").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    sync();
  };
  $2("#difficulty").onclick = (e) => {
    const b = e.target.closest("[data-diff]");
    if (!b) return;
    f.difficulty = b.dataset.diff;
    $2("#difficulty").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  };
  $2("#scenery").onclick = (e) => {
    const b = e.target.closest("[data-scenery]");
    if (!b) return;
    const id = b.dataset.scenery;
    f.scenery = f.scenery.includes(id) ? f.scenery.filter((x) => x !== id) : [...f.scenery, id];
    b.classList.toggle("on", f.scenery.includes(id));
  };
  $2("#ridePrefs").onclick = (e) => {
    const b = e.target.closest("[data-pref]");
    if (!b) return;
    const prefs = APP.ridePrefs();
    prefs[b.dataset.pref] = !prefs[b.dataset.pref];
    b.classList.toggle("on", prefs[b.dataset.pref]);
    APP.saveRidePrefs();
    if (b.dataset.pref === "beforeSunset" && prefs.beforeSunset) APP.refreshDaylightLimit();
  };
  $2("#filterRoundTrip").onclick = (e) => {
    f.roundTrip = f.roundTrip === false;
    e.currentTarget.classList.toggle("on", f.roundTrip !== false);
  };
  $2("#applyFilters").onclick = () => generate(false);
}
async function generate(surprise) {
  const S2 = APP.state;
  const { minKm, maxKm } = filterDistanceRange();
  S2.mode = "loop";
  S2.adventureView = "home";
  const start2 = S2.waypoints?.[0] || await APP.current();
  if (!start2) {
    APP.toast("Allow location access to find adventures nearby");
    return;
  }
  S2.waypoints = [start2, start2];
  if (surprise) {
    const spread = Math.max(1, maxKm - minKm);
    S2.adventureSurpriseSeed = (S2.adventureSurpriseSeed || 0) + 1;
    const jitter = S2.adventureSurpriseSeed * 11 % spread;
    S2.adventureRange = { minKm: Math.max(5, minKm + jitter * 0.3), maxKm: maxKm + jitter * 0.5 };
  } else {
    S2.adventureRange = { minKm, maxKm };
  }
  APP.open("explore");
  await APP.adventureRoutes(false);
  await render();
}
async function homeView() {
  const S2 = APP.state;
  const loops = S2.mode === "loop" && Array.isArray(S2.routes) ? S2.routes : [];
  const sel = Number.isInteger(S2.selected) ? S2.selected : null;
  const selRoute = sel !== null ? loops[sel] : null;
  APP.panel.innerHTML = `<div class="page">
    ${rootHeader("Adventure", loops.length ? `${loops.length} loop${loops.length === 1 ? "" : "s"} near you` : "Loops near you")}
    ${searchField()}
    <div class="row" style="gap:8px">
      <button class="btn light sm" id="openFilters" style="flex:1">${icon("sliders", 16)}Filters</button>
      <button class="btn cta sm" id="surpriseMe" style="flex:1">${icon("shuffle", 16)}Surprise me</button>
    </div>
    ${selRoute ? `<div class="selected-strip">
        <span>${routeThumb(selRoute.geometry?.coordinates, 40, 40, { radius: 9 })}</span>
        <span class="grow"><b>${APP.escapeHtml(selRoute.name || "Selected route")}</b><span>${fmtKm((selRoute.distance || 0) / 1e3)} \xB7 shown on map</span></span>
        <button class="btn primary sm" id="selDetails">Details</button>
      </div>` : ""}
    <div id="routeProgressHost"></div>
    ${loops.length ? `<div class="hscroll deck-grid" id="deck">${loops.map((r, i) => deckCardHtml(r, i, i === sel)).join("")}</div>
         <div class="row" style="gap:8px">
           <span class="muted" data-carousel-count style="font-size:12px;font-weight:700"></span>
           ${loops.length > 1 ? `<button class="btn light" id="compareRoutes" style="flex:1">${icon("layers", 16)}Compare</button>` : ""}
           <button class="btn light" id="regenerate" style="flex:1">${icon("shuffle", 16)}Different loops</button>
         </div>` : `<div class="card pad flat" style="text-align:center">
           <p class="muted" style="font-size:13px;line-height:1.5;margin-bottom:12px">Ridewise builds loops from real OpenStreetMap cycle infrastructure around your location.</p>
           <button class="btn cta block" id="findAdventures">${icon("compass", 18)}Find adventures near me</button>
         </div>`}
    <div id="communityRails"><div class="empty" style="padding:14px">Loading community rides\u2026</div></div>
  </div>`;
  const { $: $2 } = APP;
  $2("#openSearch").onclick = () => {
    S2.adventureView = "search";
    render();
  };
  $2("#openFilters").onclick = () => {
    S2.adventureView = "filters";
    render();
  };
  $2("#surpriseMe").onclick = () => generate(true);
  const find = $2("#findAdventures");
  if (find) find.onclick = () => generate(false);
  const regen = $2("#regenerate");
  if (regen) regen.onclick = () => generate(true);
  const cmp = $2("#compareRoutes");
  if (cmp) cmp.onclick = () => {
    S2.adventureView = "compare";
    render();
  };
  const selDetails = $2("#selDetails");
  if (selDetails) selDetails.onclick = () => {
    S2.routeDetailOpen = true;
    APP.open("explore");
  };
  const deck = $2("#deck");
  if (deck) deck.onclick = (e) => {
    const save = e.target.closest("[data-save]");
    const share = e.target.closest("[data-share]");
    if (save) {
      e.stopPropagation();
      APP.saveRouteByIndex(+save.dataset.save);
      return;
    }
    if (share) {
      e.stopPropagation();
      APP.shareRouteByIndex(+share.dataset.share);
      return;
    }
    const show = e.target.closest("[data-show]");
    const details = e.target.closest("[data-details]");
    if (show) {
      APP.select(+show.dataset.show);
      render();
      return;
    }
    if (details) {
      APP.select(+details.dataset.details);
      S2.routeDetailOpen = true;
      APP.open("explore");
    }
  };
  const weekAgo = Date.now() - 7 * 864e5;
  const [popular, recent] = await Promise.all([popularActivities(8), recentActivities(8, weekAgo)]);
  const rails = $2("#communityRails");
  if (!rails) return;
  rails.innerHTML = railHtml("Community favourites", popular, "No shared rides yet. Rides you and riders you follow share appear here.") + railHtml("New this week", recent, "Nothing shared in the last seven days.");
  rails.onclick = async (e) => {
    const b = e.target.closest("[data-community]");
    if (!b) return;
    const ride = [...popular, ...recent].find((x) => x.id === b.dataset.community);
    if (!ride) return;
    const coords = safeCoords(ride.routeSummaryGeoJson);
    if (!coords) return APP.toast("That ride has no recorded route to open");
    if (b.dataset.busy) return;
    b.dataset.busy = "1";
    APP.toast("Opening ride\u2026");
    try {
      await APP.useSavedActivityRoute({
        name: ride.title || "Community ride",
        distance: ride.distanceKm || 0,
        elapsed: 0,
        samples: coords.map((pos) => ({ pos }))
      });
    } catch (error) {
      console.warn("Could not open the community ride", error);
      APP.toast("Could not open that ride");
    } finally {
      delete b.dataset.busy;
    }
  };
}
function compareView() {
  const S2 = APP.state;
  const loops = Array.isArray(S2.routes) ? S2.routes : [];
  if (loops.length < 2) {
    S2.adventureView = "home";
    return render();
  }
  if (!Number.isInteger(S2.compareA) || S2.compareA >= loops.length) S2.compareA = 0;
  if (!Number.isInteger(S2.compareB) || S2.compareB >= loops.length || S2.compareB === S2.compareA) S2.compareB = S2.compareA === 0 ? 1 : 0;
  const a = loops[S2.compareA], b = loops[S2.compareB];
  const rows = APP.quality.compareRoutes(a, b);
  const picker = (which, current2) => `<select data-pick="${which}" style="min-height:40px;font-size:13px">${loops.map((r, i) => `<option value="${i}" ${i === current2 ? "selected" : ""}>${APP.escapeHtml(r.name || "Adventure " + (i + 1))}</option>`).join("")}</select>`;
  APP.panel.innerHTML = `<div class="page">
    ${viewHeader("Compare routes", "Same numbers, side by side")}
    <div class="row" style="gap:8px">${picker("a", S2.compareA)}${picker("b", S2.compareB)}</div>
    <div class="row" style="gap:8px">
      <div style="flex:1">${routeThumb(a.geometry?.coordinates, 150, 90, { radius: 12 })}</div>
      <div style="flex:1">${routeThumb(b.geometry?.coordinates, 150, 90, { radius: 12 })}</div>
    </div>
    <div class="card flat" style="padding:4px 14px">
      ${rows.map((r) => `<div class="item" style="gap:8px">
        <span style="flex:1;font-size:13px;font-weight:${r.winner === "a" ? 800 : 600};color:${r.winner === "a" ? "var(--green)" : "inherit"}">${r.a}</span>
        <span class="muted" style="font-size:11px;font-weight:700;text-align:center;width:92px">${r.label}</span>
        <span style="flex:1;text-align:right;font-size:13px;font-weight:${r.winner === "b" ? 800 : 600};color:${r.winner === "b" ? "var(--green)" : "inherit"}">${r.b}</span>
      </div>`).join("")}
    </div>
    ${[a, b].some((r) => r.whyThisRoute) ? `<div class="card pad flat">
      ${[a, b].map((r, i) => r.whyThisRoute ? `<p style="font-size:12px;font-weight:600;margin-bottom:6px"><b>${APP.escapeHtml(r.name || (i ? "B" : "A"))}:</b> ${APP.escapeHtml(r.whyThisRoute)}</p>` : "").join("")}
    </div>` : ""}
    <div class="action-bar">
      <button class="btn light" id="cmpA">Use ${APP.escapeHtml(a.name || "A")}</button>
      <button class="btn cta" id="cmpB">Use ${APP.escapeHtml(b.name || "B")}</button>
    </div>
  </div>`;
  wireHeader(goHome);
  APP.panel.querySelectorAll("[data-pick]").forEach((sel) => {
    sel.onchange = (e) => {
      const which = sel.dataset.pick === "a" ? "compareA" : "compareB";
      S2[which] = +e.target.value;
      compareView();
    };
  });
  APP.$("#cmpA").onclick = () => {
    APP.select(S2.compareA);
    S2.adventureView = "home";
    S2.routeDetailOpen = true;
    APP.open("explore");
  };
  APP.$("#cmpB").onclick = () => {
    APP.select(S2.compareB);
    S2.adventureView = "home";
    S2.routeDetailOpen = true;
    APP.open("explore");
  };
}
async function render() {
  if (!APP.isCurrentPage("explore")) return;
  const S2 = APP.state;
  if (S2.adventureView === "compare") return compareView();
  if (S2.adventureView === "search") return searchView();
  if (S2.adventureView === "filters") return filtersView();
  return homeView();
}

// src/ui/pages/plan.js
var SURFACES = ["Road", "Gravel", "MTB", "Mixed"];
function state3() {
  const S2 = APP.state;
  if (!S2.planView) S2.planView = "planner";
  if (!S2.libraryLayout) S2.libraryLayout = "grid";
  if (S2.planRoundTrip === void 0) S2.planRoundTrip = false;
  if (!S2.planSurface) S2.planSurface = "Road";
  if (!Number.isFinite(S2.planBearing)) S2.planBearing = 35;
  if (!S2.adventureRange) S2.adventureRange = { minKm: 20, maxKm: 70 };
  return S2;
}
function segmentedHtml(view3) {
  return `<div class="segmented" id="planTabs">
    <button data-view="planner" class="${view3 === "planner" ? "on" : ""}">Planner</button>
    <button data-view="library" class="${view3 === "library" ? "on" : ""}">My routes</button>
  </div>`;
}
function dialHtml(bearing) {
  const label = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((bearing % 360 + 360) % 360 / 45) % 8];
  return `<div style="text-align:center">
    <svg id="dirDial" width="96" height="96" viewBox="0 0 96 96" style="display:block;touch-action:none;cursor:pointer">
      <circle cx="48" cy="48" r="44" fill="var(--surface-muted)" stroke="var(--line)"/>
      <g font-family="inherit" font-size="10" font-weight="700" fill="var(--muted)" text-anchor="middle">
        <text x="48" y="16">N</text><text x="84" y="52">E</text><text x="48" y="88">S</text><text x="12" y="52">W</text>
      </g>
      <g transform="rotate(${bearing} 48 48)">
        <path d="M48 18 L55 48 L48 43 L41 48z" fill="var(--accent)"/>
        <path d="M48 78 L41 48 L48 53 L55 48z" fill="var(--line)"/>
      </g>
      <circle cx="48" cy="48" r="5" fill="var(--surface)" stroke="var(--navy)" stroke-width="2"/>
    </svg>
    <small class="muted" style="font-size:11px;font-weight:700">Head ${label} \xB7 ${Math.round(bearing)}\xB0</small>
  </div>`;
}
function routeResultHtml(route, i, selected) {
  const km = (route.distance || 0) / 1e3;
  const diff = difficultyFor(km, route.ascent || 0);
  const infra = Number.isFinite(route.osmCycleScore) ? route.osmCycleScore : route.cycleScore;
  return `<article class="card ${selected ? "" : "flat"}" style="padding:12px;${selected ? "border-color:var(--blue);border-width:2px" : ""}" data-result="${i}">
    <div class="between">
      <div class="row" style="gap:10px">
        ${routeThumb(route.geometry?.coordinates, 44, 44, { radius: 10 })}
        <div>
          <b style="font-size:14px">${i === 0 ? "Recommended" : `Option ${i + 1}`}</b>
          <div class="muted" style="font-size:11px;font-weight:600">${route.cycleScorePending && !Number.isFinite(route.osmCycleScore) ? "Checking cycle infrastructure\u2026" : Number.isFinite(infra) ? `${infra}% cycle infrastructure` : "Cycle infrastructure unknown"}</div>
        </div>
      </div>
      <span class="badge ${diff.tone}">${diff.label}</span>
    </div>
    <div class="stats three" style="margin-top:10px">
      <div class="stat"><b>${fmtKm(km)}</b><small>distance</small></div>
      <div class="stat"><b>${Number.isFinite(route.ascent) ? fmtM(route.ascent) : "\u2014"}</b><small>climb</small></div>
      <div class="stat"><b>${fmtDuration(route.duration)}</b><small>est. time</small></div>
    </div>
    <div style="margin-top:10px">
      <div class="between" style="margin-bottom:4px"><span class="label">Elevation</span>${gradientLegend()}</div>
      ${elevationChart(route.elev, 340, 78, { distanceKm: km, pending: !route.elev?.length && !route.elevUnavailable })}
    </div>
    <div class="actions">
      <button class="btn primary sm" data-nav="${i}">${icon("navArrow", 16)}Navigate</button>
      <button class="btn light sm" data-save="${i}">${icon("heart", 16)}Save</button>
      <button class="btn light sm" data-share="${i}">${icon("share", 16)}Share</button>
      <button class="btn light sm" data-preview="${i}">${icon("eye", 16)}Preview</button>
      <button class="btn light sm" data-gpx="${i}">${icon("download", 16)}GPX</button>
    </div>
  </article>`;
}
function stops() {
  const S2 = state3();
  if (!Array.isArray(S2.waypoints)) S2.waypoints = [];
  if (!Array.isArray(S2.names)) S2.names = [];
  while (S2.waypoints.length < 2) S2.waypoints.push(null);
  while (S2.names.length < S2.waypoints.length) S2.names.push("");
  return S2.waypoints;
}
function stopsHtml() {
  const list = stops();
  const n = list.length;
  const rows = list.map((_, i) => {
    const role = i === 0 ? "start" : i === n - 1 ? "finish" : "via";
    const label = role === "start" ? "Start" : role === "finish" ? "Finish" : `Stop ${i}`;
    const action = role === "start" || role === "finish" && n === 2 ? `<button class="iconbtn plain stop-action" data-here="${i}" title="Use my location" aria-label="Use my location for ${label}">${icon("pin", 18)}</button>` : `<button class="iconbtn plain stop-action" data-remove-stop="${i}" title="Remove" aria-label="Remove ${label}">${icon("x", 16)}</button>`;
    return `<div class="stop-row" data-stop="${i}">
      <button class="stop-grip" data-grip="${i}" aria-label="Reorder ${label}" ${n < 3 ? "disabled" : ""}>${icon("drag", 16)}</button>
      <span class="stop-badge ${role}" aria-hidden="true">${APP.stopLetter(i)}</span>
      <div class="stop-field" id="stop-${i}" aria-label="${label}"></div>
      ${action}
    </div>`;
  }).join("");
  return `<div class="stops" id="stops">${rows}</div>
    <div class="stops-foot">
      <button class="btn light sm" id="addStop">${icon("plus", 16)}Add stop</button>
      <span class="muted">or tap and hold the map</span>
    </div>`;
}
function wireStops() {
  const S2 = state3();
  const { $: $2 } = APP;
  const list = stops();
  const n = list.length;
  list.forEach((_, i) => {
    const id = `#stop-${i}`;
    APP.geo(id, i);
    const g = S2.geocoders[id];
    const role = i === 0 ? "Start" : i === n - 1 ? "Finish" : `Stop ${i}`;
    g?.setPlaceholder?.(i === 0 ? "Start \u2014 search or use your location" : i === n - 1 ? "Finish \u2014 search or tap the map" : `${role} \u2014 search or tap the map`);
    const name = S2.names[i];
    if (name) g?.setInput(name);
  });
  const host = $2("#stops");
  const replan = () => {
    if (S2.waypoints.length >= 2 && S2.waypoints.every(Array.isArray)) APP.pointRoutes(false);
  };
  host.onclick = async (e) => {
    const here = e.target.closest("[data-here]");
    const remove = e.target.closest("[data-remove-stop]");
    if (here) {
      await APP.setHere(+here.dataset.here);
      render2();
      return;
    }
    if (remove) {
      const i = +remove.dataset.removeStop;
      if (S2.waypoints.length <= 2) return;
      S2.waypoints.splice(i, 1);
      S2.names.splice(i, 1);
      APP.markers();
      render2();
      replan();
    }
  };
  $2("#addStop").onclick = () => {
    const at = Math.max(1, S2.waypoints.length - 1);
    S2.waypoints.splice(at, 0, null);
    S2.names.splice(at, 0, "");
    render2();
    requestAnimationFrame(() => APP.$(`#stop-${at} input`)?.focus());
  };
  if (n < 3) return;
  host.querySelectorAll("[data-grip]").forEach((grip) => {
    grip.onpointerdown = (e) => {
      e.preventDefault();
      const from = +grip.dataset.grip;
      const rows = [...host.querySelectorAll(".stop-row")];
      const dragged = rows[from];
      grip.setPointerCapture?.(e.pointerId);
      dragged.classList.add("dragging");
      let to = from;
      const move = (ev) => {
        const y = ev.clientY;
        to = rows.reduce((best, row, idx) => {
          const r = row.getBoundingClientRect();
          return y > r.top + r.height / 2 ? idx : best;
        }, 0);
        rows.forEach((row, idx) => row.classList.toggle("drop-above", idx === to && to !== from));
      };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        rows.forEach((row) => row.classList.remove("dragging", "drop-above"));
        if (to === from) return;
        const [p] = S2.waypoints.splice(from, 1);
        const [name] = S2.names.splice(from, 1);
        S2.waypoints.splice(to, 0, p);
        S2.names.splice(to, 0, name);
        APP.markers();
        render2();
        replan();
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
      grip.addEventListener("pointercancel", up);
    };
  });
}
function plannerHtml() {
  const S2 = state3();
  const routes2 = Array.isArray(S2.routes) ? S2.routes : [];
  const finishIndex = Math.max(1, (S2.waypoints?.length || 2) - 1);
  return `
  <div class="card pad flat">${stopsHtml()}</div>

  <div class="card pad flat">
    <div class="between">
      <div><b style="font-size:14px;display:block">Round trip</b><span class="muted" style="font-size:12px;font-weight:600">Generate a loop back to the start</span></div>
      <button class="toggle ${S2.planRoundTrip ? "on" : ""}" id="roundTrip" aria-pressed="${S2.planRoundTrip}"><i></i></button>
    </div>
    <div id="roundTripControls" ${S2.planRoundTrip ? "" : "hidden"} style="margin-top:12px">
      <div class="row" style="gap:14px;align-items:flex-start">
        <div style="flex:1">
          <div class="between" style="margin-bottom:2px"><span class="label">Distance</span><b style="color:var(--blue)" id="rangeLabel">${Math.round(S2.adventureRange.minKm)}\u2013${Math.round(S2.adventureRange.maxKm)} km</b></div>
          <div class="dual-range">
            <div class="track"></div><div class="fill" id="rangeFill"></div>
            <input id="rangeMin" type="range" min="5" max="150" step="5" value="${Math.round(S2.adventureRange.minKm)}">
            <input id="rangeMax" type="range" min="5" max="150" step="5" value="${Math.round(S2.adventureRange.maxKm)}">
          </div>
        </div>
        ${dialHtml(S2.planBearing)}
      </div>
    </div>
  </div>

  <div>
    <p class="section-title" style="margin-bottom:8px">Surface</p>
    <div class="row" id="surfaceChips" style="gap:8px;flex-wrap:wrap">${SURFACES.map((x) => `<button class="chip ${S2.planSurface === x ? "on" : ""}" data-surface="${x}">${x}</button>`).join("")}</div>
  </div>

  <button class="btn cta block" id="calcRoute">${icon("route", 18)}${S2.planRoundTrip ? "Generate loop" : "Find routes"}</button>

  <div id="planResults" class="page" style="gap:12px">
    ${routes2.length ? routes2.map((r, i) => routeResultHtml(r, i, S2.selected === i)).join("") : '<div class="empty">Set a start and finish, then find routes. Results show real distance, climbing and OpenStreetMap cycle-infrastructure coverage.</div>'}
  </div>`;
}
function wirePlanner() {
  const S2 = state3();
  const { $: $2 } = APP;
  wireStops();
  $2("#roundTrip").onclick = (e) => {
    S2.planRoundTrip = !S2.planRoundTrip;
    if (!S2.planRoundTrip && S2.pointPlan) {
      S2.waypoints = structuredClone(S2.pointPlan.waypoints);
      S2.names = structuredClone(S2.pointPlan.names);
      S2.pointPlan = null;
      S2.adventureWaypoints = [];
      S2.mode = "point";
      render2();
      return;
    }
    e.currentTarget.classList.toggle("on", S2.planRoundTrip);
    const box = $2("#roundTripControls");
    if (box) box.hidden = !S2.planRoundTrip;
    const btn = $2("#calcRoute");
    if (btn) btn.innerHTML = `${icon("route", 18)}${S2.planRoundTrip ? "Generate loop" : "Find routes"}`;
  };
  const syncRange = () => {
    let lo = +$2("#rangeMin").value, hi = +$2("#rangeMax").value;
    if (lo > hi) [lo, hi] = [hi, lo];
    S2.adventureRange = { minKm: lo, maxKm: hi };
    $2("#rangeLabel").textContent = `${lo}\u2013${hi} km`;
    const a = (lo - 5) / 145 * 100, b = (hi - 5) / 145 * 100;
    const fill = $2("#rangeFill");
    fill.style.left = `${a}%`;
    fill.style.width = `${Math.max(0, b - a)}%`;
  };
  if ($2("#rangeMin")) {
    $2("#rangeMin").oninput = syncRange;
    $2("#rangeMax").oninput = syncRange;
    syncRange();
  }
  const dial = $2("#dirDial");
  if (dial) {
    const setFromEvent = (e) => {
      const r = dial.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      S2.planBearing = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
      const g = dial.querySelector("g[transform]");
      if (g) g.setAttribute("transform", `rotate(${S2.planBearing} 48 48)`);
      const lbl = dial.parentElement.querySelector("small");
      const name = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(S2.planBearing / 45) % 8];
      if (lbl) lbl.textContent = `Head ${name} \xB7 ${Math.round(S2.planBearing)}\xB0`;
    };
    dial.onpointerdown = (e) => {
      dial.setPointerCapture(e.pointerId);
      setFromEvent(e);
      dial.onpointermove = setFromEvent;
    };
    dial.onpointerup = () => {
      dial.onpointermove = null;
    };
  }
  $2("#surfaceChips").onclick = (e) => {
    const b = e.target.closest("[data-surface]");
    if (!b) return;
    S2.planSurface = b.dataset.surface;
    $2("#surfaceChips").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  };
  $2("#calcRoute").onclick = async () => {
    if (S2.planRoundTrip) {
      const start2 = S2.waypoints?.[0] || await APP.current();
      if (!start2) return APP.toast("Set a start point first");
      const turf2 = window.turf;
      const away = (p) => Array.isArray(p) && turf2.distance(p, start2, { units: "kilometers" }) > 0.05;
      const vias = (S2.waypoints || []).slice(1).filter(away);
      if (vias.length) {
        S2.adventureWaypoints = vias.map((coord, i) => ({ coord, name: S2.names?.[i + 1] || "" }));
      }
      S2.pointPlan = { waypoints: structuredClone(S2.waypoints || []), names: structuredClone(S2.names || []) };
      S2.mode = "loop";
      S2.waypoints = [start2, start2];
      S2.names = [S2.names?.[0] || "", S2.names?.[0] || ""];
      await APP.adventureRoutes(false);
    } else {
      if (!S2.waypoints?.[0] || !S2.waypoints?.at(-1)) return APP.toast("Set both a start and a finish");
      S2.mode = "point";
      await APP.pointRoutes(false);
    }
    render2();
  };
  wireResults();
}
function wireResults() {
  const { $: $2 } = APP;
  const results = $2("#planResults");
  if (results) results.onclick = (e) => {
    const hit = (sel) => e.target.closest(`[data-${sel}]`);
    const nav = hit("nav"), save = hit("save"), share = hit("share"), prev = hit("preview"), gpx = hit("gpx"), card = hit("result");
    if (nav) {
      e.stopPropagation();
      APP.select(+nav.dataset.nav);
      APP.startNavigation();
      return;
    }
    if (save) {
      e.stopPropagation();
      APP.saveRouteByIndex(+save.dataset.save);
      return;
    }
    if (share) {
      e.stopPropagation();
      APP.shareRouteByIndex(+share.dataset.share);
      return;
    }
    if (prev) {
      e.stopPropagation();
      APP.select(+prev.dataset.preview);
      APP.previewRoute3D();
      return;
    }
    if (gpx) {
      e.stopPropagation();
      APP.select(+gpx.dataset.gpx);
      APP.exportSelectedRouteGpx();
      return;
    }
    if (card) {
      APP.select(+card.dataset.result);
      refreshResults();
    }
  };
}
function collectionsOf(items) {
  const set = /* @__PURE__ */ new Set();
  items.forEach((x) => {
    if (x.collection) set.add(x.collection);
  });
  return [...set];
}
function savedCardHtml(item, i) {
  const route = item.route || {};
  const km = (route.distance || 0) / 1e3;
  const diff = difficultyFor(km, route.ascent || 0);
  const coords = route.geometry?.coordinates;
  const img = coords ? staticRouteImage(coords, APP.MAPBOX_TOKEN, { w: 340, h: 190 }) : null;
  return `<article class="route-card" data-saved="${i}">
    <div class="route-media">
      ${img ? `<img src="${img}" alt="" loading="lazy">` : routeThumb(coords, 170, 96, { radius: 0 })}
      <div class="thumb-chip">${routeThumb(coords, 34, 34, { radius: 8 })}</div>
    </div>
    <div class="route-body">
      <b>${APP.escapeHtml(item.name || "Saved route")}</b>
      <span>${fmtKm(km)} \xB7 ${fmtM(route.ascent || 0)}${item.mode === "loop" ? " \xB7 loop" : ""}</span>
      <div class="between">
        <span class="badge ${diff.tone}">${diff.label}</span>
        <div class="row" style="gap:2px">
          <button class="iconbtn plain" data-share-saved="${i}" title="Share" aria-label="Share ${APP.escapeHtml(item.name || "route")}">${icon("share", 18)}</button>
          <button class="iconbtn plain danger" data-del="${i}" title="Delete" aria-label="Delete ${APP.escapeHtml(item.name || "route")}">${icon("trash", 18)}</button>
        </div>
      </div>
      <div class="row" style="gap:8px;margin-top:10px">
        <button class="btn primary sm" data-ride="${i}" style="flex:1">${icon("navArrow", 16)}Ride</button>
        <button class="btn light sm" data-edit="${i}" style="flex:1">${icon("edit", 16)}Edit</button>
      </div>
    </div>
  </article>`;
}
function libraryHtml() {
  const S2 = state3();
  if (!S2.user) {
    return `<div class="card account-required"><h2>Sign in required</h2><p>Saved routes are private to your account and sync across your devices.</p><button class="btn primary" id="libSignIn">Sign in</button></div>`;
  }
  const all = S2.accountRoutes || [];
  const cols = collectionsOf(all);
  const active2 = S2.libraryCollection || "All routes";
  const items = active2 === "All routes" ? all : all.filter((x) => x.collection === active2);
  return `
  <div class="between">
    <div class="hscroll" id="collections" style="flex:1">
      ${["All routes", ...cols].map((c) => `<button class="chip ${active2 === c ? "on" : ""}" data-collection="${APP.escapeHtml(c)}">${c === "All routes" ? "" : icon("folder", 14)}${APP.escapeHtml(c)}</button>`).join("")}
    </div>
    <div class="segmented" id="layoutToggle" style="width:88px;flex:0 0 auto">
      <button data-layout="grid" class="${S2.libraryLayout === "grid" ? "on" : ""}">${icon("grid", 18)}</button>
      <button data-layout="list" class="${S2.libraryLayout === "list" ? "on" : ""}">${icon("list", 18)}</button>
    </div>
  </div>
  <label class="btn light block" style="cursor:pointer">${icon("download", 18)}Import GPX<input id="importGpx" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden></label>
  ${items.length ? `<div class="route-grid ${S2.libraryLayout === "list" ? "list" : ""}" id="savedGrid">${items.map((item) => savedCardHtml(item, all.indexOf(item))).join("")}</div>` : `<div class="empty">${all.length ? "Nothing saved in this collection yet." : "No saved routes yet. Save a route from the planner or Adventure and it appears here."}</div>`}`;
}
function wireLibrary() {
  const S2 = state3();
  const { $: $2 } = APP;
  if (!S2.user) {
    const b = $2("#libSignIn");
    if (b) b.onclick = () => APP.open("profile");
    return;
  }
  $2("#importGpx").onchange = (e) => APP.importGpxFile(e.target.files[0]);
  $2("#layoutToggle").onclick = (e) => {
    const b = e.target.closest("[data-layout]");
    if (!b) return;
    S2.libraryLayout = b.dataset.layout;
    render2();
  };
  $2("#collections").onclick = (e) => {
    const b = e.target.closest("[data-collection]");
    if (!b) return;
    S2.libraryCollection = b.dataset.collection;
    render2();
  };
  const grid = $2("#savedGrid");
  if (grid) grid.onclick = async (e) => {
    const saved = S2.accountRoutes || [];
    const ride = e.target.closest("[data-ride]");
    const edit = e.target.closest("[data-edit]");
    const share = e.target.closest("[data-share-saved]");
    const del = e.target.closest("[data-del]");
    const card = e.target.closest("[data-saved]");
    if (ride) {
      e.stopPropagation();
      APP.loadSavedRoute(saved[+ride.dataset.ride], false);
      await APP.startNavigation();
      return;
    }
    if (edit) {
      e.stopPropagation();
      APP.loadSavedRoute(saved[+edit.dataset.edit], true);
      return;
    }
    if (share) {
      e.stopPropagation();
      APP.shareSavedRouteByIndex(+share.dataset.shareSaved);
      return;
    }
    if (del) {
      e.stopPropagation();
      const item = saved[+del.dataset.del];
      if (!item || !confirm(`Delete "${item.name || "this route"}"?`)) return;
      await APP.deleteAccountItem("routes", item.id);
      render2();
      return;
    }
    if (card) APP.loadSavedRoute(saved[+card.dataset.saved], false);
  };
}
function refreshResults() {
  const S2 = state3();
  const host = APP.$("#planResults");
  if (!host) return false;
  const routes2 = Array.isArray(S2.routes) ? S2.routes : [];
  host.innerHTML = routes2.length ? routes2.map((r, i) => routeResultHtml(r, i, S2.selected === i)).join("") : '<div class="empty">Set a start and finish, then find routes.</div>';
  wireResults();
  return true;
}
async function render2() {
  if (!APP.isCurrentPage("plan")) return;
  const S2 = state3();
  APP.panel.innerHTML = `<div class="page">
    ${rootHeader("Plan route", "Build a route, or open one you saved")}
    ${segmentedHtml(S2.planView)}
    <div id="planBody" class="page">${S2.planView === "library" ? libraryHtml() : plannerHtml()}</div>
  </div>`;
  APP.$("#planTabs").onclick = (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    S2.planView = b.dataset.view;
    render2();
  };
  if (S2.planView === "library") wireLibrary();
  else wirePlanner();
}

// src/ui/pages/record.js
var SORTS = [
  ["date-desc", "Newest first"],
  ["distance-desc", "Distance: high to low"],
  ["distance-asc", "Distance: low to high"],
  ["gain-desc", "Elevation: high to low"],
  ["gain-asc", "Elevation: low to high"],
  ["speed-desc", "Speed: high to low"],
  ["speed-asc", "Speed: low to high"],
  ["effort-desc", "Effort: high to low"],
  ["effort-asc", "Effort: low to high"]
];
var recordedTrace = (a) => (a?.samples || []).map((s) => s.pos).filter(Boolean);
var traceOf = (a) => {
  const recorded = recordedTrace(a);
  if (recorded.length > 1) return recorded;
  return Array.isArray(a?.plannedRoute) && a.plannedRoute.length > 1 ? a.plannedRoute : recorded;
};
var traceIsPlanned = (a) => recordedTrace(a).length <= 1 && Array.isArray(a?.plannedRoute) && a.plannedRoute.length > 1;
function achievementsFor(activity, others) {
  const out = [];
  const rest = others.filter((x) => x !== activity && x.id !== activity.id);
  if (!rest.length) {
    out.push({ icon: "flag", label: "First saved ride", tone: "var(--green)" });
    return out;
  }
  if (rest.every((x) => (x.distance || 0) < (activity.distance || 0))) out.push({ icon: "route", label: "Longest ride yet", tone: "var(--blue)" });
  if (rest.every((x) => (x.gain || 0) < (activity.gain || 0))) out.push({ icon: "mtn", label: "Biggest climb yet", tone: "var(--accent)" });
  if (rest.every((x) => (x.avgSpeed || 0) < (activity.avgSpeed || 0))) out.push({ icon: "bolt", label: "Fastest average yet", tone: "var(--gold)" });
  return out;
}
function detailHtml(a, index) {
  const S2 = APP.state;
  const trace = traceOf(a);
  const img = trace.length > 1 ? staticRouteImage(trace, APP.MAPBOX_TOKEN, { w: 640, h: 300 }) : null;
  const weight = APP.profileData().weight || 70;
  const photos = a.photos || [a.photo].filter(Boolean);
  const wins = achievementsFor(a, S2.accountActivities || []);
  return `<div class="page">
    ${viewHeader(a.name || "Activity", new Date(a.ended || a.started || Date.now()).toLocaleString())}
    <div class="card hero-card">
      <div class="hero-media" style="height:170px">${img ? `<img src="${img}" alt="${traceIsPlanned(a) ? "Planned route" : "Route ridden"}" loading="lazy">` : routeThumb(trace, 358, 170, { radius: 0 })}
        ${traceIsPlanned(a) ? '<span class="mini-tag">Planned route</span>' : ""}</div>
    </div>
    ${wins.length ? `<section><p class="section-title" style="margin-bottom:8px">Achievements</p><div class="row" style="gap:8px;flex-wrap:wrap">${wins.map((w) => `<span class="badge gold" style="min-height:30px;padding:0 12px">${icon(w.icon, 14)}${w.label}</span>`).join("")}</div></section>` : ""}
    <div class="stats">
      <div class="stat tile"><b>${fmtKm(a.distance)}</b><small>distance</small></div>
      <div class="stat tile"><b>${(a.avgSpeed || 0).toFixed(1)}</b><small>avg km/h</small></div>
      <div class="stat tile"><b>${fmtM(a.gain)}</b><small>climb</small></div>
      <div class="stat tile"><b>${APP.formatClock(a.elapsed || 0)}</b><small>moving</small></div>
      <div class="stat tile"><b>${Math.round(a.effortScore || 0)}</b><small>effort</small></div>
      <div class="stat tile"><b>${Math.round(a.avgPower || 0)}</b><small>est. watts</small></div>
      <div class="stat tile"><b>${((a.avgPower || 0) / weight).toFixed(2)}</b><small>W/kg</small></div>
      <div class="stat tile"><b>${Math.round(a.maxSpeed || 0)}</b><small>max km/h</small></div>
    </div>
    <p class="metric-note">Power and effort are estimates from GPS speed, elevation and your rider profile \u2014 not power-meter readings.</p>
    <section>
      <div class="between" style="margin-bottom:6px"><span class="section-title">Photos</span>
        <label class="btn light sm" style="cursor:pointer">${icon("plus", 16)}Add<input id="addPhotos" type="file" accept="image/*" multiple hidden></label>
      </div>
      ${photos.length ? `<div class="photo-grid">${photos.map((p, i) => `<div><img src="${p}" alt=""><button data-del-photo="${i}">\xD7</button></div>`).join("")}</div>` : '<div class="empty" style="padding:14px">No photos on this ride.</div>'}
    </section>
    <section class="card pad flat">
      <div class="label">Speed (km/h)</div><canvas id="activitySpeed" class="chart detail-chart"></canvas>
      <div class="label">Elevation (m)</div><canvas id="activityElevation" class="chart detail-chart"></canvas>
      <div class="label">Wind at ride time</div><canvas id="activityWind" class="chart detail-chart"></canvas>
      <div class="label">Estimated power (W)</div><canvas id="activityPower" class="chart detail-chart"></canvas>
      ${(a.samples || []).some((x) => Number.isFinite(x.heartRate)) ? '<div class="label">Heart rate (bpm)</div><canvas id="activityHr" class="chart detail-chart"></canvas>' : ""}
      ${(a.samples || []).some((x) => Number.isFinite(x.cadence)) ? '<div class="label">Cadence (rpm)</div><canvas id="activityCad" class="chart detail-chart"></canvas>' : ""}
    </section>
    <div class="actions">
      <button class="btn primary" id="useRoute">${icon("route", 16)}Use this route</button>
      <button class="btn light" id="renameAct">${icon("sliders", 16)}Rename</button>
      <button class="btn light" id="shareAct">${icon("share", 16)}Share</button>
      <button class="btn light" id="pngAct">${icon("camera", 16)}Export PNG</button>
    </div>
  </div>`;
}
function wireDetail(a, index) {
  const S2 = APP.state;
  const { $: $2 } = APP;
  APP.displayActivityRoute(a);
  requestAnimationFrame(() => {
    const s = a.samples || [];
    APP.plot($2("#activitySpeed"), s.map((x) => (x.speed || 0) * 3.6), "#f28b30", "km/h");
    APP.plot($2("#activityElevation"), s.map((x) => x.elevation).filter(Number.isFinite), "#139b66", "m");
    APP.plot($2("#activityWind"), s.map((x) => x.windSpeed).filter(Number.isFinite), "#176bdb", "km/h");
    APP.plot($2("#activityPower"), s.map((x) => x.estimatedPower || 0), "#8b5bd6", "W");
    if ($2("#activityHr")) APP.plot($2("#activityHr"), s.map((x) => x.heartRate).filter(Number.isFinite), "#d94d4d", "bpm");
    if ($2("#activityCad")) APP.plot($2("#activityCad"), s.map((x) => x.cadence).filter(Number.isFinite), "#00a6a6", "rpm");
  });
  wireHeader(() => {
    S2.activityDetailIndex = null;
    render3();
  });
  $2("#addPhotos").onchange = (e) => APP.addPhotosToSavedActivity(index, [...e.target.files]);
  $2("#useRoute").onclick = () => APP.useSavedActivityRoute(a);
  $2("#renameAct").onclick = () => APP.renameSavedActivity(index);
  $2("#shareAct").onclick = () => APP.shareSavedActivity(a);
  $2("#pngAct").onclick = () => APP.exportActivityPng(a);
  APP.panel.querySelectorAll("[data-del-photo]").forEach((b) => {
    b.onclick = () => APP.deleteSavedPhoto(index, +b.dataset.delPhoto);
  });
}
function pendingHtml(d) {
  const S2 = APP.state;
  const trace = traceOf(d);
  const img = trace.length > 1 ? staticRouteImage(trace, APP.MAPBOX_TOKEN, { w: 640, h: 300 }) : null;
  const photos = d.photos || [];
  const wins = achievementsFor(d, S2.accountActivities || []);
  return `<div class="page">
    ${rootHeader("Ride complete", "Name it, add photos, then save")}
    <div class="card hero-card"><div class="hero-media" style="height:170px">${img ? `<img src="${img}" alt="">` : routeThumb(trace, 358, 170, { radius: 0 })}</div></div>
    <div class="field"><label>Activity name</label><input id="activityName" type="text" value="${APP.escapeHtml(d.name || "")}"></div>
    <div class="stats">
      <div class="stat tile"><b>${fmtKm(d.distance)}</b><small>distance</small></div>
      <div class="stat tile"><b>${(d.avgSpeed || 0).toFixed(1)}</b><small>avg km/h</small></div>
      <div class="stat tile"><b>${fmtM(d.gain)}</b><small>climb</small></div>
      <div class="stat tile"><b>${Math.round(d.effortScore || 0)}</b><small>effort</small></div>
    </div>
    ${wins.length ? `<section><p class="section-title" style="margin-bottom:8px">Achievements</p><div class="row" style="gap:8px;flex-wrap:wrap">${wins.map((w) => `<span class="badge gold" style="min-height:30px;padding:0 12px">${icon(w.icon, 14)}${w.label}</span>`).join("")}</div></section>` : ""}
    <section>
      <div class="between" style="margin-bottom:6px"><span class="section-title">Photos</span><span class="muted" style="font-size:12px;font-weight:600">${photos.length}/6</span></div>
      <div class="photo-grid">
        ${photos.map((p, i) => `<div><img src="${p}" alt=""><button data-del-pending="${i}">\xD7</button></div>`).join("")}
        ${photos.length < 6 ? `<label class="photo-add" style="cursor:pointer">${icon("plus", 22)}<input id="activityPhotos" type="file" accept="image/*" multiple hidden></label>` : ""}
      </div>
    </section>
    <div class="card pad flat">
      <div class="between">
        <div><b style="font-size:14px;display:block">Share to feed</b><span class="muted" style="font-size:12px;font-weight:600">Visible to riders who follow you</span></div>
        <input type="checkbox" id="shareToFeed" checked hidden>
        <button class="toggle on" id="shareToggle" aria-pressed="true"><i></i></button>
      </div>
      <div class="between" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
        <div><b style="font-size:13px;display:block">Hide start and finish</b><span class="muted" style="font-size:12px;font-weight:600">Keeps your address off the shared map</span></div>
        <select id="privacyRadius" style="min-height:40px;font-size:13px;max-width:130px">
          ${[[0, "Show all"], [200, "200 m"], [400, "400 m"], [800, "800 m"], [1500, "1.5 km"]].map(([m, label]) => `<option value="${m}" ${(APP.ridePrefs().privacyRadiusM ?? 400) === m ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="row" style="gap:10px">
      <button class="btn light" id="discardActivity" style="flex:1">Discard</button>
      <button class="btn cta" id="saveActivity" style="flex:2">Save ride</button>
    </div>
  </div>`;
}
function wirePending() {
  const S2 = APP.state;
  const { $: $2 } = APP;
  const photos = $2("#activityPhotos");
  if (photos) photos.onchange = (e) => APP.attachActivityPhotos([...e.target.files]);
  $2("#shareToggle").onclick = (e) => {
    const radius = $2("#privacyRadius");
    if (radius) radius.onchange = () => {
      const prefs = APP.ridePrefs();
      prefs.privacyRadiusM = Number(radius.value);
      APP.saveRidePrefs();
      APP.toast(prefs.privacyRadiusM ? `Start and finish hidden within ${prefs.privacyRadiusM} m` : "Whole route will be shared");
    };
    const box = $2("#shareToFeed");
    box.checked = !box.checked;
    e.currentTarget.classList.toggle("on", box.checked);
    e.currentTarget.setAttribute("aria-pressed", String(box.checked));
  };
  $2("#saveActivity").onclick = () => APP.savePendingActivity();
  $2("#discardActivity").onclick = () => {
    S2.pendingActivity = null;
    render3();
  };
  APP.panel.querySelectorAll("[data-del-pending]").forEach((b) => {
    b.onclick = () => {
      S2.pendingActivity.photos.splice(+b.dataset.delPending, 1);
      render3();
    };
  });
}
function activityRowHtml(a, index) {
  const trace = traceOf(a);
  return `<article class="route-card" data-activity="${index}" style="display:grid;grid-template-columns:96px 1fr">
    <div class="route-media" style="height:100%;min-height:86px">${trace.length > 1 ? `<img src="${staticRouteImage(trace, APP.MAPBOX_TOKEN, { w: 192, h: 172 })}" alt="${traceIsPlanned(a) ? "Planned route" : "Route ridden"}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">
         ${traceIsPlanned(a) ? '<span class="mini-tag">Planned</span>' : ""}` : `<div class="mini-media-empty">${icon("route", 15)}<span>No route</span></div>`}</div>
    <div class="route-body">
      <b>${APP.escapeHtml(a.name || "Cycling activity")}</b>
      <span>${new Date(a.ended || a.started || Date.now()).toLocaleDateString()}</span>
      <div class="row" style="gap:12px;font-size:12px;font-weight:700">
        <span>${fmtKm(a.distance)}</span><span>${fmtM(a.gain)}</span><span>${(a.avgSpeed || 0).toFixed(1)} km/h</span>
      </div>
    </div>
  </article>`;
}
function homeHtml() {
  const S2 = APP.state;
  const r = S2.record;
  const list = APP.sortedActivities();
  const live = r ? `<div class="card pad flat">
        <div class="between" style="margin-bottom:10px"><span class="row" style="gap:8px;font-weight:800">${icon("record", 18)}${r.paused ? "Paused" : "Recording"}</span><span class="badge ${r.paused ? "orange" : "green"}">${APP.formatClock(r.movingMs)}</span></div>
        <div class="stats">
          <div class="stat tile"><b>${APP.displaySpeed(r).toFixed(1)}</b><small>${r.paused ? "avg" : "current"} km/h</small></div>
          <div class="stat tile"><b>${(r.distance || 0).toFixed(2)}</b><small>km</small></div>
          <div class="stat tile"><b>${Math.round(r.gain || 0)}</b><small>m gain</small></div>
          <div class="stat tile"><b>${Math.round(r.samples?.at(-1)?.estimatedPower || 0)}</b><small>est. W</small></div>
        </div>
        <div class="row" style="gap:10px;margin-top:12px">
          <button class="btn light" id="stopRec" style="flex:1">Stop recording</button>
          ${S2.navState ? '<button class="btn danger" id="endNav" style="flex:1">End navigation</button>' : ""}
        </div>
      </div>` : `<button class="btn cta block" id="startRec" style="min-height:56px">${icon("record", 22)}Start recording</button>`;
  return `<div class="page">
    ${rootHeader("Record", r ? "Ride in progress" : "Track a ride and review your activities")}
    ${live}
    <div class="card pad flat">
      <div class="between" style="margin-bottom:8px"><span class="section-title">Sensors</span><span class="muted" style="font-size:11px;font-weight:700" id="sensorState"></span></div>
      <div class="row" style="gap:8px">
        <button class="btn light sm" id="connectHr" style="flex:1">${icon("heartRate", 16)}Heart rate</button>
        <button class="btn light sm" id="connectCad" style="flex:1">${icon("cadence", 16)}Cadence</button>
      </div>
    </div>
    <div class="between">
      <span class="section-title">Activities</span>
      <select id="activitySort" style="width:auto;min-height:38px;font-size:13px">${SORTS.map(([v, l]) => `<option value="${v}" ${S2.activitySort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    </div>
    ${list.length ? `<div class="route-grid list" id="activityList">${list.map((x) => activityRowHtml(x.activity, x.index)).join("")}</div>` : '<div class="empty">Completed rides appear here once you record and save one.</div>'}
  </div>`;
}
function wireHome() {
  const S2 = APP.state;
  const { $: $2 } = APP;
  const start2 = $2("#startRec");
  if (start2) start2.onclick = () => APP.startRecord(false);
  const stop = $2("#stopRec");
  if (stop) stop.onclick = () => APP.stopRecording();
  const end = $2("#endNav");
  if (end) end.onclick = () => APP.endNavigation();
  const sensors = APP.sensors;
  const sensorState = $2("#sensorState");
  const paintSensors = () => {
    if (!sensorState) return;
    if (!sensors.isSupported()) {
      sensorState.textContent = "Not supported on this browser";
      return;
    }
    const bits = [];
    if (sensors.hrConnected()) bits.push("HR connected");
    if (sensors.cadenceConnected()) bits.push("Cadence connected");
    sensorState.textContent = bits.length ? bits.join(" \xB7 ") : "Not connected";
  };
  paintSensors();
  const connect = async (fn, btn) => {
    if (!sensors.isSupported()) return APP.toast("Bluetooth sensors need Chrome on Android or desktop");
    btn.disabled = true;
    try {
      const name = await fn();
      APP.toast(`Connected ${name}`);
    } catch (e) {
      if (e?.name !== "NotFoundError") APP.toast(e.message || "Could not connect");
    } finally {
      btn.disabled = false;
      paintSensors();
    }
  };
  const hrBtn = $2("#connectHr");
  if (hrBtn) hrBtn.onclick = () => connect(sensors.connectHeartRate, hrBtn);
  const cadBtn = $2("#connectCad");
  if (cadBtn) cadBtn.onclick = () => connect(sensors.connectCadence, cadBtn);
  const sort = $2("#activitySort");
  if (sort) sort.onchange = (e) => {
    S2.activitySort = e.target.value;
    render3();
  };
  const list = $2("#activityList");
  if (list) list.onclick = (e) => {
    const card = e.target.closest("[data-activity]");
    if (!card) return;
    S2.activityDetailIndex = +card.dataset.activity;
    render3();
  };
}
async function render3() {
  if (!APP.isCurrentPage("record")) return;
  const S2 = APP.state;
  const activities = S2.accountActivities || [];
  if (Number.isInteger(S2.activityDetailIndex) && activities[S2.activityDetailIndex]) {
    const a = activities[S2.activityDetailIndex];
    APP.panel.innerHTML = detailHtml(a, S2.activityDetailIndex);
    wireDetail(a, S2.activityDetailIndex);
    return;
  }
  if (S2.pendingActivity) {
    APP.panel.innerHTML = pendingHtml(S2.pendingActivity);
    wirePending();
    return;
  }
  if (!S2.user && !S2.record) {
    APP.panel.innerHTML = `<div class="page">${rootHeader("Record", "Ride recording and activities")}
      <div class="card account-required"><h2>Sign in required</h2><p>Recorded rides are stored in your account so they sync across devices.</p><button class="btn primary" id="recSignIn">Sign in</button></div></div>`;
    APP.$("#recSignIn").onclick = () => APP.open("profile");
    return;
  }
  APP.panel.innerHTML = homeHtml();
  wireHome();
}

// src/social/chat.js
var MAX_LENGTH = 800;
var PAGE = 100;
function messagePath(clubId, eventId) {
  return eventId ? ["clubs", clubId, "events", eventId, "messages"] : ["clubs", clubId, "messages"];
}
function messageAuthor(user) {
  return {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "Rider",
    photoURL: user.photoURL || null
  };
}
async function sendMessage(user, { clubId, eventId, text }) {
  const body = (text || "").trim().slice(0, MAX_LENGTH);
  if (!body) throw new Error("Nothing to send");
  if (!clubId) throw new Error("No club");
  const db = await getCloud();
  await db.addDoc(db.collection(db.firestore, ...messagePath(clubId, eventId)), {
    ...messageAuthor(user),
    text: body,
    // A client clock, so an optimistic local echo and the stored value sort the
    // same way. Ordering within a busy second is not worth a server round trip.
    sentAt: Date.now()
  });
}
function watchMessages({ clubId, eventId }, onChange, max = PAGE) {
  let stop = null;
  let cancelled = false;
  getCloud().then((db) => {
    if (cancelled) return;
    const q = db.query(
      db.collection(db.firestore, ...messagePath(clubId, eventId)),
      db.orderBy("sentAt", "desc"),
      db.limit(max)
    );
    stop = db.onSnapshot(
      q,
      (snap) => {
        if (cancelled) return;
        onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse());
      },
      (error) => {
        console.warn("Chat stream failed", error);
        if (!cancelled) onChange(null);
      }
    );
  }).catch((error) => {
    console.warn("Chat unavailable", error);
    if (!cancelled) onChange(null);
  });
  return () => {
    cancelled = true;
    if (stop) stop();
    stop = null;
  };
}
async function deleteMessage({ clubId, eventId, id }) {
  const db = await getCloud();
  await db.deleteDoc(db.doc(db.firestore, ...messagePath(clubId, eventId), id));
}

// src/ui/components/chat.js
var active = null;
function unmountChat() {
  if (!active) return;
  active.stop();
  active = null;
}
function initials(name) {
  return (name || "R").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}
function avatarColor(uid2) {
  let h = 0;
  for (const ch of String(uid2 || "")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 62% 46%)`;
}
function timeLabel(ms) {
  const d = new Date(ms || Date.now());
  const today = /* @__PURE__ */ new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
function messageHtml(m, mine) {
  return `<div class="chat-msg${mine ? " mine" : ""}" data-msg="${APP.escapeHtml(m.id)}">
    ${mine ? "" : `<span class="avatar sm" style="background:${avatarColor(m.uid)}">${initials(m.displayName)}</span>`}
    <div class="chat-bubble">
      ${mine ? "" : `<b>${APP.escapeHtml(m.displayName || "Rider")}</b>`}
      <p>${APP.escapeHtml(m.text || "")}</p>
      <span class="chat-time">${timeLabel(m.sentAt)}${mine ? ` \xB7 <button class="chat-del" data-del="${APP.escapeHtml(m.id)}">Delete</button>` : ""}</span>
    </div>
  </div>`;
}
function mountChat(hostId, { clubId, eventId, title, emptyText }) {
  unmountChat();
  const host = APP.$(`#${hostId}`);
  if (!host) return;
  const S2 = APP.state;
  if (!S2.user) {
    host.innerHTML = `<div class="empty" style="padding:14px">Sign in to join the conversation.</div>`;
    return;
  }
  host.innerHTML = `<section class="chat">
    <div class="between" style="margin-bottom:8px">
      <span class="section-title">${APP.escapeHtml(title)}</span>
      <span class="muted" style="font-size:11px;font-weight:700" id="${hostId}-count"></span>
    </div>
    <div class="chat-log" id="${hostId}-log"><div class="empty" style="padding:14px">Loading messages\u2026</div></div>
    <form class="chat-compose" id="${hostId}-form">
      <input id="${hostId}-input" type="text" maxlength="800" placeholder="Message the group" autocomplete="off">
      <button class="btn primary sm" type="submit" aria-label="Send">${icon("send", 16)}</button>
    </form>
  </section>`;
  const log = APP.$(`#${hostId}-log`);
  const form = APP.$(`#${hostId}-form`);
  const input = APP.$(`#${hostId}-input`);
  const count = APP.$(`#${hostId}-count`);
  const stop = watchMessages({ clubId, eventId }, (messages) => {
    if (!document.body.contains(log)) return;
    if (messages === null) {
      log.innerHTML = `<div class="empty" style="padding:14px">Messages could not be loaded.</div>`;
      return;
    }
    count.textContent = messages.length ? `${messages.length} message${messages.length === 1 ? "" : "s"}` : "";
    log.innerHTML = messages.length ? messages.map((m) => messageHtml(m, m.uid === S2.user.uid)).join("") : `<div class="empty" style="padding:14px">${APP.escapeHtml(emptyText)}</div>`;
    log.scrollTop = log.scrollHeight;
  });
  active = { stop, hostId };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.disabled = true;
    try {
      await sendMessage(S2.user, { clubId, eventId, text });
    } catch (error) {
      console.warn("Message failed to send", error);
      APP.toast("Message could not be sent");
      input.value = text;
    } finally {
      input.disabled = false;
      input.focus();
    }
  };
  log.onclick = async (e) => {
    const b = e.target.closest("[data-del]");
    if (!b) return;
    try {
      await deleteMessage({ clubId, eventId, id: b.dataset.del });
    } catch (error) {
      console.warn("Message delete failed", error);
      APP.toast("Could not delete that message");
    }
  };
}

// src/social/clubs.js
async function listClubs(max = 20) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(db.query(db.collection(db.firestore, "clubs"), db.limit(max)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn("Clubs unavailable", error);
    return [];
  }
}
async function createClub(user, { name, blurb = "" }) {
  const db = await getCloud();
  const ref = await db.addDoc(db.collection(db.firestore, "clubs"), {
    name: name.slice(0, 80),
    blurb: blurb.slice(0, 200),
    createdBy: user.uid,
    createdAt: db.serverTimestamp(),
    memberCount: 1
  });
  await joinClub(user, ref.id);
  return ref.id;
}
async function joinClub(user, clubId) {
  const db = await getCloud();
  await db.setDoc(db.doc(db.firestore, "clubs", clubId, "members", user.uid), {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "Rider",
    joinedAt: db.serverTimestamp()
  });
  await db.setDoc(db.doc(db.firestore, "clubs", clubId), { memberCount: db.increment(1) }, { merge: true });
}
async function leaveClub(user, clubId) {
  const db = await getCloud();
  await db.deleteDoc(db.doc(db.firestore, "clubs", clubId, "members", user.uid));
  await db.setDoc(db.doc(db.firestore, "clubs", clubId), { memberCount: db.increment(-1) }, { merge: true });
}
async function isClubMember(uid2, clubId) {
  try {
    const db = await getCloud();
    const snap = await db.getDoc(db.doc(db.firestore, "clubs", clubId, "members", uid2));
    return snap.exists();
  } catch {
    return false;
  }
}
async function listMembers(clubId, max = 60) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(db.query(db.collection(db.firestore, "clubs", clubId, "members"), db.limit(max)));
    return snap.docs.map((d) => d.data());
  } catch {
    return [];
  }
}
async function listEvents(clubId, max = 10) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(
      db.query(db.collection(db.firestore, "clubs", clubId, "events"), db.orderBy("startsAt", "asc"), db.limit(max))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}
async function createEvent(user, clubId, { title, startsAt, meetPoint, distanceKm, route }) {
  if (!route?.id) throw new Error("A club ride needs a saved route");
  const db = await getCloud();
  const ref = await db.addDoc(db.collection(db.firestore, "clubs", clubId, "events"), {
    title: title.slice(0, 100),
    startsAt,
    meetPoint: (meetPoint || "").slice(0, 120),
    // Taken from the route itself rather than typed, so the figure on the
    // calendar always matches the line everyone will actually ride.
    distanceKm: Number(distanceKm) || 0,
    routeId: route.id,
    routeName: (route.name || "Route").slice(0, 120),
    routeGeoJson: route.geoJson || null,
    createdBy: user.uid,
    goingCount: 0
  });
  return ref.id;
}
async function toggleAttendance(user, clubId, eventId, going) {
  const db = await getCloud();
  const ref = db.doc(db.firestore, "clubs", clubId, "events", eventId, "attendees", user.uid);
  if (going) {
    await db.deleteDoc(ref);
  } else {
    await db.setDoc(ref, { uid: user.uid, displayName: user.displayName || "Rider" });
  }
  await db.setDoc(
    db.doc(db.firestore, "clubs", clubId, "events", eventId),
    { goingCount: db.increment(going ? -1 : 1) },
    { merge: true }
  );
}
async function isAttending(uid2, clubId, eventId) {
  try {
    const db = await getCloud();
    const snap = await db.getDoc(db.doc(db.firestore, "clubs", clubId, "events", eventId, "attendees", uid2));
    return snap.exists();
  } catch {
    return false;
  }
}
async function clubLeaderboard(clubId, sinceMs, metric = "distanceKm") {
  const members = await listMembers(clubId);
  if (!members.length) return [];
  try {
    const db = await getCloud();
    const uids = members.map((m) => m.uid);
    const chunks = [];
    for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));
    const snaps = await Promise.all(
      chunks.map(
        (chunk) => db.getDocs(
          db.query(
            db.collection(db.firestore, "activities"),
            db.where("ownerId", "in", chunk),
            db.where("startedAt", ">=", sinceMs)
          )
        )
      )
    );
    const totals = /* @__PURE__ */ new Map();
    snaps.forEach(
      (snap) => snap.docs.forEach((d) => {
        const a = d.data();
        const key = a.ownerId;
        const add = metric === "elevationGainM" ? a.elevationGainM || 0 : a.distanceKm || 0;
        const row = totals.get(key) || { uid: key, name: a.ownerDisplayName || "Rider", total: 0, rides: 0 };
        row.total += add;
        row.rides += 1;
        totals.set(key, row);
      })
    );
    members.forEach((m) => {
      if (!totals.has(m.uid)) totals.set(m.uid, { uid: m.uid, name: m.displayName || "Rider", total: 0, rides: 0 });
    });
    return [...totals.values()].sort((a, b) => b.total - a.total);
  } catch (error) {
    console.warn("Leaderboard unavailable", error);
    return [];
  }
}
async function listChallenges(nowMs, max = 10) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(
      db.query(db.collection(db.firestore, "challenges"), db.where("endsAt", ">=", nowMs), db.orderBy("endsAt", "asc"), db.limit(max))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn("Challenges unavailable", error);
    return [];
  }
}
async function createChallenge(user, { title, targetKm, startsAt, endsAt }) {
  const db = await getCloud();
  const ref = await db.addDoc(db.collection(db.firestore, "challenges"), {
    title: title.slice(0, 100),
    targetKm: Number(targetKm) || 0,
    startsAt,
    endsAt,
    createdBy: user.uid
  });
  await joinChallenge(user, ref.id);
  return ref.id;
}
async function joinChallenge(user, challengeId) {
  const db = await getCloud();
  await db.setDoc(db.doc(db.firestore, "challenges", challengeId, "participants", user.uid), {
    uid: user.uid,
    displayName: user.displayName || "Rider",
    joinedAt: db.serverTimestamp()
  });
}
async function leaveChallenge(user, challengeId) {
  const db = await getCloud();
  await db.deleteDoc(db.doc(db.firestore, "challenges", challengeId, "participants", user.uid));
}
async function isInChallenge(uid2, challengeId) {
  try {
    const db = await getCloud();
    const snap = await db.getDoc(db.doc(db.firestore, "challenges", challengeId, "participants", uid2));
    return snap.exists();
  } catch {
    return false;
  }
}
function challengeProgressKm(activities, challenge) {
  const from = challenge.startsAt || 0;
  const to = challenge.endsAt || Infinity;
  return (activities || []).reduce((sum, a) => {
    const t = a.ended || a.started || 0;
    return t >= from && t <= to ? sum + (a.distance || 0) : sum;
  }, 0);
}

// src/ui/pages/segments.js
var WEEK = 7 * 864e5;
var initials2 = (n = "") => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "R";
var avatarColor2 = (uid2 = "") => ["#8b5bd6", "#00a6a6", "#176bdb", "#f28b30", "#139b66"][[...uid2].reduce((a, c) => a + c.charCodeAt(0), 0) % 5];
var startOfWeek = () => {
  const d = /* @__PURE__ */ new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d.getTime();
};
function view() {
  const S2 = APP.state;
  if (!S2.segmentsView) S2.segmentsView = "home";
  return S2;
}
var goHome2 = () => {
  APP.state.segmentsView = "home";
  render4();
};
function eventRowHtml(clubId, e, going) {
  const d = new Date(e.startsAt || Date.now());
  return `<div class="between" style="padding:10px 0;border-top:1px solid var(--line)">
    <button class="row event-open" data-event="${APP.escapeHtml(e.id)}" style="gap:10px;background:none;border:0;padding:0;text-align:left;flex:1">
      <div class="event-date"><b>${d.getDate()}</b><small>${d.toLocaleDateString([], { month: "short" }).toUpperCase()}</small></div>
      <div>
        <b style="font-size:14px;display:block">${APP.escapeHtml(e.title || "Group ride")}${e.distanceKm ? ` \xB7 ${Math.round(e.distanceKm)} km` : ""}</b>
        <span class="muted" style="font-size:12px;font-weight:600">${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${e.meetPoint ? ` \xB7 ${APP.escapeHtml(e.meetPoint)}` : ""} \xB7 ${e.goingCount || 0} going</span>
        ${e.routeName ? `<span class="muted" style="font-size:11px;font-weight:700;display:block;margin-top:2px">${icon("route", 11)} ${APP.escapeHtml(e.routeName)}</span>` : ""}
      </div>
    </button>
    <button class="btn ${going ? "light" : "primary"} sm" data-going="${APP.escapeHtml(e.id)}" data-club="${APP.escapeHtml(clubId)}" data-on="${going ? "1" : "0"}">${going ? "Going" : "Join"}</button>
  </div>`;
}
function clubCardHtml(club, i, member) {
  return `<article class="card" style="overflow:hidden">
    <button style="display:block;width:100%;padding:0;background:transparent;text-align:left" data-club-open="${APP.escapeHtml(club.id)}">
      <div style="position:relative">${terrainPlaceholder(390, 96, ["forest", "coast", "warm", "cool"][i % 4], 0)}
        <div style="position:absolute;left:14px;bottom:10px;color:#fff;text-shadow:0 1px 6px #0006">
          <b style="font-size:17px;font-weight:800;display:block">${APP.escapeHtml(club.name || "Club")}</b>
          <span style="font-size:12px;font-weight:600;opacity:.92">${club.memberCount || 0} member${club.memberCount === 1 ? "" : "s"}</span>
        </div>
      </div>
    </button>
    <div style="padding:12px 14px">
      ${club.blurb ? `<p class="muted" style="font-size:12px;font-weight:600;margin-bottom:10px">${APP.escapeHtml(club.blurb)}</p>` : ""}
      <button class="btn ${member ? "light" : "primary"} sm block" data-join-club="${APP.escapeHtml(club.id)}" data-on="${member ? "1" : "0"}">${member ? "Joined" : "Join club"}</button>
    </div>
  </article>`;
}
function challengeCardHtml(c, joined, progressKm) {
  const pct = Math.max(0, Math.min(100, progressKm / Math.max(1, c.targetKm) * 100));
  const daysLeft = Math.max(0, Math.ceil(((c.endsAt || 0) - Date.now()) / 864e5));
  return `<div class="card challenge-card">
    <div class="between">
      <div>
        <span class="badge" style="background:#ffffff1f;color:#fff">Challenge</span>
        <b style="font-size:18px;font-weight:800;display:block;margin-top:8px">${APP.escapeHtml(c.title || "Challenge")}</b>
        <span class="muted" style="font-size:12px;font-weight:600">${fmtKm(progressKm)} of ${Math.round(c.targetKm)} km \xB7 ${daysLeft} day${daysLeft === 1 ? "" : "s"} left</span>
      </div>
      ${icon("mtn", 32)}
    </div>
    <div class="progress" style="margin:12px 0 10px"><i style="width:${pct}%"></i></div>
    <button class="btn sm block" style="background:${joined ? "#ffffff24" : "#fff"};color:${joined ? "#fff" : "var(--navy)"}" data-challenge="${APP.escapeHtml(c.id)}" data-on="${joined ? "1" : "0"}">${joined ? "Leave challenge" : "Join challenge"}</button>
  </div>`;
}
function personalRecordsHtml(list) {
  if (!list.length) return '<div class="empty">Record and save a ride to start setting records.</div>';
  const best = (label, pick, format) => {
    let win = null;
    list.forEach((a, i) => {
      if (!win || pick(a) > pick(win.a)) win = { a, i };
    });
    return win && pick(win.a) > 0 ? { label, value: format(pick(win.a)), name: win.a.name || "Cycling activity", index: win.i } : null;
  };
  const rows = [
    best("Longest ride", (a) => a.distance || 0, (v) => fmtKm(v)),
    best("Biggest climb", (a) => a.gain || 0, (v) => fmtM(v)),
    best("Fastest average", (a) => a.avgSpeed || 0, (v) => `${v.toFixed(1)} km/h`),
    best("Highest effort", (a) => a.effortScore || 0, (v) => String(Math.round(v)))
  ].filter(Boolean);
  return `<div class="card flat" style="padding:4px 14px">${rows.map((r) => `<button class="item" data-pr="${r.index}" style="width:100%;background:transparent;border-left:0;border-right:0;border-top:0;text-align:left;min-height:52px">
    <span><b style="font-size:14px;display:block">${r.label}</b><span class="muted" style="font-size:12px;font-weight:600">${APP.escapeHtml(r.name)}</span></span>
    <b style="font-size:15px;color:var(--blue)">${r.value}</b>
  </button>`).join("")}</div>`;
}
async function loadSegments() {
  const S2 = view();
  const host = APP.$("#segmentList");
  if (!host) return;
  const btn = APP.$("#newSegment");
  if (btn) btn.onclick = () => createFromLastRide();
  if (!S2.user) {
    host.innerHTML = '<div class="empty" style="padding:14px">Sign in to see segments.</div>';
    return;
  }
  const centre = S2.pos || S2.waypoints?.[0] || null;
  const list = await APP.segments.listSegmentsNear(centre, 60, turfRef()).catch(() => []);
  if (!APP.$("#segmentList")) return;
  if (!list.length) {
    host.innerHTML = '<div class="empty" style="padding:14px">No segments yet. Record a ride, then create one from it \u2014 every ride you save is matched automatically.</div>';
    return;
  }
  const efforts = await Promise.all(list.map((s) => APP.segments.listEfforts(s.id).catch(() => [])));
  host.innerHTML = `<div class="card flat" style="padding:4px 14px">${list.map((seg, i) => {
    const all = efforts[i] || [];
    const mine = all.filter((e) => e.uid === S2.user.uid);
    const best = mine.length ? Math.min(...mine.map((e) => e.seconds)) : null;
    const leader = all.length ? all[0] : null;
    return `<div class="item" style="gap:10px">
      <span><b style="font-size:14px;display:block">${APP.escapeHtml(seg.name || "Segment")}</b>
        <span class="muted" style="font-size:12px;font-weight:600">${(seg.distanceKm || 0).toFixed(1)} km \xB7 ${all.length} effort${all.length === 1 ? "" : "s"}${leader ? ` \xB7 best ${APP.segments.fmtSeconds(leader.seconds)} by ${APP.escapeHtml(leader.displayName || "Rider")}` : ""}</span></span>
      <b style="font-size:14px;color:${best !== null ? "var(--blue)" : "var(--muted)"}">${best !== null ? APP.segments.fmtSeconds(best) : "\u2014"}</b>
    </div>`;
  }).join("")}</div>`;
}
function turfRef() {
  return window.turf;
}
async function createFromLastRide() {
  const S2 = view();
  const last = (S2.accountActivities || [])[0];
  const coords = (last?.samples || []).map((x) => x.pos).filter(Boolean);
  if (coords.length < 4) return APP.toast("Record and save a ride first");
  const name = prompt("Segment name", `${last.name || "Ride"} segment`);
  if (!name?.trim()) return;
  const from = Math.floor(coords.length / 3);
  const to = Math.floor(coords.length * 2 / 3);
  try {
    await APP.segments.createSegment(S2.user, { name: name.trim(), coords: coords.slice(from, to), turf: turfRef() });
    APP.toast("Segment created \u2014 future rides will match against it");
    render4();
  } catch (error) {
    console.warn("Segment creation failed", error);
    APP.toast("Could not create the segment");
  }
}
async function homeView2() {
  const S2 = view();
  const activities = S2.accountActivities || [];
  APP.panel.innerHTML = `<div class="page">
    ${rootHeader("Segments", "Clubs, challenges and your records", { actions: `<button class="chip on" id="newClub">${icon("plus", 14)}Create</button>` })}
    <div id="segBody" class="page"><div class="empty">Loading clubs\u2026</div></div>
    <section id="segmentsSection">
      <div class="between" style="margin-bottom:8px"><span class="section-title">Segments</span>
        <button class="btn light sm" id="newSegment">${icon("plus", 14)}From last ride</button></div>
      <div id="segmentList"><div class="empty" style="padding:14px">Loading segments\u2026</div></div>
    </section>
    <section>
      <p class="section-title" style="margin-bottom:8px">Personal records</p>
      ${personalRecordsHtml(activities)}
    </section>
  </div>`;
  APP.$("#newClub").onclick = () => {
    S2.segmentsView = "newClub";
    render4();
  };
  APP.panel.querySelectorAll("[data-pr]").forEach((b) => {
    b.onclick = () => {
      S2.activityDetailIndex = +b.dataset.pr;
      APP.open("record");
    };
  });
  loadSegments();
  if (!S2.user) {
    APP.$("#segBody").innerHTML = `<div class="card account-required"><h2>Sign in for clubs</h2><p>Join clubs and challenges, and see where you sit on the leaderboard.</p><button class="btn primary" id="segSignIn">Sign in</button></div>`;
    APP.$("#segSignIn").onclick = () => APP.open("profile");
    return;
  }
  const now = Date.now();
  const [clubs, challenges] = await Promise.all([listClubs(), listChallenges(now)]);
  const [memberFlags, joinFlags] = await Promise.all([
    Promise.all(clubs.map((c) => isClubMember(S2.user.uid, c.id))),
    Promise.all(challenges.map((c) => isInChallenge(S2.user.uid, c.id)))
  ]);
  const body = APP.$("#segBody");
  if (!body) return;
  body.innerHTML = `
    <section>
      <div class="between" style="margin-bottom:8px"><span class="section-title">Clubs</span></div>
      ${clubs.length ? clubs.map((c, i) => clubCardHtml(c, i, memberFlags[i])).join("") : '<div class="empty">No clubs yet. Create the first one.</div>'}
    </section>
    <section>
      <div class="between" style="margin-bottom:8px"><span class="section-title">Challenges</span>
        <button class="btn light sm" id="newChallenge">${icon("plus", 14)}New</button></div>
      ${challenges.length ? challenges.map((c, i) => challengeCardHtml(c, joinFlags[i], challengeProgressKm(activities, c))).join("") : '<div class="empty">No active challenges. Start one and invite your club.</div>'}
    </section>`;
  APP.$("#newChallenge").onclick = () => {
    S2.segmentsView = "newChallenge";
    render4();
  };
  body.querySelectorAll("[data-club-open]").forEach((b) => {
    b.onclick = () => {
      S2.segmentsClubId = b.dataset.clubOpen;
      S2.segmentsView = "club";
      render4();
    };
  });
  body.querySelectorAll("[data-join-club]").forEach((b) => {
    b.onclick = async () => {
      const on = b.dataset.on === "1";
      b.disabled = true;
      try {
        if (on) await leaveClub(S2.user, b.dataset.joinClub);
        else await joinClub(S2.user, b.dataset.joinClub);
        APP.toast(on ? "Left club" : "Joined club");
        render4();
      } catch (e) {
        console.warn("Club join failed", e);
        APP.toast("Could not update membership");
        b.disabled = false;
      }
    };
  });
  body.querySelectorAll("[data-challenge]").forEach((b) => {
    b.onclick = async () => {
      const on = b.dataset.on === "1";
      b.disabled = true;
      try {
        if (on) await leaveChallenge(S2.user, b.dataset.challenge);
        else await joinChallenge(S2.user, b.dataset.challenge);
        render4();
      } catch (e) {
        console.warn("Challenge join failed", e);
        APP.toast("Could not update challenge");
        b.disabled = false;
      }
    };
  });
}
async function clubView() {
  const S2 = view();
  const clubId = S2.segmentsClubId;
  APP.panel.innerHTML = `<div class="page">${viewHeader("Club", "Loading\u2026")}<div class="empty">Loading club\u2026</div></div>`;
  wireHeader(goHome2);
  const [clubs, events, members] = await Promise.all([listClubs(), listEvents(clubId), listMembers(clubId)]);
  const club = clubs.find((c) => c.id === clubId) || { id: clubId, name: "Club" };
  const [member, board, goingFlags] = await Promise.all([
    isClubMember(S2.user.uid, clubId),
    clubLeaderboard(clubId, startOfWeek()),
    Promise.all(events.map((e) => isAttending(S2.user.uid, clubId, e.id)))
  ]);
  APP.panel.innerHTML = `<div class="page">
    ${viewHeader(club.name || "Club", `${club.memberCount || members.length} member${(club.memberCount || members.length) === 1 ? "" : "s"}`)}
    <div class="card" style="overflow:hidden">
      ${terrainPlaceholder(390, 96, "forest", 0)}
      <div style="padding:12px 14px">
        ${club.blurb ? `<p class="muted" style="font-size:12px;font-weight:600;margin-bottom:10px">${APP.escapeHtml(club.blurb)}</p>` : ""}
        <div class="row" style="gap:8px">
          <button class="btn ${member ? "light" : "primary"} sm" id="toggleMember" style="flex:1">${member ? "Leave club" : "Join club"}</button>
          <button class="btn light sm" id="newEvent" style="flex:1">${icon("plus", 14)}Add ride</button>
        </div>
      </div>
    </div>

    <section>
      <p class="section-title" style="margin-bottom:4px">Upcoming rides</p>
      <div class="card pad flat" style="padding-top:2px">
        ${events.length ? events.map((e, i) => eventRowHtml(clubId, e, goingFlags[i])).join("") : '<div class="empty" style="padding:14px">No rides planned yet.</div>'}
      </div>
    </section>

    <div id="clubChat"></div>

    <section>
      <div class="between" style="margin-bottom:8px"><span class="section-title">${icon("trophy", 15)} This week</span><span class="muted" style="font-size:12px;font-weight:700">Distance</span></div>
      <div class="card pad flat">
        ${board.length ? board.slice(0, 10).map((r, i) => `<div class="leader-row">
          <span class="rank">${i + 1}</span>
          <span class="avatar sm" style="background:${avatarColor2(r.uid)}">${initials2(r.name)}</span>
          <span style="flex:1;font-size:14px;font-weight:${r.uid === S2.user.uid ? 800 : 600}">${APP.escapeHtml(r.name)}${r.uid === S2.user.uid ? " (you)" : ""}</span>
          <b style="font-size:14px">${r.total ? fmtKm(r.total) : "\u2014"}</b>
        </div>`).join("") : '<div class="empty" style="padding:14px">No member rides shared this week.</div>'}
        <p class="muted" style="font-size:11px;font-weight:600;margin-top:8px">Ranked on rides members shared to their feed since Monday.</p>
      </div>
    </section>
  </div>`;
  wireHeader(goHome2);
  const { $: $2 } = APP;
  $2("#toggleMember").onclick = async () => {
    try {
      if (member) await leaveClub(S2.user, clubId);
      else await joinClub(S2.user, clubId);
      render4();
    } catch (e) {
      console.warn("Membership failed", e);
      APP.toast("Could not update membership");
    }
  };
  $2("#newEvent").onclick = () => {
    S2.segmentsView = "newEvent";
    render4();
  };
  APP.panel.querySelectorAll("[data-going]").forEach((b) => {
    b.onclick = async () => {
      const on = b.dataset.on === "1";
      b.disabled = true;
      try {
        await toggleAttendance(S2.user, b.dataset.club, b.dataset.going, on);
        render4();
      } catch (e) {
        console.warn("Attendance failed", e);
        APP.toast("Could not update");
        b.disabled = false;
      }
    };
  });
  APP.panel.querySelectorAll("[data-event]").forEach((b) => {
    b.onclick = () => {
      S2.segmentsEventId = b.dataset.event;
      S2.segmentsView = "event";
      render4();
    };
  });
  mountChat("clubChat", {
    clubId,
    title: "Club chat",
    emptyText: "No messages yet. Say hello to the club."
  });
}
async function newEventView() {
  const S2 = view();
  const saved = APP.state.accountRoutes || [];
  const back = () => {
    APP.clearRoutePreview();
    S2.segmentsView = S2.segmentsClubId ? "club" : "home";
    render4();
  };
  if (!saved.length) {
    APP.panel.innerHTML = `<div class="page">
      ${viewHeader("New club ride", "A saved route is required")}
      <div class="card pad flat">
        <p class="muted" style="font-size:13px;line-height:1.5;margin-bottom:12px">A club ride has to point at a route everyone can load and follow. Plan one and save it, then come back and pick it here.</p>
        <button class="btn cta block" id="goPlan">${icon("route", 16)}Plan a route</button>
      </div>
    </div>`;
    wireHeader(back);
    APP.$("#goPlan").onclick = () => {
      APP.state.planView = "planner";
      APP.open("plan");
    };
    return;
  }
  const when = new Date(Date.now() + 864e5);
  when.setHours(8, 30, 0, 0);
  const iso = new Date(when.getTime() - when.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  const fromRoute = S2.clubRideFromRoute;
  const preferred = saved.find((r) => r.name === fromRoute?.name) || saved[0];
  if (!S2.clubRideRouteId || !saved.some((r) => String(r.id) === String(S2.clubRideRouteId))) {
    S2.clubRideRouteId = preferred?.id;
  }
  const coordsOfRoute = (r) => r?.route?.geometry?.coordinates || r?.geometry?.coordinates || null;
  const metresOf = (r) => r?.route?.distance ?? r?.distance ?? 0;
  const ascentOf = (r) => r?.route?.ascent ?? r?.ascent ?? 0;
  const card = (r) => {
    const coords = coordsOfRoute(r);
    const on = String(r.id) === String(S2.clubRideRouteId);
    return `<button class="route-pick${on ? " on" : ""}" data-route="${APP.escapeHtml(String(r.id))}">
      <span class="route-pick-media">${routeThumb(coords || [], 84, 64, { radius: 10 })}</span>
      <span class="route-pick-body">
        <b>${APP.escapeHtml(r.name || r.savedName || "Saved route")}</b>
        <span>${fmtKm(metresOf(r) / 1e3)}${ascentOf(r) ? ` \xB7 ${fmtM(ascentOf(r))}` : ""}</span>
        <span class="route-pick-hint">${on ? "Shown on the map" : "Tap to preview"}</span>
      </span>
      <span class="route-pick-tick">${on ? icon("check", 16) : ""}</span>
    </button>`;
  };
  APP.panel.innerHTML = `<div class="page">
    ${viewHeader("New club ride", "Everyone rides the same saved route")}
    <div class="field"><label>Title</label><input id="evTitle" type="text" value="${APP.escapeHtml(fromRoute?.name || "")}" placeholder="Saturday social"></div>
    <div class="field"><label>Date and time</label><input id="evWhen" type="datetime-local" value="${iso}"></div>
    <div class="field"><label>Meeting point</label><input id="evMeet" type="text" placeholder="Ashton Court gate"></div>

    <section>
      <div class="between" style="margin-bottom:8px">
        <span class="section-title">Route</span>
        <button class="btn light sm" id="evNewRoute">${icon("plus", 14)}New route</button>
      </div>
      <div id="routePicks">${saved.map(card).join("")}</div>
      <p class="muted" style="font-size:11px;font-weight:600;margin-top:6px">Members open this exact route from the ride.</p>
    </section>

    <div class="action-bar"><button class="btn cta" id="evSubmit">Add ride</button></div>
  </div>`;
  wireHeader(back);
  const previewFor = (id) => {
    const r = saved.find((x) => String(x.id) === String(id));
    const coords = coordsOfRoute(r);
    if (!coords || coords.length < 2) {
      APP.toast("That route has no line to preview");
      return;
    }
    APP.previewRouteOnMap(coords);
  };
  APP.$("#routePicks").onclick = (e) => {
    const b = e.target.closest("[data-route]");
    if (!b) return;
    S2.clubRideRouteId = b.dataset.route;
    APP.$("#routePicks").innerHTML = saved.map(card).join("");
    previewFor(S2.clubRideRouteId);
    APP.setSheetState("half");
  };
  APP.$("#evNewRoute").onclick = () => {
    APP.clearRoutePreview();
    APP.state.planView = "planner";
    S2.clubRideReturn = true;
    APP.open("plan");
  };
  previewFor(S2.clubRideRouteId);
  APP.$("#evSubmit").onclick = async (e) => {
    const btn = e.currentTarget;
    const title = APP.$("#evTitle").value.trim();
    const whenValue = APP.$("#evWhen").value;
    const chosen = saved.find((r) => String(r.id) === String(S2.clubRideRouteId));
    if (!title) return APP.toast("Give the ride a title");
    if (!whenValue) return APP.toast("Pick a date and time");
    if (!chosen) return APP.toast("Pick a route for this ride");
    const coords = coordsOfRoute(chosen);
    btn.disabled = true;
    try {
      await createEvent(S2.user, S2.segmentsClubId, {
        title,
        startsAt: new Date(whenValue).getTime(),
        meetPoint: APP.$("#evMeet").value.trim(),
        distanceKm: metresOf(chosen) / 1e3,
        route: {
          id: chosen.id,
          name: chosen.name || chosen.savedName || "Saved route",
          geoJson: coords ? JSON.stringify({ type: "LineString", coordinates: APP.sample(coords, Math.min(60, coords.length)) }) : null
        }
      });
      APP.toast("Club ride added");
      APP.clearRoutePreview();
      S2.clubRideFromRoute = null;
      S2.segmentsView = "club";
      render4();
    } catch (error) {
      console.warn("Could not add the club ride", error);
      APP.toast("Could not add that ride");
      btn.disabled = false;
    }
  };
}
async function eventView() {
  const S2 = view();
  const clubId = S2.segmentsClubId;
  const eventId = S2.segmentsEventId;
  const back = () => {
    S2.segmentsView = "club";
    S2.segmentsEventId = null;
    render4();
  };
  APP.panel.innerHTML = `<div class="page">${viewHeader("Ride", "Loading\u2026")}<div class="empty">Loading ride\u2026</div></div>`;
  wireHeader(back);
  const events = await listEvents(clubId, 40);
  if (!APP.isCurrentPage("segments") || S2.segmentsView !== "event") return;
  const ride = events.find((e) => e.id === eventId);
  if (!ride) {
    APP.toast("That ride is no longer listed");
    return back();
  }
  const going = await isAttending(S2.user.uid, clubId, eventId).catch(() => false);
  if (!APP.isCurrentPage("segments") || S2.segmentsView !== "event") return;
  let coords = null;
  try {
    coords = ride.routeGeoJson ? JSON.parse(ride.routeGeoJson)?.coordinates : null;
  } catch {
    coords = null;
  }
  const when = new Date(ride.startsAt || Date.now());
  APP.panel.innerHTML = `<div class="page">
    ${viewHeader(ride.title || "Group ride", `${when.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })} \xB7 ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`)}

    <div class="card" style="overflow:hidden">
      <div class="route-media" style="height:150px">${coords?.length > 1 ? `<img src="${staticRouteImage(coords, APP.MAPBOX_TOKEN, { w: 720, h: 300 })}" alt="Route for ${APP.escapeHtml(ride.title || "this ride")}" loading="lazy">` : `<div class="mini-media-empty">${icon("route", 16)}<span>No route attached</span></div>`}</div>
      <div style="padding:12px 14px">
        <div class="stats three" style="margin-bottom:10px">
          <div class="stat"><b>${ride.distanceKm ? fmtKm(ride.distanceKm) : "\u2014"}</b><small>distance</small></div>
          <div class="stat"><b>${ride.goingCount || 0}</b><small>going</small></div>
          <div class="stat"><b>${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b><small>start</small></div>
        </div>
        ${ride.meetPoint ? `<p class="muted" style="font-size:12px;font-weight:600;margin-bottom:10px">${icon("pin", 12)} ${APP.escapeHtml(ride.meetPoint)}</p>` : ""}
        <div class="row" style="gap:8px">
          <button class="btn ${going ? "light" : "primary"} sm" id="eventGoing" style="flex:1">${going ? "Going" : "Join ride"}</button>
          ${ride.routeId ? `<button class="btn light sm" id="eventLoadRoute" style="flex:1">${icon("route", 14)}Load route</button>` : ""}
        </div>
      </div>
    </div>

    <div id="eventChat"></div>
  </div>`;
  wireHeader(back);
  APP.$("#eventGoing").onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      await toggleAttendance(S2.user, clubId, eventId, going);
      render4();
    } catch (error) {
      console.warn("Attendance failed", error);
      APP.toast("Could not update");
      e.currentTarget.disabled = false;
    }
  };
  const load = APP.$("#eventLoadRoute");
  if (load) load.onclick = async () => {
    if (!coords || coords.length < 2) return APP.toast("This ride has no route to load");
    await APP.useSavedActivityRoute({
      name: ride.routeName || ride.title || "Club ride",
      distance: ride.distanceKm || 0,
      elapsed: 0,
      samples: coords.map((pos) => ({ pos }))
    });
  };
  mountChat("eventChat", {
    clubId,
    eventId,
    title: "Ride chat",
    emptyText: "No messages yet. Sort out the meeting point here."
  });
}
function formView(title, subtitle, fields, onSubmit, submitLabel) {
  APP.panel.innerHTML = `<div class="page">
    ${viewHeader(title, subtitle)}
    ${fields.map((f) => `<div class="field"><label>${f.label}</label>${f.type === "select" ? `<select id="${f.id}">${(f.options || []).map((o) => `<option value="${APP.escapeHtml(String(o.value))}" ${String(o.value) === String(f.value) ? "selected" : ""}>${APP.escapeHtml(o.label)}</option>`).join("")}</select>` : `<input id="${f.id}" type="${f.type || "text"}" ${f.value !== void 0 ? `value="${APP.escapeHtml(String(f.value))}"` : ""} ${f.min !== void 0 ? `min="${f.min}"` : ""} placeholder="${APP.escapeHtml(f.placeholder || "")}">`}${f.hint ? `<small class="muted" style="font-size:11px;font-weight:600;display:block;margin-top:4px">${f.hint}</small>` : ""}</div>`).join("")}
    <div class="action-bar"><button class="btn cta" id="formSubmit">${submitLabel}</button></div>
  </div>`;
  wireHeader(() => {
    APP.state.segmentsView = APP.state.segmentsClubId && title.includes("ride") ? "club" : "home";
    render4();
  });
  APP.$("#formSubmit").onclick = async () => {
    const values = {};
    let missing = false;
    fields.forEach((f) => {
      const v = APP.$(`#${f.id}`).value.trim();
      if (f.required && !v) missing = true;
      values[f.id] = v;
    });
    if (missing) return APP.toast("Fill in the required fields");
    APP.$("#formSubmit").disabled = true;
    try {
      await onSubmit(values);
    } catch (e) {
      console.warn("Form failed", e);
      APP.toast("Could not save");
      APP.$("#formSubmit").disabled = false;
    }
  };
}
async function render4() {
  if (!APP.isCurrentPage("segments")) return;
  unmountChat();
  const S2 = view();
  if (!S2.user && S2.segmentsView !== "home") S2.segmentsView = "home";
  if (S2.segmentsView === "club") return clubView();
  if (S2.segmentsView === "event" && S2.segmentsClubId && S2.segmentsEventId) return eventView();
  if (S2.segmentsView === "newClub") {
    return formView("New club", "Riders can find and join it", [
      { id: "name", label: "Club name", required: true, placeholder: "Bristol Gravel Collective" },
      { id: "blurb", label: "About (optional)", placeholder: "Weekend gravel rides around the city" }
    ], async (v) => {
      await createClub(S2.user, { name: v.name, blurb: v.blurb });
      APP.toast("Club created");
      S2.segmentsView = "home";
      render4();
    }, "Create club");
  }
  if (S2.segmentsView === "newEvent" && !S2.segmentsClubId) {
    const clubs = await listClubs();
    APP.panel.innerHTML = `<div class="page">
      ${viewHeader("Pick a club", "Which club is this ride for?")}
      ${clubs.length ? clubs.map((c) => `<button class="card pad flat item" data-pick-club="${APP.escapeHtml(c.id)}" style="width:100%;text-align:left">
        <span><b style="font-size:14px;display:block">${APP.escapeHtml(c.name)}</b><span class="muted" style="font-size:12px;font-weight:600">${c.memberCount || 0} members</span></span>
        ${icon("chevR", 18)}
      </button>`).join("") : '<div class="empty">Create a club first.</div>'}
    </div>`;
    wireHeader(goHome2);
    APP.panel.querySelectorAll("[data-pick-club]").forEach((b) => {
      b.onclick = () => {
        S2.segmentsClubId = b.dataset.pickClub;
        render4();
      };
    });
    return;
  }
  if (S2.segmentsView === "newEvent") return newEventView();
  if (S2.segmentsView === "newChallenge") {
    const end = new Date(Date.now() + 30 * 864e5);
    return formView("New challenge", "Progress counts your saved rides", [
      { id: "title", label: "Title", required: true, placeholder: "September 500 km" },
      { id: "targetKm", label: "Target distance (km)", type: "number", min: 1, value: 500, required: true },
      { id: "endsAt", label: "Ends", type: "date", value: end.toISOString().slice(0, 10), required: true }
    ], async (v) => {
      await createChallenge(S2.user, {
        title: v.title,
        targetKm: +v.targetKm,
        startsAt: Date.now(),
        endsAt: new Date(v.endsAt).getTime()
      });
      APP.toast("Challenge created");
      S2.segmentsView = "home";
      render4();
    }, "Create challenge");
  }
  return homeView2();
}

// src/ui/pages/profile.js
var initials3 = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "R";
var avatarColor3 = (uid2 = "") => ["#8b5bd6", "#00a6a6", "#176bdb", "#f28b30", "#139b66"][[...uid2].reduce((a, c) => a + c.charCodeAt(0), 0) % 5];
function relTime(ms) {
  const diff = Date.now() - (ms || 0);
  const mins = Math.round(diff / 6e4);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(ms).toLocaleDateString([], { day: "numeric", month: "short" });
}
function coordsOf(a) {
  try {
    const g = typeof a.routeSummaryGeoJson === "string" ? JSON.parse(a.routeSummaryGeoJson) : a.routeSummaryGeoJson;
    return g?.coordinates?.length >= 2 ? g.coordinates : null;
  } catch {
    return null;
  }
}
function view2() {
  const S2 = APP.state;
  if (!S2.profileView) S2.profileView = "feed";
  return S2;
}
function shellHtml(inner, activeView) {
  return `<div class="page">
    ${rootHeader(activeView === "feed" ? "Feed" : "Profile", activeView === "feed" ? "Rides from riders you follow" : "Your account, stats and settings")}
    <div class="segmented" id="profileTabs">
      <button data-view="feed" class="${activeView === "feed" ? "on" : ""}">Feed</button>
      <button data-view="you" class="${activeView === "you" ? "on" : ""}">You</button>
    </div>
    <div id="profileBody" class="page">${inner}</div>
  </div>`;
}
function feedCardHtml(a, given) {
  const coords = coordsOf(a);
  const img = coords ? staticRouteImage(coords, APP.MAPBOX_TOKEN, { w: 640, h: 280 }) : null;
  return `<article class="card feed-card" data-feed="${APP.escapeHtml(a.id)}">
    <div class="feed-head row">
      <span class="avatar" style="background:${avatarColor3(a.ownerId)}">${a.ownerPhotoURL ? `<img src="${APP.escapeHtml(a.ownerPhotoURL)}" alt="">` : initials3(a.ownerDisplayName)}</span>
      <div style="flex:1"><b style="font-size:14px;display:block">${APP.escapeHtml(a.ownerDisplayName || "Rider")}</b><span class="muted" style="font-size:12px;font-weight:600">${relTime(a.startedAt)}</span></div>
    </div>
    <div class="feed-title">${APP.escapeHtml(a.title || "Cycling activity")}</div>
    <div class="feed-media">${img ? `<img src="${img}" alt="${a.routeIsPlanned ? "Planned route" : "Route ridden"}" loading="lazy">` : routeThumb(coords, 358, 140, { radius: 0 })}
      ${a.routeIsPlanned ? '<span class="mini-tag">Planned route \xB7 not ridden</span>' : ""}</div>
    ${a.routeIsPlanned ? `<div class="feed-stats stats three">
          <div class="stat"><b>${fmtKm(a.plannedDistanceKm)}</b><small>planned</small></div>
          <div class="stat"><b>\u2014</b><small>elevation</small></div>
          <div class="stat"><b>\u2014</b><small>avg km/h</small></div>
        </div>` : `<div class="feed-stats stats three">
          <div class="stat"><b>${fmtKm(a.distanceKm)}</b><small>distance</small></div>
          <div class="stat"><b>${fmtM(a.elevationGainM)}</b><small>elevation</small></div>
          <div class="stat"><b>${(a.avgSpeedKmh || 0).toFixed(1)}</b><small>avg km/h</small></div>
        </div>`}
    <div class="feed-actions">
      <button data-kudos="${APP.escapeHtml(a.id)}" class="${given ? "on" : ""}" aria-pressed="${given}">${icon("heart", 18)}<span>${a.kudosCount || 0}</span></button>
      <button data-comments="${APP.escapeHtml(a.id)}">${icon("bubble", 18)}<span>${a.commentCount || 0}</span></button>
      <span style="margin-left:auto" class="muted">${icon("share", 18)}</span>
    </div>
    <div class="comment-thread" id="thread-${APP.escapeHtml(a.id)}" hidden style="padding:0 14px 12px"></div>
  </article>`;
}
async function feedHtml() {
  const S2 = view2();
  if (!S2.user) {
    return `<div class="card account-required"><h2>Sign in to see your feed</h2><p>Follow other riders to see their routes and rides, give kudos and leave comments.</p><button class="btn primary" id="feedSignIn">Sign in</button></div>`;
  }
  const uids = await listFollowingUids(S2.user.uid).catch(() => []);
  const activities = uids.length ? await fetchFeed(uids).catch(() => []) : [];
  const given = await Promise.all(activities.map((a) => hasGivenKudos(a.id, S2.user.uid).catch(() => false)));
  const ridingNow = await ridingNowCount(uids).catch(() => 0);
  return `
    ${ridingNow ? `<div class="row" style="justify-content:flex-end"><span class="badge green" style="min-height:30px">${icon("record", 12)}${ridingNow} riding now</span></div>` : ""}
    <div class="card pad flat">
      <div class="between" style="margin-bottom:8px"><span class="section-title">Find riders</span></div>
      <div class="location-row"><input id="findPeople" type="search" placeholder="Search by name" autocomplete="off"><button class="iconbtn" id="findPeopleGo">${icon("search", 20)}</button></div>
      <div id="peopleResults"></div>
    </div>
    ${activities.length ? activities.map((a, i) => feedCardHtml(a, given[i])).join("") : `<div class="empty">${uids.length ? "No rides yet from the riders you follow." : "Follow some riders above and their rides appear here."}</div>`}`;
}
function wireFeed() {
  const S2 = view2();
  const { $: $2, panel: panel2 } = APP;
  const signIn = $2("#feedSignIn");
  if (signIn) {
    signIn.onclick = () => {
      S2.profileView = "you";
      render5();
    };
    return;
  }
  const runSearch = async () => {
    const q = $2("#findPeople").value.trim();
    const box2 = $2("#peopleResults");
    if (!q) {
      box2.innerHTML = "";
      return;
    }
    box2.innerHTML = '<p class="muted" style="font-size:12px;font-weight:600;padding:8px 0">Searching\u2026</p>';
    const people = (await searchProfilesByName(q).catch(() => [])).filter((p) => p.uid !== S2.user.uid);
    if (!people.length) {
      box2.innerHTML = '<p class="muted" style="font-size:12px;font-weight:600;padding:8px 0">No riders found.</p>';
      return;
    }
    const flags = await Promise.all(people.map((p) => isFollowing(S2.user.uid, p.uid).catch(() => false)));
    box2.innerHTML = people.map((p, i) => `<div class="item">
      <span class="row"><span class="avatar sm" style="background:${avatarColor3(p.uid)}">${initials3(p.displayName)}</span>${APP.escapeHtml(p.displayName || "Rider")}</span>
      <button class="btn ${flags[i] ? "light" : "primary"} sm" data-follow="${APP.escapeHtml(p.uid)}" data-on="${flags[i] ? "1" : "0"}">${flags[i] ? "Following" : "Follow"}</button>
    </div>`).join("");
    box2.querySelectorAll("[data-follow]").forEach((b) => {
      b.onclick = async () => {
        const uid2 = b.dataset.follow;
        const on = b.dataset.on === "1";
        b.disabled = true;
        try {
          if (on) await unfollowUser(S2.user.uid, uid2);
          else await followUser(S2.user.uid, uid2);
          b.dataset.on = on ? "0" : "1";
          b.textContent = on ? "Follow" : "Following";
          b.className = `btn ${on ? "primary" : "light"} sm`;
          APP.toast(on ? "Unfollowed" : "Now following");
        } catch (e) {
          console.warn("Follow failed", e);
          APP.toast("Could not update follow");
        } finally {
          b.disabled = false;
        }
      };
    });
  };
  const go = $2("#findPeopleGo");
  if (go) go.onclick = runSearch;
  const box = $2("#findPeople");
  if (box) box.onkeydown = (e) => {
    if (e.key === "Enter") runSearch();
  };
  panel2.querySelectorAll("[data-kudos]").forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.kudos;
      const on = b.getAttribute("aria-pressed") === "true";
      const count = b.querySelector("span");
      b.disabled = true;
      try {
        await toggleKudos(id, S2.user.uid, on);
        b.setAttribute("aria-pressed", String(!on));
        b.classList.toggle("on", !on);
        count.textContent = String(Math.max(0, (+count.textContent || 0) + (on ? -1 : 1)));
      } catch (e) {
        console.warn("Kudos failed", e);
        APP.toast("Could not update kudos");
      } finally {
        b.disabled = false;
      }
    };
  });
  panel2.querySelectorAll("[data-comments]").forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.comments;
      const box2 = APP.$(`#thread-${CSS.escape(id)}`) || document.getElementById(`thread-${id}`);
      if (!box2) return;
      if (!box2.hidden) {
        box2.hidden = true;
        return;
      }
      box2.hidden = false;
      await loadThread(box2, id);
    };
  });
}
async function loadThread(box, id) {
  const S2 = APP.state;
  box.innerHTML = '<p class="muted" style="font-size:12px;font-weight:600">Loading comments\u2026</p>';
  const comments = await listComments(id).catch(() => []);
  box.innerHTML = `
    ${comments.length ? comments.map((c) => `<div class="comment-row" style="margin-bottom:10px">
      <span class="avatar sm" style="background:${avatarColor3(c.authorUid)}">${initials3(c.authorDisplayName)}</span>
      <div style="flex:1"><div class="row" style="gap:6px"><b style="font-size:13px">${APP.escapeHtml(c.authorDisplayName || "Rider")}</b></div>
      <div class="comment-bubble">${APP.escapeHtml(c.text || "")}</div></div>
    </div>`).join("") : '<p class="muted" style="font-size:12px;font-weight:600">No comments yet.</p>'}
    <div class="comment-compose">
      <span class="avatar sm" style="background:${avatarColor3(S2.user?.uid || "")}">${initials3(S2.user?.displayName || S2.user?.email || "You")}</span>
      <input type="text" placeholder="Add a comment" autocomplete="off">
      <button class="iconbtn round" style="background:var(--blue);color:#fff;border:0">${icon("send", 18)}</button>
    </div>`;
  const input = box.querySelector(".comment-compose input");
  const send = box.querySelector(".comment-compose button");
  send.onclick = async () => {
    const text = input.value.trim();
    if (!text) return;
    send.disabled = true;
    try {
      await addComment(id, S2.user, text);
      await loadThread(box, id);
    } catch (e) {
      console.warn("Comment failed", e);
      APP.toast("Could not post comment");
      send.disabled = false;
    }
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") send.onclick();
  };
}
function lifetimeTotals(activities) {
  return activities.reduce((t, a) => ({
    km: t.km + (a.distance || 0),
    m: t.m + (a.gain || 0),
    rides: t.rides + 1
  }), { km: 0, m: 0, rides: 0 });
}
function badgesFor(activities) {
  const t = lifetimeTotals(activities);
  const longest = Math.max(0, ...activities.map((a) => a.distance || 0));
  const climb = Math.max(0, ...activities.map((a) => a.gain || 0));
  return [
    { icon: "flag", label: "First ride", got: t.rides >= 1, tone: "var(--green)" },
    { icon: "route", label: "10 rides", got: t.rides >= 10, tone: "var(--blue)" },
    { icon: "bolt", label: "50 km ride", got: longest >= 50, tone: "var(--gold)" },
    { icon: "trophy", label: "100 km ride", got: longest >= 100, tone: "var(--accent)" },
    { icon: "mtn", label: "1,000 m climb", got: climb >= 1e3, tone: "#8b5bd6" },
    { icon: "crown", label: "1,000 km total", got: t.km >= 1e3, tone: "var(--red)" }
  ];
}
function themeChips() {
  const cur = localStorage.getItem("theme") || "system";
  return ["system", "light", "dark"].map((t) => `<button class="chip ${cur === t ? "on" : ""}" data-theme="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("");
}
function signedOutHtml() {
  const standalone = APP.isStandalone();
  return `<div class="card pad flat">
      <h2>Sign in</h2>
      ${standalone ? '<p class="muted" style="font-size:12px;font-weight:600;margin-top:6px">Home Screen app detected. Email sign-in is the most reliable here.</p>' : ""}
      <div class="field"><label>Email</label><input id="authEmail" type="email" autocomplete="email" placeholder="name@example.com"></div>
      <div class="field"><label>Password</label><input id="authPassword" type="password" autocomplete="current-password" minlength="6" placeholder="At least 6 characters"></div>
      <div class="actions"><button class="btn primary" id="emailLogin">Sign in</button><button class="btn light" id="emailCreate">Create account</button><button class="btn light" id="emailReset">Reset password</button></div>
    </div>
    <div class="card pad flat"><h3>Google account</h3><p class="muted" style="font-size:12px;font-weight:600;margin:6px 0 10px">Opens a popup; no redirect sign-in is used.</p><button class="btn light block" id="googleLogin">Continue with Google</button></div>`;
}
async function youHtml() {
  const S2 = view2();
  if (!S2.user) return signedOutHtml();
  const activities = S2.accountActivities || [];
  const t = lifetimeTotals(activities);
  const p = APP.profileData();
  const [followers, following] = await Promise.all([
    listFollowerUids(S2.user.uid).catch(() => []),
    listFollowingUids(S2.user.uid).catch(() => [])
  ]);
  const name = S2.user.displayName || S2.user.email?.split("@")[0] || "Rider";
  return `
    <div style="text-align:center">
      <span class="avatar lg" style="background:linear-gradient(135deg,var(--accent),var(--blue))">${initials3(name)}</span>
      <h2 style="margin-top:10px">${APP.escapeHtml(name)}</h2>
      <p class="muted" style="font-size:13px;font-weight:600">${APP.escapeHtml(S2.user.email || "")}</p>
    </div>
    <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="stat tile"><b>${followers.length}</b><small>followers</small></div>
      <div class="stat tile"><b>${following.length}</b><small>following</small></div>
    </div>
    <div class="card pad flat stats three">
      <div class="stat"><b style="color:var(--blue)">${fmtKm(t.km)}</b><small>total distance</small></div>
      <div class="stat"><b style="color:var(--blue)">${fmtM(t.m)}</b><small>total climbed</small></div>
      <div class="stat"><b style="color:var(--blue)">${t.rides}</b><small>rides</small></div>
    </div>
    <section>
      <div class="between" style="margin-bottom:10px"><span class="section-title">Badges</span><span class="muted" style="font-size:12px;font-weight:700">${badgesFor(activities).filter((b) => b.got).length} earned</span></div>
      <div class="badge-grid">${badgesFor(activities).map((b) => `<div class="badge-tile ${b.got ? "" : "locked"}"><span class="ico" style="background:color-mix(in srgb, ${b.tone} 16%, transparent);color:${b.tone}">${icon(b.icon, 22)}</span><b>${b.label}</b></div>`).join("")}</div>
    </section>
    <div class="card pad flat between"><div><b style="font-size:14px;display:block">Weather</b><span class="muted" style="font-size:12px;font-weight:600">Conditions, wind and forecast</span></div><button class="btn light sm" id="openWeather">Open</button></div>
    <section class="card pad flat">
      <h3>Rider profile</h3>
      <p class="muted" style="font-size:12px;font-weight:600;margin-top:4px">Used for estimated power and effort.</p>
      <div class="field"><label>Weight (kg)</label><input id="profileWeight" type="number" min="30" max="250" value="${p.weight}"></div>
      <div class="field"><label>Height (cm)</label><input id="profileHeight" type="number" min="120" max="230" value="${p.height}"></div>
      <div class="field"><label>Bike + kit (kg)</label><input id="bikeWeight" type="number" min="5" max="40" value="${p.bikeWeight}"></div>
      <button class="btn primary block" id="saveProfile">Save rider profile</button>
    </section>
    <section class="card pad flat">
      <h3>Appearance</h3>
      <div class="row" id="themeChips" style="gap:8px;margin-top:10px">${themeChips()}</div>
    </section>
    <button class="btn light block" id="logout">Log out</button>`;
}
function wireYou() {
  const S2 = view2();
  const { $: $2 } = APP;
  const on = (sel, handler) => {
    const el = $2(sel);
    if (el) el.onclick = handler;
  };
  if ($2("#emailLogin")) {
    on("#emailLogin", () => APP.emailAction("login"));
    on("#emailCreate", () => APP.emailAction("create"));
    on("#emailReset", () => APP.emailAction("reset"));
    on("#googleLogin", () => S2.loginGoogle?.().catch(APP.showAuthError));
    return;
  }
  on("#openWeather", () => APP.open("weather"));
  on("#logout", () => S2.logout?.());
  on("#saveProfile", () => {
    const weight = $2("#profileWeight").value, height = $2("#profileHeight").value, bike = $2("#bikeWeight").value;
    localStorage.setItem("profileWeight", weight);
    localStorage.setItem("profileHeight", height);
    localStorage.setItem("bikeWeight", bike);
    updateRiderMeasurements(S2.user.uid, { weightKg: +weight, heightCm: +height, bikeWeightKg: +bike }).catch((e) => console.warn("Measurement sync failed", e));
    APP.toast("Rider profile saved");
  });
  on("#themeChips", (e) => {
    const b = e.target.closest("[data-theme]");
    if (!b) return;
    const t = b.dataset.theme;
    localStorage.setItem("theme", t);
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    $2("#themeChips").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  });
}
async function render5() {
  if (!APP.isCurrentPage("profile")) return;
  const S2 = view2();
  APP.panel.innerHTML = shellHtml('<div class="empty">Loading\u2026</div>', S2.profileView);
  APP.$("#profileTabs").onclick = (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    S2.profileView = b.dataset.view;
    render5();
  };
  const body = APP.$("#profileBody");
  const inner = S2.profileView === "feed" ? await feedHtml() : await youHtml();
  if (!APP.$("#profileBody")) return;
  body.innerHTML = inner;
  try {
    if (S2.profileView === "feed") wireFeed();
    else wireYou();
  } catch (error) {
    console.warn("Profile wiring skipped", error);
  }
}

// src/ui/pages/routeDetail.js
var PLACE_ICON = (category = "") => {
  const c = String(category).toLowerCase();
  if (c.includes("view") || c.includes("peak")) return "eye";
  if (c.includes("cafe") || c.includes("food")) return "cup";
  if (c.includes("water")) return "drop";
  if (c.includes("park") || c.includes("nature") || c.includes("forest")) return "leaf";
  if (c.includes("castle") || c.includes("historic") || c.includes("attraction")) return "landmark";
  return "pin";
};
function surfaceBadge(route) {
  if (!Number.isFinite(route.surfaceUnpavedShare)) return "";
  const pct = Math.round(route.surfaceUnpavedShare * 100);
  const tone = pct >= 55 ? "orange" : pct >= 12 ? "blue" : "green";
  const label = pct >= 55 ? `${pct}% unpaved` : pct >= 12 ? `Mixed \xB7 ${pct}% unpaved` : "Mostly paved";
  return `<span class="badge ${tone}">${label}</span>`;
}
async function render6() {
  const S2 = APP.state;
  const back = () => {
    S2.routeDetailOpen = false;
    S2.adventureView = "home";
    APP.open("explore");
  };
  const index = Number.isInteger(S2.selected) ? S2.selected : 0;
  const route = S2.routes?.[index] || S2.route;
  if (!route?.geometry?.coordinates?.length) {
    APP.panel.innerHTML = `<div class="page">${viewHeader("Route", "No route selected")}
      <div class="empty">Pick a route from Adventure or the planner to see its detail here.</div>
      <button class="btn cta block" id="toAdventure">${icon("compass", 18)}Find adventures</button></div>`;
    wireHeader(back);
    APP.$("#toAdventure").onclick = back;
    return;
  }
  const coords = route.geometry.coordinates;
  const km = (route.distance || 0) / 1e3;
  const diff = difficultyFor(km, route.ascent || 0);
  const infra = Number.isFinite(route.osmCycleScore) ? route.osmCycleScore : route.cycleScore;
  const img = staticRouteImage(coords, APP.MAPBOX_TOKEN, { w: 640, h: 300 });
  const places = Array.isArray(route.adventurePlaces) ? route.adventurePlaces.filter((p) => p?.coord) : [];
  const hasWind = Array.isArray(route.wind) && route.wind.length;
  const actions = `<button class="iconbtn" id="detailSave" title="Save route">${icon("heart", 18)}</button>
    <button class="iconbtn" id="detailShare" title="Share route">${icon("share", 18)}</button>`;
  APP.panel.innerHTML = `<div class="page">
    ${viewHeader(route.savedName || route.name || "Route", `${fmtKm(km)} \xB7 ${diff.label}`, { actions })}
    <div class="card hero-card">
      <div class="hero-media" style="height:172px">
        ${img ? `<img src="${img}" alt="" loading="lazy">` : routeThumb(coords, 358, 172, { radius: 0 })}
      </div>
    </div>

    <div class="row" style="gap:6px;flex-wrap:wrap">
      <span class="badge ${diff.tone}">${diff.label}</span>
      ${surfaceBadge(route)}
      ${route.qualityLabel ? `<span class="badge blue">${APP.escapeHtml(String(route.qualityLabel))}</span>` : ""}
      ${route.rangeStatus ? `<span class="badge orange">${APP.escapeHtml(String(route.rangeStatus))}</span>` : ""}
    </div>

    ${route.whyThisRoute ? `<div class="card pad flat" style="border-left:3px solid var(--blue)"><p style="font-size:13px;font-weight:600;line-height:1.45">${APP.escapeHtml(route.whyThisRoute)}</p></div>` : ""}
    <div class="stats">
      <div class="stat tile"><b>${fmtKm(km)}</b><small>distance</small></div>
      <div class="stat tile"><b>${Number.isFinite(route.ascent) ? fmtM(route.ascent) : "\u2014"}</b><small>elevation</small></div>
      <div class="stat tile"><b>${fmtDuration(route.duration)}</b><small>est. time</small></div>
      <div class="stat tile"><b>${Number.isFinite(infra) ? `${infra}%` : "\u2014"}</b><small>${Number.isFinite(route.osmCycleScore) ? "OSM cycle infra" : "cycle estimate"}</small></div>
    </div>

    <section>
      <div class="between" style="margin-bottom:6px"><span class="section-title">Elevation</span>${gradientLegend()}</div>
      ${elevationChart(route.elev, 340, 92, { distanceKm: km, pending: !route.elev?.length && !route.elevUnavailable })}
    </section>

    ${hasWind ? `<section><div class="between" style="margin-bottom:6px"><span class="section-title">Wind along the route</span><span class="muted" style="font-size:11px;font-weight:700">tailwind + / headwind \u2212</span></div><canvas id="routeWindChart" class="chart"></canvas></section>` : ""}

    ${places.length ? `<section>
      <p class="section-title" style="margin-bottom:6px">Highlights along the way</p>
      ${places.slice(0, 6).map((p) => `<div class="highlight-row">
        <span class="ico" style="background:color-mix(in srgb, var(--blue) 14%, transparent);color:var(--blue)">${icon(PLACE_ICON(p.category), 18)}</span>
        <div><b>${APP.escapeHtml(p.name || "Point of interest")}</b><span>${APP.escapeHtml(String(p.category || "").replace(/_/g, " "))}${Number.isFinite(p.distance) ? ` \xB7 ${p.distance.toFixed(1)} km from start` : ""}</span></div>
      </div>`).join("")}
    </section>` : ""}

    <div id="routeSocial"></div>
    <div id="cueHost"></div>
    <button class="btn light block" id="routeToClub">${icon("flag", 16)}Plan this as a club ride</button>

    <div class="action-bar">
      <button class="iconbtn" id="detailOffline" title="Save for offline" style="width:52px;height:52px">${icon("cloudDown", 22)}</button>
      <button class="iconbtn" id="detailGpx" title="Export GPX" style="width:52px;height:52px">${icon("download", 22)}</button>
      <button class="btn cta" id="detailStart" style="flex:1;min-height:52px">${icon("compass", 20)}Start navigation</button>
    </div>
  </div>`;
  const { $: $2 } = APP;
  const routeId = route.savedId || route.id || `route-${Math.round(route.distance || 0)}-${coords.length}`;
  const rateableId = route.savedId || S2.editingSavedId || null;
  const social = $2("#routeSocial");
  if (social) {
    if (!rateableId) {
      social.innerHTML = '<p class="muted" style="font-size:12px;font-weight:600">Save this route to rate it and collect ride photos from it.</p>';
    } else {
      Promise.all([
        APP.ratings.getRouteStats(rateableId),
        S2.user ? APP.ratings.getMyRating(rateableId, S2.user.uid) : 0,
        APP.ratings.routePhotos(rateableId)
      ]).then(([stats, mine, photos]) => {
        if (!APP.$("#routeSocial")) return;
        social.innerHTML = `<section>
          <div class="between" style="margin-bottom:6px">
            <span class="section-title">Rider feedback</span>
            <span class="muted" style="font-size:12px;font-weight:700">${stats?.rideCount ? `ridden ${stats.rideCount} time${stats.rideCount === 1 ? "" : "s"}` : "not ridden yet"}</span>
          </div>
          <div class="card pad flat">
            <div class="row" style="gap:10px">
              ${APP.ratings.starsHtml(stats?.avg || 0, 16)}
              <span class="muted" style="font-size:12px;font-weight:700">${stats?.count ? `${(stats.avg || 0).toFixed(1)} from ${stats.count} rating${stats.count === 1 ? "" : "s"}` : "No ratings yet"}</span>
            </div>
            ${S2.user ? `<div class="row" style="gap:6px;margin-top:10px" id="rateRow">
              ${[1, 2, 3, 4, 5].map((n) => `<button class="btn ${mine >= n ? "primary" : "light"} sm" data-star="${n}" style="flex:1">${n}</button>`).join("")}
            </div>` : ""}
          </div>
          ${photos.length ? `<div class="carousel-host" style="margin-top:10px"><div class="hscroll">${photos.map((p) => `<img src="${APP.escapeHtml(p.url)}" alt="Ride photo by ${APP.escapeHtml(p.by)}" style="height:150px;border-radius:14px;object-fit:cover;flex:0 0 auto">`).join("")}</div></div>` : ""}
        </section>`;
        const row = APP.$("#rateRow");
        if (row) row.onclick = async (e) => {
          const b = e.target.closest("[data-star]");
          if (!b) return;
          try {
            await APP.ratings.rateRoute(rateableId, S2.user.uid, +b.dataset.star);
            APP.toast("Rating saved");
            render6();
          } catch (err) {
            console.warn("Rating failed", err);
            APP.toast("Could not save rating");
          }
        };
      }).catch((e) => console.warn("Route social unavailable", e));
    }
  }
  const clubBtn = $2("#routeToClub");
  if (clubBtn) clubBtn.onclick = async () => {
    if (!S2.user) return APP.toast("Sign in to plan a club ride");
    S2.clubRideFromRoute = { name: route.savedName || route.name || "Club ride", distanceKm: km };
    S2.segmentsView = "newEvent";
    APP.open("segments");
  };
  const cueList = APP.cues.buildCues(route);
  const cueHost = $2("#cueHost");
  if (cueHost && cueList.length) {
    cueHost.innerHTML = `<section>
      <div class="between" style="margin-bottom:6px"><span class="section-title">Cue sheet</span><span class="muted" style="font-size:12px;font-weight:700">${cueList.length} cues</span></div>
      <div class="card flat" style="padding:4px 12px;max-height:260px;overflow:auto">
        ${cueList.map((c, i) => `<div class="item" style="gap:10px;padding:8px 0">
          <span class="muted" style="width:22px;font-size:11px;font-weight:700">${i + 1}</span>
          <span style="width:56px;font-size:12px;font-weight:700">${APP.escapeHtml(c.atLabel)}</span>
          <span style="width:22px;font-size:16px">${c.arrow}</span>
          <span style="flex:1;font-size:13px;font-weight:600">${APP.escapeHtml(c.instruction)}</span>
        </div>`).join("")}
      </div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button class="btn light sm" id="printCues" style="flex:1">Print cue sheet</button>
        <button class="btn light sm" id="shareCues" style="flex:1">Share as text</button>
      </div>
    </section>`;
    $2("#printCues").onclick = () => {
      if (!APP.cues.printCues(route, cueList)) APP.toast("Allow pop-ups to print the cue sheet");
    };
    $2("#shareCues").onclick = async () => {
      const text = APP.cues.cuesToText(route, cueList);
      try {
        if (navigator.share) await navigator.share({ title: route.savedName || route.name || "Cue sheet", text });
        else {
          await navigator.clipboard.writeText(text);
          APP.toast("Cue sheet copied");
        }
      } catch (e) {
        if (e?.name !== "AbortError") {
          try {
            await navigator.clipboard.writeText(text);
            APP.toast("Cue sheet copied");
          } catch {
            APP.toast("Could not share the cue sheet");
          }
        }
      }
    };
  }
  const offlineBtn = $2("#detailOffline");
  if (offlineBtn) {
    const paint2 = (saved) => {
      offlineBtn.classList.toggle("active", !!saved);
      offlineBtn.title = saved ? "Saved for offline \u2014 tap to remove" : "Save for offline";
    };
    APP.offline.getOffline(routeId).then((r) => paint2(!!r));
    offlineBtn.onclick = async () => {
      if (!APP.offline.isSupported()) return APP.toast("This browser cannot store routes offline");
      offlineBtn.disabled = true;
      try {
        const existing = await APP.offline.getOffline(routeId);
        if (existing) {
          await APP.offline.removeOffline(routeId);
          paint2(false);
          APP.toast("Removed from offline");
        } else {
          await APP.offline.saveOffline(routeId, route, { cues: cueList, imageUrl: img, name: route.savedName || route.name });
          paint2(true);
          APP.toast("Saved offline \u2014 route, cues and map image");
        }
      } catch (e) {
        console.warn("Offline save failed", e);
        APP.toast("Could not save offline");
      } finally {
        offlineBtn.disabled = false;
      }
    };
  }
  if (hasWind) requestAnimationFrame(() => APP.plot($2("#routeWindChart"), route.wind, "#176bdb", "km/h"));
  wireHeader(back);
  $2("#detailSave").onclick = () => APP.saveRouteByIndex(index);
  $2("#detailShare").onclick = () => APP.shareRouteByIndex(index);
  $2("#detailGpx").onclick = () => {
    APP.select(index);
    APP.exportSelectedRouteGpx();
  };
  $2("#detailStart").onclick = () => {
    APP.select(index);
    APP.startNavigation();
  };
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
      const tx2 = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      tx2.onsuccess = () => {
        const entry = tx2.result;
        if (!entry || Date.now() - entry.savedAt > TTL_MS) return resolve(null);
        resolve(entry.data);
      };
      tx2.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
async function setCached(key, data) {
  const db = await openDb();
  if (!db) return;
  try {
    const tx2 = db.transaction(STORE, "readwrite");
    tx2.objectStore(STORE).put({ data, savedAt: Date.now() }, key);
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
    const timer2 = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
      clearTimeout(timer2);
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
function wayBounds(way) {
  const coords = way?.coords;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}
function pointNearWay(point, way, toleranceKm, turf2) {
  if (way.coords.length < 2) return false;
  try {
    const line2 = turf2.lineString(way.coords);
    const snap = turf2.nearestPointOnLine(line2, turf2.point(point));
    const dist = snap.properties.dist;
    return Number.isFinite(dist) && dist <= toleranceKm;
  } catch {
    return false;
  }
}
async function scoreRouteAgainstOverpass(routeCoords, overpassData, turf2, options = {}) {
  const { sampleEveryKm = 0.12, maxSamples = 240, shouldContinue = () => true } = options;
  if (!overpassData?.ways?.length || !routeCoords?.length) return null;
  const line2 = turf2.lineString(routeCoords);
  const totalKm = turf2.length(line2);
  if (totalKm < 0.05) return null;
  const ways = [];
  for (const way of overpassData.ways) {
    const bounds = wayBounds(way);
    if (bounds) ways.push({ way, bounds });
  }
  if (!ways.length) return null;
  const step2 = Math.max(sampleEveryKm, totalKm / maxSamples);
  const pad = 0.02 / 111 + 5e-4;
  let weightedKm = 0;
  let unpavedKm = 0;
  let sampledKm = 0;
  let n = 0;
  for (let d = 0; d < totalKm; d += step2, n++) {
    if ((n & 31) === 0) {
      if (!shouldContinue()) return null;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const point = turf2.along(line2, d).geometry.coordinates;
    const px = point[0];
    const py = point[1];
    let bestWeight = 0;
    let unpaved = false;
    for (const entry of ways) {
      const b = entry.bounds;
      if (px < b.minX - pad || px > b.maxX + pad) continue;
      if (py < b.minY - pad || py > b.maxY + pad) continue;
      if (!pointNearWay(point, entry.way, 0.02, turf2)) continue;
      const weight = INFRA_WEIGHTS[entry.way.highway] ?? 0.15;
      if (weight > bestWeight) bestWeight = weight;
      if (/unpaved|gravel|dirt|ground|grass/.test(entry.way.surface)) unpaved = true;
    }
    weightedKm += bestWeight * step2;
    if (unpaved) unpavedKm += step2;
    sampledKm += step2;
  }
  const score = Math.round(Math.min(100, weightedKm / Math.max(0.05, sampledKm) * 100));
  const unpavedShare = unpavedKm / Math.max(0.05, sampledKm);
  return { score, unpavedShare };
}
function poisFromOverpass(overpassData, start2, turf2, maxDistanceKm = 30) {
  if (!overpassData?.pois?.length) return [];
  const CATEGORY_SCORE = { viewpoint: 22, peak: 20, attraction: 16, nature_reserve: 15, park: 12, water: 14, cafe: 8, drinking_water: 5 };
  return overpassData.pois.map((poi) => {
    const distance = turf2.distance(start2, poi.coord, { units: "kilometers" });
    return {
      coord: poi.coord,
      name: poi.name,
      category: poi.category,
      distance,
      bearing: (turf2.bearing(start2, poi.coord) + 360) % 360,
      score: (CATEGORY_SCORE[poi.category] || 6) - distance * 0.4
    };
  }).filter((p) => p.distance > 0.3 && p.distance <= maxDistanceKm).sort((a, b) => b.score - a.score);
}

// src/routing/quality.js
var quality_exports = {};
__export(quality_exports, {
  applyPreferences: () => applyPreferences,
  climbRate: () => climbRate,
  compareRoutes: () => compareRoutes,
  cyclewayAnchors: () => cyclewayAnchors,
  daylightLimitKm: () => daylightLimitKm,
  defaultPrefs: () => defaultPrefs,
  fetchSunset: () => fetchSunset,
  whyThisRoute: () => whyThisRoute
});
var QUIET = { cycleway: 1, path: 0.9, track: 0.75, living_street: 0.7, residential: 0.5, unclassified: 0.45, tertiary: 0.25, secondary: 0.1, primary: 0 };
function defaultPrefs() {
  return {
    avoidHills: false,
    quietRoads: true,
    pavedOnly: false,
    tailwindHome: false,
    beforeSunset: false,
    // Metres trimmed from each end of a shared route. 0 shares the whole line.
    privacyRadiusM: 400
  };
}
function cyclewayAnchors(overpassData, start2, radiusKm, turf2, max = 12) {
  const ways = overpassData?.ways || [];
  if (!ways.length) return [];
  const cell = 0.01;
  const cells = /* @__PURE__ */ new Map();
  for (const way of ways) {
    const weight = QUIET[way.highway] ?? 0.2;
    if (weight < 0.7) continue;
    for (const [lng, lat] of way.coords) {
      const key = `${Math.round(lng / cell)}:${Math.round(lat / cell)}`;
      const c = cells.get(key) || { lng: 0, lat: 0, n: 0, weight: 0 };
      c.lng += lng;
      c.lat += lat;
      c.n += 1;
      c.weight += weight;
      cells.set(key, c);
    }
  }
  const out = [];
  for (const c of cells.values()) {
    if (c.n < 8) continue;
    const coord = [c.lng / c.n, c.lat / c.n];
    let distance;
    try {
      distance = turf2.distance(start2, coord, { units: "kilometers" });
    } catch {
      continue;
    }
    if (distance < 1.2 || distance > radiusKm) continue;
    out.push({
      coord,
      name: "Cycle network",
      category: "cycleway osm",
      distance,
      bearing: (turf2.bearing(start2, coord) + 360) % 360,
      score: 24 + Math.min(20, c.weight / 4),
      fromOsm: true
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}
function climbRate(route) {
  const km = (route?.distance || 0) / 1e3;
  return km > 0.5 && Number.isFinite(route?.ascent) ? route.ascent / km : null;
}
function applyPreferences(route, prefs, ctx = {}) {
  if (!route || !prefs) return route;
  const notes = [];
  let delta = 0;
  if (prefs.avoidHills) {
    const rate = climbRate(route);
    if (Number.isFinite(rate)) {
      delta -= Math.max(0, rate - 8) * 2.2;
      if (rate < 8) notes.push("gentle gradients");
    }
  }
  if (prefs.quietRoads) {
    const infra = Number.isFinite(route.osmCycleScore) ? route.osmCycleScore : route.cycleScore;
    if (Number.isFinite(infra)) {
      delta += (infra - 40) * 0.35;
      if (infra >= 55) notes.push("mostly quiet roads and cycleway");
    }
  }
  if (prefs.pavedOnly && Number.isFinite(route.surfaceUnpavedShare)) {
    delta -= route.surfaceUnpavedShare * 90;
    if (route.surfaceUnpavedShare < 0.08) notes.push("paved throughout");
  }
  if (prefs.tailwindHome && Number.isFinite(ctx.windBearing)) {
    const bonus = tailwindHomeScore(route, ctx.windBearing, ctx.turf);
    if (Number.isFinite(bonus)) {
      delta += bonus;
      if (bonus > 6) notes.push("tailwind on the way home");
    }
  }
  if (prefs.beforeSunset && Number.isFinite(ctx.maxKmForDaylight)) {
    const km = (route.distance || 0) / 1e3;
    if (km > ctx.maxKmForDaylight) delta -= (km - ctx.maxKmForDaylight) * 6;
    else notes.push("finishes before dark");
  }
  route.prefAdjust = Math.round(delta);
  route.prefNotes = notes;
  route.loopQuality = (route.loopQuality || 0) + delta;
  return route;
}
function tailwindHomeScore(route, windBearing, turf2) {
  const coords = route?.geometry?.coordinates;
  if (!coords || coords.length < 8 || !turf2) return null;
  try {
    const half = Math.floor(coords.length / 2);
    const legs = [];
    for (let i = half; i < coords.length - 1; i += Math.max(1, Math.floor((coords.length - half) / 12))) {
      legs.push(turf2.bearing(coords[i], coords[i + 1]));
    }
    if (!legs.length) return null;
    const tailwindDir = (windBearing + 180) % 360;
    const alignment = legs.reduce((sum, b) => {
      const diff = Math.abs((b - tailwindDir + 540) % 360 - 180);
      return sum + Math.cos(diff * Math.PI / 180);
    }, 0) / legs.length;
    return alignment * 14;
  } catch {
    return null;
  }
}
function daylightLimitKm(sunsetMs, nowMs, avgSpeedKmh = 18) {
  if (!Number.isFinite(sunsetMs)) return null;
  const hours = (sunsetMs - nowMs) / 36e5;
  return hours > 0 ? Math.max(3, hours * avgSpeedKmh * 0.9) : 0;
}
function whyThisRoute(route, others) {
  const rest = (others || []).filter((r) => r !== route);
  const bits = [];
  const infra = Number.isFinite(route.osmCycleScore) ? route.osmCycleScore : route.cycleScore;
  const km = (route.distance || 0) / 1e3;
  if (Number.isFinite(infra) && infra > 0 && !route.cycleScorePending && rest.length) {
    const others2 = rest.map((r) => Number.isFinite(r.osmCycleScore) ? r.osmCycleScore : r.cycleScore).filter(Number.isFinite);
    if (others2.length === rest.length && infra > Math.max(...others2)) bits.push(`most cycle infrastructure (${infra}%)`);
  }
  if (Number.isFinite(route.ascent) && rest.length) {
    const climbs = rest.map((r) => r.ascent).filter(Number.isFinite);
    if (climbs.length) {
      const min = Math.min(...climbs);
      const diff = Math.round(min - route.ascent);
      if (diff > 40) bits.push(`${diff} m less climbing`);
      else if (route.ascent - min > 60) bits.push(`${Math.round(route.ascent - min)} m more climbing`);
    }
  }
  if (rest.length) {
    const lengths = rest.map((r) => (r.distance || 0) / 1e3).filter((n) => n > 0);
    if (lengths.length) {
      const shortest = Math.min(...lengths);
      const diff = km - shortest;
      if (diff > 3) bits.push(`${diff.toFixed(1)} km longer`);
      else if (shortest - km > 3) bits.push(`${(shortest - km).toFixed(1)} km shorter`);
    }
  }
  const bt = route.backtrack;
  const len = (m) => m >= 1e3 ? `${(m / 1e3).toFixed(1)} km` : `${Math.round(m)} m`;
  if (bt && bt.longestDetourM > 100) {
    bits.unshift(`turns back on itself for ${len(bt.longestDetourM)}`);
  } else if (bt && bt.longestBacktrackM === 0 && bt.overlapM === 0) {
    bits.push("no road ridden twice");
  } else if (bt && bt.sharedBacktrackM >= 500) {
    bits.push(`${len(bt.sharedBacktrackM)} on road ridden earlier`);
  } else if (bt) {
    bits.push("almost no repeated road");
  }
  if (route.prefNotes?.length) bits.push(...route.prefNotes);
  if (!bits.length) return null;
  const s = bits.slice(0, 3).join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}
function compareRoutes(a, b) {
  const val = (r, f) => f(r);
  const rows = [
    { label: "Distance", get: (r) => (r.distance || 0) / 1e3, fmt: (v) => `${v.toFixed(1)} km`, lowerIsBetter: false },
    { label: "Climbing", get: (r) => r.ascent, fmt: (v) => Number.isFinite(v) ? `${Math.round(v)} m` : "\u2014", lowerIsBetter: true },
    { label: "Climb rate", get: (r) => climbRate(r), fmt: (v) => Number.isFinite(v) ? `${v.toFixed(1)} m/km` : "\u2014", lowerIsBetter: true },
    { label: "Est. time", get: (r) => r.duration, fmt: (v) => v ? `${Math.floor(v / 3600)}h ${Math.round(v % 3600 / 60)}m` : "\u2014", lowerIsBetter: true },
    { label: "Cycle infra", get: (r) => Number.isFinite(r.osmCycleScore) ? r.osmCycleScore : r.cycleScore, fmt: (v) => Number.isFinite(v) ? `${v}%` : "\u2014", lowerIsBetter: false },
    { label: "Unpaved", get: (r) => Number.isFinite(r.surfaceUnpavedShare) ? r.surfaceUnpavedShare * 100 : null, fmt: (v) => Number.isFinite(v) ? `${Math.round(v)}%` : "\u2014", lowerIsBetter: true },
    { label: "New road", get: (r) => Number.isFinite(r.retrace) ? (1 - r.retrace) * 100 : null, fmt: (v) => Number.isFinite(v) ? `${Math.round(v)}%` : "\u2014", lowerIsBetter: false }
  ];
  return rows.map((row) => {
    const av = val(a, row.get);
    const bv = val(b, row.get);
    let winner = null;
    if (Number.isFinite(av) && Number.isFinite(bv) && Math.abs(av - bv) > 1e-6) {
      const aWins = row.lowerIsBetter ? av < bv : av > bv;
      winner = aWins ? "a" : "b";
    }
    return { label: row.label, a: row.fmt(av), b: row.fmt(bv), winner };
  });
}
async function fetchSunset(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunset&timezone=auto&forecast_days=1`;
    const data = await fetch(url).then((r) => r.json());
    const iso = data?.daily?.sunset?.[0];
    return iso ? new Date(iso).getTime() : null;
  } catch (error) {
    console.warn("Sunset lookup failed", error);
    return null;
  }
}

// src/routing/cues.js
var cues_exports = {};
__export(cues_exports, {
  buildCues: () => buildCues,
  cuesToText: () => cuesToText,
  printCues: () => printCues
});
var ARROW = (m = {}) => {
  const mod = (m.modifier || "").toLowerCase();
  const type = (m.type || "").toLowerCase();
  if (type === "roundabout" || type === "rotary") return "\u21BB";
  if (type === "arrive") return "\u25C9";
  if (type === "depart") return "\u25B2";
  if (mod.includes("uturn")) return "\u21A9";
  if (mod.includes("sharp left")) return "\u21B0";
  if (mod.includes("sharp right")) return "\u21B1";
  if (mod.includes("slight left")) return "\u2196";
  if (mod.includes("slight right")) return "\u2197";
  if (mod.includes("left")) return "\u2190";
  if (mod.includes("right")) return "\u2192";
  return "\u2191";
};
var fmtDist = (m) => m >= 1e3 ? `${(m / 1e3).toFixed(m >= 1e4 ? 0 : 1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`;
function buildCues(route) {
  const steps = (route?.legs || []).flatMap((l) => l.steps || []);
  if (!steps.length) return [];
  const cues = [];
  let cumulative = 0;
  for (const step2 of steps) {
    const m = step2.maneuver || {};
    const type = (m.type || "").toLowerCase();
    const road = step2.name || step2.ref || "";
    const isContinue = type === "continue" || !m.modifier && type !== "arrive" && type !== "depart";
    const prev = cues[cues.length - 1];
    if (isContinue && prev && prev.road === road && prev.type !== "arrive") {
      prev.distance += step2.distance || 0;
      cumulative += step2.distance || 0;
      continue;
    }
    cues.push({
      at: cumulative,
      distance: step2.distance || 0,
      road,
      type,
      arrow: ARROW(m),
      instruction: m.instruction || (road ? `Continue on ${road}` : "Continue")
    });
    cumulative += step2.distance || 0;
  }
  return cues.map((c) => ({ ...c, atLabel: fmtDist(c.at), forLabel: fmtDist(c.distance) }));
}
function cuesToText(route, cues) {
  const km = ((route?.distance || 0) / 1e3).toFixed(1);
  const title = route?.savedName || route?.name || "Ridewise route";
  const lines = [`${title} \u2014 ${km} km`, ""];
  cues.forEach((c, i) => {
    lines.push(`${String(i + 1).padStart(3, " ")}. ${c.atLabel.padStart(8, " ")}  ${c.arrow}  ${c.instruction}${c.road && !c.instruction.includes(c.road) ? ` (${c.road})` : ""}`);
  });
  lines.push("", "Planned with Ridewise");
  return lines.join("\n");
}
function printCues(route, cues) {
  const km = ((route?.distance || 0) / 1e3).toFixed(1);
  const climb = Number.isFinite(route?.ascent) ? `${Math.round(route.ascent)} m climbing` : "";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const rows = cues.map((c, i) => `<tr>
      <td class="n">${i + 1}</td>
      <td class="at">${esc(c.atLabel)}</td>
      <td class="ar">${esc(c.arrow)}</td>
      <td>${esc(c.instruction)}</td>
      <td class="for">${esc(c.forLabel)}</td>
    </tr>`).join("");
  const html2 = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(route?.savedName || route?.name || "Cue sheet")}</title>
    <style>
      body { font: 12pt/1.4 -apple-system, system-ui, sans-serif; margin: 18mm 14mm; color: #111; }
      h1 { font-size: 18pt; margin: 0 0 2mm; }
      .meta { color: #555; font-size: 11pt; margin-bottom: 6mm; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 2.2mm 2mm; border-bottom: 0.3pt solid #bbb; vertical-align: top; }
      .n { width: 9mm; color: #777; }
      .at { width: 20mm; font-variant-numeric: tabular-nums; }
      .ar { width: 9mm; font-size: 14pt; }
      .for { width: 20mm; text-align: right; color: #555; font-variant-numeric: tabular-nums; }
      tr { break-inside: avoid; }
      @page { margin: 14mm; }
    </style></head><body>
    <h1>${esc(route?.savedName || route?.name || "Ridewise route")}</h1>
    <div class="meta">${km} km${climb ? ` \xB7 ${climb}` : ""} \xB7 ${cues.length} cues \xB7 planned with Ridewise</div>
    <table><tbody>${rows}</tbody></table>
    <script>window.onload = () => setTimeout(() => window.print(), 250);<\/script>
    </body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return false;
  w.document.write(html2);
  w.document.close();
  return true;
}

// src/routing/offline.js
var offline_exports = {};
__export(offline_exports, {
  getOffline: () => getOffline,
  isSupported: () => isSupported2,
  listOffline: () => listOffline,
  offlineIds: () => offlineIds,
  offlineSizeBytes: () => offlineSizeBytes,
  removeOffline: () => removeOffline,
  saveOffline: () => saveOffline
});
var DB_NAME2 = "ridewise-offline";
var STORE2 = "routes";
var dbPromise2 = null;
function openDb2() {
  if (dbPromise2) return dbPromise2;
  dbPromise2 = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB_NAME2, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE2)) db.createObjectStore(STORE2, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise2;
}
function tx(mode, fn) {
  return openDb2().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      let out = null;
      const t = db.transaction(STORE2, mode);
      const store = t.objectStore(STORE2);
      const req = fn(store);
      if (req) req.onsuccess = () => {
        out = req.result;
      };
      t.oncomplete = () => resolve(out);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    });
  });
}
function isSupported2() {
  return typeof indexedDB !== "undefined";
}
async function saveOffline(id, route, { cues = [], imageUrl = null, name = "" } = {}) {
  let image = null;
  if (imageUrl) {
    try {
      const res = await fetch(imageUrl);
      if (res.ok) image = await res.blob();
    } catch (error) {
      console.warn("Offline map image unavailable", error);
    }
  }
  const record2 = {
    id,
    name: name || route?.savedName || route?.name || "Saved route",
    savedAt: Date.now(),
    distance: route?.distance || 0,
    ascent: route?.ascent ?? null,
    geometry: route?.geometry || null,
    legs: route?.legs || [],
    elev: route?.elev || [],
    wind: route?.wind || [],
    cues,
    image
  };
  await tx("readwrite", (store) => store.put(record2));
  return record2;
}
function getOffline(id) {
  return tx("readonly", (store) => store.get(id));
}
function removeOffline(id) {
  return tx("readwrite", (store) => store.delete(id));
}
async function listOffline() {
  const all = await tx("readonly", (store) => store.getAll());
  return Array.isArray(all) ? all.sort((a, b) => b.savedAt - a.savedAt) : [];
}
async function offlineIds() {
  const all = await listOffline();
  return new Set(all.map((r) => r.id));
}
async function offlineSizeBytes() {
  const all = await listOffline();
  return all.reduce((n, r) => {
    const geo2 = JSON.stringify(r.geometry || {}).length;
    const legs = JSON.stringify(r.legs || []).length;
    return n + geo2 + legs + (r.image?.size || 0);
  }, 0);
}

// src/social/liveFriends.js
var markers = /* @__PURE__ */ new Map();
var timer = 0;
var running = false;
var initials4 = (n = "") => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "R";
var colorFor = (uid2 = "") => ["#8b5bd6", "#00a6a6", "#176bdb", "#f28b30", "#139b66"][[...uid2].reduce((a, c) => a + c.charCodeAt(0), 0) % 5];
async function fetchActiveFriends(uid2) {
  const uids = await listFollowingUids(uid2).catch(() => []);
  if (!uids.length) return [];
  const db = await getCloud();
  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map(
      (chunk) => db.getDocs(db.query(db.collection(db.firestore, "journeys_v4"), db.where("ownerId", "in", chunk), db.where("active", "==", true)))
    )
  );
  const out = [];
  snaps.forEach((snap) => snap.docs.forEach((d) => {
    const data = d.data();
    if (data?.paused) return;
    const loc = data.location;
    if (!loc || !Number.isFinite(loc.lng) || !Number.isFinite(loc.lat)) return;
    out.push({ id: d.id, ownerId: data.ownerId, name: data.riderName || data.routeName || "Rider", pos: [loc.lng, loc.lat] });
  }));
  return out;
}
function markerElement(friend) {
  const el = document.createElement("div");
  el.className = "friend-marker";
  el.style.background = colorFor(friend.ownerId);
  el.textContent = initials4(friend.name);
  el.title = `${friend.name} is riding now`;
  return el;
}
async function refresh(ctx) {
  const { state: state4, map: map2, mapboxgl: mapboxgl2 } = ctx;
  if (!state4.user) return;
  let friends = [];
  try {
    friends = await fetchActiveFriends(state4.user.uid);
  } catch (error) {
    console.warn("Live friends unavailable", error);
    return;
  }
  const seen = /* @__PURE__ */ new Set();
  friends.forEach((f) => {
    seen.add(f.id);
    const existing = markers.get(f.id);
    if (existing) existing.setLngLat(f.pos);
    else markers.set(f.id, new mapboxgl2.Marker({ element: markerElement(f) }).setLngLat(f.pos).addTo(map2));
  });
  [...markers.keys()].forEach((id) => {
    if (seen.has(id)) return;
    markers.get(id)?.remove();
    markers.delete(id);
  });
  ctx.onCount?.(friends.length);
}
function startLiveFriends(ctx, intervalMs = 25e3) {
  if (running) return;
  running = true;
  refresh(ctx);
  timer = setInterval(() => refresh(ctx), intervalMs);
}
function stopLiveFriends() {
  running = false;
  clearInterval(timer);
  markers.forEach((m) => m.remove());
  markers.clear();
}

// src/social/ratings.js
var ratings_exports = {};
__export(ratings_exports, {
  getMyRating: () => getMyRating,
  getRouteStats: () => getRouteStats,
  rateRoute: () => rateRoute,
  recordRouteRidden: () => recordRouteRidden,
  routeIdOf: () => routeIdOf,
  routePhotos: () => routePhotos,
  starsHtml: () => starsHtml
});
function routeIdOf(item) {
  return item?.savedId || item?.id || null;
}
async function getRouteStats(routeId) {
  if (!routeId) return null;
  try {
    const db = await getCloud();
    const snap = await db.getDoc(db.doc(db.firestore, "routeStats", routeId));
    return snap.exists() ? snap.data() : { avg: 0, count: 0, rideCount: 0 };
  } catch (error) {
    console.warn("Route stats unavailable", error);
    return null;
  }
}
async function getMyRating(routeId, uid2) {
  if (!routeId || !uid2) return 0;
  try {
    const db = await getCloud();
    const snap = await db.getDoc(db.doc(db.firestore, "routeStats", routeId, "ratings", uid2));
    return snap.exists() ? snap.data().stars || 0 : 0;
  } catch {
    return 0;
  }
}
async function rateRoute(routeId, uid2, stars2) {
  const db = await getCloud();
  await db.setDoc(db.doc(db.firestore, "routeStats", routeId, "ratings", uid2), {
    uid: uid2,
    stars: Math.max(1, Math.min(5, Math.round(stars2))),
    createdAt: db.serverTimestamp()
  });
  const all = await db.getDocs(db.collection(db.firestore, "routeStats", routeId, "ratings"));
  let sum = 0, n = 0;
  all.docs.forEach((d) => {
    const s = d.data().stars;
    if (Number.isFinite(s)) {
      sum += s;
      n += 1;
    }
  });
  const avg = n ? sum / n : 0;
  await db.setDoc(db.doc(db.firestore, "routeStats", routeId), { avg, count: n }, { merge: true });
  return { avg, count: n };
}
async function recordRouteRidden(routeId) {
  if (!routeId) return;
  try {
    const db = await getCloud();
    await db.setDoc(db.doc(db.firestore, "routeStats", routeId), { rideCount: db.increment(1) }, { merge: true });
  } catch (error) {
    console.warn("Ride count not recorded", error);
  }
}
async function routePhotos(routeId, max = 12) {
  if (!routeId) return [];
  try {
    const db = await getCloud();
    const snap = await db.getDocs(
      db.query(db.collection(db.firestore, "activities"), db.where("routeId", "==", routeId), db.limit(max))
    );
    return snap.docs.flatMap((d) => {
      const a = d.data();
      return (a.photoUrls || []).map((url) => ({ url, by: a.ownerDisplayName || "Rider", activityId: d.id }));
    }).slice(0, max);
  } catch (error) {
    console.warn("Route photos unavailable", error);
    return [];
  }
}
function starsHtml(avg, size = 14) {
  const full = Math.round(avg || 0);
  const star = '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>';
  return `<span class="stars">${Array.from({ length: 5 }, (_, i) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" style="opacity:${i < full ? 1 : 0.25}">${star}</svg>`).join("")}</span>`;
}

// src/routing/retrace.js
var EARTH_RADIUS_M = 63710088e-1;
function projector(coords) {
  let lng = 0, lat = 0;
  for (const [x, y] of coords) {
    lng += x;
    lat += y;
  }
  lng /= coords.length;
  lat /= coords.length;
  const ky = Math.PI / 180 * EARTH_RADIUS_M;
  const kx = Math.cos(lat * Math.PI / 180) * ky;
  return {
    to: ([x, y]) => [(x - lng) * kx, (y - lat) * ky],
    from: ([x, y]) => [x / kx + lng, y / ky + lat]
  };
}
function resample(points, spacing) {
  const out = [{ p: points[0], d: 0 }];
  let carried = 0, along = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (!(len > 0)) continue;
    let t = spacing - carried;
    while (t <= len) {
      out.push({ p: [ax + (bx - ax) * t / len, ay + (by - ay) * t / len], d: along + t });
      t += spacing;
    }
    carried = len - (t - spacing);
    along += len;
  }
  const last = points[points.length - 1];
  if (Math.hypot(last[0] - out[out.length - 1].p[0], last[1] - out[out.length - 1].p[1]) > spacing * 0.3) {
    out.push({ p: last, d: along });
  }
  return out;
}
function pointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function measureRetrace(coords, options = {}) {
  const {
    spacingM = 25,
    matchM = 22,
    homeZoneM = 400,
    // How far back along the route a match must be. Road just ridden in the
    // same direction is always nearby, so repeats need a real gap; a match in
    // the OPPOSITE direction that close is the U-turn itself, so it needs very
    // little — otherwise any spur shorter than the gap goes unseen.
    minGapSamples = 6,
    minGapOppositeSamples = 2,
    // A U-turn doubles back at close to 180°. At 135° a merely sharp corner
    // matched the road just before it and read as a back-track.
    oppositeDeg = 150,
    // A back-track whose first metres match road ridden within this distance is
    // a turn-round detour rather than a road shared with a much later stretch.
    detourGapM = 200,
    sameDeg = 45
  } = options;
  const empty = { totalM: 0, backtrackM: 0, overlapM: 0, ratio: 0, longestBacktrackM: 0, spans: [] };
  if (!Array.isArray(coords) || coords.length < 3) return empty;
  const proj = projector(coords);
  const samples = resample(coords.map(proj.to), spacingM);
  const n = samples.length;
  if (n < minGapOppositeSamples + 3) return { ...empty, totalM: samples[n - 1]?.d || 0 };
  const cell = matchM * 1.5;
  const grid = /* @__PURE__ */ new Map();
  const key = (cx, cy) => `${cx},${cy}`;
  const heading = new Array(n - 1);
  for (let k = 0; k < n - 1; k++) {
    const [ax, ay] = samples[k].p, [bx, by] = samples[k + 1].p;
    heading[k] = Math.atan2(by - ay, bx - ax);
    const x0 = Math.floor(Math.min(ax, bx) / cell), x1 = Math.floor(Math.max(ax, bx) / cell);
    const y0 = Math.floor(Math.min(ay, by) / cell), y1 = Math.floor(Math.max(ay, by) / cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const id = key(cx, cy);
        let list = grid.get(id);
        if (!list) grid.set(id, list = []);
        list.push(k);
      }
    }
  }
  const home = samples[0].p;
  const opposite = oppositeDeg * Math.PI / 180;
  const same = sameDeg * Math.PI / 180;
  const kind = new Array(n).fill(0);
  const gapM = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const [px, py] = samples[i].p;
    if (Math.hypot(px - home[0], py - home[1]) < homeZoneM) continue;
    const here = Math.atan2(samples[i + 1].p[1] - samples[i - 1].p[1], samples[i + 1].p[0] - samples[i - 1].p[0]);
    const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
    let found = 0;
    for (let ox = -1; ox <= 1 && found < 2; ox++) {
      for (let oy = -1; oy <= 1 && found < 2; oy++) {
        const list = grid.get(key(cx + ox, cy + oy));
        if (!list) continue;
        for (const k of list) {
          if (k >= i - minGapOppositeSamples) continue;
          const [ax, ay] = samples[k].p, [bx, by] = samples[k + 1].p;
          if (pointToSegment(px, py, ax, ay, bx, by) > matchM) continue;
          let diff = Math.abs(here - heading[k]);
          if (diff > Math.PI) diff = 2 * Math.PI - diff;
          if (diff >= opposite) {
            found = 2;
            gapM[i] = samples[i].d - samples[k].d;
            break;
          }
          if (diff <= same && k < i - minGapSamples) found = Math.max(found, 1);
        }
      }
    }
    kind[i] = found;
  }
  let backtrackM = 0, overlapM = 0, longest = 0;
  const spans = [];
  for (let i = 1; i < n; i++) {
    const step2 = samples[i].d - samples[i - 1].d;
    if (kind[i] === 1) overlapM += step2;
    if (kind[i] !== 2) continue;
    backtrackM += step2;
    const last = spans[spans.length - 1];
    if (last && last.endIndex === i - 1) {
      last.endIndex = i;
      last.lengthM += step2;
    } else {
      spans.push({ startIndex: i, endIndex: i, lengthM: step2, startM: samples[i].d, firstGapM: gapM[i] });
    }
  }
  for (let i = spans.length - 1; i >= 0; i--) {
    if (spans[i].endIndex === spans[i].startIndex) {
      backtrackM -= spans[i].lengthM;
      spans.splice(i, 1);
    }
  }
  let longestDetour = 0, sharedM = 0;
  for (const s of spans) {
    longest = Math.max(longest, s.lengthM);
    s.apex = proj.from(samples[Math.max(0, s.startIndex - 1)].p);
    s.detour = s.firstGapM <= detourGapM;
    if (s.detour) longestDetour = Math.max(longestDetour, s.lengthM);
    else sharedM += s.lengthM;
  }
  const totalM = samples[n - 1].d;
  return {
    totalM,
    backtrackM,
    overlapM,
    ratio: totalM > 0 ? (backtrackM + overlapM) / totalM : 0,
    longestBacktrackM: longest,
    longestDetourM: longestDetour,
    sharedBacktrackM: sharedM,
    sharedRatio: totalM > 0 ? sharedM / totalM : 0,
    spans: spans.map(({ startM, lengthM, apex, detour }) => ({ startM, lengthM, apex, detour }))
  };
}
var MAX_DETOUR_M = 100;
var MAX_SHARED_RATIO = 0.12;
function isCleanLoop(measure) {
  return !!measure && measure.longestDetourM <= MAX_DETOUR_M && measure.sharedRatio <= MAX_SHARED_RATIO;
}

// src/routing/elevation.js
var OPEN_METEO_MAX_POINTS = 100;
var DEM_MAX_ZOOM = 14;
var DEM_MIN_ZOOM = 10;
var DEM_MAX_TILES = 32;
var DEM_CACHE_TILES = 40;
var DEM_CONCURRENCY = 6;
var openMeteoBlockedUntil = 0;
var demCache = /* @__PURE__ */ new Map();
async function fromOpenMeteo(points, signal) {
  if (points.length > OPEN_METEO_MAX_POINTS) throw new Error("Too many points for Open-Meteo");
  if (Date.now() < openMeteoBlockedUntil) throw new Error("Open-Meteo quota spent");
  const lat = points.map((p) => +p[1].toFixed(5)).join(",");
  const lng = points.map((p) => +p[0].toFixed(5)).join(",");
  const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`, { signal });
  if (!res.ok) {
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      openMeteoBlockedUntil = Date.now() + (/daily/i.test(body?.reason || "") ? 36e5 : 6e4);
    }
    throw new Error(`Open-Meteo ${res.status}`);
  }
  const elevation = (await res.json())?.elevation;
  if (!Array.isArray(elevation) || elevation.length !== points.length || !elevation.every(Number.isFinite)) {
    throw new Error("Open-Meteo returned an incomplete profile");
  }
  return elevation;
}
function tileCoords(lng, lat, z) {
  const n = 2 ** z, rad = lat * Math.PI / 180;
  return {
    x: (lng + 180) / 360 * n,
    y: (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n
  };
}
async function decodeTile(blob) {
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const size = bitmap.width;
  const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(size, size) : Object.assign(document.createElement("canvas"), { width: size, height: size });
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return { size, data: ctx.getImageData(0, 0, size, size).data };
}
function demTile(z, x, y, token, signal) {
  const key = `${z}/${x}/${y}`;
  if (demCache.has(key)) {
    const hit = demCache.get(key);
    demCache.delete(key);
    demCache.set(key, hit);
    return hit;
  }
  const job = fetch(`https://api.mapbox.com/v4/mapbox.mapbox-terrain-dem-v1/${key}.pngraw?access_token=${token}`, { signal }).then((res) => {
    if (!res.ok) throw new Error(`Mapbox terrain ${res.status}`);
    return res.blob();
  }).then(decodeTile);
  job.catch(() => demCache.delete(key));
  demCache.set(key, job);
  while (demCache.size > DEM_CACHE_TILES) demCache.delete(demCache.keys().next().value);
  return job;
}
function heightAt(tile, px, py) {
  const { size, data } = tile;
  const read2 = (x, y) => {
    const i = (Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))) * 4;
    return -1e4 + (data[i] * 65536 + data[i + 1] * 256 + data[i + 2]) * 0.1;
  };
  const x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5), fx = px - 0.5 - x0, fy = py - 0.5 - y0;
  const top = read2(x0, y0) * (1 - fx) + read2(x0 + 1, y0) * fx;
  const bottom = read2(x0, y0 + 1) * (1 - fx) + read2(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}
async function fromMapboxTerrain(points, token, signal) {
  if (!token) throw new Error("No Mapbox token");
  if (typeof createImageBitmap !== "function") throw new Error("Terrain decoding unsupported");
  let z = DEM_MAX_ZOOM, placed;
  for (; z >= DEM_MIN_ZOOM; z--) {
    placed = points.map((p) => {
      const t = tileCoords(p[0], p[1], z), tx2 = Math.floor(t.x), ty = Math.floor(t.y);
      return { key: `${tx2}/${ty}`, tx: tx2, ty, fx: t.x - tx2, fy: t.y - ty };
    });
    if (new Set(placed.map((p) => p.key)).size <= DEM_MAX_TILES || z === DEM_MIN_ZOOM) break;
  }
  const keys = [...new Set(placed.map((p) => p.key))];
  const tiles = /* @__PURE__ */ new Map();
  for (let i = 0; i < keys.length; i += DEM_CONCURRENCY) {
    await Promise.all(keys.slice(i, i + DEM_CONCURRENCY).map(async (key) => {
      const [tx2, ty] = key.split("/").map(Number);
      tiles.set(key, await demTile(z, tx2, ty, token, signal).catch(() => null));
    }));
  }
  const heights = placed.map((p) => {
    const tile = tiles.get(p.key);
    return tile ? heightAt(tile, p.fx * tile.size, p.fy * tile.size) : null;
  });
  const missing = heights.filter((h) => !Number.isFinite(h)).length;
  if (missing > heights.length * 0.2) throw new Error("Mapbox terrain tiles unavailable");
  return fillGaps(heights);
}
function fillGaps(values) {
  const out = values.slice();
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i])) continue;
    let a = i - 1;
    while (a >= 0 && !Number.isFinite(out[a])) a--;
    let b = i + 1;
    while (b < out.length && !Number.isFinite(values[b])) b++;
    const left = a >= 0 ? out[a] : null, right = b < out.length ? values[b] : null;
    out[i] = left === null ? right : right === null ? left : left + (right - left) * (i - a) / (b - a);
  }
  return out.map((v) => Math.round(v * 10) / 10);
}
async function fetchElevations(points, { token, signal } = {}) {
  if (!Array.isArray(points) || points.length < 2) throw new Error("Need at least two points");
  const errors = [];
  if (points.length <= OPEN_METEO_MAX_POINTS) {
    try {
      return { elev: await fromOpenMeteo(points, signal), source: "open-meteo" };
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push(error.message);
    }
  }
  try {
    return { elev: await fromMapboxTerrain(points, token, signal), source: "mapbox-terrain" };
  } catch (error) {
    errors.push(error.message);
  }
  throw new Error(`Elevation unavailable (${errors.join("; ")})`);
}
function elevationSamplePoints(coords, turf2, maxPoints = OPEN_METEO_MAX_POINTS) {
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + turf2.distance(coords[i - 1], coords[i], { units: "meters" }));
  const total = cum.at(-1);
  if (!(total > 0)) return [coords[0], coords.at(-1)];
  const count = Math.max(10, Math.min(maxPoints, Math.round(total / 25) + 1));
  const out = [];
  let seg = 1;
  for (let k = 0; k < count; k++) {
    const d = total * k / (count - 1);
    while (seg < coords.length - 1 && cum[seg] < d) seg++;
    const a = coords[seg - 1], b = coords[seg], span = cum[seg] - cum[seg - 1];
    const t = span > 0 ? Math.min(1, Math.max(0, (d - cum[seg - 1]) / span)) : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

// src/social/segments.js
var segments_exports = {};
__export(segments_exports, {
  createSegment: () => createSegment,
  fmtSeconds: () => fmtSeconds,
  listEfforts: () => listEfforts,
  listSegmentsNear: () => listSegmentsNear,
  liveSegmentState: () => liveSegmentState,
  matchActivity: () => matchActivity,
  matchEffort: () => matchEffort,
  saveEffort: () => saveEffort
});
var MATCH_TOLERANCE_M = 35;
async function listSegmentsNear(center, radiusKm, turf2, max = 40) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(db.query(db.collection(db.firestore, "segments"), db.limit(max)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => {
      if (!center || !Array.isArray(s.start)) return true;
      try {
        return turf2.distance(center, s.start, { units: "kilometers" }) <= radiusKm;
      } catch {
        return false;
      }
    });
  } catch (error) {
    console.warn("Segments unavailable", error);
    return [];
  }
}
async function createSegment(user, { name, coords, turf: turf2 }) {
  if (!Array.isArray(coords) || coords.length < 2) throw new Error("Segment needs a path");
  const db = await getCloud();
  const line2 = turf2.lineString(coords);
  const distanceKm = turf2.length(line2, { units: "kilometers" });
  const bbox = turf2.bbox(line2);
  const ref = await db.addDoc(db.collection(db.firestore, "segments"), {
    name: (name || "Segment").slice(0, 80),
    createdBy: user.uid,
    createdAt: db.serverTimestamp(),
    distanceKm,
    start: coords[0],
    end: coords[coords.length - 1],
    polyline: JSON.stringify(coords),
    bbox,
    effortCount: 0
  });
  return ref.id;
}
async function listEfforts(segmentId, max = 50) {
  try {
    const db = await getCloud();
    const snap = await db.getDocs(
      db.query(db.collection(db.firestore, "segments", segmentId, "efforts"), db.orderBy("seconds", "asc"), db.limit(max))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}
function matchEffort(samples, segment, turf2) {
  const pts = (samples || []).filter((s) => Array.isArray(s.pos) && Number.isFinite(s.time));
  if (pts.length < 4 || !Array.isArray(segment.start) || !Array.isArray(segment.end)) return null;
  const near = (a, b) => {
    try {
      return turf2.distance(a, b, { units: "meters" }) <= MATCH_TOLERANCE_M;
    } catch {
      return false;
    }
  };
  let startIdx = -1;
  for (let i = 0; i < pts.length; i++) {
    if (near(pts[i].pos, segment.start)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return null;
  for (let j = startIdx + 1; j < pts.length; j++) {
    if (near(pts[j].pos, segment.end)) {
      const seconds = Math.round((pts[j].time - pts[startIdx].time) / 1e3);
      return seconds > 5 ? { seconds, startIdx, endIdx: j } : null;
    }
  }
  return null;
}
async function saveEffort(user, segmentId, { seconds, activityId, riddenAt }) {
  const db = await getCloud();
  const id = `${user.uid}_${riddenAt || Date.now()}`;
  await db.setDoc(db.doc(db.firestore, "segments", segmentId, "efforts", id), {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "Rider",
    seconds,
    activityId: activityId || null,
    riddenAt: riddenAt || Date.now()
  });
  await db.setDoc(db.doc(db.firestore, "segments", segmentId), { effortCount: db.increment(1) }, { merge: true });
}
async function matchActivity(user, activity, turf2) {
  const samples = activity?.samples || [];
  if (samples.length < 4) return [];
  const start2 = samples[0].pos;
  const segments = await listSegmentsNear(start2, 60, turf2);
  const found = [];
  for (const segment of segments) {
    const effort = matchEffort(samples, segment, turf2);
    if (!effort) continue;
    const previous = (await listEfforts(segment.id)).filter((e) => e.uid === user.uid);
    const best = previous.length ? Math.min(...previous.map((e) => e.seconds)) : null;
    await saveEffort(user, segment.id, { seconds: effort.seconds, activityId: activity.id, riddenAt: activity.ended || Date.now() });
    found.push({
      segmentId: segment.id,
      name: segment.name,
      seconds: effort.seconds,
      isPR: best === null || effort.seconds < best,
      previousBest: best
    });
  }
  return found;
}
function liveSegmentState(record2, segment, turf2) {
  const samples = record2?.samples || [];
  if (!samples.length || !Array.isArray(segment?.start)) return null;
  const near = (a, b, m) => {
    try {
      return turf2.distance(a, b, { units: "meters" }) <= m;
    } catch {
      return false;
    }
  };
  const last = samples[samples.length - 1];
  if (!Array.isArray(last?.pos)) return null;
  let startIdx = -1;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (near(samples[i].pos, segment.start, MATCH_TOLERANCE_M)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return null;
  if (near(last.pos, segment.end, MATCH_TOLERANCE_M)) {
    return { state: "finished", seconds: Math.round((last.time - samples[startIdx].time) / 1e3) };
  }
  return { state: "running", seconds: Math.round((last.time - samples[startIdx].time) / 1e3) };
}
var fmtSeconds = (s) => {
  const v = Math.max(0, Math.round(s || 0));
  const m = Math.floor(v / 60);
  return `${m}:${String(v % 60).padStart(2, "0")}`;
};

// src/legacy.js
var $ = (s, r = document) => r.querySelector(s);
var panel = $("#panel");
var S = { page: "explore", mode: "point", waypoints: [], names: [], routes: [], route: null, selected: null, markers: [], nodes: [], layers: [], poiMarkers: [], geocoders: {}, weather: null, weatherOn: false, wind: { speed: 15, dir: 240 }, windGrid: null, windGridKey: "", windLoading: false, record: null, watch: null, user: null, navState: null, styleIndex: 0, pendingActivity: null, activityView: null, activitySort: "date-desc", lastVoiceKey: "", lastRerouteAt: 0, wakeLock: null, wakeLockWanted: false, audioNavigation: localStorage.getItem("audioNavigation") !== "off", audioUnlocked: false, headingSamples: [], smoothedHeading: null, headingUnstable: false, manualExploreUntil: 0, wrongWaySince: null, userMarker: null, visualHeading: null, routeUndo: [], previewRun: 0, liveJourney: null, liveUnsub: null, cloud: null, sharedJourneyState: null, cycleLayerOn: false, hourlyWeather: [], adventureWaypoints: [], contextPressTimer: null, editingSavedId: null, accountRoutes: [], accountActivities: [], accountSyncing: false, navCamera: { lastAt: 0, lastReframeAt: 0, zoom: 16.2, pitch: 49, state: "normal", postTurnUntil: 0, lastStep: -1 }, sharedRouteLoading: false, sharedRouteLoaded: false, sharedRiderMarker: null, viewerMarker: null, sharedJourneyId: null, sharedJourneyFitted: false, viewerWatch: null };
var mobile = () => matchMedia("(max-width: 760px), (max-height: 480px) and (pointer: coarse)").matches;
var toast = (t) => {
  const e = $("#toast");
  e.textContent = t;
  e.classList.add("show");
  setTimeout(() => e.classList.remove("show"), 1900);
};
var gain = (a) => {
  let g = 0, ref = null;
  const H = 5;
  for (const v of a || []) {
    if (!Number.isFinite(v)) continue;
    if (ref === null) {
      ref = v;
      continue;
    }
    if (v > ref + H) {
      g += v - ref;
      ref = v;
    } else if (v < ref - H) ref = v;
  }
  return g;
};
var fmt = (n) => Number(n || 0).toFixed(1);
mapboxgl.accessToken = MAPBOX_TOKEN;
var map = new mapboxgl.Map({ container: "map", style: "mapbox://styles/mapbox/outdoors-v12", center: [-2.5879, 51.4545], zoom: 11, preserveDrawingBuffer: true });
map.addControl(new mapboxgl.NavigationControl(), "top-right");
var GUIDANCE_PARAMS = "banner_instructions=true&voice_instructions=true&roundabout_exits=true&voice_units=metric&language=en";
var MAP_PAGES = ["explore"];
var PAGE_ALIAS = { journey: "plan", adventure: "explore", routes: "plan", feed: "profile" };
var NAV = [["explore", "compass", "Adventure"], ["plan", "route", "Plan"], ["record", "record", "Record"], ["segments", "flag", "Segments"], ["profile", "user", "Profile"]];
$("#nav").insertAdjacentHTML("beforeend", NAV.map(([p, i, label]) => `<button class="tab${p === "record" ? " tab-record" : ""}" data-p="${p}">${icon(i, 22)}<span>${label}</span></button>`).join(""));
$("#nav").onclick = (e) => {
  const b = e.target.closest("[data-p]");
  if (b) {
    S.userNavigated = true;
    open(b.dataset.p);
  }
};
addEventListener("keydown", (e) => {
  if (!(e.key === "z" || e.key === "Z") || !(e.ctrlKey || e.metaKey) || e.shiftKey) return;
  const el = document.activeElement;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
  if (!S.routeUndo.length) return;
  e.preventDefault();
  undoRouteEdit();
  toast("Route edit undone");
});
$("#edit-copy").onclick = async () => {
  if (S.selected === null) return;
  await saveRouteByIndex(S.selected, { asCopy: true });
  updateEditBanner();
};
$("#edit-done").onclick = async () => {
  if (S.openSavedId && !S.editingSavedId && S.routeDirty) {
    await updateOpenSavedRoute();
    return;
  }
  if (S.editingSavedId) {
    S.editingSavedId = null;
    S.routeUndo = [];
    S.routeDirty = false;
    S.nodes.forEach((m) => m.remove());
    S.nodes = [];
    updateUndoButton();
    updateEditBanner();
    toast("Finished editing \xB7 your changes are saved");
    return;
  }
  if (S.selected === null) return;
  await saveRouteByIndex(S.selected);
};
var sheet = createBottomSheet(panel, { mobile });
function setSheetState(state4) {
  if (mobile()) sheet.setState(state4);
}
function stop3DPreview() {
  S.previewRun++;
  map.stop();
  document.body.classList.remove("route-previewing");
}
function open(p) {
  stop3DPreview();
  if (p === "routes") S.planView = "library";
  if (p === "journey") S.planView = "planner";
  if (p === "feed") S.profileView = "feed";
  p = PAGE_ALIAS[p] || p;
  if (p !== "explore") hideRouteLoading();
  if (p !== S.page) S.routeDetailOpen = false;
  S.page = p;
  if (MAP_PAGES.includes(p)) S.lastMapPage = p;
  const isMapPage = MAP_PAGES.includes(p);
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.p === p || b.dataset.p === "profile" && p === "weather"));
  document.body.classList.toggle("panel-open", !isMapPage || !mobile());
  document.body.classList.toggle("map-view", isMapPage);
  document.body.classList.toggle("route-detail", !!S.routeDetailOpen && isMapPage);
  document.body.classList.toggle("navigating", !!S.navState && isMapPage);
  const guidance = $("#nav-guidance");
  if (guidance) guidance.hidden = !(S.navState && isMapPage);
  render7();
  panel.scrollTop = 0;
  requestAnimationFrame(() => panel.scrollTop = 0);
  if (mobile()) {
    if (S.navState && isMapPage) sheet.setState("closed");
    else if (isMapPage) sheet.setState(S.routeDetailOpen ? "full" : "half");
    else sheet.setState(p === "plan" ? "half" : "full");
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
var PAGES = { explore: () => render(), plan: () => render2(), record: () => render3(), segments: () => render4(), profile: () => render5(), weather: () => weather() };
var renderCoalesceKey = "";
function isCurrentPage(key) {
  return S.page === key || key === "explore" && MAP_PAGES.includes(S.page);
}
function render7(force = false) {
  const key = `${S.page}:${S.routeDetailOpen ? "detail" : "main"}`;
  if (!force && renderCoalesceKey === key) return;
  renderCoalesceKey = key;
  requestAnimationFrame(() => {
    renderCoalesceKey = "";
  });
  const fn = S.routeDetailOpen && MAP_PAGES.includes(S.page) ? () => render6() : PAGES[S.page] || PAGES.explore;
  try {
    const out = fn();
    if (out && typeof out.catch === "function") out.catch((err) => console.error("Page render failed", err));
  } catch (err) {
    console.error("Page render failed", err);
  }
  bind();
  updateQuickNav();
}
function refreshPage(full) {
  if (!full && S.page === "plan" && document.querySelector("#planResults") && refreshResults && refreshResults()) return;
  render7(!!full);
}
function addPointToPointWaypoint() {
  S.waypoints.splice(S.waypoints.length - 1, 0, null);
  S.names.splice(S.names.length - 1, 0, "");
  refreshPage(true);
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
    refreshPage(true);
    if (S.mode !== "loop" && S.waypoints.length > 1 && S.waypoints.every(Boolean)) pointRoutes(false);
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
    const g = new MapboxGeocoder({ accessToken: MAPBOX_TOKEN, mapboxgl, marker: false, proximity: geocoderProximity(), placeholder: "Search waypoint" });
    g.addTo(`#gaw${i}`);
    if (w.name) g.setInput(w.name);
    g.on("result", (e) => {
      w.coord = e.result.center;
      w.name = e.result.place_name;
      markers2();
      scheduleAdventureRebuild();
    });
  });
  host.querySelectorAll("[data-remove-aw]").forEach((b) => b.onclick = () => {
    S.adventureWaypoints.splice(+b.dataset.removeAw, 1);
    adventure();
    scheduleAdventureRebuild();
  });
}
function geocoderProximity() {
  const p = S.pos || map?.getCenter?.() && [map.getCenter().lng, map.getCenter().lat];
  return Array.isArray(p) ? { longitude: p[0], latitude: p[1] } : void 0;
}
function geo(id, i, loop = false) {
  const host = $(id), g = new MapboxGeocoder({ accessToken: MAPBOX_TOKEN, mapboxgl, marker: false, proximity: geocoderProximity(), placeholder: loop ? "Adventure start location" : i ? "Finish location" : "Start location" });
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
    markers2();
    if (!loop && S.waypoints.length >= 2 && S.waypoints.every(Array.isArray)) pointRoutes(false);
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
  markers2();
  map.flyTo({ center: p, zoom: 14 });
  toast(loop ? `Adventure starts and finishes at ${name}` : `${i === 0 ? "Start" : i === S.waypoints.length - 1 ? "Finish" : `Stop ${stopLetter(i)}`} set to ${name}`);
  if (!loop && S.waypoints.length >= 2 && S.waypoints.every(Array.isArray)) pointRoutes(false);
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
    const area = fallback.features?.[0];
    if (area) return area.text || area.place_name;
    return coordinateLabel(p);
  } catch (e) {
    console.warn("Address lookup failed", e);
    return coordinateLabel(p);
  }
}
function coordinateLabel(p) {
  return Array.isArray(p) ? `${(+p[1]).toFixed(4)}, ${(+p[0]).toFixed(4)}` : "Unnamed place";
}
var PLACEHOLDER_NAMES = /^(current location|dropped pin|start|finish|finding address.*|route edit|)$/i;
function isPlaceholderName(name) {
  return PLACEHOLDER_NAMES.test(String(name || "").trim());
}
async function pointRoutes(append) {
  if (!append) S.editingSavedId = null;
  showRouteLoading("Finding cycle-friendly routes\u2026");
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
function showRouteLoading(message = "Calculating route\u2026") {
  if (!isActive()) start(message);
  else detail(message);
}
function routeStep(id, detail2) {
  step(id, detail2);
}
function hideRouteLoading() {
  finish();
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
function adventureCacheKey(start2, required, minKm, maxKm) {
  return JSON.stringify([start2, ...required, minKm, maxKm].map((x) => Array.isArray(x) ? x.map((v) => +v.toFixed(4)) : x));
}
function getCachedAdventureRoutes(key) {
  const item = adventureRouteCache.get(key);
  return item && Date.now() - item.time < 6e5 ? structuredClone(item.routes) : null;
}
function setCachedAdventureRoutes(key, routes2) {
  adventureRouteCache.set(key, { time: Date.now(), routes: structuredClone(routes2) });
}
function validateAdventureLoop(route, start2) {
  const coords = route?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 3) return { valid: false, gapKm: Infinity };
  const startGap = turf.distance(coords[0], start2), endGap = turf.distance(coords.at(-1), start2), closureGap = turf.distance(coords[0], coords.at(-1)), valid = startGap <= 0.18 && endGap <= 0.18 && closureGap <= 0.18;
  return { valid, startGap, endGap, closureGap, gapKm: Math.max(startGap, endGap, closureGap) };
}
function closeAdventureGeometry(route, start2) {
  const coords = route?.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length > 1 && turf.distance(coords[0], start2) <= 0.18 && turf.distance(coords.at(-1), start2) <= 0.18) {
    coords[0] = start2;
    coords[coords.length - 1] = start2;
  }
  return route;
}
function makeLineWalker(coords) {
  const n = coords.length, cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + turf.distance(coords[i - 1], coords[i]);
  const total = n ? cum[n - 1] : 0;
  return {
    total,
    at(d) {
      if (n === 0) return null;
      if (d >= total) return coords[n - 1];
      if (d <= 0) return coords[0];
      let lo = 0, hi = n - 1;
      while (lo < hi) {
        const mid = lo + hi >> 1;
        if (cum[mid] >= d) hi = mid;
        else lo = mid + 1;
      }
      const i = lo, overshot = d - cum[i];
      if (!overshot) return coords[i];
      const direction = turf.bearing(coords[i], coords[i - 1]) - 180;
      return turf.destination(coords[i], overshot, direction).geometry.coordinates;
    }
  };
}
function corridorLoopQuality(route) {
  const g = route?.geometry?.coordinates;
  if (g && route._corridorFor === g) return route._corridor;
  const result = corridorLoopQualityCompute(route);
  if (g) {
    route._corridorFor = g;
    route._corridor = result;
  }
  return result;
}
function corridorLoopQualityCompute(route) {
  const coords = route?.geometry?.coordinates || [];
  if (coords.length < 4) return { valid: false, retrace: 1, parallelKm: 0, narrow: false };
  const line2 = turf.lineString(coords), walk = makeLineWalker(coords), length = Math.max(0.1, walk.total), spacing = Math.max(0.16, length / 150), samples = [];
  for (let d = 0; d <= length; d += spacing) {
    const point = walk.at(d), next = walk.at(Math.min(length, d + Math.max(0.06, spacing * 0.45)));
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
async function fetchLoopRoutes(plan, timeoutMs, required = []) {
  let points = plan.points;
  const attempts = [];
  const isRequired = (p) => (required || []).some((q) => {
    try {
      return turf.distance(p, q, { units: "meters" }) < 30;
    } catch {
      return false;
    }
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const route = (await fastDirections(points, timeoutMs, false).catch(() => []))[0];
    if (!route) break;
    route.backtrack = measureRetrace(route.geometry?.coordinates);
    route._requestPoints = points;
    attempts.push(route);
    if (isCleanLoop(route.backtrack)) break;
    const culprits = /* @__PURE__ */ new Set();
    for (const span of route.backtrack.spans) {
      if (!span.detour || span.lengthM <= MAX_DETOUR_M) continue;
      let pick = -1, nearest = 350;
      points.forEach((p, k) => {
        if (k === 0 || k === points.length - 1 || isRequired(p)) return;
        const m = turf.distance(p, span.apex, { units: "meters" });
        if (m < nearest) {
          nearest = m;
          pick = k;
        }
      });
      if (pick >= 0) culprits.add(pick);
    }
    if (!culprits.size) break;
    const next = points.filter((_, k) => !culprits.has(k));
    if (next.length < 3) break;
    points = next;
  }
  return attempts.sort((a, b) => a.backtrack.longestDetourM - b.backtrack.longestDetourM || a.backtrack.sharedRatio - b.backtrack.sharedRatio);
}
function loopMeasure(route) {
  route.backtrack = route.backtrack || measureRetrace(route.geometry?.coordinates);
  return route.backtrack;
}
function cleanLoopCount(list) {
  return (list || []).filter((r) => isCleanLoop(loopMeasure(r))).length;
}
function preferCleanLoops(list) {
  const all = list || [];
  const clean = all.filter((r) => isCleanLoop(loopMeasure(r)));
  const rest = all.filter((r) => !isCleanLoop(loopMeasure(r))).sort((a, b) => a.backtrack.longestDetourM - b.backtrack.longestDetourM || a.backtrack.sharedRatio - b.backtrack.sharedRatio);
  return [...clean, ...rest];
}
function quickAdventureAcceptance(route, start2, requiredCount = 0) {
  if (!validateAdventureLoop(route, start2).valid || hasMotorway(route)) return { valid: false };
  const backtrack = route.backtrack || measureRetrace(route.geometry?.coordinates);
  route.backtrack = backtrack;
  route.cleanLoop = isCleanLoop(backtrack);
  const q = quickAdventureQuality(route.geometry.coordinates, Math.max(0.1, (route.distance || 0) / 1e3)), corridor = corridorLoopQuality(route), maxRetrace = requiredCount ? 0.34 : 0.21, maxDeadEnd = requiredCount ? 1.2 : 0.8;
  return { ...q, retrace: Math.min(q.retrace, corridor.retrace), parallelDistinctKm: corridor.parallelKm, narrowLoop: corridor.narrow, valid: requiredCount > 0 || corridor.valid && q.deadEndKm <= maxDeadEnd };
}
var ADVENTURE_CORRIDOR_QUERIES = { balanced: ["park", "nature reserve", "historic place", "cycle path"], scenic: ["river", "lake", "seaside", "viewpoint", "castle", "garden"], established: ["greenway", "cycle trail", "canal", "railway path", "national cycle route"] };
async function forceOneMoreAdventureRoute(start2, required, minKm, maxKm, effectiveMax, minimumReturn, token) {
  const attempts = [];
  for (let i = 0; i < 8; i++) {
    const seed = S.routes.length * 11 + i, target = minKm + (maxKm - minKm) * (0.22 + i % 6 * 0.13), bearing = (23 + seed * 137.508) % 360, count = 3 + i % 3, radius = Math.max(1.1, target / (2 * Math.PI) * (0.56 + i % 4 * 0.08)), ring = [...required];
    for (let n = 0; n < count; n++) ring.push(turf.destination(start2, radius, bearing + n * 360 / count).geometry.coordinates);
    attempts.push({ profile: i % 3 === 0 ? "balanced" : i % 3 === 1 ? "scenic" : "established", target, points: [start2, ...ring, start2], places: [], forceFallback: true });
  }
  for (const plan of attempts) {
    if (token !== adventureBuildToken) return null;
    const routes2 = await fetchLoopRoutes(plan, 5600, required).catch(() => []);
    for (const raw of routes2) {
      if (!validateAdventureLoop(raw, start2).valid || hasMotorway(raw)) continue;
      const route = closeAdventureGeometry(raw, start2), quick = quickAdventureQuality(route.geometry.coordinates, Math.max(0.1, (route.distance || 0) / 1e3)), candidate = scoreAdventureCandidateFast(route, plan.target, minKm, Math.max(effectiveMax, maxKm * 1.35), minimumReturn, { waypointEfficient: required.length > 0 }, quick);
      if (!candidate?.route) continue;
      route._requestPoints = route._requestPoints || plan.points;
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
async function adventureWaypointRoutes({ token, start: start2, required, minKm, maxKm, effectiveMax, minimumReturn, cacheKey: cacheKey2, append }) {
  showRouteLoading("Calculating the shortest waypoint return\u2026", false);
  const directPoints = [start2, ...required, start2], directRoutes = await fastDirections(directPoints, 6500, true).catch(() => []);
  if (token !== adventureBuildToken) return;
  let candidates = collectWaypointCandidates(directRoutes, directPoints, start2, required, minKm, maxKm, effectiveMax, minimumReturn, "Efficient waypoint return");
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
    const variations = buildWaypointVariationPlans(start2, required, baselineKm), results = await Promise.all(variations.map((plan) => fetchLoopRoutes(plan, 6500, required).then((routes3) => ({ plan, routes: routes3 })).catch(() => ({ plan, routes: [] }))));
    if (token !== adventureBuildToken) return;
    for (const { plan, routes: routes3 } of results) {
      for (const route of collectWaypointCandidates(routes3, plan.points, start2, required, minKm, maxKm, effectiveMax, minimumReturn, plan.label)) {
        const km = (route.distance || 0) / 1e3;
        route.waypointBaselineKm = baselineKm;
        route.waypointExcessKm = Math.max(0, km - baselineKm);
        if (km <= Math.max(maxKm * 1.06, baselineKm * 1.16) && !candidates.some((existing) => routeOverlapRatio(existing, route) > 0.82)) candidates.push(route);
      }
    }
  }
  if (append) {
    const variations = buildWaypointVariationPlans(start2, required, baselineKm, S.routes.length), results = await Promise.all(variations.map((plan) => fetchLoopRoutes(plan, 6200, required).catch(() => [])));
    for (let i = 0; i < results.length; i++) for (const route of collectWaypointCandidates(results[i], variations[i].points, start2, required, minKm, maxKm, effectiveMax, minimumReturn, variations[i].label)) {
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
function collectWaypointCandidates(routes2, points, start2, required, minKm, maxKm, effectiveMax, minimumReturn, label) {
  const out = [];
  for (const raw of routes2.slice(0, 3)) {
    if (!validateAdventureLoop(raw, start2).valid || hasMotorway(raw)) continue;
    const route = closeAdventureGeometry(raw, start2), quick = quickAdventureQuality(route.geometry.coordinates, Math.max(0.1, (route.distance || 0) / 1e3)), candidate = scoreAdventureCandidateFast(route, Math.max(minKm, minimumReturn), minKm, effectiveMax, minimumReturn, { waypointEfficient: true }, quick);
    if (!candidate?.route) continue;
    route._requestPoints = structuredClone(points);
    route.requiredNavigationWaypoints = structuredClone([...required, start2]);
    route.requiredWaypointNames = structuredClone([...required.map((_, index) => S.adventureWaypoints[index]?.name || `Waypoint ${index + 1}`), S.names[0] || "Start"]);
    route.waypointEfficient = true;
    route.qualityLabel = label;
    route.rangeStatus = (route.distance || 0) / 1e3 <= maxKm ? "Within selected range" : `${Math.max(0, (route.distance || 0) / 1e3 - maxKm).toFixed(1)} km over maximum`;
    out.push(route);
  }
  return out;
}
function buildWaypointVariationPlans(start2, required, baselineKm, seed = 0) {
  const far = required.at(-1), bearing = turf.bearing(start2, far), mid = turf.midpoint(start2, far).geometry.coordinates, offset = Math.max(0.35, Math.min(2.2, baselineKm * (0.012 + seed * 1e-3))), left = turf.destination(mid, offset, bearing - 90 - seed * 7).geometry.coordinates, right = turf.destination(mid, offset, bearing + 90 + seed * 7).geometry.coordinates;
  return [{ label: "Distinct return west side", points: [start2, left, ...required, right, start2] }, { label: "Distinct return east side", points: [start2, right, ...required, left, start2] }, { label: "Direct reverse variation", points: [start2, ...required.slice().reverse(), start2] }];
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
  const start2 = S.waypoints[0] || await current();
  if (!start2) {
    hideRouteLoading();
    return;
  }
  if (ridePrefs().beforeSunset) await refreshDaylightLimit();
  const { minKm, maxKm } = adventureRangeKm(), required = S.adventureWaypoints.map((x) => x.coord).filter(Boolean), minimumReturn = required.length ? required.reduce((sum, p, i) => sum + turf.distance(i ? required[i - 1] : start2, p), 0) + turf.distance(required.at(-1), start2) : 0, effectiveMax = Math.max(maxKm, minimumReturn * 1.04), cacheKey2 = adventureCacheKey(start2, required, minKm, maxKm) + (append ? `:more:${S.routes.length}` : "");
  if (!append) {
    const cached = getCachedAdventureRoutes(cacheKey2);
    if (cached?.length >= 3 && cached.every((r) => quickAdventureAcceptance(r, start2, required.length).valid) && routesAreDistinctStrict(cached.slice(0, 3))) {
      publishAdventureRoutes(cached.slice(0, 3), false);
      hideRouteLoading();
      toast("3 distinct routes ready");
      enrichAdventureCards(cached.slice(0, 3), token);
      return;
    }
  }
  if (required.length) {
    await adventureWaypointRoutes({ token, start: start2, required, minKm, maxKm, effectiveMax, minimumReturn, cacheKey: cacheKey2, append });
    return;
  }
  const profiles = append ? [["balanced", "scenic", "established"][(S.routes.length + 1) % 3]] : ["balanced", "scenic", "established"], destinations = await discoverCorridorDestinations(start2, maxKm, profiles, 1900).catch(() => []);
  if (token !== adventureBuildToken) {
    hideRouteLoading();
    return;
  }
  routeStep("connect");
  const plans = profiles.map((profile, i) => buildCorridorLoopPlan(start2, required, destinations, minKm, maxKm, profile, i + S.routes.length));
  showRouteLoading(append ? "Connecting one full route\u2026" : "Connecting 3 destination-led loops\u2026", false);
  const results = await Promise.all(plans.map((plan) => fetchLoopRoutes(plan, 6500, required).then((routes3) => ({ plan, routes: routes3 })).catch(() => ({ plan, routes: [] }))));
  if (token !== adventureBuildToken) {
    hideRouteLoading();
    return;
  }
  let candidates = rankDistinctAdventureCandidates(results, start2, required, minKm, maxKm, effectiveMax, minimumReturn);
  if (!append && cleanLoopCount(candidates) < 3) {
    showRouteLoading(`${cleanLoopCount(candidates) || "No"} clean loop${cleanLoopCount(candidates) === 1 ? "" : "s"} yet \xB7 searching different directions\u2026`, true);
    const retryPlans = [...profiles.map((profile, i) => buildCorridorLoopPlan(start2, required, destinations, minKm, maxKm, profile, i + profiles.length + S.routes.length, true)), ...buildNarrowCorridorPlans(start2, required, minKm, maxKm, S.routes.length)], retryResults = await Promise.all(retryPlans.map((plan) => fetchLoopRoutes(plan, 6500, required).then((routes3) => ({ plan, routes: routes3 })).catch(() => ({ plan, routes: [] }))));
    candidates = mergeDistinctAdventureCandidates(candidates, rankDistinctAdventureCandidates(retryResults, start2, required, minKm, maxKm, effectiveMax, minimumReturn));
  }
  if (token !== adventureBuildToken) {
    hideRouteLoading();
    return;
  }
  if (!append && cleanLoopCount(candidates) < 3 && !required.length) {
    showRouteLoading(`${cleanLoopCount(candidates)} clean loop${cleanLoopCount(candidates) === 1 ? "" : "s"} \xB7 trying rounder loops\u2026`, true);
    const roundResults = await Promise.all(buildRoundLoopPlans(start2, minKm, maxKm, S.routes.length + 1).map((plan) => fetchLoopRoutes(plan, 6500, required).then((routes3) => ({ plan, routes: routes3 })).catch(() => ({ plan, routes: [] }))));
    if (token !== adventureBuildToken) {
      hideRouteLoading();
      return;
    }
    candidates = mergeDistinctAdventureCandidates(candidates, rankDistinctAdventureCandidates(roundResults, start2, required, minKm, maxKm, effectiveMax, minimumReturn));
  }
  if (!append && candidates.length < 3) {
    showRouteLoading(`${candidates.length} route${candidates.length === 1 ? "" : "s"} \xB7 filling remaining options\u2026`, true);
    const availability = await collectAvailabilityFallbacks(buildAvailabilityFallbackPlans(start2, required, minKm, maxKm, S.routes.length), start2, required, minKm, maxKm, effectiveMax, minimumReturn, candidates, token);
    candidates = [...candidates, ...availability];
  }
  if (token !== adventureBuildToken) {
    hideRouteLoading();
    return;
  }
  if (append && !candidates.length) {
    showRouteLoading("Quality filters found nothing \xB7 forcing one more route\u2026", false);
    const forced = await forceOneMoreAdventureRoute(start2, required, minKm, maxKm, effectiveMax, minimumReturn, token);
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
  candidates = preferCleanLoops(candidates);
  const routes2 = append ? [...S.routes, candidates[0]] : candidates.slice(0, 3);
  setCachedAdventureRoutes(cacheKey2, routes2);
  publishAdventureRoutes(routes2, false);
  hideRouteLoading();
  toast(routes2.length >= 3 ? "3 distinct destination-led routes ready" : `${routes2.length} genuinely distinct route${routes2.length === 1 ? "" : "s"} found`);
  routes2.forEach((route) => enrichAdventureCards([route], token));
}
async function discoverCorridorDestinations(start2, maxKm, profiles, budgetMs = 1900) {
  const queries = [...new Set(profiles.flatMap((profile) => ADVENTURE_CORRIDOR_QUERIES[profile] || []))], radiusKm = Math.max(3, Math.min(28, maxKm / 4)), controller = new AbortController(), timer2 = setTimeout(() => controller.abort(), budgetMs), jobs = queries.map((query) => fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${start2.join(",")}&types=poi,place&limit=6&access_token=${MAPBOX_TOKEN}`, { signal: controller.signal }).then((r) => r.ok ? r.json() : { features: [] }).catch(() => ({ features: [] })));
  try {
    const results = await Promise.all(jobs), seen = /* @__PURE__ */ new Set(), items = [];
    for (let q = 0; q < results.length; q++) for (const feature of results[q].features || []) {
      const coord = feature.center;
      if (!coord?.every(Number.isFinite)) continue;
      const distance = turf.distance(start2, coord);
      if (distance < 1.5 || distance > radiusKm) continue;
      const key = coord.map((v) => v.toFixed(4)).join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ coord, name: feature.text || feature.place_name?.split(",")[0] || queries[q], category: `${queries[q]} ${feature.properties?.category || ""}`.toLowerCase(), distance, bearing: (turf.bearing(start2, coord) + 360) % 360, score: corridorDestinationScore(feature, queries[q]) });
    }
    try {
      const bboxDeg = radiusKm / 111, overpassData = await fetchOverpassArea([start2[0] - bboxDeg, start2[1] - bboxDeg, start2[0] + bboxDeg, start2[1] + bboxDeg], 0);
      if (overpassData) {
        for (const poi of poisFromOverpass(overpassData, start2, turf, radiusKm)) {
          const key = poi.coord.map((v) => v.toFixed(4)).join(",");
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(poi);
        }
        for (const anchor of cyclewayAnchors(overpassData, start2, radiusKm, turf)) {
          const key = anchor.coord.map((v) => v.toFixed(4)).join(",");
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(anchor);
        }
      }
    } catch (error) {
      console.warn("Overpass corridor POIs unavailable; using Mapbox search only", error);
    }
    return items.sort((a, b) => b.score - a.score);
  } finally {
    clearTimeout(timer2);
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
function buildCorridorLoopPlan(start2, required, destinations, minKm, maxKm, profile, index, retry = false) {
  const target = minKm + (maxKm - minKm) * ({ balanced: 0.42, scenic: 0.52, established: 0.46 }[profile] || 0.42), base = (22 + index * 119 + (retry ? 61 : 0)) % 360, count = Math.max(2, 4 - required.length), queries = ADVENTURE_CORRIDOR_QUERIES[profile] || [], chosen = [];
  for (let slot = 0; slot < count; slot++) {
    const ideal = (base + slot * 360 / count) % 360, candidate = destinations.filter((p) => !chosen.includes(p) && !required.some((r) => turf.distance(r, p.coord) < 0.4)).map((p) => {
      const angular = Math.abs((p.bearing - ideal + 540) % 360 - 180), match = queries.some((q) => p.category.includes(q)) ? 18 : 0, spacing = chosen.reduce((penalty, x) => penalty + Math.max(0, 55 - Math.abs((p.bearing - x.bearing + 540) % 360 - 180)), 0), idealRadius = target / (2 * Math.PI);
      return { p, value: p.score + match - angular * 0.18 - spacing * 0.45 - Math.abs(p.distance - idealRadius) * 0.9 };
    }).sort((a, b) => b.value - a.value)[0];
    if (candidate) chosen.push(candidate.p);
  }
  let ring = [...required, ...chosen.map((p) => p.coord)].sort((a, b) => (turf.bearing(start2, a) + 360) % 360 - (turf.bearing(start2, b) + 360) % 360);
  while (ring.length < 4) {
    const radius = Math.max(1.5, target / (2 * Math.PI) * 0.78), angle = base + ring.length * 90;
    ring.push(turf.destination(start2, radius, angle).geometry.coordinates);
  }
  return { profile, target, points: [start2, ...ring, start2], places: chosen };
}
function buildRoundLoopPlans(start2, minKm, maxKm, seed = 0) {
  const plans = [], count = 6, anchors = 5;
  for (let k = 0; k < count; k++) {
    const target = minKm + (maxKm - minKm) * (0.32 + 0.18 * (k % 3));
    const radius = Math.max(0.8, target / (2 * Math.PI * 1.3));
    const heading = (seed * 47 + k * (360 / count) + 17) % 360;
    const centre = turf.destination(start2, radius, heading).geometry.coordinates;
    const home = (heading + 180) % 360;
    const ring = [];
    for (let a = 1; a <= anchors; a++) ring.push(turf.destination(centre, radius, home + a * (360 / (anchors + 1))).geometry.coordinates);
    plans.push({ profile: ["balanced", "scenic", "established"][k % 3], target, points: [start2, ...ring, start2], places: [] });
  }
  return plans;
}
function buildNarrowCorridorPlans(start2, required, minKm, maxKm, seed = 0) {
  return [0, 90, 180, 270].map((bearing, i) => {
    const target = minKm + (maxKm - minKm) * (0.34 + i * 0.14), outward = Math.max(2, target * 0.2), side = Math.max(0.7, Math.min(2.8, target * 0.038)), far = turf.destination(start2, outward, bearing + seed * 31).geometry.coordinates, left = turf.destination(far, side, bearing - 90).geometry.coordinates, right = turf.destination(far, side, bearing + 90).geometry.coordinates, nearLeft = turf.destination(start2, side, bearing - 90).geometry.coordinates, nearRight = turf.destination(start2, side, bearing + 90).geometry.coordinates;
    return { profile: i % 2 ? "scenic" : "established", target, points: [start2, ...required, nearLeft, left, far, right, nearRight, start2], places: [], corridorPlan: true };
  });
}
function buildAvailabilityFallbackPlans(start2, required, minKm, maxKm, seed = 0) {
  const plans = [], fractions = [0.28, 0.38, 0.48, 0.58, 0.68, 0.78], counts = [3, 4, 5, 3, 4, 5];
  for (let i = 0; i < fractions.length; i++) {
    const target = minKm + (maxKm - minKm) * fractions[i], bearing = (15 + seed * 71 + i * 57) % 360, radius = Math.max(1.2, target / (2 * Math.PI) * (0.6 + i % 3 * 0.08)), ring = [...required];
    for (let n = 0; n < counts[i]; n++) ring.push(turf.destination(start2, radius, bearing + n * 360 / counts[i]).geometry.coordinates);
    plans.push({ profile: i % 3 === 0 ? "balanced" : i % 3 === 1 ? "scenic" : "established", target, points: [start2, ...ring, start2], places: [], availabilityFallback: true });
  }
  return plans;
}
function relaxedAvailabilityAcceptance(route, start2, requiredCount = 0) {
  if (!validateAdventureLoop(route, start2).valid || hasMotorway(route)) return { valid: false };
  const q = quickAdventureQuality(route.geometry.coordinates, Math.max(0.1, (route.distance || 0) / 1e3)), corridor = corridorLoopQuality(route), valid = requiredCount > 0 || corridor.retrace <= 0.27 && corridor.longestSameKm <= 1.05 && q.deadEndKm <= 1;
  return { ...q, retrace: Math.min(q.retrace, corridor.retrace), parallelDistinctKm: corridor.parallelKm, narrowLoop: corridor.narrow, valid };
}
async function collectAvailabilityFallbacks(plans, start2, required, minKm, maxKm, effectiveMax, minimumReturn, existing, token) {
  const results = await Promise.all(plans.map((plan) => fetchLoopRoutes(plan, 6200, required).then((routes2) => ({ plan, routes: routes2 })).catch(() => ({ plan, routes: [] })))), out = [];
  if (token !== adventureBuildToken)
    out.sort((a, b) => (a.backtrack?.longestDetourM || 0) - (b.backtrack?.longestDetourM || 0) || (a.backtrack?.sharedRatio || 0) - (b.backtrack?.sharedRatio || 0));
  return out;
  for (const { plan, routes: routes2 } of results) {
    for (const raw of routes2.slice(0, 2)) {
      const quick = relaxedAvailabilityAcceptance(raw, start2, required.length);
      if (!quick.valid) continue;
      const route = closeAdventureGeometry(raw, start2), candidate = scoreAdventureCandidateFast(route, plan.target, minKm, effectiveMax, minimumReturn, { waypointEfficient: required.length > 0 }, quick);
      if (!candidate?.route) continue;
      route._requestPoints = route._requestPoints || plan.points;
      route.adventureProfile = plan.profile;
      route.adventureCompromise = "Best available";
      route.backtrack = route.backtrack || measureRetrace(route.geometry?.coordinates);
      route.qualityLabel = `${route.narrowLoop ? "Corridor loop \xB7 " : ""}Best available \xB7 ${adventureProfileTitle(plan.profile)}`;
      route.rangeStatus = (route.distance || 0) / 1e3 <= maxKm ? "Within selected range" : `${Math.max(0, (route.distance || 0) / 1e3 - maxKm).toFixed(1)} km over maximum`;
      if (![...existing, ...out].some((current2) => routeOverlapRatio(current2, route) > 0.78)) out.push(route);
    }
  }
  return out;
}
function rankDistinctAdventureCandidates(results, start2, required, minKm, maxKm, effectiveMax, minimumReturn) {
  let out = [];
  for (const { plan, routes: routes2 } of results) {
    for (const route of collectAdventureCandidatesQuick(plan, routes2, start2, required, minKm, maxKm, effectiveMax, minimumReturn)) {
      route.adventurePlaces = plan.places;
      route.adventureProfile = plan.profile;
      if (route.backtrack) route.retrace = route.backtrack.ratio;
      route.qualityLabel = `${route.narrowLoop ? "Corridor loop \xB7 " : ""}${adventureProfileTitle(plan.profile)} route${plan.places.length ? ` \xB7 ${plan.places.slice(0, 2).map((p) => p.name).join(" + ")}` : ""}`;
      route.routeInterestScore = plan.places.reduce((n, p) => n + p.score, 0);
      route.anonymousSpur = hasAnonymousSpur(route, plan.places, required);
      if (!out.some((existing) => routeOverlapRatio(existing, route) > 0.55)) out.push(route);
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
  const coords = route.geometry.coordinates, line2 = turf.lineString(coords), length = turf.length(line2), placesNear = places.some((place) => {
    const d = turf.nearestPointOnLine(line2, turf.point(place.coord)).properties.dist;
    return Number.isFinite(d) && d < 0.3;
  });
  return (route.deadEndKm || 0) > 0.45 && !placesNear;
}
function adventureProfileTitle(profile) {
  return profile === "established" ? "Established path" : profile[0].toUpperCase() + profile.slice(1);
}
function collectAdventureCandidatesQuick(plan, routes2, start2, required, minKm, maxKm, effectiveMax, minimumReturn) {
  const out = [];
  for (const raw of routes2.slice(0, 3)) {
    const quick = quickAdventureAcceptance(raw, start2, required.length);
    if (!quick.valid) continue;
    const route = closeAdventureGeometry(raw, start2), candidate = scoreAdventureCandidateFast(route, plan.target, minKm, effectiveMax, minimumReturn, { waypointEfficient: required.length > 0 }, quick);
    if (!candidate?.route) continue;
    route._requestPoints = route._requestPoints || plan.points;
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
  const controller = new AbortController(), timer2 = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const coordinates = points.map((point) => point.join(",")).join(";"), url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${coordinates}?alternatives=${alternatives}&geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`, response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`Directions ${response.status}`);
    const data = await response.json();
    return data.routes || [];
  } finally {
    clearTimeout(timer2);
  }
}
function routeHasGuidance(route) {
  return !!route?.legs?.some((leg) => leg.steps?.some((step2) => step2.voiceInstructions?.length));
}
async function hydrateRouteInstructions(route, points) {
  if (!route || routeHasGuidance(route)) return;
  if (!Array.isArray(points) || points.length < 2) return;
  try {
    const details = (await directions(points, false))[0];
    if (details && (!route.distance || Math.abs((details.distance || 0) - route.distance) <= route.distance * 0.05)) {
      route.legs = details.legs || [];
      route.duration = details.duration || route.duration;
      route.distance = details.distance || route.distance;
      route.geometry = details.geometry || route.geometry;
    }
  } catch (error) {
    console.warn("Could not load turn instructions", error);
  } finally {
    cards();
  }
}
function routeSafetyAndDirectness(route) {
  const steps = route?.legs?.flatMap((leg) => leg.steps || []) || [];
  let motorwayDistance = 0, cycleDistance = 0, directionChanges = 0, crossings = 0, lastTurn = "";
  for (const step2 of steps) {
    const name = `${step2.name || ""}`.trim().toLowerCase(), ref = `${step2.ref || ""}`.trim().toLowerCase(), roadClass = `${step2.metadata?.class || step2.class || ""}`.toLowerCase(), distance = Number(step2.distance) || 0, isMotorway = roadClass === "motorway" || roadClass === "motorway_link" || /\bmotorway(?:[_ -]?link)?\b/.test(name) || /^m\d{1,3}(?:\s|$)/.test(ref);
    if (isMotorway) motorwayDistance += distance;
    const description = `${name} ${ref} ${step2.maneuver?.instruction || ""}`.toLowerCase();
    if (/cycleway|cycle lane|ncn|greenway|shared path|towpath/.test(description)) cycleDistance += distance;
    if (/cross|roundabout|traffic signal/.test(description)) crossings++;
    const turn = step2.maneuver?.modifier || "";
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
  applyRidePreferences(routes2);
  routes2.forEach((r) => {
    r.cycleScorePending = true;
    refineCycleScoreWithOverpass(r);
  });
  S.routes = append ? [...S.routes, ...routes2] : routes2;
  S.routes = append ? S.routes : S.routes.sort((a, b) => {
    const ca = isCleanLoop(loopMeasure(a)), cb = isCleanLoop(loopMeasure(b));
    if (ca !== cb) return cb ? 1 : -1;
    if (!ca) return a.backtrack.longestDetourM - b.backtrack.longestDetourM || (b.loopQuality || 0) - (a.loopQuality || 0);
    return (b.loopQuality || 0) - (a.loopQuality || 0);
  });
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
var quickQualityMemo = /* @__PURE__ */ new WeakMap();
function quickAdventureQuality(coords, targetKm) {
  if (coords && typeof coords === "object") {
    const hit = quickQualityMemo.get(coords);
    if (hit && hit.targetKm === targetKm) return hit.result;
  }
  const result = quickAdventureQualityCompute(coords, targetKm);
  if (coords && typeof coords === "object") quickQualityMemo.set(coords, { targetKm, result });
  return result;
}
function quickAdventureQualityCompute(coords, targetKm) {
  if (!coords?.length) return { closed: false, retrace: 1, overlapKm: Infinity, compactness: 0, deadEndKm: Infinity, score: -999 };
  const line2 = turf.lineString(coords), walk = makeLineWalker(coords), length = walk.total, closed = turf.distance(coords[0], coords.at(-1)) < 0.15, bbox = turf.bbox(line2), diag = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[3]]), compactness = Math.min(1, diag / Math.max(1, length) * 2.2), step2 = Math.max(0.18, length / 180), seen = /* @__PURE__ */ new Map();
  let repeated = 0, maxRun = 0, run = 0, index = 0;
  for (let d = 0; d <= length; d += step2, index++) {
    const p = walk.at(d), key = `${Math.round(p[0] * 900)},${Math.round(p[1] * 900)}`, previous = seen.get(key);
    if (previous !== void 0 && index - previous > 3) {
      repeated += step2;
      run += step2;
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
  const c = p.map((x) => x.join(",")).join(";"), base = `https://api.mapbox.com/directions/v5/mapbox/cycling/${c}?alternatives=${alternatives}&geometries=geojson&overview=full&steps=true&${GUIDANCE_PARAMS}&access_token=${MAPBOX_TOKEN}`;
  try {
    const withAnn = await fetch(`${base}&annotations=maxspeed`);
    if (withAnn.ok) {
      const d2 = await withAnn.json();
      if (d2.routes?.length) return d2.routes;
    }
    const res = await fetch(base), d = await res.json();
    if (!res.ok || !d.routes?.length) {
      const why = d?.message || "";
      if (/maximum distance/i.test(why)) toast("Those points are too far apart for cycling directions");
      else if (/no route|NoRoute/i.test(`${d?.code} ${why}`)) toast("No cycling route exists between those points");
      else if (why) toast(`Routing failed: ${why}`);
      return [];
    }
    return d.routes;
  } catch {
    toast("Could not reach the routing service");
    return [];
  }
}
async function accept(rs, append) {
  rs = rs.filter(Boolean);
  await Promise.all(rs.map(enrich));
  rs.forEach((r) => r.cycleScore = cycleScore(r));
  rs.sort((a, b) => b.cycleScore - a.cycleScore);
  applyRidePreferences(rs);
  S.routes = append ? [...S.routes, ...rs] : rs;
  S.selected = null;
  S.route = null;
  drawAll();
  if (S.routes.length) {
    S.selected = 0;
    S.route = S.routes[0];
    nodes();
  }
  cards();
  stars();
  updateQuickNav();
  if (!S.routeDetailOpen) refreshPage();
}
async function loadRouteElevation(r) {
  const coords = r?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return false;
  try {
    const { elev, source } = await fetchElevations(elevationSamplePoints(coords, turf), { token: MAPBOX_TOKEN });
    r.elev = elev;
    r.ascent = gain(elev);
    r.elevSource = source;
    r.elevUnavailable = false;
    r._elevFor = coords;
    return true;
  } catch (error) {
    console.warn("Route elevation unavailable", error);
    if (!(Array.isArray(r.elev) && r.elev.length >= 3)) {
      r.elev = [];
      r.ascent = null;
      r.elevUnavailable = true;
    }
    return false;
  }
}
async function enrich(r) {
  routeStep("enrich");
  prepareImmediateRouteMetrics(r);
  await loadRouteElevation(r);
  try {
    const now = Date.now(), line2 = turf.lineString(r.geometry.coordinates), total = turf.length(line2), N = 12, span = Math.max(0.05, total / 200);
    const forecastPoints = Array.from({ length: N }, (_, i) => {
      const f = N === 1 ? 0 : i / (N - 1), d = total * f;
      const here = turf.along(line2, d).geometry.coordinates;
      const back = turf.along(line2, Math.max(0, d - span)).geometry.coordinates;
      const ahead = turf.along(line2, Math.min(total, d + span)).geometry.coordinates;
      return { lat: here[1], lon: here[0], time: new Date(now + (r.duration || 3600) * 1e3 * f), heading: turf.bearing(back, ahead) };
    });
    const weather2 = await fetchRouteForecast(forecastPoints);
    const components = forecastPoints.map((p, i) => {
      const w = weather2[i];
      if (!w || !Number.isFinite(w.speed) || !Number.isFinite(w.bearing)) return null;
      const windTo = (w.bearing + 180) % 360;
      return Math.round(w.speed * 3.6 * Math.cos((windTo - p.heading) * Math.PI / 180) * 10) / 10;
    });
    r.wind = components.every(Number.isFinite) ? components : [];
    r.windSource = weather2.find(Boolean)?.source || "unavailable";
  } catch (error) {
    console.warn("Route wind unavailable", error);
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
var cycleScoreTimer = 0;
function scheduleCycleScoreRefinement(route, delayMs = 1200) {
  clearTimeout(cycleScoreTimer);
  cycleScoreTimer = setTimeout(() => refineCycleScoreWithOverpass(route), delayMs);
}
async function refineCycleScoreWithOverpass(route) {
  routeStep("score");
  const current2 = () => Array.isArray(S.routes) && S.routes.includes(route);
  try {
    const coords = route?.geometry?.coordinates;
    if (!coords?.length) return;
    const bbox = turf.bbox(turf.lineString(coords));
    const data = await fetchOverpassArea(bbox);
    if (!current2()) return;
    const result = data && await scoreRouteAgainstOverpass(coords, data, turf, { shouldContinue: current2 });
    if (!current2()) return;
    if (result) {
      route.osmCycleScore = result.score;
      route.surfaceUnpavedShare = result.unpavedShare;
    }
  } catch (error) {
    console.warn("Overpass cycle-infra scoring unavailable; keeping estimate", error);
  } finally {
    route.cycleScorePending = false;
    if (current2()) {
      applyRidePreferences(S.routes);
      cards();
      if (S.page === "explore" && !S.routeDetailOpen) refreshPage();
    }
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
var ROUTE_PREVIEW_LAYER = "route-preview";
function clearRoutePreview() {
  if (map.getLayer(ROUTE_PREVIEW_LAYER)) map.removeLayer(ROUTE_PREVIEW_LAYER);
  if (map.getSource(ROUTE_PREVIEW_LAYER)) map.removeSource(ROUTE_PREVIEW_LAYER);
  S.layers = S.layers.filter((id) => id !== ROUTE_PREVIEW_LAYER);
}
function fitMapToCoords(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return;
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const c of coords) {
    if (c[0] < minX) minX = c[0];
    if (c[0] > maxX) maxX = c[0];
    if (c[1] < minY) minY = c[1];
    if (c[1] > maxY) maxY = c[1];
  }
  const bottom = mobile() ? Math.round(innerHeight * 0.42) : 60;
  try {
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: { top: 70, left: 40, right: 40, bottom }, duration: 600 });
  } catch (error) {
    console.warn("Could not frame the route", error);
  }
}
function previewRouteOnMap(coords, { fit = true } = {}) {
  clearRoutePreview();
  if (!Array.isArray(coords) || coords.length < 2) return false;
  map.addSource(ROUTE_PREVIEW_LAYER, { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } });
  map.addLayer({ id: ROUTE_PREVIEW_LAYER, type: "line", source: ROUTE_PREVIEW_LAYER, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": colors[1] || "#2f7fd8", "line-width": 6, "line-opacity": 0.95 } });
  S.layers.push(ROUTE_PREVIEW_LAYER);
  if (fit) fitMapToCoords(coords);
  return true;
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
  x.innerHTML = S.routes.map((r, i) => `<div class="card route ${S.selected === i ? "selected" : ""}" data-i="${i}" style="--route-color:${colors[i % colors.length]};border-left:7px solid ${colors[i % colors.length]}"><div class="row"><b>${i ? "Option " + (i + 1) : "Recommended"}</b><div class="card-icon-actions">${S.editingSavedId && i === S.selected ? `<button data-update-saved="${i}" title="Update saved route">\u2713</button>` : ""}<button data-save-route="${i}" title="Save route as a copy">\u25A3</button><button data-share-route="${i}" title="Share route">\u2197</button><button data-preview-route="${i}" title="Animate route preview">\u25B6</button></div></div><span class="pill ${r.recommended === false ? "route-compromise" : ""}">${r.qualityLabel ? `${r.qualityLabel} \xB7 ` : ""}${Number.isFinite(r.cycleScore) ? r.cycleScore : 0}% cycle-route cues${r.cycleScorePending ? " \xB7 refining\u2026" : ""}${r.rangeStatus ? ` \xB7 ${r.rangeStatus}` : ""}${r.waypointEfficient ? " \xB7 repeated access accepted to minimise distance" : Number.isFinite(r.retrace) ? ` \xB7 ${Math.round((1 - r.retrace) * 100)}% non-repeated` : ""}${Number.isFinite(r.surfaceUnpavedShare) && r.surfaceUnpavedShare > 0.05 ? ` \xB7 ${Math.round(r.surfaceUnpavedShare * 100)}% unpaved` : ""}</span><div class="stats"><div class="stat"><b>${fmt(r.distance / 1e3)}</b><small>km</small></div><div class="stat"><b>${Math.round(r.duration / 60)}</b><small>min</small></div><div class="stat"><b>${Number.isFinite(r.ascent) ? Math.round(r.ascent) : r.elevUnavailable ? "\u2014" : "\u2026"}</b><small>${Number.isFinite(r.ascent) ? "climb m" : r.elevUnavailable ? "climb unknown" : "climb loading"}</small></div><div class="stat"><b>${Number.isFinite(r.osmCycleScore) ? r.osmCycleScore : Number.isFinite(r.cycleScore) ? r.cycleScore : 0}%</b><small>${Number.isFinite(r.osmCycleScore) ? "OSM cycle infra" : "cycle-route estimate"}</small></div></div><div class="profiles"><div><div class="label">Elevation (m)</div>${r.elev?.length ? `<canvas class="chart" data-e="${i}"></canvas>` : r.elevUnavailable ? '<div class="profile-pending">Elevation unavailable right now</div>' : '<div class="profile-pending"><span class="mini-spinner"></span>Loading elevation</div>'}</div><div><div class="label">Tailwind + / headwind \u2212 (km/h)</div>${r.wind?.length ? `<canvas class="chart" data-w="${i}"></canvas>` : r.windSource === "unavailable" ? '<div class="profile-pending">Wind forecast unavailable right now</div>' : '<div class="profile-pending"><span class="mini-spinner"></span>Loading live wind</div>'}</div></div>${S.mode === "loop" ? `<button class="btn green card-navigate" data-nav-route="${i}">Navigate adventure route</button>` : ""}</div>`).join("");
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
  const box = createChoiceModal("Sign in required", `<p>You need an account to ${escapeHtml(action)}.</p><button id="accountGoSignIn">Sign in</button><button id="accountNotNow">Not now</button>`);
  box.querySelector("#accountGoSignIn").onclick = () => {
    box.remove();
    open("profile");
  };
  box.querySelector("#accountNotNow").onclick = () => box.remove();
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
  if (kind === "routes") S.accountRoutes = items;
  else S.accountActivities = items;
  try {
    localStorage.setItem(accountCacheKey(kind), JSON.stringify(items));
  } catch (error) {
    console.warn(`Offline ${kind} cache skipped: storage is full`, error);
  }
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
    refreshPage();
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
    return { ...item, id };
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
    const step2 = () => {
      if (run !== S.previewRun || i >= coords.length - 1) {
        document.body.classList.remove("route-previewing");
        if (i >= coords.length - 1) toast("3D preview complete");
        return;
      }
      map.easeTo({ center: coords[i], bearing: turf.bearing(coords[i], coords[i + 1]), pitch: 68, zoom: 16.8, duration: 520, essential: true });
      i++;
      setTimeout(step2, 550);
    };
    step2();
  }, 80);
}
async function updateOpenSavedRoute(i = S.selected) {
  if (!requireAccount("save routes")) return false;
  const item = (S.accountRoutes || []).find((x) => x.id === S.openSavedId);
  const route = S.routes[i];
  if (!item || !route) return false;
  await putAccountItem("routes", { ...item, route: structuredClone(route), waypoints: structuredClone(S.waypoints), names: structuredClone(S.names), mode: S.mode, updatedAt: Date.now() });
  route.savedName = item.name;
  S.routeDirty = false;
  S.routeUndo = [];
  updateUndoButton();
  updateEditBanner();
  toast(`Saved changes to ${item.name || "your route"}`);
  return true;
}
async function saveRouteByIndex(i, { asCopy = false } = {}) {
  if (!requireAccount("save routes")) return;
  const route = S.routes[i];
  if (!route) return;
  if (!asCopy && S.openSavedId && i === S.selected && (S.accountRoutes || []).some((x) => x.id === S.openSavedId)) return updateOpenSavedRoute(i);
  if (!Array.isArray(route.requiredNavigationWaypoints)) route.requiredNavigationWaypoints = navigationWaypointSequence();
  const shortPlace = (n) => String(n || "").split(",")[0].trim();
  const from = isPlaceholderName(S.names[0]) ? "" : shortPlace(S.names[0]), to = isPlaceholderName(S.names.at(-1)) ? "" : shortPlace(S.names.at(-1));
  const suggested = S.mode === "loop" ? `${from || "My"} loop` : from && to ? `${from} to ${to}` : from || to || "My route";
  const name = prompt(asCopy ? "Name for the copy" : "Route name", asCopy && route.savedName ? `${route.savedName} (copy)` : suggested);
  if (!name?.trim()) return false;
  const savedItem = { id: crypto.randomUUID(), name: name.trim(), route: structuredClone(route), names: structuredClone(S.names), waypoints: structuredClone(S.waypoints), mode: S.mode, createdAt: Date.now() };
  await putAccountItem("routes", savedItem);
  if (S.selected === i) {
    S.openSavedId = savedItem.id;
    S.routeDirty = false;
    if (S.route) S.route.savedName = savedItem.name;
  }
  S.routeUndo = [];
  updateUndoButton();
  updateEditBanner();
  toast("Route saved to your account");
  if (S.clubRideReturn) {
    S.clubRideReturn = false;
    S.segmentsView = "newEvent";
    open("segments");
  }
  return true;
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
  await putAccountItem("routes", { ...item, route: structuredClone(S.route), waypoints: structuredClone(S.waypoints), names: structuredClone(S.names), mode: S.mode, updatedAt: Date.now() });
  S.routeDirty = false;
}
function pushRouteUndo() {
  if (S.route && S.selected !== null) {
    S.routeDirty = true;
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
  if (!b) return;
  b.hidden = !S.routeUndo.length || !!S.navState;
  b.onclick = undoRouteEdit;
  updateEditBanner();
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
function updateEditBanner() {
  const box = $("#edit-banner"), label = $("#edit-banner-text"), action = $("#edit-done"), copy = $("#edit-copy");
  if (!box || !label || !action) return;
  const editable = !!S.route && S.selected !== null && !S.navState;
  const item = (S.accountRoutes || []).find((x) => x.id === (S.editingSavedId || S.openSavedId));
  const name = item?.name || S.route?.savedName || "route";
  const editing = editable && !!S.editingSavedId;
  const changedSaved = editable && !S.editingSavedId && !!S.openSavedId && !!S.routeDirty;
  const changedNew = editable && !S.openSavedId && (S.routeDirty || S.routeUndo.length > 0);
  box.hidden = !(editing || changedSaved || changedNew);
  if (copy) copy.hidden = !changedSaved;
  if (box.hidden) return;
  if (editing) {
    box.dataset.mode = "library";
    label.textContent = `Editing "${name}" \xB7 changes save automatically`;
    action.textContent = "Done";
  } else if (changedSaved) {
    box.dataset.mode = "changed";
    label.textContent = `"${name}" changed`;
    action.textContent = "Save changes";
  } else {
    box.dataset.mode = "unsaved";
    label.textContent = "New route \xB7 not saved yet";
    action.textContent = "Save route";
  }
}
function loadSavedRoute(x, edit = false) {
  S.route = structuredClone(x.route);
  S.routes = [S.route];
  S.selected = 0;
  S.waypoints = structuredClone(x.waypoints || []);
  S.names = structuredClone(x.names || []);
  S.mode = x.mode || "point";
  S.openSavedId = x.id || null;
  S.editingSavedId = edit ? x.id || null : null;
  S.routeDirty = false;
  S.routeUndo = [];
  S.route.savedName = x.name || "Saved route";
  markers2();
  clearLines();
  line("chosen", S.route.geometry, colors[0], 8);
  fitMapToCoords(S.route.geometry?.coordinates);
  if (MAP_PAGES.includes(S.page)) open("explore");
  else {
    render7();
    setSheetState("half");
  }
  cards();
  if (edit) nodes();
  else {
    S.nodes.forEach((m) => m.remove());
    S.nodes = [];
  }
  updateUndoButton();
  updateQuickNav();
  updateEditBanner();
  toast(edit ? `Editing ${x.name || "route"} \xB7 drag the route or its stops` : `${x.name || "Route"} ready to ride`);
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
  const status = ensureSharedJourneyStatus(), state4 = $("#shared-journey-state"), updated = $("#shared-journey-updated");
  state4.textContent = !data.active ? "Journey ended" : data.paused ? "Live sharing paused" : rider ? "Rider position is live" : "Waiting for rider GPS";
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
  $("#audio-nav").setAttribute("aria-pressed", String(S.audioNavigation));
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
  updateEditBanner();
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
function waypointIndexFor(location2) {
  if (!Array.isArray(location2)) return -1;
  const required = S.route?.requiredNavigationWaypoints || [];
  let best = -1, bestM = WAYPOINT_GRAB_M;
  required.forEach((point, i) => {
    try {
      const m = turf.distance(point, location2, { units: "meters" });
      if (m <= bestM) {
        bestM = m;
        best = i;
      }
    } catch {
    }
  });
  return best;
}
function nodes() {
  S.nodes.forEach((m) => m.remove());
  S.nodes = [];
  const steps = S.route?.legs?.flatMap((leg) => leg.steps) || [];
  const places = [];
  steps.slice(1, -1).forEach((step2) => {
    const location2 = step2.maneuver?.location;
    if (!Array.isArray(location2)) return;
    const waypointIndex = waypointIndexFor(location2);
    const existing = places.find((place) => {
      try {
        const a = map.project(place.location), b = map.project(location2);
        return Math.hypot(a.x - b.x, a.y - b.y) <= HANDLE_SPACING_PX;
      } catch {
        return false;
      }
    });
    if (existing) {
      if (waypointIndex >= 0 && existing.waypointIndex < 0) {
        existing.location = location2;
        existing.waypointIndex = waypointIndex;
      }
      return;
    }
    places.push({ location: location2, waypointIndex });
  });
  places.forEach(({ location: location2, waypointIndex }) => {
    const el = document.createElement("div");
    el.className = waypointIndex >= 0 ? "turn turn-waypoint" : "turn";
    el.title = waypointIndex >= 0 ? "Drag to move this waypoint" : "Drag to reshape this route";
    if (waypointIndex >= 0) el.dataset.waypoint = String(waypointIndex);
    const marker = new mapboxgl.Marker({ element: el, draggable: true }).setLngLat(location2).addTo(map);
    marker.on("dragend", async () => {
      await reshapeSelectedRoute(marker.getLngLat().toArray(), location2, waypointIndex);
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
  const start2 = [...coords[0]], ordered = [start2, ...anchors.filter((anchor) => anchor.f > 0.02 && anchor.f < 0.98).map((anchor) => anchor.coord), start2];
  return dedupeViaPoints(ordered);
}
function routeRequiredWaypoints(route) {
  if (Array.isArray(route?.requiredNavigationWaypoints) && route.requiredNavigationWaypoints.length) return route.requiredNavigationWaypoints.filter((point) => Array.isArray(point)).map((point) => [...point]);
  const request = route?._requestPoints;
  if (Array.isArray(request) && request.length > 2) return request.slice(1).filter((point) => Array.isArray(point)).map((point) => [...point]);
  if (S.mode === "loop") {
    const start2 = route?.geometry?.coordinates?.[0], required = S.adventureWaypoints.map((item) => item?.coord).filter((point) => Array.isArray(point));
    return [...required, ...start2 ? [start2] : []].map((point) => [...point]);
  }
  return (S.waypoints || []).slice(1).filter((point) => Array.isArray(point)).map((point) => [...point]);
}
function monotonicRouteProgress(line2, points) {
  let floor = 0;
  return points.map((point) => {
    let at = floor;
    try {
      at = Math.max(floor, turf.nearestPointOnLine(line2, turf.point(point)).properties.location || 0);
    } catch {
    }
    floor = at;
    return at;
  });
}
function alignWaypointNames(nextPoints, previousPoints, previousNames) {
  const same = (a, b) => Array.isArray(a) && Array.isArray(b) && Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
  return nextPoints.map((point) => {
    const i = previousPoints.findIndex((p) => same(p, point));
    return i >= 0 ? previousNames[i] || "" : "Route edit";
  });
}
var WAYPOINT_GRAB_M = 15;
var HANDLE_SPACING_PX = 30;
function insertDraggedPointByRouteProgress(route, required, dragged, original, movingIndex = -1) {
  if (movingIndex >= 0 && movingIndex < required.length) {
    return required.map((point, i) => i === movingIndex ? [...dragged] : point);
  }
  const line2 = turf.lineString(route.geometry.coordinates), progress = monotonicRouteProgress(line2, required);
  let dragAt = 0;
  try {
    dragAt = turf.nearestPointOnLine(line2, turf.point(original)).properties.location || 0;
  } catch {
  }
  const ordered = [];
  let inserted = false;
  required.forEach((point, i) => {
    if (!inserted && dragAt <= progress[i]) {
      ordered.push(dragged);
      inserted = true;
    }
    ordered.push(point);
  });
  if (!inserted) ordered.push(dragged);
  return ordered;
}
function buildWaypointPreservingEditPoints(route, dragged, original, movingIndex = -1) {
  const start2 = route.geometry.coordinates[0], required = routeRequiredWaypoints(route), isLoop = isClosedLoop(route.geometry.coordinates);
  if (!required.length) return isLoop ? buildLoopViaPoints(route.geometry.coordinates, dragged, original) : [start2, dragged, route.geometry.coordinates.at(-1)];
  const ordered = insertDraggedPointByRouteProgress(route, required, dragged, original, movingIndex), points = [start2, ...ordered];
  if (!isLoop) {
    const finish2 = route.geometry.coordinates.at(-1);
    if (turf.distance(points.at(-1), finish2) > 5e-3) points.push(finish2);
  } else if (turf.distance(points.at(-1), start2) > 5e-3) points.push(start2);
  return dedupeNavigationPoints(points).slice(0, 24);
}
function snapPointsToRoute(route, points) {
  const line2 = turf.lineString(route.geometry.coordinates);
  return points.map((point) => {
    try {
      const snap = turf.nearestPointOnLine(line2, turf.point(point));
      return snap?.geometry?.coordinates ? [...snap.geometry.coordinates] : [...point];
    } catch {
      return [...point];
    }
  });
}
function missingRequiredWaypoints(route, required, toleranceM = 90) {
  if (!required.length) return [];
  const line2 = turf.lineString(route.geometry.coordinates);
  const out = [];
  required.forEach((point, index) => {
    let metres = Infinity;
    try {
      const d = turf.nearestPointOnLine(line2, turf.point(point)).properties.dist;
      metres = Number.isFinite(d) ? d * 1e3 : Infinity;
    } catch (error) {
      console.warn("Could not measure a waypoint", error);
    }
    if (!(metres <= toleranceM)) out.push({ index, metres: Math.round(metres) });
  });
  return out;
}
async function reshapeSelectedRoute(dragged, original, movingIndex = -1) {
  if (!S.route || S.selected === null) return;
  const oldRoute = S.route, isLoop = isClosedLoop(oldRoute.geometry.coordinates), required = routeRequiredWaypoints(oldRoute);
  toast(required.length ? "Reshaping while preserving every waypoint\u2026" : isLoop ? "Reshaping loop while preserving its circuit\u2026" : "Reshaping selected route\u2026");
  pushRouteUndo();
  try {
    const via = buildWaypointPreservingEditPoints(oldRoute, dragged, original, movingIndex), candidates = await fastDirections(via, 9e3, false), next = candidates[0];
    if (!next) throw new Error("NO_ROUTE");
    if (isLoop && !validLoop(next.geometry.coordinates, oldRoute.geometry.coordinates)) throw new Error("LOOP_COLLAPSED");
    const missed = missingRequiredWaypoints(next, via.slice(1));
    if (missed.length) throw Object.assign(new Error("WAYPOINT_LOST"), { missed });
    next._requestPoints = structuredClone(via);
    next.requiredNavigationWaypoints = snapPointsToRoute(next, via.slice(1));
    next.requiredWaypointNames = alignWaypointNames(via.slice(1), required, oldRoute.requiredWaypointNames || []);
    next.waypointEfficient = oldRoute.waypointEfficient;
    next.qualityLabel = oldRoute.qualityLabel;
    next.rangeStatus = oldRoute.rangeStatus;
    next.savedName = oldRoute.savedName;
    next.poi = oldRoute.poi;
    next.name = oldRoute.name;
    prepareImmediateRouteMetrics(next);
    next.elev = oldRoute.elev;
    next.wind = oldRoute.wind;
    next.ascent = oldRoute.ascent;
    next.cycleScore = cycleScore(next);
    S.routes[S.selected] = next;
    S.route = next;
    clearLines();
    line("chosen", next.geometry, colors[S.selected % colors.length], 8);
    nodes();
    cards();
    updateQuickNav();
    updateEditBanner();
    toast(required.length ? "Route reshaped \xB7 all waypoints preserved" : isLoop ? "Loop reshaped and preserved" : "Route reshaped");
    enrich(next).then(() => {
      if (S.route !== next) return;
      next.cycleScore = cycleScore(next);
      cards();
      if (S.editingSavedId) return saveEditedSavedRoute();
    }).catch((error) => console.warn("Route detail refresh failed", error));
    scheduleCycleScoreRefinement(next);
  } catch (error) {
    console.warn("Route reshaping rejected:", error.message, error.missed ? JSON.stringify(error.missed) : "");
    S.route = oldRoute;
    S.routes[S.selected] = oldRoute;
    clearLines();
    line("chosen", oldRoute.geometry, colors[S.selected % colors.length], 8);
    nodes();
    cards();
    const reasons = {
      NO_ROUTE: "No cycling route exists through that point",
      LOOP_COLLAPSED: "That edit would collapse the loop, so the previous route was restored",
      WAYPOINT_LOST: error.missed?.length ? `Edit undone \xB7 ${error.missed.length} waypoint${error.missed.length === 1 ? "" : "s"} would be left behind` : "Edit undone \xB7 a waypoint would be left behind"
    };
    toast(reasons[error.message] || "That edit could not be applied, so the previous route was restored");
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
function stopLetter(i) {
  return String.fromCharCode(65 + i);
}
function markers2() {
  S.markers.forEach((m) => m.remove());
  S.markers = [];
  if (S.mode === "loop") return;
  const n = (S.waypoints || []).length;
  (S.waypoints || []).forEach((p, i) => {
    if (!Array.isArray(p)) return;
    const el = document.createElement("div");
    el.className = "stop-pin " + (i === 0 ? "start" : i === n - 1 ? "finish" : "via");
    el.textContent = stopLetter(i);
    el.title = S.names?.[i] || "";
    const marker = new mapboxgl.Marker({ element: el, draggable: true, anchor: "bottom" }).setLngLat(p).addTo(map);
    marker.on("dragend", () => moveStop(i, marker.getLngLat().toArray()));
    S.markers.push(marker);
  });
}
async function moveStop(i, lngLat) {
  if (!Array.isArray(S.waypoints) || i < 0 || i >= S.waypoints.length) return;
  S.waypoints[i] = lngLat;
  S.routeDirty = true;
  S.names[i] = "Finding address\u2026";
  refreshPage(true);
  const name = await getRecognisableLocationName(lngLat);
  if (S.waypoints[i] === lngLat) S.names[i] = name;
  markers2();
  refreshPage(true);
  if (S.waypoints.length >= 2 && S.waypoints.every(Array.isArray)) await pointRoutes(false);
}
function bestStopInsertion(points, p) {
  let best = Math.max(1, points.length - 1), bestExtra = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    let extra;
    try {
      extra = turf.distance(a, p) + turf.distance(p, b) - turf.distance(a, b);
    } catch {
      continue;
    }
    if (extra < bestExtra) {
      bestExtra = extra;
      best = i;
    }
  }
  return best;
}
async function addStopFromMap(lngLat) {
  if (S.mode === "loop") {
    const entry = { coord: lngLat, name: "Finding address\u2026" };
    S.adventureWaypoints.push(entry);
    refreshPage(true);
    entry.name = await getRecognisableLocationName(lngLat);
    refreshPage(true);
    toast(`Stop added \xB7 ${entry.name}`);
    return;
  }
  if (!Array.isArray(S.waypoints)) S.waypoints = [];
  if (!Array.isArray(S.names)) S.names = [];
  while (S.waypoints.length < 2) S.waypoints.push(null);
  while (S.names.length < S.waypoints.length) S.names.push("");
  const empty = S.waypoints.findIndex((p) => !Array.isArray(p));
  let at;
  if (empty >= 0) {
    at = empty;
    S.waypoints[at] = lngLat;
    S.names[at] = "Finding address\u2026";
  } else {
    at = bestStopInsertion(S.waypoints, lngLat);
    S.waypoints.splice(at, 0, lngLat);
    S.names.splice(at, 0, "Finding address\u2026");
  }
  S.routeDirty = true;
  markers2();
  refreshPage(true);
  const name = await getRecognisableLocationName(lngLat);
  const idx = S.waypoints.indexOf(lngLat);
  if (idx >= 0) S.names[idx] = name;
  markers2();
  refreshPage(true);
  toast(`Stop ${stopLetter(Math.max(0, idx))} added \xB7 ${name}`);
  if (S.waypoints.length >= 2 && S.waypoints.every(Array.isArray)) await pointRoutes(false);
}
if ("ResizeObserver" in window) {
  const bar = document.querySelector("#quick-nav");
  if (bar) new ResizeObserver(() => document.documentElement.style.setProperty("--ride-bar-h", Math.round(bar.getBoundingClientRect().height) + "px")).observe(bar);
}
function updateQuickNav() {
  const box = $("#quick-nav"), quickStart = $("#quick-start"), live = $("#ride-live");
  if (!box || !quickStart || !live) return;
  if (!S.navState) {
    const strip = $("#nav-elev");
    if (strip) strip.hidden = true;
  }
  if (!box.dataset.detail) {
    box.dataset.detail = "collapsed";
    document.body.dataset.rideDetail = "collapsed";
  }
  const expander = $("#ride-expand");
  if (expander && !expander.dataset.wired) {
    expander.dataset.wired = "1";
    expander.onclick = () => {
      const open2 = box.dataset.detail === "open";
      const next = open2 ? "collapsed" : "open";
      box.dataset.detail = next;
      document.body.dataset.rideDetail = next;
      expander.setAttribute("aria-expanded", String(!open2));
      expander.setAttribute("aria-label", open2 ? "Show ride stats" : "Hide ride stats");
    };
  }
  const routeReady = !!S.route && S.selected !== null, active2 = !!S.record || !!S.navState;
  box.hidden = !routeReady && !active2;
  quickStart.hidden = active2;
  live.hidden = !active2;
  box.classList.toggle("recording-active", active2);
  if (routeReady && !active2) quickStart.onclick = startNavigation;
  if (active2) {
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
  const box = $("#quick-nav"), live = $("#ride-live"), start2 = $("#quick-start");
  if (!box || !live || !start2) return;
  box.hidden = false;
  live.hidden = false;
  start2.hidden = true;
  box.classList.add("recording-active");
  requestAnimationFrame(() => {
    box.hidden = false;
    live.hidden = false;
    start2.hidden = true;
    box.style.display = "block";
    live.style.display = "block";
    start2.style.display = "none";
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
  const active2 = !!S.navState && !navigator.onLine;
  badge.hidden = !active2;
  if (active2) badge.textContent = "Offline navigation \xB7 GPS guidance active \xB7 rerouting unavailable";
}
var ACTIVE_SESSION_KEY = "ridewise-active-session-v1";
var sessionSaveTimer = 0;
var MAX_PERSISTED_SAMPLES = 900;
function decimateSamples(list, max) {
  if (!Array.isArray(list) || list.length <= max) return Array.isArray(list) ? list : [];
  const step2 = list.length / max, out = [];
  for (let i = 0; i < max; i++) out.push(list[Math.floor(i * step2)]);
  if (out[out.length - 1] !== list[list.length - 1]) out.push(list[list.length - 1]);
  return out;
}
function trimPersistedStep(step2) {
  const { voiceInstructions, bannerInstructions, ...rest } = step2 || {};
  return rest;
}
function serialisableSession() {
  if (!S.record && !S.navState) return null;
  const route = S.route ? { ...structuredClone(S.route), legs: void 0 } : null;
  const record2 = S.record ? { ...structuredClone(S.record), samples: decimateSamples(S.record.samples, MAX_PERSISTED_SAMPLES) } : null;
  const navState = S.navState ? { ...structuredClone(S.navState), recalculating: false, spokenVoice: void 0, _maneuverAt: void 0, _maneuverAtFor: void 0, steps: (S.navState.steps || []).map(trimPersistedStep) } : null;
  return {
    version: 2,
    ownerId: S.user?.uid || null,
    savedAt: Date.now(),
    route,
    // The other candidates are not needed to resume and were the largest part.
    routes: [],
    selected: S.selected,
    waypoints: structuredClone(S.waypoints || []),
    names: structuredClone(S.names || []),
    mode: S.mode,
    record: record2,
    navState,
    pos: S.pos || null,
    visualHeading: S.visualHeading ?? S.smoothedHeading ?? null
  };
}
var sessionQuotaWarned = false;
function persistActiveSession(force = false) {
  clearTimeout(sessionSaveTimer);
  const commit = () => {
    let data;
    try {
      data = serialisableSession();
    } catch (error) {
      console.warn("Could not snapshot the ride", error);
      return;
    }
    try {
      if (data) localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(data));
      else localStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    } catch (error) {
      try {
        if (data) {
          data.record = data.record ? { ...data.record, samples: decimateSamples(data.record.samples, 120) } : null;
          localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(data));
          return;
        }
      } catch {
      }
      try {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      } catch {
      }
      if (!sessionQuotaWarned) {
        sessionQuotaWarned = true;
        console.warn("Ride recovery snapshots disabled: storage is full", error);
        toast("Storage full \xB7 ride recovery snapshot disabled");
      }
    }
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
  const start2 = S.route?.geometry?.coordinates?.[0];
  if (S.mode === "loop") {
    const required = S.adventureWaypoints.map((item) => item?.coord).filter((point) => Array.isArray(point));
    return [...required, ...start2 ? [start2] : []].map((point) => [...point]);
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
  if (!routeHasGuidance(S.route) && S.route._requestPoints?.length) {
    toast("Preparing turn instructions\u2026");
    await hydrateRouteInstructions(S.route, S.route._requestPoints);
  }
  if (hasMotorway(S.route)) {
    toast("Route rejected: motorway cycling is not permitted. Choose another route.");
    return false;
  }
  unlockAudioNavigation();
  enableCompass();
  applyNightMode();
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
  S.waypoints = [coords[0], coords.at(-1)];
  S.names = ["Finding address\u2026", "Finding address\u2026"];
  const opened = S.route;
  Promise.all([getRecognisableLocationName(coords[0]), getRecognisableLocationName(coords.at(-1))]).then(([x, y]) => {
    if (S.route === opened) {
      S.names = [x, y];
      markers2();
      refreshPage(true);
    }
  }).catch(() => {
  });
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
  refreshPage();
}
async function addPhotosToSavedActivity(index, files) {
  if (!requireAccount("edit activities")) return;
  const activity = S.accountActivities[index];
  if (!activity) return;
  activity.photos = activity.photos || [activity.photo].filter(Boolean);
  for (const file of files.slice(0, Math.max(0, 6 - activity.photos.length))) activity.photos.push(await compressPhoto(file));
  delete activity.photo;
  await putAccountItem("activities", activity);
  refreshPage();
}
async function deleteSavedPhoto(index, photoIndex) {
  if (!requireAccount("edit activities")) return;
  const activity = S.accountActivities[index];
  if (!activity) return;
  activity.photos = (activity.photos || []).filter((_, i) => i !== photoIndex);
  await putAccountItem("activities", activity);
  refreshPage();
}
async function renameSavedActivity(index) {
  if (!requireAccount("rename activities")) return;
  const activity = S.accountActivities[index];
  if (!activity) return;
  const name = prompt("Activity name", activity.name || "Cycling activity");
  if (name?.trim()) {
    activity.name = name.trim();
    await putAccountItem("activities", activity);
    refreshPage();
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
  if (saved.routeId) recordRouteRidden(saved.routeId).catch(() => {
  });
  matchActivity(S.user, saved, turf).then((found) => {
    if (found.length) {
      S.lastSegmentResults = found;
      const pr = found.filter((f) => f.isPR).length;
      toast(pr ? `${pr} personal record on this ride` : `${found.length} segment${found.length === 1 ? "" : "s"} matched`);
    }
  }).catch((error) => console.warn("Segment matching skipped", error));
  if (shareToFeed) {
    try {
      await publishActivityToFeed(S.user, saved, turf, ridePrefs().privacyRadiusM ?? 400);
    } catch (error) {
      console.warn("Publishing to feed failed; activity is still saved privately", error);
    }
  }
  S.pendingActivity = null;
  toast(shareToFeed ? "Activity saved and shared to your feed" : "Activity saved to your account");
  refreshPage();
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
    r.samples.push({ pos: p, speed: rawSpeed, elevation: c.altitude, time: now, windSpeed: windSpeedKmh, windDir: S.windAtPoint?.dir ?? S.wind.dir, grade, estimatedPower, heartRate: getHeartRate(), cadence: getCadence() });
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
  updateSegmentBanner();
  persistActiveSession();
  updateOfflineNavigationStatus();
  if (S.page === "record") refreshPage();
}
var segmentWatchLoaded = false;
async function loadNearbySegments() {
  if (segmentWatchLoaded || !S.pos) return;
  segmentWatchLoaded = true;
  try {
    S.nearbySegments = await listSegmentsNear(S.pos, 25, turf);
  } catch {
    S.nearbySegments = [];
  }
}
function updateSegmentBanner() {
  const el = $("#segment-banner");
  if (!el) return;
  if (!S.record) {
    el.hidden = true;
    return;
  }
  loadNearbySegments();
  const list = S.nearbySegments || [];
  for (const seg of list) {
    const live = liveSegmentState(S.record, seg, turf);
    if (live && live.state === "running") {
      el.hidden = false;
      el.innerHTML = `<span class="row" style="gap:8px">${icon("flag", 18)}${escapeHtml(seg.name || "Segment")}</span><span>${fmtSeconds(live.seconds)}</span>`;
      return;
    }
  }
  el.hidden = true;
}
function updateLiveDashboard() {
  const r = S.record;
  if (!r) return;
  $("#live-speed").textContent = displaySpeed(r).toFixed(1);
  $("#live-speed-label").textContent = r.paused ? "average km/h" : "current km/h";
  $("#live-distance").textContent = r.distance.toFixed(2);
  $("#live-gain").textContent = Math.round(r.gain);
  $("#live-time").textContent = formatClock(r.movingMs);
  const hr = getHeartRate(), cad = getCadence();
  const timeEl = $("#live-time"), timeLbl = $("#live-time-label");
  if (Number.isFinite(hr)) {
    timeEl.textContent = hr;
    if (timeLbl) timeLbl.textContent = "bpm";
  } else if (timeLbl) timeLbl.textContent = "moving";
  const p = $("#live-power"), pl = $("#live-power-label");
  if (p) {
    if (Number.isFinite(cad)) {
      p.textContent = cad;
      if (pl) pl.textContent = "rpm";
    } else {
      const last = r.samples?.at(-1)?.estimatedPower;
      p.textContent = Number.isFinite(last) ? Math.round(last) : "0";
      if (pl) pl.textContent = "watts";
    }
  }
  updateEffortZones(r, hr);
  const bar = $("#eta-bar");
  if (bar) bar.hidden = !S.navState;
  updateQuickNav();
}
var ZONE_COLOURS = ["#657186", "#139b66", "#f28b30", "#d94d4d", "#8b0000"];
var ZONE_NAMES = ["Recovery", "Endurance", "Tempo", "Threshold", "Max"];
function paintZones(host, zoneIndex, caption) {
  if (host.children.length !== 6) host.innerHTML = ZONE_COLOURS.map((c) => `<span style="background:${c}"></span>`).join("") + '<em class="zone-caption"></em>';
  [...host.children].forEach((el, i) => {
    if (i < 5) el.classList.toggle("on", i === zoneIndex);
  });
  host.lastElementChild.textContent = caption;
  host.hidden = false;
}
function updateEffortZones(r, hr) {
  const host = $("#hr-zones");
  if (!host) return;
  const age = +localStorage.getItem("profileAge") || null, z = heartRateZone(hr, age);
  if (z) {
    paintZones(host, z - 1, `Heart rate \xB7 Zone ${z} ${ZONE_NAMES[z - 1]} \xB7 ${Math.round(hr)} bpm`);
    return;
  }
  updatePowerZones(r);
}
function updatePowerZones(r) {
  const host = $("#hr-zones");
  if (!host) return;
  const last = r?.samples?.at(-1)?.estimatedPower || 0;
  if (!(last > 5)) {
    host.hidden = true;
    return;
  }
  const ftp = Math.max(80, (profileData().weight || 70) * 2.4), ratio = last / ftp, zone = ratio < 0.55 ? 0 : ratio < 0.75 ? 1 : ratio < 0.9 ? 2 : ratio < 1.05 ? 3 : 4;
  paintZones(host, zone, `Estimated effort \xB7 Zone ${zone + 1} ${ZONE_NAMES[zone]} \xB7 ~${Math.round(last)} W`);
}
function displaySpeed(r) {
  return r.paused ? r.avgSpeed : r.speed * 3.6;
}
function formatClock(ms) {
  const s = Math.floor(ms / 1e3), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
function navigationCameraTarget(pos, heading, speedMps = 0) {
  const nav = S.navState, steps = nav?.steps || [], index = Math.max(0, nav?.index || 0), next = steps[index], nextLocation = next?.maneuver?.location, turnDistance = nextLocation ? turf.distance(pos, nextLocation, { units: "meters" }) : Infinity, nearby = steps.slice(index, index + 5).filter((step2) => step2.maneuver?.location && turf.distance(pos, step2.maneuver.location, { units: "meters" }) <= 320).length, type = String(next?.maneuver?.type || "").toLowerCase(), modifier = String(next?.maneuver?.modifier || "").toLowerCase(), complex = /roundabout|rotary|fork|merge|off ramp|on ramp|arrive/.test(type) || /sharp|uturn/.test(modifier) || nearby >= 3;
  let state4 = "normal", zoom = 16.15, pitch = 49;
  if (complex || turnDistance < 90) {
    state4 = "complex";
    zoom = 17.35;
    pitch = 59;
  } else if (turnDistance < 220) {
    state4 = "approach";
    zoom = 16.85;
    pitch = 56;
  } else if (turnDistance < 550) {
    state4 = "prepare";
    zoom = 16.35;
    pitch = 52;
  } else if (turnDistance > 1800) {
    state4 = "cruise";
    zoom = 15.15;
    pitch = 42;
  } else if (turnDistance > 900) {
    state4 = "open";
    zoom = 15.55;
    pitch = 46;
  }
  const speedKmh = Math.max(0, speedMps * 3.6);
  if (speedKmh > 30) zoom -= 0.28;
  else if (speedKmh < 12 && (state4 === "complex" || state4 === "approach")) zoom += 0.16;
  if (S.navCamera.postTurnUntil > Date.now()) {
    state4 = "post-turn";
    zoom = Math.max(16.7, zoom);
    pitch = Math.max(54, pitch);
  }
  const bearing = Number.isFinite(heading) ? heading : nextLocation ? turf.bearing(pos, nextLocation) : map.getBearing();
  return { state: state4, zoom: Math.max(14.8, Math.min(17.65, zoom)), pitch, bearing, turnDistance, stepIndex: index };
}
var NAV_FOLLOW_MS = 900;
function navigationCameraPadding() {
  const wrap = $("#map-wrap");
  if (!wrap) return { top: 0, bottom: 0, left: 0, right: 0 };
  const box = wrap.getBoundingClientRect();
  const visible = (el) => {
    if (!el || el.hidden) return 0;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return 0;
    const r = el.getBoundingClientRect();
    return r.height > 0 ? r.height : 0;
  };
  const top = Math.min(box.height * 0.3, visible($("#nav-guidance")) + 20);
  const bottom = Math.min(box.height * 0.45, visible($("#quick-nav")) + 20);
  return { top: Math.round(top), bottom: Math.round(bottom), left: 0, right: 0 };
}
function navigationCameraLead(pos, heading, speedMps) {
  const speed = Math.max(0, speedMps || 0);
  if (!Number.isFinite(heading) || speed < 1.5) return pos;
  const seconds = Math.min(7, 1.4 + speed * 0.35);
  const km = speed * seconds / 1e3;
  try {
    return turf.destination(pos, km, heading, { units: "kilometers" }).geometry.coordinates;
  } catch {
    return pos;
  }
}
function riderOffScreen(pos, padding) {
  try {
    const wrap = $("#map-wrap");
    if (!wrap) return false;
    const box = wrap.getBoundingClientRect();
    const p = map.project(pos);
    const margin = 40;
    return p.x < margin || p.y < padding.top + margin || p.x > box.width - margin || p.y > box.height - padding.bottom - margin;
  } catch {
    return false;
  }
}
function updateAdaptiveNavigationCamera(pos, heading, speedMps = 0, force = false) {
  if (!S.navState || Date.now() < S.manualExploreUntil) return;
  const now = Date.now();
  const target = navigationCameraTarget(pos, heading, speedMps);
  const camera = S.navCamera;
  if (target.stepIndex !== camera.lastStep && camera.lastStep >= 0) camera.postTurnUntil = now + 4500;
  camera.lastStep = target.stepIndex;
  const padding = navigationCameraPadding();
  const lost = riderOffScreen(pos, padding);
  const reframeDue = force || lost || Math.abs(target.zoom - camera.zoom) >= 0.14 && now - camera.lastReframeAt >= 1200 || target.state !== camera.state && now - camera.lastReframeAt >= 1200;
  if (reframeDue) {
    camera.lastReframeAt = now;
    camera.zoom = target.zoom;
    camera.pitch = target.pitch;
    camera.state = target.state;
  }
  camera.lastAt = now;
  map.easeTo({
    center: navigationCameraLead(pos, heading, speedMps),
    zoom: camera.zoom ?? target.zoom,
    pitch: camera.pitch ?? target.pitch,
    bearing: target.bearing,
    padding,
    // A recentre after losing the rider should be immediate, not a long glide.
    duration: force ? 650 : lost ? 260 : NAV_FOLLOW_MS,
    essential: true
  });
}
function maneuverDistances(nav) {
  if (nav._maneuverAtFor === nav.steps) return nav._maneuverAt;
  let total = 0;
  const at = nav.steps.map((step2) => {
    const start2 = total;
    total += step2.distance || 0;
    return start2;
  });
  at.push(total);
  nav._maneuverAt = at;
  nav._maneuverAtFor = nav.steps;
  return at;
}
function recentPaceKmh() {
  const samples = S.record?.samples;
  if (!Array.isArray(samples) || samples.length < 4) return null;
  const cutoff = (samples.at(-1).time || Date.now()) - 12e4;
  let metres = 0, seconds = 0;
  for (let i = samples.length - 1; i > 0; i--) {
    const a = samples[i - 1], b = samples[i];
    if (!Array.isArray(a.pos) || !Array.isArray(b.pos) || (b.time || 0) < cutoff) break;
    const dt = ((b.time || 0) - (a.time || 0)) / 1e3;
    if (dt <= 0 || dt > 20) continue;
    const d = turf.distance(a.pos, b.pos, { units: "meters" });
    if (d / dt < 0.5) continue;
    metres += d;
    seconds += dt;
  }
  return seconds > 25 ? metres / seconds * 3.6 : null;
}
function speakNavigationCues(nav, stepIndex, step2, remainingInStep, instruction) {
  const list = step2?.voiceInstructions;
  nav.spokenVoice ||= /* @__PURE__ */ new Set();
  if (Array.isArray(list) && list.length) {
    for (let k = 0; k < list.length; k++) {
      const cue = list[k];
      if (remainingInStep > (cue.distanceAlongGeometry || 0)) continue;
      const key = stepIndex + ":" + k;
      if (nav.spokenVoice.has(key)) continue;
      nav.spokenVoice.add(key);
      speak(cue.announcement || instruction);
      return;
    }
    return;
  }
  voiceGuidance(stepIndex, instruction, remainingInStep);
}
function routeElevationProfile(route) {
  if (route._profileFor === route.elev) return route._profile;
  const elev = (Array.isArray(route.elev) ? route.elev : []).filter(Number.isFinite);
  const km = (route.distance || 0) / 1e3;
  route._profileFor = route.elev;
  route._profile = elev.length >= 3 && km > 0 ? { elev, km, step: km / (elev.length - 1) } : null;
  return route._profile;
}
function nextClimbAhead(profile, atKm) {
  const { elev, step: step2 } = profile, metresPerStep = step2 * 1e3;
  for (let i = Math.max(0, Math.floor(atKm / step2)); i < elev.length - 1; i++) {
    if ((elev[i + 1] - elev[i]) / metresPerStep * 100 < 3) continue;
    let j = i + 1;
    while (j < elev.length - 1 && (elev[j + 1] - elev[j]) / metresPerStep * 100 >= 1.5) j++;
    const rise = elev[j] - elev[i], lengthKm = (j - i) * step2;
    if (rise < 8) continue;
    return { inKm: Math.max(0, i * step2 - atKm), rise: Math.round(rise), lengthKm, grade: Math.round(rise / (lengthKm * 1e3) * 1e3) / 10 };
  }
  return null;
}
function ensureNavElevation(route) {
  if (!route || !S.navState || routeElevationProfile(route)) return;
  const job = S.navElevationJob;
  if (job?.route === route && (job.status === "loading" || Date.now() < job.retryAt)) return;
  const attempt = job?.route === route ? job.attempt + 1 : 1, current2 = { route, status: "loading", attempt, retryAt: 0 };
  S.navElevationJob = current2;
  loadRouteElevation(route).then((loaded) => {
    if (loaded) {
      if (S.navElevationJob === current2) S.navElevationJob = null;
    } else {
      current2.status = "failed";
      current2.retryAt = Date.now() + Math.min(3e5, 45e3 * attempt);
    }
    if (S.route === route && S.navState) drawNavElevation(route, S.navState.travelledM || 0);
  });
}
function drawNavElevation(route, travelledM) {
  const box = $("#nav-elev"), canvas = $("#nav-elev-canvas"), label = $("#nav-climb");
  if (!box || !canvas) return;
  if (!route || !S.navState) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const profile = routeElevationProfile(route);
  if (!profile) {
    ensureNavElevation(route);
    const job = S.navElevationJob, failed = job?.route === route && job.status === "failed";
    box.dataset.state = failed ? "failed" : "loading";
    if (label) label.textContent = failed ? navigator.onLine === false ? "Elevation unavailable offline \xB7 retrying when back online" : "Elevation unavailable \xB7 retrying shortly" : "Loading elevation profile\u2026";
    return;
  }
  box.dataset.state = "ready";
  const w = Math.max(1, Math.round(box.clientWidth)), h = 40, dpr = Math.min(3, devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const { elev, km, step: step2 } = profile;
  let lo = Math.min(...elev), hi = Math.max(...elev);
  if (hi - lo < 30) {
    const mid = (hi + lo) / 2;
    lo = mid - 15;
    hi = mid + 15;
  }
  const n = elev.length - 1, X = (i) => i / n * w, Y = (v) => h - 3 - (v - lo) / (hi - lo) * (h - 8);
  const frac = Math.max(0, Math.min(1, travelledM / 1e3 / km));
  const k = Math.max(1, Math.round(75 / (step2 * 1e3)));
  for (let i = 0; i < n; i++) {
    const a2 = Math.max(0, i - k + 1), b2 = Math.min(n, i + k), g = (elev[b2] - elev[a2]) / ((b2 - a2) * step2 * 1e3) * 100;
    ctx.fillStyle = g >= 8 ? "#d94d4d" : g >= 4 ? "#f28b30" : "#139b66";
    ctx.beginPath();
    ctx.moveTo(X(i), h);
    ctx.lineTo(X(i), Y(elev[i]));
    ctx.lineTo(X(i + 1) + 0.6, Y(elev[i + 1]));
    ctx.lineTo(X(i + 1) + 0.6, h);
    ctx.closePath();
    ctx.fill();
  }
  const at = frac * n, a = Math.floor(at), b = Math.min(n, a + 1), here = elev[a] + (elev[b] - elev[a]) * (at - a), mx = Math.max(5, Math.min(w - 5, frac * w));
  if (frac > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(255,255,255,.68)";
    ctx.fillRect(0, 0, frac * w, h);
    ctx.restore();
  }
  ctx.strokeStyle = "#132238";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mx, 2);
  ctx.lineTo(mx, h);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#176bdb";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(mx, Y(here), 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const climb = nextClimbAhead(profile, travelledM / 1e3);
  if (label) label.textContent = !climb ? "No climbs ahead" : climb.inKm < 0.05 ? `Climbing \xB7 ${climb.rise} m at ${climb.grade}%` : `Climb in ${formatDistance(climb.inKm * 1e3)} \xB7 ${climb.rise} m at ${climb.grade}%`;
}
function updateNavigationGuidance(pos) {
  const n = S.navState, r = S.route;
  if (!n || !r || n.paused || !Array.isArray(pos) || !(r.geometry?.coordinates?.length >= 2)) return;
  const lineString = turf.lineString(r.geometry.coordinates), snap = turf.nearestPointOnLine(lineString, turf.point(pos), { units: "kilometers" }), travelled = (snap.properties.location || 0) * 1e3, remaining = Math.max(0, (r.distance || 0) - travelled);
  n.travelledM = travelled;
  drawNavElevation(r, travelled);
  if (!n.steps?.length) return;
  const at = maneuverDistances(n);
  let current2 = 0;
  while (current2 + 1 < n.steps.length && at[current2 + 1] <= travelled + 1) current2++;
  n.index = current2;
  const upcomingIndex = Math.min(current2 + 1, n.steps.length - 1), upcoming = n.steps[upcomingIndex], remainingInStep = Math.max(0, (at[current2 + 1] || 0) - travelled), turnDistance = upcomingIndex > current2 ? remainingInStep : remaining;
  const banner = (upcoming?.bannerInstructions || []).find((b) => remainingInStep <= (b.distanceAlongGeometry || Infinity)), primary = banner?.primary, instruction = primary?.text || upcoming?.maneuver?.instruction || upcoming?.name || "Continue on route", secondary = banner?.secondary?.text || "", exit = upcoming?.maneuver?.exit;
  setText("#nav-instruction", secondary ? instruction + " \xB7 " + secondary : instruction);
  setText("#nav-next-distance", formatDistance(turnDistance));
  const lane = $("#nav-lane");
  if (lane) lane.innerHTML = laneTiles(upcoming);
  setText("#nav-arrow", exit && /roundabout|rotary/.test(upcoming?.maneuver?.type || "") ? String(exit) : turnArrow(upcoming?.maneuver));
  const speed = Math.max(6, recentPaceKmh() || S.record?.avgSpeed || r.distance / 1e3 / ((r.duration || 1) / 3600) || 18), mins = Math.ceil(remaining / 1e3 / speed * 60);
  setText("#nav-remaining-distance", formatDistance(remaining));
  setText("#nav-remaining-time", mins >= 60 ? Math.floor(mins / 60) + "h " + mins % 60 + "m" : mins + " min");
  setText("#nav-eta-time", arrivalClock(mins));
  updateSpeedLimit(pos);
  speakNavigationCues(n, current2, n.steps[current2], remainingInStep, instruction);
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
  const coordinates = via.map((point) => point.join(",")).join(";"), response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/cycling/${coordinates}?geometries=geojson&overview=full&steps=true&${GUIDANCE_PARAMS}&access_token=${MAPBOX_TOKEN}`), data = await response.json(), route = data.routes?.[0];
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
  const duration = 400, start2 = performance.now();
  function step2(now) {
    const t = Math.min(1, (now - start2) / duration);
    if (map.getLayer("chosen")) map.setPaintProperty("chosen", "line-opacity", 0.9 * (1 - t));
    if (map.getLayer(tempId)) map.setPaintProperty(tempId, "line-opacity", 0.9 * t);
    if (t < 1) requestAnimationFrame(step2);
    else {
      clearLines();
      line("chosen", newGeometry, color, width);
      onDone?.();
    }
  }
  requestAnimationFrame(step2);
}
async function recalculateFrom(pos) {
  const nav = S.navState;
  if (!nav || nav.recalculating) return;
  nav.recalculating = true;
  document.body.classList.add("rerouting");
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
    S.route = { ...route, elev: [], wind: previous?.wind || [], ascent: null };
    S.navElevationJob = null;
    S.routes[S.selected ?? 0] = S.route;
    S.selected = S.selected ?? 0;
    nav.steps = route.legs?.flatMap((leg) => leg.steps || []) || [];
    nav.index = 0;
    nav.totalDistance = route.distance;
    nav.totalDuration = route.duration;
    nav.offRouteSince = null;
    S.lastVoiceKey = "";
    nav.spokenVoice = /* @__PURE__ */ new Set();
    nav._maneuverAtFor = null;
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
    document.body.classList.remove("rerouting");
  }
}
function setText(sel, v) {
  const el = $(sel);
  if (el) el.textContent = v;
}
function arrivalClock(mins) {
  const d = new Date(Date.now() + Math.max(0, mins) * 6e4);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function laneIndicationArrow(ind = "") {
  const t = String(ind).toLowerCase();
  if (t.includes("uturn")) return "\u21A9";
  if (t.includes("sharp left")) return "\u2196";
  if (t.includes("sharp right")) return "\u2197";
  if (t.includes("slight left")) return "\u2196";
  if (t.includes("slight right")) return "\u2197";
  if (t.includes("left")) return "\u2190";
  if (t.includes("right")) return "\u2192";
  return "\u2191";
}
function laneTiles(step2) {
  const lanes = step2?.intersections?.flatMap((i) => i.lanes || []) || [];
  if (!lanes.length) return "";
  return lanes.slice(0, 6).map((l) => {
    const on = !!(l.valid || l.active);
    const ind = (l.indications || [])[0] || "straight";
    return `<i class="${on ? "on" : ""}">${laneIndicationArrow(ind)}</i>`;
  }).join("");
}
function updateSpeedLimit(pos) {
  const el = $("#speed-limit");
  if (!el) return;
  const limit = currentSpeedLimit(pos);
  if (!limit) {
    el.classList.remove("has-limit");
    el.textContent = "";
    el.removeAttribute("title");
    return;
  }
  el.classList.add("has-limit");
  el.textContent = String(limit.speed);
  el.title = `Speed limit ${limit.speed} ${limit.unit === "mph" ? "mph" : "km/h"}`;
}
function currentSpeedLimit(pos) {
  try {
    const r = S.route, ann = r?.legs?.[0]?.annotation?.maxspeed;
    if (!Array.isArray(ann) || !ann.length) return null;
    const snap = turf.nearestPointOnLine(turf.lineString(r.geometry.coordinates), turf.point(pos)), i = Math.max(0, Math.min(ann.length - 1, snap.properties.index || 0)), m = ann[i];
    if (!m || m.unknown || m.none || !Number.isFinite(m.speed)) return null;
    return { speed: m.speed, unit: m.unit };
  } catch {
    return null;
  }
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
async function areaName(p) {
  if (!Array.isArray(p)) return "";
  try {
    const d = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${p[0]},${p[1]}.json?types=neighborhood,locality,place&limit=1&access_token=${MAPBOX_TOKEN}`).then((x) => x.json());
    return d.features?.[0]?.text || "";
  } catch {
    return "";
  }
}
async function rideName(startPos, endPos, startedAt) {
  const hour = new Date(startedAt || Date.now()).getHours();
  const when = hour < 5 ? "Night" : hour < 11 ? "Morning" : hour < 14 ? "Lunch" : hour < 18 ? "Afternoon" : hour < 22 ? "Evening" : "Night";
  if (!Array.isArray(startPos)) return `${when} ride`;
  const loop = !Array.isArray(endPos) || turf.distance(startPos, endPos, { units: "kilometers" }) < 0.4;
  const [from, to] = await Promise.all([areaName(startPos), loop ? Promise.resolve("") : areaName(endPos)]);
  if (loop) return from ? `${when} loop from ${from}` : `${when} loop`;
  if (from && to && from !== to) return `${from} to ${to}`;
  if (from || to) return `${when} ride in ${from || to}`;
  return `${when} ride`;
}
async function finishRecord(endNav = true) {
  const r = S.record;
  if (!r) return;
  if (S.watch !== null) navigator.geolocation.clearWatch(S.watch);
  S.watch = null;
  const startPos = r.samples?.[0]?.pos, endPos = r.samples?.at(-1)?.pos;
  const defaultName = await rideName(startPos, endPos, r.started || r.samples?.[0]?.time || Date.now());
  const metrics = activityMetrics(r);
  const plannedCoords = S.route?.geometry?.coordinates;
  S.pendingActivity = { ...r, ...metrics, id: crypto.randomUUID(), routeId: S.route?.savedId || S.editingSavedId || null, plannedRoute: Array.isArray(plannedCoords) && plannedCoords.length >= 2 ? sample(plannedCoords, Math.min(60, plannedCoords.length)) : null, name: defaultName, ended: Date.now(), elapsed: r.movingMs, avgSpeed: r.movingMs > 0 ? r.distance / (r.movingMs / 36e5) : 0, photos: [] };
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
  render7();
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
function revealRouteInPlace() {
  if (MAP_PAGES.includes(S.page)) open("explore");
  else {
    render7();
    setSheetState("half");
  }
  fitMapToCoords(S.route?.geometry?.coordinates);
}
function showMapLocationMenu(lngLat) {
  document.querySelector(".map-location-menu")?.remove();
  const box = document.createElement("div");
  box.className = "map-location-menu";
  box.innerHTML = '<button class="popup-close" aria-label="Close">\xD7</button><b>Use this location</b><button id="setDestination">Set as destination</button><button id="addMapWaypoint">Add as a stop</button><button id="navigateHere">Navigate from my location</button><button id="googleMapView">View in Google Maps</button><button id="googleMap3d">View in Google Maps 3D</button><button id="copyMapCoordinates">Copy coordinates</button>';
  box.querySelector(".popup-close").onclick = () => box.remove();
  $("#map-wrap").appendChild(box);
  const close = () => box.remove();
  $("#setDestination").onclick = async () => {
    S.mode = "point";
    const start2 = S.waypoints?.[0] || S.pos || await current();
    if (!start2) {
      toast("Set a start point first, then pick a destination");
      return;
    }
    if (!Array.isArray(S.waypoints) || S.waypoints.length < 2) {
      S.waypoints = [start2, lngLat];
      S.names = [S.names?.[0] || "", "Finding address\u2026"];
    } else {
      S.waypoints[0] = start2;
      S.waypoints[S.waypoints.length - 1] = lngLat;
      S.names[S.waypoints.length - 1] = "Finding address\u2026";
    }
    close();
    markers2();
    const naming = Promise.all([
      isPlaceholderName(S.names[0]) ? getRecognisableLocationName(start2) : Promise.resolve(S.names[0]),
      getRecognisableLocationName(lngLat)
    ]);
    refreshPage(true);
    await pointRoutes(false);
    revealRouteInPlace();
    const [startName, finishName] = await naming;
    if (S.waypoints[0] === start2) S.names[0] = startName;
    if (S.waypoints[S.waypoints.length - 1] === lngLat) S.names[S.waypoints.length - 1] = finishName;
    markers2();
    refreshPage(true);
  };
  $("#navigateHere").onclick = async () => {
    const start2 = S.pos || await current();
    if (!start2) return;
    close();
    S.mode = "point";
    S.waypoints = [start2, lngLat];
    S.names = ["Finding address\u2026", "Finding address\u2026"];
    const naming = Promise.all([getRecognisableLocationName(start2), getRecognisableLocationName(lngLat)]);
    markers2();
    refreshPage(true);
    await pointRoutes(false);
    revealRouteInPlace();
    const [a, b] = await naming;
    if (S.waypoints[0] === start2) S.names[0] = a;
    if (S.waypoints[1] === lngLat) S.names[1] = b;
    markers2();
    refreshPage(true);
  };
  $("#addMapWaypoint").onclick = () => {
    close();
    addStopFromMap(lngLat);
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
  let timer2;
  map.getCanvas().addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    timer2 = setTimeout(() => showMapLocationMenu(map.unproject([t.clientX, t.clientY]).toArray()), 650);
  }, { passive: true });
  ["touchend", "touchmove", "touchcancel"].forEach((n) => map.getCanvas().addEventListener(n, () => clearTimeout(timer2), { passive: true }));
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
function weatherMetric(icon2, value, label, accent = "") {
  return `<div class="weather-metric ${accent}"><span class="weather-metric-icon">${icon2}</span><b>${value}</b><small>${label}</small></div>`;
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
  const gx = Math.max(0, Math.min(g.cols - 1, x / Math.max(1, width) * (g.cols - 1))), gy = Math.max(0, Math.min(g.rows - 1, y / Math.max(1, height) * (g.rows - 1))), x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(g.cols - 1, x0 + 1), y1 = Math.min(g.rows - 1, y0 + 1), tx2 = gx - x0, ty = gy - y0, c00 = g.cells[y0 * g.cols + x0], c10 = g.cells[y0 * g.cols + x1], c01 = g.cells[y1 * g.cols + x0], c11 = g.cells[y1 * g.cols + x1];
  const vector = (c2) => {
    const a2 = (c2.dir + 180) % 360 * Math.PI / 180, s = Math.max(0.1, c2.speed);
    return { x: Math.sin(a2) * s, y: -Math.cos(a2) * s };
  }, a = vector(c00), b = vector(c10), c = vector(c01), d = vector(c11), vx = (a.x * (1 - tx2) + b.x * tx2) * (1 - ty) + (c.x * (1 - tx2) + d.x * tx2) * ty, vy = (a.y * (1 - tx2) + b.y * tx2) * (1 - ty) + (c.y * (1 - tx2) + d.y * tx2) * ty;
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
      refreshPage();
    });
  } catch (e) {
    console.error("Firebase authentication unavailable", e);
    resolveAuthReady?.(null);
    resolveAuthReady = null;
  }
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
function paintChrome() {
  const set = (sel, name, size) => {
    const el = $(sel);
    if (el) el.innerHTML = icon(name, size);
  };
  set("#locate", "pin", 22);
  set("#map-share", "share", 22);
  set("#weather", "sun", 22);
  set("#map-style", "grid", 22);
  set("#ico-distance", "route", 16);
  set("#ico-gain", "mtn", 16);
  set("#ico-time", "clock", 16);
  set("#ico-power", "bolt", 16);
  const a = $("#audio-nav");
  if (a) {
    a.innerHTML = icon("speaker", 22);
    a.setAttribute("aria-pressed", String(!!S.audioNavigation));
  }
  const saved = localStorage.getItem("theme");
  if (saved && saved !== "system") document.documentElement.dataset.theme = saved;
}
paintChrome();
var enhanceQueued = false;
new MutationObserver(() => {
  if (enhanceQueued) return;
  enhanceQueued = true;
  requestAnimationFrame(() => {
    enhanceQueued = false;
    enhanceAll(panel);
  });
}).observe(panel, { childList: true, subtree: true });
$("#locate").onclick = async () => {
  const p = await current();
  if (p) {
    S.manualExploreUntil = 0;
    if (S.navState) updateAdaptiveNavigationCamera(p, S.smoothedHeading, S.record?.speed || 0, true);
    else map.flyTo({ center: p, zoom: 14 });
  }
};
$("#weather").onclick = toggleWeather;
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
map.on("zoomend", () => {
  if (S.nodes.length && S.route) nodes();
});
map.on("load", () => {
  installMapLocationGestures();
  if (!S.userNavigated) open("explore");
  setInterval(() => {
    if (S.user && MAP_PAGES.includes(S.page)) startLiveFriends({ state: S, map, mapboxgl });
    else stopLiveFriends();
  }, 8e3);
  loadSharedRouteFromUrl();
  loadJourneyFromUrl();
  setTimeout(promptSessionRecovery, 250);
});
var pauseFollowForGesture = (e) => {
  if (S.navState && e?.originalEvent) S.manualExploreUntil = Date.now() + 15e3;
};
map.on("dragstart", pauseFollowForGesture);
map.on("zoomstart", pauseFollowForGesture);
map.on("rotatestart", pauseFollowForGesture);
map.on("pitchstart", pauseFollowForGesture);
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
var APP = {
  get state() {
    return S;
  },
  $,
  panel,
  toast,
  escapeHtml,
  open,
  head,
  mobile,
  colors,
  fmt,
  gain,
  sample,
  map,
  MAPBOX_TOKEN,
  isCurrentPage,
  requireAccount,
  // planning + routes
  pointRoutes,
  adventureRoutes,
  scheduleAdventureRebuild,
  select,
  addStopFromMap,
  updateOpenSavedRoute,
  moveStop,
  stopLetter,
  isPlaceholderName,
  getRecognisableLocationName,
  showAllRoutesOnMap,
  drawAll,
  cards,
  markers: markers2,
  nodes,
  clearLines,
  line,
  previewRouteOnMap,
  clearRoutePreview,
  setSheetState,
  geo,
  setHere,
  current,
  addPointToPointWaypoint,
  renderWaypointFields,
  renderAdventureWaypointFields,
  saveRouteByIndex,
  shareRouteByIndex,
  shareSavedRouteByIndex,
  loadSavedRoute,
  renameSavedRoute,
  saveEditedSavedRoute,
  deleteAccountItem,
  putAccountItem,
  importGpxFile,
  exportSelectedRouteGpx,
  previewRoute3D,
  savedRouteBadges,
  savedRouteDate,
  hasMotorway,
  cycleScore,
  directions,
  fastDirections,
  validateAdventureLoop,
  publishAdventureRoutes,
  // navigation + recording
  startNavigation,
  startRecord,
  stopRecording,
  endNavigation,
  finishRecord,
  updateQuickNav,
  syncPauseControls,
  // activities
  sortedActivities,
  savePendingActivity,
  attachActivityPhotos,
  addPhotosToSavedActivity,
  deleteSavedPhoto,
  renameSavedActivity,
  useSavedActivityRoute,
  shareSavedActivity,
  exportActivityPng,
  displayActivityRoute,
  activityMetrics,
  profileData,
  plot,
  formatClock,
  displaySpeed,
  compressPhoto,
  sensors: sensors_exports,
  quality: quality_exports,
  cues: cues_exports,
  offline: offline_exports,
  ratings: ratings_exports,
  segments: segments_exports,
  ridePrefs,
  saveRidePrefs,
  applyRidePreferences,
  refreshDaylightLimit,
  applyNightMode,
  // weather
  loadWeather,
  toggleWeather,
  weatherIconUrl,
  groupHourlyByDay,
  cardinalDirection,
  // account/auth
  syncAccountLibrary,
  emailAction,
  showAuthError,
  isStandalone,
  // sharing
  openMapShareMenu,
  createChoiceModal,
  showUrlShareWindow,
  absoluteAppUrl,
  startLiveJourney,
  showLiveJourneyShare
};
var RIDE_PREFS_KEY = "ridewise-ride-prefs-v1";
function ridePrefs() {
  if (!S.ridePrefs) {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(RIDE_PREFS_KEY));
    } catch {
    }
    S.ridePrefs = { ...defaultPrefs(), ...stored && typeof stored === "object" ? stored : {} };
  }
  return S.ridePrefs;
}
function saveRidePrefs() {
  try {
    localStorage.setItem(RIDE_PREFS_KEY, JSON.stringify(ridePrefs()));
  } catch (error) {
    console.warn("Could not store ride preferences", error);
  }
}
function applyRidePreferences(routes2) {
  if (!Array.isArray(routes2) || !routes2.length) return;
  const prefs = ridePrefs(), ctx = { turf, windBearing: S.weather?.bearing ?? S.wind?.dir, maxKmForDaylight: S.daylightKm };
  routes2.forEach((r) => applyPreferences(r, prefs, ctx));
  routes2.forEach((r) => {
    r.whyThisRoute = whyThisRoute(r, routes2);
  });
}
async function refreshDaylightLimit() {
  try {
    const p = S.pos || S.waypoints?.[0];
    if (!p) return;
    const sunset = await fetchSunset(p[1], p[0]);
    S.sunsetMs = sunset;
    S.daylightKm = daylightLimitKm(sunset, Date.now(), Math.max(12, S.record?.avgSpeed || 18));
  } catch {
  }
}
async function applyNightMode() {
  try {
    if (S.nightModeApplied) return;
    const p = S.pos || S.waypoints?.[0];
    if (!p) return;
    if (!Number.isFinite(S.sunsetMs)) S.sunsetMs = await fetchSunset(p[1], p[0]);
    if (!Number.isFinite(S.sunsetMs)) return;
    if (Date.now() < S.sunsetMs) return;
    S.nightModeApplied = true;
    if (!localStorage.getItem("theme")) document.documentElement.dataset.theme = "dark";
    const night = "mapbox://styles/mapbox/navigation-night-v1";
    if (!String(map.getStyle?.()?.sprite || "").includes("navigation-night")) {
      map.setStyle(night);
      map.once("style.load", () => {
        if (S.route) {
          clearLines();
          line("chosen", S.route.geometry, colors[(S.selected || 0) % colors.length], 8);
        }
      });
    }
    toast("Night mode on for the ride home");
  } catch (error) {
    console.warn("Night mode skipped", error);
  }
}
function adventureRangeKm() {
  const lo = $("#distanceMin"), hi = $("#distanceMax");
  if (lo && hi) return { minKm: +lo.value, maxKm: +hi.value };
  if (S.adventureRange && Number.isFinite(S.adventureRange.minKm)) return { minKm: Math.max(3, S.adventureRange.minKm), maxKm: Math.max(6, S.adventureRange.maxKm) };
  return { minKm: 20, maxKm: 70 };
}
//# sourceMappingURL=app.js.map
