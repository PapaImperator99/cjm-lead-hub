import type { Lead } from '../types/lead'

interface Props {
  leads: Lead[]
}

export function StatBar({ leads }: Props) {
  const today = new Date().toDateString()

  const stats = {
    total: leads.length,
    newToday: leads.filter(l => new Date(l.created_at).toDateString() === today && l.status === 'new').length,
    newTotal: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    kijiji: leads.filter(l => l.source === 'kijiji').length,
    facebook: leads.filter(l => l.source === 'facebook').length,
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
      <Stat label="Total Leads" value={stats.total} color="text-gray-100" />
      <Stat label="New Today" value={stats.newToday} color="text-emerald-400" />
      <Stat label="Unread" value={stats.newTotal} color="text-amber-400" />
      <Stat label="Contacted" value={stats.contacted} color="text-blue-400" />
      <Stat label="Kijiji" value={stats.kijiji} color="text-orange-400" />
      <Stat label="Facebook" value={stats.facebook} color="text-indigo-400" />
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 flex flex-col gap-1">
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
    </div>
  )
}
