#!/usr/bin/env node
/**
 * Instagram Analytics
 * Fetch your posts/reels with metrics. Computes engagement score so the
 * agent can figure out what's working and decide what to post next.
 *
 * Usage:
 *   node analytics.js                    # Your last 20 posts with metrics
 *   node analytics.js --count 50         # Last 50 posts
 *   node analytics.js --top 10           # Your top 10 posts by engagement
 *   node analytics.js --reels-only       # Filter to reels only
 *   node analytics.js --profile          # Your profile stats
 *   node analytics.js --media <id>       # Full metrics for one media
 *
 * Requires .env with: IG_USERNAME, IG_PASSWORD
 */

const { IgApiClient } = require('instagram-private-api');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SESSION_FILE = path.join(__dirname, '..', '.session.json');

async function login() {
  const { IG_USERNAME, IG_PASSWORD } = process.env;
  if (!IG_USERNAME || !IG_PASSWORD) {
    console.error('Missing credentials. Create .env with IG_USERNAME and IG_PASSWORD');
    process.exit(1);
  }

  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);

  if (fs.existsSync(SESSION_FILE)) {
    try {
      await ig.state.deserialize(JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')));
      await ig.account.currentUser();
      return ig;
    } catch (e) {
      console.error('Session expired, logging in again...');
    }
  }

  console.error(`Logging in as ${IG_USERNAME}...`);
  await ig.simulate.preLoginFlow();
  await ig.account.login(IG_USERNAME, IG_PASSWORD);
  process.nextTick(async () => await ig.simulate.postLoginFlow());
  const serialized = await ig.state.serialize();
  delete serialized.constants;
  fs.writeFileSync(SESSION_FILE, JSON.stringify(serialized));
  return ig;
}

function mediaTypeLabel(mt, productType) {
  if (productType === 'clips') return 'reel';
  if (mt === 1) return 'photo';
  if (mt === 2) return 'video';
  if (mt === 8) return 'carousel';
  return 'unknown';
}

// Weighted engagement score — reels value views, posts value saves/shares
function engagementScore(m) {
  return (m.likes || 0) * 1
    + (m.comments || 0) * 5
    + (m.saves || 0) * 10
    + (m.shares || 0) * 15
    + (m.views || 0) * 0.01;
}

function formatHour(ts) {
  return new Date(ts * 1000).toISOString();
}

async function fetchUserMedia(ig, userId, count) {
  const feed = ig.feed.user(userId);
  const items = [];
  while (items.length < count) {
    const page = await feed.items();
    if (!page.length) break;
    items.push(...page);
    if (!feed.isMoreAvailable()) break;
  }
  return items.slice(0, count);
}

function mapMedia(item) {
  const type = mediaTypeLabel(item.media_type, item.product_type);
  const caption = item.caption?.text || '';
  const metrics = {
    likes: item.like_count || 0,
    comments: item.comment_count || 0,
    views: item.view_count || item.play_count || 0,
    saves: item.save_count || 0,
    shares: item.reshare_count || 0,
  };
  return {
    id: item.pk,
    code: item.code,
    type,
    caption: caption.slice(0, 200),
    caption_length: caption.length,
    hashtags: (caption.match(/#\w+/g) || []),
    created_at: item.taken_at ? formatHour(item.taken_at) : null,
    day_of_week: item.taken_at ? new Date(item.taken_at * 1000).toLocaleDateString('en-US', { weekday: 'long' }) : null,
    hour_utc: item.taken_at ? new Date(item.taken_at * 1000).getUTCHours() : null,
    metrics,
    engagement_score: engagementScore(metrics),
    url: item.code ? `https://www.instagram.com/p/${item.code}/` : null,
  };
}

function summarize(posts) {
  if (posts.length === 0) return null;
  const total = {
    likes: 0, comments: 0, views: 0, saves: 0, shares: 0,
  };
  posts.forEach(p => {
    total.likes += p.metrics.likes;
    total.comments += p.metrics.comments;
    total.views += p.metrics.views;
    total.saves += p.metrics.saves;
    total.shares += p.metrics.shares;
  });

  const byType = {};
  posts.forEach(p => {
    if (!byType[p.type]) byType[p.type] = { count: 0, engagement: 0 };
    byType[p.type].count++;
    byType[p.type].engagement += p.engagement_score;
  });
  Object.keys(byType).forEach(k => {
    byType[k].avg_engagement = (byType[k].engagement / byType[k].count).toFixed(1);
  });

  // Best posting times (from top quartile by engagement)
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
    totals: total,
    averages: {
      likes: (total.likes / posts.length).toFixed(1),
      comments: (total.comments / posts.length).toFixed(1),
      views: (total.views / posts.length).toFixed(1),
      saves: (total.saves / posts.length).toFixed(1),
      shares: (total.shares / posts.length).toFixed(1),
      engagement_score: (posts.reduce((s, p) => s + p.engagement_score, 0) / posts.length).toFixed(1),
    },
    by_type: byType,
    best_posting_hours_utc: Object.entries(hourCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
    best_posting_days: Object.entries(dayCounts).sort((a, b) => b[1] - a[1]),
    best_post: sorted[0],
  };
}

async function main() {
  const args = process.argv.slice(2);
  let mode = 'timeline';
  let count = 20;
  let topN = 10;
  let reelsOnly = false;
  let mediaId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) { count = parseInt(args[i + 1]); i++; }
    else if (args[i] === '--top' && args[i + 1]) { mode = 'top'; topN = parseInt(args[i + 1]); i++; }
    else if (args[i] === '--reels-only') { reelsOnly = true; }
    else if (args[i] === '--profile') { mode = 'profile'; }
    else if (args[i] === '--media' && args[i + 1]) { mode = 'media'; mediaId = args[i + 1]; i++; }
  }

  try {
    const ig = await login();
    const user = await ig.account.currentUser();

    if (mode === 'profile') {
      console.log(JSON.stringify({
        username: user.username,
        full_name: user.full_name,
        biography: user.biography,
        followers: user.follower_count,
        following: user.following_count,
        posts: user.media_count,
        is_business: user.is_business,
        profile_pic_url: user.profile_pic_url,
        external_url: user.external_url,
      }, null, 2));
      return;
    }

    if (mode === 'media') {
      const info = await ig.media.info(mediaId);
      const item = info.items[0];
      console.log(JSON.stringify(mapMedia(item), null, 2));
      return;
    }

    // Timeline / top
    console.error(`Fetching last ${count} posts from @${user.username}...`);
    const items = await fetchUserMedia(ig, user.pk, count);
    let posts = items.map(mapMedia);

    if (reelsOnly) {
      posts = posts.filter(p => p.type === 'reel');
    }

    if (mode === 'top') {
      posts = posts.sort((a, b) => b.engagement_score - a.engagement_score).slice(0, topN);
    }

    console.log(JSON.stringify({
      user: user.username,
      followers: user.follower_count,
      posts_count: user.media_count,
      mode,
      reels_only: reelsOnly,
      summary: summarize(posts),
      posts,
      fetched_at: new Date().toISOString(),
    }, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    if (err.response?.body) {
      console.error('Response:', JSON.stringify(err.response.body, null, 2));
    }
    process.exit(1);
  }
}

main();
