
import { computed } from 'vue'
import { useClanData } from './useClanData'

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
            momentum: { avg: getAvg(momentum), max: getMax(momentum), min: getMin(momentum) },
            count: lb.length
        }
    })

    function getGhostTooltip(metric: 'trophies' | 'warRate' | 'donations' | 'score' | 'tenure' | 'momentum', value: number) {
        const stats = clanStats.value
        if (!stats) return 'Analyzing clan data...'

        const m = stats[metric]
        const diff = value - m.avg
        const percent = Math.abs(Math.round((diff / (m.avg || 1)) * 100))
        const isBetter = diff >= 0
        
        // Semantic Labels
        const labels: Record<string, string> = {
            trophies: 'Trophy Standing',
            warRate: 'War Reliability',
            donations: 'Contribution Level',
            score: 'Performance Tier',
            tenure: 'Clan Loyalty',
            momentum: 'Growth Momentum'
        }

        // Elegant Ghost Bar Visual (Unicode Precision)
        const barWidth = 14
        const playerPos = m.max === m.min ? 0 : Math.round(((value - m.min) / (m.max - m.min)) * (barWidth - 1))
        const avgPos = m.max === m.min ? 0 : Math.round(((m.avg - m.min) / (m.max - m.min)) * (barWidth - 1))
        
        let bar = Array(barWidth).fill('─')
        bar[avgPos] = '┨' // Subtle anchor for average
        bar[playerPos] = '●' // Player point
        
        const delta = isBetter ? `+${percent}%` : `-${percent}%`
        const tier = value >= m.max * 0.9 ? 'ELITE' : (isBetter ? 'TOP TIER' : 'GROWING')

        return `${labels[metric]} • ${tier}\n${bar.join('')}\nAvg: ${Math.round(m.avg).toLocaleString()} (${delta})`
    }

    return {
        clanStats,
        getGhostTooltip
    }
}

