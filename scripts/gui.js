#!/usr/bin/env node
/**
 * Local web GUI for instagram-autoposter.
 * Run:  node scripts/gui.js
 * Open: http://localhost:3456
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = process.env.GUI_PORT ? parseInt(process.env.GUI_PORT) : 3456;
const SKILL_ROOT = path.join(__dirname, '..');
const GENERATED_DIR = path.join(SKILL_ROOT, 'generated');
const INSPIRATIONS_DIR = path.join(SKILL_ROOT, 'inspirations');
const INDEX_FILE = path.join(INSPIRATIONS_DIR, 'index.json');
const GUI_DIR = path.join(SKILL_ROOT, 'gui');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(GUI_DIR));

// ---- helpers ----

function loadInspirations() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
}

function listCarousels() {
  if (!fs.existsSync(GENERATED_DIR)) return [];
  return fs.readdirSync(GENERATED_DIR)
    .filter(name => {
      const p = path.join(GENERATED_DIR, name);
      return fs.statSync(p).isDirectory();
    })
    .map(name => {
      const p = path.join(GENERATED_DIR, name);
      const files = fs.readdirSync(p);
      const slides = files.filter(f => /^slide-\d+\.(png|jpg|jpeg|webp)$/i.test(f)).sort();
      const reel = files.find(f => /\.mp4$/i.test(f));
      return {
        name,
        slides,
        slide_count: slides.length,
        has_reel: !!reel,
        modified: fs.statSync(p).mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

/**
 * Run a script child process and stream stdout/stderr to a callback.
 * Returns a promise resolving to { code, stdout, stderr }.
 */
function runScript(scriptName, args, onLog) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, scriptName);
    const child = spawn('node', [scriptPath, ...args], {
      cwd: SKILL_ROOT,
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onLog) onLog('stdout', text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onLog) onLog('stderr', text);
    });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// ---- API ----

// Inspirations
app.get('/api/inspirations', (req, res) => {
  res.json(loadInspirations());
});

app.post('/api/inspirations', async (req, res) => {
  const { url, notes } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  const result = await runScript('save-inspiration.js', [url, notes || '']);
  if (result.code !== 0) return res.status(500).json({ error: result.stderr || 'failed' });
  try { res.json(JSON.parse(result.stdout)); } catch { res.json({ stdout: result.stdout }); }
});

app.post('/api/inspirations/:code/analyze', async (req, res) => {
  const code = req.params.code;
  res.setHeader('Content-Type', 'text/plain');
  const onLog = (_stream, text) => res.write(text);
  const result = await runScript('analyze-inspiration.js', [code], onLog);
  res.end(`\n---EXIT ${result.code}---`);
});

app.delete('/api/inspirations/:code', async (req, res) => {
  const result = await runScript('save-inspiration.js', ['--remove', req.params.code]);
  if (result.code !== 0) return res.status(500).json({ error: result.stderr });
  res.json({ success: true });
});

// Carousels
app.get('/api/carousels', (req, res) => {
  res.json(listCarousels());
});

app.get('/api/carousels/:name/slides/:file', (req, res) => {
  const { name, file } = req.params;
  if (!/^slide-\d+\.(png|jpg|jpeg|webp)$/i.test(file) && !/\.mp4$/i.test(file)) {
    return res.status(400).send('Invalid file');
  }
  const p = path.join(GENERATED_DIR, name, file);
  if (!fs.existsSync(p)) return res.status(404).send('Not found');
  res.sendFile(p);
});

app.delete('/api/carousels/:name', (req, res) => {
  const p = path.join(GENERATED_DIR, req.params.name);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  fs.rmSync(p, { recursive: true, force: true });
  res.json({ success: true });
});

app.post('/api/generate', async (req, res) => {
  const { from, name, prompt, prompts } = req.body;
  const args = [];
  if (from) args.push('--from', from);
  if (prompt) args.push('--prompt', prompt);
  if (prompts) {
    // Write to a temp file
    const tmp = path.join(SKILL_ROOT, `.tmp-prompts-${Date.now()}.txt`);
    fs.writeFileSync(tmp, prompts);
    args.push('--prompts', tmp);
  }
  if (!name) return res.status(400).json({ error: 'name is required' });
  args.push('--name', name);

  res.setHeader('Content-Type', 'text/plain');
  const onLog = (_stream, text) => res.write(text);
  const result = await runScript('generate-carousel.js', args, onLog);
  res.end(`\n---EXIT ${result.code}---`);
});

// Posting
app.post('/api/post', async (req, res) => {
  const { name, caption, type } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!caption) return res.status(400).json({ error: 'caption required' });

  const carouselDir = path.join(GENERATED_DIR, name);
  if (!fs.existsSync(carouselDir)) return res.status(404).json({ error: 'carousel not found' });

  const files = fs.readdirSync(carouselDir);
  const slides = files.filter(f => /^slide-\d+\.(png|jpg|jpeg|webp)$/i.test(f)).sort();

  let args;
  if (type === 'reel') {
    const reel = files.find(f => /\.mp4$/i.test(f));
    if (!reel) return res.status(400).json({ error: 'no reel.mp4 in this carousel' });
    args = ['--reel', path.join(carouselDir, reel), caption];
  } else if (type === 'photo') {
    if (slides.length === 0) return res.status(400).json({ error: 'no slides' });
    args = ['--photo', path.join(carouselDir, slides[0]), caption];
  } else {
    // carousel (default)
    if (slides.length < 2) return res.status(400).json({ error: 'need at least 2 slides for carousel' });
    args = ['--carousel', caption, ...slides.map(s => path.join(carouselDir, s))];
  }

  res.setHeader('Content-Type', 'text/plain');
  const onLog = (_stream, text) => res.write(text);
  const result = await runScript('post.js', args, onLog);
  res.end(`\n---EXIT ${result.code}---`);
});

// Stage
app.post('/api/stage', async (req, res) => {
  const { name, caption } = req.body;
  if (!name || !caption) return res.status(400).json({ error: 'name + caption required' });
  res.setHeader('Content-Type', 'text/plain');
  const onLog = (_stream, text) => res.write(text);
  const result = await runScript('stage-carousel.js', ['--from', name, '--caption', caption], onLog);
  res.end(`\n---EXIT ${result.code}---`);
});

// Slides-to-reel
app.post('/api/slides-to-reel', async (req, res) => {
  const { name, duration } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  res.setHeader('Content-Type', 'text/plain');
  const onLog = (_stream, text) => res.write(text);
  const args = ['--from', name];
  if (duration) args.push('--duration', String(duration));
  const result = await runScript('slides-to-reel.js', args, onLog);
  res.end(`\n---EXIT ${result.code}---`);
});

// Analytics
app.get('/api/analytics/profile', async (req, res) => {
  const result = await runScript('analytics.js', ['--profile']);
  try { res.json(JSON.parse(result.stdout)); } catch { res.json({ error: result.stderr, stdout: result.stdout }); }
});

app.get('/api/analytics/top', async (req, res) => {
  const count = req.query.count || 10;
  const result = await runScript('analytics.js', ['--top', String(count)]);
  try { res.json(JSON.parse(result.stdout)); } catch { res.json({ error: result.stderr, stdout: result.stdout }); }
});

// Setup
app.post('/api/setup', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  const onLog = (_stream, text) => res.write(text);
  const result = await runScript('setup.js', [], onLog);
  res.end(`\n---EXIT ${result.code}---`);
});

// Health
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    has_google_api_key: !!process.env.GOOGLE_API_KEY,
    skill_root: SKILL_ROOT,
    inspirations_count: loadInspirations().length,
    carousels_count: listCarousels().length,
  });
});

// ---- start ----
require('dotenv').config({ path: path.join(SKILL_ROOT, '.env') });

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  instagram-autoposter GUI running             ║');
  console.log(`║  ${url.padEnd(45)}║`);
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');
  console.log('Press Ctrl+C to stop.');

  // Try to auto-open the browser
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start ""'
    : 'xdg-open';
  try { spawn(opener, [url], { shell: true, detached: true, stdio: 'ignore' }).unref(); } catch {}
});
