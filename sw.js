self.addEventListener('fetch', (event) => {
    // Basic service worker to allow installation
    event.respondWith(fetch(event.request));
});
