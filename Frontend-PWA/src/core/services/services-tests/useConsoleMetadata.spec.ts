// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useConsoleMetadata } from "../useConsoleMetadata";
import { useConnectivityManager } from "../useConnectivityManager";
import { useShowcaseMode } from "../useShowcaseMode";
import { useBlueprintMode } from "../useBlueprintMode";
import { DEFAULT_MOCK_MEMBER_COUNT, DEFAULT_MOCK_RECRUIT_COUNT } from "../../utils/mockData";
import { ref } from "vue";

// Mock Layer 1 dependencies via deep imports per ADR Section II
vi.mock("../useConnectivityManager", () => ({
  useConnectivityManager: vi.fn()
}));

vi.mock("../useShowcaseMode", () => ({
  useShowcaseMode: vi.fn()
}));

vi.mock("../useBlueprintMode", () => ({
  useBlueprintMode: vi.fn()
}));

describe("useConsoleMetadata", () => {
  const mockHubHealth = ref({
    type: "success",
    label: "NOMINAL",
    confidence: 100
  });

  const mockMetadata = ref({
    source: "SUPABASE",
    isStale: false
  });

  const mockIsShowcase = ref(false);
  const mockIsBlueprint = ref(false);

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useConnectivityManager).mockReturnValue({
      hubHealth: mockHubHealth,
      metadata: mockMetadata
    } as any);

    vi.mocked(useShowcaseMode).mockReturnValue({
      isShowcaseMode: mockIsShowcase
    } as any);

    vi.mocked(useBlueprintMode).mockReturnValue({
      isBlueprintMode: mockIsBlueprint
    } as any);

    mockHubHealth.value = { type: "success", label: "NOMINAL", confidence: 100 };
    mockIsShowcase.value = false;
    mockIsBlueprint.value = false;
  });

  describe("status", () => {
    it("correctly maps success hubHealth", () => {
      mockHubHealth.value = { type: "success", label: "DB", confidence: 100 };
      const { status } = useConsoleMetadata("Member", ref(0));

      expect(status.value).toEqual({
        type: "success",
        text: "DB",
        nominal: true
      });
    });

    it("correctly maps warning hubHealth", () => {
      mockHubHealth.value = { type: "warning", label: "STALE", confidence: 40 };
      const { status } = useConsoleMetadata("Member", ref(0));

      expect(status.value).toEqual({
        type: "warning",
        text: "STALE",
        nominal: false
      });
    });

    it("correctly maps error hubHealth", () => {
      mockHubHealth.value = { type: "error", label: "OFFLINE", confidence: 0 };
      const { status } = useConsoleMetadata("Member", ref(0));

      expect(status.value).toEqual({
        type: "error",
        text: "OFFLINE",
        nominal: false
      });
    });
  });

  describe("statsBadge", () => {
    describe("Normal Mode", () => {
      it("returns dataCount and singular label when count is 1", () => {
        const dataCount = ref(1);
        const { statsBadge } = useConsoleMetadata("Member", dataCount);

        expect(statsBadge.value).toEqual({
          label: "Member",
          value: "1"
        });
      });

      it("returns dataCount and pluralized label when count is not 1", () => {
        const dataCount = ref(42);
        const { statsBadge } = useConsoleMetadata("Member", dataCount);

        expect(statsBadge.value).toEqual({
          label: "Members",
          value: "42"
        });
      });

      it("updates when dataCount changes", () => {
        const dataCount = ref(5);
        const { statsBadge } = useConsoleMetadata("Member", dataCount);

        expect(statsBadge.value.value).toBe("5");
        dataCount.value = 10;
        expect(statsBadge.value.value).toBe("10");
      });
    });

    describe("Showcase Mode", () => {
      it("returns a random number between 1 and 50", () => {
        mockIsShowcase.value = true;
        const { statsBadge } = useConsoleMetadata("Member", ref(100));

        const value = parseInt(statsBadge.value.value);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(50);
      });
    });

    describe("Blueprint Mode", () => {
      beforeEach(() => {
        mockIsBlueprint.value = true;
      });

      it("returns DEFAULT_MOCK_RECRUIT_COUNT for Recruit label", () => {
        const { statsBadge } = useConsoleMetadata("Recruit", ref(0));

        expect(statsBadge.value).toEqual({
          label: "Recruits",
          value: DEFAULT_MOCK_RECRUIT_COUNT.toString()
        });
      });

      it("returns DEFAULT_MOCK_MEMBER_COUNT for Member label", () => {
        const { statsBadge } = useConsoleMetadata("Member", ref(0));

        expect(statsBadge.value).toEqual({
          label: "Members",
          value: DEFAULT_MOCK_MEMBER_COUNT.toString()
        });
      });
    });
  });

  it("returns metadata and hubHealth from connectivity manager", () => {
    const { metadata, hubHealth } = useConsoleMetadata("Member", ref(0));
    expect(metadata.value).toBe(mockMetadata.value);
    expect(hubHealth.value).toBe(mockHubHealth.value);
  });
});
