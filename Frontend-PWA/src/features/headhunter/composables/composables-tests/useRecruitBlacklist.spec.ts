import { describe, it, expect, vi, beforeEach } from "vitest";

describe("useRecruitBlacklist", () => {
  let useRecruitBlacklist: any;

  beforeEach(async () => {
    // Reset module state between tests to handle singleton refs
    vi.resetModules();
    localStorage.clear();
    vi.clearAllMocks();

    // Dynamically import to ensure fresh singleton state
    const module = await import("../useRecruitBlacklist");
    useRecruitBlacklist = module.useRecruitBlacklist;
  });

  describe("Initialization", () => {
    it("should initialize with an empty set when localStorage is empty", () => {
      const { tombstones } = useRecruitBlacklist();
      expect(tombstones.value).toBeInstanceOf(Set);
      expect(tombstones.value.size).toBe(0);
    });

    it("should load existing tombstones from localStorage", async () => {
      const initialData = ["id1", "id2"];
      localStorage.setItem("cm_recruit_tombstones", JSON.stringify(initialData));

      // Need to re-import or re-call to trigger init logic if it's already initialized
      // Since we use resetModules, the next call to useRecruitBlacklist in this test
      // will be on a fresh module instance.
      const { tombstones } = useRecruitBlacklist();

      expect(tombstones.value.has("id1")).toBe(true);
      expect(tombstones.value.has("id2")).toBe(true);
      expect(tombstones.value.size).toBe(2);
    });

    it("should handle malformed JSON in localStorage gracefully", () => {
      localStorage.setItem("cm_recruit_tombstones", "invalid-json");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { tombstones } = useRecruitBlacklist();

      expect(tombstones.value.size).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        "[Blacklist] Failed to load recruit blacklist",
        expect.any(String)
      );
      warnSpy.mockRestore();
    });

    it("should handle non-array JSON in localStorage gracefully", () => {
      localStorage.setItem("cm_recruit_tombstones", JSON.stringify({ not: "an array" }));

      const { tombstones } = useRecruitBlacklist();

      expect(tombstones.value.size).toBe(0);
    });
  });

  describe("Functionality", () => {
    it("should add IDs to the blacklist via hide()", () => {
      const { tombstones, hide } = useRecruitBlacklist();
      hide(["new-id"]);

      expect(tombstones.value.has("new-id")).toBe(true);
      expect(localStorage.getItem("cm_recruit_tombstones")).toContain("new-id");
    });

    it("should remove IDs from the blacklist via restore()", () => {
      localStorage.setItem("cm_recruit_tombstones", JSON.stringify(["id1", "id2"]));
      const { tombstones, restore } = useRecruitBlacklist();

      restore(["id1"]);

      expect(tombstones.value.has("id1")).toBe(false);
      expect(tombstones.value.has("id2")).toBe(true);
      expect(localStorage.getItem("cm_recruit_tombstones")).not.toContain("id1");
    });
  });

  describe("Pruning (Garbage Collection)", () => {
    it("should not prune if the server returns an empty list", () => {
      localStorage.setItem("cm_recruit_tombstones", JSON.stringify(["id1"]));
      const { tombstones, prune } = useRecruitBlacklist();

      prune([]); // Empty server response

      expect(tombstones.value.has("id1")).toBe(true);
      expect(tombstones.value.size).toBe(1);
    });

    it("should remove IDs that are no longer in the server payload", () => {
      localStorage.setItem("cm_recruit_tombstones", JSON.stringify(["stale-id", "active-id"]));
      const { tombstones, prune } = useRecruitBlacklist();

      // Server only returns active-id and some-other-id
      prune(["active-id", "some-other-id"]);

      expect(tombstones.value.has("stale-id")).toBe(false);
      expect(tombstones.value.has("active-id")).toBe(true);
      expect(JSON.parse(localStorage.getItem("cm_recruit_tombstones")!)).toEqual(["active-id"]);
    });

    it("should keep IDs that are still in the server payload", () => {
      localStorage.setItem("cm_recruit_tombstones", JSON.stringify(["id1"]));
      const { tombstones, prune } = useRecruitBlacklist();

      prune(["id1", "id2"]);

      expect(tombstones.value.has("id1")).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should log an error if saving to localStorage fails", () => {
      const { hide } = useRecruitBlacklist();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Spy on the mocked localStorage from vitest.setup.ts
      const setItemSpy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw new Error("Quota exceeded");
      });

      hide(["any-id"]);

      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to save recruit blacklist",
        expect.any(Error)
      );

      errorSpy.mockRestore();
      setItemSpy.mockRestore();
    });
  });

  describe("Singleton Behavior", () => {
    it("should share state across multiple composable instances", () => {
      const instance1 = useRecruitBlacklist();
      const instance2 = useRecruitBlacklist();

      instance1.hide(["shared-id"]);

      expect(instance2.tombstones.value.has("shared-id")).toBe(true);
    });
  });
});
