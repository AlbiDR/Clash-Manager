#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * fetch-build-deps.mjs - resolves the pinned build inputs in APK/toolchain.json.
 *
 * WHY: build-apk.sh used to compile against four jars addressed by
 * content-hashed ~/.gradle/caches/.../transforms/<hash>/ paths. Those paths
 * exist on one Mac only, Gradle regenerates them on any cache purge, and one of
 * the four had already disappeared. No other machine, and no CI runner, could
 * compile APK/src at all. This script replaces that with pinned artifacts from
 * their official repositories, each checked against a sha256 recorded in
 * toolchain.json, cached under APK/.deps (gitignored).
 *
 *   node APK/fetch-build-deps.mjs classpath compile   # prints a ':'-joined classpath
 *   node APK/fetch-build-deps.mjs classpath test
 *   node APK/fetch-build-deps.mjs apktool             # prints the verified apktool jar path
 *   node APK/fetch-build-deps.mjs get <key>           # prints a toolchain value, e.g. buildTools
 *
 * stdout carries only the answer, so bash can capture it; progress goes to stderr.
 * A cached artifact is re-hashed on every use and re-downloaded if it no longer
 * matches. A download that does not match its pin is a hard failure, never a warning.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APK_DIR = path.dirname(fileURLToPath(import.meta.url));
const TOOLCHAIN_PATH = path.join(APK_DIR, "toolchain.json");
const CACHE_DIR = path.join(APK_DIR, ".deps");

// Hard timeout per child process, matching the other APK verifiers.
const EXEC_TIMEOUT_MS = 120_000;

const toolchain = JSON.parse(readFileSync(TOOLCHAIN_PATH, "utf8"));

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const note = (msg) => process.stderr.write(`${msg}\n`);

function die(msg) {
  process.stderr.write(`✗ ${msg}\n`);
  process.exit(1);
}

/** Returns the local path of a pinned artifact, downloading it only when absent or corrupt. */
async function resolveArtifact(entry) {
  const name = path.basename(new URL(entry.url).pathname);
  const dir = path.join(CACHE_DIR, entry.sha256);
  const file = path.join(dir, name);

  if (existsSync(file) && sha256(readFileSync(file)) === entry.sha256) return file;

  note(`▶ fetching ${entry.coordinate || name}`);
  const response = await fetch(entry.url);
  if (!response.ok) die(`download failed (${response.status}) for ${entry.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== entry.sha256) {
    die(`sha256 mismatch for ${entry.url}\n  expected ${entry.sha256}\n  received ${actual}`);
  }
  mkdirSync(dir, { recursive: true });
  // Write then rename, so an interrupted run never leaves a truncated file that
  // a later run would have to detect.
  writeFileSync(`${file}.partial`, bytes);
  renameSync(`${file}.partial`, file);
  return file;
}

/** An .aar is a zip whose compiled code lives in classes.jar; javac needs that jar. */
function compileJarFor(artifact) {
  if (!artifact.endsWith(".aar")) return artifact;
  const jar = artifact.replace(/\.aar$/, ".classes.jar");
  if (!existsSync(jar)) {
    const bytes = execFileSync("unzip", ["-p", artifact, "classes.jar"], {
      maxBuffer: 256 << 20,
      timeout: EXEC_TIMEOUT_MS,
    });
    if (bytes.length === 0) die(`${path.basename(artifact)} contains no classes.jar`);
    writeFileSync(`${jar}.partial`, bytes);
    renameSync(`${jar}.partial`, jar);
  }
  return jar;
}

async function classpath(kind) {
  const entries = toolchain[`${kind}Classpath`];
  if (!Array.isArray(entries)) die(`unknown classpath '${kind}' (expected compile or test)`);
  const jars = [];
  for (const entry of entries) jars.push(compileJarFor(await resolveArtifact(entry)));
  return jars.join(":");
}

function get(key) {
  const value = key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), toolchain);
  if (value === undefined || typeof value === "object") die(`toolchain.json has no scalar '${key}'`);
  return String(value);
}

const [command, arg] = process.argv.slice(2);
let answer;
if (command === "classpath") answer = await classpath(arg);
else if (command === "apktool") answer = await resolveArtifact({ coordinate: `apktool ${toolchain.apktool.version}`, ...toolchain.apktool });
else if (command === "get" && arg) answer = get(arg);
else die("usage: fetch-build-deps.mjs classpath <compile|test> | apktool | get <key>");

process.stdout.write(`${answer}\n`);
