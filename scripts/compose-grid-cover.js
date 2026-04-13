#!/usr/bin/env node
/**
 * Compose a 2x2 grid carousel cover image with a centered hook text overlay.
 * Matches the popular Instagram carousel format: 4 lifestyle photos arranged
 * in a grid with a big bold hook statement centered across them.
 *
 * Usage:
 *   node compose-grid-cover.js \
 *     --images photo1.png photo2.png photo3.png photo4.png \
 *     --output final.png \
 *     --hook "Best investments I've made in my 20s:"
 *
 * Optional:
 *   --width 1080                 (default: 1080)
 *   --height 1350                (default: 1350 — 4:5 ratio)
 *   --gap 0                      (default: 0 — no gap between cells)
 *   --font anton|bebas|inter     (default: inter — matches clean personal style)
 *   --position center|top|bottom (default: center)
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    width: 1080,
    height: 1350,
    gap: 0,
    font: 'inter',
    position: 'center',
    images: [],
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--output' && args[i + 1]) { opts.output = args[++i]; }
    else if (a === '--hook' && args[i + 1]) { opts.hook = args[++i]; }
    else if (a === '--width' && args[i + 1]) { opts.width = parseInt(args[++i], 10); }
    else if (a === '--height' && args[i + 1]) { opts.height = parseInt(args[++i], 10); }
    else if (a === '--gap' && args[i + 1]) { opts.gap = parseInt(args[++i], 10); }
    else if (a === '--font' && args[i + 1]) { opts.font = args[++i]; }
    else if (a === '--position' && args[i + 1]) { opts.position = args[++i]; }
    else if (a === '--images') {
      while (args[i + 1] && !args[i + 1].startsWith('--')) {
        opts.images.push(args[++i]);
      }
    }
  }
  if (opts.images.length !== 4 || !opts.output || !opts.hook) {
    console.error('Usage: node compose-grid-cover.js \\');
    console.error('  --images photo1.png photo2.png photo3.png photo4.png \\');
    console.error('  --output final.png \\');
    console.error('  --hook "Your hook text"');
    process.exit(1);
  }
  return opts;
}

const FONTS = {
  inter:  { family: 'Inter',      url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&display=swap', weight: 800 },
  anton:  { family: 'Anton',      url: 'https://fonts.googleapis.com/css2?family=Anton&display=swap', weight: 400 },
  bebas:  { family: 'Bebas Neue', url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap', weight: 400 },
};

function imageToDataUri(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error(`Image not found: ${abs}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(abs);
  const mime = (buf[0] === 0xFF && buf[1] === 0xD8) ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function compose(opts) {
  const { width, height, gap, font, position, images, hook, output } = opts;
  const fontSpec = FONTS[font] || FONTS.inter;
  const dataUris = images.map(imageToDataUri);

  const fontSize = Math.round(width * 0.068);
  const lineHeight = 1.08;

  const verticalTop = {
    center: '50%',
    top: '25%',
    bottom: '75%',
  }[position] || '50%';
  const verticalTransform = position === 'center'
    ? 'translate(-50%, -50%)'
    : 'translate(-50%, -50%)'; // all vertically centered around their anchor

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="${fontSpec.url}" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${width}px; height: ${height}px;
      position: relative; overflow: hidden;
      font-family: '${fontSpec.family}', -apple-system, 'SF Pro Display', sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .grid {
      position: absolute; inset: 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: ${gap}px;
      background: #000;
    }
    .cell {
      overflow: hidden;
      background: #000;
      min-width: 0; min-height: 0;
    }
    .cell img {
      width: calc(100% + 2px); height: calc(100% + 2px);
      margin: -1px;
      object-fit: cover; display: block;
    }
    .hook {
      position: absolute;
      top: ${verticalTop};
      left: 50%;
      transform: ${verticalTransform};
      width: 88%;
      text-align: center;
      color: white;
      font-size: ${fontSize}px;
      font-weight: ${fontSpec.weight};
      line-height: ${lineHeight};
      letter-spacing: -0.02em;
      text-shadow:
        0 2px 8px rgba(0,0,0,0.55),
        0 8px 32px rgba(0,0,0,0.45),
        0 0 2px rgba(0,0,0,0.60);
      z-index: 10;
    }
  </style>
</head>
<body>
  <div class="grid">
    <div class="cell"><img src="${dataUris[0]}" /></div>
    <div class="cell"><img src="${dataUris[1]}" /></div>
    <div class="cell"><img src="${dataUris[2]}" /></div>
    <div class="cell"><img src="${dataUris[3]}" /></div>
  </div>
  <div class="hook">${escapeHtml(hook)}</div>
</body>
</html>`;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: output, type: 'png' });
  await browser.close();

  console.log(`Saved: ${output}`);
}

function escapeHtml(s) {
  return s.replace(/[<>&'"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  })[c]);
}

const opts = parseArgs();
compose(opts).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
