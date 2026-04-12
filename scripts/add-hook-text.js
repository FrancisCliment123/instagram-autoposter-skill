#!/usr/bin/env node
/**
 * Overlay viral-style hook text on top of a generated image using Playwright.
 * Part of the nano-banana-photoreal skill's two-step text method.
 *
 * Usage:
 *   node add-hook-text.js --input <path> --output <path> --hook "<TEXT>"
 *   node add-hook-text.js --input slide.png --output final.png \
 *     --hook "This is what I'd do if I started investing with 0 again"
 *
 * Optional:
 *   --position top|middle|bottom  (default: top)
 *   --font impact|anton|bebas     (default: anton)
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { position: 'top', font: 'anton' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) { opts.input = args[++i]; }
    else if (args[i] === '--output' && args[i + 1]) { opts.output = args[++i]; }
    else if (args[i] === '--hook' && args[i + 1]) { opts.hook = args[++i]; }
    else if (args[i] === '--position' && args[i + 1]) { opts.position = args[++i]; }
    else if (args[i] === '--font' && args[i + 1]) { opts.font = args[++i]; }
  }
  if (!opts.input || !opts.output || !opts.hook) {
    console.error('Usage: node add-hook-text.js --input <path> --output <path> --hook "<TEXT>"');
    process.exit(1);
  }
  return opts;
}

const FONTS = {
  anton: { family: 'Anton', url: 'https://fonts.googleapis.com/css2?family=Anton&display=swap' },
  bebas: { family: 'Bebas Neue', url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap' },
  impact: { family: 'Impact', url: null }, // system font
};

const POSITION_TOP = {
  top:    { top: '8%',  transform: 'translate(-50%, 0)' },
  middle: { top: '50%', transform: 'translate(-50%, -50%)' },
  bottom: { top: '78%', transform: 'translate(-50%, 0)' },
};

async function renderHookOverlay({ input, output, hook, position, font }) {
  const inputAbs = path.resolve(input);
  if (!fs.existsSync(inputAbs)) {
    console.error(`Input file not found: ${inputAbs}`);
    process.exit(1);
  }

  // Read image dimensions from file (handles both PNG and JPEG)
  const buf = fs.readFileSync(inputAbs);
  const { w, h } = readImageDimensions(buf);

  // Inline as base64 data URI so Playwright never has file-access issues
  const mime = (buf[0] === 0xFF && buf[1] === 0xD8) ? 'image/jpeg' : 'image/png';
  const imgUrl = `data:${mime};base64,${buf.toString('base64')}`;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const pos = POSITION_TOP[position] || POSITION_TOP.top;
  const fontSpec = FONTS[font] || FONTS.anton;

  // Build the HTML with text overlay
  const fontLink = fontSpec.url
    ? `<link rel="stylesheet" href="${fontSpec.url}" />`
    : '';

  // Scale font size based on image dimensions (10% of width as a guide)
  const baseFontSize = Math.round(w * 0.08);
  const subtitleSize = Math.round(w * 0.04);

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  ${fontLink}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${w}px;
      height: ${h}px;
      position: relative;
      overflow: hidden;
      font-family: '${fontSpec.family}', 'Impact', 'Arial Narrow', sans-serif;
    }
    .bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    /* Optional subtle vignette at top for text readability */
    .scrim {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 45%;
      background: linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 100%);
      pointer-events: none;
    }
    .hook {
      position: absolute;
      top: ${pos.top};
      left: 50%;
      transform: ${pos.transform};
      width: 90%;
      text-align: center;
      color: white;
      font-size: ${baseFontSize}px;
      line-height: 1.02;
      letter-spacing: -0.01em;
      text-transform: uppercase;
      text-shadow:
        0 2px 6px rgba(0,0,0,0.45),
        0 6px 24px rgba(0,0,0,0.35);
      font-weight: 400;
    }
  </style>
</head>
<body>
  <img class="bg" src="${imgUrl}" />
  <div class="scrim"></div>
  <div class="hook">${escapeHtml(hook)}</div>
</body>
</html>`;

  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'networkidle' });

  // Wait for fonts if any
  await page.evaluate(() => document.fonts.ready);

  await page.screenshot({ path: output, type: 'png', omitBackground: false });
  await browser.close();

  console.log(`Saved: ${output}`);
}

function escapeHtml(s) {
  return s.replace(/[<>&'"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  })[c]);
}

function readImageDimensions(buf) {
  // PNG: starts with 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG: starts with FF D8
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i + 1];
      // SOFn markers (start of frame) contain dimensions
      if (marker >= 0xC0 && marker <= 0xCF &&
          marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      const segLen = buf.readUInt16BE(i + 2);
      i += 2 + segLen;
    }
  }
  throw new Error('Unsupported image format');
}

const opts = parseArgs();
renderHookOverlay(opts).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
