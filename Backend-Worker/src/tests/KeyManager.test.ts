import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyManager } from '../KeyManager.js';

describe('KeyManager', () => {
  const mockKeys = ['key1', 'key2', 'key3'];
  let manager: KeyManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new KeyManager(mockKeys);
  });

  it('should return a healthy key from the pool', () => {
    const key = manager.getHealthyKey();
    expect(mockKeys).toContain(key);
  });

  it('should rotate keys', () => {
    const usedKeys = new Set();
    for (let i = 0; i < 10; i++) {
      usedKeys.add(manager.getHealthyKey());
    }
    // With 3 keys, after 10 tries we should have seen all of them (probabilistically very likely)
    expect(usedKeys.size).toBe(3);
  });

  it('should handle 429 errors by cooling down for 60s', () => {
    const key = manager.getHealthyKey()!;
    manager.reportFailure(key, 429);

    // Key should not be available immediately
    const stats = manager.getPoolStats();
    expect(stats.available).toBe(2);
    expect(stats.throttled).toBe(1);

    // After 61s, it should be available again
    vi.advanceTimersByTime(61000);
    const statsAfter = manager.getPoolStats();
    expect(statsAfter.available).toBe(3);
    expect(statsAfter.throttled).toBe(0);
  });

  it('should handle 403 errors by cooling down for 1 hour', () => {
    const key = manager.getHealthyKey()!;
    manager.reportFailure(key, 403);

    const stats = manager.getPoolStats();
    expect(stats.available).toBe(2);

    vi.advanceTimersByTime(30 * 60 * 1000); // 30 mins
    expect(manager.getPoolStats().available).toBe(2);

    vi.advanceTimersByTime(31 * 60 * 1000); // +31 mins = 61 mins
    expect(manager.getPoolStats().available).toBe(3);
  });

  it('should handle generic failures with 30s penalty after 5 attempts', () => {
    const key = manager.getHealthyKey()!;

    // 4 failures should not trigger cooldown
    for (let i = 0; i < 4; i++) {
      manager.reportFailure(key, 500);
    }
    expect(manager.getPoolStats().available).toBe(3);

    // 5th failure triggers 30s cooldown
    manager.reportFailure(key, 500);
    expect(manager.getPoolStats().available).toBe(2);

    vi.advanceTimersByTime(31000);
    expect(manager.getPoolStats().available).toBe(3);
  });

  it('should reset failure count on success', () => {
    const key = manager.getHealthyKey()!;
    for (let i = 0; i < 4; i++) {
      manager.reportFailure(key, 500);
    }
    manager.reportSuccess(key);

    // Another failure should start count from 1, not 5
    manager.reportFailure(key, 500);
    expect(manager.getPoolStats().available).toBe(3);
  });

  it('should return null if no keys are healthy', () => {
    mockKeys.forEach(k => manager.reportFailure(k, 403));
    expect(manager.getHealthyKey()).toBeNull();
  });
});
