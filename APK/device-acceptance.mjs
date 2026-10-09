// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * device-acceptance.mjs - a deliberately small, inspectable CM Dev smoke run.
 *
 * This is an opt-in device check, not a CI job. It combines apk-dev.mjs's
 * safe start, CDP evaluation, screenshots and app logs with the two Android
 * inputs apk-dev intentionally does not own: an HTTPS VIEW intent and Back.
 * The result is a directory of screenshots, a filtered log and report.json
 * rather than a claim based only on source code.
 *
 * Usage:
 *   node APK/device-acceptance.mjs
 *   node APK/device-acceptance.mjs --display
 *   node APK/device-acceptance.mjs --output /absolute/or/new/output-directory
 *
 * Start an emulator and install CM Dev first:
 *   pnpm apk:emulator && pnpm apk:dev
 *
 * Safety boundary:
 * - This never stops CM Dev, invokes Blitz, opens a player profile or opens
 *   Clash Royale.
 * - It only reads accessibility, overlay and APK-install permission state.
 *   It never grants, revokes or opens a security-settings screen.
 * - On an emulator it temporarily switches system light/dark mode and rotates
 *   to landscape, then restores the exact prior display settings in finally.
 *   On a physical device those display checks require --display explicitly.
 * - It does not use uiautomator. Screenshots, CDP state and CM Dev's own logs
 *   are the evidence because Android 16 can make a transient UI dump flaky.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEV_PACKAGE } from "./make-dev-variant.mjs";

const APK_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_DIR = path.resolve(APK_DIR, "..");
const APK_DEV = path.join(APK_DIR, "apk-dev.mjs");
const ACTIVITY = `${DEV_PACKAGE}/com.albidr.clashmanager.MainActivity`;
const COMMAND_TIMEOUT_MS = 120_000;
const PAGE_TIMEOUT_MS = 20_000;
const POPULATION_TIMEOUT_MS = 25_000;
const POLL_INTERVAL_MS = 300;
const REPORT_VERSION = 1;
const POPULATION_DB_NAME = "clash_manager_v14";
const POPULATION_STORE_NAME = "keyval";
const POPULATION_CACHE_KEY = "CLAN_MANAGER_DATA_V8";

const FATAL_ANDROID_RUNTIME_MARKER = /FATAL EXCEPTION|Fatal signal|ANR in com\.albidr\.clashmanager\.dev/i;
const WEBVIEW_CONSOLE_MARKER = /\[(?:INFO|WARNING|ERROR):CONSOLE\(\d+\)\]/i;
const CM_FRONTEND_CONSOLE_SOURCE = /\bsource:\s+(?:https:\/\/albidr\.github\.io|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)\/Clash-Manager(?:[/?#]|$)/i;

// These are intentionally an allow-list, rather than treating every Android
// E/W line or every browser console warning as an app failure. Android 16's
// emulator and WebView legitimately emit noisy GPU, seed-file and platform
// permission warnings. Each rule below maps to a stable, app-owned console
// message and requires the CM frontend source URL as well as a WebView console
// record. Add a rule only when the PWA owns both the prefix and its semantics.
const FRONTEND_LOG_HEALTH_RULES = Object.freeze([
  {
    id: "frontend-boot-failure",
    status: "FAIL",
    pattern: /\bFATAL ERROR:/i,
    message: "CM frontend reported a fatal bootstrap error",
  },
  {
    id: "realtime-subscription-initialization",
    status: "DEGRADED",
    pattern: /\[Realtime\]\s+Failed to initialize subscription:/i,
    message: "CM frontend could not initialize the Realtime blacklist subscription",
  },
  {
    id: "realtime-subscription-runtime",
    status: "DEGRADED",
    pattern: /\[Realtime\]\s+Subscription error:/i,
    message: "CM frontend reported a Realtime subscription error",
  },
  {
    id: "sync-cache-hydration",
    status: "DEGRADED",
    pattern: /\[Sync\]\s+Cache hydration failed:/i,
    message: "CM frontend could not hydrate its local sync cache",
  },
  {
    id: "sync-remote-failure",
    status: "DEGRADED",
    pattern: /\[Sync\]\s+Remote sync failed\s+\(Attempt\s+\d+\):/i,
    message: "CM frontend could not complete a remote Supabase sync",
  },
  {
    id: "sync-cache-validation",
    status: "FAIL",
    pattern: /\[Sync\]\s+Local cache validation failed:/i,
    message: "CM frontend rejected its saved client dataset during cache validation",
  },
]);

// Set only during temporary system-display checks. A SIGINT/SIGTERM otherwise
// bypasses async finally blocks, so this lets an interrupted emulator run put
// the display back synchronously before Node exits.
let pendingDisplayRestore = null;

const ROUTES = Object.freeze([
  { path: "/roster", title: "Roster" },
  { path: "/headhunter", title: "Headhunter" },
  { path: "/laboratory", title: "Laboratory" },
  { path: "/settings", title: "Settings" },
]);

// The static bridge-contract check proves signatures; this check proves the
// current WebView actually received every member without calling a mutator.
const BRIDGE_METHODS = Object.freeze([
  "isAndroidWrapper",
  "getAppVersionName",
  "getAppVersionCode",
  "getBuildNumber",
  "openExternalUrl",
  "downloadApkFile",
  "openPlayerProfile",
  "hasOverlayPermission",
  "canRequestPackageInstalls",
  "openPackageInstallSettings",
  "openOverlaySettings",
  "startBlitz",
  "saveCoordinates",
  "getCoordinates",
  "setThemeColors",
  "getSafeAreaInsets",
  "getLastBlitzRun",
  "isAccessibilityActive",
  "openAccessibilitySettings",
]);

const PAGE_SNAPSHOT_EXPRESSION = `(() => {
  const root = document.documentElement;
  let preference = "auto";
  try { preference = localStorage.getItem("cm_theme_preference") || "auto"; } catch (_) {}
  return {
    href: location.href,
    hash: location.hash,
    title: document.title,
    readyState: document.readyState,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    bridgePresent: Boolean(window.AndroidBridge),
    theme: {
      preference,
      prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
      documentDark: root.classList.contains("dark"),
      color: document.querySelector('meta[name="theme-color"]')?.content || null,
    },
  };
})()`;

const BRIDGE_SNAPSHOT_EXPRESSION = `(() => {
  const bridge = window.AndroidBridge;
  const methods = ${JSON.stringify(BRIDGE_METHODS)};
  const has = (name) => Boolean(bridge) && typeof bridge[name] === "function";
  const call = (name) => has(name) ? bridge[name]() : null;
  return {
    present: Boolean(bridge),
    type: typeof bridge,
    methods: Object.fromEntries(methods.map((name) => [name, has(name)])),
    wrapper: call("isAndroidWrapper"),
    versionName: call("getAppVersionName"),
    versionCode: call("getAppVersionCode"),
    buildNumber: call("getBuildNumber"),
    safeArea: call("getSafeAreaInsets"),
    accessibilityActive: call("isAccessibilityActive"),
    overlayAllowed: call("hasOverlayPermission"),
    packageInstallsAllowed: call("canRequestPackageInstalls"),
  };
})()`;

// Read the already-existing IndexedDB database only. The databases() guard is
// deliberate: opening an absent database would create it and turn an empty
// cache into misleading evidence. No record is written or deleted.
function populationSnapshotExpression(route) {
  return `(${async function populationSnapshot(route, timeoutMs, intervalMs, dbName, storeName, cacheKey) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() <= deadline) {
    const expectedHash = `#${route}`;
    const bodyLines = document.body?.innerText?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? [];
    const routeHeading = bodyLines[0] ?? null;
    const sourceStatus = document.querySelector(".status-label")?.textContent?.trim() ?? null;
    const selector = route === "/roster" ? '[data-bone="MemberCard.card"]' : '[data-bone="RecruitCard.card"]';
    const visibleCards = [...document.querySelectorAll(selector)].filter((card) => card.getClientRects().length > 0).length;
    const matchingRequests = performance.getEntriesByType("resource").flatMap((entry) => {
      try {
        const url = new URL(entry.name);
        return url.hostname.endsWith(".supabase.co")
          ? [{ status: Number.isFinite(entry.responseStatus) ? entry.responseStatus : null }]
          : [];
      } catch (_) { return []; }
    });
    const supabase = {
      total: matchingRequests.length,
      successful: matchingRequests.filter((request) => request.status >= 200 && request.status < 300).length,
      failed: matchingRequests.filter((request) => request.status !== null && request.status >= 400).length,
      unknown: matchingRequests.filter((request) => request.status === null).length,
    };

    let cache = { status: "MISSING", rosterRows: null, recruitRows: null, dataSource: null, timestampPresent: false };
    try {
      if (typeof indexedDB.databases !== "function") {
        cache = { ...cache, status: "UNSUPPORTED" };
      } else {
        const databases = await indexedDB.databases();
        if (databases.some((database) => database.name === dbName)) {
          const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
          });
          try {
            if (database.objectStoreNames.contains(storeName)) {
              const value = await new Promise((resolve, reject) => {
                const request = database.transaction(storeName, "readonly").objectStore(storeName).get(cacheKey);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
              });
              cache = value && typeof value === "object"
                ? {
                    status: "READ",
                    rosterRows: Array.isArray(value.lb) ? value.lb.length : null,
                    recruitRows: Array.isArray(value.hh) ? value.hh.length : null,
                    dataSource: typeof value.dataSource === "string" ? value.dataSource : null,
                    timestampPresent: Number.isFinite(value.timestamp) && value.timestamp > 0,
                  }
                : { ...cache, status: "EMPTY" };
            } else {
              cache = { ...cache, status: "STORE_MISSING" };
            }
          } finally { database.close(); }
        }
      }
    } catch (error) {
      cache = { ...cache, status: "ERROR", message: String(error?.name || "IndexedDB read failed") };
    }

    const routeReady = location.hash === expectedHash
      && document.readyState === "complete"
      && document.title.length > 0;
    latest = {
      route,
      routeReady,
      hash: location.hash,
      title: document.title,
      routeHeading,
      sourceStatus,
      visibleCards,
      cache,
      supabase,
    };
    if (routeReady && sourceStatus === "DB" && cache.status === "READ" && cache.timestampPresent && supabase.successful > 0) {
      const rowCount = route === "/roster" ? cache.rosterRows : cache.recruitRows;
      if (Number.isInteger(rowCount) && (rowCount > 0 || route === "/headhunter")) {
        const settled = rowCount === 0 ? visibleCards === 0 : visibleCards > 0;
        if (settled) return latest;
      }
    }
    if (Date.now() + intervalMs > deadline) break;
    await sleep(intervalMs);
  }
  return latest ?? { route, routeReady: false, cache: { status: "UNOBSERVED" }, supabase: { total: 0, successful: 0, failed: 0, unknown: 0 }, visibleCards: 0 };
}.toString()})(${JSON.stringify(route)}, ${POPULATION_TIMEOUT_MS}, ${POLL_INTERVAL_MS}, ${JSON.stringify(POPULATION_DB_NAME)}, ${JSON.stringify(POPULATION_STORE_NAME)}, ${JSON.stringify(POPULATION_CACHE_KEY)})`;
}

export function usage() {
  return [
    "Usage: node APK/device-acceptance.mjs [--display] [--output <directory>]",
    "",
    "Requires an installed, debuggable CM Dev build. Run pnpm apk:emulator and",
    "pnpm apk:dev first. The default evidence directory is APK/.device-acceptance/.",
    "",
    "--display  also exercise light/dark and rotation on a physical device; these",
    "           checks run by default on an emulator and always restore prior state.",
    "--output   a new directory in which to write report.json, screenshots and logs.",
  ].join("\n");
}

function timestampId(now) {
  return now.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
}

export function defaultOutputDirectory(now = new Date(), pid = process.pid) {
  // build-apk.sh intentionally clears APK/.build from scratch. Device evidence
  // must survive the next build, so it has its own ignored sibling directory.
  return path.join(APK_DIR, ".device-acceptance", `${timestampId(now)}-${pid}`);
}

/** Parse CLI options without touching a device, so the safety contract is unit-testable. */
export function parseArgs(argv, { cwd = process.cwd(), now = new Date(), pid = process.pid } = {}) {
  let display = false;
  let output = null;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    // pnpm retains the conventional argument separator when it forwards
    // flags to this script (`pnpm apk:device -- --display`). Treat it as a
    // transparent delimiter rather than rejecting an otherwise valid run.
    if (argument === "--") {
      continue;
    } else if (argument === "--display") {
      display = true;
    } else if (argument === "--output") {
      const candidate = argv[++index];
      if (!candidate || candidate.startsWith("--")) throw new Error("--output requires a directory");
      output = path.resolve(cwd, candidate);
    } else if (argument === "--help" || argument === "-h") {
      help = true;
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
  }

  return {
    display,
    help,
    output: output ?? defaultOutputDirectory(now, pid),
  };
}

/** Android's command prints e.g. "Night mode: no". Unknown modes are not mutated. */
export function parseNightMode(value) {
  const match = String(value).match(/Night mode:\s*(yes|no|auto)\b/i);
  return match ? match[1].toLowerCase() : null;
}

/** Extract the small identity subset we need from `dumpsys package`. */
export function parsePackageInfo(value) {
  const versionName = String(value).match(/\bversionName=([^\s]+)/)?.[1] ?? null;
  const versionCode = Number(String(value).match(/\bversionCode=(\d+)/)?.[1]);
  return {
    versionName,
    versionCode: Number.isSafeInteger(versionCode) ? versionCode : null,
  };
}

export function routeHash(route) {
  return `#${route}`;
}

/** Judge UI population against the read-only client cache and observed Supabase responses. */
export function assessPopulationSnapshot(snapshot) {
  const route = snapshot?.route;
  const roster = route === "/roster";
  const headhunter = route === "/headhunter";
  const cache = snapshot?.cache;
  const supabase = snapshot?.supabase;
  const visibleCards = snapshot?.visibleCards;
  const rowCount = roster ? cache?.rosterRows : headhunter ? cache?.recruitRows : null;
  let message = null;

  if (!roster && !headhunter) message = `unsupported population route ${String(route)}`;
  else if (!snapshot?.routeReady) message = `${route} route did not become ready`;
  else if (snapshot?.routeHeading !== (roster ? "Roster" : "Headhunter")) message = `${route} rendered ${String(snapshot?.routeHeading ?? "no route heading")}`;
  else if (snapshot?.sourceStatus !== "DB") message = `${route} status pill is ${String(snapshot?.sourceStatus ?? "missing")}, expected DB`;
  else if (cache?.status !== "READ") message = `client dataset cache could not be read (${String(cache?.status ?? "missing")})`;
  else if (cache?.dataSource !== "SUPABASE") message = `client dataset source is ${String(cache?.dataSource ?? "missing")}, expected SUPABASE`;
  else if (!cache?.timestampPresent) message = "client dataset has no valid timestamp";
  else if (!Number.isInteger(rowCount) || rowCount < 0) message = `client dataset has no valid ${roster ? "roster" : "recruit"} row count`;
  else if (!Number.isInteger(visibleCards) || visibleCards < 0) message = "visible card count is invalid";
  else if (!Number.isInteger(supabase?.successful) || supabase.successful < 1) message = "no successful Supabase response was observed in this WebView";
  else if (roster && rowCount === 0) message = "Supabase-backed roster dataset is empty";
  else if (roster && visibleCards === 0) message = "roster dataset is populated but no roster cards rendered";
  else if (roster && visibleCards > rowCount) message = `rendered roster cards (${visibleCards}) exceed cached roster rows (${rowCount})`;
  else if (headhunter && rowCount === 0 && visibleCards !== 0) message = "recruit cards rendered while the Supabase-backed recruit dataset is empty";
  else if (headhunter && rowCount > 0 && visibleCards === 0) message = "recruit dataset is populated but no recruit cards rendered";
  else if (headhunter && visibleCards > Math.min(rowCount, 50)) message = `rendered recruit cards (${visibleCards}) exceed the dataset/top-50 window (${Math.min(rowCount, 50)})`;

  return {
    status: message ? "FAIL" : "PASS",
    message,
    route,
    datasetSource: cache?.dataSource ?? null,
    sourceStatus: snapshot?.sourceStatus ?? null,
    cachedRows: Number.isInteger(rowCount) ? rowCount : null,
    visibleCards: Number.isInteger(visibleCards) ? visibleCards : null,
    emptyRecruitment: headhunter && rowCount === 0 && visibleCards === 0,
    supabase: supabase && {
      total: Number.isInteger(supabase.total) ? supabase.total : 0,
      successful: Number.isInteger(supabase.successful) ? supabase.successful : 0,
      failed: Number.isInteger(supabase.failed) ? supabase.failed : 0,
      unknown: Number.isInteger(supabase.unknown) ? supabase.unknown : 0,
    },
  };
}

/** Physical devices are left visually untouched unless their operator opted in. */
export function shouldExerciseDisplay({ emulator, display }) {
  return Boolean(emulator || display);
}

/**
 * The Android WebView exposes the new media-query value before it dispatches
 * the query's `change` event. In automatic mode, wait for the app's listener
 * to reconcile the document as well, rather than treating that short
 * intermediate state as a product failure. Explicit user choices intentionally
 * do not follow the system setting.
 */
export function hasExpectedSystemTheme(snapshot, expectedDark) {
  const theme = snapshot?.theme;
  if (!theme || theme.prefersDark !== expectedDark) return false;

  // `useTheme` treats any value other than the two explicit choices as auto,
  // including a stale/invalid localStorage value.
  const followsSystem = theme.preference !== "light" && theme.preference !== "dark";
  return !followsSystem || theme.documentDark === expectedDark;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorOutput(error) {
  const pieces = [error.message];
  for (const stream of [error.stdout, error.stderr]) {
    const text = typeof stream === "string" ? stream : stream?.toString("utf8");
    if (text?.trim()) pieces.push(text.trim());
  }
  return [...new Set(pieces)].join("\n");
}

function command(binary, args, { timeout = COMMAND_TIMEOUT_MS } = {}) {
  try {
    return execFileSync(binary, args, {
      cwd: REPOSITORY_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 << 20,
      timeout,
    });
  } catch (error) {
    throw new Error(`${binary} ${args.join(" ")} failed:\n${errorOutput(error)}`);
  }
}

function adb(args, options) {
  return command("adb", args, options);
}

function apkDev(args, options) {
  return command(process.execPath, [APK_DEV, ...args], options);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createReport(output) {
  return {
    version: REPORT_VERSION,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: "RUNNING",
    command: "node APK/device-acceptance.mjs",
    evidenceDirectory: output,
    device: {},
    app: { package: DEV_PACKAGE },
    permissions: {},
    checks: [],
    artifacts: {},
    summary: {},
  };
}

function addCheck(report, name, status, details = {}) {
  const entry = { name, status, at: new Date().toISOString(), ...details };
  report.checks.push(entry);
  const message = entry.message ? `: ${entry.message}` : "";
  console.log(`[${status}] ${name}${message}`);
  return entry;
}

async function attempt(report, name, action, { status = "PASS" } = {}) {
  try {
    const details = await action();
    addCheck(report, name, status, details && typeof details === "object" ? details : { value: details });
    return { ok: true, details };
  } catch (error) {
    addCheck(report, name, "FAIL", { message: error instanceof Error ? error.message : String(error) });
    return { ok: false, error };
  }
}

function makeEvidenceDirectory(output) {
  if (existsSync(output)) throw new Error(`refusing to overwrite existing evidence directory: ${output}`);
  mkdirSync(output, { recursive: true });
}

function pageEval(expression) {
  const output = apkDev(["eval", expression]);
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`apk-dev eval returned non-JSON output: ${output.trim()} (${error})`);
  }
}

function pageSnapshot() {
  return pageEval(PAGE_SNAPSHOT_EXPRESSION);
}

async function waitForSnapshot(predicate, description, timeout = PAGE_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let latest = null;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      latest = pageSnapshot();
      if (predicate(latest)) return latest;
    } catch (error) {
      lastError = error;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  const evidence = latest ? JSON.stringify(latest) : lastError instanceof Error ? lastError.message : "no page snapshot";
  throw new Error(`${description} timed out after ${PAGE_TIMEOUT_MS}ms; last observation: ${evidence}`);
}

function takeScreenshot(report, output, name) {
  const target = path.join(output, `screen-${name}.png`);
  const observed = apkDev(["shot", target]).trim();
  assert(existsSync(target), `apk-dev reported a screenshot but did not create ${target}`);
  report.artifacts[`screen-${name}`] = target;
  return { path: target, commandOutput: observed };
}

function expectedTitle(title) {
  return `${title} | Clash Manager: Clan Manager for Clash Royale`;
}

async function navigateTo(route) {
  const hash = routeHash(route.path);
  pageEval(`(() => { location.hash = ${JSON.stringify(hash)}; return true; })()`);
  const snapshot = await waitForSnapshot(
    (candidate) => candidate.bridgePresent && candidate.readyState === "complete" && candidate.hash === hash && candidate.title === expectedTitle(route.title),
    `${route.title} route (${hash})`,
  );
  return snapshot;
}

function parseSafeArea(value) {
  assert(typeof value === "string", "bridge did not return safe-area JSON");
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`bridge returned invalid safe-area JSON: ${value}`);
  }
  for (const side of ["top", "right", "bottom", "left"]) {
    assert(Number.isFinite(parsed?.[side]) && parsed[side] >= 0, `safe-area ${side} is not a non-negative number`);
  }
  return parsed;
}

function readDeviceIdentity() {
  const serial = adb(["get-serialno"]).trim();
  assert(serial && serial !== "unknown", "adb did not return a connected device serial");
  const state = adb(["get-state"]).trim();
  assert(state === "device", `adb device state is ${state || "unknown"}`);

  // Lock later apk-dev subprocesses to the same target even if another device
  // attaches after the run starts. adb honors ANDROID_SERIAL itself.
  process.env.ANDROID_SERIAL = serial;

  const model = adb(["shell", "getprop", "ro.product.model"]).trim();
  const apiLevel = adb(["shell", "getprop", "ro.build.version.sdk"]).trim();
  const qemu = adb(["shell", "getprop", "ro.kernel.qemu"]).trim();
  return {
    serial,
    model: model || null,
    apiLevel: /^\d+$/.test(apiLevel) ? Number(apiLevel) : apiLevel || null,
    emulator: serial.startsWith("emulator-") || qemu === "1",
  };
}

function readDisplayState() {
  const night = parseNightMode(adb(["shell", "cmd", "uimode", "night"]));
  const accelerometerRaw = adb(["shell", "settings", "get", "system", "accelerometer_rotation"]).trim();
  const userRotationRaw = adb(["shell", "settings", "get", "system", "user_rotation"]).trim();
  const numeric = (value) => /^\d+$/.test(value) ? Number(value) : null;
  return {
    night,
    accelerometerRotation: numeric(accelerometerRaw),
    userRotation: numeric(userRotationRaw),
  };
}

function restoreDisplayState(state) {
  const restored = {};
  if (state.userRotation !== null) {
    adb(["shell", "settings", "put", "system", "user_rotation", String(state.userRotation)]);
    restored.userRotation = state.userRotation;
  }
  if (state.accelerometerRotation !== null) {
    adb(["shell", "settings", "put", "system", "accelerometer_rotation", String(state.accelerometerRotation)]);
    restored.accelerometerRotation = state.accelerometerRotation;
  }
  if (state.night) {
    adb(["shell", "cmd", "uimode", "night", state.night]);
    restored.night = state.night;
  }
  return restored;
}

function restorePendingDisplayState() {
  if (!pendingDisplayRestore) return null;
  const prior = pendingDisplayRestore;
  const restored = restoreDisplayState(prior);
  pendingDisplayRestore = null;
  return restored;
}

function installEmergencyDisplayRestore() {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      try {
        const restored = restorePendingDisplayState();
        if (restored) console.error(`Restored temporary display state after ${signal}.`);
      } catch (error) {
        console.error(`Could not restore temporary display state after ${signal}: ${error instanceof Error ? error.message : String(error)}`);
      }
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}

function currentPid() {
  return adb(["shell", "pidof", DEV_PACKAGE]).trim();
}

function packageInfo() {
  return parsePackageInfo(adb(["shell", "dumpsys", "package", DEV_PACKAGE]));
}

/**
 * Classify only evidence that this harness can attribute to CM Dev itself.
 *
 * `apk-dev logs` is already PID-filtered, but a WebView process still writes
 * benign Android, Chromium and emulator diagnostics at warning/error levels.
 * The source and console-record gates below make frontend health findings
 * precise enough to inform an acceptance result without treating that platform
 * noise as an app regression.
 */
export function assessProcessLogHealth(logs) {
  const lines = String(logs).split(/\r?\n/).filter(Boolean);
  const findings = [];

  const fatalAndroidLines = lines.filter((line) => FATAL_ANDROID_RUNTIME_MARKER.test(line));
  if (fatalAndroidLines.length > 0) {
    findings.push({
      id: "android-runtime-fatal",
      status: "FAIL",
      message: "fatal Android runtime marker found",
      occurrences: fatalAndroidLines.length,
      samples: fatalAndroidLines.slice(0, 3),
    });
  }

  const ownedFrontendConsoleLines = lines.filter((line) => (
    WEBVIEW_CONSOLE_MARKER.test(line) && CM_FRONTEND_CONSOLE_SOURCE.test(line)
  ));
  for (const rule of FRONTEND_LOG_HEALTH_RULES) {
    const matches = ownedFrontendConsoleLines.filter((line) => rule.pattern.test(line));
    if (matches.length === 0) continue;
    findings.push({
      id: rule.id,
      status: rule.status,
      message: rule.message,
      occurrences: matches.length,
      samples: matches.slice(0, 3),
    });
  }

  return {
    status: findings.some((finding) => finding.status === "FAIL")
      ? "FAIL"
      : findings.some((finding) => finding.status === "DEGRADED")
        ? "DEGRADED"
        : "PASS",
    lines: lines.length,
    findings,
  };
}

async function collectLogs(report, output) {
  const target = path.join(output, "cm-dev.log");
  try {
    const logs = apkDev(["logs"]);
    writeFileSync(target, logs);
    report.artifacts.logs = target;
    const health = assessProcessLogHealth(logs);
    const details = { path: target, lines: health.lines, findings: health.findings };
    if (health.status === "FAIL") {
      addCheck(report, "CM Dev process logs", "FAIL", {
        ...details,
        message: "fatal Android runtime or CM frontend bootstrap marker found",
      });
    } else if (health.status === "DEGRADED") {
      addCheck(report, "CM Dev process logs", "DEGRADED", {
        ...details,
        message: "CM frontend reported a nonfatal Realtime or sync health issue",
      });
    } else {
      addCheck(report, "CM Dev process logs", "PASS", details);
    }
  } catch (error) {
    addCheck(report, "CM Dev process logs", "DEGRADED", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function summarize(report) {
  const counts = Object.fromEntries(["PASS", "FAIL", "SKIPPED", "DEGRADED", "MISSING"].map((status) => [
    status,
    report.checks.filter((check) => check.status === status).length,
  ]));
  report.summary = counts;
  if (counts.FAIL > 0) return "FAIL";
  if (counts.DEGRADED > 0) return "PASS_WITH_DEGRADED_EVIDENCE";
  if (counts.MISSING > 0) return "PASS_WITH_PERMISSION_GAPS";
  return "PASS";
}

async function exerciseDisplay(report, options, device, output) {
  if (!shouldExerciseDisplay({ emulator: device.emulator, display: options.display })) {
    addCheck(report, "display checks", "SKIPPED", {
      message: "not changing a physical device; use --display to opt in",
    });
    return;
  }

  const stateResult = await attempt(report, "capture display state", () => readDisplayState());
  if (!stateResult.ok) return;
  const prior = stateResult.details;
  pendingDisplayRestore = prior;
  let restoreNeeded = false;

  try {
    if (prior.night) {
      restoreNeeded = true;
      await attempt(report, "system dark-mode propagation", async () => {
        adb(["shell", "cmd", "uimode", "night", "yes"]);
        const dark = await waitForSnapshot(
          (candidate) => hasExpectedSystemTheme(candidate, true),
          "dark-mode theme propagation",
        );
        const darkScreen = takeScreenshot(report, output, "theme-dark");

        adb(["shell", "cmd", "uimode", "night", "no"]);
        const light = await waitForSnapshot(
          (candidate) => hasExpectedSystemTheme(candidate, false),
          "light-mode theme propagation",
        );
        const lightScreen = takeScreenshot(report, output, "theme-light");
        return { priorMode: prior.night, dark, light, screenshots: [darkScreen.path, lightScreen.path] };
      });
    } else {
      addCheck(report, "system dark-mode propagation", "SKIPPED", {
        message: "Android did not report a restorable yes/no/auto night mode",
      });
    }

    if (prior.accelerometerRotation !== null && prior.userRotation !== null) {
      restoreNeeded = true;
      await attempt(report, "rotation is handled in place", async () => {
        const beforePid = currentPid();
        assert(beforePid, "CM Dev has no process before rotation");
        adb(["shell", "settings", "put", "system", "accelerometer_rotation", "0"]);
        adb(["shell", "settings", "put", "system", "user_rotation", "1"]);
        const landscape = await waitForSnapshot(
          (candidate) => candidate.bridgePresent && candidate.viewport.width > candidate.viewport.height,
          "landscape viewport",
        );
        const afterPid = currentPid();
        assert(afterPid === beforePid, `CM Dev process changed during rotation (${beforePid} -> ${afterPid || "none"})`);
        const screenshot = takeScreenshot(report, output, "rotation-landscape");
        return { beforePid, afterPid, landscape, screenshot: screenshot.path };
      });
    } else {
      addCheck(report, "rotation is handled in place", "SKIPPED", {
        message: "Android did not report both restorable rotation settings",
      });
    }
  } finally {
    if (restoreNeeded) {
      await attempt(report, "restore display state", () => ({ restored: restorePendingDisplayState(), prior }));
    } else {
      pendingDisplayRestore = null;
    }
  }
}

async function run(options, output) {
  const report = createReport(output);
  let device = null;

  try {
    const deviceResult = await attempt(report, "connected Android device", () => readDeviceIdentity());
    if (!deviceResult.ok) return report;
    device = deviceResult.details;
    report.device = device;

    const installed = await attempt(report, "CM Dev is installed", () => {
      const location = adb(["shell", "pm", "path", DEV_PACKAGE]).trim();
      assert(location.startsWith("package:"), `${DEV_PACKAGE} is not installed; run pnpm apk:dev first`);
      return { path: location };
    });
    if (!installed.ok) return report;

    const launch = await attempt(report, "safe CM Dev launch", () => ({ output: apkDev(["start"]).trim() }));
    if (!launch.ok) return report;

    const ready = await attempt(report, "WebView is inspectable and ready", () => waitForSnapshot(
      (candidate) => candidate.bridgePresent && candidate.readyState === "complete" && Boolean(candidate.title),
      "inspectable CM Dev page",
    ));
    if (!ready.ok) return report;

    const bridgeResult = await attempt(report, "native bridge is live", () => {
      const bridge = pageEval(BRIDGE_SNAPSHOT_EXPRESSION);
      assert(bridge.present, "window.AndroidBridge is absent");
      assert(bridge.type === "object", `typeof AndroidBridge is ${String(bridge.type)}, not object`);
      const missingMethods = BRIDGE_METHODS.filter((method) => !bridge.methods?.[method]);
      assert(missingMethods.length === 0, `bridge is missing: ${missingMethods.join(", ")}`);
      assert(bridge.wrapper === true, `isAndroidWrapper returned ${String(bridge.wrapper)}`);
      assert(typeof bridge.versionName === "string" && bridge.versionName.length > 0, "bridge returned no versionName");
      assert(Number.isSafeInteger(bridge.versionCode) && bridge.versionCode > 0, "bridge returned invalid versionCode");
      assert(Number.isSafeInteger(bridge.buildNumber) && bridge.buildNumber >= 0, "bridge returned invalid buildNumber");
      const safeArea = parseSafeArea(bridge.safeArea);
      const installedInfo = packageInfo();
      if (installedInfo.versionName) assert(bridge.versionName === installedInfo.versionName, `bridge versionName ${bridge.versionName} differs from package ${installedInfo.versionName}`);
      if (installedInfo.versionCode) assert(bridge.versionCode === installedInfo.versionCode, `bridge versionCode ${bridge.versionCode} differs from package ${installedInfo.versionCode}`);
      report.app = { ...report.app, ...installedInfo, pid: currentPid(), bridgeBuildNumber: bridge.buildNumber };
      report.permissions = {
        accessibility: {
          state: bridge.accessibilityActive ? "ACTIVE" : "MISSING",
          message: bridge.accessibilityActive ? "CM Dev accessibility service is active" : "A person must enable CM Dev Blitz in Android Accessibility before real Blitz taps can run.",
        },
        overlay: {
          state: bridge.overlayAllowed ? "GRANTED" : "MISSING",
          message: bridge.overlayAllowed ? "Display-over-other-apps is available" : "A person must enable Display over other apps before Blitz can draw its calibration overlay.",
        },
        packageInstalls: {
          state: bridge.packageInstallsAllowed ? "GRANTED" : "MISSING",
          message: bridge.packageInstallsAllowed ? "Android permits user-confirmed APK installs" : "APK updates will need Android's Allow from this source setting.",
        },
      };
      for (const [name, permission] of Object.entries(report.permissions)) {
        addCheck(report, `permission: ${name}`, permission.state === "MISSING" ? "MISSING" : "PASS", { message: permission.message });
      }
      return { ...bridge, safeArea, installedInfo };
    });
    if (!bridgeResult.ok) return report;

    for (const route of ROUTES) {
      const routeResult = await attempt(report, `route: ${route.path}`, () => navigateTo(route));
      if (routeResult.ok) {
        await attempt(report, `screenshot: ${route.path}`, () => takeScreenshot(report, output, route.path.slice(1)));
        if (route.path === "/roster" || route.path === "/headhunter") {
          await attempt(report, `populated Supabase client data: ${route.path}`, () => {
            const snapshot = pageEval(populationSnapshotExpression(route.path));
            const assessment = assessPopulationSnapshot(snapshot);
            if (assessment.status !== "PASS") {
              throw new Error(`${assessment.message}; observed ${JSON.stringify(assessment)}`);
            }
            return {
              ...assessment,
              cacheStatus: snapshot.cache?.status ?? null,
              routeReady: snapshot.routeReady === true,
              supabaseFailedResponses: snapshot.supabase?.failed ?? 0,
              supabaseUnknownResponses: snapshot.supabase?.unknown ?? 0,
            };
          });
        }
      }
    }

    // Establish an unambiguous page behind the native VIEW intent. This is
    // intentional: one Android Back must return to this page rather than Home.
    const roster = ROUTES[0];
    const baseResult = await attempt(report, "deep-link Back baseline", () => navigateTo(roster));
    if (baseResult.ok) {
      const deepLinkResult = await attempt(report, "HTTPS deep link reaches Headhunter", async () => {
        const target = "https://albidr.github.io/Clash-Manager/#/headhunter";
        const outputText = adb([
          "shell", "am", "start", "-W",
          "-a", "android.intent.action.VIEW",
          "-c", "android.intent.category.BROWSABLE",
          "-d", target,
          "-n", ACTIVITY,
        ]).trim();
        const snapshot = await waitForSnapshot(
          (candidate) => candidate.bridgePresent && candidate.hash === "#/headhunter" && candidate.title === expectedTitle("Headhunter"),
          "Headhunter after HTTPS deep link",
        );
        return { target, output: outputText, snapshot };
      });
      if (deepLinkResult.ok) {
        await attempt(report, "screenshot: HTTPS deep link", () => takeScreenshot(report, output, "deep-link-headhunter"));
        await attempt(report, "Android Back returns through WebView history", async () => {
          adb(["shell", "input", "keyevent", "4"]);
          return waitForSnapshot(
            (candidate) => candidate.bridgePresent && candidate.hash === "#/roster" && candidate.title === expectedTitle("Roster"),
            "Roster after Android Back",
          );
        });
      }
    }

    // Return to a predictable, visible route before exercising display events.
    await attempt(report, "display-check baseline route", () => navigateTo(roster));
    if (device) await exerciseDisplay(report, options, device, output);
  } catch (error) {
    // This protects report writing from an unforeseen scripting error. Individual
    // checks already preserve their own error details and let later checks run.
    addCheck(report, "acceptance harness", "FAIL", { message: error instanceof Error ? error.message : String(error) });
  } finally {
    await collectLogs(report, output);
  }

  return report;
}

function finish(report, output) {
  report.finishedAt = new Date().toISOString();
  report.result = summarize(report);
  const reportPath = path.join(output, "report.json");
  report.artifacts.report = reportPath;
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${report.result}: ${report.summary.PASS} passed, ${report.summary.FAIL} failed, ${report.summary.MISSING} permission gap(s), ${report.summary.DEGRADED} degraded evidence item(s)`);
  console.log(`Evidence: ${output}`);
  return report.result === "FAIL" ? 1 : 0;
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
    return 2;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }

  try {
    makeEvidenceDirectory(options.output);
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  installEmergencyDisplayRestore();
  const report = await run(options, options.output);
  return finish(report, options.output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
