# Handry Outlook Feature Register

**Build:** v4.5  
**Updated:** 26 August 2026

## New in v4.5
- 3D preview continues while the map is manually dragged, zoomed, or rotated. The next preview frame resumes the route camera sequence.
- 3D preview still stops when another page, route, or non-preview panel action is selected.
- Adventure page no longer contains a Point-to-point mode button.
- Current-location buttons reverse-geocode coordinates and populate the visible location input with the location name.
- Mobile navigation uses a fixed seven-column layout and hides labels on very narrow screens to prevent overflow.
- Wind particles are brighter, longer, denser, and remain pointer-transparent.
- Point-to-point mode no longer shows distance or elevation filters.
- Point-to-point routes calculate automatically as soon as both endpoints are set.
- Point-to-point expansion is labelled “Show more options”.
- Adventure-mode navigation was removed from the point-to-point panel.
- Considered landmarks, scenic locations, and food stops are marked with gold stars on the map.
- Optional CyclOSM bicycle-route overlay highlights known cycling infrastructure and touring routes.
- Google login and logout restored in Profile.
- Full current and hourly weather dashboard restored, including weather symbols, radar, and wind animation.
- Point-to-point planning and Adventure planning are separate pages.
- Every location search box has a dedicated current-location button.
- Adventure mode can start and finish at either a searched location or the rider current location.
- Five routes are generated initially and drawn together using distinct colours.
- “Show 3 more routes” expands the comparison set.
- Clicking a route isolates it; “Show all” restores every colour-coded alternative.
- Adventure loop generator starts and finishes at current location while routing through different intermediate points to avoid an out-and-back path.
- Point-to-point mode remains available.
- Distance minimum/maximum and elevation-gain minimum/maximum sliders.
- Adventure recommendations score candidates against distance, elevation, scenic views, landmarks, and food-stop preferences.
- Elevation gain is displayed for every route and activity.
- Full-map wind canvas uses transparent strokes, clears every animation frame, does not intercept pointer events, and stops during map manipulation.
- Radar opacity reduced so base-map detail remains visible.
- Wider planning panel and full-width mobile charts.
- Draggable turn nodes reshape only the selected route.

## Existing features retained
- Route elevation and wind previews.
- GPX import.
- Map style selection.
- Saved routes and activity list.
- Weather radar.
- Mapbox cycling directions.
