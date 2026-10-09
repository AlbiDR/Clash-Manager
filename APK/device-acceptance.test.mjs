// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assessPopulationSnapshot,
  assessProcessLogHealth,
  defaultOutputDirectory,
  hasExpectedSystemTheme,
  parseArgs,
  parseNightMode,
  parsePackageInfo,
  routeHash,
  shouldExerciseDisplay,
} from "./device-acceptance.mjs";

function populationSnapshot(overrides = {}) {
  return {
    route: "/roster",
    routeReady: true,
    routeHeading: "Roster",
    sourceStatus: "DB",
    visibleCards: 48,
    cache: {
      status: "READ",
      rosterRows: 48,
      recruitRows: 250,
      dataSource: "SUPABASE",
      timestampPresent: true,
    },
    supabase: { total: 45, successful: 45, failed: 0 },
    ...overrides,
  };
}

test("population acceptance requires rendered roster and a Supabase-backed client dataset", () => {
  const result = assessPopulationSnapshot(populationSnapshot());
  assert.equal(result.status, "PASS");
  assert.equal(result.datasetSource, "SUPABASE");

  assert.equal(assessPopulationSnapshot(populationSnapshot({ visibleCards: 0 })).status, "FAIL");
  assert.equal(assessPopulationSnapshot(populationSnapshot({
    cache: { ...populationSnapshot().cache, rosterRows: 0 },
  })).status, "FAIL");
  assert.equal(assessPopulationSnapshot(populationSnapshot({
    cache: { ...populationSnapshot().cache, dataSource: "LOCAL" },
  })).status, "FAIL");
  assert.equal(assessPopulationSnapshot(populationSnapshot({
    cache: { ...populationSnapshot().cache, timestampPresent: false },
  })).status, "FAIL");
  assert.equal(assessPopulationSnapshot(populationSnapshot({ sourceStatus: "SYNCING" })).status, "FAIL");
  assert.equal(assessPopulationSnapshot(populationSnapshot({
    supabase: { total: 2, successful: 0, failed: 2 },
  })).status, "FAIL");
});

test("population acceptance allows genuinely empty recruitment and the documented top-50 window", () => {
  const cache = populationSnapshot().cache;
  const empty = assessPopulationSnapshot(populationSnapshot({
    route: "/headhunter",
    routeHeading: "Headhunter",
    visibleCards: 0,
    cache: { ...cache, recruitRows: 0 },
  }));
  assert.equal(empty.status, "PASS");
  assert.equal(empty.emptyRecruitment, true);

  const top50 = assessPopulationSnapshot(populationSnapshot({
    route: "/headhunter",
    routeHeading: "Headhunter",
    visibleCards: 50,
  }));
  assert.equal(top50.status, "PASS");
  assert.equal(top50.visibleCards, 50);

  assert.equal(assessPopulationSnapshot(populationSnapshot({
    route: "/headhunter",
    routeHeading: "Headhunter",
    visibleCards: 0,
  })).status, "FAIL");
  assert.equal(assessPopulationSnapshot(populationSnapshot({
    route: "/headhunter",
    routeHeading: "Headhunter",
    visibleCards: 51,
  })).status, "FAIL");
  assert.equal(assessPopulationSnapshot(populationSnapshot({
    route: "/headhunter",
    routeHeading: "Headhunter",
    visibleCards: 3,
    cache: { ...cache, recruitRows: 0 },
  })).status, "FAIL");
});

test("population acceptance reports unreadable, missing, and inconsistent client cache as failures", () => {
  const base = populationSnapshot();
  assert.equal(assessPopulationSnapshot(populationSnapshot({ cache: { status: "ERROR", message: "blocked" } })).status, "FAIL");
  assert.equal(assessPopulationSnapshot(populationSnapshot({ cache: null })).status, "FAIL");
  assert.equal(assessPopulationSnapshot(populationSnapshot({ routeReady: false })).status, "FAIL");
  assert.equal(assessPopulationSnapshot(populationSnapshot({ routeHeading: "Headhunter" })).status, "FAIL");
  assert.equal(assessPopulationSnapshot(populationSnapshot({ sourceStatus: "LOCAL" })).status, "FAIL");
  assert.equal(assessPopulationSnapshot(populationSnapshot({ visibleCards: 49 })).status, "FAIL");
  assert.ok(base.cache.rosterRows > 0);
});

test("device acceptance options default to a new ignored evidence directory", () => {
  const output = defaultOutputDirectory(new Date("2026-10-04T12:34:56.789Z"), 4321);
  assert.match(output, /APK\/\.device-acceptance\/2026-10-04T12-34-56Z-4321$/);

  const parsed = parseArgs(["--display", "--output", "evidence"], {
    cwd: "/tmp/cm-device-test",
    now: new Date("2026-10-04T12:34:56.789Z"),
    pid: 4321,
  });
  assert.deepEqual(parsed, {
    display: true,
    help: false,
    output: "/tmp/cm-device-test/evidence",
  });
});

test("device acceptance rejects ambiguous command-line inputs", () => {
  assert.throws(() => parseArgs(["--output"]), /requires a directory/);
  assert.throws(() => parseArgs(["--unknown"]), /unknown option/);
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["--", "--help"]).help, true);
});

test("Android display and package output are parsed conservatively", () => {
  assert.equal(parseNightMode("Night mode: yes\n"), "yes");
  assert.equal(parseNightMode("Night mode: auto\n"), "auto");
  assert.equal(parseNightMode("Night mode: custom"), null);

  assert.deepEqual(
    parsePackageInfo("Packages:\n  versionCode=14050135 minSdk=34\n  versionName=14.50.135\n"),
    { versionName: "14.50.135", versionCode: 14050135 },
  );
  assert.deepEqual(parsePackageInfo("no package metadata"), { versionName: null, versionCode: null });
});

test("display mutation is automatic only for emulators", () => {
  assert.equal(shouldExerciseDisplay({ emulator: true, display: false }), true);
  assert.equal(shouldExerciseDisplay({ emulator: false, display: false }), false);
  assert.equal(shouldExerciseDisplay({ emulator: false, display: true }), true);
  assert.equal(routeHash("/headhunter"), "#/headhunter");
});

test("automatic system-theme checks wait for the document to settle after the media query changes", () => {
  const snapshot = (preference, prefersDark, documentDark) => ({
    theme: { preference, prefersDark, documentDark },
  });

  // Android WebView can publish the media-query match before it delivers the
  // `change` callback which makes the app add/remove `.dark`.
  assert.equal(hasExpectedSystemTheme(snapshot("auto", true, false), true), false);
  assert.equal(hasExpectedSystemTheme(snapshot("auto", true, true), true), true);
  assert.equal(hasExpectedSystemTheme(snapshot("auto", false, true), false), false);
  assert.equal(hasExpectedSystemTheme(snapshot("auto", false, false), false), true);

  // Explicit preferences correctly resist an OS mode change. Invalid stored
  // values fall back to automatic behavior in the app and are checked as such.
  assert.equal(hasExpectedSystemTheme(snapshot("dark", false, true), false), true);
  assert.equal(hasExpectedSystemTheme(snapshot("light", true, false), true), true);
  assert.equal(hasExpectedSystemTheme(snapshot("invalid", true, false), true), false);
  assert.equal(hasExpectedSystemTheme({}, true), false);
});

function cmConsole(message, source = "https://albidr.github.io/Clash-Manager/assets/core-logic.js") {
  return `10-04 00:11:26.593 I/chromium( 9087): [INFO:CONSOLE(2)] "${message}", source: ${source} (2)`;
}

test("process-log health reports explicit owned Realtime and sync failures as degraded evidence", () => {
  const health = assessProcessLogHealth([
    cmConsole("[Realtime] Failed to initialize subscription: Error: cannot add callbacks after subscribe()."),
    cmConsole("[Realtime] Subscription error: TIMED_OUT"),
    cmConsole("[Sync] Cache hydration failed: IndexedDB read failed", "http://localhost:5173/Clash-Manager/src/core/services/useClashSync.ts"),
    cmConsole("[Sync] Remote sync failed (Attempt 2): Could not reach the server"),
  ].join("\n"));

  assert.equal(health.status, "DEGRADED");
  assert.deepEqual(
    health.findings.map(({ id, status, occurrences }) => ({ id, status, occurrences })),
    [
      { id: "realtime-subscription-initialization", status: "DEGRADED", occurrences: 1 },
      { id: "realtime-subscription-runtime", status: "DEGRADED", occurrences: 1 },
      { id: "sync-cache-hydration", status: "DEGRADED", occurrences: 1 },
      { id: "sync-remote-failure", status: "DEGRADED", occurrences: 1 },
    ],
  );
});

test("process-log health fails when the saved dataset is rejected during local cache validation", () => {
  const health = assessProcessLogHealth(cmConsole("[Sync] Local cache validation failed: invalid row count"));
  assert.equal(health.status, "FAIL");
  assert.equal(health.findings[0]?.id, "sync-cache-validation");
});

test("process-log health ignores expected platform noise and lookalike messages outside CM frontend console output", () => {
  const health = assessProcessLogHealth([
    "10-04 00:10:51.120 E/MESA    ( 9087): Failed to open rendernode: No such file or directory",
    "10-04 00:10:50.990 E/chromium( 9087): [1004/001050.990065:ERROR:variations_seed_loader.cc(39)] Seed missing signature.",
    cmConsole("[Realtime] Failed to initialize subscription: not ours", "https://example.invalid/other-app.js"),
    "10-04 00:11:26.593 I/chromium( 9087): [INFO:CONSOLE(2)] \"[Sync] Cache hydration failed: not a WebView source record\"",
  ].join("\n"));

  assert.equal(health.status, "PASS");
  assert.deepEqual(health.findings, []);
});

test("process-log health preserves fatal Android and CM frontend boot failures as failures", () => {
  const androidFatal = assessProcessLogHealth("10-04 00:12:00.000 E/AndroidRuntime( 9087): FATAL EXCEPTION: main");
  assert.equal(androidFatal.status, "FAIL");
  assert.equal(androidFatal.findings[0]?.id, "android-runtime-fatal");

  const frontendFatal = assessProcessLogHealth(cmConsole("FATAL ERROR: Error: app boot failed"));
  assert.equal(frontendFatal.status, "FAIL");
  assert.equal(frontendFatal.findings[0]?.id, "frontend-boot-failure");
});

test("the harness is structurally incapable of changing security permissions or using UI dumps", () => {
  const script = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "device-acceptance.mjs"), "utf8");

  assert.match(script, /apk-dev\.mjs/);
  assert.match(script, /\["shell", "input", "keyevent", "4"\]/);
  assert.doesNotMatch(script, /\["shell", "am", "force-stop"\]/);
  assert.doesNotMatch(script, /\["shell", "pm", "grant"\]/);
  assert.doesNotMatch(script, /\["shell", "pm", "revoke"\]/);
  assert.doesNotMatch(script, /\["shell", "settings", "put", "secure"\]/);
  assert.doesNotMatch(script, /\["shell", "uiautomator"\]/);
  assert.doesNotMatch(script, /openPlayerProfile\(/);
  assert.doesNotMatch(script, /startBlitz\(/);
});
