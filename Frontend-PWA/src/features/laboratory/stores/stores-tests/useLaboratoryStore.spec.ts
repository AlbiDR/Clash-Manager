// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import {
  useLaboratoryStore,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_INVENTORY,
  STORAGE_KEY_OBSERVATION
} from "../useLaboratoryStore";
import type { PlayerData, Inventory } from "../../logic/Types";
import { asGold, asGems } from "@core/utils/economy";

const MALFORMED_SETTINGS_JSON = "invalid-json";
const INVALID_STRATEGY_SETTINGS = { strategy: "NonExistentStrategy" };
const INVALID_INVENTORY_TYPES = { gold: "ten thousand", wildCards: { "GhostRarity": 10 } };

describe("useLaboratoryStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("should initialize with default state", () => {
    const store = useLaboratoryStore();
    expect(store.observation).toBeNull();
    expect(store.operation).toBeNull();
    expect(store.isSimulating).toBe(false);
    expect(store.isFetching).toBe(false);
    expect(store.fetchError).toBeNull();
    expect(store.settings).toEqual({
      strategy: "Level Projection",
      allowGemSpending: false,
      infiniteResources: false,
      targetLevel: undefined
    });
  });

  describe("Migration Logic", () => {
    it("should migrate legacy 'Target' strategy to 'Level Projection'", () => {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({ strategy: "Target" }));
      const store = useLaboratoryStore();
      expect(store.settings.strategy).toBe("Level Projection");
    });

    it("should migrate legacy 'Maximize' strategy to 'Resource Efficiency'", () => {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({ strategy: "Maximize" }));
      const store = useLaboratoryStore();
      expect(store.settings.strategy).toBe("Resource Efficiency");
    });

    it("should handle malformed JSON in localStorage during initialization (getStoredSettings)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY_SETTINGS, MALFORMED_SETTINGS_JSON);

      const store = useLaboratoryStore();

      expect(store.settings.strategy).toBe("Level Projection"); // Default
      expect(warnSpy).toHaveBeenCalledWith("[LaboratoryStore] Failed to parse stored settings");
      warnSpy.mockRestore();
    });

    it("should handle valid JSON that fails schema validation (getStoredSettings)", () => {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(INVALID_STRATEGY_SETTINGS));

      const store = useLaboratoryStore();

      expect(store.settings.strategy).toBe("Level Projection"); // Default
    });
  });

  describe("Observation Management", () => {
    const mockData: PlayerData = {
      name: "Test Player",
      tag: "#ABC",
      level: 15,
      inventory: { gold: asGold(1000), gems: asGems(100), cards: [], wildCards: {} }
    } as unknown as PlayerData;

    it("should set and persist observation", () => {
      const store = useLaboratoryStore();
      store.setObservation(mockData);

      expect(store.observation).toEqual(mockData);
      expect(localStorage.getItem(STORAGE_KEY_OBSERVATION)).toBe(JSON.stringify(mockData));
    });

    it("should clear observation and remove from localStorage", () => {
      const store = useLaboratoryStore();
      store.setObservation(mockData);
      store.setObservation(null);

      expect(store.observation).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_OBSERVATION)).toBeNull();
    });
  });

  describe("Settings Management", () => {
    it("should update and persist settings", () => {
      const store = useLaboratoryStore();
      store.setSettings({ allowGemSpending: true });

      expect(store.settings.allowGemSpending).toBe(true);
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS)!);
      expect(persisted.allowGemSpending).toBe(true);
    });

    it("should auto-toggle infiniteResources to true when strategy is Level Projection", () => {
      const store = useLaboratoryStore();
      // Initially false
      store.setSettings({ strategy: "Resource Efficiency", infiniteResources: false });
      expect(store.settings.infiniteResources).toBe(false);

      store.setSettings({ strategy: "Level Projection" });
      expect(store.settings.infiniteResources).toBe(true);
    });

    it("should auto-toggle infiniteResources to false when strategy is Resource Efficiency", () => {
      const store = useLaboratoryStore();
      store.setSettings({ strategy: "Level Projection" });
      expect(store.settings.infiniteResources).toBe(true);

      store.setSettings({ strategy: "Resource Efficiency" });
      expect(store.settings.infiniteResources).toBe(false);
    });
  });

  describe("Inventory Management", () => {
    const mockProfile: PlayerData = {
      inventory: {
        gold: asGold(1000),
        gems: asGems(100),
        cards: [],
        wildCards: { Common: 10 }
      }
    } as unknown as PlayerData;

    describe("loadPersistedInventory", () => {
      it("should return profile inventory if no local storage exists", () => {
        const store = useLaboratoryStore();
        const inventory = store.loadPersistedInventory(mockProfile);
        expect(inventory).toEqual(mockProfile.inventory);
      });

      it("should merge persisted inventory with profile data", () => {
        const persisted = { gold: 5000, wildCards: { Rare: 5 } };
        localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(persisted));

        const store = useLaboratoryStore();
        const inventory = store.loadPersistedInventory(mockProfile);

        expect(inventory.gold).toBe(5000);
        expect(inventory.gems).toBe(100); // From profile
        expect(inventory.wildCards).toEqual({ Common: 10, Rare: 5 });
      });

      it("should handle malformed JSON in localStorage gracefully", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        localStorage.setItem(STORAGE_KEY_INVENTORY, "invalid-json");

        const store = useLaboratoryStore();
        const inventory = store.loadPersistedInventory(mockProfile);

        expect(inventory).toEqual(mockProfile.inventory);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });

      it("should handle valid JSON that fails schema validation (loadPersistedInventory)", () => {
        localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(INVALID_INVENTORY_TYPES));

        const store = useLaboratoryStore();
        const inventory = store.loadPersistedInventory(mockProfile);

        expect(inventory).toEqual(mockProfile.inventory);
      });
    });

    describe("updateInventory", () => {
      it("should update observation inventory and persist to localStorage", () => {
        const store = useLaboratoryStore();
        store.setObservation(mockProfile);

        store.updateInventory({ gold: asGold(2000), gems: asGems(200) });

        expect(store.observation?.inventory.gold).toBe(2000);
        expect(store.observation?.inventory.gems).toBe(200);

        const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY_INVENTORY)!);
        expect(persisted.gold).toBe(2000);
        expect(persisted.gems).toBe(200);
      });

      it("should do nothing if observation is null", () => {
        const store = useLaboratoryStore();
        store.updateInventory({ gold: asGold(2000) });
        expect(localStorage.getItem(STORAGE_KEY_INVENTORY)).toBeNull();
      });
    });
  });

  describe("Operational State Actions", () => {
    it("should set operation", () => {
      const store = useLaboratoryStore();
      const mockResult = { score: 100 } as any;
      store.setOperation(mockResult);
      expect(store.operation).toEqual(mockResult);
    });

    it("should set simulating state", () => {
      const store = useLaboratoryStore();
      store.setSimulating(true);
      expect(store.isSimulating).toBe(true);
    });

    it("should set fetching state", () => {
      const store = useLaboratoryStore();
      store.setFetching(true);
      expect(store.isFetching).toBe(true);
    });

    it("should set fetch error", () => {
      const store = useLaboratoryStore();
      store.setFetchError("Error message");
      expect(store.fetchError).toBe("Error message");
    });
  });
});
