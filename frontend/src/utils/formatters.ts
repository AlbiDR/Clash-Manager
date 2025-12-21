
/**
 * Centralized formatting utilities for consistency across the application.
 */

export function getScoreTone(score: number | undefined): string {
    const s = score || 0
    if (s >= 80) return 'tone-high'
    if (s >= 50) return 'tone-mid'
    return 'tone-low'
}

export function formatTimeAgo(dateStr: string | null | undefined): string {
    if (!dateStr) return '-'
    
    // Check for GAS/RoyaleAPI specific "Just now" or pre-formatted strings if needed
    if (dateStr === 'Just now') return dateStr

    const ts = new Date(dateStr).getTime()
    if (isNaN(ts)) return '-'

    const ms = Date.now() - ts
    const mins = Math.floor(ms / 60000)

    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}

export function formatTimeAgoShort(dateStr: string | null | undefined): string {
    if (!dateStr) return '-'
    const ts = new Date(dateStr).getTime()
    if (isNaN(ts)) return '-'

    const ms = Date.now() - ts
    const mins = Math.floor(ms / 60000)

    if (mins < 1) return 'New'
    if (mins < 60) return `${mins}m`
    
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    
    const days = Math.floor(hours / 24)
    return `${days}d`
}

export function parseTimeAgoValue(val: string | null | undefined): number {
    if (!val || val === '-' || val === 'Just now') return 0
    const match = val.match(/^(\d+)([ymdh]) ago$/)
    if (!match) return 99999999
    const num = parseInt(match[1])
    const unit = match[2]
    switch(unit) {
      case 'm': return num
      case 'h': return num * 60
      case 'd': return num * 1440
      case 'y': return num * 525600
      default: return num
    }
}

export function formatRole(roleStr: string): { label: string, class: string } {
    const r = (roleStr || '').toLowerCase()
    if (r.includes('leader') && !r.includes('co')) return { label: 'Leader', class: 'role-leader' }
    if (r.includes('coleader') || r.includes('co-leader')) return { label: 'Co-Lead', class: 'role-coleader' }
    if (r.includes('elder')) return { label: 'Elder', class: 'role-elder' }
    return { label: 'Member', class: 'role-member' }
}
