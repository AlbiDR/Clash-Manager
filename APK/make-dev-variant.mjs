#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * make-dev-variant.mjs - turns a COPY of APK/android into "CM Dev", a build that
 * installs next to the real app and can be inspected.
 *
 * WHY: the release APK is not debuggable and loads one hardcoded URL, so its
 * WebView could never be inspected and nothing but production could be loaded
 * into it. A debug build under the same package id cannot even be installed
 * over the real app (the signatures differ) without uninstalling it first,
 * which would wipe the owner's data and Blitz calibration. So the dev variant
 * gets its own package id and everything Android keys on it: the signature
 * permission, both provider authorities and the accessibility service label.
 * The Java is untouched: the dev build runs exactly the classes.dex that ships.
 *
 *   node APK/make-dev-variant.mjs <copy-of-android-dir> [pwa-url]
 *
 * pwa-url defaults to the production PWA, which checks the native layer
 * against the real app. Pass the local dev server's URL (reached from the phone
 * through `adb reverse`) to test unreleased PWA code inside the wrapper.
 *
 * Never run this on APK/android itself: verify-apk-integrity.mjs fails any
 * release build that is debuggable, allows cleartext, or has another package id.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_PACKAGE = "com.albidr.clashmanager";
export const DEV_PACKAGE = `${RELEASE_PACKAGE}.dev`;
export const DEV_LABEL = "CM Dev";

/** Replaces exactly `count` occurrences, so a manifest change upstream fails loudly instead of half-applying. */
function replaceExactly(text, from, to, count, what) {
  const found = text.split(from).length - 1;
  if (found !== count) throw new Error(`${what}: expected ${count} occurrence(s) of ${JSON.stringify(from)}, found ${found}`);
  return text.split(from).join(to);
}

function setString(xml, name, value) {
  const pattern = new RegExp(`(<string name="${name}">)[^<]*(</string>)`);
  if (!pattern.test(xml)) throw new Error(`strings.xml has no string '${name}'`);
  const escaped = value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return xml.replace(pattern, `$1${escaped}$2`);
}

export function devManifest(manifest) {
  let out = manifest;
  out = replaceExactly(out, `package="${RELEASE_PACKAGE}"`, `package="${DEV_PACKAGE}"`, 1, "package id");
  out = replaceExactly(
    out,
    `${RELEASE_PACKAGE}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
    `${DEV_PACKAGE}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
    2,
    "signature permission",
  );
  out = replaceExactly(out, `android:authorities="${RELEASE_PACKAGE}.`, `android:authorities="${DEV_PACKAGE}.`, 2, "provider authorities");
  // The dev server is plain http on localhost; release keeps cleartext banned.
  out = replaceExactly(out, 'android:usesCleartextTraffic="false"', 'android:usesCleartextTraffic="true"', 1, "cleartext");
  // MainActivity turns on WebView remote debugging only when this flag is set.
  out = replaceExactly(out, "<application ", '<application android:debuggable="true" ', 1, "debuggable");
  out = replaceExactly(out, 'android:label="Clash Manager Blitz"', `android:label="${DEV_LABEL} Blitz"`, 1, "accessibility label");
  return out;
}

/** Launcher shortcuts name their target package; left alone they would open the real app. */
export function devShortcuts(shortcuts) {
  return replaceExactly(shortcuts, `android:targetPackage="${RELEASE_PACKAGE}"`, `android:targetPackage="${DEV_PACKAGE}"`, 3, "shortcut targets");
}

export function devStrings(strings, pwaUrl) {
  const scope = new URL(pwaUrl);
  scope.hash = "";
  const launch = new URL(pwaUrl);
  if (!launch.hash) launch.hash = "#/roster";
  let out = strings;
  out = setString(out, "appName", DEV_LABEL);
  out = setString(out, "launcherName", DEV_LABEL);
  out = setString(out, "hostName", scope.hostname);
  out = setString(out, "fullScopeUrl", scope.toString());
  out = setString(out, "launchUrl", launch.toString());
  out = setString(out, "providerAuthority", `${DEV_PACKAGE}.fileprovider`);
  return out;
}

/** The production PWA, read from the release strings so it is never restated here. */
export function releaseScopeUrl(strings) {
  const match = strings.match(/<string name="fullScopeUrl">([^<]+)<\/string>/);
  if (!match) throw new Error("strings.xml has no fullScopeUrl");
  return match[1];
}

function main() {
  const [, , dir, url] = process.argv;
  if (!dir) {
    console.error("usage: make-dev-variant.mjs <copy-of-android-dir> [pwa-url]");
    process.exit(2);
  }
  if (path.resolve(dir) === path.resolve(path.dirname(fileURLToPath(import.meta.url)), "android")) {
    console.error("✗ refusing to rewrite APK/android itself; pass a copy");
    process.exit(2);
  }
  const manifestPath = path.join(dir, "AndroidManifest.xml");
  const stringsPath = path.join(dir, "res", "values", "strings.xml");
  const strings = readFileSync(stringsPath, "utf8");
  const pwaUrl = url || releaseScopeUrl(strings);
  writeFileSync(manifestPath, devManifest(readFileSync(manifestPath, "utf8")));
  const shortcutsPath = path.join(dir, "res", "xml", "shortcuts.xml");
  writeFileSync(shortcutsPath, devShortcuts(readFileSync(shortcutsPath, "utf8")));
  writeFileSync(stringsPath, devStrings(strings, pwaUrl));
  console.log(`✓ dev variant: ${DEV_PACKAGE}, debuggable, loading ${pwaUrl}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
