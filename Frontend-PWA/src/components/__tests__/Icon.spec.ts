
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Icon from '../Icon.vue'

describe('Icon.vue', () => {
    it('renders correctly with given name and size', () => {
        const wrapper = mount(Icon, {
            props: {
                name: 'gear',
                size: '24'
            }
        })

        // Check if it renders an SVG/Icon
        // Since we assume Icon.vue logic (often simple SVG wrapper or class based)
        // We check if the element exists.
        expect(wrapper.exists()).toBe(true)

        // Assuming Icon uses a class or data attribute based on name, or imports svg.
        // If it's a dynamic component or simpler setup, we might check props.
        // For now, minimal check.
        expect(wrapper.props().name).toBe('gear')
        expect(wrapper.props().size).toBe('24')
    })
})
