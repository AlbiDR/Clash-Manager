import type { Directive } from 'vue'

const cleanupMap = new WeakMap<HTMLElement, () => void>()

export const vTooltip: Directive = {
    mounted(el, binding) {
        if (!binding.value) return

        const tooltip = document.createElement('div')
        tooltip.className = 'custom-tooltip'
        tooltip.textContent = binding.value
        document.body.appendChild(tooltip)

        const show = () => {
            const rect = el.getBoundingClientRect()
            tooltip.style.left = `${rect.left + rect.width / 2}px`
            tooltip.style.top = `${rect.top - 8}px`
            tooltip.classList.add('visible')
        }

        const hide = () => {
            tooltip.classList.remove('visible')
        }

        el.addEventListener('mouseenter', show)
        el.addEventListener('mouseleave', hide)
        el.addEventListener('focus', show)
        el.addEventListener('blur', hide)

        // Cleanup function
        cleanupMap.set(el, () => {
            el.removeEventListener('mouseenter', show)
            el.removeEventListener('mouseleave', hide)
            el.removeEventListener('focus', show)
            el.removeEventListener('blur', hide)
            tooltip.remove()
        })
    },
    unmounted(el) {
        const cleanup = cleanupMap.get(el)
        if (cleanup) cleanup()
    }
}
