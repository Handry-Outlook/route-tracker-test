# Handry Outlook Changelog

All future releases must add a dated entry at the top of this file. Entries must include Added, Changed, Fixed, Removed, Validation, and Known Limitations sections, even when a section contains “None”.

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
