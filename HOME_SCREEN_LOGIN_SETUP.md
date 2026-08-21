# iOS Home Screen Google Login setup

The included app uses Firebase redirect login when launched from an iOS Home Screen icon. Safari requires the Firebase auth helper to be same-site with the app.

## If using Firebase Hosting

1. Deploy the app to the same Firebase project as `route-planner-942bd`.
2. Use either `route-planner-942bd.web.app` or a custom domain connected to that Firebase Hosting project.
3. In `config.js`, set `authDomain` to the exact deployed host, without `https://` or a path.
4. In Firebase Console, open Authentication > Settings > Authorized domains and add that host.
5. In Google Cloud Console, add `https://YOUR_HOST/__/auth/handler` as an authorized redirect URI.
6. Delete the old Home Screen icon and Safari website data, open the site once in Safari, then add it to the Home Screen again.

## If using GitHub Pages or another host

Firebase redirect auth needs a same-site auth helper proxy or self-hosted helper. Merely changing `authDomain` is not sufficient. The simplest supported deployment is to host this build on Firebase Hosting.
