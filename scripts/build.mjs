import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, defineFor } from './env.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const env = loadEnv(root);
const outdir = join(root, 'dist');

mkdirSync(outdir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [join(root, 'src', 'main.js')],
  bundle: true,
  format: 'esm',
  outfile: join(outdir, 'app.js'),
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  metafile: true,
  logLevel: 'info',
  define: defineFor(env),
});

// Copy static assets straight through. config.js and weather-api.js are
// bundled into app.js by esbuild (imported from src/), so they don't need
// separate copies here.
const staticFiles = ['index.html', 'styles.css', 'manifest.json', 'icon.png'];
for (const file of staticFiles) {
  copyFileSync(join(root, file), join(outdir, file));
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry), d = join(dest, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}
copyDir(join(root, 'weather-icons'), join(outdir, 'weather-icons'));

// Regenerate the service worker precache list from what actually got built,
// so it can never silently drift from the real dist/ output (see sw.js history).
const swSource = readFileSync(join(root, 'sw.js'), 'utf8');
const appShellFiles = ['./', './index.html', './styles.css', './app.js', './icon.png'];
const swOut = swSource.replace(
  /const APP_SHELL=\[[^\]]*\];/,
  `const APP_SHELL=${JSON.stringify(appShellFiles)};`
);
writeFileSync(join(outdir, 'sw.js'), swOut);

console.log('Build complete ->', outdir);
