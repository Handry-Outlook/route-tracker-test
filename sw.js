const CACHE_NAME = 'handry-shell-v3';
const APP_SHELL = ['./', './index.html', './style.css', './app.js', './mobile-shell.js', './map-engine.js', './firebase.js', './geo-logic.js', './weather-api.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => {})));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE_NAME).then(c=>c.put(event.request,copy)); return response; }).catch(() => caches.match(event.request)));
});
