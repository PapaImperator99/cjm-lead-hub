import type { LeadFilters } from '../hooks/useLeads'
import type { LeadSource, LeadStatus } from '../types/lead'

interface Props {
  filters: LeadFilters
  onChange: (f: LeadFilters) => void
  onRefresh: () => void
  loading: boolean
}

export function FilterBar({ filters, onChange, onRefresh, loading }: Props) {
  const set = (patch: Partial<LeadFilters>) => onChange({ ...filters, ...patch })

  return (
    <div className="flex flex-wrap gap-3 mb-5 items-center">
      {/* Search */}
      <input
        type="text"
        placeholder="Search leads…"
        value={filters.search}
        onChange={e => set({ search: e.target.value })}
        className="flex-1 min-w-[200px] bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500"
      />

      {/* Source filter */}
      <select
        value={filters.source}
        onChange={e => set({ source: e.target.value as LeadSource | 'all' })}
        className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
      >
        <option value="all">All Sources</option>
        <option value="kijiji">Kijiji</option>
        <option value="facebook">Facebook</option>
        <option value="reddit">Reddit</option>
      </select>

      {/* Status filter */}
      <select
        value={filters.status}
        onChange={e => set({ status: e.target.value as LeadStatus | 'all' })}
        className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
      >
        <option value="all">All Statuses</option>
        <option value="new">New</option>
        <option value="contacted">Contacted</option>
        <option value="closed">Closed</option>
        <option value="not_relevant">Not Relevant</option>
      </select>

      {/* Refresh */}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? 'Loading…' : '↻ Refresh'}
      </button>
    </div>
  )
}
