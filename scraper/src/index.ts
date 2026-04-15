/**
 * CJM Lead Scraper — Smart Scheduler
 *
 * Runs every hour but uses smart throttling based on date + season:
 *
 *   Peak window  (21st–end of month, or May–Sep):  runs every hour
 *   Normal window (1st–20th, Oct–Apr):             runs every 4 hours
 *
 * Usage:
 *   npm start          — run smart scheduler (keeps process alive)
 *   npm run kijiji     — one-shot Kijiji run
 *   npm run facebook   — one-shot Facebook run
 */

import cron from 'node-cron'
import 'dotenv/config'
import { scrapeKijiji } from './kijiji.js'
import { scrapeFacebook } from './facebook.js'
import { scrapeReddit } from './reddit.js'

// ── Peak time logic ───────────────────────────────────────────────────────────

function isPeakTime(): boolean {
  const now = new Date(new Date().toLocaleString('en-CA', { timeZone: 'America/Vancouver' }))
  const day   = now.getDate()
  const month = now.getMonth() + 1 // 1-based

  const isMovingSeason   = month >= 5 && month <= 9           // May–September
  const isEndOfMonth     = day >= 21                          // 21st → end of month
  const isStartOfMonth   = day <= 5                           // 1st–5th (late bookers)

  return isMovingSeason || isEndOfMonth || isStartOfMonth
}

function peakLabel(): string {
  const now = new Date(new Date().toLocaleString('en-CA', { timeZone: 'America/Vancouver' }))
  const day   = now.getDate()
  const month = now.getMonth() + 1

  if (month >= 5 && month <= 9) return 'moving season (May–Sep)'
  if (day >= 21)                return `end-of-month peak (day ${day})`
  if (day <= 5)                 return `start-of-month peak (day ${day})`
  return 'normal'
}

// ── Runner ────────────────────────────────────────────────────────────────────

let hourCount = 0 // tracks hours elapsed for 4-hour throttle

async function maybeRun(): Promise<void> {
  hourCount++

  const peak = isPeakTime()

  // During off-peak only run every 4th tick (every 4 hours)
  if (!peak && hourCount % 4 !== 0) {
    const nextRun = 4 - (hourCount % 4)
    console.log(`[scheduler] off-peak — skipping (next run in ~${nextRun}h)`)
    return
  }

  await runAll(peak)
}

async function runAll(peak: boolean): Promise<void> {
  const now = new Date().toLocaleString('en-CA', {
    timeZone: 'America/Vancouver',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  console.log(`\n${'─'.repeat(54)}`)
  console.log(`[scheduler] ${now}`)
  console.log(`[scheduler] mode: ${peakLabel()}`)
  console.log('─'.repeat(54))

  const results = await Promise.allSettled([
    runScraper('kijiji', scrapeKijiji),
    runScraper('facebook', scrapeFacebook),
    runScraper('reddit', scrapeReddit),
  ])

  results.forEach(r => {
    if (r.status === 'rejected') {
      console.error('[scheduler] scraper error:', r.reason)
    }
  })

  console.log(`[scheduler] done\n`)
}

async function runScraper(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`[${name}] fatal error:`, err)
    throw err
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

const mode = isPeakTime() ? `PEAK (${peakLabel()})` : 'normal (every 4h)'
console.log(`[scheduler] starting — ${mode}`)
console.log(`[scheduler] peak windows: 21st–end of month | May–September | 1st–5th`)

// Run immediately on startup
runAll(isPeakTime())

// Then check every hour — maybeRun() decides whether to actually scrape
cron.schedule('0 * * * *', maybeRun, { timezone: 'America/Vancouver' })
