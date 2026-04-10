/**
 * Kijiji Fraser Valley — Moving & Storage scraper
 *
 * Scrapes the "Moving & Storage" category for the Fraser Valley region.
 * Kijiji uses server-rendered HTML so no browser needed — plain fetch + cheerio.
 *
 * Kijiji region code for Fraser Valley: l1700185
 * Category for Moving & Storage:        c142
 */

import * as cheerio from 'cheerio'
import { upsertLeads, type Lead } from './supabase.js'

const BASE_URL = 'https://www.kijiji.ca'

// Search pages to target — people posting "I need movers" / "looking for movers"
const SEARCH_URLS = [
  // Moving & Storage category — Fraser Valley
  `${BASE_URL}/b-moving-storage/fraser-valley/c142l1700185`,
  // Keyword search for people actively looking
  `${BASE_URL}/b-fraser-valley/movers/k0l1700185`,
  `${BASE_URL}/b-fraser-valley/moving/k0l1700185`,
  `${BASE_URL}/b-fraser-valley/need+movers/k0l1700185`,
]

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-CA,en;q=0.9',
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`Kijiji fetch failed: ${res.status} ${url}`)
  return res.text()
}

function parseListingPage(html: string): { title: string; url: string; location: string; postedAt: string }[] {
  const $ = cheerio.load(html)
  const results: { title: string; url: string; location: string; postedAt: string }[] = []

  // Kijiji listing cards — selector targets the main listing items
  $('[data-testid="listing-card"], li[data-listing-id]').each((_, el) => {
    const titleEl = $(el).find('a[class*="title"], [data-testid="listing-title"]').first()
    const title = titleEl.text().trim()
    const href = titleEl.attr('href') || $(el).find('a').first().attr('href') || ''
    const location = $(el).find('[data-testid="listing-location"], [class*="location"]').first().text().trim()
    const postedAt = $(el).find('time').first().attr('datetime') ||
      $(el).find('[data-testid="listing-date"], [class*="date"]').first().text().trim()

    if (title && href) {
      results.push({
        title,
        url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
        location,
        postedAt,
      })
    }
  })

  return results
}

async function fetchListingDetail(url: string): Promise<{ body: string; contact: string; raw: Record<string, unknown> }> {
  const html = await fetchPage(url)
  const $ = cheerio.load(html)

  const body = $('[data-testid="vip-body"], [class*="descriptionContainer"]').first().text().trim()

  // Kijiji hides contact info — grab whatever is visible (phone sometimes shown)
  const contact = $('[data-testid="seller-name"]').first().text().trim()

  // Pull structured JSON-LD if present
  let raw: Record<string, unknown> = {}
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html() || '{}')
      if (parsed['@type'] === 'Product' || parsed['@type'] === 'Offer') {
        raw = parsed
      }
    } catch { /* ignore malformed JSON-LD */ }
  })

  return { body, contact, raw }
}

// Keywords that indicate someone is LOOKING for movers (not advertising services)
const DEMAND_KEYWORDS = [
  'looking for mover', 'need mover', 'need a mover', 'need moving', 'need help moving',
  'looking for moving', 'require mover', 'seeking mover', 'want mover', 'hire mover',
  'help me move', 'help moving', 'anyone move', 'recommend mover', 'moving soon',
  'moving in', 'moving out', 'fraser valley move', 'abbotsford move', 'chilliwack move',
  'langley move', 'surrey move', 'mission move',
]

function isLeadPost(title: string, body: string): boolean {
  const text = `${title} ${body}`.toLowerCase()
  return DEMAND_KEYWORDS.some(kw => text.includes(kw))
}

export async function scrapeKijiji(): Promise<void> {
  console.log('[kijiji] starting scrape')
  const leads: Lead[] = []

  for (const searchUrl of SEARCH_URLS) {
    console.log(`[kijiji] fetching ${searchUrl}`)

    let listings: { title: string; url: string; location: string; postedAt: string }[]
    try {
      const html = await fetchPage(searchUrl)
      listings = parseListingPage(html)
      console.log(`[kijiji] found ${listings.length} listings on page`)
    } catch (err) {
      console.error(`[kijiji] failed to fetch listing page: ${err}`)
      continue
    }

    for (const listing of listings) {
      // Rate limit — be polite to Kijiji
      await sleep(1500 + Math.random() * 1000)

      let detail = { body: '', contact: '', raw: {} as Record<string, unknown> }
      try {
        detail = await fetchListingDetail(listing.url)
      } catch (err) {
        console.warn(`[kijiji] could not fetch detail for ${listing.url}: ${err}`)
      }

      if (!isLeadPost(listing.title, detail.body)) {
        console.log(`[kijiji] skipping (not a demand post): ${listing.title}`)
        continue
      }

      leads.push({
        source: 'kijiji',
        title: listing.title,
        body: detail.body || undefined,
        url: listing.url,
        posted_at: listing.postedAt ? new Date(listing.postedAt).toISOString() : undefined,
        location: listing.location || undefined,
        contact: detail.contact || undefined,
        raw: Object.keys(detail.raw).length > 0 ? detail.raw : undefined,
      })

      console.log(`[kijiji] lead: ${listing.title}`)
    }

    // Pause between search pages
    await sleep(3000)
  }

  if (leads.length > 0) {
    await upsertLeads(leads)
  }

  console.log(`[kijiji] done — ${leads.length} leads saved`)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Run directly: npm run kijiji
if (process.argv[1]?.endsWith('kijiji.ts') || process.argv[1]?.endsWith('kijiji.js')) {
  scrapeKijiji().catch(err => { console.error(err); process.exit(1) })
}
