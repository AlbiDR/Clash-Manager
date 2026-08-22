// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import bones from "./bones.generated.json";

/**
 * SKELETON BONE REGISTRY (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Runtime accessor for build-time captured skeleton geometry.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * `bones.generated.json` is a pure build artifact (gitignored, regenerated on
 * every `dev`/`build` invocation exactly like `index.html`) produced by
 * `scripts/capture_skeletons.ts`: a headless-browser pass measures the real
 * `data-bone="Group.name"`-tagged DOM elements so loading skeletons can mirror
 * their true dimensions instead of hand-authored guesses that drift over time.
 *
 * `getBone()` intentionally returns `undefined` when a bone is missing (cold
 * checkout, empty test seed, or a genuinely unmeasured group) - callers supply
 * their own sane fallback via `?? { width, height }` rather than this module
 * baking in defaults that would mask a real capture regression.
 */

export type BoneBreakpoint = "mobile" | "tablet" | "desktop";

export interface BoneRect {
  width: number;
  height: number;
}

type BonesFile = {
  components: Record<string, Partial<Record<BoneBreakpoint, Record<string, BoneRect>>>>;
};

const bonesData = bones as BonesFile;

/**
 * Looks up a captured bone's rectangle for a given capture group and named
 * element at a specific breakpoint.
 *
 * @param group - The capture group name (e.g. `"MemberCard"`).
 * @param name - The bone's name within the group (e.g. `"name"`).
 * @param bp - The captured breakpoint to read; defaults to `"mobile"`.
 * @returns The captured `{width, height}`, or `undefined` if not present.
 */
export function getBone(
  group: string,
  name: string,
  bp: BoneBreakpoint = "mobile",
): BoneRect | undefined {
  return bonesData.components[group]?.[bp]?.[name];
}
