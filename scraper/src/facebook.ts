/**
 * Facebook Groups scraper — Fraser Valley Movers leads
 *
 * Uses Playwright (headless Chromium) to log in to Facebook and scrape
 * posts from community groups where people look for movers.
 *
 * Groups targeted (add/remove group IDs in GROUPS below):
 *   - Fraser Valley Buy/Sell/Trade
 *   - Abbotsford Buy & Sell
 *   - Chilliwack Buy & Sell
 *   - Fraser Valley Community Board
 *   - Langley Buy Sell Trade
 *
 * Facebook actively fights scraping — this scraper:
 *   1. Uses realistic viewport / user-agent
 *   2. Adds random delays between actions
 *   3. Stores a session cookie file so you only log in once
 *   4. Scrolls naturally to load posts
 */

import { chromium, type Page, type BrowserContext } from 'playwright'
import path from 'path'
import fs from 'fs'
import { upsertLeads, type Lead } from './supabase.js'
import 'dotenv/config'

// ── Config ──────────────────────────────────────────────────────────────────

const FB_EMAIL = process.env.FB_EMAIL
const FB_PASSWORD = process.env.FB_PASSWORD
const SESSION_FILE = path.resolve('./fb-session.json')

// Fraser Valley Facebook groups to scan
// Format: { name, url }  — use the /groups/<id>/search URL with a keyword
const GROUPS = [
  { name: 'Fraser Valley Buy Sell Trade', id: '196155123747088' },
  { name: 'Abbotsford Buy & Sell', id: '164147356953272' },
  { name: 'Chilliwack Buy & Sell', id: '138781362829046' },
  { name: 'Langley Buy Sell Trade', id: '349031945275573' },
  { name: 'Mission BC Buy & Sell', id: '497832323582744' },
]

const SEARCH_TERMS = ['movers', 'moving help', 'need movers', 'looking for movers']

const DEMAND_KEYWORDS = [
  'looking for mover', 'need mover', 'need a mover', 'need moving', 'need help moving',
  'looking for moving', 'require mover', 'seeking mover', 'want mover', 'hire mover',
  'help me move', 'help moving', 'recommend mover', 'moving soon', 'moving company',
  'any movers', 'good movers', 'reliable movers', 'affordable movers',
]

// ── Browser helpers ──────────────────────────────────────────────────────────

async function launchBrowser(): Promise<{ context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-CA',
    timezoneId: 'America/Vancouver',
    storageState: fs.existsSync(SESSION_FILE) ? SESSION_FILE : undefined,
  })
  const page = await context.newPage()
  return { context, page }
}

async function login(page: Page, context: BrowserContext): Promise<void> {
  if (!FB_EMAIL || !FB_PASSWORD) {
    throw new Error('Set FB_EMAIL and FB_PASSWORD in scraper/.env')
  }

  console.log('[fb] logging in to Facebook')
  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' })
  await sleep(randomBetween(1000, 2000))

  await page.fill('#email', FB_EMAIL)
  await sleep(randomBetween(300, 700))
  await page.fill('#pass', FB_PASSWORD)
  await sleep(randomBetween(300, 700))
  await page.click('[name="login"]')
  await page.waitForURL(/facebook\.com\/(home|$|\?)/, { timeout: 15000 })

  // Dismiss any dialogs (cookie consent, notifications)
  await dismissDialogs(page)

  // Save session so we don't log in again next run
  await context.storageState({ path: SESSION_FILE })
  console.log('[fb] login successful, session saved')
}

async function ensureLoggedIn(page: Page, context: BrowserContext): Promise<void> {
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' })
  await sleep(1500)

  const isLoggedIn = await page.$('[aria-label="Your profile"]') !== null ||
    await page.$('[data-pagelet="ProfileActions"]') !== null ||
    (await page.url()).includes('facebook.com') && !(await page.url()).includes('/login')

  if (!isLoggedIn) {
    await login(page, context)
  } else {
    console.log('[fb] session valid, skipping login')
  }
}

async function dismissDialogs(page: Page): Promise<void> {
  const selectors = [
    '[aria-label="Close"]',
    '[data-testid="cookie-policy-manage-dialog-accept-button"]',
    'button:has-text("Not Now")',
    'button:has-text("Close")',
    'button:has-text("Allow essential and optional cookies")',
    'button:has-text("Allow all cookies")',
  ]
  for (const sel of selectors) {
    const btn = await page.$(sel)
    if (btn) {
      await btn.click().catch(() => {})
      await sleep(500)
    }
  }
}

// ── Scraping ─────────────────────────────────────────────────────────────────

interface RawPost {
  text: string
  url: string
  postedAt: string
  authorName: string
}

async function scrapeGroupSearch(page: Page, groupId: string, term: string): Promise<RawPost[]> {
  const searchUrl = `https://www.facebook.com/groups/${groupId}/search/?q=${encodeURIComponent(term)}`
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
  await sleep(randomBetween(2000, 3500))
  await dismissDialogs(page)

  // Scroll to load more posts
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 1200))
    await sleep(randomBetween(1200, 2000))
  }

  const posts = await page.evaluate(() => {
    const results: { text: string; url: string; postedAt: string; authorName: string }[] = []

    // FB post feed items
    const feedItems = document.querySelectorAll('[role="article"]')
    feedItems.forEach(item => {
      // Post text
      const textEl = item.querySelector('[data-ad-comet-preview="message"], [dir="auto"]')
      const text = textEl?.textContent?.trim() ?? ''

      // Permalink — look for a timestamp link which always links to the post
      const timeLink = item.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="?story_fbid="]')
      const url = timeLink ? (timeLink as HTMLAnchorElement).href : ''

      // Posted time
      const timeEl = item.querySelector('abbr[data-utime], time')
      const postedAt = timeEl?.getAttribute('data-utime')
        ? new Date(Number(timeEl.getAttribute('data-utime')) * 1000).toISOString()
        : timeEl?.getAttribute('datetime') ?? ''

      // Author
      const authorEl = item.querySelector('h2 a, strong a, [data-hovercard] a')
      const authorName = authorEl?.textContent?.trim() ?? ''

      if (text && url) {
        results.push({ text, url, postedAt, authorName })
      }
    })

    return results
  })

  return posts
}

function isLeadPost(text: string): boolean {
  const lower = text.toLowerCase()
  return DEMAND_KEYWORDS.some(kw => lower.includes(kw))
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function scrapeFacebook(): Promise<void> {
  console.log('[fb] starting scrape')
  const { context, page } = await launchBrowser()

  try {
    await ensureLoggedIn(page, context)

    const leads: Lead[] = []
    const seen = new Set<string>()

    for (const group of GROUPS) {
      for (const term of SEARCH_TERMS) {
        console.log(`[fb] scraping "${term}" in ${group.name}`)

        let posts: RawPost[]
        try {
          posts = await scrapeGroupSearch(page, group.id, term)
          console.log(`[fb] found ${posts.length} posts`)
        } catch (err) {
          console.error(`[fb] error scraping ${group.name} / "${term}": ${err}`)
          continue
        }

        for (const post of posts) {
          if (seen.has(post.url)) continue
          seen.add(post.url)

          if (!isLeadPost(post.text)) continue

          leads.push({
            source: 'facebook',
            title: post.text.slice(0, 120) + (post.text.length > 120 ? '…' : ''),
            body: post.text,
            url: post.url,
            posted_at: post.postedAt || undefined,
            contact: post.authorName || undefined,
            raw: { group: group.name, searchTerm: term, authorName: post.authorName },
          })

          console.log(`[fb] lead: ${post.text.slice(0, 80)}`)
        }

        await sleep(randomBetween(3000, 5000))
      }
    }

    if (leads.length > 0) {
      await upsertLeads(leads)
    }

    console.log(`[fb] done — ${leads.length} leads saved`)
  } finally {
    await context.close()
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Run directly: npm run facebook
if (process.argv[1]?.endsWith('facebook.ts') || process.argv[1]?.endsWith('facebook.js')) {
  scrapeFacebook().catch(err => { console.error(err); process.exit(1) })
}
