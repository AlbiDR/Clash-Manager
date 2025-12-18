
import { computed } from 'vue'
import { useClanData } from './useClanData'

export interface BenchmarkData {
    label: string
    tier: 'ELITE' | 'TOP TIER' | 'GROWING' | 'UNDER'
    value: number
    avg: number
    min: number
    max: number
    percent: number
    isBetter: boolean
}

export function useBenchmarking() {
    const { data } = useClanData()

    const getAvg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    const getMax = (arr: number[]) => arr.length ? Math.max(...arr) : 0
    const getMin = (arr: number[]) => arr.length ? Math.min(...arr) : 0

    const lbStats = computed(() => {
        const lb = data.value?.lb || []
        if (!lb.length) return null
        return {
            trophies: { avg: getAvg(lb.map(m => m.t)), max: getMax(lb.map(m => m.t)), min: getMin(lb.map(m => m.t)) },
            warRate: { avg: getAvg(lb.map(m => parseFloat(m.d.rate || '0'))), max: getMax(lb.map(m => parseFloat(m.d.rate || '0'))), min: getMin(lb.map(m => parseFloat(m.d.rate || '0'))) },
            donations: { avg: getAvg(lb.map(m => m.d.avg)), max: getMax(lb.map(m => m.d.avg)), min: getMin(lb.map(m => m.d.avg)) },
            score: { avg: getAvg(lb.map(m => m.s)), max: getMax(lb.map(m => m.s)), min: getMin(lb.map(m => m.s)) },
            tenure: { avg: getAvg(lb.map(m => m.d.days)), max: getMax(lb.map(m => m.d.days)), min: getMin(lb.map(m => m.d.days)) },
            momentum: { avg: getAvg(lb.map(m => m.dt || 0)), max: getMax(lb.map(m => m.dt || 0)), min: getMin(lb.map(m => m.dt || 0)) }
        }
    })

    const hhStats = computed(() => {
        const hh = data.value?.hh || []
        if (!hh.length) return null
        return {
            trophies: { avg: getAvg(hh.map(m => m.t)), max: getMax(hh.map(m => m.t)), min: getMin(hh.map(m => m.t)) },
            donations: { avg: getAvg(hh.map(m => m.d.don)), max: getMax(hh.map(m => m.d.don)), min: getMin(hh.map(m => m.d.don)) },
            warWins: { avg: getAvg(hh.map(m => m.d.war)), max: getMax(hh.map(m => m.d.war)), min: getMin(hh.map(m => m.d.war)) },
            cardsWon: { avg: getAvg(hh.map(m => m.d.cards || 0)), max: getMax(hh.map(m => m.d.cards || 0)), min: getMin(hh.map(m => m.d.cards || 0)) },
            score: { avg: getAvg(hh.map(m => m.s)), max: getMax(hh.map(m => m.s)), min: getMin(hh.map(m => m.s)) }
        }
    })

    function getBenchmark(context: 'lb' | 'hh', metric: string, value: number): BenchmarkData | null {
        const stats = context === 'lb' ? lbStats.value : hhStats.value
        if (!stats) return null

        const m = (stats as any)[metric]
        if (!m) return null

        const diff = value - m.avg
        const percent = Math.abs(Math.round((diff / (m.avg || 1)) * 100))
        const isBetter = diff >= 0
        
        const labels: Record<string, string> = {
            trophies: 'Trophy Rank',
            warRate: 'War Reliability',
            donations: context === 'lb' ? 'Daily Average' : 'Lifetime Donos',
            warWins: 'Legacy War Wins',
            cardsWon: 'Cards Won',
            score: context === 'lb' ? 'Performance' : 'Potential',
            tenure: 'Clan Loyalty',
            momentum: 'Growth Pace'
        }

        const tier = value >= m.max * 0.9 ? 'ELITE' : (isBetter ? 'TOP TIER' : (value < m.avg * 0.5 ? 'UNDER' : 'GROWING'))

        return {
            label: labels[metric] || metric,
            tier: tier as any,
            value,
            avg: m.avg,
            min: m.min,
            max: m.max,
            percent,
            isBetter
        }
    }

    return { getBenchmark }
}

