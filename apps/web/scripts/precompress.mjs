// Runs after `vite build`, so the service worker's precache list never sees these. Writes .br and .gz beside each
// text file in dist, for apps/api/src/static.ts to serve. Everything here is the same for every visitor and holds no
// user data, so length reveals nothing. API answers are never compressed: see apps/api/src/app.ts.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const COMPRESSIBLE = /\.(?:js|mjs|css|html|svg|webmanifest|json|txt)$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let files = 0;
for (const path of walk(root).filter((p) => COMPRESSIBLE.test(p))) {
  const raw = readFileSync(path);
  const br = brotliCompressSync(raw, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
  });
  const gz = gzipSync(raw, { level: 9 });
  // A copy that doesn't save anything isn't worth a read from disk.
  if (br.length < raw.length) writeFileSync(`${path}.br`, br);
  if (gz.length < raw.length) writeFileSync(`${path}.gz`, gz);
  files += 1;
}
console.log(`precompressed ${files} files`);
