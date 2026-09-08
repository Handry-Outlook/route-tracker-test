// Entry point for the esbuild bundle.
//
// `legacy.js` is the pre-Phase-0 app.js moved verbatim (byte-for-byte) into
// src/ so the app has a build step without any behavior change yet. As each
// reform phase touches a section of this file, that section is extracted
// into a proper module (see src/ui, src/nav, src/routing, src/social) and
// removed from here — this file's job is to shrink over time, not grow.
import './legacy.js';
