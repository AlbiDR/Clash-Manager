import { describe, it, expect, vi } from "vitest";
import { useCardMechanics } from "../useCardMechanics";

vi.mock("../useHaptics", () => ({
  useHaptics: () => ({
    tap: vi.fn(),
  }),
}));

describe("useCardMechanics", () => {
  const mockCallbacks = {
    onSelect: vi.fn(),
    onExpand: vi.fn(),
  };

  it("handleTap triggers onExpand when selectionMode is false", () => {
    const props = { selectionMode: false };
    const { handleTap } = useCardMechanics(props, mockCallbacks);
    handleTap();
    expect(mockCallbacks.onExpand).toHaveBeenCalled();
  });

  it("handleTap triggers onSelect when selectionMode is true", () => {
    const props = { selectionMode: true };
    const { handleTap } = useCardMechanics(props, mockCallbacks);
    handleTap();
    expect(mockCallbacks.onSelect).toHaveBeenCalled();
  });

  it("handleLongPress triggers onSelect", () => {
    const props = { selectionMode: false };
    const { handleLongPress } = useCardMechanics(props, mockCallbacks);
    handleLongPress();
    expect(mockCallbacks.onSelect).toHaveBeenCalled();
  });

  it("handleScoreClick stops propagation, and triggers onSelect", () => {
    const props = { selectionMode: false };
    const { handleScoreClick } = useCardMechanics(props, mockCallbacks);
    const mockEvent = { stopPropagation: vi.fn() } as any;
    handleScoreClick(mockEvent);
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(mockCallbacks.onSelect).toHaveBeenCalled();
  });

  it("handleExpandClick stops propagation, and triggers onExpand", () => {
    const props = { selectionMode: false };
    const { handleExpandClick } = useCardMechanics(props, mockCallbacks);
    const mockEvent = { stopPropagation: vi.fn() } as any;
    handleExpandClick(mockEvent);
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(mockCallbacks.onExpand).toHaveBeenCalled();
  });
});
