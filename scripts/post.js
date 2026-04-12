#!/usr/bin/env node
/**
 * Instagram Post via Playwright + Chrome CDP
 * Uses your real browser session (no login, no cookies, no API keys).
 *
 * Usage:
 *   node post.js --photo <file.jpg> "caption"
 *   node post.js --reel <file.mp4> "caption"
 *   node post.js --video <file.mp4> "caption"
 *   node post.js --carousel "caption" file1.jpg file2.jpg file3.jpg ...
 *
 * Requires:
 *   - Chrome or Brave installed and logged into Instagram
 *   - Browser must be CLOSED before running (Playwright needs exclusive access)
 *   - First run: npm install in skill directory
 */

const path = require('path');
const fs = require('fs');
const { launchAndConnect, sleep, humanDelay } = require('./lib/browser');

async function uploadPost({ page, filePath, filePaths, caption, isReel, isCarousel }) {
  const files = isCarousel ? filePaths : [filePath];
  console.error('[post] Opening Instagram...');
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await humanDelay(3000, 5000);

  // Check we're logged in
  const loginBtn = await page.$('input[name="username"]');
  if (loginBtn) {
    throw new Error('Not logged into Instagram. Log in manually in your Chrome/Brave browser first.');
  }

  console.error('[post] Clicking "Create" button...');
  // Try several selectors — Instagram rotates them. We click the nav icon.
  const createSelectors = [
    // SVG icons (most reliable since aria-labels are more stable than class names)
    'svg[aria-label="New post"]',
    'svg[aria-label="Nueva publicacion"]',
    'svg[aria-label="Nueva publicación"]',
    'svg[aria-label="Crear"]',
    'svg[aria-label="Create"]',
    // Climb to the clickable ancestor
    'a[role="link"]:has(svg[aria-label*="Create" i])',
    'a[role="link"]:has(svg[aria-label*="Crear" i])',
    'div[role="button"]:has(svg[aria-label*="Create" i])',
    'div[role="button"]:has(svg[aria-label*="Crear" i])',
  ];

  let clicked = false;
  for (const sel of createSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        // Click the nearest clickable ancestor (svg itself isn't clickable reliably)
        const clickTarget = await el.evaluateHandle((node) => {
          let current = node;
          while (current && current.tagName !== 'A' && current.getAttribute('role') !== 'button') {
            current = current.parentElement;
            if (!current) break;
          }
          return current || node;
        });
        await clickTarget.asElement()?.click();
        console.error(`[post] Clicked via selector: ${sel}`);
        clicked = true;
        break;
      }
    } catch (e) {
      // try next selector
    }
  }

  if (!clicked) {
    console.error('[post] Create button not found. Trying /create/select/ direct URL...');
    try {
      await page.goto('https://www.instagram.com/create/select/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await humanDelay(2000, 3000);
      clicked = true;
    } catch (e) {
      throw new Error('Could not reach Instagram create page. Check your session.');
    }
  }

  await humanDelay(1500, 2500);

  // If a "Post / Reel / Story / Live" submenu appears, click the right one.
  // Instagram Spanish UI uses "Publicación" (with tilde) for Post.
  const targetsEn = isReel ? ['Reel'] : ['Post'];
  const targetsEs = isReel ? ['Reel'] : ['Publicación', 'Publicacion'];
  const allTargets = [...targetsEn, ...targetsEs];

  let submenuClicked = false;
  for (const label of allTargets) {
    // Try exact text match on any clickable element
    const tryClicks = [
      // Spans with exact text, then click nearest parent button
      async () => {
        const span = await page.evaluateHandle((t) => {
          const all = Array.from(document.querySelectorAll('span, div'));
          return all.find(el => el.textContent?.trim() === t && el.offsetParent !== null);
        }, label);
        const el = span?.asElement();
        if (el) {
          await el.evaluate((node) => {
            let n = node;
            while (n && !(n.tagName === 'BUTTON' || n.getAttribute('role') === 'button' || n.getAttribute('role') === 'menuitem')) {
              n = n.parentElement;
            }
            (n || node).click();
          });
          return true;
        }
        return false;
      },
      async () => {
        const btn = await page.$(`text="${label}"`);
        if (btn) { await btn.click(); return true; }
        return false;
      },
    ];
    for (const fn of tryClicks) {
      try {
        if (await fn()) {
          console.error(`[post] Clicked submenu item: "${label}"`);
          submenuClicked = true;
          await humanDelay(1500, 2500);
          break;
        }
      } catch {}
    }
    if (submenuClicked) break;
  }

  // Upload the file(s) — Instagram accepts multi-file input for carousels
  console.error(`[post] Uploading ${files.length} file(s): ${files.map(f => path.basename(f)).join(', ')}`);

  // Take a debug screenshot so we can see what IG is showing us
  const debugShot = path.join(path.dirname(files[0]), `debug-${Date.now()}.png`);
  await page.screenshot({ path: debugShot, fullPage: false }).catch(() => {});
  console.error(`[post] Debug screenshot saved: ${debugShot}`);

  // Dump visible buttons to help diagnose
  const visibleButtons = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"], a[role="link"]'))
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < window.innerHeight;
      })
      .map(el => (el.innerText || el.getAttribute('aria-label') || '').trim())
      .filter(t => t && t.length < 100);
    return [...new Set(buttons)].slice(0, 30);
  });
  console.error(`[post] Visible buttons/links: ${JSON.stringify(visibleButtons)}`);

  // Sometimes the file input is inside a dialog/modal and is only attached when we click "Select from computer"
  let fileInput = null;
  try {
    fileInput = await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 8000 });
  } catch {
    // Try clicking a "Select from computer" button first, then retry
    const selectBtnSelectors = [
      'button:has-text("Select from computer")',
      'button:has-text("Seleccionar del ordenador")',
      'button:has-text("Seleccionar del equipo")',
      'button:has-text("Seleccionar desde el ordenador")',
      'button:has-text("Select From Device")',
      'button:has-text("Subir")',
      'button:has-text("Upload")',
      // fallback: find button with text matching any likely word
      'button >> text=/select|seleccionar|upload|subir/i',
    ];
    for (const sel of selectBtnSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          console.error(`[post] Clicking "${sel}" to reveal file input...`);
          await btn.click();
          await humanDelay(500, 1000);
          break;
        }
      } catch {}
    }
    try {
      fileInput = await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 10000 });
    } catch {
      throw new Error(`File input not found. Debug screenshot: ${debugShot}. Buttons visible: ${JSON.stringify(visibleButtons)}`);
    }
  }

  await fileInput.setInputFiles(files);
  await humanDelay(3000, 5000);

  // For carousel, we may need to add more files via "+" button if single-select
  // (Instagram usually accepts all at once, but fallback handled below)
  if (isCarousel && files.length > 1) {
    // Sometimes need to click a "Select multiple" toggle; handled if present
    try {
      await page.click('svg[aria-label*="Select multiple" i], svg[aria-label*="Seleccionar varios" i]', { timeout: 2000 });
      await humanDelay(1000, 1500);
    } catch {}
  }

  // Click Next (may need 2-3 times: crop -> filter -> caption)
  for (let i = 0; i < 3; i++) {
    try {
      // Find "Next" or "Siguiente" via text match (button may be a div[role=button])
      const clicked = await page.evaluate(() => {
        const targets = ['Next', 'Siguiente'];
        const all = Array.from(document.querySelectorAll('button, div[role="button"]'));
        for (const el of all) {
          const text = (el.innerText || '').trim();
          if (targets.includes(text) && el.offsetParent !== null) {
            el.click();
            return text;
          }
        }
        return null;
      });
      if (clicked) {
        console.error(`[post] Clicked "${clicked}" (step ${i + 1})`);
        await humanDelay(1500, 2500);
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  // Add caption
  if (caption) {
    console.error('[post] Adding caption...');
    // Instagram uses contenteditable div — aria-label varies: "Write a caption...", "Escribe un pie de foto...", etc.
    const captionHandle = await page.evaluateHandle(() => {
      // Look for any contenteditable with an aria-label hinting at "caption"
      const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
      for (const el of editables) {
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        if (label.includes('caption') || label.includes('pie') || label.includes('escribe')
            || placeholder.includes('caption') || placeholder.includes('pie') || placeholder.includes('escribe')) {
          return el;
        }
      }
      // Fallback: first visible contenteditable in the current dialog
      return editables.find(el => el.offsetParent !== null) || null;
    });

    const captionEl = captionHandle?.asElement();
    if (!captionEl) {
      throw new Error('Caption field not found.');
    }
    await captionEl.click();
    await humanDelay(300, 600);
    await page.keyboard.type(caption, { delay: 12 });
    await humanDelay(1000, 2000);
  }

  // Click Share / Compartir
  console.error('[post] Clicking Share...');
  const shareClicked = await page.evaluate(() => {
    const targets = ['Share', 'Compartir'];
    const all = Array.from(document.querySelectorAll('button, div[role="button"]'));
    for (const el of all) {
      const text = (el.innerText || '').trim();
      if (targets.includes(text) && el.offsetParent !== null) {
        el.click();
        return text;
      }
    }
    return null;
  });
  if (!shareClicked) {
    throw new Error('Share/Compartir button not found.');
  }
  console.error(`[post] Clicked "${shareClicked}"`);

  // Wait for upload to complete
  console.error('[post] Waiting for confirmation...');
  await page.waitForFunction(() => {
    const text = document.body.innerText.toLowerCase();
    return text.includes('post has been shared')
      || text.includes('se ha compartido')
      || text.includes('publicación se ha compartido')
      || text.includes('se compartió')
      || text.includes('tu publicación');
  }, { timeout: 180000 }).catch(() => {
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
  let carouselFiles = [];
  let caption = '';
  let browserName = 'chrome';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--photo' && args[i + 1]) { mode = 'photo'; filePath = args[i + 1]; i++; }
    else if (args[i] === '--reel' && args[i + 1]) { mode = 'reel'; filePath = args[i + 1]; i++; }
    else if (args[i] === '--video' && args[i + 1]) { mode = 'video'; filePath = args[i + 1]; i++; }
    else if (args[i] === '--carousel') { mode = 'carousel'; }
    else if (args[i] === '--browser' && args[i + 1]) { browserName = args[i + 1]; i++; }
    else if (mode === 'carousel' && !caption) { caption = args[i]; }
    else if (mode === 'carousel') { carouselFiles.push(args[i]); }
    else if (!caption) { caption = args[i]; }
  }

  if (!mode) {
    console.error('Missing --photo, --reel, --video, or --carousel.');
    process.exit(1);
  }

  let absPath = null;
  let absFiles = [];

  if (mode === 'carousel') {
    if (carouselFiles.length < 2) {
      console.error('Carousel needs at least 2 files. Got:', carouselFiles.length);
      process.exit(1);
    }
    absFiles = carouselFiles.map(f => path.resolve(f));
    for (const f of absFiles) {
      if (!fs.existsSync(f)) {
        console.error(`File not found: ${f}`);
        process.exit(1);
      }
    }
  } else {
    if (!filePath) {
      console.error(`${mode} requires a file path.`);
      process.exit(1);
    }
    absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      console.error(`File not found: ${absPath}`);
      process.exit(1);
    }
  }

  console.error(`[post] mode=${mode} ${mode === 'carousel' ? `files=${absFiles.length}` : `file=${absPath}`} caption="${caption.slice(0, 60)}..."`);

  let cleanup;
  try {
    const session = await launchAndConnect({ browserName });
    cleanup = session.cleanup;

    await uploadPost({
      page: session.page,
      filePath: absPath,
      filePaths: absFiles,
      caption,
      isReel: mode === 'reel',
      isCarousel: mode === 'carousel',
    });

    console.log('');
    console.log(JSON.stringify({
      success: true,
      type: mode,
      files: mode === 'carousel' ? absFiles : [absPath],
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
