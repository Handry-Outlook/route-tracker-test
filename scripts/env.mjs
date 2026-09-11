// Loads .env for the build, with no dependency.
//
// The repository is public, so no key may live in tracked source. Values are
// read here and handed to esbuild as compile-time constants, which keeps
// src/config.js free of literals while the bundle still gets what it needs.
//
// This is not a secrecy mechanism for the browser: anything the client must
// send to an API ends up readable in dist/app.js no matter how it got there.
// It keeps credentials out of git history — which is the part that is
// permanent — and lets each checkout supply its own. A value that genuinely
// must stay secret has to move behind a server-side proxy instead; see
// X_WEATHER_SECRET in .env.example.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const KEYS = ['MAPBOX_TOKEN', 'FIREBASE_CONFIG', 'X_WEATHER_ID', 'X_WEATHER_SECRET'];

function parse(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip one layer of matching quotes, so JSON values can be quoted safely.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnv(root) {
  const file = join(root, '.env');
  const fromFile = existsSync(file) ? parse(readFileSync(file, 'utf8')) : {};
  const env = {};
  for (const key of KEYS) {
    // A real environment variable wins, so CI can supply values without a file.
    env[key] = process.env[key] ?? fromFile[key] ?? '';
  }
  if (!env.MAPBOX_TOKEN) {
    console.warn('\n  ! MAPBOX_TOKEN is empty — the map will not load.');
    console.warn('    Copy .env.example to .env and fill it in.\n');
  }
  return env;
}

/** esbuild define map. Every key is always defined so config.js can read it. */
export function defineFor(env) {
  let firebase = {};
  if (env.FIREBASE_CONFIG) {
    try { firebase = JSON.parse(env.FIREBASE_CONFIG); }
    catch { console.warn('  ! FIREBASE_CONFIG is not valid JSON — sign-in will be unavailable.'); }
  }
  return {
    __MAPBOX_TOKEN__: JSON.stringify(env.MAPBOX_TOKEN),
    __FIREBASE_CONFIG__: JSON.stringify(firebase),
    __X_WEATHER_ID__: JSON.stringify(env.X_WEATHER_ID),
    __X_WEATHER_SECRET__: JSON.stringify(env.X_WEATHER_SECRET),
  };
}
