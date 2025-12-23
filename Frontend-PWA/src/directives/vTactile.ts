// @ts-nocheck
import type { Directive, DirectiveBinding } from 'vue'

interface TactileBinding {
  onTap: () => void
  onLongPress: () => void
}

interface TactileState {
  startX: number
  startY: number
  timer: number | null
  isActive: boolean
  isLongPress: boolean
  listeners: {
    pointerdown: (e: PointerEvent) => void
    pointermove: (e: PointerEvent) => void
    pointerup: (e: PointerEvent) => void
    pointercancel: (e: PointerEvent) => void
    contextmenu: (e: Event) => void
  }
}

const stateMap = new WeakMap<HTMLElement, TactileState>()

export const vTactile: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding<TactileBinding>) {
    const state: TactileState = {
      startX: 0,
      startY: 0,
      timer: null,
      isActive: false,
      isLongPress: false,
      listeners: {} as any
    }

    const clearInteraction = () => {
      state.isActive = false
      if (state.timer) {
        clearTimeout(state.timer)
        state.timer = null
      }
    }

    state.listeners.pointerdown = (e: PointerEvent) => {
      if (e.button !== 0) return

      const target = e.target as HTMLElement
      // Ignore interactions on actionable children defined in components
      if (target.closest('.btn-action') || target.closest('a') || target.closest('.hit-target')) return

      state.isActive = true
      state.isLongPress = false
      state.startX = e.clientX
      state.startY = e.clientY

      if (state.timer) clearTimeout(state.timer)

      state.timer = window.setTimeout(() => {
        if (state.isActive) {
          state.isLongPress = true
          if (navigator.vibrate) navigator.vibrate(60)
          binding.value.onLongPress()
        }
      }, 500)
    }

    state.listeners.pointermove = (e: PointerEvent) => {
      if (!state.isActive) return

      const moveThreshold = 10
      const dx = Math.abs(e.clientX - state.startX)
      const dy = Math.abs(e.clientY - state.startY)

      if (dx > moveThreshold || dy > moveThreshold) {
        clearInteraction()
      }
    }

    state.listeners.pointerup = () => {
      if (state.isActive && !state.isLongPress) {
        if (navigator.vibrate) navigator.vibrate(10)
        binding.value.onTap()
      }
      clearInteraction()
    }

    state.listeners.pointercancel = () => {
      clearInteraction()
    }

    state.listeners.contextmenu = (e: Event) => {
      e.preventDefault()
    }

    el.addEventListener('pointerdown', state.listeners.pointerdown)
    el.addEventListener('pointermove', state.listeners.pointermove)
    el.addEventListener('pointerup', state.listeners.pointerup)
    el.addEventListener('pointercancel', state.listeners.pointercancel)
    el.addEventListener('contextmenu', state.listeners.contextmenu)

    stateMap.set(el, state)
  },

  unmounted(el: HTMLElement) {
    const state = stateMap.get(el)
    if (state) {
      el.removeEventListener('pointerdown', state.listeners.pointerdown)
      el.removeEventListener('pointermove', state.listeners.pointermove)
      el.removeEventListener('pointerup', state.listeners.pointerup)
      el.removeEventListener('pointercancel', state.listeners.pointercancel)
      el.removeEventListener('contextmenu', state.listeners.contextmenu)
      if (state.timer) clearTimeout(state.timer)
      stateMap.delete(el)
    }
  }
}
