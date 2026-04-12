#!/usr/bin/env node
/**
 * Instagram Bot - First Time Setup
 *
 * Opens a dedicated bot browser (separate profile from your normal Chrome).
 * You log into Instagram ONCE in this window, then close it.
 * After that, post.js and analytics.js will use this session automatically.
 *
 * Your regular Chrome is not touched and stays open.
 *
 * Usage:
 *   node setup.js
 *   node setup.js --browser brave
 */

const { launchAndConnect, BOT_PROFILE_DIR } = require('./lib/browser');

async function main() {
  const args = process.argv.slice(2);
  let browserName = 'chrome';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--browser' && args[i + 1]) { browserName = args[i + 1]; i++; }
  }

  console.error('');
  console.error('=== Instagram Bot - First Time Setup ===');
  console.error('');
  console.error(`Bot profile: ${BOT_PROFILE_DIR}`);
  console.error('');

  const session = await launchAndConnect({ browserName, interactive: true });

  console.error('Navigating to Instagram...');
  await session.page.goto('https://www.instagram.com/accounts/login/', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });

  console.error('');
  console.error('-----------------------------------------------------');
  console.error('  NOW DO THIS:');
  console.error('  1. Log into Instagram in the browser window that opened');
  console.error('  2. Complete any 2FA if prompted');
  console.error('  3. Once you see your feed, CLOSE the browser window');
  console.error('-----------------------------------------------------');
  console.error('');
  console.error('Waiting for you to close the bot browser...');
  console.error('(This window will exit automatically when you close the browser)');
  console.error('');

  // Wait until the browser is closed (disconnected)
  await new Promise((resolve) => {
    session.browser.on('disconnected', resolve);
    // Safety timeout: give user up to 15 minutes
    setTimeout(resolve, 15 * 60 * 1000);
  });

  console.error('Browser closed. Setup complete!');
  console.error('You can now use post.js and analytics.js.');
  console.log(JSON.stringify({
    success: true,
    profile_dir: BOT_PROFILE_DIR,
    browser: browserName,
    note: 'Session is persisted. Subsequent post.js / analytics.js runs will reuse it.',
  }, null, 2));
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
