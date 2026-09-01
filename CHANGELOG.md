### v4.80 - 1 September 2026

#### Fixed
- Corrected saveRouteByIndex to be asynchronous before awaiting account cloud storage.
- Resolves the browser parse failure: Unexpected reserved word at app.js line 112.
- Preserves waypoint baseline routing, unlimited Adventure routes, 3D preview and Firestore JSON payload encoding.

### v4.79 - 1 September 2026

#### Restored waypoint routing
- Restored shortest-baseline required-waypoint routing for examples such as Bristol → Weston-super-Mare → Bristol.
- Alternatives are ranked by kilometres above the shortest safe baseline and normally capped at 16% above baseline.
- Repeated access is allowed when it materially reduces distance.

#### Fixed
- Restored 3D route preview for active and saved routes.
- Removed the five-route and twelve-route Adventure caps. Explicit extra-route requests can keep adding routes.
- Firestore payloads now use a JSON string envelope, avoiding unsupported nested-array errors from route geometry, legs, waypoints, samples and profiles.

### v4.78 - 1 September 2026

#### Account-specific data
- Saved routes and completed activities are stored under the signed-in Firebase account.
- Route saving, GPX import, recording and activity saving require authentication.
- Account routes and activities synchronise from Firestore across signed-in devices.
- Offline account-specific caches are namespaced by Firebase UID.
- Signing out clears in-memory route and activity libraries.
- Legacy device-wide route and activity keys are removed to prevent cross-account visibility.
- Active ride recovery is bound to the account that started the ride.

### v4.77 - 1 September 2026

#### Calculate one more route guarantee
- Every explicit Calculate one more route action now tries up to eight additional full-route shapes.
- If normal quality and diversity filters reject every candidate, Ridewise relaxes repetition, distinctness and range preferences for that extra route only.
- Closure and motorway rejection remain mandatory.
- Extra fallback routes are clearly labelled Extra route · quality filters relaxed.
- Explicitly requested extra routes may resemble existing options rather than returning nothing.
- Up to twelve Adventure routes can remain visible.

### v4.76 - 1 September 2026

#### Restored and consolidated
- Restored the full saved-route card library lost in v4.75.
- Saved cards include distance, duration, climb, cycling cues, wind profile and elevation profile.
- Restored Open & edit, draggable route shaping, automatic persistence and manual Update saved route.
- Preserved corridor-loop recognition for narrow and elongated loops.
- Added six final availability fallback plans and relaxed only the final-stage diversity threshold to return more Adventure options.

### v4.71 - 1 September 2026

#### Fixed
- Restored routeOverlapRatio required by Adventure route diversity checks.
- Uses a bounded 36-point comparison against complete route geometry.
- Added declaration-order and single-definition regression checks.

### v4.70 - 1 September 2026

#### Corridor-led Adventure recommendations
- Searches for rivers, lakes, seaside locations, canals, greenways, cycle trails, railway paths, national cycle routes, parks and landmarks.
- Generates Balanced, Scenic and Established-path recommendations.
- Uses four ring points to reduce out-and-back branches.
- Rejects routes sharing more than 55% of sampled corridors.
- Rejects anonymous long dead-end spurs unless required by a user waypoint.
- Ranks named and recognised corridor routes above arbitrary geometry.
- Uses a second rotated destination set when fewer than three distinct routes survive.

### v4.69 - 1 September 2026

#### Destination-led Adventure routes
- Uses fast Mapbox POI searches for named viewpoints, parks, historic places, castles, lakes, nature reserves, museums and cafes.
- Adventure shaping points prefer named destinations instead of anonymous field coordinates.
- Balanced, Scenic and Easy-flow plans select different angular sectors and target distances.
- Routes sharing more than 68% of their sampled corridors are treated as duplicates.
- If fewer than three distinct routes survive, Ridewise tries a second set of bearings.
- Full geometry, full navigation steps, closure, repetition and motorway checks remain mandatory.

### v4.68 - 1 September 2026

#### Fixed
- Removed the expensive delayed detailed-repetition callback that blocked the main thread for about one second per route.
- A route that has already appeared is no longer removed by a later background quality pass.
- Adventure acceptance now uses only the bounded quick repetition and closure checks before publication.
- Removed unused delayed scenic-label sampling from the post-render path.

### v4.67 - 1 September 2026

#### Adventure performance rewrite
- Uses one primary full-route Mapbox request with alternatives enabled to obtain up to three loops.
- Only sends extra Scenic or Easy requests when the primary response returns fewer than three usable routes.
- Replaces blocking detailed repetition analysis with a bounded quick check before first display.
- Runs detailed repetition analysis after the full route is visible and removes a route only if the detailed check fails.
- Keeps full geometry and turn steps in every response.

### v4.66 - 1 September 2026

#### Fixed
- Removed all direct browser requests to public Overpass servers, including scenic-place discovery and cycling-infrastructure enrichment.
- Adventure no longer produces Overpass CORS, 502 or timeout errors.
- Route calculation no longer depends on third-party POI discovery.
- Balanced, Scenic and Easy route shapes continue using full Mapbox cycling geometry and steps.

#### Architecture
- Future community/scenic place discovery should use a same-origin Ridewise backend or serverless proxy with caching, rate limits and CORS headers.

### v4.65 - 1 September 2026

#### Restored long-press location actions
- Added View in Google Maps.
- Added View in Google Maps 3D with satellite and tilt parameters where supported.
- Added Copy coordinates with clipboard and prompt fallback.
- Kept Navigate there and Add as waypoint.
- Actions work from desktop right-click and mobile long-press.

### v4.64 - 1 September 2026

#### Performance
- Three Adventure requests still start together, but each valid route is published immediately when its own request finishes.
- The interface no longer waits for all three route requests before showing the first recommendation.
- Mapbox alternatives are disabled because Ridewise already sends three purpose-built plans.
- Per-route timeout reduced to 5.2 seconds.
- Scenic place discovery remains entirely non-blocking.

### v4.63 - 1 September 2026

#### Performance
- Adventure routing starts immediately and no longer waits for Overpass.
- Scenic-place discovery runs as a non-blocking enhancement with a 1.2-second result budget.
- Both Overpass endpoints run concurrently instead of sequentially.
- Overpass server timeout reduced to 3 seconds and browser timeout to 3.5 seconds.
- Reliable full-geometry loop plans are used immediately; nearby discovered places label routes afterward.
- Scenic POIs are used for a second routing attempt only if immediate plans yield no clean loops.

### v4.62 - 1 September 2026

#### Fixed
- Restored fastDirections after the meaningful Adventure refactor.
- Added an explicit regression check that the function is declared before Adventure is used.

#### Adventure
- Discovers viewpoints, parks, water, historic places, attractions, cafes and route markers.
- Connects selected places as full cycling loops with full geometry and steps.
- Produces Balanced, Scenic and Easy recommendations.
- Rejects open loops, motorways and excessive repetition.

### v4.60 - 1 September 2026

#### Adventure
- Strictly rejects open routes, excessive repeated corridors and long out-and-back branches for no-waypoint loops.
- Allows more overlap only for required-waypoint access.

#### Recovery and offline navigation
- Persists active recording and navigation sessions.
- Restores route, steps, recording samples, current instruction and pause state after app termination.
- Offers Resume, Save partial activity or Discard on reopen.
- Continues stored-route GPS guidance offline and disables rerouting until connectivity returns.

#### Added
- Saved-route Rename control.
- Current-location heading marker.

### v4.57 - 31 August 2026

#### Fixed
- Restored groupHourlyByDay used by the redesigned weather forecast.
- Added invalid-hour filtering and a four-day display limit.
- Added a regression check ensuring the helper is declared before weather rendering.

### v4.56 - 31 August 2026

#### Weather redesign
- Added Xweather WeatherBlox condition icons for current and hourly forecasts.
- Added day/night icon mapping for Open-Meteo fallback data.
- Rebuilt current conditions as a gradient hero card with condition, feels-like, wind, gust and rain metrics.
- Rebuilt hourly cards with weather icons, wind-direction arrows and coloured rain probability.

### v4.55 - 31 August 2026

#### Rebuilt Adventure recommendations
- Adventure now calculates three complete routes initially.
- Waypoint routes use the direct corridor plus two small left/right corridor variations, not unrelated city-wide shaping anchors.
- Candidate routes more than 8% above the maximum and more than 12% longer than the shortest valid waypoint route are removed.
- Long eastern or scenic detours are therefore suppressed when a practical shorter return exists.
- All initial routes use full geometry and turn steps.

### v4.54 - 31 August 2026

#### Fixed
- Adventure no longer retains distant shaping anchors after the route has exceeded the selected maximum.
- Oversized loops are retried once with a proportionally reduced radius.
- Required-waypoint rides use only start → waypoint(s) → start and do not add unrelated eastern or scenic anchors.
- M-road crossings mentioned in instructions no longer falsely count as riding on a motorway.
- Full-geometry edit markers are capped at 24 sampled controls instead of one marker per coordinate.

### v4.53 - 31 August 2026

#### Changed
- Adventure now requests full GeoJSON route geometry in the first Directions response.
- Adventure now requests turn-by-turn steps in the first Directions response.
- Removed the initial simplified-geometry request and redundant background route hydration request.

#### Fixed
- Direction arrows, repetition analysis, motorway safety checks, distance analysis and navigation now use the complete recommended route from the first response.

### v4.52 - 31 August 2026

#### Fixed
- Restored the routeSafetyAndDirectness and hasMotorway helpers required by Adventure scoring and navigation.
- Added explicit regression checks that every referenced routing-safety helper is declared exactly once.

### v4.51 - 31 August 2026

#### Performance
- Replaced the quadratic Adventure overlap scan on the first route with a bounded linear-time spatial hash.
- First-pass quality checks sample at most about 180 route positions instead of comparing every sample with every earlier sample.
- Detailed repetition analysis now runs after the route is already visible.
- Route geometry is no longer held back by expensive local quality calculations.

### v4.50 - 31 August 2026

#### Performance
- First Adventure request returns lightweight simplified geometry without turn steps.
- Turn instructions hydrate in the background after the route is visible.
- Initial loop uses two shaping anchors instead of three.
- Planning GPS uses a cached position, a 1.8-second timeout and map-centre fallback.
- Initial Directions timeout reduced to 3 seconds.

### v4.49 - 31 August 2026

#### Performance
- Adventure now makes exactly one primary routing request before showing the first route.
- Extra alternatives calculate only when the rider presses Calculate one more route.
- First route uses three shaping anchors and a 4.2-second request timeout.
- Required-waypoint rides calculate the direct start → waypoint → start route first.

#### Preserved and improved
- Mid-navigation optional routes remain visible as dashed alternatives with direction arrows.
- Selecting an alternative mid-navigation switches guidance immediately and shows the time or distance trade-off.
- Motorway-containing alternatives are not offered.

### v4.48 - 31 August 2026

#### Performance
- Required waypoints now calculate the direct return first and display it before alternatives.
- Normal Adventure calculates one candidate first, then only three background alternatives.
- Reduced initial routing requests from eight to four.
- Added a 6.5-second timeout per Directions request.
- Added a ten-minute cache for identical Adventure calculations.
- Reduced the final recommendation set to four routes.

### v4.47 - 31 August 2026

#### Changed
- When an Adventure waypoint is supplied, Ridewise now creates a direct start → waypoint → start candidate.
- Repeated access roads are accepted when they materially reduce the total waypoint journey distance.
- Efficient waypoint returns rank above longer non-repeating loops when within 18% of the competing route distance.

#### Added
- Clear Efficient waypoint return label and disclosure that repeated access is accepted to minimise distance.

### v4.46 - 31 August 2026

#### Changed
- If every Adventure candidate exceeds the selected maximum, Ridewise automatically runs a shorter-loop rescue pass.
- In-range routes rank first; otherwise the route with the smallest distance overflow ranks first.
- Distance above the selected maximum now receives a strong quality penalty.

#### Added
- Route-card disclosure showing how many kilometres a best-available route exceeds the range.

### v4.45 - 31 August 2026

#### Changed
- Route distance, duration and Directions-based cycling score are prepared before the first card render.
- Elevation and wind use compact loading rows instead of large empty graph panels.
- Public OSM infrastructure refinement starts 1.8 seconds after core route data and no longer blocks elevation or wind.

#### Fixed
- Removed the appearance that the whole route card was empty for around ten seconds.
- Ascent now displays an ellipsis while loading rather than an incorrect zero.

### v4.44 - 31 August 2026

#### Renamed
- Handry Outlook is now Ridewise.
- Tagline: Plan smarter. Ride better.

#### Added
- Small direction arrows along selected, alternative, imported, saved and Adventure routes.
- Motorway and motorway-link rejection before recommendation and navigation.
- Penalties for excessive crossings, road-side switching and detours made only for short cycleway segments.
- Immediate cycling estimate followed by optional OSM refinement.

#### Changed
- Adventure repetition is treated as a last resort and remains strongly penalised.
- App files, exports and PWA metadata use Ridewise branding.

# Changelog
## v4.31 - 31 August 2026
### Added
- GPX import in Routes.
- Per-card animation preview buttons and saved-route previews.
- Xweather current conditions module with real Open-Meteo fallback.
- Wind direction, mean wind, gust, feels-like temperature, humidity and observation time.
### Fixed
- Route cleanup now also removes every draggable route node.
- Route-card preview discoverability.
### Security
- Xweather credentials are optional; production should proxy the client secret server-side.

## v4.30 - 31 August 2026
### Fixed
- Rebuilt Adventure loop generation to reject routes with repeated roads and long out-and-back sections.
- Optional waypoints are now interleaved with loop-shaping anchors by bearing rather than placed before all loop anchors.
### Added
- 120 m sampled overlap analysis, compactness threshold, 24 candidate attempts, fallback widening, and route-shape deduplication.
### Known limitations
- Sparse road networks can still force limited overlap; the app now reports when no sensible loop is available rather than returning a poor route.

## v4.29 - 31 August 2026
### Added
- Consolidated rebuild from uploaded v4.28 source.
- Restored missing features from the full conversation baseline.
- Canonical inventory, checklist and automated verifier.
### Fixed
- Prevented future releases from silently dropping known feature groups.
### Known limitations
- iOS suspends PWA GPS and speech after the app is closed or locked. Guaranteed background navigation requires a native iOS app.
