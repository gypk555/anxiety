// Bundles the server. npm dependencies stay external (real node_modules at runtime); the workspace
// package is inlined because it ships TypeScript source.
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const externalizeNpm: Plugin = {
  name: 'externalize-npm',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.kind === 'entry-point' || args.path.startsWith('@anxiocare/')) return null;
      return { path: args.path, external: true };
    });
  },
};

await rm(join(root, 'dist'), { recursive: true, force: true });
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  plugins: [externalizeNpm],
  logLevel: 'info',
});
if (result.errors.length > 0) process.exit(1);
