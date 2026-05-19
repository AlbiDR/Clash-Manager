// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("useRecruitBlacklist", () => {
  let useRecruitBlacklist: any;

  beforeEach(async () => {
    // Reset module state between tests to clear the singleton tombstone ref.
    vi.resetModules();
    vi.clearAllMocks();

    const module = await import("../useRecruitBlacklist");
    useRecruitBlacklist = module.useRecruitBlacklist;
  });

  describe("Initialization", () => {
    it("should initialize with an empty in-memory set", () => {
      const { tombstones } = useRecruitBlacklist();
      expect(tombstones.value).toBeInstanceOf(Set);
      expect(tombstones.value.size).toBe(0);
    });

    it("should NOT persist tombstones to localStorage", () => {
      const { hide } = useRecruitBlacklist();
      hide(["test-id"]);
      // Tombstones are ephemeral — they must not appear in persistent storage.
      expect(localStorage.getItem("cm_recruit_tombstones")).toBeNull();
    });
  });

  describe("hide()", () => {
    it("should add IDs to the in-memory tombstone set", () => {
      const { tombstones, hide } = useRecruitBlacklist();
      hide(["recruit-1", "recruit-2"]);
      expect(tombstones.value.has("recruit-1")).toBe(true);
      expect(tombstones.value.has("recruit-2")).toBe(true);
    });

    it("should be idempotent for duplicate IDs", () => {
      const { tombstones, hide } = useRecruitBlacklist();
      hide(["recruit-1"]);
      hide(["recruit-1"]);
      expect(tombstones.value.size).toBe(1);
    });

    it("should be a no-op for an empty array", () => {
      const { tombstones, hide } = useRecruitBlacklist();
      hide([]);
      expect(tombstones.value.size).toBe(0);
    });
  });

  describe("restore()", () => {
    it("should remove IDs from the tombstone set", () => {
      const { tombstones, hide, restore } = useRecruitBlacklist();
      hide(["recruit-1", "recruit-2"]);
      restore(["recruit-1"]);
      expect(tombstones.value.has("recruit-1")).toBe(false);
      expect(tombstones.value.has("recruit-2")).toBe(true);
    });

    it("should be a no-op for IDs not in the set", () => {
      const { tombstones, restore } = useRecruitBlacklist();
      restore(["non-existent"]);
      expect(tombstones.value.size).toBe(0);
    });

    it("should be a no-op for an empty array", () => {
      const { tombstones, hide, restore } = useRecruitBlacklist();
      hide(["recruit-1"]);
      restore([]);
      expect(tombstones.value.size).toBe(1);
    });
  });

  describe("Singleton Behavior", () => {
    it("should share state across multiple composable instances", () => {
      const instance1 = useRecruitBlacklist();
      const instance2 = useRecruitBlacklist();

      instance1.hide(["shared-id"]);

      expect(instance2.tombstones.value.has("shared-id")).toBe(true);
    });

    it("should reflect restore() across all instances", () => {
      const instance1 = useRecruitBlacklist();
      const instance2 = useRecruitBlacklist();

      instance1.hide(["shared-id"]);
      instance2.restore(["shared-id"]);

      expect(instance1.tombstones.value.has("shared-id")).toBe(false);
    });
  });
});
