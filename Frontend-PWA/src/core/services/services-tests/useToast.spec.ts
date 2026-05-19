// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';

const mockHaptics = {
  success: vi.fn(),
  error: vi.fn(),
  tap: vi.fn()
};

vi.mock("../useHaptics", () => ({
  useHaptics: () => mockHaptics
}));

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

  it('should add a toast with success type and trigger haptics', () => {
    const { add, toasts } = useToast();

    add({ type: 'success', message: 'Operation successful' });

    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0].type).toBe('success');
    expect(mockHaptics.success).toHaveBeenCalled();
  });

  it('should add an error toast with longer duration and error haptics', () => {
    const { error, toasts } = useToast();

    error('Something went wrong');

    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0].duration).toBe(8000);
    expect(mockHaptics.error).toHaveBeenCalled();
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
});
