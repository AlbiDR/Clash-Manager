// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { config } from "@vue/test-utils";
import { vi } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Global mocks or config

// 0. Seed bones.generated.json (Build-Time Skeleton Capture)
// `bones.generated.json` is a gitignored build artifact, regenerated on every
// `dev`/`build` invocation by `scripts/capture_skeletons.ts` (see
// `synthesize_entry.ts`). CI runs `pnpm test` BEFORE `pnpm run build`, so a
// clean checkout has no bones file and no Chromium ever needs to boot for
// tests. Seed an empty-but-valid shape synchronously so `getBone()` calls in
// component tests resolve to `undefined` (their documented cold-start
// behavior) instead of a module resolution error.
const bonesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "src/core/theme/bones.generated.json",
);
if (!existsSync(bonesPath)) {
  mkdirSync(dirname(bonesPath), { recursive: true });
  writeFileSync(bonesPath, JSON.stringify({ components: {} }));
}

// 1. Fix JSDOM Navigation Error
// JSDOM does not implement navigation. We mock it to prevent "Error: Not implemented: navigation"
const mockSafeLocation = {
  ...window.location,
  assign: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
};
delete (window as any).location;
window.location = mockSafeLocation as any;

// 2. Fix Network Fetch Failures
// Mock global fetch to prevent real network requests and retry loops in CI
vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  }),
);

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: any) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // Deprecated
    removeListener: () => {}, // Deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock localStorage
const localStorageMock = (function () {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] || null,
    length: 0,
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });
