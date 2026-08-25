# Handry Outlook, clean rebuild

This is a new implementation and does not depend on the previous app.js, Aeris MapsGL, or Capacitor browser bundles.

## Run
Serve this folder over HTTPS or localhost. Do not open index.html directly from the filesystem.

## Main features
- Responsive left navigation on desktop and bottom navigation on phones
- Map exploration and current-location control
- Cycling route planning with alternatives
- Draggable waypoints and tap-to-add shaping points
- GPX import and bend-derived prompts
- Nearest-point joining for imported GPX navigation
- Saved route library
- Activity recording with speed, distance, elapsed time, average speed, elevation gain, and GPS samples
- Open-Meteo route forecast
- RainViewer precipitation radar
- Lightweight canvas wind animation without Aeris/WebGL shader dependencies
- Friend shortcuts and native sharing
- Google login/logout through the existing Firebase project
- PWA manifest and service worker

## Deployment notes
- Clear the old service worker and site storage before installing this build.
- Restrict the Mapbox token and Firebase keys to your production domains.
- RainViewer requires visible attribution and is intended for personal, educational, and small community use.
- Local routes, friends, and activities are stored in browser localStorage. Firebase login is currently used for identity and can be extended to cloud sync later.
