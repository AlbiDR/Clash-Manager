
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WarHistoryChart from '../WarHistoryChart.vue'

describe('WarHistoryChart', () => {
  it('renders nothing when history is empty or dash', () => {
    const wrapper = mount(WarHistoryChart, {
      props: { history: '-' }
    })
    expect(wrapper.find('.war-chart').exists()).toBe(false)
    expect(wrapper.find('.war-chart-empty').exists()).toBe(true)
  })

  it('renders correct number of bars including projection', () => {
    // "FAME WEEK | FAME WEEK"
    // Component logic adds a projection bar if history exists.
    // 3 history items -> 4 bars total
    
    const history = '3000 24W01 | 1500 24W02 | 0 24W03'
    const wrapper = mount(WarHistoryChart, {
      props: { history }
    })

    const bars = wrapper.findAll('.bar')
    expect(bars).toHaveLength(4)
  })

  it('applies correct CSS classes based on fame thresholds and projection', () => {
    // Input: "3000(W1) | 1500(W2) | 0(W3)"
    // Reversed (Oldest->Newest): [0, 1500, 3000] + [Projection]
    
    const history = '3000 24W01 | 1500 24W02 | 0 24W03'
    const wrapper = mount(WarHistoryChart, {
      props: { history }
    })

    const bars = wrapper.findAll('.bar')
    
    // Bar 0: 0 (Miss)
    expect(bars[0].classes()).toContain('bar-miss')
    
    // Bar 1: 1500 (Hit)
    expect(bars[1].classes()).toContain('bar-hit')
    
    // Bar 2: 3000 (Win)
    expect(bars[2].classes()).toContain('bar-win')

    // Bar 3: Projection
    expect(bars[3].classes()).toContain('bar-projected')
  })
})
