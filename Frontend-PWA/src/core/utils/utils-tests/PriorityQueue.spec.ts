// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect } from 'vitest';
import { PriorityQueue } from '../PriorityQueue';

describe('PriorityQueue', () => {
  it('should maintain min-heap property (lowest score at top)', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    const inputs = [10, 5, 20, 1, 15];
    inputs.forEach(n => pq.push(n));

    const outputs: number[] = [];
    while (pq.size() > 0) {
      outputs.push(pq.pop()!);
    }

    expect(outputs).toEqual([1, 5, 10, 15, 20]);
  });

  it('should maintain max-heap property with different comparator', () => {
    const pq = new PriorityQueue<number>((a, b) => b - a);
    const inputs = [10, 5, 20, 1, 15];
    inputs.forEach(n => pq.push(n));

    const outputs: number[] = [];
    while (pq.size() > 0) {
      outputs.push(pq.pop()!);
    }

    expect(outputs).toEqual([20, 15, 10, 5, 1]);
  });

  it('should handle large amounts of churn correctly', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    for (let i = 0; i < 100; i++) {
      pq.push(Math.random());
    }

    let last = -Infinity;
    while (pq.size() > 0) {
      const current = pq.pop()!;
      expect(current).toBeGreaterThanOrEqual(last);
      last = current;
    }
  });

  it('should handle empty pops safely', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    expect(pq.pop()).toBeUndefined();
    expect(pq.peek()).toBeUndefined();
    expect(pq.size()).toBe(0);
  });

  it('should handle single item correctly', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(42);
    expect(pq.size()).toBe(1);
    expect(pq.peek()).toBe(42);
    expect(pq.pop()).toBe(42);
    expect(pq.size()).toBe(0);
  });

  it('should handle duplicate priorities correctly', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(10);
    pq.push(5);
    pq.push(10);
    pq.push(5);

    expect(pq.pop()).toBe(5);
    expect(pq.pop()).toBe(5);
    expect(pq.pop()).toBe(10);
    expect(pq.pop()).toBe(10);
  });

  it('should work with complex objects', () => {
    interface Item { id: string; priority: number }
    const pq = new PriorityQueue<Item>((a, b) => a.priority - b.priority);

    pq.push({ id: 'A', priority: 10 });
    pq.push({ id: 'B', priority: 5 });
    pq.push({ id: 'C', priority: 15 });

    expect(pq.pop()?.id).toBe('B');
    expect(pq.pop()?.id).toBe('A');
    expect(pq.pop()?.id).toBe('C');
  });
});
