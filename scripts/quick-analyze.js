#!/usr/bin/env node
/**
 * Quick per-slide analysis from an Instagram URL — no prior save needed.
 *
 * Usage:
 *   node scripts/quick-analyze.js https://www.instagram.com/p/ABC123/
 *
 * Output: JSON with a slide-by-slide breakdown + overall adaptation brief.
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const { GoogleGenAI } = require('@google/genai');
const { launchAndConnect, sleep, humanDelay } = require('./lib/browser');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TMP_DIR = path.join(__dirname, '..', 'inspirations', '_quick-analyze-tmp');

function extractCode(url) {
  const m = url.match(/\/(p|reel)\/([^/?]+)/);
  return m ? m[2] : null;
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

async function scrapeSlides(page, url) {
  console.error(`[quick-analyze] Loading ${url}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await humanDelay(3000, 4000);

  const caption = await page.evaluate(() => {
    const h1 = document.querySelector('article h1, div[role="button"] h1');
    if (h1?.textContent) return h1.textContent;
    return document.querySelector('meta[property="og:description"]')?.content || '';
  });

  const imageUrls = [];

  const collect = async () => {
    const urls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .map(img => {
          const srcset = img.srcset || '';
          if (srcset) {
            const best = srcset.split(',').map(s => s.trim().split(/\s+/))
              .sort((a, b) => (parseInt((b[1] || '0')) || 0) - (parseInt((a[1] || '0')) || 0))[0];
            return best?.[0] || img.src;
          }
          return img.src;
        })
        .filter(src =>
          (src.includes('cdninstagram') || src.includes('fbcdn.net')) &&
          !src.includes('profile') &&
          !src.includes('s150x150') &&
          !src.includes('s320x320')
        );
    });
    urls.forEach(u => { if (!imageUrls.includes(u)) imageUrls.push(u); });
  };

  await collect();

  // Page through carousel
  for (let i = 0; i < 15; i++) {
    const nextSelectors = [
      'button[aria-label*="Next" i]',
      'button[aria-label*="Siguiente" i]',
      'button._afxw',
    ];
    let clicked = false;
    for (const sel of nextSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); clicked = true; break; }
      } catch {}
    }
    if (!clicked) break;
    await sleep(1500);
    await collect();
  }

  return { caption, imageUrls };
}

async function analyzeSlides(imageUrls, caption) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set in .env');

  const ai = new GoogleGenAI({ apiKey });

  // Download slides to tmp
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const files = [];
  for (let i = 0; i < Math.min(imageUrls.length, 10); i++) {
    const ext = imageUrls[i].match(/\.(jpg|jpeg|png|webp)/i)?.[0] || '.jpg';
    const fpath = path.join(TMP_DIR, `slide-${String(i + 1).padStart(2, '0')}${ext}`);
    try {
      await downloadFile(imageUrls[i], fpath);
      files.push(fpath);
      console.error(`[quick-analyze] Downloaded slide ${i + 1}/${Math.min(imageUrls.length, 10)}`);
    } catch (e) {
      console.error(`[quick-analyze] Skip slide ${i + 1}: ${e.message}`);
    }
  }

  if (files.length === 0) throw new Error('No slides downloaded.');

  const parts = files.map(f => ({
    inlineData: {
      mimeType: f.endsWith('.png') ? 'image/png' : 'image/jpeg',
      data: fs.readFileSync(f).toString('base64'),
    },
  }));

  const prompt = `Analyze this Instagram carousel post slide by slide.
Caption: "${caption}"
There are ${files.length} slides (sent in order).

Return a JSON object with this exact structure:
{
  "slides": [
    {
      "slide": 1,
      "hook_score": 1-10,
      "headline": "main text on the slide",
      "visual_description": "what you see — layout, colors, images, style",
      "purpose": "what this slide does in the sequence (hook/problem/solution/proof/cta/etc.)",
      "copywriting_technique": "name of the technique used (e.g. pattern interrupt, social proof, etc.)"
    }
  ],
  "overall": {
    "structure": "e.g. hook → problem → 3 solutions → cta",
    "visual_style": "palette, typography style, layout pattern",
    "content_type": "educational/storytelling/listicle/comparison/etc.",
    "target_emotion": "what feeling it creates",
    "why_it_works": ["reason 1", "reason 2", "reason 3"],
    "adaptation_brief": "Concrete carousel idea adapted for WealthMaia (wealth management AI SaaS). Include suggested headline for each slide."
  }
}`;

  console.error(`[quick-analyze] Calling Gemini Vision on ${files.length} slides...`);
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }, ...parts] }],
    config: { responseMimeType: 'application/json' },
  });

  const text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(text);
}

async function main() {
  const url = process.argv[2];
  if (!url || !url.includes('instagram.com')) {
    console.error('Usage: node scripts/quick-analyze.js https://www.instagram.com/p/ABC123/');
    process.exit(1);
  }

  const code = extractCode(url);
  if (!code) {
    console.error('Could not extract post code from URL.');
    process.exit(1);
  }

  console.error(`[quick-analyze] Post: ${code}`);

  let cleanup;
  try {
    const session = await launchAndConnect({});
    cleanup = session.cleanup;
    const { caption, imageUrls } = await scrapeSlides(session.page, url);
    await cleanup();
    cleanup = null;

    console.error(`[quick-analyze] Found ${imageUrls.length} image(s). Caption: "${caption.slice(0, 80)}"`);

    const analysis = await analyzeSlides(imageUrls, caption);

    // Clean up tmp
    fs.rmSync(TMP_DIR, { recursive: true, force: true });

    console.log(JSON.stringify({ success: true, code, url, caption, analysis }, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    if (cleanup) await cleanup();
    process.exit(1);
  }
}

main();
