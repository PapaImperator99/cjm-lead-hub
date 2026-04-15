/**
 * Reddit scraper — Fraser Valley moving leads
 *
 * Uses Reddit's public JSON API — no login, no browser, no rate limit issues.
 * Just append .json to any Reddit URL.
 *
 * Subreddits targeted:
 *   r/FraserValley, r/abbotsford, r/langley, r/chilliwack,
 *   r/vancouver, r/BritishColumbia, r/SurreyBC
 */

import { upsertLeads, type Lead } from './supabase.js'

const HEADERS = {
  'User-Agent': 'CJMLeadScraper/1.0 (moving leads aggregator for Fraser Valley)',
}

// Subreddits to search
const SUBREDDITS = [
  'FraserValley',
  'abbotsford',
  'langley',
  'chilliwack',
  'SurreyBC',
  'vancouver',
  'BritishColumbia',
]

// Keywords to search within each subreddit
const SEARCH_TERMS = [
  'movers',
  'moving company',
  'need movers',
  'looking for movers',
  'moving help',
  'recommend movers',
]

// ── Intent filtering ──────────────────────────────────────────────────────────

const DEMAND_KEYWORDS = [
  'looking for mover', 'looking for a mover', 'need mover', 'need a mover',
  'need moving', 'need help moving', 'need help with my move',
  'recommend', 'recommendation', 'suggestions', 'anyone know',
  'good mover', 'reliable mover', 'affordable mover', 'cheap mover',
  'who did you use', 'used before', 'experience with',
  'getting quotes', 'quote for', 'moving soon', 'moving next',
  'moving this', 'have to move', 'moving out', 'moving in',
  'help me move', 'anyone move', 'best mover', 'hire',
]

const SUPPLY_KEYWORDS = [
  'we offer', 'our team', 'our services', 'we provide', 'we are a',
  'fully insured', 'fully licensed', 'free estimate', 'free quote',
  'call us', 'contact us', 'our rates', 'book now', 'book today',
  'serving the', 'competitive rates', 'years of experience',
  '[ad]', 'sponsored',
]

function isLeadPost(title: string, body: string): boolean {
  const text = `${title} ${body}`.toLowerCase()
  if (SUPPLY_KEYWORDS.some(kw => text.includes(kw))) return false
  return DEMAND_KEYWORDS.some(kw => text.includes(kw))
}

// ── Reddit API types ──────────────────────────────────────────────────────────

interface RedditPost {
  id: string
  title: string
  selftext: string
  url: string
  permalink: string
  author: string
  created_utc: number
  subreddit: string
  is_self: boolean
}

interface RedditSearchResponse {
  data: {
    children: { data: RedditPost }[]
  }
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

async function searchSubreddit(subreddit: string, term: string): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(term)}&restrict_sr=1&sort=new&limit=25&t=month`

  const res = await fetch(url, { headers: HEADERS })

  if (res.status === 429) {
    console.warn(`[reddit] rate limited on r/${subreddit} — skipping`)
    return []
  }

  if (!res.ok) {
    console.warn(`[reddit] fetch failed for r/${subreddit} "${term}": ${res.status}`)
    return []
  }

  const json = await res.json() as RedditSearchResponse
  return json.data?.children?.map(c => c.data) ?? []
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function scrapeReddit(): Promise<void> {
  console.log('[reddit] starting scrape')
  const leads: Lead[] = []
  const seen = new Set<string>()

  for (const subreddit of SUBREDDITS) {
    for (const term of SEARCH_TERMS) {
      console.log(`[reddit] searching r/${subreddit} for "${term}"`)

      let posts: RedditPost[]
      try {
        posts = await searchSubreddit(subreddit, term)
        console.log(`[reddit] found ${posts.length} posts`)
      } catch (err) {
        console.error(`[reddit] error: ${err}`)
        continue
      }

      for (const post of posts) {
        const url = `https://www.reddit.com${post.permalink}`
        if (seen.has(url)) continue
        seen.add(url)

        if (!isLeadPost(post.title, post.selftext)) {
          console.log(`[reddit] skip: ${post.title}`)
          continue
        }

        leads.push({
          source: 'reddit',
          title: post.title,
          body: post.selftext || undefined,
          url,
          posted_at: new Date(post.created_utc * 1000).toISOString(),
          location: `r/${post.subreddit}`,
          contact: `u/${post.author}`,
          raw: { subreddit: post.subreddit, searchTerm: term, redditId: post.id },
        })

        console.log(`[reddit] ✓ lead: ${post.title}`)
      }

      // Be polite to Reddit's API — 1 req/sec is their guideline
      await sleep(1100)
    }

    await sleep(2000)
  }

  if (leads.length > 0) {
    await upsertLeads(leads)
  }

  console.log(`[reddit] done — ${leads.length} leads saved`)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Run directly: npx tsx src/reddit.ts
if (process.argv[1]?.endsWith('reddit.ts') || process.argv[1]?.endsWith('reddit.js')) {
  scrapeReddit().catch(err => { console.error(err); process.exit(1) })
}
