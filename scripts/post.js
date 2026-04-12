#!/usr/bin/env node
/**
 * Instagram Post Script
 * Post photos, videos, reels, and carousels to Instagram.
 *
 * Usage:
 *   node post.js --photo <file.jpg> "caption"
 *   node post.js --video <file.mp4> "caption"
 *   node post.js --reel <file.mp4> "caption" [--cover <file.jpg>]
 *   node post.js --carousel "caption" <file1.jpg> <file2.jpg> ...
 *
 * Requires .env file in the skill directory with:
 *   IG_USERNAME, IG_PASSWORD
 */

const { IgApiClient } = require('instagram-private-api');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SESSION_FILE = path.join(__dirname, '..', '.session.json');

async function login() {
  const { IG_USERNAME, IG_PASSWORD } = process.env;
  if (!IG_USERNAME || !IG_PASSWORD) {
    console.error('Missing credentials. Create .env with IG_USERNAME and IG_PASSWORD');
    process.exit(1);
  }

  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);

  // Try to restore session
  if (fs.existsSync(SESSION_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      await ig.state.deserialize(saved);
      // Verify session is still valid
      await ig.account.currentUser();
      console.error('Restored session.');
      return ig;
    } catch (e) {
      console.error('Session expired, logging in again...');
    }
  }

  console.error(`Logging in as ${IG_USERNAME}...`);
  await ig.simulate.preLoginFlow();
  await ig.account.login(IG_USERNAME, IG_PASSWORD);
  process.nextTick(async () => await ig.simulate.postLoginFlow());

  // Save session
  const serialized = await ig.state.serialize();
  delete serialized.constants;
  fs.writeFileSync(SESSION_FILE, JSON.stringify(serialized));
  console.error('Session saved.');

  return ig;
}

function readFile(p) {
  if (!fs.existsSync(p)) {
    console.error(`File not found: ${p}`);
    process.exit(1);
  }
  return fs.readFileSync(p);
}

async function postPhoto(ig, filePath, caption) {
  console.error(`Posting photo: ${filePath}`);
  const result = await ig.publish.photo({
    file: readFile(filePath),
    caption: caption || '',
  });
  return result;
}

async function postVideo(ig, filePath, caption, coverPath) {
  console.error(`Posting video: ${filePath}`);
  const video = readFile(filePath);
  const cover = coverPath ? readFile(coverPath) : video; // fallback to video as cover
  const result = await ig.publish.video({
    video,
    coverImage: cover,
    caption: caption || '',
  });
  return result;
}

async function postReel(ig, filePath, caption, coverPath) {
  console.error(`Posting reel: ${filePath}`);
  const video = readFile(filePath);
  if (!coverPath) {
    console.error('Warning: No cover image provided. Reel may fail. Use --cover <file.jpg>');
  }
  const cover = coverPath ? readFile(coverPath) : video;
  // instagram-private-api uses publish.video with toFeed disabled for reels
  const result = await ig.publish.video({
    video,
    coverImage: cover,
    caption: caption || '',
    // Reels-specific
    toFeed: false,
  });
  return result;
}

async function postCarousel(ig, caption, files) {
  console.error(`Posting carousel (${files.length} items)`);
  const items = files.map(f => {
    const ext = path.extname(f).toLowerCase();
    if (['.mp4', '.mov'].includes(ext)) {
      return { video: readFile(f), coverImage: readFile(f) };
    }
    return { file: readFile(f) };
  });
  const result = await ig.publish.album({ items, caption: caption || '' });
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage:');
    console.error('  node post.js --photo <file.jpg> "caption"');
    console.error('  node post.js --video <file.mp4> "caption"');
    console.error('  node post.js --reel <file.mp4> "caption" [--cover <file.jpg>]');
    console.error('  node post.js --carousel "caption" <file1.jpg> <file2.jpg> ...');
    process.exit(1);
  }

  let mode = null;
  let filePath = null;
  let coverPath = null;
  let caption = '';
  const carouselFiles = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--photo' && args[i + 1]) { mode = 'photo'; filePath = args[i + 1]; i++; }
    else if (args[i] === '--video' && args[i + 1]) { mode = 'video'; filePath = args[i + 1]; i++; }
    else if (args[i] === '--reel' && args[i + 1]) { mode = 'reel'; filePath = args[i + 1]; i++; }
    else if (args[i] === '--carousel') { mode = 'carousel'; }
    else if (args[i] === '--cover' && args[i + 1]) { coverPath = args[i + 1]; i++; }
    else if (mode === 'carousel' && !caption) { caption = args[i]; }
    else if (mode === 'carousel') { carouselFiles.push(args[i]); }
    else if (!caption) { caption = args[i]; }
  }

  try {
    const ig = await login();
    let result;

    if (mode === 'photo') result = await postPhoto(ig, filePath, caption);
    else if (mode === 'video') result = await postVideo(ig, filePath, caption, coverPath);
    else if (mode === 'reel') result = await postReel(ig, filePath, caption, coverPath);
    else if (mode === 'carousel') result = await postCarousel(ig, caption, carouselFiles);
    else { console.error('No valid mode specified.'); process.exit(1); }

    const media = result.media || result;
    console.log('');
    console.log(JSON.stringify({
      success: true,
      type: mode,
      media_id: media.id || media.pk,
      code: media.code,
      url: media.code ? `https://www.instagram.com/p/${media.code}/` : null,
      caption: caption.slice(0, 100),
      timestamp: new Date().toISOString(),
    }, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    if (err.response?.body) {
      console.error('Response:', JSON.stringify(err.response.body, null, 2));
    }
    process.exit(1);
  }
}

main();
