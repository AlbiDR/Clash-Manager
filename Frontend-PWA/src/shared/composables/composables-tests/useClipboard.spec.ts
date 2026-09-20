// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { afterEach, describe, expect, it, vi } from "vitest";
import { useClipboard } from "../useClipboard";

describe("useClipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("copies explicit text and exposes a copied state", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { clipboardState, copyText } = useClipboard();

    await expect(copyText("Readable sync details")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("Readable sync details");
    expect(clipboardState.value).toBe("copied");
  });

  it("does not throw when clipboard access is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const { clipboardState, copyText } = useClipboard();

    await expect(copyText("Readable sync details")).resolves.toBe(false);
    expect(clipboardState.value).toBe("unavailable");
  });
});
