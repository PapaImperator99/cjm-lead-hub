import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY

if (!url || !key) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env')
}

export const supabase = createClient(url, key)

export interface Lead {
  source: 'kijiji' | 'facebook'
  title: string
  body?: string
  url: string
  posted_at?: string
  location?: string
  contact?: string
  raw?: Record<string, unknown>
}

export async function upsertLeads(leads: Lead[]): Promise<void> {
  if (leads.length === 0) return

  const { error } = await supabase
    .from('leads')
    .upsert(leads, { onConflict: 'url', ignoreDuplicates: true })

  if (error) throw error

  console.log(`[db] upserted ${leads.length} leads`)
}
