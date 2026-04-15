/**
 * Kijiji — Lower Fraser Valley moving leads scraper
 *
 * Targets people LOOKING TO HIRE movers in the Lower Fraser Valley.
 * Filters out: companies advertising services, Ottawa/out-of-region posts.
 *
 * Kijiji region codes:
 *   Fraser Valley:  l1700185
 *   Abbotsford:     l1700173
 *   Chilliwack:     l1700174
 */

import * as cheerio from 'cheerio'
import { upsertLeads, type Lead } from './supabase.js'

const BASE_URL = 'https://www.kijiji.ca'

// Search across Fraser Valley + specific city regions with buyer-intent keywords
const SEARCH_URLS = [
  // "Wanted" style keyword searches across all categories — Fraser Valley
  `${BASE_URL}/b-fraser-valley/need+movers/k0l1700185`,
  `${BASE_URL}/b-fraser-valley/looking+for+movers/k0l1700185`,
  `${BASE_URL}/b-fraser-valley/need+moving+help/k0l1700185`,
  `${BASE_URL}/b-fraser-valley/hire+movers/k0l1700185`,
  // Abbotsford specific
  `${BASE_URL}/b-abbotsford/movers/k0l1700173`,
  `${BASE_URL}/b-abbotsford/moving/k0l1700173`,
  // Chilliwack specific
  `${BASE_URL}/b-chilliwack/movers/k0l1700174`,
]

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-CA,en;q=0.9',
}

// ── Geography ────────────────────────────────────────────────────────────────

// Lower Fraser Valley cities we serve
const FRASER_VALLEY_CITIES = [
  'abbotsford', 'chilliwack', 'langley', 'surrey', 'mission', 'maple ridge',
  'aldergrove', 'white rock', 'cloverdale', 'fort langley', 'walnut grove',
  'agassiz', 'harrison', 'hope', 'pitt meadows', 'port coquitlam',
  'coquitlam', 'delta', 'burnaby', 'new westminster', 'fraser valley',
  'lower mainland', 'bc', 'british columbia',
]

// Cities/provinces that tell us it's NOT our area — skip immediately
const OUT_OF_REGION = [
  'ottawa', 'toronto', 'ontario', 'alberta', 'calgary', 'edmonton',
  'winnipeg', 'manitoba', 'quebec', 'montreal', 'halifax', 'nova scotia',
  'saskatchewan', 'regina', 'saskatoon', 'ontario',
]

function isInRegion(title: string, body: string, location: string): boolean {
  const text = `${title} ${body} ${location}`.toLowerCase()

  // Hard reject if it mentions an out-of-region place
  if (OUT_OF_REGION.some(place => text.includes(place))) return false

  // Accept if it mentions a Fraser Valley city OR has no city mentioned at all
  // (Kijiji region filter already narrows it geographically)
  const mentionsCity = FRASER_VALLEY_CITIES.some(city => text.includes(city))
  const mentionsAnyCanadianCity = /toronto|calgary|edmonton|winnipeg|montreal|ottawa|halifax/i.test(text)

  if (mentionsAnyCanadianCity) return false
  return true // trust Kijiji's region filter if no city mentioned
}

// ── Intent filtering ─────────────────────────────────────────────────────────

// Strong signals someone is LOOKING TO HIRE
const DEMAND_KEYWORDS = [
  'looking for mover', 'looking for a mover', 'need mover', 'need a mover',
  'need moving', 'need help moving', 'need help with move', 'looking for moving',
  'require mover', 'require moving', 'seeking mover', 'want to hire',
  'hire mover', 'hire a mover', 'help me move', 'help moving',
  'anyone recommend', 'can anyone recommend', 'recommend a mover',
  'good mover', 'reliable mover', 'affordable mover', 'cheap mover',
  'moving soon', 'moving next', 'moving this', 'have to move',
  'getting quotes', 'quote for moving', 'price for moving',
]

// Hard signals this is a COMPANY advertising — skip these
const SUPPLY_KEYWORDS = [
  'we offer', 'our team', 'our services', 'we provide', 'we are a', 'we are fully',
  'fully insured', 'fully licensed', 'licensed and insured', 'free estimate',
  'free quote', 'call us', 'contact us', 'visit our', 'our rates',
  'professional moving company', 'moving company serving', 'years of experience',
  'book now', 'book today', 'serving the', 'serving fraser valley',
  'serving lower mainland', 'competitive rates', 'competitive pricing',
]

function isLeadPost(title: string, body: string): boolean {
  const text = `${title} ${body}`.toLowerCase()

  // Immediately discard if it looks like a company ad
  if (SUPPLY_KEYWORDS.some(kw => text.includes(kw))) return false

  // Accept if it has buyer-intent language
  return DEMAND_KEYWORDS.some(kw => text.includes(kw))
}

// ── Scraper ───────────────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`Kijiji fetch failed: ${res.status} ${url}`)
  return res.text()
}

function parseListingPage(html: string): { title: string; url: string; location: string; postedAt: string }[] {
  const $ = cheerio.load(html)
  const results: { title: string; url: string; location: string; postedAt: string }[] = []

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
  const contact = $('[data-testid="seller-name"]').first().text().trim()

  let raw: Record<string, unknown> = {}
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html() || '{}')
      if (parsed['@type'] === 'Product' || parsed['@type'] === 'Offer') raw = parsed
    } catch { /* ignore */ }
  })

  return { body, contact, raw }
}

export async function scrapeKijiji(): Promise<void> {
  console.log('[kijiji] starting scrape — Lower Fraser Valley demand posts only')
  const leads: Lead[] = []
  const seen = new Set<string>()

  for (const searchUrl of SEARCH_URLS) {
    console.log(`[kijiji] fetching ${searchUrl}`)

    let listings: { title: string; url: string; location: string; postedAt: string }[]
    try {
      const html = await fetchPage(searchUrl)
      listings = parseListingPage(html)
      console.log(`[kijiji] found ${listings.length} listings`)
    } catch (err) {
      console.error(`[kijiji] failed to fetch listing page: ${err}`)
      continue
    }

    for (const listing of listings) {
      if (seen.has(listing.url)) continue
      seen.add(listing.url)

      // Fast reject on title + location before fetching the detail page
      if (!isInRegion(listing.title, '', listing.location)) {
        console.log(`[kijiji] skip (wrong region): ${listing.title} — ${listing.location}`)
        continue
      }

      await sleep(1500 + Math.random() * 1000)

      let detail = { body: '', contact: '', raw: {} as Record<string, unknown> }
      try {
        detail = await fetchListingDetail(listing.url)
      } catch (err) {
        console.warn(`[kijiji] could not fetch detail: ${err}`)
      }

      if (!isInRegion(listing.title, detail.body, listing.location)) {
        console.log(`[kijiji] skip (out of region after detail): ${listing.title}`)
        continue
      }

      if (!isLeadPost(listing.title, detail.body)) {
        console.log(`[kijiji] skip (company ad or no demand signal): ${listing.title}`)
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

      console.log(`[kijiji] ✓ lead: ${listing.title} — ${listing.location}`)
    }

    await sleep(3000)
  }

  if (leads.length > 0) {
    await upsertLeads(leads)
  }

  console.log(`[kijiji] done — ${leads.length} quality leads saved`)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

if (process.argv[1]?.endsWith('kijiji.ts') || process.argv[1]?.endsWith('kijiji.js')) {
  scrapeKijiji().catch(err => { console.error(err); process.exit(1) })
}
