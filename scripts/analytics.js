#!/usr/bin/env node
/**
 * Instagram Analytics via Playwright + Chrome CDP
 * Scrapes your posts and metrics from the web UI using your real session.
 *
 * Usage:
 *   node analytics.js                  # Your last 12 posts with metrics
 *   node analytics.js --count 30       # Last 30 posts
 *   node analytics.js --top 10         # Top 10 by engagement
 *   node analytics.js --reels-only     # Reels only
 *   node analytics.js --profile        # Profile stats
 */

const { launchAndConnect, sleep, humanDelay } = require('./lib/browser');

function engagementScore(m) {
  return (m.likes || 0) * 1
    + (m.comments || 0) * 5
    + (m.saves || 0) * 10
    + (m.shares || 0) * 15
    + (m.views || 0) * 0.01;
}

async function getProfile(page) {
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await humanDelay(2000, 3000);

  // Navigate to own profile via the profile icon
  const username = await page.evaluate(() => {
    // Instagram stores user data in a global config
    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const m = s.textContent.match(/"username":"([^"]+)"/);
        if (m && m[1] && !m[1].includes('instagram')) return m[1];
      }
    } catch {}
    return null;
  });

  if (!username) {
    throw new Error('Could not detect logged-in username. Make sure youre logged into Instagram in your browser.');
  }

  console.error(`[analytics] Detected user: @${username}`);
  await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await humanDelay(2000, 3000);

  // Scrape profile stats from header
  const profile = await page.evaluate(() => {
    const metaTexts = Array.from(document.querySelectorAll('meta[property="og:description"]')).map(m => m.content).join(' ');
    const headerSpans = Array.from(document.querySelectorAll('header span')).map(s => s.textContent);
    return { metaTexts, headerSpans };
  });

  // Parse follower counts from the header
  const stats = await page.evaluate(() => {
    const result = { posts: null, followers: null, following: null };
    const lis = document.querySelectorAll('header ul li, header section ul li');
    lis.forEach(li => {
      const text = li.textContent.toLowerCase();
      const numSpan = li.querySelector('span[title], span');
      const num = numSpan?.getAttribute('title') || numSpan?.textContent;
      if (text.includes('post') || text.includes('publicac')) result.posts = num;
      else if (text.includes('follower') || text.includes('seguidor')) result.followers = num;
      else if (text.includes('following') || text.includes('seguido')) result.following = num;
    });
    return result;
  });

  return { username, ...stats };
}

async function getPosts(page, username, count) {
  console.error(`[analytics] Scraping posts from @${username}...`);
  await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await humanDelay(2000, 3000);

  // Scroll to load more posts
  let prevHeight = 0;
  let stableCount = 0;
  while (stableCount < 3) {
    const count = await page.evaluate(() => document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').length);
    if (count >= Math.max(count, 30)) break;
    await page.evaluate(() => window.scrollBy(0, 2000));
    await sleep(1500);
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === prevHeight) stableCount++;
    else stableCount = 0;
    prevHeight = newHeight;
  }

  // Collect post URLs
  const postUrls = await page.evaluate(() => {
    const seen = new Set();
    const results = [];
    document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').forEach(a => {
      if (!seen.has(a.href)) {
        seen.add(a.href);
        results.push({
          url: a.href,
          type: a.href.includes('/reel/') ? 'reel' : 'post',
          code: a.href.match(/\/(p|reel)\/([^/]+)/)?.[2] || null,
        });
      }
    });
    return results;
  });

  console.error(`[analytics] Found ${postUrls.length} posts. Fetching metrics for first ${Math.min(count, postUrls.length)}...`);

  const posts = [];
  for (let i = 0; i < Math.min(count, postUrls.length); i++) {
    const post = postUrls[i];
    try {
      await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await humanDelay(1500, 2500);

      const details = await page.evaluate(() => {
        // Try multiple locations for metrics
        const parse = (s) => {
          if (!s) return 0;
          const m = String(s).replace(/,/g, '').match(/[\d.]+/);
          if (!m) return 0;
          let n = parseFloat(m[0]);
          if (String(s).match(/[Kk]/)) n *= 1000;
          if (String(s).match(/[Mm]/)) n *= 1000000;
          return Math.round(n);
        };

        // Likes
        const likeSpan = document.querySelector('section span[class*="html-span"] span, a[href$="/liked_by/"] span, section a span');
        let likes = 0;
        const allSpans = Array.from(document.querySelectorAll('section span'));
        for (const s of allSpans) {
          const t = s.textContent.toLowerCase();
          if (t.match(/\d/) && (t.includes('like') || t.includes('me gusta'))) {
            likes = parse(s.textContent);
            break;
          }
        }
        if (!likes) {
          // Fallback: look at the aria-label of buttons
          const allButtons = Array.from(document.querySelectorAll('button, span'));
          for (const b of allButtons) {
            const label = b.getAttribute('aria-label') || '';
            if (label.match(/likes?/i)) {
              likes = parse(label);
              if (likes) break;
            }
          }
        }

        // Views (for reels/videos)
        let views = 0;
        const viewMatches = document.body.innerText.match(/([\d.,]+[KM]?)\s*(views?|reproducciones?|plays?)/i);
        if (viewMatches) views = parse(viewMatches[1]);

        // Comment count — count comment elements as a proxy, or parse from meta
        const commentMatches = document.body.innerText.match(/([\d.,]+[KM]?)\s*comments?/i);
        const comments = commentMatches ? parse(commentMatches[1]) : 0;

        // Caption
        const captionEl = document.querySelector('div[role="button"] h1, article h1');
        const caption = captionEl?.textContent || '';

        // Timestamp
        const timeEl = document.querySelector('time');
        const datetime = timeEl?.getAttribute('datetime') || null;

        return { likes, comments, views, caption: caption.slice(0, 500), datetime };
      });

      const metrics = {
        likes: details.likes,
        comments: details.comments,
        views: details.views,
        saves: 0, // not visible without Insights API
        shares: 0,
      };

      posts.push({
        url: post.url,
        code: post.code,
        type: post.type,
        caption: details.caption,
        caption_length: details.caption.length,
        hashtags: details.caption.match(/#\w+/g) || [],
        created_at: details.datetime,
        day_of_week: details.datetime ? new Date(details.datetime).toLocaleDateString('en-US', { weekday: 'long' }) : null,
        hour_utc: details.datetime ? new Date(details.datetime).getUTCHours() : null,
        metrics,
        engagement_score: engagementScore(metrics),
      });
    } catch (err) {
      console.error(`[analytics] Error scraping ${post.url}: ${err.message}`);
    }
  }

  return posts;
}

function summarize(posts) {
  if (posts.length === 0) return null;
  const totals = { likes: 0, comments: 0, views: 0 };
  posts.forEach(p => {
    totals.likes += p.metrics.likes;
    totals.comments += p.metrics.comments;
    totals.views += p.metrics.views;
  });

  const sorted = [...posts].sort((a, b) => b.engagement_score - a.engagement_score);
  const topQuartile = sorted.slice(0, Math.max(1, Math.floor(posts.length / 4)));
  const hourCounts = {};
  const dayCounts = {};
  topQuartile.forEach(p => {
    if (p.hour_utc !== null) hourCounts[p.hour_utc] = (hourCounts[p.hour_utc] || 0) + 1;
    if (p.day_of_week) dayCounts[p.day_of_week] = (dayCounts[p.day_of_week] || 0) + 1;
  });

  return {
    posts_analyzed: posts.length,
    totals,
    averages: {
      likes: (totals.likes / posts.length).toFixed(1),
      comments: (totals.comments / posts.length).toFixed(1),
      views: (totals.views / posts.length).toFixed(1),
      engagement_score: (posts.reduce((s, p) => s + p.engagement_score, 0) / posts.length).toFixed(1),
    },
    best_posting_hours_utc: Object.entries(hourCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
    best_posting_days: Object.entries(dayCounts).sort((a, b) => b[1] - a[1]),
    best_post: sorted[0],
  };
}

async function main() {
  const args = process.argv.slice(2);
  let mode = 'timeline';
  let count = 12;
  let topN = 10;
  let reelsOnly = false;
  let browserName = 'chrome';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) { count = parseInt(args[i + 1]); i++; }
    else if (args[i] === '--top' && args[i + 1]) { mode = 'top'; topN = parseInt(args[i + 1]); i++; }
    else if (args[i] === '--reels-only') { reelsOnly = true; }
    else if (args[i] === '--profile') { mode = 'profile'; }
    else if (args[i] === '--browser' && args[i + 1]) { browserName = args[i + 1]; i++; }
  }

  let cleanup;
  try {
    const session = await launchAndConnect({ browserName });
    cleanup = session.cleanup;
    const page = session.page;

    const profile = await getProfile(page);

    if (mode === 'profile') {
      console.log(JSON.stringify(profile, null, 2));
      return;
    }

    let posts = await getPosts(page, profile.username, count);
    if (reelsOnly) posts = posts.filter(p => p.type === 'reel');
    if (mode === 'top') posts = posts.sort((a, b) => b.engagement_score - a.engagement_score).slice(0, topN);

    console.log(JSON.stringify({
      user: profile.username,
      followers: profile.followers,
      posts_count: profile.posts,
      mode,
      reels_only: reelsOnly,
      summary: summarize(posts),
      posts,
      fetched_at: new Date().toISOString(),
    }, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (cleanup) await cleanup();
  }
}

main();
