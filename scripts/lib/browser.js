/**
 * Cross-platform Playwright browser launcher via CDP.
 * Connects to the user's real Chrome/Brave profile so Instagram sees
 * a legitimate logged-in session (no checkpoint triggers).
 *
 * Supports: Windows, macOS, Linux
 */

const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const platform = os.platform();
const DEBUG_PORT = 9223; // different port from Reddit skill to avoid conflicts

/**
 * Dedicated bot profile path — OUTSIDE the user's real Chrome profile.
 * This lets the user keep their normal Chrome open while the bot runs.
 * The profile persists between runs (login happens once, in setup).
 */
const BOT_PROFILE_DIR = path.join(os.homedir(), '.instagram-bot-profile');

function getBrowserPaths() {
  if (platform === 'darwin') {
    return {
      chrome: {
        exe: [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
        ],
        processName: 'Google Chrome',
      },
      brave: {
        exe: [
          '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
          path.join(os.homedir(), 'Applications', 'Brave Browser.app', 'Contents', 'MacOS', 'Brave Browser'),
        ],
        processName: 'Brave Browser',
      },
    };
  }

  if (platform === 'linux') {
    return {
      chrome: {
        exe: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/snap/bin/chromium'],
        processName: 'chrome',
      },
      brave: {
        exe: ['/usr/bin/brave-browser', '/usr/bin/brave-browser-stable', '/snap/bin/brave'],
        processName: 'brave',
      },
    };
  }

  // Windows
  return {
    chrome: {
      exe: [
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ],
      processName: 'chrome.exe',
    },
    brave: {
      exe: [
        path.join(os.homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      ],
      processName: 'brave.exe',
    },
  };
}

const BROWSER_PATHS = getBrowserPaths();

function findExe(name) {
  const paths = BROWSER_PATHS[name]?.exe || [];
  for (const p of paths) if (fs.existsSync(p)) return p;
  return null;
}

/**
 * Kill ONLY the bot's browser instance (by matching the bot profile path in cmdline).
 * Leaves the user's normal Chrome running.
 */
function killBotBrowser() {
  try {
    if (platform === 'win32') {
      // On Windows, use WMIC to find processes with our bot profile path and kill by PID
      try {
        const escaped = BOT_PROFILE_DIR.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const out = execSync(
          `wmic process where "CommandLine like '%${escaped}%'" get ProcessId /FORMAT:VALUE`,
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: true, timeout: 5000 }
        );
        const pids = out.split('\n').map(l => l.match(/ProcessId=(\d+)/)?.[1]).filter(Boolean);
        pids.forEach(pid => {
          try { execSync(`taskkill /F /PID ${pid} 2>NUL`, { stdio: 'ignore', shell: true }); } catch {}
        });
      } catch {}
    } else {
      // macOS / Linux — pkill with full command line match of our bot profile dir
      execSync(`pkill -f "${BOT_PROFILE_DIR}" 2>/dev/null`, { stdio: 'ignore', shell: true });
    }
  } catch {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function humanDelay(min = 800, max = 2500) {
  return sleep(min + Math.random() * (max - min));
}

function waitForDebugger(port, maxWait = 25000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      });
      req.on('error', () => {
        if (Date.now() - start > maxWait) reject(new Error('Timed out waiting for browser'));
        else setTimeout(check, 500);
      });
      req.end();
    };
    check();
  });
}

/**
 * Launch a DEDICATED bot browser (separate profile from the user's regular Chrome).
 * The user's normal Chrome stays open and untouched.
 *
 * Options:
 *   browserName: 'chrome' | 'brave'
 *   headless: if true, runs without a visible window (only set after setup is done)
 *   interactive: if true, keeps the browser open for manual interaction (used by setup)
 */
async function launchAndConnect(opts = {}) {
  const { browserName = 'chrome', interactive = false } = opts;

  const config = BROWSER_PATHS[browserName];
  if (!config) throw new Error(`Unknown browser: ${browserName}. Use "chrome" or "brave".`);

  const exePath = findExe(browserName);
  if (!exePath) throw new Error(`${browserName} not found on this system.`);

  // Clean up any zombie bot browser from a previous run
  killBotBrowser();
  await sleep(500);

  // Ensure the bot profile directory exists
  if (!fs.existsSync(BOT_PROFILE_DIR)) {
    fs.mkdirSync(BOT_PROFILE_DIR, { recursive: true });
  }

  console.error(`[browser] Launching bot ${browserName} (profile: ${BOT_PROFILE_DIR})...`);
  const child = spawn(exePath, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${BOT_PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1280,900',
    'about:blank',
  ], { detached: true, stdio: 'ignore', shell: true });
  child.unref();

  console.error('[browser] Waiting for debugger...');
  await waitForDebugger(DEBUG_PORT);

  console.error('[browser] Connecting Playwright...');
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  const cleanup = async () => {
    if (interactive) return; // setup mode: keep browser open for manual login
    try { await browser.close(); } catch {}
    killBotBrowser();
  };

  return { browser, context, page, cleanup, config, profileDir: BOT_PROFILE_DIR };
}

module.exports = {
  launchAndConnect,
  killBotBrowser,
  sleep,
  humanDelay,
  platform,
  BOT_PROFILE_DIR,
};
