// ---- Tab switching ----
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'inspirations') loadInspirations();
    if (tab.dataset.tab === 'generate') loadInspirationsForSelect();
    if (tab.dataset.tab === 'publish') loadCarousels();
    if (tab.dataset.tab === 'settings') loadStatus();
  });
});

// ---- Utility: stream a POST response into a <pre> element ----
async function streamTo(logId, url, body) {
  const logEl = document.getElementById(logId);
  logEl.textContent = '';
  logEl.style.display = 'block';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      logEl.textContent += decoder.decode(value);
      logEl.scrollTop = logEl.scrollHeight;
    }
  } catch (err) {
    logEl.textContent += '\nError: ' + err.message;
  }
}

// ================================================================
// INSPIRATIONS
// ================================================================
async function loadInspirations() {
  const res = await fetch('/api/inspirations');
  const items = await res.json();
  const list = document.getElementById('inspirations-list');
  if (items.length === 0) {
    list.innerHTML = '<p class="muted">No inspirations yet. Paste an Instagram URL above.</p>';
    return;
  }
  list.innerHTML = items.map(i => renderInspiration(i)).join('');
}

function renderInspiration(i) {
  const brief = i.analysis?.adaptation_brief;
  let briefHtml = '';
  if (brief) {
    const entries = typeof brief === 'string' ? [['brief', brief]] : Object.entries(brief);
    briefHtml = '<div class="brief">' + entries.map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
      return `<div class="brief-key">${escapeHtml(k)}</div><div>${escapeHtml(val).slice(0, 500)}</div>`;
    }).join('') + '</div>';
  }

  return `
    <div class="inspiration">
      <div style="display:flex; justify-content:space-between; align-items:start; gap:12px;">
        <div style="flex:1;">
          <span class="status status-${i.status}">${i.status}</span>
          <span class="code">${escapeHtml(i.code)}</span>
          ${i.notes ? `<div style="margin-top:6px; font-size:14px;">${escapeHtml(i.notes)}</div>` : ''}
          <div class="muted" style="margin-top:4px;">
            <a href="${i.url}" target="_blank">${escapeHtml(i.url)}</a>
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-shrink:0;">
          ${i.status === 'new' ? `<button onclick="analyzeInspiration('${i.code}')">Analyze</button>` : ''}
          <button class="danger" onclick="deleteInspiration('${i.code}')">Delete</button>
        </div>
      </div>
      ${briefHtml}
      ${i.status === 'analyzed' ? `<button onclick="goGenerate('${i.code}')" style="margin-top:12px;">Generate carousel from this</button>` : ''}
    </div>
  `;
}

async function saveInspiration() {
  const url = document.getElementById('insp-url').value.trim();
  const notes = document.getElementById('insp-notes').value.trim();
  if (!url) return alert('Paste a URL');
  const res = await fetch('/api/inspirations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, notes }),
  });
  if (!res.ok) { alert('Error: ' + (await res.text())); return; }
  document.getElementById('insp-url').value = '';
  document.getElementById('insp-notes').value = '';
  loadInspirations();
}

async function analyzeInspiration(code) {
  if (!confirm(`Analyze ${code}? This takes ~1 min and calls Gemini.`)) return;

  // Create a temporary log area near the inspiration
  let logEl = document.getElementById('analyze-log-' + code);
  if (!logEl) {
    const list = document.getElementById('inspirations-list');
    logEl = document.createElement('pre');
    logEl.id = 'analyze-log-' + code;
    logEl.className = 'log';
    list.prepend(logEl);
  }

  logEl.textContent = 'Starting analysis...\n';
  try {
    const res = await fetch(`/api/inspirations/${code}/analyze`, { method: 'POST' });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      logEl.textContent += dec.decode(value);
      logEl.scrollTop = logEl.scrollHeight;
    }
  } catch (err) {
    logEl.textContent += '\nError: ' + err.message;
  }
  loadInspirations();
}

async function deleteInspiration(code) {
  if (!confirm(`Delete ${code}?`)) return;
  await fetch(`/api/inspirations/${code}`, { method: 'DELETE' });
  loadInspirations();
}

// ================================================================
// GENERATE
// ================================================================
async function loadInspirationsForSelect() {
  const res = await fetch('/api/inspirations');
  const items = await res.json();
  const select = document.getElementById('gen-from');
  const analyzed = items.filter(i => i.status === 'analyzed');
  select.innerHTML = '<option value="">— pick an analyzed inspiration —</option>' +
    analyzed.map(i => `<option value="${i.code}">${escapeHtml(i.code)} — ${escapeHtml(i.notes || '')}</option>`).join('');
}

function goGenerate(code) {
  // Switch to generate tab and preselect
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="generate"]').classList.add('active');
  document.getElementById('tab-generate').classList.add('active');
  loadInspirationsForSelect().then(() => {
    document.getElementById('gen-from').value = code;
    document.getElementById('gen-name').value = code + '-' + Date.now().toString(36);
    document.getElementById('gen-name').focus();
  });
}

async function generateCarousel() {
  const from = document.getElementById('gen-from').value;
  const name = document.getElementById('gen-name').value.trim();
  if (!from) return alert('Pick an inspiration first');
  if (!name) return alert('Give this carousel a name');
  await streamTo('gen-log', '/api/generate', { from, name });
}

async function generateFromPrompts() {
  const prompts = document.getElementById('gen-prompts').value;
  const name = document.getElementById('gen-name').value.trim();
  if (!prompts.trim()) return alert('Paste some prompts (one per line)');
  if (!name) return alert('Give this carousel a name');
  await streamTo('gen-log', '/api/generate', { prompts, name });
}

// ================================================================
// PUBLISH
// ================================================================
async function loadCarousels() {
  const res = await fetch('/api/carousels');
  const items = await res.json();
  const list = document.getElementById('carousels-list');
  if (items.length === 0) {
    list.innerHTML = '<p class="muted">No carousels yet. Generate one first.</p>';
    return;
  }
  list.innerHTML = items.map(c => renderCarousel(c)).join('');
}

function renderCarousel(c) {
  const slidesHtml = c.slides.map(s =>
    `<img src="/api/carousels/${encodeURIComponent(c.name)}/slides/${encodeURIComponent(s)}" alt="${s}">`
  ).join('');
  const id = c.name.replace(/[^a-zA-Z0-9]/g, '_');
  return `
    <div class="carousel-card">
      <h3>
        <span>${escapeHtml(c.name)} <span class="badge">${c.slide_count} slides${c.has_reel ? ' + reel' : ''}</span></span>
        <button class="danger" onclick="deleteCarousel('${escapeJs(c.name)}')">Delete</button>
      </h3>
      <div class="slides">${slidesHtml}</div>

      <label>Caption:</label>
      <textarea class="caption-editor" id="cap-${id}" placeholder="Write your caption here. Instagram gives 3-10x reach to posts with music — use 'Stage for mobile' if you want to add trending music."></textarea>

      <div class="carousel-actions">
        <button onclick="publishCarousel('${escapeJs(c.name)}', 'carousel', 'cap-${id}')">Publish as Carousel</button>
        <button class="secondary" onclick="publishCarousel('${escapeJs(c.name)}', 'photo', 'cap-${id}')">Publish as single Photo</button>
        ${c.has_reel ? `<button class="secondary" onclick="publishCarousel('${escapeJs(c.name)}', 'reel', 'cap-${id}')">Publish as Reel</button>` : ''}
        <button class="secondary" onclick="slidesToReel('${escapeJs(c.name)}')">Make reel.mp4 from slides</button>
        <button class="secondary" onclick="stageCarousel('${escapeJs(c.name)}', 'cap-${id}')">Stage for mobile (add music)</button>
      </div>

      <pre id="log-${id}" class="log" style="display:none;"></pre>
    </div>
  `;
}

async function publishCarousel(name, type, captionId) {
  const caption = document.getElementById(captionId).value.trim();
  if (!caption) return alert('Write a caption first');
  if (!confirm(`Publish "${name}" as ${type}?\n\nCaption:\n${caption.slice(0, 200)}`)) return;
  const logId = 'log-' + name.replace(/[^a-zA-Z0-9]/g, '_');
  await streamTo(logId, '/api/post', { name, caption, type });
}

async function stageCarousel(name, captionId) {
  const caption = document.getElementById(captionId).value.trim();
  if (!caption) return alert('Write a caption first');
  const logId = 'log-' + name.replace(/[^a-zA-Z0-9]/g, '_');
  await streamTo(logId, '/api/stage', { name, caption });
}

async function slidesToReel(name) {
  const logId = 'log-' + name.replace(/[^a-zA-Z0-9]/g, '_');
  await streamTo(logId, '/api/slides-to-reel', { name, duration: 4 });
  setTimeout(loadCarousels, 800);
}

async function deleteCarousel(name) {
  if (!confirm(`Delete carousel "${name}"? This removes the local files only.`)) return;
  await fetch(`/api/carousels/${encodeURIComponent(name)}`, { method: 'DELETE' });
  loadCarousels();
}

// ================================================================
// ANALYTICS
// ================================================================
async function loadProfile() {
  const out = document.getElementById('analytics-output');
  out.textContent = 'Loading...';
  const res = await fetch('/api/analytics/profile');
  const data = await res.json();
  out.textContent = JSON.stringify(data, null, 2);
}

async function loadTop() {
  const out = document.getElementById('analytics-output');
  out.textContent = 'Loading top 10...';
  const res = await fetch('/api/analytics/top?count=10');
  const data = await res.json();
  out.textContent = JSON.stringify(data, null, 2);
}

// ================================================================
// SETTINGS
// ================================================================
async function runSetup() {
  if (!confirm('This opens a bot Chrome window. Log into Instagram in that window, then close it.')) return;
  await streamTo('setup-log', '/api/setup', {});
}

async function loadStatus() {
  const res = await fetch('/api/health');
  const data = await res.json();
  document.getElementById('status').innerHTML = `
    <div><strong>Google API key:</strong> ${data.has_google_api_key ? '✓ configured' : '✗ MISSING — add GOOGLE_API_KEY to .env'}</div>
    <div><strong>Skill root:</strong> <code>${escapeHtml(data.skill_root)}</code></div>
    <div><strong>Inspirations:</strong> ${data.inspirations_count}</div>
    <div><strong>Carousels:</strong> ${data.carousels_count}</div>
  `;
}

// ---- helpers ----
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeJs(s) { return String(s).replace(/'/g, "\\'"); }

// ---- init ----
loadInspirations();
