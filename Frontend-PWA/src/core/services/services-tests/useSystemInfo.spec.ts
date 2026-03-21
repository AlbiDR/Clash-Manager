// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSystemInfo, appVersion } from "../useSystemInfo";
import { ref } from "vue";

// Deep imports to avoid side effects as per ADR Section II
const mockShowcaseMode = {
  isShowcaseMode: ref(false),
};
const mockBlueprintMode = {
  isBlueprintMode: ref(false),
};
const mockSyntheticMode = {
  isSyntheticMode: ref(false),
};

vi.mock("../useShowcaseMode", () => ({
  useShowcaseMode: () => mockShowcaseMode,
}));

vi.mock("../useBlueprintMode", () => ({
  useBlueprintMode: () => mockBlueprintMode,
}));

vi.mock("../useSyntheticMode", () => ({
  useSyntheticMode: () => mockSyntheticMode,
}));

describe("useSystemInfo", () => {
  beforeEach(() => {
    mockShowcaseMode.isShowcaseMode.value = false;
    mockBlueprintMode.isBlueprintMode.value = false;
    mockSyntheticMode.isSyntheticMode.value = false;
  });

  describe("appVersion", () => {
    it("should return the application version", () => {
      // In tests, __APP_VERSION__ is likely "0.0.0" or undefined unless set in vite config
      // Let's verify what it returns in the current environment
      expect(typeof appVersion).toBe("string");
    });
  });

  describe("activeBadge", () => {
    it("should return an empty string when no modes are active", () => {
      const { activeBadge } = useSystemInfo();
      expect(activeBadge.value).toBe("");
    });

    it("should return 'SHOWCASE' when showcase mode is active", () => {
      mockShowcaseMode.isShowcaseMode.value = true;
      const { activeBadge } = useSystemInfo();
      expect(activeBadge.value).toBe("SHOWCASE");
    });

    it("should return 'BLUEPRINT' when blueprint mode is active", () => {
      mockBlueprintMode.isBlueprintMode.value = true;
      const { activeBadge } = useSystemInfo();
      expect(activeBadge.value).toBe("BLUEPRINT");
    });

    it("should return 'SYNTHETIC' when synthetic mode is active", () => {
      mockSyntheticMode.isSyntheticMode.value = true;
      const { activeBadge } = useSystemInfo();
      expect(activeBadge.value).toBe("SYNTHETIC");
    });

    it("should respect priority: SHOWCASE > BLUEPRINT", () => {
      mockShowcaseMode.isShowcaseMode.value = true;
      mockBlueprintMode.isBlueprintMode.value = true;
      const { activeBadge } = useSystemInfo();
      expect(activeBadge.value).toBe("SHOWCASE");
    });

    it("should respect priority: BLUEPRINT > SYNTHETIC", () => {
      mockBlueprintMode.isBlueprintMode.value = true;
      mockSyntheticMode.isSyntheticMode.value = true;
      const { activeBadge } = useSystemInfo();
      expect(activeBadge.value).toBe("BLUEPRINT");
    });

    it("should respect priority: SHOWCASE > BLUEPRINT > SYNTHETIC", () => {
      mockShowcaseMode.isShowcaseMode.value = true;
      mockBlueprintMode.isBlueprintMode.value = true;
      mockSyntheticMode.isSyntheticMode.value = true;
      const { activeBadge } = useSystemInfo();
      expect(activeBadge.value).toBe("SHOWCASE");
    });
  });
});
