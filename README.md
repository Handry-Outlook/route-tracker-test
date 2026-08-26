# Handry Outlook v3.1

Serve the directory over HTTPS or localhost. Clear the previous service worker, cache, and installed PWA before deployment.

See `FEATURES.md` for the continuously maintained feature register and build changelog.

## Firebase collections used
- `shared_routes_v3`
- `journeys_v3`

Firestore rules must permit the intended authenticated writes and shared-link reads. Route and journey geometries are stored as JSON strings because Firestore does not accept nested arrays.
