# Release Checklist
- [ ] Start from latest verified ZIP only.
- [ ] Increment folder, ZIP, README, inventory, changelog and service-worker versions.
- [ ] Run `node --check app.js` and `node --check sw.js`.
- [ ] Run `python verify_release.py`.
- [ ] Test map planning, Adventure, navigation, recording, activities, sharing, authentication and weather.
- [ ] Test ZIP integrity.
