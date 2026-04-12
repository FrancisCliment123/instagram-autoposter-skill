#!/usr/bin/env node
/**
 * Convert a folder of carousel slides into an Instagram Reel MP4.
 * Each slide is shown for a set duration, with a tiny zoom/cross-fade.
 *
 * Reels require 9:16 portrait video. We scale each slide to 1080 wide
 * and pad top/bottom to reach 1920 height with a matching background color.
 *
 * Usage:
 *   node slides-to-reel.js --from <carousel-name> [--duration 4] [--bg "#F5F3EA"]
 *   node slides-to-reel.js --folder path/to/images [--duration 4]
 *
 * Outputs: generated/<name>/<name>.mp4
 */

const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);

const GENERATED_DIR = path.join(__dirname, '..', 'generated');

function listSlides(folder) {
  return fs.readdirSync(folder)
    .filter(f => /^slide-\d+\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort()
    .map(f => path.join(folder, f));
}

async function makeReel({ slides, outputPath, duration, bgColor }) {
  if (slides.length === 0) throw new Error('No slides found');

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();

    // Each slide gets the same duration — use -loop 1 + -t per input
    for (const s of slides) {
      cmd.input(s).loop(duration).inputFPS(30);
    }

    // Build a filter graph: scale each to 1080x1350, pad to 1080x1920, then concat
    const scalePadFilters = slides.map((_, i) =>
      `[${i}:v]scale=1080:1350:force_original_aspect_ratio=decrease,` +
      `pad=1080:1920:(1080-iw)/2:(1920-ih)/2:color=${bgColor},` +
      `setsar=1,fps=30,trim=duration=${duration},setpts=PTS-STARTPTS[v${i}]`
    );

    const concatInputs = slides.map((_, i) => `[v${i}]`).join('');
    const concatFilter = `${concatInputs}concat=n=${slides.length}:v=1:a=0[outv]`;

    const filterComplex = [...scalePadFilters, concatFilter].join(';');

    cmd
      .complexFilter(filterComplex, ['outv'])
      .outputOptions([
        '-r 30',
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset medium',
        '-crf 20',
        '-movflags +faststart',
      ])
      .on('start', (cmdLine) => console.error('[reel] ffmpeg started'))
      .on('progress', (p) => {
        if (p.percent) console.error(`[reel] progress: ${p.percent.toFixed(1)}%`);
      })
      .on('error', (err) => reject(err))
      .on('end', () => resolve(outputPath))
      .save(outputPath);
  });
}

async function main() {
  const args = process.argv.slice(2);
  let fromName = null;
  let folder = null;
  let duration = 4;
  let bgColor = 'F5F3EA'; // matches the cream/notebook color of our slides

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) { fromName = args[i + 1]; i++; }
    else if (args[i] === '--folder' && args[i + 1]) { folder = args[i + 1]; i++; }
    else if (args[i] === '--duration' && args[i + 1]) { duration = parseFloat(args[i + 1]); i++; }
    else if (args[i] === '--bg' && args[i + 1]) { bgColor = args[i + 1].replace(/^#/, ''); i++; }
  }

  if (!fromName && !folder) {
    console.error('Usage:');
    console.error('  node slides-to-reel.js --from <carousel-name> [--duration 4]');
    console.error('  node slides-to-reel.js --folder path/to/images [--duration 4]');
    process.exit(1);
  }

  const inputFolder = folder ? path.resolve(folder) : path.join(GENERATED_DIR, fromName);
  if (!fs.existsSync(inputFolder)) {
    console.error(`Folder not found: ${inputFolder}`);
    process.exit(1);
  }

  const slides = listSlides(inputFolder);
  if (slides.length === 0) {
    console.error(`No slides (slide-NN.png) found in ${inputFolder}`);
    process.exit(1);
  }

  const name = fromName || path.basename(inputFolder);
  const outputPath = path.join(inputFolder, `${name}.mp4`);

  console.error(`[reel] Slides: ${slides.length}`);
  console.error(`[reel] Duration per slide: ${duration}s`);
  console.error(`[reel] Total: ${(slides.length * duration).toFixed(1)}s`);
  console.error(`[reel] Background: #${bgColor}`);
  console.error(`[reel] Output: ${outputPath}`);

  try {
    await makeReel({ slides, outputPath, duration, bgColor });
    console.log(JSON.stringify({
      success: true,
      output: outputPath,
      slides_used: slides.length,
      duration_per_slide: duration,
      total_duration: slides.length * duration,
      bg_color: `#${bgColor}`,
      next_step: `node scripts/post.js --reel "${outputPath}" "your caption"`,
    }, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
