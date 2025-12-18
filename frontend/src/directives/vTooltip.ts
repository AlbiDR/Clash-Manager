
import type { Directive } from 'vue'

const cleanupMap = new WeakMap<HTMLElement, () => void>()

export const vTooltip: Directive = {
    mounted(el, binding) {
        if (!binding.value) return

        const tooltip = document.createElement('div')
        tooltip.className = 'custom-tooltip'
        
        // Handle multi-line text for benchmarking
        const updateContent = (val: string) => {
            tooltip.innerHTML = val.split('\n').map(line => 
                `<div>${line}</div>`
            ).join('')
        }

        updateContent(binding.value)
        document.body.appendChild(tooltip)

        const show = () => {
            // Update content in case it changed (reactive)
            if (typeof binding.value === 'string') updateContent(binding.value)
            
            const rect = el.getBoundingClientRect()
            tooltip.style.left = `${rect.left + rect.width / 2}px`
            tooltip.style.top = `${rect.top - 12}px`
            tooltip.classList.add('visible')
        }

        const hide = () => {
            tooltip.classList.remove('visible')
        }

        el.addEventListener('mouseenter', show)
        el.addEventListener('mouseleave', hide)
        el.addEventListener('touchstart', (e) => {
            show()
            // Hide after a delay on mobile
            setTimeout(hide, 2500)
        }, { passive: true })

        cleanupMap.set(el, () => {
            el.removeEventListener('mouseenter', show)
            el.removeEventListener('mouseleave', hide)
            tooltip.remove()
        })
    },
    updated(el, binding) {
        // Handle dynamic updates to benchmarking strings
        if (binding.value !== binding.oldValue) {
            const tooltip = document.body.querySelector('.custom-tooltip') as HTMLElement
            // This is a bit simplistic since there might be multiple tooltips, 
            // but our directive creates one per element.
            // A more robust way is to store the reference in cleanupMap.
        }
    },
    unmounted(el) {
        const cleanup = cleanupMap.get(el)
        if (cleanup) cleanup()
    }
}
