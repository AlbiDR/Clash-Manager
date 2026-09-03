// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { hashGroupSources, readCache, writeCache } from "./lib/capture-cache";

/**
 * BUILD-TIME SKELETON CAPTURE ("Boneyard-style", zero-dependency)
 * ----------------------------------------------------------------------------
 * Rationale: Loading skeletons drift from the real UI whenever a real
 * component's layout changes and nobody remembers to hand-update the matching
 * hardcoded skeleton pixel values. This script measures the *real* components'
 * DOM geometry with a headless browser at build time so skeletons can read
 * captured dimensions instead of guessing.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * **Mechanism:**
 * - Reuses the real app bootstrap (`src/app/main.ts`) via a minimal, temporary
 *   `index.html` instead of a parallel mock-mounting harness - avoids
 *   duplicating Pinia/router/data-loading setup.
 * - Boots Vite's dev server programmatically on an ephemeral port and points
 *   Playwright's Chromium at real routes with `?synthetic=true` so real
 *   components render with realistic mock data, with zero live network calls.
 * - Marks real components with plain `data-bone="Group.name"` attributes
 *   (no Vue-specific tooling required to query them from Playwright).
 * - Content-hashes each capture group's real source files against a disk
 *   cache (`.cache/bones-cache.json`) so an unrelated `pnpm dev` restart never
 *   pays the cost of booting Chromium when nothing the group depends on has
 *   changed.
 *
 * **Output:** `src/core/theme/bones.generated.json` - gitignored, exactly
 * like `index.html`, since it is a pure build artifact regenerated on every
 * `dev`/`build` invocation and never hand-edited.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const INDEX_HTML_PATH = join(ROOT, "index.html");
const BONES_OUTPUT_PATH = join(ROOT, "src/core/theme/bones.generated.json");
const CACHE_FILE_PATH = join(ROOT, ".cache/bones-cache.json");

const BREAKPOINTS = {
  mobile: 375,
  tablet: 640,
  desktop: 1280,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;
type BoneRect = { width: number; height: number };
type GroupBones = Partial<Record<Breakpoint, Record<string, BoneRect>>>;

// Shared inputs whose changes affect every captured group's rendered layout.
/**
 * Global sources that feed EVERY capture group's rendered geometry.
 *
 * @remarks
 * Root cause this list exists in this shape (2026-09-03 CI audit): it used to
 * name only `tokens.ts` and `base.ts`, but `main.ts` also injects
 * `animations`, `skeletons` and `components` stylesheets, and
 * `components.ts` carries the `.card` padding/gap/height rules that set card
 * geometry directly. Editing those left every group's hash unchanged, so the
 * cache reported a hit and skeletons silently kept stale measurements. CI
 * masked the bug by never persisting the cache and always re-capturing; local
 * `pnpm dev`/`pnpm build` did not.
 *
 * The theme directory is globbed rather than hand-listed so a newly added
 * stylesheet joins the invalidation surface automatically instead of relying
 * on somebody remembering to add it here - the same "never hand-maintain what
 * the build can measure" reason the bone capture exists at all.
 */
const SHARED_SOURCES = [
  // Every global stylesheet/theme module `src/app/main.ts` injects into the
  // page. Sorted so the concatenation order (and therefore the hash) is
  // stable across filesystems.
  ...readdirSync(join(ROOT, "src/core/theme"))
    .filter((file) => file.endsWith(".ts"))
    .sort()
    .map((file) => join(ROOT, "src/core/theme", file)),
  // Shared primitives the captured components render inside themselves. Their
  // intrinsic size is part of the measured card/row height: `Icon` appears in
  // six of the eight capture groups, `BaseCard` wraps two of them.
  join(ROOT, "src/shared/ui/Icon.vue"),
  join(ROOT, "src/shared/ui/BaseCard.vue"),
  // Synthetic mode renders real components against this mock data (via
  // `useClashSync`), so the text it supplies drives the measured geometry.
  join(ROOT, "src/core/utils/mockData.ts"),
];

interface CaptureGroup {
  /** Capture group name, matching the `Group` half of `data-bone="Group.name"`. */
  name: string;
  /** Real app route (hash-history path) that renders this group's DOM. */
  route: string;
  /** Real source files feeding this group's layout, for cache hashing. */
  sources: string[];
  /**
   * If set, this group's bones are not measured directly - they are copied
   * verbatim from the named group after capture (e.g. the static pre-hydration
   * `AppShell` mirrors the real roster list's member name geometry).
   */
  aliasOf?: string;
}

const CAPTURE_GROUPS: CaptureGroup[] = [
  {
    name: "MemberCard",
    route: "/roster",
    sources: [
      join(ROOT, "src/features/roster/components/MemberCard.vue"),
      join(ROOT, "src/shared/ui/BaseCard.vue"),
    ],
  },
  {
    name: "RecruitCard",
    route: "/headhunter",
    sources: [
      join(ROOT, "src/features/headhunter/components/RecruitCard.vue"),
      join(ROOT, "src/shared/ui/BaseCard.vue"),
    ],
  },
  {
    // Nine distinct SettingsCard instances render on this route
    // (NetworkSettings, NotificationSettings, AboutSettings, ...). Capture
    // them in their DEFAULT collapsed state (plain `?synthetic=true`, no
    // Showcase override) - `SkeletonSettingsCard` is shown while the real
    // page is still loading, and `initiallyExpanded` is driven purely by
    // `isShowcaseMode` (see SettingsView.vue), which is false for a normal
    // user. A real user's cards are collapsed the entire time this skeleton
    // is visible; capturing them force-expanded (a state loading users never
    // actually see) previously produced a skeleton several times taller than
    // what it was meant to stand in for. The title (`h3`) lives in the
    // always-visible header regardless of collapse state, so this loses no
    // real measurement - only the wrongly-inflated card height.
    name: "SettingsCard",
    route: "/settings",
    sources: [join(ROOT, "src/shared/ui/SettingsCard.vue")],
  },
  {
    name: "VaultCard",
    route: "/laboratory",
    sources: [join(ROOT, "src/features/laboratory/components/VaultCard.vue")],
  },
  {
    name: "ParameterCard",
    route: "/laboratory",
    sources: [join(ROOT, "src/features/laboratory/components/ParameterCard.vue")],
  },
  {
    name: "SummaryCard",
    route: "/laboratory",
    sources: [join(ROOT, "src/features/laboratory/components/SummaryCard.vue")],
  },
  {
    name: "TrajectoryList",
    route: "/laboratory",
    sources: [join(ROOT, "src/features/laboratory/components/TrajectoryList.vue")],
  },
  {
    name: "TrajectoryItem",
    route: "/laboratory",
    sources: [join(ROOT, "src/features/laboratory/components/TrajectoryItem.vue")],
  },
  {
    // The static pre-hydration AppShell mimics the real roster list's member
    // rows; it is not a route of its own, so it rides on MemberCard's capture.
    name: "RosterShell",
    route: "/roster",
    sources: [
      join(ROOT, "src/features/roster/components/MemberCard.vue"),
      join(ROOT, "src/shared/ui/BaseCard.vue"),
      join(ROOT, "src/core/theme/AppShell.ts"),
    ],
    aliasOf: "MemberCard",
  },
];

// Per-route navigation query string. Every route uses plain Synthetic mode
// (real components, mock data, no Blueprint skeleton override, no Showcase
// expansion) - capturing each real component in the same default state a
// normal user actually sees while its skeleton is showing, not a
// best-case/expanded state few users ever encounter during a loading window.
// Blueprint mode is independently forced off for every capture via an init
// script below (the exact "branding pipeline" escape hatch
// `useShowcaseMode.ts` documents), so it never replaces a real component with
// its own skeleton and makes a route uncapturable.
const DEFAULT_QUERY = "synthetic=true";

const TEMP_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /></head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/app/main.ts"></script>
  </body>
</html>
`;

/**
 * Deletes the on-disk capture cache, forcing every group to be treated as
 * stale on the next `ensureBonesFresh()` call.
 */
export function clearCache(): void {
  if (existsSync(CACHE_FILE_PATH)) unlinkSync(CACHE_FILE_PATH);
}

/**
 * Ensures `bones.generated.json` reflects the current state of every capture
 * group's real source files, re-measuring only groups whose content hash has
 * changed since the last run. Boots a headless Chromium instance lazily, at
 * most once per invocation, and only if at least one group is stale.
 */
export async function ensureBonesFresh(): Promise<void> {
  const cache = readCache();
  const nextCache: typeof cache = { ...cache };

  const groupHashes = new Map<string, string>();
  for (const group of CAPTURE_GROUPS) {
    groupHashes.set(group.name, hashGroupSources([...group.sources, ...SHARED_SOURCES]));
  }

  const measurableGroups = CAPTURE_GROUPS.filter((g) => !g.aliasOf);
  const staleGroups = measurableGroups.filter(
    (g) => cache[g.name] !== groupHashes.get(g.name),
  );

  const result: Record<string, GroupBones> = {};
  for (const group of measurableGroups) {
    const cached = readStoredBones(group.name);
    if (cached) result[group.name] = cached;
  }

  if (staleGroups.length === 0) {
    console.log("[bones] Cache hit for every capture group - skipping Chromium boot.");
  } else {
    console.log(
      `[bones] ${staleGroups.length} capture group(s) stale (${staleGroups
        .map((g) => g.name)
        .join(", ")}) - capturing via headless Chromium.`,
    );
    const routes = [...new Set(staleGroups.map((g) => g.route))];
    try {
      const captured = await captureRoutes(routes);
      for (const [groupName, bones] of Object.entries(captured)) {
        result[groupName] = bones;
      }
      for (const group of measurableGroups) {
        if (routes.includes(group.route)) {
          nextCache[group.name] = groupHashes.get(group.name)!;
        }
      }
      writeCache(nextCache);
    } catch (error) {
      // A missing Chromium binary (e.g. a fresh checkout that hasn't run
      // `pnpm exec playwright install chromium` yet) must never block the
      // ordinary `dev`/`build` scripts - it only means skeletons keep
      // whatever geometry was last captured (or the components' own hardcoded
      // fallback, on a clean checkout with nothing captured yet) until the
      // browser is installed. The cache is deliberately left untouched so the
      // next successful run still treats these groups as stale and retries.
      // Graceful degradation is correct almost everywhere: a missing browser
      // should never block `pnpm dev`, and it should not block a build whose
      // output is thrown away. Auto Tag builds Frontend-PWA purely as a gate
      // before tagging and never installs Chromium or publishes the result -
      // stale bones there reach nobody.
      //
      // It is NOT correct for a build that ships. Root cause this guards
      // (2026-09-03 CI audit): once the capture artifacts are cached, a run
      // whose capture failed can publish stale bones under a key later runs
      // treat as a hit, and because a hit skips the Chromium install those
      // runs cannot re-measure either - the staleness would become
      // self-sustaining and completely silent.
      //
      // Keyed on an explicit opt-in rather than inferred from CI. The first
      // version of this guard tested `process.env.CI` and immediately broke
      // Auto Tag, because "runs in CI" and "produces the artifact users
      // receive" are not the same property. Only the workflow that uploads
      // the build sets this.
      if (process.env.BONES_REQUIRE_CAPTURE === "true") {
        console.error(
          "[bones] Capture failed while BONES_REQUIRE_CAPTURE=true - refusing to publish stale or fallback skeleton geometry.",
        );
        throw error;
      }

      console.warn(
        "[bones] Capture failed - skeletons will use the last captured (or fallback) geometry.",
        "Run `pnpm exec playwright install chromium` in Frontend-PWA to enable live capture.",
      );
      console.warn(error instanceof Error ? error.message : error);
    }
  }

  // Resolve aliases (e.g. RosterShell mirrors MemberCard) after all real
  // measurement/cache resolution has happened.
  for (const group of CAPTURE_GROUPS) {
    if (group.aliasOf && result[group.aliasOf]) {
      result[group.name] = result[group.aliasOf];
    }
  }

  writeFileSync(BONES_OUTPUT_PATH, JSON.stringify({ components: result }, null, 2));
}

/**
 * Reads the previously captured bones for a group back out of
 * `bones.generated.json`, if present, so a cache-hit group's geometry
 * survives even though the JSON file itself is regenerated every run.
 *
 * @remarks
 * The cache file only tracks hashes, not geometry, to keep it small; the last
 * known geometry instead lives wherever it was last written -
 * `bones.generated.json` on disk from the previous run.
 */
function readStoredBones(groupName: string): GroupBones | undefined {
  if (!existsSync(BONES_OUTPUT_PATH)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(BONES_OUTPUT_PATH, "utf-8")) as {
      components?: Record<string, GroupBones>;
    };
    return parsed.components?.[groupName];
  } catch {
    return undefined;
  }
}

/**
 * Boots a temporary Vite dev server (middleware mode) plus a headless
 * Chromium instance, visits each given real app route at every breakpoint,
 * and measures every `[data-bone]`-tagged element present.
 *
 * @param routes - Real hash-history route paths (e.g. `"/roster"`) to visit.
 * @returns Captured bones keyed by capture group name, then breakpoint.
 */
async function captureRoutes(routes: string[]): Promise<Record<string, GroupBones>> {
  // Playwright is a devDependency-only, build-time tool; never bundled into
  // the shipped app. Deferred import keeps it out of any accidental static
  // analysis of the runtime graph.
  const { chromium } = await import("playwright");

  // The real bootstrap (src/app/main.ts) throws before mounting if no
  // Supabase URL is configured. Match the existing CI precedent
  // (generate-branding.yml) of a harmless placeholder for build-time-only
  // rendering passes that never make a real network call (synthetic mode).
  process.env.VITE_SUPABASE_URL ||= "https://placeholder.supabase.co";
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||= "placeholder";

  const previousIndexHtml = existsSync(INDEX_HTML_PATH)
    ? readFileSync(INDEX_HTML_PATH, "utf-8")
    : null;
  writeFileSync(INDEX_HTML_PATH, TEMP_INDEX_HTML);

  const vite = await createViteServer({
    root: ROOT,
    server: { middlewareMode: true },
    // "spa" (not "custom") is required so Vite serves and transforms
    // TEMP_INDEX_HTML itself for every non-asset request - "custom" disables
    // Vite's built-in HTML handling entirely, which silently served nothing
    // at "/" and made every capture pass measure zero elements without ever
    // throwing (main.ts never loaded, so the app never mounted).
    appType: "spa",
    logLevel: "warn",
  });

  const httpServer = createHttpServer(vite.middlewares);
  const port = await new Promise<number>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      resolve((httpServer.address() as AddressInfo).port);
    });
  });

  const results: Record<string, GroupBones> = {};

  try {
    const browser = await chromium.launch();
    try {
      for (const route of routes) {
        // A fresh page per route, not one page reused across every route.
        // Successive page.goto() calls that only change the hash fragment
        // (http://host/#/roster -> http://host/#/settings) are same-document
        // navigations in a real browser - they update the SPA's route
        // reactively via hashchange, but never reload the document or re-run
        // main.ts. The singleton composables (useSyntheticMode,
        // useShowcaseMode) read their URL query param exactly once, at that
        // first module evaluation, so every route after the first silently
        // kept whichever query params the very first route happened to boot
        // with - only the first route in `routes` ever captured anything.
        // A real navigation (from about:blank, a distinct origin state) for
        // each route guarantees main.ts and its singletons re-initialize
        // against that route's own query string.
        const page = await browser.newPage();
        try {
          // Force Blueprint mode off regardless of route/query combination.
          // A route requesting Showcase (below) would otherwise also force
          // Blueprint on, which replaces every real component with its own
          // skeleton placeholder - capturing a skeleton's hardcoded geometry
          // instead of the real DOM it's supposed to mirror. This is the
          // exact escape hatch `useShowcaseMode.ts` documents for branding
          // pipelines.
          await page.addInitScript(() => {
            window.localStorage.setItem("clash_manager_blueprint_mode", "false");
          });

          for (const [bp, width] of Object.entries(BREAKPOINTS) as [Breakpoint, number][]) {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(`http://127.0.0.1:${port}/#${route}?${DEFAULT_QUERY}`, {
              waitUntil: "networkidle",
            });
            await page.waitForSelector("[data-bone]", { timeout: 10_000 }).catch(() => {
              // No bones rendered for this route/breakpoint (e.g. empty
              // synthetic dataset) - leave this pass's measurements empty
              // rather than fail the whole build.
            });

            const measurements = await page.$$eval("[data-bone]", (elements) =>
              elements.map((el) => {
                const rect = el.getBoundingClientRect();
                return {
                  bone: el.getAttribute("data-bone") || "",
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                };
              }),
            );

            // Multiple real instances of the same capture group can render on
            // one page (e.g. nine distinct SettingsCard usages on /settings,
            // whose real heights vary widely by content - About is short,
            // Network & API is long). Picking whichever happened to be last
            // in DOM order would silently capture an arbitrary instance
            // rather than a representative dimension; taking the max would
            // force every skeleton instance to mirror the single tallest
            // real card, leaving most skeletons mostly empty space below
            // their actual content. Average both dimensions instead - a
            // typical size that under- and over-shoots real instances by
            // roughly the same, unnoticeable amount, rather than guaranteeing
            // a specific (and often extreme) one never exceeds the skeleton.
            const byBone = new Map<string, { widths: number[]; heights: number[] }>();
            for (const { bone, width: w, height: h } of measurements) {
              if (!bone.includes(".")) continue;
              const entry = byBone.get(bone) ?? { widths: [], heights: [] };
              entry.widths.push(w);
              entry.heights.push(h);
              byBone.set(bone, entry);
            }

            for (const [bone, { widths, heights }] of byBone) {
              const [groupName, boneName] = bone.split(".");
            if (!groupName || !boneName) continue;
            const avgWidth = Math.round(widths.reduce((a, b) => a + b, 0) / widths.length);
            const avgHeight = Math.round(heights.reduce((a, b) => a + b, 0) / heights.length);
            results[groupName] ??= {};
            results[groupName][bp] ??= {};
            results[groupName][bp]![boneName] = { width: avgWidth, height: avgHeight };
            }
          }
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await vite.close();
    if (previousIndexHtml !== null) {
      writeFileSync(INDEX_HTML_PATH, previousIndexHtml);
    }
  }

  return results;
}

/**
 * Digest of every source file that can change ANY capture group's geometry.
 *
 * @remarks
 * Exists so CI can key its capture cache off the script's own invalidation
 * surface instead of a hand-copied file list in the workflow YAML. A
 * hand-copied list is the same manual-maintenance trap the bone capture was
 * built to remove: add a capture group, forget the copy, and CI silently
 * serves stale geometry for it forever. Deriving the key here means the two
 * can never drift, because there is only one list.
 *
 * @returns A hex-encoded SHA-256 digest over the de-duplicated, sorted union
 * of every group's own sources and {@link SHARED_SOURCES}.
 */
export function computeCaptureSurfaceHash(): string {
  const surface = new Set<string>();
  for (const group of CAPTURE_GROUPS) {
    for (const source of [...group.sources, ...SHARED_SOURCES]) {
      surface.add(source);
    }
  }
  // Sorted so the digest is stable regardless of declaration order.
  return hashGroupSources([...surface].sort());
}

// Manual-trigger entry point: `pnpm run capture:skeletons` force-refreshes
// every capture group by clearing the cache before capturing.
const isMainModule = process.argv[1] === __filename;
if (isMainModule) {
  // `--print-hash` is a read-only query used by CI to build its cache key.
  // It must not capture, clear the cache, or write any artifact.
  if (process.argv.includes("--print-hash")) {
    console.log(computeCaptureSurfaceHash());
    process.exit(0);
  }

  clearCache();
  ensureBonesFresh()
    .then(() => console.log("[bones] Capture complete."))
    .catch((error) => {
      console.error("[bones] Capture failed:", error);
      process.exitCode = 1;
    });
}
