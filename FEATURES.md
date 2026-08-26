# Handry Outlook Feature Register

**Build:** v3.1  
**Updated:** 26 August 2026  
**Purpose:** This file is updated with every build so deployed packages always contain a current feature and change register.

## Navigation and layout
- Responsive desktop navigation rail and mobile bottom navigation.
- Wider desktop planning panel for side-by-side elevation and wind graphs.
- Explore, Plan, Routes, Activities, Record, Weather, Friends, and Profile areas.
- Switchable Mapbox Outdoors, Streets, Satellite Streets, Navigation Day, and Navigation Night styles.

## Planning
- Mapbox cycling alternatives with route-specific elevation and wind enrichment.
- Elevation preview and wind-component preview before route selection.
- Chill, Normal, and Harsh ride intensities derived from the lower quartile, median, and upper quartile of the rider's recorded average speeds.
- Each route alternative is independent. Dragging a turn node reshapes only the selected route and leaves the other alternatives unchanged.
- Start and destination markers are draggable.
- Imported GPX support.
- Animated 3D camera preview plus external street-level preview.
- Default route names use the selected start and destination names, such as “London Waterloo to Richmond Park”.

## Saved routes and collaboration
- Save, edit, and navigate saved routes.
- Create a unique Firestore-backed route link containing the selected recommended path.
- Tag friends on a saved route without requiring the tagged friend to record an activity.
- Invite a friend to the same live journey and route.

## Live journeys
- Firestore-backed journey document with route geometry serialized as JSON, avoiding unsupported nested arrays.
- Continuously updated rider location.
- Journey viewer link with route and live position.
- Participant and invitation fields.

## Activities
- Activities are separate from the Record page.
- Rename activities.
- Analyse speed, elevation, route wind, and slope percentage.
- Distance, elapsed time, elevation gain, and average speed summaries.
- Social-media PNG export for routes and activities.
- Activity social preview card.

## Recording
- Live speed, distance, elapsed time, and elevation gain.
- Actual speed, actual elevation, and actual wind profiles.
- When following a planned route, predicted elevation and predicted wind are drawn as orange dotted overlays on the live profiles.

## Weather
- Current weather condition icon, temperature, feels-like temperature, wind, and hourly forecast.
- RainViewer radar overlay.
- Full-map canvas wind animation sized to the map container.
- Route wind profile previews.

## Changes in v3.1
- Increased desktop panel width.
- Fixed independent alternative-route editing.
- Added riding-intensity quartiles.
- Split Activities from Record.
- Fixed Firestore nested-array errors by serializing geometry.
- Fixed route-list click handling.
- Fixed full-map wind overlay sizing.
- Added weather condition symbols.
- Added planned prediction overlays during recording.
- Added navigate and edit actions to saved routes.
- Added unique route links.
- Added Mapbox style selection.
- Added animated 3D route preview.
- Added friend tagging and shared-journey invitations.

- Firestore nested arrays are avoided by JSON serialization.
