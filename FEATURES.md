# Handry Outlook Feature Register

**Build:** v4.12  
**Updated:** 26 August 2026

## New in v4.12
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
