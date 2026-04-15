import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Lead, LeadSource, LeadStatus } from '../types/lead'

export interface LeadFilters {
  source: LeadSource | 'all'
  status: LeadStatus | 'all'
  search: string
}

export function useLeads(filters: LeadFilters) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters.source !== 'all') query = query.eq('source', filters.source)
    if (filters.status !== 'all') query = query.eq('status', filters.status)
    if (filters.search.trim()) {
      query = query.or(
        `title.ilike.%${filters.search}%,body.ilike.%${filters.search}%,location.ilike.%${filters.search}%`
      )
    }

    const { data, error } = await query
    if (error) setError(error.message)
    else setLeads((data as Lead[]) ?? [])
    setLoading(false)
  }, [filters.source, filters.status, filters.search])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  return { leads, loading, error, refetch: fetchLeads }
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  const { error } = await supabase.from('leads').update({ status }).eq('id', id)
  if (error) throw error
}
