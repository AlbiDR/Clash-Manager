/**
 * @vitest-environment jsdom
 */
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
    const history = '3000 24W01 | 1500 24W02 | 0 24W03'
    const wrapper = mount(WarHistoryChart, {
      props: { history }
    })
    const bars = wrapper.findAll('.bar')
    expect(bars).toHaveLength(4)
  })

  it('applies correct CSS classes based on fame thresholds and projection', () => {
    const history = '3000 24W01 | 1500 24W02 | 0 24W03'
    const wrapper = mount(WarHistoryChart, {
      props: { history }
    })
    const bars = wrapper.findAll('.bar')
    expect(bars[0].classes()).toContain('bar-miss')
    expect(bars[1].classes()).toContain('bar-hit')
    expect(bars[2].classes()).toContain('bar-win')
    expect(bars[3].classes()).toContain('bar-projected')
  })
})
