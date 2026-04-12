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

async function generateImage(ai, prompt, referenceImages = []) {
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

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [{ role: 'user', parts }],
  });

  // Extract image from response
  const response = result.candidates?.[0]?.content?.parts;
  if (!response) throw new Error('No content in response');

  for (const part of response) {
    if (part.inlineData?.data) {
      return {
        buffer: Buffer.from(part.inlineData.data, 'base64'),
        mimeType: part.inlineData.mimeType,
      };
    }
  }

  throw new Error('No image in response');
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

    // Build prompts from the adaptation brief and visual style
    const visualStyle = typeof entry.analysis.visual_style === 'string'
      ? entry.analysis.visual_style
      : JSON.stringify(entry.analysis.visual_style);
    const brief = typeof entry.analysis.adaptation_brief === 'string'
      ? entry.analysis.adaptation_brief
      : JSON.stringify(entry.analysis.adaptation_brief);

    console.error('[generate] Loaded inspiration analysis');
    console.error('[generate] Adaptation brief:', brief);

    // Default: 5 slides matching structure
    const structure = typeof entry.analysis.structure === 'string'
      ? entry.analysis.structure
      : JSON.stringify(entry.analysis.structure);

    const basePrompt = `Create a single Instagram carousel slide (1080x1350 vertical).

Visual style to match: ${visualStyle}

WealthMaia context (a wealth management AI SaaS): ${brief}

Structure to follow: ${structure}`;

    prompts = [
      basePrompt + '\n\nThis is SLIDE 1 (HOOK): The scroll-stopping opening with a bold, large headline that creates curiosity.',
      basePrompt + '\n\nThis is SLIDE 2: State the problem WealthMaia solves. Large text, clean layout.',
      basePrompt + '\n\nThis is SLIDE 3: Show the WealthMaia solution with a concrete benefit. Include icon/illustration.',
      basePrompt + '\n\nThis is SLIDE 4: Social proof or specific result (use plausible placeholder stats).',
      basePrompt + '\n\nThis is SLIDE 5: CTA slide — "Join WealthMaia" with clear call to action.',
    ];

    // Use first 2 reference images from the inspiration for visual style
    if (entry.downloaded_path && fs.existsSync(entry.downloaded_path)) {
      const refs = fs.readdirSync(entry.downloaded_path)
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .slice(0, 2)
        .map(f => path.join(entry.downloaded_path, f));
      referenceImages = refs;
      console.error(`[generate] Using ${refs.length} reference images from inspiration`);
    }
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
