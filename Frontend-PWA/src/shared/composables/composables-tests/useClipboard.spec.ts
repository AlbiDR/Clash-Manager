// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
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

  it("returns false and sets unavailable state for empty content", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { clipboardState, copyText } = useClipboard();

    await expect(copyText("")).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    expect(clipboardState.value).toBe("unavailable");
  });

  it("handles writeText rejection gracefully and sets state to unavailable", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Permission denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { clipboardState, copyText } = useClipboard();

    await expect(copyText("Secret payload")).resolves.toBe(false);
    expect(writeText).toHaveBeenCalledWith("Secret payload");
    expect(clipboardState.value).toBe("unavailable");
  });

  it("supports custom feedbackDurationMs = 0 without scheduling reset timer", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { clipboardState, copyText } = useClipboard();

    await expect(copyText("Direct copy", { feedbackDurationMs: 0 })).resolves.toBe(true);
    expect(clipboardState.value).toBe("copied");

    vi.advanceTimersByTime(5_000);
    expect(clipboardState.value).toBe("copied");
  });

  it("clears existing feedback timer when consecutive copy operation is triggered", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { clipboardState, copyText } = useClipboard();

    await copyText("First copy");
    expect(clipboardState.value).toBe("copied");

    vi.advanceTimersByTime(1_000);
    await copyText("Second copy");
    expect(clipboardState.value).toBe("copied");

    vi.advanceTimersByTime(1_000);
    expect(clipboardState.value).toBe("copied");

    vi.advanceTimersByTime(1_000);
    expect(clipboardState.value).toBe("idle");
  });

  it("clears feedback timer when active Vue scope is disposed", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const scope = effectScope();
    let copyFn: ReturnType<typeof useClipboard>["copyText"];

    scope.run(() => {
      const { copyText } = useClipboard();
      copyFn = copyText;
    });

    await copyFn!("Scoped copy");

    scope.stop();

    vi.advanceTimersByTime(CLIPBOARD_FEEDBACK_DURATION_MS);
  });
});