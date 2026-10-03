// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * In a scoped style block, Vue compiles `:global(X) Y` to `X` alone: everything
 * after the closing parenthesis is dropped without a warning. A rule meant for a
 * component under a global state therefore lands on the global element itself.
 *
 * [FIX] StatusPill's `:global(html[data-motion-preference="reduced"])
 * .status-indicator.is-syncing::after { opacity: 0.45 }` compiled to
 * `html[...] { opacity: 0.45 }`, fading the whole app for everyone who chose
 * reduced motion or had it on in the OS; 51 sibling rules in eight more
 * components never reached their element at all. The right form is the bare
 * ancestor (`html[...] .child`), which Vue scopes on the last compound, or the
 * whole selector inside `:global(...)` when the target really is global.
 */
const GLOBAL_THEN_DESCENDANT = /:global\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)[ \t]+[.#\w:[*>~+]/g;

function scopedStyleBlocks(source: string): string[] {
  return [...source.matchAll(/<style\b[^>]*\bscoped\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
}

export function findDroppedDescendants(source: string): string[] {
  return scopedStyleBlocks(source).flatMap((css) => [...css.matchAll(GLOBAL_THEN_DESCENDANT)].map((match) => match[0]));
}

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return vueFiles(full);
    return entry.endsWith(".vue") ? [full] : [];
  });
}

const SRC = path.resolve(__dirname, "../../..");

describe("scoped :global() selectors", () => {
  it("flags a :global() ancestor followed by a descendant, and accepts the correct forms", () => {
    expect(findDroppedDescendants('<style scoped>:global(html[data-x="y"]) .dot::after { opacity: 0.45; }</style>')).toHaveLength(1);
    expect(findDroppedDescendants('<style scoped>:global(html:not([data-x="y"])) .dot { transform: none; }</style>')).toHaveLength(1);
    expect(findDroppedDescendants('<style scoped>html[data-x="y"] .dot { opacity: 0.45; }</style>')).toEqual([]);
    expect(findDroppedDescendants("<style scoped>:global(:root[data-x] .page-enter-from), :global(.a) { opacity: 0; }</style>")).toEqual([]);
    expect(findDroppedDescendants("<style>:global(.a) .b { opacity: 0; }</style>")).toEqual([]);
  });

  it("is never followed by a descendant selector in any component", () => {
    const files = vueFiles(SRC);
    // A scan that found nothing to scan would also report no problems.
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.flatMap((file) =>
      findDroppedDescendants(readFileSync(file, "utf8")).map((selector) => `${path.relative(SRC, file)}: ${selector}`),
    );
    expect(offenders).toEqual([]);
  });
});
