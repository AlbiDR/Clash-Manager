// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 *
 * SPEC: ghostBenchmarkState.ts
 *
 * Validates the core behavior of the useGhostBenchmarkState composable:
 *  - Initial state is null.
 *  - show(el, content) correctly populates the state using the element's client rect.
 *  - hide() resets the active state back to null.
 *  - Multiple calls to useGhostBenchmarkState refer to the exact same shared reactive ref (module-level singleton).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGhostBenchmarkState } from "../ghostBenchmarkState";
import type { BenchmarkData } from "../../../core";

const BENCHMARK: BenchmarkData = {
  label: "Trophies",
  tier: "ELITE",
  value: 8_000,
  avg: 6_000,
  min: 2_000,
  max: 10_000,
  percent: 33,
  isBetter: true,
};

const FAKE_RECT: DOMRect = {
  left: 100,
  top: 200,
  right: 200,
  bottom: 220,
  width: 100,
  height: 20,
  x: 100,
  y: 200,
  toJSON: () => ({}),
};

function makeAnchorEl(rect: DOMRect = FAKE_RECT): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => rect;
  return el;
}

describe("ghostBenchmarkState directive state module", () => {
  beforeEach(() => {
    const { hide } = useGhostBenchmarkState();
    hide();
  });

  it("should initialize active.value as null", () => {
    const { active } = useGhostBenchmarkState();
    expect(active.value).toBeNull();
  });

  it("should populate active.value with content and element's DOMRect on show", () => {
    const { active, show } = useGhostBenchmarkState();
    const el = makeAnchorEl();

    show(el, BENCHMARK);

    expect(active.value).not.toBeNull();
    expect(active.value?.content).toEqual(BENCHMARK);
    expect(active.value?.anchorRect).toEqual(FAKE_RECT);
  });

  it("should support string content on show", () => {
    const { active, show } = useGhostBenchmarkState();
    const el = makeAnchorEl();
    const stringContent = "This is a simple benchmark info text";

    show(el, stringContent);

    expect(active.value).not.toBeNull();
    expect(active.value?.content).toBe(stringContent);
    expect(active.value?.anchorRect).toEqual(FAKE_RECT);
  });

  it("should set active.value back to null on hide", () => {
    const { active, show, hide } = useGhostBenchmarkState();
    const el = makeAnchorEl();

    show(el, BENCHMARK);
    expect(active.value).not.toBeNull();

    hide();
    expect(active.value).toBeNull();
  });

  it("should share the exact same reactive ref instance across multiple invokers (module singleton proof)", () => {
    const instanceA = useGhostBenchmarkState();
    const instanceB = useGhostBenchmarkState();

    // The returned `active` refs must refer to the exact same Vue ref object.
    expect(instanceA.active).toBe(instanceB.active);

    const el = makeAnchorEl();
    instanceA.show(el, BENCHMARK);

    // Mutation via instanceA must be observed immediately on instanceB
    expect(instanceB.active.value).not.toBeNull();
    expect(instanceB.active.value?.content).toEqual(BENCHMARK);

    instanceB.hide();

    // Hiding via instanceB must reset instanceA
    expect(instanceA.active.value).toBeNull();
  });
});
