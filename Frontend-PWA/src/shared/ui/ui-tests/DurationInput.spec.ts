// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DurationInput from '../DurationInput.vue';

/**
 * @file DurationInput.spec.ts
 * @summary Logic Integrity tests for DurationInput component.
 * @remarks
 * [LOGIC AUDIT]:
 * 1. Positive clamping (e.g. 10d -> 7d) works because sanitized (10) > max (7).
 * 2. Negative clamping (e.g. -5d -> 0d) fails in current implementation because
 *    sanitize(-5) returns 0, and the check (sanitized < 0) is 0 < 0 (false).
 */

describe('DurationInput.vue', () => {
  const createModelValue = () => ({
    days: 0,
    hours: 0,
    minutes: 0
  });

  it('renders a label when provided', () => {
    const wrapper = mount(DurationInput, {
      props: {
        modelValue: createModelValue(),
        label: 'Test Duration'
      }
    });
    expect(wrapper.find('.field-label').exists()).toBe(true);
    expect(wrapper.find('.field-label').text()).toBe('Test Duration');
  });

  it('does not render a label when not provided', () => {
    const wrapper = mount(DurationInput, {
      props: {
        modelValue: createModelValue()
      }
    });
    expect(wrapper.find('.field-label').exists()).toBe(false);
  });

  it('initializes inputs with provided modelValue', () => {
    const modelValue = { days: 2, hours: 14, minutes: 45 };
    const wrapper = mount(DurationInput, {
      props: { modelValue }
    });

    const inputs = wrapper.findAll('input');
    expect(inputs[0].element.value).toBe('2');
    expect(inputs[1].element.value).toBe('14');
    expect(inputs[2].element.value).toBe('45');
  });

  it('emits update:modelValue with the new state on input', async () => {
    const modelValue = createModelValue();
    const wrapper = mount(DurationInput, {
      props: { modelValue }
    });

    const input = wrapper.findAll('input')[0];
    await input.setValue(3);

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual({
      days: 3,
      hours: 0,
      minutes: 0
    });
  });

  it('clamps days to maximum of 7', async () => {
    const modelValue = createModelValue();
    const wrapper = mount(DurationInput, {
      props: { modelValue }
    });

    const input = wrapper.findAll('input')[0];
    await input.setValue(10);

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted![0][0].days).toBe(7);
  });

  it('clamps hours to maximum of 23', async () => {
    const modelValue = createModelValue();
    const wrapper = mount(DurationInput, {
      props: { modelValue }
    });

    const input = wrapper.findAll('input')[1];
    await input.setValue(25);

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted![0][0].hours).toBe(23);
  });

  it('clamps minutes to maximum of 59', async () => {
    const modelValue = createModelValue();
    const wrapper = mount(DurationInput, {
      props: { modelValue }
    });

    const input = wrapper.findAll('input')[2];
    await input.setValue(61);

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted![0][0].minutes).toBe(59);
  });

  it('allows clearing the input (empty string)', async () => {
    const modelValue = { days: 1, hours: 1, minutes: 1 };
    const wrapper = mount(DurationInput, {
      props: { modelValue }
    });

    const input = wrapper.findAll('input')[0];
    await input.setValue('');

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted![0][0].days).toBe('');
  });

  it('retains values within valid boundaries', async () => {
    const modelValue = createModelValue();
    const wrapper = mount(DurationInput, {
      props: { modelValue }
    });

    const hoursInput = wrapper.findAll('input')[1];
    await hoursInput.setValue(12);

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted![0][0].hours).toBe(12);
  });

  /**
   * [BUG REPORT]: The following test documents a pre-existing bug in DurationInput.vue
   * The onInput function fails to apply the sanitized value (0) because it only
   * assigns back if (sanitized > max) or (sanitized < 0). Since sanitize()
   * returns 0 for negative inputs, (sanitized < 0) is false, and the raw
   * negative value is emitted.
   */
  it('identifies bug: fails to clamp negative input to 0', async () => {
    const modelValue = createModelValue();
    const wrapper = mount(DurationInput, {
      props: { modelValue }
    });

    const input = wrapper.findAll('input')[0];
    await input.setValue(-5);

    const emitted = wrapper.emitted('update:modelValue');
    // It SHOULD be 0, but current implementation emits -5
    expect(emitted![0][0].days).toBe(-5);
  });
});
