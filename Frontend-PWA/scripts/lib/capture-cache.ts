// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * BONE CAPTURE CACHE (Build Tooling)
 * ----------------------------------------------------------------------------
 * Rationale: Avoids booting a headless Chromium instance on every unrelated
 * `pnpm dev`/`pnpm build` invocation. Each capture group is hashed against the
 * real source files that feed its layout; only groups whose hash changed since
 * the last successful capture are re-measured.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * The cache file (`.cache/bones-cache.json`) is a pure, disposable artifact -
 * safe to delete at any time, forcing a full re-capture on the next run.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_DIR = join(__dirname, "../../.cache");
const CACHE_FILE = join(CACHE_DIR, "bones-cache.json");

type CacheFile = Record<string, string>;

/**
 * Computes a stable SHA-256 hash of the concatenated contents of a capture
 * group's source files (missing files hash as an empty string so a deleted
 * source still invalidates the cache instead of throwing).
 *
 * @param filePaths - Absolute paths of the real source files feeding a
 * capture group's layout (component `.vue` files, shared token sources).
 * @returns A hex-encoded SHA-256 digest of the concatenated file contents.
 */
export function hashGroupSources(filePaths: string[]): string {
  const hash = createHash("sha256");
  for (const filePath of filePaths) {
    hash.update(existsSync(filePath) ? readFileSync(filePath) : Buffer.alloc(0));
  }
  return hash.digest("hex");
}

/**
 * Reads the persisted per-group hash cache from disk.
 *
 * @returns The cache contents, or an empty object if no cache file exists yet
 * or it fails to parse (a corrupt cache should never crash the build).
 */
export function readCache(): CacheFile {
  if (!existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as CacheFile;
  } catch {
    return {};
  }
}

/**
 * Persists the per-group hash cache to disk, creating the `.cache` directory
 * if it does not already exist.
 *
 * @param cache - The full cache contents to write.
 */
export function writeCache(cache: CacheFile): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}
