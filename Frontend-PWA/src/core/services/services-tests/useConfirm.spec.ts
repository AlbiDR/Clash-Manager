// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useConfirm } from "../useConfirm";

describe("useConfirm service", () => {
  const { active, confirm, resolve } = useConfirm();

  beforeEach(() => {
    // Reset global reactive state before each test
    active.value = null;
  });

  it("should initialize active as null", () => {
    expect(active.value).toBeNull();
  });

  it("should merge and apply default options when confirm is called", () => {
    const _promise = confirm({ title: "Delete Record?" });

    expect(active.value).not.toBeNull();
    expect(active.value?.title).toBe("Delete Record?");
    expect(active.value?.message).toBeUndefined();
    expect(active.value?.confirmLabel).toBe("Confirm");
    expect(active.value?.cancelLabel).toBe("Cancel");
    expect(active.value?.tone).toBe("default");
    expect(typeof active.value?.resolve).toBe("function");

    // Clean up
    resolve(false);
  });

  it("should merge full custom options correctly", () => {
    const _promise = confirm({
      title: "Warning",
      message: "This action is irreversible.",
      confirmLabel: "Proceed",
      cancelLabel: "Go Back",
      tone: "danger",
    });

    expect(active.value?.title).toBe("Warning");
    expect(active.value?.message).toBe("This action is irreversible.");
    expect(active.value?.confirmLabel).toBe("Proceed");
    expect(active.value?.cancelLabel).toBe("Go Back");
    expect(active.value?.tone).toBe("danger");

    // Clean up
    resolve(false);
  });

  it("should resolve with true and reset active to null on confirmation", async () => {
    const promise = confirm({ title: "Save Changes?" });

    // Verify resolve updates active.value immediately before the promise tick finishes
    resolve(true);

    expect(active.value).toBeNull();

    const result = await promise;
    expect(result).toBe(true);
  });

  it("should resolve with false and reset active to null on cancellation", async () => {
    const promise = confirm({ title: "Discard Changes?" });

    resolve(false);

    expect(active.value).toBeNull();

    const result = await promise;
    expect(result).toBe(false);
  });

  it("should handle idle resolve calls safely without throw or state change", () => {
    expect(active.value).toBeNull();

    // Call resolve when no confirmation is active
    expect(() => resolve(true)).not.toThrow();
    expect(active.value).toBeNull();
  });

  it("should support sequential confirmation flows correctly", async () => {
    const firstPromise = confirm({ title: "First Action" });
    resolve(true);
    const firstResult = await firstPromise;
    expect(firstResult).toBe(true);
    expect(active.value).toBeNull();

    const secondPromise = confirm({ title: "Second Action" });
    resolve(false);
    const secondResult = await secondPromise;
    expect(secondResult).toBe(false);
    expect(active.value).toBeNull();
  });
});
