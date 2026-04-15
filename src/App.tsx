import { useState } from 'react'
import { useLeads, type LeadFilters } from './hooks/useLeads'
import { StatBar } from './components/StatBar'
import { FilterBar } from './components/FilterBar'
import { LeadCard } from './components/LeadCard'
import type { LeadStatus } from './types/lead'

const DEFAULT_FILTERS: LeadFilters = {
  source: 'all',
  status: 'all',
  search: '',
}

export default function App() {
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS)
  const { leads, loading, error, refetch } = useLeads(filters)

  const handleStatusChange = (id: string, status: LeadStatus) => {
    // Optimistic update handled via refetch
    refetch()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top bar */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-100 tracking-tight">
            CJM Moving &amp; Logistics
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Client Lead Hub — Fraser Valley</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-gray-500">Live</span>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats */}
        <StatBar leads={leads} />

        {/* Filters */}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          onRefresh={refetch}
          loading={loading}
        />

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm mb-4">
            ⚠️ {error}
          </div>
        )}

        {/* Lead list */}
        {loading && leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-600">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm">Loading leads…</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-600">
            <p className="text-4xl mb-4">📭</p>
            <p className="text-sm">No leads found.</p>
            <p className="text-xs mt-1 text-gray-700">
              Run the scraper or adjust your filters.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {leads.map(lead => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
