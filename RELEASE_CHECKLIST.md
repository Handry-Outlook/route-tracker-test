# Handry Outlook Release Checklist

Complete this checklist before producing every release ZIP. Do not publish a ZIP if a required item is unchecked or an automated check fails.

## A. Versioning and package integrity

- [ ] Increment the build number in `FEATURE_INVENTORY.md`.
- [ ] Add a new dated entry to `CHANGELOG.md`.
- [ ] Update `FEATURES.md` with the latest release summary.
- [ ] Update the version in `README.md`.
- [ ] Change the service-worker cache name.
- [ ] Verify `manifest.json` parses correctly.
- [ ] Verify all required files exist.
- [ ] Run `node --check app.js`.
- [ ] Run `node --check sw.js`.
- [ ] Run `python verify_release.py`.
- [ ] Run a ZIP integrity test.

## B. Planning and map regression

- [ ] Point-to-point Start and Finish search work.
- [ ] Current-location buttons populate an address.
- [ ] Multiple waypoints can be added, ordered, removed, and routed.
- [ ] Alternative routes appear together and are colour coded.
- [ ] A route can be selected directly on Explore.
- [ ] Adventure loops generate and remain loops after editing.
- [ ] Elevation and wind profiles appear.
- [ ] Map style selection works.
- [ ] 3D preview works.
- [ ] Google Maps preview opens.

## C. Saved route and sharing regression

- [ ] Selected route can be saved.
- [ ] Saved route can be reopened.
- [ ] Saved route can be edited.
- [ ] Saved route can be deleted.
- [ ] Saved route can be navigated.
- [ ] Route can be shared by link.
- [ ] Shared route opens without an account.
- [ ] GPX export downloads a valid track.
- [ ] Live journey starts for a signed-in user.
- [ ] Exact and approximate privacy modes work.
- [ ] Live link copy and invitation work.
- [ ] Viewer receives position updates.
- [ ] Stop Sharing closes the live session.

## D. Navigation and recording regression

- [ ] Navigation marker shows location and heading.
- [ ] Turn instruction and distances update.
- [ ] Voice guidance works after user interaction.
- [ ] Off-route recalculation works.
- [ ] Turn nodes are hidden during navigation.
- [ ] Guidance hides on other tabs.
- [ ] Stop Recording clears navigation guidance.
- [ ] End Navigation clears navigation guidance.
- [ ] Arrival clears navigation guidance.
- [ ] Wake Lock is requested and released correctly.
- [ ] Auto-pause and resume work.

## E. Activity regression

- [ ] Completed ride opens the naming editor.
- [ ] Default Start-to-Finish name is present.
- [ ] Up to six photos can be added.
- [ ] Photos can be added and removed after saving.
- [ ] Activity can be renamed.
- [ ] Activity route appears on the map.
- [ ] Speed, elevation, wind, and power profiles render.
- [ ] Effort and power estimates are displayed with disclaimers.
- [ ] Sorting works in both directions.
- [ ] Native sharing works or clipboard fallback is used.
- [ ] Social PNG exports successfully.

## F. Account, weather, and mobile regression

- [ ] Email sign-in, account creation, reset, and logout work.
- [ ] Google popup sign-in works where browser support permits.
- [ ] Home Screen app retains email authentication.
- [ ] Weather conditions and hourly forecast load.
- [ ] Radar displays.
- [ ] Wind field covers the visible map and changes spatially.
- [ ] Mobile bottom navigation does not overflow.
- [ ] Navigation controls do not cover weather, recenter, style, or zoom controls.
