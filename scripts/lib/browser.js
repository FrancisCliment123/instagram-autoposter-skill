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

function getBrowserPaths() {
  if (platform === 'darwin') {
    return {
      chrome: {
        exe: [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
        ],
        userDataDir: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
        linkDir: path.join(os.tmpdir(), 'chrome-ig-debug-profile'),
        processName: 'Google Chrome',
      },
      brave: {
        exe: [
          '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
          path.join(os.homedir(), 'Applications', 'Brave Browser.app', 'Contents', 'MacOS', 'Brave Browser'),
        ],
        userDataDir: path.join(os.homedir(), 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
        linkDir: path.join(os.tmpdir(), 'brave-ig-debug-profile'),
        processName: 'Brave Browser',
      },
    };
  }

  if (platform === 'linux') {
    return {
      chrome: {
        exe: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/snap/bin/chromium'],
        userDataDir: path.join(os.homedir(), '.config', 'google-chrome'),
        linkDir: path.join(os.tmpdir(), 'chrome-ig-debug-profile'),
        processName: 'chrome',
      },
      brave: {
        exe: ['/usr/bin/brave-browser', '/usr/bin/brave-browser-stable', '/snap/bin/brave'],
        userDataDir: path.join(os.homedir(), '.config', 'BraveSoftware', 'Brave-Browser'),
        linkDir: path.join(os.tmpdir(), 'brave-ig-debug-profile'),
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
      userDataDir: path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
      linkDir: path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'chrome-ig-debug-profile'),
      processName: 'chrome.exe',
    },
    brave: {
      exe: [
        path.join(os.homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      ],
      userDataDir: path.join(os.homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data'),
      linkDir: path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'brave-ig-debug-profile'),
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

function killBrowser(processName) {
  try {
    if (platform === 'win32') {
      execSync(`taskkill /F /IM ${processName} 2>NUL`, { stdio: 'ignore', shell: true });
    } else {
      execSync(`pkill -f "${processName}" 2>/dev/null`, { stdio: 'ignore', shell: true });
    }
  } catch {}
}

function createLink(target, linkPath) {
  try {
    if (platform === 'win32') {
      execSync(`rmdir "${linkPath}" 2>NUL`, { stdio: 'ignore', shell: true });
    } else {
      execSync(`rm -f "${linkPath}" 2>/dev/null`, { stdio: 'ignore', shell: true });
    }
  } catch {}

  if (platform === 'win32') {
    execSync(`mklink /J "${linkPath}" "${target}"`, { stdio: 'ignore', shell: true });
  } else {
    execSync(`ln -s "${target}" "${linkPath}"`, { stdio: 'ignore', shell: true });
  }
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
 * Launch browser, connect Playwright, return { browser, page, cleanup }.
 * Caller MUST call cleanup() when done.
 */
async function launchAndConnect(browserName = 'chrome') {
  const config = BROWSER_PATHS[browserName];
  if (!config) throw new Error(`Unknown browser: ${browserName}. Use "chrome" or "brave".`);

  const exePath = findExe(browserName);
  if (!exePath) throw new Error(`${browserName} not found on this system.`);

  console.error(`[browser] Closing existing ${browserName}...`);
  killBrowser(config.processName);
  await sleep(2000);

  console.error('[browser] Setting up profile link...');
  createLink(config.userDataDir, config.linkDir);

  console.error('[browser] Launching browser...');
  const child = spawn(exePath, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${config.linkDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
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
    try { await browser.close(); } catch {}
    killBrowser(config.processName);
  };

  return { browser, context, page, cleanup, config };
}

module.exports = {
  launchAndConnect,
  sleep,
  humanDelay,
  platform,
};
