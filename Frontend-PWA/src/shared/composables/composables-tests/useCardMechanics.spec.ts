// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCardMechanics } from "../useCardMechanics";
import { useHaptics } from "../../../core/services/useHaptics";

vi.mock("../../../core/services/useHaptics", () => ({
  useHaptics: vi.fn(),
}));

describe("useCardMechanics", () => {
  const mockHaptics = {
    tap: vi.fn(),
  };

  const mockCallbacks = {
    onSelect: vi.fn(),
    onExpand: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useHaptics as any).mockReturnValue(mockHaptics);
  });

  describe("handleTap", () => {
    it("calls onSelect when selectionMode is true", () => {
      const props = { selectionMode: true };
      const { handleTap } = useCardMechanics(props, mockCallbacks);

      handleTap();
      expect(mockCallbacks.onSelect).toHaveBeenCalled();
      expect(mockCallbacks.onExpand).not.toHaveBeenCalled();
    });

    it("calls onExpand when selectionMode is false", () => {
      const props = { selectionMode: false };
      const { handleTap } = useCardMechanics(props, mockCallbacks);

      handleTap();
      expect(mockCallbacks.onExpand).toHaveBeenCalled();
      expect(mockCallbacks.onSelect).not.toHaveBeenCalled();
    });
  });

  describe("handleLongPress", () => {
    it("calls onSelect", () => {
      const props = { selectionMode: false };
      const { handleLongPress } = useCardMechanics(props, mockCallbacks);

      handleLongPress();
      expect(mockCallbacks.onSelect).toHaveBeenCalled();
    });
  });

  describe("handleScoreClick", () => {
    it("stops propagation, triggers haptics and calls onSelect", () => {
      const props = { selectionMode: false };
      const { handleScoreClick } = useCardMechanics(props, mockCallbacks);
      const mockEvent = {
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent;

      handleScoreClick(mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockHaptics.tap).toHaveBeenCalled();
      expect(mockCallbacks.onSelect).toHaveBeenCalled();
    });
  });

  describe("handleExpandClick", () => {
    it("stops propagation, triggers haptics and calls onExpand", () => {
      const props = { selectionMode: false };
      const { handleExpandClick } = useCardMechanics(props, mockCallbacks);
      const mockEvent = {
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent;

      handleExpandClick(mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockHaptics.tap).toHaveBeenCalled();
      expect(mockCallbacks.onExpand).toHaveBeenCalled();
    });
  });
});
