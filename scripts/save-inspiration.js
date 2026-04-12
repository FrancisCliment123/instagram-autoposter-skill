#!/usr/bin/env node
/**
 * Save an Instagram post/reel URL to your swipe file for later analysis.
 *
 * Usage:
 *   node save-inspiration.js <instagram_url> [notes]
 *   node save-inspiration.js --list             # list all inspirations
 *   node save-inspiration.js --remove <id>       # remove one
 */

const fs = require('fs');
const path = require('path');

const INSPIRATIONS_DIR = path.join(__dirname, '..', 'inspirations');
const INDEX_FILE = path.join(INSPIRATIONS_DIR, 'index.json');

function load() {
  if (!fs.existsSync(INSPIRATIONS_DIR)) fs.mkdirSync(INSPIRATIONS_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_FILE)) return [];
  return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
}

function save(items) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(items, null, 2));
}

function extractCode(url) {
  const m = url.match(/\/(p|reel)\/([^/?]+)/);
  return m ? m[2] : null;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage:');
    console.error('  node save-inspiration.js <instagram_url> [notes]');
    console.error('  node save-inspiration.js --list');
    console.error('  node save-inspiration.js --remove <code>');
    process.exit(1);
  }

  const items = load();

  if (args[0] === '--list') {
    console.log(JSON.stringify({
      total: items.length,
      items: items.map(i => ({
        code: i.code,
        url: i.url,
        status: i.status,
        notes: i.notes,
        added_at: i.added_at,
      })),
    }, null, 2));
    return;
  }

  if (args[0] === '--remove' && args[1]) {
    const before = items.length;
    const filtered = items.filter(i => i.code !== args[1]);
    save(filtered);
    console.log(JSON.stringify({
      success: true,
      removed: before - filtered.length,
      code: args[1],
    }, null, 2));
    return;
  }

  // Add new inspiration
  const url = args[0].trim();
  const notes = args.slice(1).join(' ');
  const code = extractCode(url);

  if (!code) {
    console.error('Could not extract post/reel code from URL.');
    console.error('Expected format: https://instagram.com/p/XXX or /reel/XXX');
    process.exit(1);
  }

  if (items.some(i => i.code === code)) {
    console.error(`Already saved: ${code}`);
    process.exit(1);
  }

  const normalized = url.replace(/\?.*$/, '').replace(/\/$/, '') + '/';
  const entry = {
    code,
    url: normalized,
    status: 'new',
    notes: notes || null,
    added_at: new Date().toISOString(),
    downloaded_path: null,
    analysis: null,
  };

  items.push(entry);
  save(items);

  console.log(JSON.stringify({
    success: true,
    saved: entry,
    total_inspirations: items.length,
    next_step: `node scripts/analyze-inspiration.js ${code}`,
  }, null, 2));
}

main();
