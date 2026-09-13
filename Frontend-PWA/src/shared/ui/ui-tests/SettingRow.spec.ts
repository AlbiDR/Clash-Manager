// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import SettingRow from '../SettingRow.vue';

describe('SettingRow.vue', () => {
  it('renders label and description props correctly', () => {
    const wrapper = shallowMount(SettingRow, {
      props: {
        label: 'Test Label',
        description: 'Test Description'
      }
    });

    expect(wrapper.find('.row-label').text()).toBe('Test Label');
    expect(wrapper.find('.row-desc').text()).toBe('Test Description');
  });

  it('renders slot content correctly and overrides props', () => {
    const wrapper = shallowMount(SettingRow, {
      props: {
        label: 'Prop Label',
        description: 'Prop Description'
      },
      slots: {
        label: 'Slot Label',
        description: 'Slot Description'
      }
    });

    expect(wrapper.find('.row-label').text()).toBe('Slot Label');
    expect(wrapper.find('.row-desc').text()).toBe('Slot Description');
  });

  it('applies active-row class when active prop is true', () => {
    const wrapper = shallowMount(SettingRow, {
      props: { active: true }
    });
    expect(wrapper.classes()).toContain('active-row');
    expect(wrapper.find('.switch').classes()).toContain('active');
  });

  it('applies mini class when mini prop is true', () => {
    const wrapper = shallowMount(SettingRow, {
      props: { mini: true }
    });
    expect(wrapper.classes()).toContain('mini');
  });

  it('applies disabled class and suppresses click when disabled prop is true', async () => {
    const wrapper = shallowMount(SettingRow, {
      props: { disabled: true }
    });
    expect(wrapper.classes()).toContain('disabled');

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('emits click event when clicked and not disabled', async () => {
    const wrapper = shallowMount(SettingRow, {
      props: { disabled: false }
    });

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  describe('accessibility contract', () => {
    // This row is the app's primary preference control, reached from six
    // screens. It was a bare clickable <div>: not focusable, not in the tab
    // order, no keyboard activation, and no state exposed under a switch that
    // is drawn purely in CSS. These assertions exist so it cannot regress to
    // that, since nothing else in the toolchain would notice.

    it('is a real button, so focus and Enter/Space come from the platform', () => {
      const wrapper = shallowMount(SettingRow, { props: { label: 'Dark mode' } });

      expect(wrapper.element.tagName).toBe('BUTTON');
      expect(wrapper.attributes('type')).toBe('button');
    });

    it('reports its state as a switch', () => {
      expect(
        shallowMount(SettingRow, { props: { active: true } }).attributes('aria-checked')
      ).toBe('true');
      expect(
        shallowMount(SettingRow, { props: { active: false } }).attributes('aria-checked')
      ).toBe('false');
      expect(
        shallowMount(SettingRow, { props: { active: true } }).attributes('role')
      ).toBe('switch');
    });

    it('takes its name from the label and its detail from the description', () => {
      const wrapper = shallowMount(SettingRow, {
        props: { label: 'Dark mode', description: 'Follows the system setting' },
      });

      expect(wrapper.attributes('aria-labelledby')).toBe(wrapper.find('.row-label').attributes('id'));
      expect(wrapper.attributes('aria-describedby')).toBe(wrapper.find('.row-desc').attributes('id'));
    });

    it('references no description region when there is no description', () => {
      const wrapper = shallowMount(SettingRow, { props: { label: 'Dark mode' } });

      expect(wrapper.attributes('aria-describedby')).toBeUndefined();
    });

    it('carries the native disabled attribute, which removes it from the tab order', () => {
      expect(
        shallowMount(SettingRow, { props: { disabled: true } }).attributes('disabled')
      ).toBeDefined();
    });

    it('hides the decorative switch from assistive technology', () => {
      // aria-checked on the root already carries the state; announcing the
      // painted track as well would report it twice.
      expect(
        shallowMount(SettingRow, { props: { active: true } }).find('.switch').attributes('aria-hidden')
      ).toBe('true');
    });
  });

  it('applies loading classes to the switch when loading prop is true', () => {
    const wrapper = shallowMount(SettingRow, {
      props: { loading: true }
    });
    const sw = wrapper.find('.switch');
    expect(sw.classes()).toContain('skeleton-anim');
    expect(sw.classes()).toContain('sk-badge-s');
  });
});
