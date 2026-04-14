#!/usr/bin/env node
/**
 * Generate carousel images with Nano Banana (gemini-2.5-flash-image)
 * based on a list of prompts. Can use an inspiration's analysis as guidance.
 *
 * Usage:
 *   # Generate from prompts file (each line = one slide)
 *   node generate-carousel.js --prompts prompts.txt --name my-carousel
 *
 *   # Generate from an inspiration's adaptation_brief (uses its visual style as reference)
 *   node generate-carousel.js --from <inspiration_code> --name my-carousel
 *
 *   # Single slide test
 *   node generate-carousel.js --prompt "A minimalist fintech slide..." --name test
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { GoogleGenAI } = require('@google/genai');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const GENERATED_DIR = path.join(__dirname, '..', 'generated');
const INSPIRATIONS_DIR = path.join(__dirname, '..', 'inspirations');
const INDEX_FILE = path.join(INSPIRATIONS_DIR, 'index.json');

const STYLE_MODULES = {
  'old-money-80s':  path.join(__dirname, 'styles', 'old-money-80s.js'),
  'quiet-luxury':   path.join(__dirname, 'styles', 'quiet-luxury.js'),
};

// ─── Text overlay via sharp + SVG ─────────────────────────────────────────────

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapWords(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

async function addTextOverlay(imageBuffer, headline, body, w, h) {
  const hLines  = wrapWords(headline, 26);
  const bLines  = wrapWords(body, 46);

  const hSize   = 58;   // headline px — iOS/clean feel
  const bSize   = 26;   // body px
  const hLead   = 68;   // headline line-height
  const bLead   = 36;   // body line-height
  const gap     = 16;   // gap between headline and body
  const marginB = 80;   // distance from image bottom

  const blockH  = hLines.length * hLead + gap + bLines.length * bLead;
  let y         = h - marginB - blockH;

  // Dark gradient behind text (bottom 40% of image) for readability
  const gradH   = Math.round(h * 0.40);
  const gradSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="black" stop-opacity="0"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.62"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${h - gradH}" width="${w}" height="${gradH}" fill="url(#g)"/>
  </svg>`;

  // Text SVG
  let textElems = '';
  for (const line of hLines) {
    textElems += `<text x="${w / 2}" y="${y}" class="h">${escXml(line)}</text>\n`;
    y += hLead;
  }
  y += gap;
  for (const line of bLines) {
    textElems += `<text x="${w / 2}" y="${y}" class="b">${escXml(line)}</text>\n`;
    y += bLead;
  }

  const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <style>
      .h { font-family: -apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:${hSize}px; font-weight:600;
           fill:white; text-anchor:middle; dominant-baseline:auto; letter-spacing:-0.5px; }
      .b { font-family: -apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:${bSize}px; font-weight:300;
           fill:rgba(255,255,255,0.82); text-anchor:middle; dominant-baseline:auto; }
    </style>
    ${textElems}
  </svg>`;

  return sharp(imageBuffer)
    .composite([
      { input: Buffer.from(gradSvg), blend: 'over' },
      { input: Buffer.from(textSvg), blend: 'over' },
    ])
    .toBuffer();
}

function getClient() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_API_KEY not set. Add it to .env:');
    console.error('  GOOGLE_API_KEY=your_key_from_aistudio.google.com');
    process.exit(1);
  }
  return new GoogleGenAI({ apiKey });
}

async function generateImage(ai, prompt, referenceImages = [], maxRetries = 2) {
  const parts = [{ text: prompt }];

  // Add reference images (for visual style transfer)
  for (const refPath of referenceImages) {
    if (!fs.existsSync(refPath)) continue;
    parts.push({
      inlineData: {
        mimeType: refPath.endsWith('.png') ? 'image/png' : 'image/jpeg',
        data: fs.readFileSync(refPath).toString('base64'),
      },
    });
  }

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: [{ role: 'user', parts }],
        config: {
          // Force 4:5 portrait aspect ratio at the API level — more reliable
          // than asking for it in the prompt alone.
          imageConfig: { aspectRatio: '4:5' },
        },
      });

      // Check for safety/quality blocks explicitly
      const candidate = result.candidates?.[0];
      if (!candidate) {
        const block = result.promptFeedback?.blockReason;
        throw new Error(block ? `Blocked: ${block}` : 'No candidate in response');
      }
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        throw new Error(`Finish reason: ${candidate.finishReason}`);
      }

      const responseParts = candidate.content?.parts;
      if (!responseParts) throw new Error('No content parts in response');

      for (const part of responseParts) {
        if (part.inlineData?.data) {
          return {
            buffer: Buffer.from(part.inlineData.data, 'base64'),
            mimeType: part.inlineData.mimeType,
          };
        }
      }

      throw new Error('Response had no image data');
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        console.error(`  retry ${attempt + 1}/${maxRetries} after: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

async function main() {
  const args = process.argv.slice(2);
  let promptsFile = null;
  let singlePrompt = null;
  let fromInspiration = null;
  let styleName = null;
  let contentFile = null;
  let brand = 'WEALTHMAIA';
  let name = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prompts' && args[i + 1]) { promptsFile = args[i + 1]; i++; }
    else if (args[i] === '--prompt' && args[i + 1]) { singlePrompt = args[i + 1]; i++; }
    else if (args[i] === '--from' && args[i + 1]) { fromInspiration = args[i + 1]; i++; }
    else if (args[i] === '--style' && args[i + 1]) { styleName = args[i + 1]; i++; }
    else if (args[i] === '--content' && args[i + 1]) { contentFile = args[i + 1]; i++; }
    else if (args[i] === '--brand' && args[i + 1]) { brand = args[i + 1]; i++; }
    else if (args[i] === '--name' && args[i + 1]) { name = args[i + 1]; i++; }
  }

  if (!name) {
    console.error('--name is required (used for output folder name)');
    process.exit(1);
  }

  // Prepare prompts
  let prompts = [];
  let referenceImages = [];
  let bgColor = { r: 245, g: 243, b: 234, alpha: 1 }; // default cream

  // --style mode: load a built-in style module
  if (styleName) {
    const modulePath = STYLE_MODULES[styleName];
    if (!modulePath || !fs.existsSync(modulePath)) {
      console.error(`Unknown style: "${styleName}". Available: ${Object.keys(STYLE_MODULES).join(', ')}`);
      process.exit(1);
    }
    const styleModule = require(modulePath);

    if (contentFile) {
      if (!fs.existsSync(contentFile)) {
        console.error(`Content file not found: ${contentFile}`);
        process.exit(1);
      }
      const text = fs.readFileSync(contentFile, 'utf8');
      prompts = styleModule.parseContentFile(text, brand);
      console.error(`[generate] Style: ${styleName} | ${prompts.length} slides from ${contentFile}`);
    } else if (singlePrompt) {
      prompts = [singlePrompt];
    } else {
      prompts = styleModule.defaultPrompts(brand);
      console.error(`[generate] Style: ${styleName} | ${prompts.length} default slides`);
    }

    // Dark styles need dark padding (not cream)
    if (styleName === 'old-money-80s' || styleName === 'quiet-luxury') {
      bgColor = { r: 10, g: 10, b: 15, alpha: 1 };
    }

    // Styles that use text overlay: prompts are slide objects { photoPrompt, headline, body }
    // Normalise to always have { photoPrompt, headline, body } even for plain-string prompts
    if (styleModule.useTextOverlay) {
      prompts = prompts.map(p =>
        typeof p === 'string' ? { photoPrompt: p, headline: '', body: '' } : p
      );
    }

  } else if (singlePrompt) {
    prompts = [singlePrompt];
  } else if (promptsFile) {
    if (!fs.existsSync(promptsFile)) {
      console.error(`Prompts file not found: ${promptsFile}`);
      process.exit(1);
    }
    prompts = fs.readFileSync(promptsFile, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
  } else if (fromInspiration) {
    const items = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const entry = items.find(i => i.code === fromInspiration);
    if (!entry || !entry.analysis) {
      console.error(`Inspiration ${fromInspiration} not found or not analyzed yet.`);
      console.error(`Run: node scripts/analyze-inspiration.js ${fromInspiration}`);
      process.exit(1);
    }

    console.error('[generate] Loaded inspiration analysis');

    // Build a CONCISE shared style spec (keep it short — long prompts hurt Nano Banana)
    // CRITICAL: explicit aspect ratio + safe zones so text never gets cropped by Instagram's UI overlays
    const style = `FORMAT: Vertical 4:5 aspect ratio, 1080x1350 pixels. NOT square, NOT widescreen. Portrait orientation.
SAFE ZONES: All text and key visual elements MUST be inside the central 80% of the frame. Leave at least 150px empty margin on top, bottom, left, and right. The top 12% and bottom 18% of the slide will be covered by Instagram's UI (profile name, like/comment icons, pagination dots) — NEVER place text or logos in those zones.
STYLE: Minimalist Instagram carousel slide. Clean off-white background with subtle faint grid pattern (like notebook paper). Typography: elegant serif for large centered headlines, modern sans-serif for body text. Color palette: soft navy blue and sage green accents on neutral cream/white base. Aspirational but minimal. Small "WealthMaia" wordmark placed well inside the safe zone (around the inner top area, not touching the edge). No photos of real people. No brand logos. Digital illustration style only.`;

    // Custom adaptation — WealthMaia-specific, no ambiguity
    prompts = [
      `${style}\n\nSLIDE 1 (HOOK/COVER): Large centered headline in elegant serif: "5 Unsexy AI Habits That Quietly Grow Wealth". Below the headline, a small sans-serif subtitle: "No hype. Just compounding.". A tiny abstract illustration of an upward-trending line graph in the bottom third. Clean, aspirational, minimal.`,

      `${style}\n\nSLIDE 2 ("notes app" style list): Top of slide has a small serif number "01" and title "Automate Round-Ups". Inside a rounded white card in the center, 3 bullet points in clean sans-serif:\n• Every purchase rounds to the nearest euro\n• Spare change invested automatically\n• Compounds silently while you live\nAt bottom: small tag "Powered by WealthMaia".`,

      `${style}\n\nSLIDE 3 ("notes app" style list): Top serif number "02" and title "Predict Bills Before They Hit". Rounded white card with 3 bullets:\n• AI scans your recurring payments\n• Forecasts next 30 days of cash flow\n• Alerts you before a crunch\nBottom tag: "Powered by WealthMaia".`,

      `${style}\n\nSLIDE 4 ("notes app" style list): Top serif number "03" and title "Cancel What You Forgot". Rounded white card with 3 bullets:\n• Finds silent subscriptions you stopped using\n• One tap to cancel\n• Average user saves 34€/month\nBottom tag: "Powered by WealthMaia".`,

      `${style}\n\nSLIDE 5 (CTA): Large centered serif headline: "Start growing quietly." Below it a sans-serif line: "Join the WealthMaia waitlist". Center of the slide: a clean rectangular button illustration with the text "wealthmaia.com" inside. Minimal, inviting, no hype.`,
    ];

    // Skip reference images — they often contain elements (brand names, faces,
    // copyrighted imagery) that trigger Gemini's safety filters.
    referenceImages = [];
  } else {
    console.error('Provide one of: --prompts <file>, --prompt "...", --from <code>');
    process.exit(1);
  }

  // Setup output
  if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const outDir = path.join(GENERATED_DIR, name);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const ai = getClient();
  const results = [];

  for (let i = 0; i < prompts.length; i++) {
    const slide    = prompts[i];
    // Support both plain strings and slide objects { photoPrompt, headline, body }
    const prompt   = typeof slide === 'string' ? slide : slide.photoPrompt;
    const headline = typeof slide === 'object' ? slide.headline : '';
    const body     = typeof slide === 'object' ? slide.body     : '';

    const fname = `slide-${String(i + 1).padStart(2, '0')}.png`;
    const fpath = path.join(outDir, fname);

    console.error(`[generate] (${i + 1}/${prompts.length}) ${fname}...`);
    try {
      const { buffer } = await generateImage(ai, prompt, referenceImages);

      // Normalize to EXACT 1080x1350 (4:5). Nano Banana often returns square
      // or off-spec dimensions, which causes Instagram to crop the edges.
      const targetW = 1080;
      const targetH = 1350;

      const meta = await sharp(buffer).metadata();
      // Dark/full-bleed styles use 'cover' (no padding, slight crop if ratio is off).
      // Light styles use 'contain' (pad with bg color, no crop).
      const resizeFit = bgColor.r < 50 ? 'cover' : 'contain';
      console.error(`  source is ${meta.width}x${meta.height}; normalizing to ${targetW}x${targetH} (${resizeFit})`);

      // Trim any uniform border Gemini adds (Polaroid/frame effect) before resizing
      const trimmed = styleName === 'old-money-80s'
        ? await sharp(buffer).trim({ threshold: 20 }).toBuffer()
        : buffer;

      let pipeline = sharp(trimmed).resize(targetW, targetH, { fit: resizeFit, background: bgColor });

      // For old-money-80s: apply aged film look post-processing — forces the vintage feel
      // regardless of what Gemini returns.
      if (styleName === 'old-money-80s') {
        // 1) Slight desaturation + gentle warm amber cast of aged Ektachrome
        pipeline = pipeline
          .modulate({ saturation: 0.88, brightness: 0.97 })
          // 2) Slight tonal compression — kill pure blacks/whites (aged film look)
          .linear(0.94, 4);

        // 3) Subtle warm tint via RGB linear curves: boost R slightly, reduce B slightly
        //    (this mimics the warm color shift of aged 80s color film without washing out)
        pipeline = pipeline.recomb([
          [1.04, 0,    0   ],
          [0,    1.0,  0   ],
          [0,    0,    0.94],
        ]);

        // 4) Grain overlay — subtle monochrome noise composited on top
        const noiseW = targetW, noiseH = targetH;
        const noisePixels = Buffer.alloc(noiseW * noiseH * 4);
        for (let p = 0; p < noisePixels.length; p += 4) {
          const v = 128 + (Math.random() - 0.5) * 50;
          noisePixels[p] = v; noisePixels[p + 1] = v; noisePixels[p + 2] = v;
          noisePixels[p + 3] = 28; // ~11% alpha — present but subtle
        }
        const noiseBuf = await sharp(noisePixels, {
          raw: { width: noiseW, height: noiseH, channels: 4 },
        }).png().toBuffer();

        pipeline = pipeline.composite([{ input: noiseBuf, blend: 'overlay' }]);
      }

      let finalBuffer = await pipeline.png().toBuffer();

      // Text overlay for styles that use programmatic text (useTextOverlay)
      if (headline) {
        console.error(`  overlaying text: "${headline}"`);
        finalBuffer = await addTextOverlay(finalBuffer, headline, body, targetW, targetH);
      }

      fs.writeFileSync(fpath, finalBuffer);
      results.push({ slide: i + 1, file: fpath, prompt: prompt.slice(0, 120), success: true });
      console.error(`  saved ${fpath}`);
    } catch (err) {
      console.error(`  failed: ${err.message}`);
      results.push({ slide: i + 1, error: err.message, success: false });
    }
  }

  // Save manifest for posting
  const manifest = {
    name,
    generated_at: new Date().toISOString(),
    from_inspiration: fromInspiration || null,
    slides: results,
    post_command: `node scripts/post.js --carousel "YOUR CAPTION" ${results.filter(r => r.success).map(r => `"${r.file}"`).join(' ')}`,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify(manifest, null, 2));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
