// Runtime configuration, supplied at build time from .env (see scripts/env.mjs).
//
// Nothing here is a literal any more: the repository is public, and a key
// committed once stays in git history even after it is deleted. Copy
// .env.example to .env and fill it in; the build injects the values.
//
// Be clear about what that does and does not achieve. The Mapbox token and the
// Firebase web config are sent by the browser and are therefore readable in the
// built bundle by design — they are secured by URL-referrer restrictions and
// Firestore rules, not by being hidden. Keeping them out of source stops them
// entering git history and lets each checkout use its own project.

/* Declared by esbuild's define; these identifiers never reach the browser. */
/* global __MAPBOX_TOKEN__, __FIREBASE_CONFIG__, __X_WEATHER_ID__, __X_WEATHER_SECRET__ */

const read = (value, fallback) => (typeof value === 'undefined' ? fallback : value);

export const MAPBOX_TOKEN = read(__MAPBOX_TOKEN__, '');

export const firebaseConfig = read(__FIREBASE_CONFIG__, {});

/**
 * Xweather is optional and OFF unless credentials are supplied.
 *
 * Its secret cannot be protected in a browser app — whatever the build does, it
 * is visible in the shipped bundle to anyone who opens devtools. So it is not
 * shipped. src/weather-api.js already falls back to Open-Meteo, which needs no
 * key and returns the same fields (wind, gusts, temperature, humidity,
 * precipitation, hourly forecast), so nothing is lost by leaving these blank.
 *
 * To use Xweather in production, proxy the request through a small serverless
 * function that holds the secret and forwards the result.
 */
export const X_WEATHER_ID = read(__X_WEATHER_ID__, '');
export const X_WEATHER_SECRET = read(__X_WEATHER_SECRET__, '');
