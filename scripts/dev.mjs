import * as esbuild from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, defineFor } from './env.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const env = loadEnv(root);

const ctx = await esbuild.context({
  entryPoints: [join(root, 'src', 'main.js')],
  bundle: true,
  format: 'esm',
  outfile: join(root, 'app.js'),
  sourcemap: true,
  logLevel: 'info',
  define: defineFor(env),
});

await ctx.watch();

const { port } = await ctx.serve({ servedir: root });

console.log(`Dev server running at http://localhost:${port}`);
