// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import StatisticItem from '../StatisticItem.vue';
import { useBenchmarking } from '@core/services/useBenchmarking';

// Mock useBenchmarking
const mockGetSafeBenchmark = vi.fn((type, metric, value) => {
  if (!type || !metric || value === undefined) return null;
  return {
    label: 'Mock Benchmark',
    tier: 'ELITE',
    value,
    avg: 5000,
    min: 0,
    max: 10000,
    percent: 0,
    isBetter: true
  };
});

vi.mock('@core/services/useBenchmarking', () => ({
  useBenchmarking: vi.fn(() => ({
    getSafeBenchmark: mockGetSafeBenchmark
  }))
}));

describe('StatisticItem.vue', () => {
  const defaultProps = {
    label: 'Trophies',
    value: '5,000'
  };

  const tooltipDirective = {
    mounted: vi.fn(),
    updated: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders label and value correctly when not loading', () => {
    const wrapper = mount(StatisticItem, {
      props: defaultProps,
      global: {
        directives: {
          tooltip: tooltipDirective
        }
      }
    });

    expect(wrapper.find('.label').text()).toBe('Trophies');
    expect(wrapper.find('.value').text()).toBe('5,000');
    expect(wrapper.find('.stat-item.skeleton-anim').exists()).toBe(false);
  });

  it('renders skeleton loader when loading prop is true', () => {
    const wrapper = mount(StatisticItem, {
      props: {
        ...defaultProps,
        loading: true
      },
      global: {
        directives: {
          tooltip: tooltipDirective
        }
      }
    });

    expect(wrapper.find('.stat-item.skeleton-anim').exists()).toBe(true);
    expect(wrapper.find('.sk-label-box').exists()).toBe(true);
    expect(wrapper.find('.sk-value-box').exists()).toBe(true);
    expect(wrapper.find('.label').exists()).toBe(false);
    expect(wrapper.find('.value').exists()).toBe(false);
  });

  it('calls getSafeBenchmark when all benchmark props are provided', () => {
    mount(StatisticItem, {
      props: {
        ...defaultProps,
        benchmarkType: 'lb',
        benchmarkMetric: 'trophies',
        benchmarkRawValue: 5000
      },
      global: {
        directives: {
          tooltip: tooltipDirective
        }
      }
    });

    expect(mockGetSafeBenchmark).toHaveBeenCalledWith('lb', 'trophies', 5000);
  });

  it('does not call getSafeBenchmark when loading is true', () => {
    mount(StatisticItem, {
      props: {
        ...defaultProps,
        loading: true,
        benchmarkType: 'lb',
        benchmarkMetric: 'trophies',
        benchmarkRawValue: 5000
      },
      global: {
        directives: {
          tooltip: tooltipDirective
        }
      }
    });

    expect(mockGetSafeBenchmark).not.toHaveBeenCalled();
  });

  it('does not call getSafeBenchmark when benchmarkType is missing', () => {
    mount(StatisticItem, {
      props: {
        ...defaultProps,
        benchmarkMetric: 'trophies',
        benchmarkRawValue: 5000
      },
      global: {
        directives: {
          tooltip: tooltipDirective
        }
      }
    });

    expect(mockGetSafeBenchmark).not.toHaveBeenCalled();
  });

  it('does not call getSafeBenchmark when benchmarkMetric is missing', () => {
    mount(StatisticItem, {
      props: {
        ...defaultProps,
        benchmarkType: 'lb',
        benchmarkRawValue: 5000
      },
      global: {
        directives: {
          tooltip: tooltipDirective
        }
      }
    });

    expect(mockGetSafeBenchmark).not.toHaveBeenCalled();
  });

  it('passes the benchmark data to the tooltip directive', () => {
    mount(StatisticItem, {
      props: {
        ...defaultProps,
        benchmarkType: 'lb',
        benchmarkMetric: 'trophies',
        benchmarkRawValue: 5000
      },
      global: {
        directives: {
          tooltip: tooltipDirective
        }
      }
    });

    expect(tooltipDirective.mounted).toHaveBeenCalled();
    const callArgs = tooltipDirective.mounted.mock.calls[0];
    // binding is the second argument
    expect(callArgs[1].value).toEqual({
      label: 'Mock Benchmark',
      tier: 'ELITE',
      value: 5000,
      avg: 5000,
      min: 0,
      max: 10000,
      percent: 0,
      isBetter: true
    });
  });

  it('passes null to tooltip directive when benchmarking is disabled or data is missing', () => {
    mount(StatisticItem, {
      props: defaultProps,
      global: {
        directives: {
          tooltip: tooltipDirective
        }
      }
    });

    expect(tooltipDirective.mounted).toHaveBeenCalled();
    const callArgs = tooltipDirective.mounted.mock.calls[0];
    expect(callArgs[1].value).toBeNull();
  });
});
