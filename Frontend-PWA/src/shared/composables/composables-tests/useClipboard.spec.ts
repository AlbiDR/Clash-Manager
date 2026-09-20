// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIPBOARD_FEEDBACK_DURATION_MS, useClipboard } from "../useClipboard";

describe("useClipboard", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("copies explicit text and exposes a copied state", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { clipboardState, copyText } = useClipboard();

    await expect(copyText("Readable sync details")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("Readable sync details");
    expect(clipboardState.value).toBe("copied");

    vi.advanceTimersByTime(CLIPBOARD_FEEDBACK_DURATION_MS);
    expect(clipboardState.value).toBe("idle");
  });

  it("does not throw when clipboard access is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const { clipboardState, copyText } = useClipboard();

    await expect(copyText("Readable sync details")).resolves.toBe(false);
    expect(clipboardState.value).toBe("unavailable");
  });
});
