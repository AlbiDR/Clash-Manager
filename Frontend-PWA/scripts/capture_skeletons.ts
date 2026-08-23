// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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
const SHARED_SOURCES = [
  join(ROOT, "src/core/theme/tokens.ts"),
  join(ROOT, "src/core/theme/base.ts"),
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
    // (NetworkSettings, NotificationSettings, AboutSettings, ...), each
    // collapsed by default - `initiallyExpanded` is driven by `isShowcaseMode`
    // (see SettingsView.vue), not by Synthetic mode. Capturing with only
    // `?synthetic=true` would measure a collapsed header-only card, nowhere
    // near the real expanded height the previous hand-authored `min-height:
    // 180px` guess was approximating. See ROUTE_QUERY below for how this
    // route requests Showcase's expanded-card behavior without pulling in
    // Blueprint mode (which would replace every real card with its own
    // skeleton and make this route entirely uncapturable).
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

// Per-route navigation query string. Every route defaults to plain Synthetic
// mode (real components, mock data, no Blueprint skeleton override). Routes
// whose real layout depends on Showcase-only state (e.g. Settings cards'
// `initiallyExpanded`) opt into `showcase=true` here; Blueprint mode is
// independently forced off for every capture via an init script below
// (the exact "branding pipeline" escape hatch `useShowcaseMode.ts` documents),
// so Showcase's expanded-card behavior never drags in skeleton placeholders.
const ROUTE_QUERY: Record<string, string> = {
  "/settings": "synthetic=true&showcase=true",
};
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
        const query = ROUTE_QUERY[route] ?? DEFAULT_QUERY;

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
            await page.goto(`http://127.0.0.1:${port}/#${route}?${query}`, {
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

// Manual-trigger entry point: `pnpm run capture:skeletons` force-refreshes
// every capture group by clearing the cache before capturing.
const isMainModule = process.argv[1] === __filename;
if (isMainModule) {
  clearCache();
  ensureBonesFresh()
    .then(() => console.log("[bones] Capture complete."))
    .catch((error) => {
      console.error("[bones] Capture failed:", error);
      process.exitCode = 1;
    });
}
