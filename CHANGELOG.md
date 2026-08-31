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
