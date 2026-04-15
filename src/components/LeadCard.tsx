import { useState } from 'react'
import type { Lead, LeadStatus } from '../types/lead'
import { updateLeadStatus } from '../hooks/useLeads'

interface Props {
  lead: Lead
  onStatusChange: (id: string, status: LeadStatus) => void
}

const SOURCE_BADGE: Record<string, string> = {
  kijiji:   'bg-orange-500/20 text-orange-300 border-orange-500/30',
  facebook: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  reddit:   'bg-red-500/20 text-red-300 border-red-500/30',
}

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  contacted: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  closed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  not_relevant: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'closed', label: 'Closed' },
  { value: 'not_relevant', label: 'Not Relevant' },
]

export function LeadCard({ lead, onStatusChange }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleStatusChange = async (status: LeadStatus) => {
    setSaving(true)
    try {
      await updateLeadStatus(lead.id, status)
      onStatusChange(lead.id, status)
    } catch (err) {
      console.error('Failed to update status:', err)
    } finally {
      setSaving(false)
    }
  }

  const postedDate = lead.posted_at
    ? new Date(lead.posted_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  const scrapedDate = new Date(lead.created_at).toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
      {/* Header row */}
      <div className="flex flex-wrap gap-2 items-start justify-between mb-2">
        <div className="flex gap-2 items-center flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${SOURCE_BADGE[lead.source]}`}>
            {lead.source === 'facebook' ? '📘 Facebook' : lead.source === 'reddit' ? '🟥 Reddit' : '🟠 Kijiji'}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_BADGE[lead.status]}`}>
            {lead.status.replace('_', ' ')}
          </span>
          {lead.location && (
            <span className="text-xs text-gray-500">📍 {lead.location}</span>
          )}
        </div>

        {/* Status changer */}
        <select
          value={lead.status}
          onChange={e => handleStatusChange(e.target.value as LeadStatus)}
          disabled={saving}
          className="bg-gray-800 border border-gray-700 text-xs text-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:border-amber-500 disabled:opacity-50"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Title */}
      <h3 className="text-gray-100 font-medium text-sm leading-snug mb-2 line-clamp-2">
        {lead.title}
      </h3>

      {/* Body (expandable) */}
      {lead.body && (
        <div className="mb-3">
          <p className={`text-gray-400 text-sm leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
            {lead.body}
          </p>
          {lead.body.length > 200 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-amber-400 text-xs mt-1 hover:text-amber-300 transition-colors"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 items-center text-xs text-gray-500 mt-2 pt-2 border-t border-gray-800">
        {lead.contact && <span>👤 {lead.contact}</span>}
        {postedDate && <span>📅 Posted {postedDate}</span>}
        <span>🕐 Scraped {scrapedDate}</span>
        <a
          href={lead.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-amber-400 hover:text-amber-300 transition-colors font-medium"
        >
          View post →
        </a>
      </div>
    </div>
  )
}
