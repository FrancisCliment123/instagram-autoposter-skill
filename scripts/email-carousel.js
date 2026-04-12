#!/usr/bin/env node
/**
 * Email a generated carousel to yourself for mobile publishing.
 *
 * Instagram's web doesn't let you add music to posts. The fastest way
 * to get the slides to your phone (so you can publish with trending
 * music) is email-to-yourself: no cloud sync setup, no extra apps —
 * just a Gmail push notification and tap-to-save-to-photos.
 *
 * Usage:
 *   node email-carousel.js --from <name> --caption "..." --to you@gmail.com
 *   node email-carousel.js --from <name> --caption-file caption.txt
 *
 * Auth: uses a Gmail App Password (not your regular password).
 * Set up once:
 *   1. Enable 2FA on your Gmail: myaccount.google.com/security
 *   2. Create app password: myaccount.google.com/apppasswords
 *      (name it "instagram-autoposter")
 *   3. Add to .env:
 *        GMAIL_USER=you@gmail.com
 *        GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
 *        DEFAULT_EMAIL_TO=you@gmail.com   (optional; where to send)
 */

const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const GENERATED_DIR = path.join(__dirname, '..', 'generated');

function buildHtmlBody({ name, slideCount, hasReel, caption }) {
  const captionHtml = caption
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
<h2 style="color: #0a1f3d;">📸 Carousel ready: ${name}</h2>

<p><strong>Publishing with trending music gives you ~3–10× more reach.</strong> Instagram's algorithm pushes music-enabled carousels into the Reels tab.</p>

<h3>On your phone (~60 seconds):</h3>

<ol>
  <li><strong>Save attachments to your photos</strong>: long-press each slide-*.png and save to camera roll (in order: slide-01, slide-02, ...).</li>
  <li>Open Instagram → tap <strong>+</strong> (new post) → <strong>Post</strong>.</li>
  <li>Select the ${slideCount} slides in order.</li>
  <li>Tap <strong>Next</strong> → <strong>Next</strong> (skip filters).</li>
  <li>Tap <strong>Add music</strong> → pick a trending sound that fits the vibe.</li>
  <li>Paste the caption below.</li>
  <li>Tap <strong>Share</strong>. Done.</li>
</ol>

${hasReel ? `<p><em>Alternative: publish as a Reel instead using the attached <code>reel.mp4</code>. Same flow but choose Reel instead of Post.</em></p>` : ''}

<h3>Caption (copy this)</h3>
<div style="background: #F5F3EA; border-left: 4px solid #0a1f3d; padding: 16px; border-radius: 4px; white-space: pre-wrap; font-family: -apple-system, sans-serif;">${captionHtml}</div>

<hr style="margin-top: 32px; border: none; border-top: 1px solid #ddd;">
<p style="color: #888; font-size: 12px;">Sent by instagram-autoposter at ${new Date().toLocaleString()}</p>
</body></html>`;
}

function buildTextBody({ name, slideCount, hasReel, caption }) {
  return `📸 Carousel ready: ${name}

Publishing with trending music gives you ~3–10× more reach.

ON YOUR PHONE (~60 seconds):
1. Save all slide-*.png attachments to your photos (in order)
2. Open Instagram → + → Post
3. Select the ${slideCount} slides in order
4. Next → Next
5. Tap "Add music" → pick a trending sound
6. Paste caption below
7. Share

${hasReel ? 'Alternative: use the attached reel.mp4 as a Reel instead.\n\n' : ''}CAPTION (copy):
${'─'.repeat(40)}
${caption}
${'─'.repeat(40)}
`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage:');
    console.error('  email-carousel.js --from <name> --caption "..." [--to email]');
    console.error('  email-carousel.js --from <name> --caption-file file.txt');
    console.error('');
    console.error('Requires in .env: GMAIL_USER, GMAIL_APP_PASSWORD (+ optional DEFAULT_EMAIL_TO)');
    process.exit(1);
  }

  const { GMAIL_USER, GMAIL_APP_PASSWORD, DEFAULT_EMAIL_TO } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('Missing Gmail credentials. Add to .env:');
    console.error('  GMAIL_USER=you@gmail.com');
    console.error('  GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx');
    console.error('');
    console.error('Create an app password at: https://myaccount.google.com/apppasswords');
    console.error('(requires 2FA enabled on your Google account)');
    process.exit(1);
  }

  let fromName = null;
  let caption = null;
  let captionFile = null;
  let toEmail = DEFAULT_EMAIL_TO || GMAIL_USER;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) { fromName = args[i + 1]; i++; }
    else if (args[i] === '--caption' && args[i + 1]) { caption = args[i + 1]; i++; }
    else if (args[i] === '--caption-file' && args[i + 1]) { captionFile = args[i + 1]; i++; }
    else if (args[i] === '--to' && args[i + 1]) { toEmail = args[i + 1]; i++; }
  }

  if (!fromName) {
    console.error('--from <name> is required');
    process.exit(1);
  }

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

  const srcDir = path.join(GENERATED_DIR, fromName);
  if (!fs.existsSync(srcDir)) {
    console.error(`Source folder not found: ${srcDir}`);
    console.error(`Run generate-carousel.js --name ${fromName} first.`);
    process.exit(1);
  }

  const files = fs.readdirSync(srcDir);
  const slideFiles = files
    .filter(f => /^slide-\d+\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort();
  if (slideFiles.length === 0) {
    console.error(`No slide files found in ${srcDir}`);
    process.exit(1);
  }

  const reelFile = files.find(f => /\.mp4$/i.test(f));

  const attachments = slideFiles.map(f => ({
    filename: f,
    path: path.join(srcDir, f),
  }));
  if (reelFile) {
    attachments.push({ filename: 'reel.mp4', path: path.join(srcDir, reelFile) });
  }

  console.error(`[email] Preparing email to ${toEmail}...`);
  console.error(`[email] Attachments: ${attachments.length} (${slideFiles.length} slides${reelFile ? ' + reel' : ''})`);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD.replace(/\s+/g, ''), // strip spaces from app password
    },
  });

  const subject = `📸 IG Carousel ready: ${fromName}`;
  const mailOptions = {
    from: `"Instagram Autoposter" <${GMAIL_USER}>`,
    to: toEmail,
    subject,
    text: buildTextBody({ name: fromName, slideCount: slideFiles.length, hasReel: !!reelFile, caption }),
    html: buildHtmlBody({ name: fromName, slideCount: slideFiles.length, hasReel: !!reelFile, caption }),
    attachments,
  };

  console.error('[email] Sending...');
  const info = await transporter.sendMail(mailOptions);

  console.log(JSON.stringify({
    success: true,
    name: fromName,
    sent_to: toEmail,
    message_id: info.messageId,
    subject,
    attachments: attachments.length,
    slides: slideFiles.length,
    has_reel: !!reelFile,
    note: 'Check your phone — Gmail push notification should arrive instantly.',
  }, null, 2));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
