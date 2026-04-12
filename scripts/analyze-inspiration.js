#!/usr/bin/env node
/**
 * Analyze a saved inspiration post:
 *  - Downloads all slides/images
 *  - Extracts caption + hashtags
 *  - Uses Gemini Vision to describe each image, identify the hook,
 *    visual style, text overlays, and narrative structure
 *  - Saves the analysis to inspirations/index.json
 *
 * Usage:
 *   node analyze-inspiration.js <code>       # analyze by code
 *   node analyze-inspiration.js --all        # analyze all status:new
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const { GoogleGenAI } = require('@google/genai');
const { launchAndConnect, sleep, humanDelay } = require('./lib/browser');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const INSPIRATIONS_DIR = path.join(__dirname, '..', 'inspirations');
const INDEX_FILE = path.join(INSPIRATIONS_DIR, 'index.json');

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
}

function saveIndex(items) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(items, null, 2));
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

async function scrapePost(page, entry) {
  console.error(`[analyze] Navigating to ${entry.url}...`);
  await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await humanDelay(3000, 5000);

  // Get caption + basic info via DOM
  const basic = await page.evaluate(() => {
    const captionEl = document.querySelector('div[role="button"] h1, article h1, meta[property="og:description"]');
    const caption = captionEl?.textContent || captionEl?.content || '';
    const timeEl = document.querySelector('time');
    const datetime = timeEl?.getAttribute('datetime') || null;
    return { caption, datetime };
  });

  const hashtags = (basic.caption.match(/#\w+/g) || []);

  // Collect all image URLs from the carousel by clicking through
  const imageUrls = [];
  const videoUrls = [];

  // Try to get them from the DOM
  const collectMedia = async () => {
    const mediaData = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('article img'))
        .map(i => ({ src: i.src, srcset: i.srcset, alt: i.alt }))
        .filter(i => i.src && i.src.includes('cdninstagram') && !i.src.includes('profile'));
      const vids = Array.from(document.querySelectorAll('article video'))
        .map(v => ({ src: v.src, poster: v.poster }))
        .filter(v => v.src);
      return { imgs, vids };
    });
    mediaData.imgs.forEach(img => {
      if (!imageUrls.includes(img.src)) imageUrls.push(img.src);
    });
    mediaData.vids.forEach(vid => {
      if (!videoUrls.includes(vid.src)) videoUrls.push(vid.src);
    });
  };

  await collectMedia();

  // Click "Next" to load the rest of the carousel
  for (let i = 0; i < 15; i++) {
    const nextBtn = await page.$('button[aria-label*="Next" i], button[aria-label*="Siguiente" i]');
    if (!nextBtn) break;
    await nextBtn.click().catch(() => {});
    await sleep(1500);
    await collectMedia();
  }

  // Download files
  const postDir = path.join(INSPIRATIONS_DIR, entry.code);
  if (!fs.existsSync(postDir)) fs.mkdirSync(postDir, { recursive: true });

  const downloaded = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const ext = imageUrls[i].match(/\.(jpg|jpeg|png|webp)/i)?.[0] || '.jpg';
    const fname = `slide-${String(i + 1).padStart(2, '0')}${ext}`;
    const fpath = path.join(postDir, fname);
    try {
      await downloadFile(imageUrls[i], fpath);
      downloaded.push(fpath);
      console.error(`[analyze] Downloaded ${fname}`);
    } catch (err) {
      console.error(`[analyze] Failed to download ${fname}: ${err.message}`);
    }
  }

  for (let i = 0; i < videoUrls.length; i++) {
    const fname = `video-${String(i + 1).padStart(2, '0')}.mp4`;
    const fpath = path.join(postDir, fname);
    try {
      await downloadFile(videoUrls[i], fpath);
      downloaded.push(fpath);
      console.error(`[analyze] Downloaded ${fname}`);
    } catch (err) {
      console.error(`[analyze] Failed to download ${fname}: ${err.message}`);
    }
  }

  return {
    caption: basic.caption,
    hashtags,
    datetime: basic.datetime,
    image_count: imageUrls.length,
    video_count: videoUrls.length,
    downloaded_files: downloaded,
    post_dir: postDir,
  };
}

async function analyzeWithGemini(scraped) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set in .env');

  const ai = new GoogleGenAI({ apiKey });

  // Prepare images for Gemini (up to 10)
  const images = scraped.downloaded_files
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .slice(0, 10);

  const parts = images.map(f => ({
    inlineData: {
      mimeType: f.endsWith('.png') ? 'image/png' : 'image/jpeg',
      data: fs.readFileSync(f).toString('base64'),
    },
  }));

  const prompt = `You are analyzing an Instagram post that a creator wants to learn from.

Caption: "${scraped.caption}"

Looking at ${images.length} slides/images of this post, tell me:

1. **Hook**: What's the scroll-stopping opening (first slide / first seconds)?
2. **Structure**: How is information presented across slides? (e.g. "problem -> solution -> proof")
3. **Visual style**: Color palette, typography, layout patterns, background style
4. **Text overlay patterns**: How is text used on each slide? Headline size, placement, emphasis
5. **Content type**: Educational / storytelling / testimonial / comparison / framework / etc.
6. **Target emotion**: What feeling does this create?
7. **Why it works**: 2-3 specific reasons this format is effective
8. **Adaptation brief**: How would this structure adapt to a wealth management AI SaaS (WealthMaia)? Give a concrete content idea.

Return strict JSON with keys: hook, structure, visual_style, text_overlay_patterns, content_type, target_emotion, why_it_works, adaptation_brief.`;

  console.error('[analyze] Calling Gemini Vision...');
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }, ...parts] }],
    config: { responseMimeType: 'application/json' },
  });

  const text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(text);
}

async function analyzeOne(entry) {
  let cleanup;
  try {
    const session = await launchAndConnect({});
    cleanup = session.cleanup;
    const scraped = await scrapePost(session.page, entry);
    await cleanup();
    cleanup = null;

    console.error('[analyze] Analyzing with Gemini Vision...');
    const analysis = await analyzeWithGemini(scraped);

    return {
      ...entry,
      status: 'analyzed',
      downloaded_path: scraped.post_dir,
      caption: scraped.caption,
      hashtags: scraped.hashtags,
      datetime: scraped.datetime,
      image_count: scraped.image_count,
      video_count: scraped.video_count,
      analysis,
      analyzed_at: new Date().toISOString(),
    };
  } finally {
    if (cleanup) await cleanup();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage:');
    console.error('  node analyze-inspiration.js <code>');
    console.error('  node analyze-inspiration.js --all');
    process.exit(1);
  }

  const items = loadIndex();
  let targets;

  if (args[0] === '--all') {
    targets = items.filter(i => i.status === 'new');
    if (targets.length === 0) {
      console.log(JSON.stringify({ success: true, message: 'Nothing to analyze (no status=new items).' }, null, 2));
      return;
    }
  } else {
    const entry = items.find(i => i.code === args[0]);
    if (!entry) {
      console.error(`Not found: ${args[0]}`);
      process.exit(1);
    }
    targets = [entry];
  }

  const results = [];
  for (const target of targets) {
    console.error(`\n=== Analyzing ${target.code} ===`);
    try {
      const updated = await analyzeOne(target);
      const idx = items.findIndex(i => i.code === target.code);
      items[idx] = updated;
      saveIndex(items);
      results.push(updated);
    } catch (err) {
      console.error(`Failed to analyze ${target.code}: ${err.message}`);
      results.push({ code: target.code, error: err.message });
    }
  }

  console.log(JSON.stringify({
    success: true,
    analyzed: results.length,
    results,
  }, null, 2));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
