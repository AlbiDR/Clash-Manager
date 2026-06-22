#!/usr/bin/env node
/**
 * verify-apk-drift.mjs — fail if the committed release APK no longer matches a
 * freshly-built one (i.e. someone edited APK/android/ but forgot to rebuild +
 * re-commit APK/build-apk-out/clashmanager.apk).
 *
 * It deliberately ignores signatures and timestamps — those differ on every
 * sign — and compares only content that apktool copies VERBATIM, so there are
 * no aapt2-version false positives:
 *   • classes.dex      — the irreplaceable native layer (Blitz/a11y/bridge)
 *   • res/mipmap-* launcher icon PNGs — declared doNotCompress, copied as-is
 *
 *   node verify-apk-drift.mjs <committed.apk> <freshly-built.apk>
 *
 * Exit 0 = in sync, 1 = drift, 2 = usage/IO error.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";

const [, , committed, fresh] = process.argv;
if (!committed || !fresh) {
  console.error("usage: verify-apk-drift.mjs <committed.apk> <freshly-built.apk>");
  process.exit(2);
}
for (const f of [committed, fresh]) {
  if (!existsSync(f)) { console.error(`not found: ${f}`); process.exit(2); }
}

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

/** List zip entry names matching the verbatim-content patterns we compare. */
function entries(apk) {
  const out = execSync(`unzip -Z1 "${apk}"`, { encoding: "utf8", maxBuffer: 64 << 20 });
  return out.split("\n").filter((n) =>
    n === "classes.dex" ||
    /^classes\d+\.dex$/.test(n) ||
    /^res\/mipmap-[^/]+\/ic_launcher[^/]*\.png$/.test(n));
}

/** sha256 of a single zip entry's bytes. */
function entrySha(apk, name) {
  const buf = execSync(`unzip -p "${apk}" "${name}"`, { maxBuffer: 256 << 20 });
  return sha(buf);
}

function manifest(apk) {
  const m = new Map();
  for (const name of entries(apk)) m.set(name, entrySha(apk, name));
  return m;
}

const a = manifest(committed);
const b = manifest(fresh);
const names = [...new Set([...a.keys(), ...b.keys()])].sort();

const drift = [];
for (const n of names) {
  const x = a.get(n), y = b.get(n);
  if (x === undefined) drift.push(`+ ${n} (only in freshly-built)`);
  else if (y === undefined) drift.push(`- ${n} (only in committed)`);
  else if (x !== y) drift.push(`~ ${n} (differs: committed ${x.slice(0, 12)} vs built ${y.slice(0, 12)})`);
}

if (drift.length === 0) {
  console.log(`\x1b[32m✓ committed APK matches a fresh build (${names.length} verbatim entries compared)\x1b[0m`);
  process.exit(0);
}
console.error(`\x1b[31m✗ committed APK has drifted from APK/android/ source:\x1b[0m`);
for (const d of drift) console.error(`  ${d}`);
console.error("\nRebuild and re-commit: pnpm apk:build  →  APK/build-apk-out/clashmanager.apk");
process.exit(1);
