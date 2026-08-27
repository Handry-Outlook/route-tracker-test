# Handry Outlook v4.18
Serve through HTTPS or localhost. Clear old site storage and unregister previous service workers before deployment. Review `FEATURES.md` for the current feature register.


## Home Screen authentication
Firebase redirect authentication can fail in storage-partitioned Home Screen browser sessions. This build uses persistent email/password authentication inside the installed PWA and popup-only Google authentication in a normal browser tab. Enable Email/Password and Google providers in Firebase Console, and add the deployed domain under Authentication > Settings > Authorized domains.


## Keep screen awake during navigation
The app requests a Screen Wake Lock when navigation or recording starts and releases it when recording ends. The wake lock requires HTTPS and may be refused by the operating system when Low Power Mode is active or battery conditions are critical.


## Cloud sharing
Enable Firestore access for `shared_routes_v4` and `journeys_v4`. Authenticated users create live journeys; shared route and journey documents must be readable by link viewers.


## Release governance

- `FEATURE_INVENTORY.md` is the canonical current-feature inventory.
- `CHANGELOG.md` records every release change.
- `RELEASE_CHECKLIST.md` is the manual regression checklist.
- `verify_release.py` verifies required files and key feature implementations before packaging.
