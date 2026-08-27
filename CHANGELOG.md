# Handry Outlook Changelog

All future releases must add a dated entry at the top of this file. Entries must include Added, Changed, Fixed, Removed, Validation, and Known Limitations sections, even when a section contains “None”.

## v4.25, 27 August 2026

### Added
- Dual-handle Adventure distance range with independent minimum and maximum values.

### Changed
- Adventure recommendations are distributed across the selected distance range.

### Fixed
- Removed all visible “Screen awake” labels while retaining the Wake Lock.

### Removed
- Navigation and recording wake-lock status text.

### Validation
- Range interaction, generated target distribution, wake-lock text removal, syntax, regression, and ZIP checks.

### Known limitations
- Actual route distance can vary from its target because the cycling router follows available roads and paths.

## v4.24, 27 August 2026

### Added
- Progress-aware navigation route colours for overlapping roads.
- Navigation colour legend for next, later, far-future, and travelled route sections.

### Changed
- The next 1.25 km is fully opaque cyan; later route sections progressively fade.
- Travelled route sections become grey.

### Fixed
- Reduced ambiguity where a route uses the same road more than once.

### Removed
- None.

### Validation
- Route slicing, layer order, opacity stages, rerouting, cleanup, syntax, regression, and ZIP checks.

### Known limitations
- Very short overlapping sections may visually merge at low zoom levels.

## v4.23, 27 August 2026

### Added
- Two-stage Pause/Resume and End controls for recording and navigation.

### Changed
- End actions appear only after their corresponding process is paused.
- Pausing navigation leaves recording active; pausing recording leaves navigation available.

### Fixed
- Destructive End actions are no longer placed beside the default active controls.

### Removed
- Immediate Stop Recording and immediate End Navigation buttons from the default dashboard.

### Validation
- Pause, resume, end visibility, GPS accumulation, guidance suspension, syntax, regression, and ZIP checks.

### Known limitations
- Pausing navigation suppresses guidance and map following but keeps the GPS recorder running unless recording is separately paused.

## v4.22, 27 August 2026

### Added
- Undo Route Edit on Explore with a ten-edit history.
- Long-press/context-click Google Maps preview on routes and turn nodes.
- Units on elevation and wind graphs.

### Changed
- Journey route actions are grouped in a collapsible More Route Actions menu.
- Live sharing is labelled Share Live Progression with an explanatory note.

### Fixed
- 3D preview now stops whenever another button, summary action, page, or route is selected.

### Removed
- None.

### Validation
- Preview cancellation, undo, long-press popup, menu, graph units, route sharing, and live progression checks.

### Known limitations
- Google Maps preview depends on Street View imagery at the selected coordinate.

## v4.21, 27 August 2026

### Added
- Canonical `FEATURE_INVENTORY.md` containing the complete current feature set.
- `RELEASE_CHECKLIST.md` for regression checking before every ZIP is produced.
- `CHANGELOG.md` as a permanent release-by-release update log.
- `verify_release.py` automated package and source checks.

### Changed
- Service-worker cache advanced to `handry-v4-21`.
- `README.md` now identifies the release-governance documents.

### Fixed
- Release contents are now monitored against an explicit feature baseline instead of relying on conversation history.

### Removed
- None.

### Validation
- Required-file verification.
- JavaScript and service-worker syntax checks.
- Manifest parsing.
- Feature-keyword regression checks.
- ZIP integrity test.

### Known limitations
- Runtime APIs such as Mapbox, Open-Meteo, RainViewer, Firebase, GPS, Web Share, Speech Synthesis, and Wake Lock still require compatible devices, permissions, HTTPS, and working external services.

## v4.20, 27 August 2026

### Added
- Local route saving, reopening, editing, deletion, navigation, and GPX export.
- Selected-route sharing through Firestore with portable-link fallback.
- Live journey creation, exact or approximate location publishing, invitations, viewer subscriptions, and Stop Sharing.

### Changed
- Saved Routes became a complete route-management area.

### Fixed
- Restored route sharing and live route progression that were absent from the supplied v4.18 source.

### Removed
- None.

### Validation
- Save, edit, delete, navigate, share, GPX, Firestore collections, live publishing, and viewer code checks.

### Known limitations
- Firestore rules must be configured for `shared_routes_v4` and `journeys_v4`.

## v4.19, 27 August 2026

### Added
- Multiple point-to-point waypoints.
- Visible navigation location marker with heading arrow.
- Animated 3D route preview.
- Google Maps Street View preview.
- Arrival detection and full navigation-state cleanup.

### Changed
- Stop Recording also ends the associated navigation session.

### Fixed
- Stale navigation guidance after navigation ended.
- Turn nodes remaining visible during navigation.

### Removed
- Lane-selection hints.

### Validation
- Waypoint, location-marker, preview, cleanup, arrival, syntax, and package checks.

### Known limitations
- Google Street View depends on imagery existing at the selected route point.

## v4.18 and earlier

Earlier feature history is preserved in `FEATURES.md`. `FEATURE_INVENTORY.md` is now the canonical current-state checklist, while this changelog is the canonical history from v4.19 onward.
