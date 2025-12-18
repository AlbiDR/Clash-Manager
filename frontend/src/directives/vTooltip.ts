
import type { Directive } from 'vue'
import type { BenchmarkData } from '../composables/useBenchmarking'

const cleanupMap = new WeakMap<HTMLElement, () => void>()

export const vTooltip: Directive = {
    mounted(el, binding) {
        if (!binding.value) return

        const tooltip = document.createElement('div')
        tooltip.className = 'rich-tooltip'
        document.body.appendChild(tooltip)

        const renderBenchmark = (data: BenchmarkData) => {
            const range = data.max - data.min || 1
            const playerPos = ((data.value - data.min) / range) * 100
            const avgPos = ((data.avg - data.min) / range) * 100
            
            const sentimentClass = data.isBetter ? 'better' : 'worse'
            const delta = data.isBetter ? `+${data.percent}%` : `-${data.percent}%`

            tooltip.innerHTML = `
                <div class="rt-header">
                    <span class="rt-label">${data.label}</span>
                    <span class="rt-tier tier-${data.tier.toLowerCase()}">${data.tier}</span>
                </div>
                <div class="rt-visual">
                    <div class="rt-track">
                        <div class="rt-marker avg" style="left: ${avgPos}%"></div>
                        <div class="rt-marker player ${sentimentClass}" style="left: ${playerPos}%"></div>
                    </div>
                </div>
                <div class="rt-footer">
                    <span class="rt-stat">AVG ${Math.round(data.avg).toLocaleString()}</span>
                    <span class="rt-delta ${sentimentClass}">${delta}</span>
                </div>
            `
        }

        const renderText = (val: string) => {
            tooltip.innerHTML = `<div class="rt-simple">${val}</div>`
        }

        const updateContent = () => {
            if (typeof binding.value === 'object' && binding.value !== null) {
                renderBenchmark(binding.value as BenchmarkData)
            } else if (typeof binding.value === 'string') {
                renderText(binding.value)
            }
        }

        const show = () => {
            updateContent()
            const rect = el.getBoundingClientRect()
            const scrollY = window.scrollY
            
            // Positioning Logic
            let top = rect.top + scrollY - 8
            let left = rect.left + rect.width / 2
            
            tooltip.classList.add('visible')
            
            // Post-render measurement for edge safety
            const tipRect = tooltip.getBoundingClientRect()
            
            // Adjust Horizontal
            if (left - tipRect.width / 2 < 10) {
                left = tipRect.width / 2 + 10
            } else if (left + tipRect.width / 2 > window.innerWidth - 10) {
                left = window.innerWidth - tipRect.width / 2 - 10
            }

            // Adjust Vertical (Flip if too close to top)
            if (rect.top < tipRect.height + 20) {
                top = rect.bottom + scrollY + tipRect.height + 8
                tooltip.style.transform = `translateX(-50%) translateY(-100%)`
            } else {
                tooltip.style.transform = `translateX(-50%) translateY(-100%)`
            }

            tooltip.style.left = `${left}px`
            tooltip.style.top = `${top}px`
        }

        const hide = () => {
            tooltip.classList.remove('visible')
        }

        el.addEventListener('mouseenter', show)
        el.addEventListener('mouseleave', hide)
        el.addEventListener('touchstart', (e) => {
            show()
            setTimeout(hide, 3000)
        }, { passive: true })

        cleanupMap.set(el, () => {
            el.removeEventListener('mouseenter', show)
            el.removeEventListener('mouseleave', hide)
            tooltip.remove()
        })
    },
    updated(el, binding) {
        if (binding.value === binding.oldValue) return
        // Directive will re-render content on next show() call
    },
    unmounted(el) {
        const cleanup = cleanupMap.get(el)
        if (cleanup) cleanup()
    }
}

