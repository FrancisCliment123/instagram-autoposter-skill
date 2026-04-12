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
const { GoogleGenAI } = require('@google/genai');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const GENERATED_DIR = path.join(__dirname, '..', 'generated');
const INSPIRATIONS_DIR = path.join(__dirname, '..', 'inspirations');
const INDEX_FILE = path.join(INSPIRATIONS_DIR, 'index.json');

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
  let name = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prompts' && args[i + 1]) { promptsFile = args[i + 1]; i++; }
    else if (args[i] === '--prompt' && args[i + 1]) { singlePrompt = args[i + 1]; i++; }
    else if (args[i] === '--from' && args[i + 1]) { fromInspiration = args[i + 1]; i++; }
    else if (args[i] === '--name' && args[i + 1]) { name = args[i + 1]; i++; }
  }

  if (!name) {
    console.error('--name is required (used for output folder name)');
    process.exit(1);
  }

  // Prepare prompts
  let prompts = [];
  let referenceImages = [];

  if (singlePrompt) {
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
    const style = `STYLE: Minimalist Instagram carousel slide, 1080x1350 vertical (4:5 aspect). Clean off-white background with subtle faint grid pattern (like notebook paper). Typography blend: elegant serif for large centered headlines, modern sans-serif for body text. Color palette: soft navy blue and sage green accents on neutral cream/white base. Aspirational but minimal. Small "WealthMaia" wordmark in top-right corner. No photos of real people. No logos of real brands. Digital illustration style only.`;

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
    const prompt = prompts[i];
    const fname = `slide-${String(i + 1).padStart(2, '0')}.png`;
    const fpath = path.join(outDir, fname);

    console.error(`[generate] (${i + 1}/${prompts.length}) ${fname}...`);
    try {
      const { buffer } = await generateImage(ai, prompt, referenceImages);
      fs.writeFileSync(fpath, buffer);
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
