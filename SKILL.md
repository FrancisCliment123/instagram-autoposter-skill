---
name: instagram-autoposter
version: "2.0.0"
description: "Post reels, videos, and photos to Instagram via Playwright + Chrome CDP (uses your real browser session). Read engagement metrics from your posts. No login, no cookies, no API keys — just your logged-in browser. Works on Windows, macOS, and Linux. TRIGGER: instagram, post reel, post video, instagram analytics, ig metrics, instagram post."
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

# Instagram Autoposter — Playwright Browser Automation

Post reels, photos, and videos to Instagram. Read engagement metrics. Uses Playwright to drive your real Chrome/Brave browser — no login, no API keys, no cookies. Instagram sees your genuine logged-in session, so no checkpoint triggers.

## Setup

1. Install Chrome or Brave and log into Instagram manually
2. Run `npm install` in `~/.claude/skills/instagram-autoposter/`
3. Done. No `.env`, no credentials needed.

**Works on Windows, macOS, and Linux** — auto-detects platform and finds your browser automatically.

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

### Use Brave instead of Chrome

```bash
node ~/.claude/skills/instagram-autoposter/scripts/post.js --reel video.mp4 "caption" --browser brave
```

**IMPORTANT:**
- The browser (Chrome or Brave) must be **CLOSED** before running — Playwright needs exclusive access
- You must be **logged into Instagram** in that browser
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
