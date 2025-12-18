
import type { Directive } from 'vue'
import type { BenchmarkData } from '../composables/useBenchmarking'

// Singleton Tooltip State
let tooltipEl: HTMLDivElement | null = null
let activeElement: HTMLElement | null = null
let hideTimer: number | null = null
let pressTimer: number | null = null

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
            <span class="rt-tier tier-${data.tier.toLowerCase().replace(' ', '-')}">${data.tier}</span>
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
        <div class="rt-bounds">
            <div class="rt-bound"><span>MIN</span> ${Math.round(data.min).toLocaleString()}</div>
            <div class="rt-bound"><span>MAX</span> ${Math.round(data.max).toLocaleString()}</div>
        </div>
    `
}

function positionTooltip(el: HTMLElement) {
    if (!tooltipEl) return
    
    const rect = el.getBoundingClientRect()
    const scrollY = window.scrollY
    const viewportWidth = window.innerWidth
    const padding = 12

    tooltipEl.classList.add('visible')
    const tipRect = tooltipEl.getBoundingClientRect()

    let left = rect.left + rect.width / 2
    const halfWidth = tipRect.width / 2
    if (left - halfWidth < padding) {
        left = halfWidth + padding
    } else if (left + halfWidth > viewportWidth - padding) {
        left = viewportWidth - halfWidth - padding
    }

    let top = rect.top + scrollY - 8
    let translateY = '-100%'

    if (rect.top < tipRect.height + padding * 2) {
        top = rect.bottom + scrollY + 8
        translateY = '0%'
    }

    tooltipEl.style.left = `${left}px`
    tooltipEl.style.top = `${top}px`
    tooltipEl.style.transform = `translateX(-50%) translateY(${translateY}) scale(1)`
}

function globalHide() {
    if (tooltipEl) {
        tooltipEl.classList.remove('visible')
        tooltipEl.style.transform = tooltipEl.style.transform.replace('scale(1)', 'scale(0.8)')
    }
    activeElement = null
    if (pressTimer) {
        clearTimeout(pressTimer)
        pressTimer = null
    }
}

// Global dismiss listeners
if (typeof window !== 'undefined') {
    window.addEventListener('scroll', globalHide, { passive: true })
    window.addEventListener('touchstart', (e) => {
        if (tooltipEl?.classList.contains('visible') && !(e.target as HTMLElement).closest('.rich-tooltip')) {
            globalHide()
        }
    }, { passive: true })
}

export const vTooltip: Directive = {
    mounted(el, binding) {
        if (!binding.value) return

        const show = (e?: TouchEvent) => {
            if (e) e.stopPropagation() // Stop bubbling to card long-press
            
            if (hideTimer) {
                clearTimeout(hideTimer)
                hideTimer = null
            }
            createTooltip()
            activeElement = el
            renderContent(binding.value)
            positionTooltip(el)
            
            if (navigator.vibrate) navigator.vibrate(40)
        }

        const hide = () => {
            if (activeElement === el) {
                hideTimer = window.setTimeout(globalHide, 100)
            }
        }

        // Desktop
        el.addEventListener('mouseenter', show)
        el.addEventListener('mouseleave', hide)

        // Mobile Long Press
        el.addEventListener('touchstart', (e) => {
            if (pressTimer) clearTimeout(pressTimer)
            pressTimer = window.setTimeout(() => {
                show(e)
            }, 400)
        }, { passive: false })

        el.addEventListener('touchend', () => {
            if (pressTimer) {
                clearTimeout(pressTimer)
                pressTimer = null
            }
        }, { passive: true })

        el.addEventListener('touchmove', () => {
            if (pressTimer) {
                clearTimeout(pressTimer)
                pressTimer = null
            }
        }, { passive: true })
    }
}

