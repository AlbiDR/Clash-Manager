// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('useToast', () => {
  let useToast: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();

    if (typeof crypto === 'undefined') {
      (global as any).crypto = { randomUUID: () => Math.random().toString(36) };
    } else {
      vi.spyOn(crypto, 'randomUUID').mockImplementation(() => Math.random().toString(36) as any);
    }

    const module = await import('../useToast');
    useToast = module.useToast;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add a toast with success type', () => {
    const { add, toasts } = useToast();

    add({ type: 'success', message: 'Operation successful' });

    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0].type).toBe('success');
  });

  it('should add an error toast with longer duration', () => {
    const { error, toasts } = useToast();

    error('Something went wrong');

    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0].duration).toBe(8000);
  });

  it('should auto-remove toast after duration', () => {
    const { add, toasts } = useToast();

    add({ type: 'info', message: 'Hello', duration: 1000 });
    expect(toasts.value).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(toasts.value).toHaveLength(0);
  });

  it('should manually remove a toast', () => {
    const { add, remove, toasts } = useToast();

    const id = add({ type: 'info', message: 'Remove me' });
    expect(toasts.value).toHaveLength(1);

    remove(id);
    expect(toasts.value).toHaveLength(0);
  });

  it('should trigger action and remove toast immediately', () => {
    const onAction = vi.fn();
    const { undo, toasts, triggerAction } = useToast();

    const id = undo('Deleted', onAction);
    expect(toasts.value).toHaveLength(1);

    triggerAction(id);

    expect(onAction).toHaveBeenCalled();
    expect(toasts.value).toHaveLength(0);
  });

  it('should prevent multiple action triggers within 800ms', () => {
    const onAction = vi.fn();
    const { add, triggerAction } = useToast();

    const id = add({ type: 'undo', message: 'Wait', onAction });

    triggerAction(id);
    triggerAction(id);

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('should support multiple concurrent toasts', () => {
    const { success, error, toasts } = useToast();
    toasts.value = []; // Reset for this specific test if needed

    success('One');
    error('Two');

    expect(toasts.value).toHaveLength(2);
  });

  it('should handle persistent toasts with duration 0 without setting a timer', () => {
    const { add, toasts } = useToast();

    add({ type: 'info', message: 'Persistent', duration: 0 });

    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0].duration).toBe(0);

    vi.advanceTimersByTime(100000);
    expect(toasts.value).toHaveLength(1);
  });

  it('should safely execute triggerAction when toast has no onAction callback', () => {
    const { add, triggerAction, toasts } = useToast();

    const id = add({ type: 'info', message: 'No action' });
    expect(toasts.value).toHaveLength(1);

    expect(() => triggerAction(id)).not.toThrow();
    expect(toasts.value).toHaveLength(0);
  });

  it('should handle removing a non-existent toast gracefully', () => {
    const { remove, toasts } = useToast();

    toasts.value = [];
    expect(() => remove('non-existent-id')).not.toThrow();
    expect(toasts.value).toHaveLength(0);
  });

  it('should handle triggerAction on a non-existent toast gracefully', () => {
    const { triggerAction, toasts } = useToast();

    toasts.value = [];
    expect(() => triggerAction('non-existent-id')).not.toThrow();
    expect(toasts.value).toHaveLength(0);
  });

  it('should fallback to Date.now/Math.random when crypto.randomUUID is undefined', async () => {
    vi.stubGlobal('crypto', undefined);

    const module = await import('../useToast');
    const { add, toasts } = module.useToast();

    const id = add({ type: 'info', message: 'Fallback ID' });
    expect(toasts.value).toHaveLength(1);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should clear processing lock after 800ms allowing subsequent action trigger', () => {
    const onAction = vi.fn();
    const { add, triggerAction, toasts } = useToast();

    const id1 = add({ type: 'undo', message: 'Action 1', onAction });
    triggerAction(id1);
    expect(onAction).toHaveBeenCalledTimes(1);

    // Re-add toast with same ID to verify processingIds lock removal after 800ms
    toasts.value.push({
      id: id1,
      type: 'undo',
      message: 'Action 1 re-added',
      onAction,
    });

    // Before 800ms lock expires
    vi.advanceTimersByTime(400);
    triggerAction(id1);
    expect(onAction).toHaveBeenCalledTimes(1);

    // After 800ms lock expires
    vi.advanceTimersByTime(450);
    triggerAction(id1);
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it('should configure undo toast helper with default options', () => {
    const onAction = vi.fn();
    const { undo, toasts } = useToast();

    undo('Action done', onAction);

    expect(toasts.value).toHaveLength(1);
    const toast = toasts.value[0];
    expect(toast.type).toBe('undo');
    expect(toast.message).toBe('Action done');
    expect(toast.actionLabel).toBe('UNDO');
    expect(toast.duration).toBe(7000);
  });
});
