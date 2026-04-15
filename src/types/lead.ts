export type LeadSource = 'kijiji' | 'facebook'
export type LeadStatus = 'new' | 'contacted' | 'closed' | 'not_relevant'

export interface Lead {
  id: string
  source: LeadSource
  title: string
  body: string | null
  url: string
  posted_at: string | null
  location: string | null
  contact: string | null
  status: LeadStatus
  raw: Record<string, unknown> | null
  created_at: string
}
