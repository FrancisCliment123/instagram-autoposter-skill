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

function waitForDebugger(port, maxWait = 40000, childProcess = null) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      });
      req.on('error', () => {
        // Sanity check: is the child process even alive?
        if (childProcess && childProcess.exitCode !== null) {
          return reject(new Error(
            `Browser process exited with code ${childProcess.exitCode} before becoming ready. ` +
            `This usually means Chrome failed to start. ` +
            `Try closing any Chrome windows and retrying, or run setup.js first.`
          ));
        }
        if (Date.now() - start > maxWait) {
          return reject(new Error(
            `Timed out after ${(maxWait/1000).toFixed(0)}s waiting for Chrome debugger on port ${port}. ` +
            `Checked ${attempts} times. ` +
            `Possible causes: (1) Chrome not installed at expected path, ` +
            `(2) port ${port} already in use by another process, ` +
            `(3) first-run setup not completed — try: node scripts/setup.js`
          ));
        }
        setTimeout(check, 500);
      });
      req.end();
    };
    check();
  });
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 1000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(true));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * Launch a DEDICATED bot browser (separate profile from the user's regular Chrome).
 * The user's normal Chrome stays open and untouched.
 *
 * Options:
 *   browserName: 'chrome' | 'brave'
 *   interactive: if true, keeps the browser open for manual interaction (used by setup)
 *   skipSetupCheck: if true, don't complain about missing profile dir
 */
async function launchAndConnect(opts = {}) {
  const { browserName = 'chrome', interactive = false, skipSetupCheck = false } = opts;

  const config = BROWSER_PATHS[browserName];
  if (!config) throw new Error(`Unknown browser: ${browserName}. Use "chrome" or "brave".`);

  const exePath = findExe(browserName);
  if (!exePath) {
    const tried = BROWSER_PATHS[browserName].exe.join('\n  ');
    throw new Error(
      `${browserName} not found on this system. Tried:\n  ${tried}\n\n` +
      `If you have Chrome installed somewhere else, edit BROWSER_PATHS in scripts/lib/browser.js.`
    );
  }
  console.error(`[browser] Using executable: ${exePath}`);

  // Clean up any zombie bot browser from a previous run
  console.error('[browser] Killing any zombie bot browsers...');
  killBotBrowser();
  await sleep(1500);

  // Verify the port is actually free now
  if (await isPortInUse(DEBUG_PORT)) {
    console.error(`[browser] Port ${DEBUG_PORT} still in use after killing zombies; waiting 3s more...`);
    await sleep(3000);
    if (await isPortInUse(DEBUG_PORT)) {
      throw new Error(
        `Port ${DEBUG_PORT} is in use by another process (not ours). ` +
        `Either close that process, or set GUI_PORT to a different value.`
      );
    }
  }

  // Ensure the bot profile directory exists.
  // If it doesn't and this is a setup run, we'll create it. If it's a post/
  // analytics call and the profile is missing, the user probably never ran
  // setup — warn them explicitly rather than silently creating an empty profile.
  const profileExisted = fs.existsSync(BOT_PROFILE_DIR);
  if (!profileExisted) {
    if (!interactive && !skipSetupCheck) {
      throw new Error(
        `Bot profile not found at ${BOT_PROFILE_DIR}. ` +
        `Run first: node scripts/setup.js — this opens a Chrome window where ` +
        `you log into Instagram once. After that, other scripts will work.`
      );
    }
    fs.mkdirSync(BOT_PROFILE_DIR, { recursive: true });
    console.error(`[browser] Created new bot profile at ${BOT_PROFILE_DIR}`);
  } else {
    console.error(`[browser] Using existing bot profile at ${BOT_PROFILE_DIR}`);
  }

  console.error(`[browser] Launching bot ${browserName}...`);
  // Capture stderr so we can surface Chrome startup errors.
  // shell:false so argv is passed cleanly (paths with spaces handled correctly).
  const child = spawn(exePath, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${BOT_PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1280,900',
    'about:blank',
  ], {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: false,
  });
  let stderrBuf = '';
  if (child.stderr) child.stderr.on('data', (c) => { stderrBuf += c.toString(); });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[browser] Chrome exited with code ${code}. Stderr: ${stderrBuf.slice(0, 500)}`);
    }
  });
  child.unref();

  console.error(`[browser] Waiting for CDP on port ${DEBUG_PORT}...`);
  try {
    await waitForDebugger(DEBUG_PORT, 40000, child);
  } catch (err) {
    // Enrich the error with any Chrome stderr we captured
    const tail = stderrBuf ? `\n\nChrome stderr (last 500 chars):\n${stderrBuf.slice(-500)}` : '';
    // Try to kill the half-started process so we don't leave zombies
    try { child.kill('SIGKILL'); } catch {}
    killBotBrowser();
    throw new Error(err.message + tail);
  }

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
