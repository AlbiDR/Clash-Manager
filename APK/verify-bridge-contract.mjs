#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * verify-bridge-contract.mjs - fails when the Java bridge, the PWA's TypeScript
 * contract and the release gate disagree about window.AndroidBridge.
 *
 * WHY: the bridge is declared three times. MainActivity$AndroidBridge is what
 * the WebView actually exposes; the AndroidBridge interface in
 * Frontend-PWA/src/core/types/index.ts is what the PWA is type-checked against;
 * EXPECT.bridgeMethods in verify-apk-integrity.mjs is what the release gate
 * looks for in a built APK. Nothing compared them. The TS comment claimed the
 * gate checked "every method below" while downloadApkFile was missing from it,
 * and isAndroidWrapper existed on the Java side only. A method whose name,
 * argument count or types drift fails silently on the device: the WebView
 * reports "method not found" in a console nobody sees.
 *
 * Rules, each a hard failure:
 *   - every @JavascriptInterface method is declared in the TS interface, and vice versa
 *   - every argument count the TS signature allows has a Java overload, and every
 *     Java overload is an argument count the TS signature allows
 *   - parameter and return types correspond (boolean, String -> string, numeric -> number)
 *   - every Java bridge method is in the release gate's list, and the list names nothing else
 *
 *   node APK/verify-bridge-contract.mjs
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const JAVA_BRIDGE = "APK/src/com/albidr/clashmanager/MainActivity.java";
export const TS_CONTRACT = "Frontend-PWA/src/core/types/index.ts";
export const RELEASE_GATE = "APK/verify-apk-integrity.mjs";

/** How each Java type crosses the WebView boundary into JavaScript. */
const JAVA_TO_TS = {
  boolean: "boolean",
  String: "string",
  int: "number",
  long: "number",
  float: "number",
  double: "number",
  void: "void",
};

/** Returns the text between the brace that opens at `openIndex` and its partner. */
function braceBlock(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(openIndex + 1, i);
  }
  throw new Error("unbalanced braces");
}

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** @returns {{name: string, returnType: string, params: string[]}[]} one entry per overload */
export function parseJavaBridge(source) {
  const start = source.search(/class\s+AndroidBridge\s*\{/);
  if (start < 0) throw new Error("class AndroidBridge not found");
  const body = braceBlock(source, source.indexOf("{", start));
  const methods = [];
  const pattern = /@JavascriptInterface\s+public\s+([\w.<>\[\]]+)\s+(\w+)\s*\(([^)]*)\)/g;
  for (const match of body.matchAll(pattern)) {
    const params = match[3].trim() === ""
      ? []
      : match[3].split(",").map((param) => {
          const tokens = param.trim().split(/\s+/).filter((token) => token !== "final");
          return tokens[tokens.length - 2];
        });
    methods.push({ name: match[2], returnType: match[1], params });
  }
  return methods;
}

/** @returns {{name: string, optional: boolean, params: {type: string, optional: boolean}[], returnTypes: string[]}[]} */
export function parseTsContract(source, interfaceName = "AndroidBridge") {
  const start = source.search(new RegExp(`interface\\s+${interfaceName}\\s*\\{`));
  if (start < 0) throw new Error(`interface ${interfaceName} not found`);
  const body = stripComments(braceBlock(source, source.indexOf("{", start)));
  const members = [];
  const pattern = /(\w+)(\?)?\s*\(([^)]*)\)\s*:\s*([^;]+);/g;
  for (const match of body.matchAll(pattern)) {
    const params = match[3].trim() === ""
      ? []
      : match[3].split(",").map((param) => {
          const [left, type] = param.split(":").map((part) => part.trim());
          return { type, optional: left.endsWith("?") };
        });
    members.push({
      name: match[1],
      optional: match[2] === "?",
      params,
      returnTypes: match[4].split("|").map((part) => part.trim()),
    });
  }
  return members;
}

/** @returns {string[]} the method names the release gate asserts */
export function parseReleaseGate(source) {
  const match = source.match(/bridgeMethods:\s*\[([\s\S]*?)\]/);
  if (!match) throw new Error("bridgeMethods list not found");
  return [...match[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
}

/** @returns {string[]} human-readable contract violations; empty means the three agree */
export function checkContract(javaMethods, tsMembers, gateMethods) {
  const problems = [];
  const javaByName = new Map();
  for (const method of javaMethods) {
    if (!javaByName.has(method.name)) javaByName.set(method.name, []);
    javaByName.get(method.name).push(method);
  }
  const tsByName = new Map(tsMembers.map((member) => [member.name, member]));

  for (const name of javaByName.keys()) {
    if (!tsByName.has(name)) problems.push(`${name}: exposed by Java but not declared in the TS AndroidBridge interface`);
  }
  for (const name of tsByName.keys()) {
    if (!javaByName.has(name)) problems.push(`${name}: declared in TS but no @JavascriptInterface method exists in Java`);
  }

  for (const [name, member] of tsByName) {
    const overloads = javaByName.get(name);
    if (!overloads) continue;
    const required = member.params.filter((param) => !param.optional).length;
    const total = member.params.length;
    const counts = new Set(overloads.map((overload) => overload.params.length));
    for (let n = required; n <= total; n++) {
      if (!counts.has(n)) problems.push(`${name}: TS allows a call with ${n} argument(s) but no Java overload takes ${n}`);
    }
    for (const overload of overloads) {
      const n = overload.params.length;
      if (n < required || n > total) {
        problems.push(`${name}: Java overload takes ${n} argument(s), outside the ${required}-${total} the TS signature allows`);
        continue;
      }
      overload.params.forEach((javaType, i) => {
        const expected = JAVA_TO_TS[javaType];
        const declared = member.params[i].type;
        if (!expected) problems.push(`${name}: Java parameter ${i + 1} has type ${javaType}, which the bridge cannot pass`);
        else if (declared !== expected) problems.push(`${name}: parameter ${i + 1} is ${javaType} in Java (${expected} in JS) but ${declared} in TS`);
      });
      const expectedReturn = JAVA_TO_TS[overload.returnType];
      if (!expectedReturn) problems.push(`${name}: Java returns ${overload.returnType}, which the bridge cannot return`);
      else if (!member.returnTypes.includes(expectedReturn)) {
        problems.push(`${name}: Java returns ${overload.returnType} (${expectedReturn} in JS) but TS declares ${member.returnTypes.join(" | ")}`);
      }
    }
  }

  const gate = new Set(gateMethods);
  for (const name of javaByName.keys()) {
    if (!gate.has(name)) problems.push(`${name}: missing from EXPECT.bridgeMethods in ${RELEASE_GATE}, so a build without it would still pass the release gate`);
  }
  for (const name of gate) {
    if (!javaByName.has(name)) problems.push(`${name}: listed in ${RELEASE_GATE} but not exposed by Java`);
  }
  return problems;
}

function main() {
  const read = (file) => readFileSync(path.join(REPO_ROOT, file), "utf8");
  const javaMethods = parseJavaBridge(read(JAVA_BRIDGE));
  const tsMembers = parseTsContract(read(TS_CONTRACT));
  const gateMethods = parseReleaseGate(read(RELEASE_GATE));

  // A parser that matched nothing must not read as "no drift".
  if (javaMethods.length === 0 || tsMembers.length === 0 || gateMethods.length === 0) {
    console.error(`✗ parsed ${javaMethods.length} Java methods, ${tsMembers.length} TS members, ${gateMethods.length} gate entries - a parser no longer matches its file`);
    process.exit(2);
  }

  const problems = checkContract(javaMethods, tsMembers, gateMethods);
  const names = new Set(javaMethods.map((method) => method.name)).size;
  if (problems.length === 0) {
    console.log(`\x1b[32m✓ AndroidBridge contract agrees across Java, TS and the release gate (${names} methods, ${javaMethods.length} overloads)\x1b[0m`);
    process.exit(0);
  }
  console.error("\x1b[31m✗ AndroidBridge contract drift:\x1b[0m");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
