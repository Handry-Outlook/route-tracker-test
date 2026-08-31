# Handry Outlook Feature Register

**Build:** v4.27  
**Updated:** 26 August 2026

## New in v4.18
- Activities support up to six photos, with add, replace/remove, rename, route-on-map, sharing and portrait social PNG export.
- Activity library sorting covers date, distance, elevation gain, average speed and effort in both directions.
- Rider weight, height and bike weight support estimated cycling power, W/kg and an effort score.
- Activity details include speed, elevation, wind and estimated-power profiles.
- Google popup sign-in can now be attempted directly from the installed Home Screen app, while persistent email/password login remains available as a fallback.
- Start and Finish geocoder dropdowns now use focus-controlled stacking and reserved vertical space, preventing the Finish field from covering Start suggestions.
- The “Navigation and record now” button is hidden immediately after navigation or recording starts.
- The same area switches to the live ride dashboard and Stop recording / End navigation controls.
- Navigation and ride recording request a Screen Wake Lock so the display does not dim or lock during hands-free cycling.
- Wake lock is reacquired automatically when the Home Screen app returns to the foreground.
- Wake lock is released when recording ends to avoid unnecessary battery drain.
- Home Screen email/password login remains available and persistent.
- Current location now prefers the nearest street address, such as “28 Shepherds Walk”, rather than a nearby station or landmark.
- Turn-node markers are removed when navigation starts.
- Navigation guidance appears only on Explore and hides on all other tabs.
- Navigation/recording dashboard leaves a right-side channel for weather and recenter controls.
- Route cards use the same colour as their map route.
- Point-to-point alternatives remain visible and selectable directly on Explore.
- Current-location controls now prefer a nearby recognisable POI, station, landmark, park, university, hospital, or shopping centre instead of displaying only “Current location”.
- Nearby candidates are distance-checked and scored, with reverse-geocoded address/locality fallback.
- Coloured recommended routes can now be selected directly on the Explore map.
- Route lines widen on hover and show a pointer cursor.
- Tapping a route isolates it, opens Explore, and reveals the Navigation and record now control.
- Added spoken turn guidance at advance, near-turn, and immediate-turn distances.
- Added off-route detection and cycling-route recalculation after sustained deviation.
- Completed rides now enter a naming and optional photo workflow before saving.
- Record page now includes activity preview cards and detailed speed, elevation, and historical wind profiles.
- Restored map-style selection.
- Repositioned Navigation and Record so it does not cover weather, recenter, or Mapbox zoom controls.
- Added live distance, elevation gain, current speed, average speed while paused, and moving time.
- Added 10-second automatic pause.
- Added Stop recording and End navigation controls.
- Added Google Maps-style top guidance with lane hints when supplied, road/street name, next-turn distance, remaining distance, and remaining time.
- Added Home Screen-safe Firebase email/password sign-in, account creation, password reset, persistent auth, and logout.
- Google sign-in no longer attempts a redirect flow. In standalone iOS/iPadOS mode, the app explains the storage-partition issue and recommends email sign-in or opening the site in Safari.
- Wind is now sampled across the complete visible map bounds using a multi-point spatial grid rather than one centre-point direction.
- Particle direction and speed are bilinearly interpolated across the viewport.
- The wind grid refreshes after pan and zoom, with denser geographic coverage when zoomed out.
- Dragging an Adventure turn node now preserves multiple anchors around the loop instead of recalculating as start → dragged point → start.
- Loop edits are rejected when the returned route loses closure, falls below 55% of the previous distance, or collapses most of its enclosed area.
- A rejected loop edit automatically restores the previous route.
- Adventure routing explicitly scores route steps for cycle-route cues including cycleways, NCN references, greenways, trails, towpaths, and shared paths.
- Adventure POI search includes national cycle routes, cycle trails, and greenways.
- Adventure route cards display an approximate cycle-route cue percentage.
- Selected adventure routes expose a dedicated **Navigate adventure route** action.
- A persistent green **Navigation and record now** button appears directly above the mobile bottom bar whenever exactly one route is selected on the map.
- The same quick action is centred above the map controls on desktop.
- Quick navigation opens Explore, starts GPS recording, and follows the selected route.


### New in v4.27
- Single-click Pause/Resume Recording and Navigation controls.
- Voice Guidance toggle beneath Weather with iPhone user-gesture speech unlock.
- Large heading arrow above a separate location dot.
- Four-second movement-heading smoothing, map bearing follow, unstable-heading zoom-out, and delayed wrong-way rerouting.
- Temporary manual zoom/pan with automatic camera return and immediate Recenter recovery.
- Clickable alternative routes with concise time or cycle-lane reasons.
- Active navigation state is restored after reopening; app resources and previously loaded route data are cached for offline use.
- iOS limitation documented: continuous GPS and speech cannot continue after the PWA is suspended or closed.
