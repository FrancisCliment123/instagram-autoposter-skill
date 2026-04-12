---
name: instagram-autoposter
version: "3.4.0"
description: "End-to-end Instagram content engine for founders and marketers. Save competitor posts as inspiration, analyze them with Gemini Vision, generate on-brand carousel slides with Nano Banana 2, convert slides to Reels video, and publish carousels/reels/photos through a dedicated browser bot (your regular Chrome stays open). Read engagement metrics and iterate. No Facebook app review needed. Works on Windows, macOS, and Linux. TRIGGER: instagram, post reel, post carousel, generate carousel, nano banana, ig inspiration, ig analytics, slides to reel."
argument-hint: 'instagram-autoposter analyze <instagram_url>'
allowed-tools: Bash, Read, Write
user-invocable: true
author: FrancisCliment123
license: MIT
homepage: https://github.com/FrancisCliment123/instagram-autoposter-skill
repository: https://github.com/FrancisCliment123/instagram-autoposter-skill
metadata:
  openclaw:
    emoji: "📸"
    requires:
      bins:
        - node
    homepage: https://github.com/FrancisCliment123/instagram-autoposter-skill
    tags:
      - instagram
      - reels
      - carousel
      - social-media
      - posting
      - analytics
      - playwright
      - nano-banana
      - gemini
---

# Instagram Autoposter — Full Content Engine

Find what works, generate on-brand content, publish, measure, repeat.

This skill turns one IG post you admire into a finished post on your own account:

```
  save  →  analyze  →  generate  →  (optional) slides→reel  →  post  →  analytics
```

Everything runs locally. Uses your own Chrome (not your API keys) for Instagram actions, and the Gemini API for analysis + image generation.

## 🆕 Web GUI (recommended way to use this)

Run once:
```bash
npm install    # (first time only)
npm run gui
```

Your browser opens at `http://localhost:3456` with a simple visual interface — no terminal needed. Five tabs:

- **Inspirations** — paste IG URLs, analyze them, see the briefs
- **Generate** — pick an analyzed inspiration, name the carousel, click Generate
- **Publish** — preview slides, write caption, publish as Carousel / Photo / Reel, or Stage to your phone
- **Analytics** — profile stats and top 10 posts
- **Settings** — run first-time IG login, see status

The CLI scripts below still work — the GUI is just a friendly wrapper.

---

## What's in the box

| Script | Purpose |
|---|---|
| `setup.js` | One-time login into a dedicated bot Chrome profile |
| `save-inspiration.js` | Save a public IG post URL you want to learn from |
| `analyze-inspiration.js` | Download slides + run Gemini Vision to extract hook, style, structure, and an adaptation brief for your brand |
| `generate-carousel.js` | Generate a new carousel with Nano Banana 2 (Gemini 3.1 Flash Image) using the inspiration's style as guidance |
| `slides-to-reel.js` | Convert carousel slides into a 9:16 MP4 for Reels |
| `post.js` | Publish a photo, video, reel, or carousel through the bot browser (no music — web limitation) |
| `stage-carousel.js` | Prepare a carousel for **mobile publishing with trending music** (web can't add music) — drops everything into a cloud-synced folder so you can finish from your phone in ~60 seconds |
| `analytics.js` | Read your own posts' metrics (likes, comments, views) and compute a weighted engagement score |

---

## Requirements

- **Node.js 18+**
- **Chrome or Brave** installed, logged into the Instagram account you want to post from (via `setup.js` below)
- **Google Gemini API key** (free tier is fine): get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **~500 MB disk** for Playwright + Chromium + ffmpeg-static

Works on Windows, macOS, and Linux — platform is auto-detected.

---

## Install

```bash
git clone https://github.com/FrancisCliment123/instagram-autoposter-skill ~/.claude/skills/instagram-autoposter
cd ~/.claude/skills/instagram-autoposter
npm install
```

Create `.env` in the skill root:

```
GOOGLE_API_KEY=your_key_here
```

The `.env` file is gitignored — your key never leaves your machine.

---

## First-time setup (log into Instagram once)

```bash
node scripts/setup.js
```

What happens:
1. A new Chrome window opens using a **separate profile** at `~/.instagram-bot-profile/`
2. You log into Instagram manually in that window (complete 2FA if asked)
3. Close the window when you see your feed

Your regular Chrome is never touched. The bot profile is cached forever — you won't log in again unless Instagram invalidates the session (rare, usually only after a password change).

---

## Typical workflow

### 1. Save an IG post you like

```bash
node scripts/save-inspiration.js https://www.instagram.com/p/ABC123/ "strong hook, clean grid layout"
```

### 2. Analyze it

```bash
node scripts/analyze-inspiration.js ABC123
```

Downloads every slide to `inspirations/ABC123/` and calls Gemini Vision. Output is saved into `inspirations/index.json` and includes:

- `hook` — the scroll-stopping opening
- `structure` — how information is organized across slides
- `visual_style` — palette, typography, layout patterns
- `text_overlay_patterns` — headline vs body treatment
- `why_it_works` — 3 specific reasons
- `adaptation_brief` — concrete content idea for your brand

### 3. Generate a new carousel

```bash
node scripts/generate-carousel.js --from ABC123 --name my-first-post
```

Produces 5 slides in `generated/my-first-post/slide-NN.png` using Nano Banana 2 (`gemini-3.1-flash-image-preview`).

The prompts are built from the inspiration's analysis so the new carousel matches the visual language while carrying your brand's message.

Alternative: pass your own prompts file or a single prompt:

```bash
node scripts/generate-carousel.js --prompts my-prompts.txt --name custom
node scripts/generate-carousel.js --prompt "Clean minimalist slide..." --name test
```

### 4. (Optional) Convert the carousel into a Reel video

```bash
node scripts/slides-to-reel.js --from my-first-post --duration 4
```

Produces `generated/my-first-post/my-first-post.mp4` — 1080×1920 vertical, 9:16, each slide on screen for 4s, padded with a cream background that matches the default slide style. Override with `--bg RRGGBB` if your palette is different.

### 5. Publish

Carousel:
```bash
node scripts/post.js --carousel "your caption with #hashtags" \
  generated/my-first-post/slide-01.png \
  generated/my-first-post/slide-02.png \
  generated/my-first-post/slide-03.png \
  generated/my-first-post/slide-04.png \
  generated/my-first-post/slide-05.png
```

Reel:
```bash
node scripts/post.js --reel generated/my-first-post/my-first-post.mp4 "your caption"
```

Photo or feed video:
```bash
node scripts/post.js --photo image.jpg "caption"
node scripts/post.js --video clip.mp4 "caption"
```

> **Why no music?** Instagram's web interface doesn't expose its music library — only the mobile app does. For music-enabled posts, use the `stage-carousel.js` flow below.

### 5b. Publish with trending music (recommended for hero posts)

Carousels with trending music get pushed into the Reels tab and typically reach 3–10× more accounts than silent posts. Instagram only lets you add music from the mobile app, so this script stages everything for a fast mobile publish:

```bash
node scripts/stage-carousel.js --from my-first-post --caption "Your caption here"
```

Output goes to `~/.instagram-bot-staged/my-first-post/` (override with `--out <path>` or `STAGE_DIR` env var):

```
<stage-dir>/my-first-post/
  slide-01.png, slide-02.png, ...
  reel.mp4                    (if you ran slides-to-reel.js)
  caption.txt                 (ready to copy)
  INSTRUCTIONS.md             (step-by-step for mobile)
```

**Configure your phone sync once** — pick any one of these:

| Service | How to set it up |
|---|---|
| **iCloud Drive** (iPhone + Mac) | Set `STAGE_DIR=~/Library/Mobile\ Documents/com~apple~CloudDocs/instagram-bot-staged` in `.env`. Folder appears in Files app on iPhone |
| **Google Drive** (any phone) | Install Google Drive Desktop, set `STAGE_DIR=<G:\>\\My\ Drive\\instagram-bot-staged` (Windows) or `~/Google\ Drive/instagram-bot-staged` (Mac). On phone: Google Drive app |
| **Dropbox** | Install Dropbox desktop, set `STAGE_DIR=~/Dropbox/instagram-bot-staged`. On phone: Dropbox app |
| **OneDrive** | Similar to above |

**Then on your phone** (~60 seconds):
1. Open the synced folder → save all `slide-*.png` to your photos
2. Instagram → `+` → Post → select slides in order
3. Next → Next → tap **Add music** → pick a trending sound
4. Paste caption from `caption.txt` → Share

After publishing, clean up:
```bash
node scripts/stage-carousel.js --clean my-first-post
```

Other commands:
```bash
node scripts/stage-carousel.js --list              # see what's currently staged
node scripts/stage-carousel.js --caption-file file.txt --from my-post   # read caption from file
```

### 6. Measure after 24-48h

```bash
node scripts/analytics.js --profile
node scripts/analytics.js --top 10
node scripts/analytics.js --reels-only --count 30
```

The `engagement_score` is a weighted formula (`likes×1 + comments×5 + saves×10 + shares×15 + views×0.01`) so you can see which posts actually move the algorithm, not just which got the most likes.

---

## Safety / staying unflagged

- Only automates actions on **your own account**
- Never automates likes, follows, comments on others, or DMs
- Uses your real logged-in Chrome session via a dedicated profile — Instagram sees a normal user, not an API client
- Recommended cadence: 1-3 posts per day max, spaced at least a few hours apart
- If Instagram ever asks for a security challenge, complete it manually in the bot profile (rare)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Not logged into Instagram` | Re-run `node scripts/setup.js` and log in again |
| `Create button not found` | Instagram UI language changed. Open an issue with the Spanish/English/your-language name of the "Create" button — selectors are easy to add in `post.js` |
| Generated slide has duplicate or odd text | Re-run `generate-carousel.js` (Nano Banana 2 is good but occasionally off); or edit the prompt for that slide and use `--prompt "..." --name xyz-slideN` |
| `No content in response` from Nano Banana | Happens when the prompt trips a safety filter. Remove brand/product names from the prompt, avoid referring to real people, and retry |
| Bot browser won't close | Run any script — on startup it kills any zombie bot Chrome process. Does not touch your main Chrome |
| Session expired | Run `setup.js` again |

---

## Files layout

```
instagram-autoposter/
├── SKILL.md                     (this file)
├── README.md                    (GitHub homepage)
├── package.json
├── .env                         (YOUR API key — gitignored)
├── .gitignore
├── scripts/
│   ├── setup.js
│   ├── save-inspiration.js
│   ├── analyze-inspiration.js
│   ├── generate-carousel.js
│   ├── slides-to-reel.js
│   ├── post.js
│   ├── analytics.js
│   └── lib/
│       └── browser.js           (cross-platform Playwright launcher)
├── inspirations/                (gitignored — your swipe file)
│   ├── index.json
│   └── <post-code>/
│       ├── slide-01.jpg ...
└── generated/                   (gitignored — your output)
    └── <name>/
        ├── slide-01.png ...
        ├── manifest.json
        └── <name>.mp4           (if you ran slides-to-reel)
```

---

## License

MIT. Use it, fork it, improve it, ship with it.
