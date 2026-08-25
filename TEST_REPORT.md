# Automated test report

- JavaScript syntax checked with Node.
- Local module imports resolved.
- Static HTML duplicate IDs checked.
- Required page navigation targets checked.
- Required DOM IDs checked against JavaScript selectors.
- Previous Aeris MapsGL and Capacitor bundle references checked absent.
- Responsive desktop/mobile navigation rules checked.
- ZIP archive integrity checked.

Browser-only capabilities such as Mapbox rendering, geolocation, OAuth popups, weather APIs, and radar tiles require HTTPS, valid network access, and browser permissions during live deployment.

## Advanced feature recheck
- Alternative routes expose pre-selection elevation and wind previews.
- Elevation data is sampled along each route.
- Turn maneuvers create draggable map nodes.
- Activity speed graph and elevation-distribution view are present.
- Social-media PNG export is present with map, distance, duration and elevation profile.
- Firestore live journey creation, location updates, viewer subscription and stop controls are present.
- Weather overlay uses RainViewer radar plus an application-owned canvas wind layer.
