
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

        const getAvg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
        const getMax = (arr: number[]) => Math.max(...arr)
        const getMin = (arr: number[]) => Math.min(...arr)

        return {
            trophies: { avg: getAvg(trophies), max: getMax(trophies), min: getMin(trophies) },
            warRate: { avg: getAvg(warRates), max: getMax(warRates), min: getMin(warRates) },
            donations: { avg: getAvg(donations), max: getMax(donations), min: getMin(donations) },
            count: lb.length
        }
    })

    function getGhostTooltip(metric: 'trophies' | 'warRate' | 'donations', value: number) {
        const stats = clanStats.value
        if (!stats) return 'Calculating benchmarks...'

        const m = stats[metric]
        const diff = value - m.avg
        const percent = Math.abs(Math.round((diff / m.avg) * 100))
        const relation = diff >= 0 ? 'above' : 'below'
        
        // Create the "Ghost Bar" visual using special characters and formatting
        // We'll use this in the custom tooltip directive's enhanced rendering
        const barWidth = 20
        const playerPos = Math.round(((value - m.min) / (m.max - m.min)) * barWidth)
        const avgPos = Math.round(((m.avg - m.min) / (m.max - m.min)) * barWidth)
        
        let bar = Array(barWidth).fill('—')
        bar[avgPos] = '┃' // Clan Average "Ghost" line
        bar[playerPos] = '●' // Player position
        
        const barStr = bar.join('')
        const sentiment = diff >= 0 ? '↑' : '↓'

        return `${sentiment} ${percent}% ${relation} clan avg\n[${barStr}]\nAvg: ${Math.round(m.avg).toLocaleString()}`
    }

    return {
        clanStats,
        getGhostTooltip
    }
}
