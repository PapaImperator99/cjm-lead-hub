/**
 * CJM Lead Scraper — Scheduler
 *
 * Runs both Kijiji and Facebook scrapers on a cron schedule.
 * Default: every 2 hours. Override with SCRAPE_CRON in scraper/.env
 *
 * Usage:
 *   npm start              — run scheduler (keeps process alive)
 *   npm run kijiji         — one-shot Kijiji run
 *   npm run facebook       — one-shot Facebook run
 */

import cron from 'node-cron'
import 'dotenv/config'
import { scrapeKijiji } from './kijiji.js'
import { scrapeFacebook } from './facebook.js'

const CRON_SCHEDULE = process.env.SCRAPE_CRON ?? '0 */2 * * *' // every 2 hours

async function runAll(): Promise<void> {
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`[scheduler] run started at ${new Date().toLocaleString('en-CA', { timeZone: 'America/Vancouver' })}`)
  console.log('─'.repeat(50))

  const results = await Promise.allSettled([
    runScraper('kijiji', scrapeKijiji),
    runScraper('facebook', scrapeFacebook),
  ])

  results.forEach(r => {
    if (r.status === 'rejected') {
      console.error('[scheduler] scraper error:', r.reason)
    }
  })

  console.log(`[scheduler] run complete at ${new Date().toLocaleString('en-CA', { timeZone: 'America/Vancouver' })}\n`)
}

async function runScraper(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`[${name}] fatal error:`, err)
    throw err
  }
}

// Run immediately on startup, then on schedule
console.log(`[scheduler] starting — cron: "${CRON_SCHEDULE}"`)
runAll()

cron.schedule(CRON_SCHEDULE, runAll, {
  timezone: 'America/Vancouver',
})
