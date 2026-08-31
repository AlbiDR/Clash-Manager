#!/usr/bin/env node
/**
 * verify-apk-integrity.mjs - release gate that FAILS if an APK is missing the
 * custom native layer.
 *
 * WHY: the Clash Manager APK is NOT a plain TWA. It carries a custom Java
 * native layer (Blitz overlay service, accessibility tap-gesture service, and a
 * WebView JS bridge), authored in APK/src/com/albidr/clashmanager/ and compiled
 * into android/classes.dex via build-apk.sh.
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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { androidVersionCode } from "../.github/scripts/android/android-version-code.mjs";

let defaultApk = "clashmanager.apk";
if (!process.argv[2]) {
  try {
    let packageVersion = null;
    const pkgPath = path.join(process.cwd(), "package.json");
    if (existsSync(pkgPath)) {
      packageVersion = JSON.parse(readFileSync(pkgPath, "utf8")).version;
    }

    // latest.json (written by apk-release.yml) names the current release file
    // exactly - it carries a `+<buildNumber>` suffix that a plain
    // `clashmanager-v<version>.apk` guess can no longer find.
    const latestJsonPath = path.join(process.cwd(), "APK/release/latest.json");
    if (existsSync(latestJsonPath)) {
      const latest = JSON.parse(readFileSync(latestJsonPath, "utf8"));
      const namedApk = `APK/release/${latest.filename}`;
      if (
        latest.filename &&
        latest.version === packageVersion &&
        existsSync(path.join(process.cwd(), namedApk))
      ) {
        defaultApk = namedApk;
      }
    }
    if (defaultApk === "clashmanager.apk") {
      if (packageVersion) {
        const versionedApk = `APK/release/clashmanager-v${packageVersion}.apk`;
        if (existsSync(path.join(process.cwd(), versionedApk))) {
          defaultApk = versionedApk;
        } else {
          const unsignedApk = "APK/release/clashmanager-unsigned.apk";
          if (existsSync(path.join(process.cwd(), unsignedApk))) {
            defaultApk = unsignedApk;
          }
        }
      }
    }
  } catch (e) {
    // Ignore and fallback
  }
}

const APK = process.argv[2] || defaultApk;

// Hard timeout per child process: prevents aapt2 or unzip from hanging the pipeline.
const EXEC_TIMEOUT_MS = 120_000;

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
    "android.permission.REQUEST_INSTALL_PACKAGES",
  ],
  // The accessibility service is only functional with this intent-filter.
  accessibilityIntent: "android.accessibilityservice.AccessibilityService",
  // The JS<->native bridge methods the PWA depends on (compiled into the dex).
  bridgeMethods: [
    "startBlitz",
    "saveCoordinates",
    "getCoordinates",
    "isAccessibilityActive",
    "hasOverlayPermission",
    "canRequestPackageInstalls",
    "openPackageInstallSettings",
    "openAccessibilitySettings",
    "openOverlaySettings",
    "getAppVersionName",
    "getAppVersionCode",
    "getBuildNumber",
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

  const badging = execSync(`"${aapt2}" dump badging "${APK}"`, { encoding: "utf8", maxBuffer: 64 << 20, timeout: EXEC_TIMEOUT_MS });
  const manifest = execSync(`"${aapt2}" dump xmltree "${APK}" --file AndroidManifest.xml`, { encoding: "utf8", maxBuffer: 64 << 20, timeout: EXEC_TIMEOUT_MS });
  // dex method-name strings (covers single + multidex)
  let dexStrings = "";
  try {
    dexStrings = execSync(`unzip -p "${APK}" 'classes*.dex' | strings`, { encoding: "utf8", maxBuffer: 256 << 20, shell: "/bin/bash", timeout: EXEC_TIMEOUT_MS });
  } catch { /* strings/unzip may warn; ignore */ }

  const problems = [];

  const pkg = (badging.match(/package: name='([^']+)'/) || [])[1];
  if (pkg === EXPECT.packageName) ok(`package ${pkg}`);
  else { fail(`package is '${pkg}', expected '${EXPECT.packageName}'`); problems.push("package"); }

  const version = (badging.match(/versionCode='(\d+)' versionName='([^']*)'/) || []);
  if (version[1]) ok(`version ${version[2]} (code ${version[1]})`);

  // Cross-check the artifact's version against package.json, using the shared
  // semver -> versionCode derivation in .github/scripts/android/android-version-code.mjs
  // rather than a local copy of the arithmetic. Catches a
  // stale local build silently shipping an old version - the class of bug that let a
  // local `pnpm apk:check` report 14.37.4 while apktool.yml and CI both said 14.38.1
  // (root cause: a stale, untracked APK/android/build/ apktool cache; see build-apk.sh).
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    if (existsSync(pkgPath) && version[1] && version[2]) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const expectedCode = String(androidVersionCode(pkg.version));
      if (version[2] !== pkg.version) {
        fail(`versionName '${version[2]}' does not match package.json '${pkg.version}' - stale build? Run \`pnpm apk:check\` again.`);
        problems.push("stale-versionName");
      } else {
        ok(`versionName matches package.json (${pkg.version})`);
      }
      if (version[1] !== expectedCode) {
        fail(`versionCode '${version[1]}' does not match expected '${expectedCode}' for package.json version ${pkg.version} - stale build? Run \`pnpm apk:check\` again.`);
        problems.push("stale-versionCode");
      } else {
        ok(`versionCode matches package.json-derived value (${expectedCode})`);
      }
    }
  } catch (e) {
    console.warn(`⚠ could not cross-check version against package.json: ${e.message}`);
  }

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
    console.warn("⚠ could not read dex strings (unzip/strings unavailable) - skipped bridge-method check");
  }

  console.log("");
  if (problems.length === 0) {
    console.log(`\x1b[32m\x1b[1mPASS\x1b[0m - ${path.basename(APK)} contains the full custom native layer. Safe to ship.`);
    process.exit(0);
  }
  console.error(`\x1b[31m\x1b[1mFAIL\x1b[0m - ${problems.length} missing element(s): ${problems.join(", ")}`);
  console.error("This APK is STRIPPED of custom functionality. Do NOT ship it.");
  console.error("Build the release with `pnpm apk:check` (from APK/src/), not `bubblewrap build`.");
  process.exit(1);
}

main();
