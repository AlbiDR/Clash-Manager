// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SKELETON BONES SEED
 * ----------------------------------------------------------------------------
 * Rationale: `bones.generated.json` is a gitignored build artifact, but
 * `src/core/theme/bones.ts` imports it, so anything that compiles the app needs
 * the file to exist. Only two things ever created it: the build-time capture
 * (`capture_skeletons.ts`, run by `dev`/`build`) and the test setup. Type-check
 * created nothing, so every clean checkout that type-checked before testing or
 * building failed with TS2307: the Intelligence Checks workflow on every run
 * since its Type Check step was added, and every git worktree until the file
 * was copied in by hand.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * The seed is the empty-but-valid shape `getBone()` already treats as a cold
 * start (it returns `undefined` and callers apply their own fallbacks). It is
 * written only when the file is absent, so a real capture is never replaced.
 * This module is the one place that names the file and the seed shape: the
 * capture script, the test setup and the `type-check` script all use it.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the capture writes its geometry and where `bones.ts` imports it from. */
export const BONES_OUTPUT_PATH = join(ROOT, "src/core/theme/bones.generated.json");

/** The cold-start shape: no captured components. */
export const EMPTY_BONES = Object.freeze({ components: {} });

/**
 * Writes the empty seed when no bones file exists yet. Returns whether it wrote.
 * Never overwrites: an existing file is a real capture or an earlier seed.
 */
export function ensureBonesSeed(path: string = BONES_OUTPUT_PATH): boolean {
  if (existsSync(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(EMPTY_BONES));
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (ensureBonesSeed()) {
    console.log("Seeded an empty bones.generated.json (no skeleton capture has run in this checkout).");
  }
}
