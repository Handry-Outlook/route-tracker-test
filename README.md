# Ridewise v4.80

**Plan smarter. Ride better.**

Serve through HTTPS or localhost. Clear old site storage and unregister previous service workers before deployment. Review `FEATURES.md` for the current feature register.


## Home Screen authentication
Firebase redirect authentication can fail in storage-partitioned Home Screen browser sessions. This build uses persistent email/password authentication inside the installed PWA and popup-only Google authentication in a normal browser tab. Enable Email/Password and Google providers in Firebase Console, and add the deployed domain under Authentication > Settings > Authorized domains.


## Keep screen awake during navigation
The app requests a Screen Wake Lock when navigation or recording starts and releases it when recording ends. The wake lock requires HTTPS and may be refused by the operating system when Low Power Mode is active or battery conditions are critical.


Release governance files are included. Always use the latest verified ZIP as the next source.


### Xweather
Set `X_WEATHER_ID` and `X_WEATHER_SECRET` in `config.js` for development. Do not expose a production client secret in browser code; use a server-side proxy. If credentials are blank or Xweather fails, the app uses live Open-Meteo conditions.


CyclOSM tiles are best-effort and require visible OpenStreetMap/CyclOSM attribution. Overpass scoring can fall back to Directions step cues when the service is unavailable.
