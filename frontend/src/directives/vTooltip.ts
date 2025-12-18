
import type { Directive } from 'vue'
import type { BenchmarkData } from '../composables/useBenchmarking'

// Singleton Tooltip State
let tooltipEl: HTMLDivElement | null = null
let activeElement: HTMLElement | null = null
let hideTimer: number | null = null

function createTooltip() {
    if (tooltipEl) return tooltipEl
    const el = document.createElement('div')
    el.className = 'rich-tooltip'
    document.body.appendChild(el)
    tooltipEl = el
    return el
}

function renderContent(data: BenchmarkData | string) {
    if (!tooltipEl) return

    if (typeof data === 'string') {
        tooltipEl.innerHTML = `<div class="rt-simple">${data}</div>`
        return
    }

    const range = data.max - data.min || 1
    const playerPos = Math.min(100, Math.max(0, ((data.value - data.min) / range) * 100))
    const avgPos = Math.min(100, Math.max(0, ((data.avg - data.min) / range) * 100))
    
    const sentimentClass = data.isBetter ? 'better' : 'worse'
    const delta = data.isBetter ? `+${data.percent}%` : `-${data.percent}%`

    tooltipEl.innerHTML = `
        <div class="rt-header">
            <span class="rt-label">${data.label}</span>
            <span class="rt-tier tier-${data.tier.toLowerCase()}">${data.tier}</span>
        </div>
        <div class="rt-visual">
            <div class="rt-track">
                <div class="rt-line"></div>
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

function positionTooltip(el: HTMLElement) {
    if (!tooltipEl) return
    
    const rect = el.getBoundingClientRect()
    const scrollY = window.scrollY
    const viewportWidth = window.innerWidth
    const padding = 12

    // Force a paint so we can measure the rendered size
    tooltipEl.classList.add('visible')
    const tipRect = tooltipEl.getBoundingClientRect()

    // 1. Calculate Horizontal (Centered by default)
    let left = rect.left + rect.width / 2
    
    // Horizontal Edge Safety
    const halfWidth = tipRect.width / 2
    if (left - halfWidth < padding) {
        left = halfWidth + padding
    } else if (left + halfWidth > viewportWidth - padding) {
        left = viewportWidth - halfWidth - padding
    }

    // 2. Calculate Vertical
    let top = rect.top + scrollY - 6 // Above element
    let translateY = '-100%'

    // Vertical Edge Safety (Flip to bottom if too close to top)
    if (rect.top < tipRect.height + padding * 2) {
        top = rect.bottom + scrollY + 6
        translateY = '0%'
    }

    tooltipEl.style.left = `${left}px`
    tooltipEl.style.top = `${top}px`
    tooltipEl.style.transform = `translateX(-50%) translateY(${translateY})`
}

export const vTooltip: Directive = {
    mounted(el, binding) {
        if (!binding.value) return

        const show = () => {
            if (hideTimer) {
                clearTimeout(hideTimer)
                hideTimer = null
            }
            
            const tip = createTooltip()
            activeElement = el
            renderContent(binding.value)
            positionTooltip(el)
        }

        const hide = () => {
            if (activeElement === el) {
                hideTimer = window.setTimeout(() => {
                    if (tooltipEl) tooltipEl.classList.remove('visible')
                    activeElement = null
                }, 100)
            }
        }

        el.addEventListener('mouseenter', show)
        el.addEventListener('mouseleave', hide)
        el.addEventListener('touchstart', (e) => {
            show()
            // Longer persistence on mobile
            if (hideTimer) clearTimeout(hideTimer)
            hideTimer = window.setTimeout(() => {
                if (tooltipEl) tooltipEl.classList.remove('visible')
                activeElement = null
            }, 3000)
        }, { passive: true })
    }
}

