---
name: instagram-autoposter
version: "3.0.0"
description: "End-to-end Instagram content engine: save competitor posts as inspiration, analyze them with Gemini Vision, generate carousel images with Nano Banana (gemini-2.5-flash-image), and publish as carousels/reels/photos via Playwright browser automation. Read engagement metrics. Dedicated bot profile keeps your main Chrome free. Works on Windows, macOS, and Linux. TRIGGER: instagram, post reel, post carousel, instagram analytics, generate carousel, nano banana, inspiration, ig content."
argument-hint: 'instagram-autoposter --reel video.mp4 "caption"'
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
      - social-media
      - posting
      - analytics
      - automation
      - playwright
---

# Instagram Autoposter — Playwright with Dedicated Bot Profile

Post reels, photos, and videos to Instagram. Read engagement metrics. Uses Playwright to drive a **dedicated bot browser** — your normal Chrome stays open and untouched.

## How it works

- A separate Chrome profile lives at `~/.instagram-bot-profile/`
- You log into Instagram in that profile **once** (via `setup.js`)
- After that, `post.js` and `analytics.js` use that profile automatically
- Your regular Chrome is never closed, never affected

## Setup (one time)

1. Install Chrome or Brave (if not already installed)
2. Run `npm install` in `~/.claude/skills/instagram-autoposter/`
3. Run the setup script:

```bash
node ~/.claude/skills/instagram-autoposter/scripts/setup.js
```

4. A new Chrome window opens at Instagram's login page
5. Log in (with 2FA if enabled)
6. Once you see your feed, close that window
7. Done! The bot profile is saved.

**Works on Windows, macOS, and Linux** — auto-detects platform.

## 1. Post content: `post.js`

### Post a reel

```bash
node ~/.claude/skills/instagram-autoposter/scripts/post.js --reel video.mp4 "caption with #hashtags"
```

### Post a photo

```bash
node ~/.claude/skills/instagram-autoposter/scripts/post.js --photo image.jpg "caption"
```

### Post a video (feed, not reel)

```bash
node ~/.claude/skills/instagram-autoposter/scripts/post.js --video video.mp4 "caption"
```

### Post a carousel

```bash
node ~/.claude/skills/instagram-autoposter/scripts/post.js --carousel "caption with #hashtags" slide-01.jpg slide-02.jpg slide-03.jpg
```

Carousel must have at least 2 images (max 10). Order is preserved.

## 3. Inspiration-driven content workflow

### Step 1 — Save an Instagram post/reel you want to learn from

```bash
node ~/.claude/skills/instagram-autoposter/scripts/save-inspiration.js https://instagram.com/p/ABC123 "loved the hook on slide 1"
node ~/.claude/skills/instagram-autoposter/scripts/save-inspiration.js --list
node ~/.claude/skills/instagram-autoposter/scripts/save-inspiration.js --remove ABC123
```

Saves to `inspirations/index.json`.

### Step 2 — Download + analyze with Gemini Vision

```bash
node ~/.claude/skills/instagram-autoposter/scripts/analyze-inspiration.js ABC123
# or analyze all new ones:
node ~/.claude/skills/instagram-autoposter/scripts/analyze-inspiration.js --all
```

Downloads all slides to `inspirations/ABC123/` and runs Gemini Vision on them. Analysis includes:
- Hook, structure, visual style, text overlay patterns
- Content type, target emotion, why it works
- **Adaptation brief**: concrete content idea for WealthMaia

### Step 3 — Generate your carousel with Nano Banana

```bash
# Based on an analyzed inspiration (5 slides, uses its visual style as reference)
node ~/.claude/skills/instagram-autoposter/scripts/generate-carousel.js --from ABC123 --name my-first-carousel

# From a custom prompts file (one prompt per line = one slide)
node ~/.claude/skills/instagram-autoposter/scripts/generate-carousel.js --prompts prompts.txt --name custom

# Quick single-image test
node ~/.claude/skills/instagram-autoposter/scripts/generate-carousel.js --prompt "A minimalist slide..." --name test
```

Outputs to `generated/<name>/slide-NN.png` and writes a `manifest.json` with the exact post command.

Uses **gemini-2.5-flash-image** (Nano Banana). Requires `GOOGLE_API_KEY` in `.env` (get one free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)).

### Step 4 — Post the generated carousel

```bash
node ~/.claude/skills/instagram-autoposter/scripts/post.js --carousel "Your caption here" generated/my-first-carousel/slide-01.png generated/my-first-carousel/slide-02.png ...
```

### Full workflow example

```
1. save-inspiration.js https://instagram.com/p/XYZ
2. analyze-inspiration.js XYZ           -> analysis stored
3. (review the adaptation_brief in inspirations/index.json)
4. generate-carousel.js --from XYZ --name wealthmaia-post-1
5. (review generated/wealthmaia-post-1/*.png, regenerate any slide if needed)
6. post.js --carousel "caption" generated/wealthmaia-post-1/slide-*.png
7. (24-48h later) analytics.js --top 10 to see what worked
8. Repeat, leaning into winning patterns
```

### Use Brave instead of Chrome

```bash
node ~/.claude/skills/instagram-autoposter/scripts/post.js --reel video.mp4 "caption" --browser brave
```

**IMPORTANT:**
- Your **normal Chrome can stay open** — the bot uses a separate profile
- Run `setup.js` once before first use (see "Setup" above)
- Always show user the caption and confirm before posting. Never auto-post.

## 2. Analytics: `analytics.js`

```bash
# Profile stats (username, followers, post count)
node ~/.claude/skills/instagram-autoposter/scripts/analytics.js --profile

# Your last 12 posts with metrics
node ~/.claude/skills/instagram-autoposter/scripts/analytics.js

# Your top 10 posts by engagement
node ~/.claude/skills/instagram-autoposter/scripts/analytics.js --top 10

# Last 30 posts
node ~/.claude/skills/instagram-autoposter/scripts/analytics.js --count 30

# Reels only
node ~/.claude/skills/instagram-autoposter/scripts/analytics.js --reels-only --count 30
```

Returns JSON with:
- `user`: username, followers, post count
- `posts[]`: each post with type (reel/post), caption, hashtags, created_at, day_of_week, hour_utc, metrics (likes, comments, views), `engagement_score`
- `summary`: totals, averages, best_posting_hours_utc, best_posting_days, best_post

**Engagement score**: `likes×1 + comments×5 + saves×10 + shares×15 + views×0.01` — weights what Instagram's algorithm rewards (deep engagement > vanity metrics).

**Note**: Saves and shares aren't visible from the public web (they require the Instagram Insights API for Business accounts). The engagement_score calculation handles this gracefully by using 0 when unavailable.

## Workflow — Post, Analyze, Decide Next Reel

```
1. post.js --reel your-video.mp4 "caption"
2. Wait 24-48h for metrics to stabilize
3. analytics.js --top 10  →  see what's working
4. Agent analyzes: hooks, topics, hashtags, posting times
5. Agent drafts next reel concept
6. You approve → post.js publishes
7. Loop
```

## Platform Notes

| | Windows | macOS | Linux |
|---|---|---|---|
| Chrome path | `AppData\Local\Google\Chrome\...` | `/Applications/Google Chrome.app/...` | `/usr/bin/google-chrome` |
| Profile dir | `User Data` | `~/Library/Application Support/Google/Chrome` | `~/.config/google-chrome` |
| Process kill | `taskkill /F /IM` | `pkill -f` | `pkill -f` |
| Profile link | junction (`mklink /J`) | symlink (`ln -s`) | symlink (`ln -s`) |

All handled automatically by `scripts/lib/browser.js`.

## Troubleshooting

- **"Not logged into Instagram"** → Open Chrome manually, log into Instagram, close it, run again.
- **Browser doesn't close** → Make sure you're not running the browser as another user or elevated.
- **Instagram changed their DOM** → Update selectors in `post.js` (search for `text=/create|crear/i` and similar).
- **"Timed out waiting for browser"** → Another process may be using port 9223. Kill it or change `DEBUG_PORT` in `scripts/lib/browser.js`.

## Safety

This approach uses your real browser session, which is the safest method:
- No login endpoint calls (no checkpoint triggers)
- No cookie-based API calls (no pattern detection)
- Instagram sees literally your Chrome doing what you'd do manually
- Still: stay under 3-5 posts/day, don't automate likes/follows/comments on others' content
