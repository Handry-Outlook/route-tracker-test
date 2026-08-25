# Recheck report

- Pinned Mapbox GL JS 3.12.0 and Xweather MapsGL 1.9.4 to the versions used together in the vendor example.
- Removed duplicate recenter and navigation element IDs.
- Loaded Mapbox, Turf and MapsGL before application modules.
- Rebuilt Aeris controller lifecycle for map style changes.
- Added one guarded wind-particle layer instead of attempting multiple overlapping layers.
- Radar remains usable when wind particles are unsupported by a device GPU.
- Fixed the undeclared `usesNavigationStyle` runtime error.
- Revalidated JavaScript syntax, module imports/exports, duplicate HTML IDs, required DOM IDs and ZIP integrity.

- Removed the browser-incompatible Capacitor Text-to-Speech bundle that raised `capacitorExports is not defined`. Native Capacitor TTS is still detected at runtime; browsers use Web Speech.
- Made Plan, Routes and Weather activation deterministic without depending on application timing.
- Added an always-visible Account item to both desktop and mobile navigation for login/logout.
