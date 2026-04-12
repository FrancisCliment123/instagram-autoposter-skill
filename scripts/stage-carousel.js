#!/usr/bin/env node
/**
 * Stage a generated carousel for manual mobile publishing.
 *
 * Instagram's web doesn't support drafts and doesn't let you add
 * music to posts. This script prepares a staged folder that you can
 * sync to your phone via iCloud Drive / Google Drive / Dropbox /
 * OneDrive, so you can publish from the Instagram mobile app WITH
 * trending music (huge reach boost) in ~60 seconds.
 *
 * Default output: ~/.instagram-bot-staged/<name>/
 *   - slide-NN.png (copies from generated/<name>/)
 *   - reel.mp4 (if you ran slides-to-reel.js first)
 *   - caption.txt (ready to copy/paste)
 *   - INSTRUCTIONS.md (step-by-step for mobile publishing)
 *
 * Override location with --out <path> or STAGE_DIR env var.
 *
 * Usage:
 *   node stage-carousel.js --from <name> --caption "Your caption"
 *   node stage-carousel.js --from <name> --caption-file caption.txt
 *   node stage-carousel.js --from <name> --caption "..." --out /path/to/cloud-synced-folder
 *   node stage-carousel.js --list
 *   node stage-carousel.js --clean <name>
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const GENERATED_DIR = path.join(__dirname, '..', 'generated');
const DEFAULT_STAGE_DIR = process.env.STAGE_DIR || path.join(os.homedir(), '.instagram-bot-staged');

function copyFile(src, dst) {
  fs.copyFileSync(src, dst);
}

function makeInstructions({ name, slideCount, hasReel, caption }) {
  return `# How to publish: ${name}

This folder was prepared by \`instagram-autoposter\` for mobile publishing.
Publishing from mobile lets you **add trending music** (not available from web),
which dramatically boosts reach — Instagram promotes music-enabled carousels
in the Reels tab.

## On your phone

### Option 1 — Carousel with music (recommended, ~60 seconds)

1. Open this folder on your phone (via the synced cloud app)
2. **Save all slide-*.png to your camera roll / photos**
3. Open Instagram → tap \`+\` (new post) → **Post**
4. Select the ${slideCount} slides **in order** (slide-01, slide-02, ...)
5. Tap **Next** → **Next** (skip filters if you want)
6. Tap **Add music** → pick a trending sound that fits
7. **Paste the caption** from \`caption.txt\` below
8. Tap **Share**

${hasReel ? `### Option 2 — Publish as a Reel (reel.mp4 is ready)

If you'd rather publish as a Reel (more discovery potential):

1. Save \`reel.mp4\` to your camera roll
2. Instagram → \`+\` → **Reel**
3. Pick the video
4. Tap the music icon → choose trending sound
5. Paste caption from \`caption.txt\`
6. Share

` : ''}## Caption (copy this)

\`\`\`
${caption}
\`\`\`

---

*Generated ${new Date().toISOString()}*
`;
}

function listStaged(stageDir) {
  if (!fs.existsSync(stageDir)) return [];
  return fs.readdirSync(stageDir)
    .filter(f => {
      const p = path.join(stageDir, f);
      return fs.statSync(p).isDirectory();
    })
    .map(name => {
      const p = path.join(stageDir, name);
      const stats = fs.statSync(p);
      const files = fs.readdirSync(p);
      const slides = files.filter(f => /^slide-\d+\.(png|jpg|jpeg|webp)$/i.test(f));
      const hasReel = files.some(f => /\.mp4$/i.test(f));
      const hasCaption = files.includes('caption.txt');
      return {
        name,
        path: p,
        slides: slides.length,
        has_reel: hasReel,
        has_caption: hasCaption,
        staged_at: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.staged_at.localeCompare(a.staged_at));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage:');
    console.error('  stage-carousel.js --from <name> --caption "Your caption"');
    console.error('  stage-carousel.js --from <name> --caption-file caption.txt');
    console.error('  stage-carousel.js --list');
    console.error('  stage-carousel.js --clean <name>');
    console.error('');
    console.error(`Default stage location: ${DEFAULT_STAGE_DIR}`);
    console.error('Override with --out <path> or STAGE_DIR env var.');
    process.exit(1);
  }

  let fromName = null;
  let caption = null;
  let captionFile = null;
  let outDir = DEFAULT_STAGE_DIR;
  let listMode = false;
  let cleanName = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) { fromName = args[i + 1]; i++; }
    else if (args[i] === '--caption' && args[i + 1]) { caption = args[i + 1]; i++; }
    else if (args[i] === '--caption-file' && args[i + 1]) { captionFile = args[i + 1]; i++; }
    else if (args[i] === '--out' && args[i + 1]) { outDir = args[i + 1]; i++; }
    else if (args[i] === '--list') { listMode = true; }
    else if (args[i] === '--clean' && args[i + 1]) { cleanName = args[i + 1]; i++; }
  }

  // LIST MODE
  if (listMode) {
    const items = listStaged(outDir);
    console.log(JSON.stringify({
      stage_dir: outDir,
      total: items.length,
      items,
    }, null, 2));
    return;
  }

  // CLEAN MODE
  if (cleanName) {
    const target = path.join(outDir, cleanName);
    if (!fs.existsSync(target)) {
      console.error(`Not found: ${target}`);
      process.exit(1);
    }
    fs.rmSync(target, { recursive: true, force: true });
    console.log(JSON.stringify({
      success: true,
      cleaned: target,
    }, null, 2));
    return;
  }

  // STAGE MODE — need --from
  if (!fromName) {
    console.error('--from <name> is required (name of a folder in generated/)');
    process.exit(1);
  }

  // Resolve caption
  if (captionFile) {
    if (!fs.existsSync(captionFile)) {
      console.error(`Caption file not found: ${captionFile}`);
      process.exit(1);
    }
    caption = fs.readFileSync(captionFile, 'utf8').trim();
  }
  if (!caption) {
    console.error('Provide --caption "..." or --caption-file path');
    process.exit(1);
  }

  // Locate source
  const srcDir = path.join(GENERATED_DIR, fromName);
  if (!fs.existsSync(srcDir)) {
    console.error(`Source folder not found: ${srcDir}`);
    console.error(`Run generate-carousel.js --name ${fromName} first.`);
    process.exit(1);
  }

  const srcFiles = fs.readdirSync(srcDir);
  const slideFiles = srcFiles
    .filter(f => /^slide-\d+\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort();
  if (slideFiles.length === 0) {
    console.error(`No slide-NN.(png|jpg) files found in ${srcDir}`);
    process.exit(1);
  }

  const reelFile = srcFiles.find(f => /\.mp4$/i.test(f));

  // Prepare destination
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const destDir = path.join(outDir, fromName);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  // Copy slides
  const copiedSlides = [];
  for (const slide of slideFiles) {
    const src = path.join(srcDir, slide);
    const dst = path.join(destDir, slide);
    copyFile(src, dst);
    copiedSlides.push(dst);
  }

  // Copy reel if present
  let copiedReel = null;
  if (reelFile) {
    const src = path.join(srcDir, reelFile);
    const dst = path.join(destDir, 'reel.mp4');
    copyFile(src, dst);
    copiedReel = dst;
  }

  // Write caption.txt
  const captionPath = path.join(destDir, 'caption.txt');
  fs.writeFileSync(captionPath, caption, 'utf8');

  // Write INSTRUCTIONS.md
  const instructionsPath = path.join(destDir, 'INSTRUCTIONS.md');
  fs.writeFileSync(instructionsPath, makeInstructions({
    name: fromName,
    slideCount: slideFiles.length,
    hasReel: !!reelFile,
    caption,
  }), 'utf8');

  console.log(JSON.stringify({
    success: true,
    name: fromName,
    staged_to: destDir,
    slides: copiedSlides.length,
    reel: copiedReel,
    caption_file: captionPath,
    instructions: instructionsPath,
    next_steps: [
      'Make sure this folder is inside your cloud-synced directory (iCloud / Drive / Dropbox)',
      `Open ${destDir}/INSTRUCTIONS.md on your phone and follow the steps`,
      `After publishing from your phone, clean up with: node scripts/stage-carousel.js --clean ${fromName}`,
    ],
  }, null, 2));
}

main();
