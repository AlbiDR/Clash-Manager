#!/usr/bin/env node
/**
 * verify-apk-integrity.mjs — release gate that FAILS if an APK is missing the
 * custom native layer.
 *
 * WHY: the Clash Manager APK is NOT a plain TWA. It carries a custom Kotlin
 * native layer (Blitz overlay service, accessibility tap-gesture service, and a
 * WebView JS bridge) that exists ONLY as compiled code in the release APK.
 * A generic `bubblewrap build` (or any rebuild from the decoy project) silently
 * produces a stripped app. This script makes that failure LOUD and automatic:
 * it inspects a built APK and exits non-zero unless every custom component is
 * present, so a stripped build can never pass CI or a release script.
 *
 *   node verify-apk-integrity.mjs [path/to.apk]      # default: ./clashmanager.apk
 *
 * Requires: aapt2 (Android build-tools) + unzip on PATH. aapt2 is auto-located
 * under ~/.bubblewrap/android_sdk or $ANDROID_HOME/$ANDROID_SDK_ROOT, or set
 * AAPT2=/abs/path/to/aapt2.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const APK = process.argv[2] || "clashmanager.apk";

// ---- Verified expectations (recovered from the V4 APK; see android/README.md)
const EXPECT = {
  packageName: "com.albidr.clashmanager",
  // Custom manifest components that MUST survive every rebuild.
  components: [
    "com.albidr.clashmanager.BlitzService",
    "com.albidr.clashmanager.ClashManagerAccessibilityService",
    "com.albidr.clashmanager.MainActivity",
    "com.albidr.clashmanager.Application",
  ],
  permissions: [
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
  ],
  // The accessibility service is only functional with this intent-filter.
  accessibilityIntent: "android.accessibilityservice.AccessibilityService",
  // The JS<->native bridge methods the PWA depends on (compiled into the dex).
  bridgeMethods: [
    "startBlitz",
    "saveCoordinates",
    "getCoordinates",
    "isAccessibilityActive",
    "openAccessibilitySettings",
    "openPlayerProfile",
    "openExternalUrl",
  ],
};

function findAapt2() {
  if (process.env.AAPT2 && existsSync(process.env.AAPT2)) return process.env.AAPT2;
  const roots = [
    path.join(os.homedir(), ".bubblewrap/android_sdk/build-tools"),
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, "build-tools"),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, "build-tools"),
    path.join(os.homedir(), "Library/Android/sdk/build-tools"),
  ].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const versions = readdirSync(root).sort().reverse();
    for (const v of versions) {
      const cand = path.join(root, v, "aapt2");
      if (existsSync(cand)) return cand;
    }
  }
  return null;
}

const fail = (msg) => { console.error(`\x1b[31m✗ ${msg}\x1b[0m`); };
const ok = (msg) => { console.log(`\x1b[32m✓ ${msg}\x1b[0m`); };

function main() {
  if (!existsSync(APK)) {
    console.error(`APK not found: ${APK}`);
    process.exit(2);
  }
  const aapt2 = findAapt2();
  if (!aapt2) {
    console.error("aapt2 not found. Set AAPT2=/path/to/aapt2 (Android build-tools).");
    process.exit(2);
  }

  const badging = execSync(`"${aapt2}" dump badging "${APK}"`, { encoding: "utf8", maxBuffer: 64 << 20 });
  const manifest = execSync(`"${aapt2}" dump xmltree "${APK}" --file AndroidManifest.xml`, { encoding: "utf8", maxBuffer: 64 << 20 });
  // dex method-name strings (covers single + multidex)
  let dexStrings = "";
  try {
    dexStrings = execSync(`unzip -p "${APK}" 'classes*.dex' | strings`, { encoding: "utf8", maxBuffer: 256 << 20, shell: "/bin/bash" });
  } catch { /* strings/unzip may warn; ignore */ }

  const problems = [];

  const pkg = (badging.match(/package: name='([^']+)'/) || [])[1];
  if (pkg === EXPECT.packageName) ok(`package ${pkg}`);
  else { fail(`package is '${pkg}', expected '${EXPECT.packageName}'`); problems.push("package"); }

  const version = (badging.match(/versionCode='(\d+)' versionName='([^']*)'/) || []);
  if (version[1]) ok(`version ${version[2]} (code ${version[1]})`);

  for (const c of EXPECT.components) {
    if (manifest.includes(`"${c}"`)) ok(`component ${c}`);
    else { fail(`MISSING component ${c}`); problems.push(c); }
  }
  for (const p of EXPECT.permissions) {
    if (badging.includes(`'${p}'`) || manifest.includes(`"${p}"`)) ok(`permission ${p}`);
    else { fail(`MISSING permission ${p}`); problems.push(p); }
  }
  if (manifest.includes(EXPECT.accessibilityIntent)) ok("accessibility intent-filter");
  else { fail("MISSING accessibility intent-filter"); problems.push("a11y-intent"); }

  if (dexStrings) {
    for (const m of EXPECT.bridgeMethods) {
      if (dexStrings.includes(m)) ok(`bridge method ${m}()`);
      else { fail(`MISSING bridge method ${m}()`); problems.push(`bridge:${m}`); }
    }
  } else {
    console.warn("⚠ could not read dex strings (unzip/strings unavailable) — skipped bridge-method check");
  }

  console.log("");
  if (problems.length === 0) {
    console.log(`\x1b[32m\x1b[1mPASS\x1b[0m — ${path.basename(APK)} contains the full custom native layer. Safe to ship.`);
    process.exit(0);
  }
  console.error(`\x1b[31m\x1b[1mFAIL\x1b[0m — ${problems.length} missing element(s): ${problems.join(", ")}`);
  console.error("This APK is STRIPPED of custom functionality. Do NOT ship it.");
  console.error("Build the release with `pnpm apk:build` (from android/), not `bubblewrap build`.");
  process.exit(1);
}

main();
