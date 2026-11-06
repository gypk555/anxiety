// Renders the app icons from one design. Run: npm run icons -w @anxiocare/web
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
await mkdir(`${pub}icons`, { recursive: true });
const svg = await readFile(`${pub}icon.svg`, 'utf8');

// Full-bleed square, with the artwork pulled inside the 80% maskable safe zone.
const squareArt = (scale) =>
  svg
    .replace('rx="112"', 'rx="0"')
    .replace(/<g fill="none"[\s\S]*<\/svg>/, (art) => {
      const inner = art.replace('</svg>', '');
      const t = (512 * (1 - scale)) / 2;
      return `<g transform="translate(${t} ${t}) scale(${scale})">${inner}</g></svg>`;
    });

const render = (source, size, name) =>
  sharp(Buffer.from(source), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(`${pub}icons/${name}`);

await render(svg, 192, 'icon-192.png');
await render(svg, 512, 'icon-512.png');
await render(squareArt(0.72), 512, 'maskable-512.png');
await render(squareArt(0.86), 180, 'apple-touch-180.png');
console.log('icons written to public/icons');
