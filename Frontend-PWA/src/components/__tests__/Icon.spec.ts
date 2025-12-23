/**
 * @vitest-environment jsdom
 */
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
        expect(wrapper.exists()).toBe(true)
        const props = wrapper.props() as any
        expect(props.name).toBe('gear')
        expect(props.size).toBe('24')
    })
})
