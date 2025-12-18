
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
    unit?: string
}

export function useBenchmarking() {
    const { data } = useClanData()

    const clanStats = computed(() => {
        const lb = data.value?.lb || []
        if (lb.length === 0) return null

        const trophies = lb.map(m => m.t)
        const warRates = lb.map(m => parseFloat(m.d.rate || '0'))
        const donations = lb.map(m => m.d.avg)
        const scores = lb.map(m => m.s)
        const tenure = lb.map(m => m.d.days)
        const momentum = lb.map(m => m.dt || 0)

        const getAvg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1)
        const getMax = (arr: number[]) => Math.max(...arr)
        const getMin = (arr: number[]) => Math.min(...arr)

        return {
            trophies: { avg: getAvg(trophies), max: getMax(trophies), min: getMin(trophies) },
            warRate: { avg: getAvg(warRates), max: getMax(warRates), min: getMin(warRates) },
            donations: { avg: getAvg(donations), max: getMax(donations), min: getMin(donations) },
            score: { avg: getAvg(scores), max: getMax(scores), min: getMin(scores) },
            tenure: { avg: getAvg(tenure), max: getMax(tenure), min: getMin(tenure) },
            momentum: { avg: getAvg(momentum), max: getMax(momentum), min: getMin(momentum) }
        }
    })

    function getBenchmark(metric: keyof NonNullable<typeof clanStats.value>, value: number): BenchmarkData | null {
        const stats = clanStats.value
        if (!stats) return null

        const m = stats[metric]
        const diff = value - m.avg
        const percent = Math.abs(Math.round((diff / (m.avg || 1)) * 100))
        const isBetter = diff >= 0
        
        const labels: Record<string, string> = {
            trophies: 'Trophies',
            warRate: 'War Rate',
            donations: 'Avg Donos',
            score: 'Performance',
            tenure: 'Clan Days',
            momentum: 'Momentum'
        }

        const tier = value >= m.max * 0.9 ? 'ELITE' : (isBetter ? 'TOP TIER' : (value < m.avg * 0.5 ? 'UNDER' : 'GROWING'))

        return {
            label: labels[metric],
            tier: tier as any,
            value,
            avg: m.avg,
            min: m.min,
            max: m.max,
            percent,
            isBetter
        }
    }

    return {
        clanStats,
        getBenchmark
    }
}

