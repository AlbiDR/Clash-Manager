// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLITZ_SOURCE = readFileSync(
  path.join(REPOSITORY_DIR, "APK/src/com/albidr/clashmanager/BlitzService.java"),
  "utf8",
);
const THEME_SOURCE = readFileSync(
  path.join(REPOSITORY_DIR, "Frontend-PWA/src/core/theme/tokens.ts"),
  "utf8",
);

function readJavaString(name) {
  const match = BLITZ_SOURCE.match(
    new RegExp(`static\\s+final\\s+String\\s+${name}\\s*=\\s*["']([^"']+)["']`),
  );
  return match?.[1] ?? null;
}

function readDarkThemeColor(name) {
  const darkTheme = THEME_SOURCE.match(
    /export const darkTokens:[\s\S]*?color:\s*\{([\s\S]*?)\n\s*\},\n\s*elevation:/,
  )?.[1];
  assert.ok(darkTheme, "darkTokens.color must remain statically inspectable");
  const match = darkTheme.match(new RegExp(`\\b${name}:\\s*["']([^"']+)["']`));
  return match?.[1] ?? null;
}

test("native Blitz overlay colors mirror canonical dark-theme roles", () => {
  const roles = [
    ["COLOR_PRIMARY", "primary"],
    ["COLOR_ON_PRIMARY", "onPrimary"],
    ["COLOR_ERROR", "error"],
    ["COLOR_ON_ERROR", "onError"],
    ["COLOR_SURFACE_CONTAINER_LOW", "surfaceContainerLow"],
    ["COLOR_SURFACE_CONTAINER", "surfaceContainer"],
    ["COLOR_ON_SURFACE", "onSurface"],
    ["COLOR_ON_SURFACE_VARIANT", "onSurfaceVariant"],
    ["COLOR_OUTLINE_VARIANT", "outlineVariant"],
  ];

  for (const [javaName, tokenName] of roles) {
    assert.equal(
      readJavaString(javaName),
      readDarkThemeColor(tokenName),
      `${javaName} must mirror darkTokens.color.${tokenName}`,
    );
  }
});

test("overlay placement derives from WindowInsets and named geometry", () => {
  assert.match(BLITZ_SOURCE, /getCurrentWindowMetrics\(\)\.getWindowInsets\(\)/);
  assert.match(BLITZ_SOURCE, /getInsetsIgnoringVisibility\(/);
  assert.match(BLITZ_SOURCE, /WindowInsets\.Type\.systemBars\(\)/);
  assert.match(BLITZ_SOURCE, /WindowInsets\.Type\.displayCutout\(\)/);
  assert.match(BLITZ_SOURCE, /BLITZ_SETUP_EDGE_MARGIN_DP/);
  assert.match(BLITZ_SOURCE, /MIN_TOUCH_TARGET_DP/);
  assert.match(BLITZ_SOURCE, /ACCESSIBILITY_MOVE_STEP_DP/);
  assert.doesNotMatch(BLITZ_SOURCE, /WAITING_PANEL_EDGE_OFFSET_DP/);
  assert.doesNotMatch(BLITZ_SOURCE, /dm\.density\s*\*\s*40\.0f/);
});

test("rotation reflows every active Blitz overlay", () => {
  assert.match(BLITZ_SOURCE, /onConfigurationChanged[\s\S]*?post\(this::reflowBlitzOverlays\)/);
  assert.match(BLITZ_SOURCE, /reflowBlitzOverlays[\s\S]*?positionBlitzMarker/);
  assert.match(BLITZ_SOURCE, /reflowBlitzOverlays[\s\S]*?positionBlitzSetupPanel/);
  assert.match(BLITZ_SOURCE, /reflowBlitzOverlays[\s\S]*?reflowBlitzRunningPill/);
  assert.match(BLITZ_SOURCE, /calculateBlitzPillHorizontalOffset/);
  assert.match(BLITZ_SOURCE, /calculateBlitzPillVerticalOffset/);
});

test("dynamic controls expose stable ids, descriptions and non-drag movement actions", () => {
  const stableControlIds = [
    "VIEW_ID_BLITZ_INVITE_MARKER",
    "VIEW_ID_BLITZ_CLOSE_MARKER",
    "VIEW_ID_BLITZ_EDIT_BUTTON",
    "VIEW_ID_BLITZ_CANCEL_BUTTON",
    "VIEW_ID_BLITZ_START_BUTTON",
    "VIEW_ID_BLITZ_DWELL_SLIDER",
    "VIEW_ID_BLITZ_RUNNING_PILL",
    "VIEW_ID_BLITZ_STOP_BUTTON",
  ];
  for (const id of stableControlIds) {
    assert.match(BLITZ_SOURCE, new RegExp(`setId\\(${id}\\)|createDraggableMarker\\([\\s\\S]*?${id}`));
  }

  assert.match(BLITZ_SOURCE, /setContentDescription\("Cancel Blitz"\)/);
  assert.match(BLITZ_SOURCE, /setContentDescription\("Start Blitz for "/);
  assert.match(BLITZ_SOURCE, /setContentDescription\("Stop Blitz"\)/);
  assert.match(BLITZ_SOURCE, /installBlitzMovementActions\(markerLayout, true\)/);
  assert.match(BLITZ_SOURCE, /installBlitzMovementActions\(pill, false\)/);
  assert.match(BLITZ_SOURCE, /ACTION_ID_BLITZ_MOVE_LEFT/);
  assert.match(BLITZ_SOURCE, /ACTION_ID_BLITZ_MOVE_RIGHT/);
  assert.match(BLITZ_SOURCE, /ACTION_ID_BLITZ_MOVE_UP/);
  assert.match(BLITZ_SOURCE, /ACTION_ID_BLITZ_MOVE_DOWN/);
});

test("new native helper names retain verb plus Blitz domain nouns", () => {
  const expectedHelpers = [
    "deriveMarkerCalibration",
    "reflowBlitzOverlays",
    "positionBlitzSetupPanel",
    "positionBlitzMarker",
    "applyColorAlpha",
    "haltBlitzRun",
    "requestBlitzStop",
    "isBlitzRunStateActive",
    "isBlitzRunActive",
  ];
  for (const helper of expectedHelpers) {
    assert.match(BLITZ_SOURCE, new RegExp(`\\b${helper}\\s*\\(`));
  }
  assert.doesNotMatch(
    BLITZ_SOURCE,
    /\b(?:calibrationFromMarkers|reflowMarkersForCurrentDisplay|positionWaitingPanel|withAlpha|haltRunNow|requestStop|isRunStateActive|isRunActive)\s*\(/,
  );
});
