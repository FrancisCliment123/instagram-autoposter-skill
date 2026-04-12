# instagram-autoposter

End-to-end Instagram content engine. Turn one post you admire into a finished, on-brand post on your own account — no Facebook app review, no API keys for Instagram.

```
  save  →  analyze  →  generate  →  (optional) slides→reel  →  post  →  analytics
```

## What it does

- **Save** any public Instagram post URL as a reference
- **Analyze** it with Gemini Vision: extracts hook, structure, visual style, and writes an adaptation brief for your brand
- **Generate** a new carousel with Nano Banana 2 that matches the inspiration's style
- **Convert** carousel slides into a 9:16 Reels MP4 (`ffmpeg-static`, no manual install)
- **Post** carousels / reels / photos / videos through your real Chrome (dedicated bot profile — your normal Chrome stays open)
- **Read** your own metrics and rank posts by a weighted engagement score

Works on Windows, macOS, and Linux.

## Why browser automation instead of the Instagram Graph API

The official Graph API requires a Business account, a connected Facebook Page, a Meta Developer app, and 2–4 weeks of app review per permission. This skill skips all of that by driving a dedicated logged-in Chrome profile with Playwright — Instagram sees a normal user because it is one.

## Install

```bash
git clone https://github.com/FrancisCliment123/instagram-autoposter-skill \
  ~/.claude/skills/instagram-autoposter
cd ~/.claude/skills/instagram-autoposter
npm install
```

Create `.env`:

```
GOOGLE_API_KEY=get_one_at_aistudio.google.com/apikey
```

First-time Instagram login (one time only):

```bash
node scripts/setup.js
```

## 🖥️ Web GUI (recommended)

Start a local web UI with all features in one place:

```bash
npm run gui
```

Opens `http://localhost:3456` in your browser. No terminal needed — tabs for inspirations, generation, publishing, analytics, and settings.

## Quick workflow

```bash
# 1. Save an Instagram post you want to learn from
node scripts/save-inspiration.js https://instagram.com/p/ABC123/ "cool hook"

# 2. Download slides + Gemini Vision analysis
node scripts/analyze-inspiration.js ABC123

# 3. Generate a new carousel matching the inspiration's style
node scripts/generate-carousel.js --from ABC123 --name my-post

# 4. (Optional) Build a 9:16 Reel MP4 from those slides
node scripts/slides-to-reel.js --from my-post --duration 4

# 5. Post it
node scripts/post.js --carousel "caption" generated/my-post/slide-*.png

# 6. After 24-48h, measure
node scripts/analytics.js --top 10
```

See [SKILL.md](SKILL.md) for the full reference.

## Requirements

- Node.js 18+
- Chrome or Brave
- Google Gemini API key (free tier works)

## Safety

- Only automates your own account
- No auto-likes, follows, comments, or DMs
- Dedicated bot Chrome profile — never touches your regular browser
- Recommended cadence: 1–3 posts/day, spaced a few hours apart

## License

MIT.
