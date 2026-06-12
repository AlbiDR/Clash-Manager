// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useLaboratorySimulation } from '../useLaboratorySimulation';
import { useLaboratoryStore } from '../../stores/useLaboratoryStore';
import * as logic from '../../logic';

// Mock Pinia to control storeToRefs behavior
vi.mock('pinia', () => ({
  storeToRefs: vi.fn((store) => store),
}));

// Mock Store
vi.mock('../../stores/useLaboratoryStore', () => ({
  useLaboratoryStore: vi.fn(),
}));

// Mock Logic Layer
vi.mock('../../logic', () => ({
  calculateProgressionPath: vi.fn(),
  mapStateToResult: vi.fn(),
  ProfileHydrator: {
    createInitialState: vi.fn(),
  },
}));

describe('useLaboratorySimulation', () => {
  let store: any;

  beforeEach(() => {
    vi.useFakeTimers();

    // Setup mock store
    store = {
      observation: ref({ profile: { name: 'Test Player' } }),
      settings: ref({ strategy: 'Level Projection' }),
      setSimulating: vi.fn(),
      setOperation: vi.fn(),
    };
    vi.mocked(useLaboratoryStore).mockReturnValue(store);

    // Mock performance.now
    vi.spyOn(performance, 'now');

    // Mock requestIdleCallback
    vi.stubGlobal('requestIdleCallback', vi.fn((cb) => {
      return setTimeout(() => cb({ timeRemaining: () => 50, didTimeout: false }), 0);
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should not start simulation if observation is null', () => {
    store.observation.value = null;
    const { analyze } = useLaboratorySimulation();
    analyze();
    expect(store.setSimulating).not.toHaveBeenCalled();
  });

  it('should start simulation and set simulating state', () => {
    const mockInitialState = { totalXp: 100 };
    const mockGenerator = {
      next: vi.fn().mockReturnValue({ value: null, done: true }),
    };

    vi.mocked(logic.ProfileHydrator.createInitialState).mockReturnValue(mockInitialState as any);
    vi.mocked(logic.calculateProgressionPath).mockReturnValue(mockGenerator as any);

    const { analyze } = useLaboratorySimulation();
    analyze();

    expect(store.setSimulating).toHaveBeenCalledWith(true);
    expect(logic.ProfileHydrator.createInitialState).toHaveBeenCalledWith(store.observation.value);
    expect(logic.calculateProgressionPath).toHaveBeenCalled();
  });

  it('should process simulation in batches and use requestIdleCallback', () => {
    const mockInitialState = { totalXp: 100 };
    const mockStates = [
      { value: { totalXp: 110 }, done: false },
      { value: { totalXp: 120 }, done: true }
    ];

    let stateIndex = 0;
    const mockGenerator = {
      next: vi.fn(() => mockStates[stateIndex++]),
    };

    vi.mocked(logic.ProfileHydrator.createInitialState).mockReturnValue(mockInitialState as any);
    vi.mocked(logic.calculateProgressionPath).mockReturnValue(mockGenerator as any);
    vi.mocked(logic.mapStateToResult).mockImplementation((state: any) => ({ ...state, mapped: true }) as any);

    vi.mocked(performance.now)
      .mockReturnValueOnce(0)   // Batch 1: batchStartTime
      .mockReturnValueOnce(5)   // Batch 1: while check 1
      .mockReturnValueOnce(11)  // Batch 1: while check 2
      .mockReturnValueOnce(20)  // Batch 2: batchStartTime
      .mockReturnValueOnce(25);  // Batch 2: while check 1

    const { analyze } = useLaboratorySimulation();
    analyze();

    // Trigger initial requestIdleCallback
    vi.runOnlyPendingTimers();
    expect(mockGenerator.next).toHaveBeenCalledTimes(1);
    expect(store.setOperation).toHaveBeenCalled();

    // Trigger second requestIdleCallback
    vi.runOnlyPendingTimers();
    expect(mockGenerator.next).toHaveBeenCalledTimes(2);
    expect(store.setSimulating).toHaveBeenCalledWith(false);
  });

  it('should respect the 10ms batch budget', () => {
    const mockInitialState = { totalXp: 100 };
    const mockGenerator = {
      next: vi.fn().mockReturnValue({ value: {}, done: false }),
    };

    vi.mocked(logic.ProfileHydrator.createInitialState).mockReturnValue(mockInitialState as any);
    vi.mocked(logic.calculateProgressionPath).mockReturnValue(mockGenerator as any);

    vi.mocked(performance.now)
      .mockReturnValueOnce(0)   // batchStartTime
      .mockReturnValueOnce(4)   // while check 1
      .mockReturnValueOnce(8)   // while check 2
      .mockReturnValueOnce(12); // while check 3

    const { analyze } = useLaboratorySimulation();
    analyze();

    vi.runOnlyPendingTimers();

    expect(mockGenerator.next).toHaveBeenCalledTimes(2);
  });

  it('should fall back to setTimeout if requestIdleCallback is unavailable', () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const mockSetTimeout = vi.spyOn(window, 'setTimeout');

    const mockInitialState = { totalXp: 100 };
    const mockGenerator = {
      next: vi.fn().mockReturnValue({ value: null, done: false }),
    };

    vi.mocked(logic.ProfileHydrator.createInitialState).mockReturnValue(mockInitialState as any);
    vi.mocked(logic.calculateProgressionPath).mockReturnValue(mockGenerator as any);

    const { analyze } = useLaboratorySimulation();
    analyze();

    expect(mockSetTimeout).toHaveBeenCalled();
  });

  it('should cancel previous simulation if a new one starts', () => {
    const mockInitialState = { totalXp: 100 };

    const mockGenerator1 = {
      next: vi.fn().mockReturnValue({ value: { state: 1 }, done: false }),
    };
    const mockGenerator2 = {
      next: vi.fn().mockReturnValue({ value: { state: 2 }, done: true }),
    };

    vi.mocked(logic.ProfileHydrator.createInitialState).mockReturnValue(mockInitialState as any);
    vi.mocked(logic.calculateProgressionPath)
      .mockReturnValueOnce(mockGenerator1 as any)
      .mockReturnValueOnce(mockGenerator2 as any);

    const { analyze } = useLaboratorySimulation();

    analyze(); // SimulationId 1
    analyze(); // SimulationId 2

    // Run callback for Sim 1. It should return early.
    vi.runOnlyPendingTimers();

    expect(mockGenerator1.next).not.toHaveBeenCalled();
  });
});
