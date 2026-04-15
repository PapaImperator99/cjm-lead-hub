/**
 * Facebook Groups scraper — Fraser Valley movers leads
 *
 * Browses each group's feed directly (not search) and filters for
 * posts where someone is looking to hire movers.
 *
 * IMPORTANT: The Facebook account used must already be a MEMBER of
 * these groups. If not, the scraper will detect the join wall and
 * skip with a clear message.
 *
 * Groups targeted (add more group IDs as needed):
 *   Fraser Valley Buy/Sell/Trade, Abbotsford Buy & Sell,
 *   Chilliwack Buy & Sell, Langley Buy Sell Trade, Mission BC Buy & Sell
 */

import { chromium, type Page, type BrowserContext } from 'playwright'
import path from 'path'
import fs from 'fs'
import { upsertLeads, type Lead } from './supabase.js'
import 'dotenv/config'

// ── Config ────────────────────────────────────────────────────────────────────

const FB_EMAIL    = process.env.FB_EMAIL
const FB_PASSWORD = process.env.FB_PASSWORD
const SESSION_FILE = path.resolve('./fb-session.json')

const GROUPS = [
  { name: 'Fraser Valley Buy Sell Trade', id: '196155123747088' },
  { name: 'Abbotsford Buy & Sell',        id: '164147356953272' },
  { name: 'Chilliwack Buy & Sell',         id: '138781362829046' },
  { name: 'Langley Buy Sell Trade',        id: '349031945275573' },
  { name: 'Mission BC Buy & Sell',         id: '497832323582744' },
]

// ── Intent filtering ──────────────────────────────────────────────────────────

const MOVING_KEYWORDS = [
  'mover', 'moving company', 'moving help', 'need to move',
  'help me move', 'move my stuff', 'moving soon', 'moving out',
  'moving in', 'moving next', 'moving this', 'have to move',
  'looking for mover', 'need mover', 'hire mover', 'recommend mover',
  'good mover', 'reliable mover', 'affordable mover', 'moving truck',
  'moving service', 'packing help', 'loading help', 'unloading',
]

const SUPPLY_KEYWORDS = [
  'we offer', 'our team', 'our services', 'we provide', 'we are a',
  'fully insured', 'fully licensed', 'free estimate', 'free quote',
  'call us', 'contact us', 'book now', 'book today',
  'serving the fraser valley', 'competitive rates', 'years of experience',
]

function isLeadPost(text: string): boolean {
  const lower = text.toLowerCase()
  if (SUPPLY_KEYWORDS.some(kw => lower.includes(kw))) return false
  return MOVING_KEYWORDS.some(kw => lower.includes(kw))
}

// ── Browser helpers ───────────────────────────────────────────────────────────

async function launchBrowser(): Promise<{ context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-CA',
    timezoneId: 'America/Vancouver',
    storageState: fs.existsSync(SESSION_FILE) ? SESSION_FILE : undefined,
  })
  const page = await context.newPage()
  return { context, page }
}

async function login(page: Page, context: BrowserContext): Promise<void> {
  if (!FB_EMAIL || !FB_PASSWORD) throw new Error('Set FB_EMAIL and FB_PASSWORD in scraper/.env')

  console.log('[fb] logging in')
  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' })
  await sleep(randomBetween(1500, 2500))
  await page.fill('#email', FB_EMAIL)
  await sleep(randomBetween(300, 600))
  await page.fill('#pass', FB_PASSWORD)
  await sleep(randomBetween(300, 600))
  await page.click('[name="login"]')

  try {
    await page.waitForURL(/facebook\.com\/(home\.php|$|\?|groups)/, { timeout: 15000 })
  } catch {
    // Check if we hit a 2FA or checkpoint page
    const url = page.url()
    if (url.includes('checkpoint') || url.includes('two_step')) {
      throw new Error('[fb] Facebook is asking for 2FA or identity verification. Log in manually once via a browser with these credentials, complete the check, then re-run.')
    }
  }

  await dismissDialogs(page)
  await context.storageState({ path: SESSION_FILE })
  console.log('[fb] login successful')
}

async function ensureLoggedIn(page: Page, context: BrowserContext): Promise<void> {
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' })
  await sleep(2000)

  const url = page.url()
  const onLoginPage = url.includes('/login') || url.includes('login_attempt')

  if (onLoginPage) {
    await login(page, context)
  } else {
    console.log('[fb] session valid, skipping login')
  }
}

async function dismissDialogs(page: Page): Promise<void> {
  const selectors = [
    '[aria-label="Close"]',
    'div[role="button"]:has-text("Not Now")',
    'div[role="button"]:has-text("Close")',
    'button:has-text("Allow all cookies")',
    'button:has-text("Only allow essential cookies")',
    '[data-testid="cookie-policy-manage-dialog-accept-button"]',
  ]
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first()
      if (await btn.isVisible({ timeout: 1000 })) {
        await btn.click()
        await sleep(500)
      }
    } catch { /* ignore */ }
  }
}

// ── Group feed scraper ────────────────────────────────────────────────────────

async function isGroupAccessible(page: Page, groupId: string): Promise<boolean> {
  const url = `https://www.facebook.com/groups/${groupId}`
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await sleep(randomBetween(2000, 3000))
  await dismissDialogs(page)

  // Check for join wall
  const joinButton = page.locator('[aria-label="Join group"], div[role="button"]:has-text("Join group")').first()
  const hasJoinWall = await joinButton.isVisible({ timeout: 2000 }).catch(() => false)

  if (hasJoinWall) {
    console.log(`[fb] ⚠ not a member of this group — skipping. Join it with your FB account first: ${url}`)
    return false
  }

  return true
}

interface FBPost {
  text: string
  url: string
  postedAt: string
  authorName: string
}

async function scrapeGroupFeed(page: Page, groupId: string, groupName: string): Promise<FBPost[]> {
  // Scroll the feed to load more posts
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 1400))
    await sleep(randomBetween(1500, 2500))
  }

  const posts = await page.evaluate(() => {
    const results: { text: string; url: string; postedAt: string; authorName: string }[] = []
    const articles = document.querySelectorAll('[role="article"]')

    articles.forEach(article => {
      // Skip if this is an ad
      if (article.querySelector('[data-testid="social_actions"]') === null &&
          article.querySelector('a[aria-label="Sponsored"]') !== null) return

      // Get post text
      const textNodes = article.querySelectorAll('[dir="auto"]')
      let text = ''
      textNodes.forEach(node => {
        const t = node.textContent?.trim()
        if (t && t.length > text.length) text = t
      })

      // Get post permalink (timestamp link)
      const links = Array.from(article.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"]'))
      const postLink = links.find(a => (a as HTMLAnchorElement).href.includes('/posts/') ||
                                       (a as HTMLAnchorElement).href.includes('/permalink/'))
      const url = postLink ? (postLink as HTMLAnchorElement).href : ''

      // Get time
      const timeEl = article.querySelector('abbr[data-utime], time[datetime]')
      const postedAt = timeEl?.getAttribute('data-utime')
        ? new Date(Number(timeEl.getAttribute('data-utime')) * 1000).toISOString()
        : timeEl?.getAttribute('datetime') ?? ''

      // Get author
      const authorEl = article.querySelector('h2 strong a, h3 strong a, strong a')
      const authorName = authorEl?.textContent?.trim() ?? ''

      if (text.length > 20 && url) {
        results.push({ text, url, postedAt, authorName })
      }
    })

    return results
  })

  return posts
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
      console.log(`[fb] checking group: ${group.name}`)

      const accessible = await isGroupAccessible(page, group.id)
      if (!accessible) continue

      const posts = await scrapeGroupFeed(page, group.id, group.name)
      console.log(`[fb] ${group.name}: ${posts.length} posts loaded`)

      for (const post of posts) {
        if (seen.has(post.url)) continue
        seen.add(post.url)

        if (!isLeadPost(post.text)) {
          continue
        }

        leads.push({
          source: 'facebook',
          title: post.text.slice(0, 120) + (post.text.length > 120 ? '…' : ''),
          body: post.text,
          url: post.url,
          posted_at: post.postedAt || undefined,
          location: group.name,
          contact: post.authorName || undefined,
          raw: { group: group.name, authorName: post.authorName },
        })

        console.log(`[fb] ✓ lead: ${post.text.slice(0, 80)}`)
      }

      await sleep(randomBetween(3000, 5000))
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

if (process.argv[1]?.endsWith('facebook.ts') || process.argv[1]?.endsWith('facebook.js')) {
  scrapeFacebook().catch(err => { console.error(err); process.exit(1) })
}
