// Generates app icons from the MonMap logo SVG.
// Run: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRIMARY = '#0053A3';

// Geometry from the design (72-unit base)
function markPaths(strokeColor, fillColor, dotColor) {
  return `
    <circle cx="36" cy="30" r="22" fill="${fillColor}"/>
    <path d="M 30 43.2 Q 18.4 60.8 36 66 Q 53.6 60.8 42 43.2 A 22 22 0 0 0 30 43.2 Z" fill="${fillColor}"/>
    <circle cx="36" cy="30" r="14" stroke="${strokeColor}" stroke-width="1.6" stroke-opacity="0.35" stroke-linecap="round" stroke-dasharray="61.575 26.389" stroke-dashoffset="-6.597" fill="none"/>
    <circle cx="36" cy="30" r="7" fill="${dotColor}"/>
  `;
}

// Full app icon: blue rounded square with white pin centered.
// Stroke uses primary color so the contour ring is visible against the white body.
function appIconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 72 72">
    <rect width="72" height="72" rx="${72 * 0.22}" fill="${PRIMARY}"/>
    <g transform="translate(10.8 10.8) scale(0.7)">
      ${markPaths(PRIMARY, '#ffffff', PRIMARY)}
    </g>
  </svg>`;
}

// Adaptive icon foreground: transparent bg, blue mark with safe-zone padding (Android requires 66% safe area within 108dp)
function adaptiveForegroundSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 108 108">
    <g transform="translate(36 32) scale(0.5)">
      ${markPaths('#ffffff', '${PRIMARY}', '#ffffff'.replace('#ffffff', '#ffffff'))}
    </g>
  </svg>`;
}

// Splash: white bg, large centered logo
function splashSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 72 72">
    <rect width="72" height="72" fill="#ffffff"/>
    <g transform="translate(18 18) scale(0.5)">
      ${markPaths('#ffffff', PRIMARY, '#ffffff')}
    </g>
  </svg>`;
}

function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
    <rect width="72" height="72" rx="${72 * 0.22}" fill="${PRIMARY}"/>
    <g transform="translate(10.8 10.8) scale(0.7)">
      ${markPaths(PRIMARY, '#ffffff', PRIMARY)}
    </g>
  </svg>`;
}

async function render(svg, outPath, size) {
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  writeFileSync(outPath, buf);
  console.log('wrote', outPath);
}

async function main() {
  const out = join(root, 'assets');
  mkdirSync(out, { recursive: true });

  // App icon — 1024x1024
  await render(appIconSvg(1024), join(out, 'icon.png'), 1024);

  // Splash — 1242x1242 (Expo uses contain mode, just needs a centered transparent-style asset)
  await render(splashSvg(1242), join(out, 'splash-icon.png'), 1242);

  // Adaptive icon foreground — 1024x1024 with transparent bg (Android masks it)
  // Needs blue mark on transparent so the adaptiveIcon backgroundColor controls the bg.
  const adaptiveSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 108 108">
    <g transform="translate(36 32) scale(0.5)">
      <circle cx="36" cy="30" r="22" fill="${PRIMARY}"/>
      <path d="M 30 43.2 Q 18.4 60.8 36 66 Q 53.6 60.8 42 43.2 A 22 22 0 0 0 30 43.2 Z" fill="${PRIMARY}"/>
      <circle cx="36" cy="30" r="14" stroke="#ffffff" stroke-width="1.6" stroke-opacity="0.35" stroke-linecap="round" stroke-dasharray="61.575 26.389" stroke-dashoffset="-6.597" fill="none"/>
      <circle cx="36" cy="30" r="7" fill="#ffffff"/>
    </g>
  </svg>`;
  await render(adaptiveSvg, join(out, 'adaptive-icon.png'), 1024);

  // Favicon
  await render(faviconSvg(), join(out, 'favicon.png'), 256);
}

main().catch(e => { console.error(e); process.exit(1); });
