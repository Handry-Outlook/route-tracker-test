# Handry Outlook Feature Inventory

**Build:** v4.21  
**Inventory updated:** 27 August 2026  
**Purpose:** This is the canonical checklist for every release. Before packaging a new build, each feature below must be checked against the application source and marked in `RELEASE_CHECKLIST.md`.

## 1. Application and installation

- Responsive desktop navigation rail and mobile bottom navigation.
- Installable Progressive Web App through `manifest.json`.
- Offline application-shell caching through the service worker.
- Handry Outlook application icon and branding.
- Versioned service-worker cache to prevent older builds remaining active.
- Screen Wake Lock during recording and navigation, including foreground reacquisition and release after recording.

## 2. Map and display

- Mapbox map with zoom and compass controls.
- Recenter map to current GPS location.
- Selectable Outdoors, Streets, Satellite Streets, Navigation Day, and Navigation Night map styles.
- Desktop and mobile responsive layouts.
- Colour-coded alternative routes displayed together.
- Direct route selection by clicking or tapping a route on the Explore map.
- Selected-route isolation and Show All Routes action.
- Visible live-location marker with heading arrow while navigating.
- Display recorded activity routes on the map.

## 3. Point-to-point route planning

- Searchable Start location.
- Searchable Finish location.
- Current-location control for Start and Finish.
- Address-first reverse geocoding for current location.
- Add and remove multiple intermediate waypoints.
- Ordered routing through all valid waypoints.
- Automatic route calculation when required endpoints are available.
- Multiple recommended route alternatives.
- Show More Options action.
- Route cards colour-matched to map routes.
- Route distance, duration, elevation gain, cycle-route cues, elevation profile, and wind profile.

## 4. Adventure route planning

- Loop routes beginning and ending at the chosen location.
- Current-location start and finish.
- Distance target control.
- Balanced, scenic, landmark, food, and known-cycle-route preferences.
- Multiple Adventure alternatives.
- Considered points of interest shown as gold stars.
- Preference for cycleways, National Cycle Network references, greenways, trails, towpaths, and shared paths.
- Loop-preserving turn-node editing.
- Automatic rejection and restoration when an edit would collapse a loop.

## 5. Route editing and previews

- Draggable turn nodes before navigation.
- Turn nodes hidden once navigation begins.
- Editing changes only the selected route.
- Animated 3D Mapbox route preview.
- External Google Maps Street View preview.
- Elevation and wind previews before route selection.

## 6. Saved routes

- Save selected route with a custom or generated name.
- Store geometry, waypoints, location names, route mode, distance, and elevation.
- Open saved route.
- Edit saved route.
- Delete saved route.
- Navigate saved route.
- Share saved route.
- Export selected or saved route as GPX.

## 7. Route sharing and live journeys

- Share the exact selected route through Firestore when available.
- Portable encoded-link fallback when Firestore sharing is unavailable.
- Load a shared route without requiring an account.
- Start a Firestore-backed live journey when signed in.
- Publish the rider location continuously while recording.
- Exact and approximate live-location privacy modes.
- Copy live link.
- Invite friends through the native share sheet.
- Stop live sharing.
- Viewer subscription to route progression and current rider position.
- Viewers do not need to record an activity.
- Firestore collections: `shared_routes_v4` and `journeys_v4`.

## 8. Navigation

- Navigation and Record Now action for one selected route.
- Live turn instruction, next-turn distance, remaining distance, and estimated remaining time.
- Turn-direction symbols.
- Lane-selection hints intentionally disabled.
- Spoken guidance at advance, near-turn, and immediate-turn distances.
- Voice announcement for route recalculation and arrival.
- Off-route detection with sustained-deviation threshold and cooldown.
- Route recalculation from current location to destination.
- Guidance visible only on Explore while navigation is active.
- Guidance cleared on Stop Recording, End Navigation, and arrival.
- Arrival detection near the route destination.

## 9. Ride recording

- Start recording independently or with navigation.
- Current speed, average speed while paused, distance, elevation gain, and moving time.
- Automatic pause after more than ten seconds without meaningful movement.
- Automatic resume after movement.
- GPS samples with position, time, speed, elevation, wind, grade, and estimated power.
- Stop Recording and End Navigation controls.
- Completed-ride naming workflow.
- Default activity name based on Start and Finish.

## 10. Activity library and analysis

- Activity cards with cover photo or route placeholder.
- Name, distance, average speed, elevation gain, and effort score.
- Sort by date, distance, elevation gain, speed, and effort in either direction.
- Rename saved activities.
- Display saved activity route on the map.
- Speed profile.
- Elevation profile.
- Historical wind profile from recorded samples.
- Estimated-power profile.
- Distance, moving time, average speed, maximum speed, elevation gain, effort score, average watts, and watts per kilogram.
- Up to six compressed photos per activity.
- Add photos before or after saving.
- Remove or replace photos.
- Native activity sharing.
- Portrait social-media PNG export.

## 11. Rider profile and performance estimates

- Rider weight.
- Rider height.
- Bicycle and equipment weight.
- Estimated cycling power using speed, grade, wind, rolling resistance, aerodynamic drag, and total mass.
- Estimated watts per kilogram.
- Independent effort score using estimated power, duration, distance, and climbing.
- Clear disclaimer that power and effort are estimates, not calibrated power-meter or medical measurements.

## 12. Weather

- Current temperature and condition symbol.
- Current wind and gust speed.
- Hourly temperature and condition symbols.
- RainViewer radar overlay.
- Animated wind particles.
- Multi-point spatial wind grid covering the visible map bounds.
- Local wind-vector interpolation across the viewport.
- Wind-grid refresh after pan, zoom, and resize.

## 13. Authentication

- Firebase Google popup sign-in.
- Email and password sign-in inside the Home Screen app.
- Account creation.
- Password reset.
- Persistent authentication using IndexedDB with browser-local fallback.
- Logout.
- Clear error messages for invalid credentials, blocked popups, cancelled popup, and unauthorised domains.

## 14. Known deployment requirements

- Serve through HTTPS or localhost.
- Enable Email/Password and Google providers in Firebase Authentication.
- Add the deployed domain to Firebase Authentication authorised domains.
- Configure Firestore rules for shared route and live journey collections.
- Clear older service workers and site data when testing a newly deployed build.
- Screen Wake Lock can still be refused by the operating system under Low Power Mode or critical battery conditions.
