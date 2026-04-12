---
name: instagram-autoposter
version: "1.0.0"
description: "Post reels, videos, photos, and carousels to Instagram. Read engagement metrics (likes, comments, views, saves, shares) and analyze top-performing content to decide what to post next. Uses instagram-private-api (no official Meta API review required). TRIGGER: instagram, post reel, post video, instagram analytics, ig metrics, instagram post, carousel."
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
---

# Instagram Autoposter — Post + Analyze

Post reels, videos, photos, and carousels to Instagram. Analyze engagement metrics to figure out what to post next. No official Meta API review needed.

## Setup

1. Create `~/.claude/skills/instagram-autoposter/.env`:

```
IG_USERNAME=your_username
IG_PASSWORD=your_password
```

2. Install: `npm install` in `~/.claude/skills/instagram-autoposter/`

3. First run will trigger a login. If 2FA is enabled, you may need to approve from your phone. Session is cached in `.session.json` (gitignored) so subsequent runs skip login.

## 1. Post content: `post.js`

### Post a reel (most common for growth)

```bash
node ~/.claude/skills/instagram-autoposter/scripts/post.js --reel video.mp4 "caption here #hashtags" --cover cover.jpg
```

### Post a photo

```bash
node ~/.claude/skills/instagram-autoposter/scripts/post.js --photo image.jpg "caption here"
```

### Post a video (feed video, not reel)

```bash
node ~/.claude/skills/instagram-autoposter/scripts/post.js --video video.mp4 "caption" --cover cover.jpg
```

### Post a carousel

```bash
node ~/.claude/skills/instagram-autoposter/scripts/post.js --carousel "caption" img1.jpg img2.jpg img3.jpg
```

**IMPORTANT:** Always show the user the caption and confirm before posting. Never auto-post without explicit approval.

## 2. Analytics: `analytics.js`

### Your last 20 posts with metrics

```bash
node ~/.claude/skills/instagram-autoposter/scripts/analytics.js
```

### Your top 10 posts by engagement

```bash
node ~/.claude/skills/instagram-autoposter/scripts/analytics.js --top 10
```

### Reels-only analysis

```bash
node ~/.claude/skills/instagram-autoposter/scripts/analytics.js --reels-only --count 50
```

### Profile stats

```bash
node ~/.claude/skills/instagram-autoposter/scripts/analytics.js --profile
```

### Single post details

```bash
node ~/.claude/skills/instagram-autoposter/scripts/analytics.js --media <media_id>
```

Returns:
- `user`: username, followers, post count
- `summary`: totals, averages, by_type breakdown, best_posting_hours_utc, best_posting_days, best_post
- `posts[]`: each post with type, caption, hashtags, created_at, day_of_week, hour_utc, full metrics, and `engagement_score`

**Engagement score formula:** `likes×1 + comments×5 + saves×10 + shares×15 + views×0.01`

This weights saves and shares higher because they signal high-value content that drives Instagram's algorithm. The score helps the agent identify what content style is actually working.

## Workflow — Post, Analyze, Decide Next Reel

```
1. User uploads a reel with post.js
2. Wait 24-48 hours for metrics to stabilize
3. Run analytics.js --top 10 to see which reels performed best
4. Agent analyzes patterns:
   - What topics/themes in top reels?
   - What hook style?
   - What hashtags?
   - What posting times?
   - What caption length?
5. Agent drafts next reel concept based on patterns
6. User approves → post.js publishes
7. Loop
```

## Safety Notes (Important)

This skill uses `instagram-private-api` (unofficial). To minimize ban risk:

- **Post only**: Don't use this for follow/unfollow loops, mass DMs, or auto-commenting on other accounts
- **Stay under 3 posts/day** on a warmed-up account
- **Don't post from new accounts**: account should be 30+ days old with organic activity first
- **Randomize timing**: avoid posting every day at exactly the same second
- **Session caching**: keeps login events minimal (each login is a risk signal)
- **If you get a "suspicious activity" challenge**: log in from your phone to clear it

## Notes

- **.env and .session.json** are gitignored — your credentials stay local
- **2FA**: if enabled, first login may require phone approval
- **File formats**: MP4 for video/reels, JPG for photos
- **Reel requirements**: vertical (9:16), max 90 seconds, under 100MB
- **If Instagram breaks the library**: run `npm update instagram-private-api`
