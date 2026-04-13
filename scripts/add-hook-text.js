#!/usr/bin/env node
/**
 * Overlay text on top of a generated image using Playwright.
 * Part of the nano-banana-photoreal skill's two-step text method.
 *
 * Two styles supported:
 *
 *   --style viral   → Big uppercase condensed (Anton/Impact), center-top,
 *                     drop shadow + scrim. For Instagram/TikTok hook reels.
 *                     Example: "HOW TO START INVESTING STEP BY STEP"
 *
 *   --style gallery → Clean editorial (Inter/SF Pro), left-aligned,
 *                     bold title + regular body, no shadow. For "personal
 *                     brand" carousel slides.
 *                     Example: "Health" + body paragraph
 *
 * Usage (viral):
 *   node add-hook-text.js --input slide.png --output final.png \
 *     --style viral --hook "HOW TO INVEST WITH 0 AGAIN"
 *
 * Usage (gallery):
 *   node add-hook-text.js --input slide.png --output final.png \
 *     --style gallery --hook "Health" \
 *     --body "Health isn't just about the gym. It's also about sleep, good food, and managing your stress levels."
 *
 * Optional (viral only):
 *   --position top|middle|bottom  (default: top)
 *   --font anton|bebas|impact     (default: anton)
 *
 * Optional (gallery only):
 *   --align left|center           (default: left)
 *   --title-position top|middle   (default: middle — vertical center of frame)
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    style: 'gallery',
    position: 'top',
    font: 'anton',
    align: 'left',
    titlePosition: 'top',
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--input' && next) { opts.input = next; i++; }
    else if (a === '--output' && next) { opts.output = next; i++; }
    else if (a === '--hook' && next) { opts.hook = next; i++; }
    else if (a === '--body' && next) { opts.body = next; i++; }
    else if (a === '--style' && next) { opts.style = next; i++; }
    else if (a === '--position' && next) { opts.position = next; i++; }
    else if (a === '--font' && next) { opts.font = next; i++; }
    else if (a === '--align' && next) { opts.align = next; i++; }
    else if (a === '--title-position' && next) { opts.titlePosition = next; i++; }
  }
  if (!opts.input || !opts.output || !opts.hook) {
    console.error('Usage: node add-hook-text.js --input <path> --output <path> --hook "<TITLE>"');
    console.error('         [--style viral|gallery] [--body "<BODY TEXT>"]');
    process.exit(1);
  }
  return opts;
}

const FONTS = {
  anton:  { family: 'Anton',      url: 'https://fonts.googleapis.com/css2?family=Anton&display=swap' },
  bebas:  { family: 'Bebas Neue', url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap' },
  impact: { family: 'Impact',     url: null },
  inter:  { family: 'Inter',      url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap' },
};

const VIRAL_POSITIONS = {
  top:    { top: '8%',  transform: 'translate(-50%, 0)' },
  middle: { top: '50%', transform: 'translate(-50%, -50%)' },
  bottom: { top: '78%', transform: 'translate(-50%, 0)' },
};

async function renderOverlay(opts) {
  const inputAbs = path.resolve(opts.input);
  if (!fs.existsSync(inputAbs)) {
    console.error(`Input file not found: ${inputAbs}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(inputAbs);
  const { w, h } = readImageDimensions(buf);
  const mime = (buf[0] === 0xFF && buf[1] === 0xD8) ? 'image/jpeg' : 'image/png';
  const imgUrl = `data:${mime};base64,${buf.toString('base64')}`;

  const html = opts.style === 'gallery'
    ? buildGalleryHtml({ ...opts, w, h, imgUrl })
    : buildViralHtml({ ...opts, w, h, imgUrl });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: opts.output, type: 'png' });
  await browser.close();

  console.log(`Saved: ${opts.output}`);
}

// ── VIRAL style (big uppercase Anton, center-top, drop shadow) ───────────────
function buildViralHtml({ w, h, imgUrl, hook, position, font }) {
  const pos = VIRAL_POSITIONS[position] || VIRAL_POSITIONS.top;
  const fontSpec = FONTS[font] || FONTS.anton;
  const fontLink = fontSpec.url ? `<link rel="stylesheet" href="${fontSpec.url}" />` : '';
  const baseFontSize = Math.round(w * 0.08);

  return `<!doctype html>
<html><head><meta charset="utf-8" />
${fontLink}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${w}px; height: ${h}px; position: relative; overflow: hidden;
    font-family: '${fontSpec.family}', 'Impact', 'Arial Narrow', sans-serif; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .scrim { position: absolute; top: 0; left: 0; right: 0; height: 45%;
    background: linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 100%);
    pointer-events: none; }
  .hook { position: absolute; top: ${pos.top}; left: 50%; transform: ${pos.transform};
    width: 90%; text-align: center; color: white; font-size: ${baseFontSize}px;
    line-height: 1.02; letter-spacing: -0.01em; text-transform: uppercase;
    text-shadow: 0 2px 6px rgba(0,0,0,0.45), 0 6px 24px rgba(0,0,0,0.35);
    font-weight: 400; }
</style></head>
<body>
  <img class="bg" src="${imgUrl}" />
  <div class="scrim"></div>
  <div class="hook">${escapeHtml(hook)}</div>
</body></html>`;
}

// ── GALLERY style (editorial Inter, left-aligned, bold title + body) ─────────
function buildGalleryHtml({ w, h, imgUrl, hook, body, align, titlePosition }) {
  const fontSpec = FONTS.inter;
  const fontLink = `<link rel="stylesheet" href="${fontSpec.url}" />`;

  // Title ~5.5% of width, body ~3% — matches the reference screenshots
  const titleSize = Math.round(w * 0.065);
  const bodySize  = Math.round(w * 0.033);

  // Vertical placement: middle = roughly 30% from top (upper-middle, above subject)
  // top = 10% from top
  const verticalTop = titlePosition === 'top' ? '10%' : '30%';

  // Horizontal placement
  const textAlign = align === 'center' ? 'center' : 'left';
  const horizontalLeft = align === 'center' ? '50%' : '8%';
  const translateX = align === 'center' ? '-50%' : '0';

  const bodyHtml = body
    ? `<div class="body">${escapeHtml(body)}</div>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8" />
${fontLink}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${w}px; height: ${h}px; position: relative; overflow: hidden;
    font-family: '${fontSpec.family}', -apple-system, 'SF Pro Display', 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .text-block {
    position: absolute;
    top: ${verticalTop};
    left: ${horizontalLeft};
    transform: translate(${translateX}, 0);
    width: 62%;
    text-align: ${textAlign};
    color: white;
  }
  .title {
    font-size: ${titleSize}px;
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.02em;
    margin-bottom: ${Math.round(titleSize * 0.35)}px;
  }
  .body {
    font-size: ${bodySize}px;
    font-weight: 400;
    line-height: 1.35;
    letter-spacing: -0.005em;
    opacity: 0.95;
  }
</style></head>
<body>
  <img class="bg" src="${imgUrl}" />
  <div class="text-block">
    <div class="title">${escapeHtml(hook)}</div>
    ${bodyHtml}
  </div>
</body></html>`;
}

function escapeHtml(s) {
  return s.replace(/[<>&'"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  })[c]);
}

function readImageDimensions(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i + 1];
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
renderOverlay(opts).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
