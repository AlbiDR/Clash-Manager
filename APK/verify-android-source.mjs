#!/usr/bin/env node
/**
 * verify-android-source.mjs — fast, dependency-free integrity gate for the
 * committed android/ project (the apktool-recovered source of truth).
 *
 * Complements verify-apk-integrity.mjs (which inspects a built APK with aapt2):
 * this one only reads files, so it runs in CI with zero Android tooling and
 * catches the dominant regression — someone editing android/ and dropping the
 * custom native layer or the compiled dex. Exits non-zero on any violation.
 *
 *   node verify-android-source.mjs            # checks ./android
 *   node verify-android-source.mjs path/to/android
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const DIR = process.argv[2] || "android";
const manifestPath = path.join(DIR, "AndroidManifest.xml");
const publicPath = path.join(DIR, "res/values/public.xml");
const dexPath = path.join(DIR, "classes.dex");

const REQUIRED_IN_MANIFEST = [
  "com.albidr.clashmanager.BlitzService",
  "com.albidr.clashmanager.ClashManagerAccessibilityService",
  "com.albidr.clashmanager.MainActivity",
  "com.albidr.clashmanager.Application",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.FOREGROUND_SERVICE",
  "android.accessibilityservice.AccessibilityService",
  "@mipmap/ic_launcher_round", // roundIcon wired
];
// Icon symbols must stay declared in public.xml; ic_maskable must NOT be removed
// (the compiled R class references its id).
const REQUIRED_IN_PUBLIC = ["ic_launcher_foreground", "ic_launcher_monochrome", "ic_maskable"];

const fail = (m) => console.error(`\x1b[31m✗ ${m}\x1b[0m`);
const ok = (m) => console.log(`\x1b[32m✓ ${m}\x1b[0m`);
const problems = [];

if (!existsSync(manifestPath)) {
  fail(`missing ${manifestPath} — android/ project is not intact`);
  process.exit(1);
}
const manifest = readFileSync(manifestPath, "utf8");
for (const token of REQUIRED_IN_MANIFEST) {
  if (manifest.includes(token)) ok(`manifest declares ${token}`);
  else { fail(`manifest MISSING ${token}`); problems.push(token); }
}

if (existsSync(publicPath)) {
  const pub = readFileSync(publicPath, "utf8");
  for (const token of REQUIRED_IN_PUBLIC) {
    if (pub.includes(`"${token}"`)) ok(`public.xml declares ${token}`);
    else { fail(`public.xml MISSING ${token}`); problems.push(`public:${token}`); }
  }
} else {
  fail(`missing ${publicPath}`); problems.push("public.xml");
}

if (existsSync(dexPath) && statSync(dexPath).size > 1_000_000) {
  ok(`classes.dex present (${(statSync(dexPath).size / 1e6).toFixed(1)} MB — custom code intact)`);
} else {
  fail("classes.dex missing or suspiciously small — native layer may be gone");
  problems.push("classes.dex");
}

console.log("");
if (problems.length === 0) {
  console.log("\x1b[32m\x1b[1mPASS\x1b[0m — android/ retains the full custom native layer.");
  process.exit(0);
}
console.error(`\x1b[31m\x1b[1mFAIL\x1b[0m — ${problems.length} issue(s): ${problems.join(", ")}`);
console.error("The android/ project has been stripped. See android/README.md.");
process.exit(1);
