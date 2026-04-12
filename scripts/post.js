#!/usr/bin/env node
/**
 * Instagram Post via Playwright + Chrome CDP
 * Uses your real browser session (no login, no cookies, no API keys).
 *
 * Usage:
 *   node post.js --photo <file.jpg> "caption"
 *   node post.js --reel <file.mp4> "caption"
 *   node post.js --video <file.mp4> "caption"
 *
 * Requires:
 *   - Chrome or Brave installed and logged into Instagram
 *   - Browser must be CLOSED before running (Playwright needs exclusive access)
 *   - First run: npm install in skill directory
 */

const path = require('path');
const fs = require('fs');
const { launchAndConnect, sleep, humanDelay } = require('./lib/browser');

async function uploadPost({ page, filePath, caption, isReel }) {
  console.error('[post] Opening Instagram...');
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await humanDelay(3000, 5000);

  // Check we're logged in
  const loginBtn = await page.$('input[name="username"]');
  if (loginBtn) {
    throw new Error('Not logged into Instagram. Log in manually in your Chrome/Brave browser first.');
  }

  console.error('[post] Clicking "Create" button...');
  // Try several selectors — Instagram rotates them
  const createSelectors = [
    'svg[aria-label="New post"]',
    'svg[aria-label="Nueva publicacion"]',
    'svg[aria-label="Crear"]',
    'svg[aria-label="Create"]',
    'a[href="#"][role="link"]:has(svg[aria-label*="ew post" i])',
  ];

  let clicked = false;
  for (const sel of createSelectors) {
    const el = await page.$(sel);
    if (el) {
      await el.click();
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    // Fallback — find it by text
    await page.click('text=/create|crear/i', { timeout: 5000 }).catch(() => {});
  }

  await humanDelay(1500, 2500);

  // If there's a dropdown (Post / Reel / Story / Live), click "Post" or "Reel"
  const menuTarget = isReel ? /reel/i : /post|publicacion/i;
  try {
    await page.click(`text=${menuTarget.source}`, { timeout: 3000 });
    await humanDelay(1000, 2000);
  } catch {
    // Sometimes the upload dialog opens directly
  }

  // Upload the file
  console.error(`[post] Uploading: ${filePath}`);
  const fileInput = await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 15000 });
  await fileInput.setInputFiles(filePath);
  await humanDelay(3000, 5000);

  // Click Next (may need 2-3 times: crop -> filter -> caption)
  for (let i = 0; i < 3; i++) {
    try {
      const nextBtn = await page.waitForSelector('button:has-text("Next"), button:has-text("Siguiente")', { timeout: 5000 });
      await nextBtn.click();
      await humanDelay(1500, 2500);
    } catch {
      break;
    }
  }

  // Add caption
  if (caption) {
    console.error('[post] Adding caption...');
    const captionArea = await page.waitForSelector('div[aria-label="Write a caption..."], div[aria-label*="caption" i], div[aria-label*="pie de foto" i], textarea[aria-label*="caption" i]', { timeout: 10000 });
    await captionArea.click();
    await humanDelay(300, 600);
    await page.keyboard.type(caption, { delay: 15 });
    await humanDelay(1000, 2000);
  }

  // Click Share
  console.error('[post] Clicking Share...');
  const shareBtn = await page.waitForSelector('button:has-text("Share"), button:has-text("Compartir")', { timeout: 10000 });
  await shareBtn.click();

  // Wait for upload to complete (Instagram shows "Your post has been shared")
  console.error('[post] Waiting for confirmation...');
  await page.waitForSelector('text=/post has been shared|tu publicacion se ha compartido|se compartio/i', { timeout: 120000 }).catch(() => {
    console.error('[post] (Timeout on confirmation text, but upload may still have succeeded)');
  });

  await humanDelay(2000, 3000);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage:');
    console.error('  node post.js --photo <file> "caption"');
    console.error('  node post.js --reel <file.mp4> "caption"');
    console.error('  node post.js --video <file.mp4> "caption"');
    console.error('  [--browser chrome|brave]');
    process.exit(1);
  }

  let mode = null;
  let filePath = null;
  let caption = '';
  let browserName = 'chrome';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--photo' && args[i + 1]) { mode = 'photo'; filePath = args[i + 1]; i++; }
    else if (args[i] === '--reel' && args[i + 1]) { mode = 'reel'; filePath = args[i + 1]; i++; }
    else if (args[i] === '--video' && args[i + 1]) { mode = 'video'; filePath = args[i + 1]; i++; }
    else if (args[i] === '--browser' && args[i + 1]) { browserName = args[i + 1]; i++; }
    else if (!caption) { caption = args[i]; }
  }

  if (!mode || !filePath) {
    console.error('Missing --photo, --reel, or --video with file path.');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  console.error(`[post] mode=${mode} file=${absPath} caption="${caption.slice(0, 60)}..."`);

  let cleanup;
  try {
    const session = await launchAndConnect(browserName);
    cleanup = session.cleanup;

    await uploadPost({
      page: session.page,
      filePath: absPath,
      caption,
      isReel: mode === 'reel',
    });

    console.log('');
    console.log(JSON.stringify({
      success: true,
      type: mode,
      file: absPath,
      caption: caption.slice(0, 200),
      timestamp: new Date().toISOString(),
    }, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (cleanup) await cleanup();
  }
}

main();
