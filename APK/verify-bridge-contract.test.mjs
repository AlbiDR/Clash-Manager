// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  JAVA_BRIDGE,
  RELEASE_GATE,
  TS_CONTRACT,
  checkContract,
  parseJavaBridge,
  parseReleaseGate,
  parseTsContract,
} from "./verify-bridge-contract.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const JAVA = `
public class MainActivity {
    @JavascriptInterface
    public void outsideTheBridge() {}

    public class AndroidBridge {
        @JavascriptInterface
        public boolean isReady() { if (x) { return true; } return false; }

        @JavascriptInterface
        public boolean download(final String url, final String filename) { return download(url, filename, null); }

        @JavascriptInterface
        public boolean download(final String url, final String filename, final String sha256) { return true; }

        @JavascriptInterface
        public void start(final String tagsJson, final long delayMs) {}

        public void notExposed(String s) {}
    }
}
`;

const TS = `
export interface AndroidBridge {
  /** Mentions start(a, b): void inside a comment, which must be ignored. */
  isReady(): boolean;
  // download(x): void in a line comment is ignored too
  download(url: string, filename: string, sha256?: string): boolean | void;
  start(payload: string, delayMs: number): void;
}
export interface Other { isReady(): string; }
`;

const GATE = `const EXPECT = { bridgeMethods: [
  "isReady",
  "download",
  "start",
] };`;

test("parseJavaBridge reads only annotated methods inside AndroidBridge, one entry per overload", () => {
  assert.deepEqual(parseJavaBridge(JAVA), [
    { name: "isReady", returnType: "boolean", params: [] },
    { name: "download", returnType: "boolean", params: ["String", "String"] },
    { name: "download", returnType: "boolean", params: ["String", "String", "String"] },
    { name: "start", returnType: "void", params: ["String", "long"] },
  ]);
});

test("parseTsContract reads optional params and union returns, ignoring comments and other interfaces", () => {
  const members = parseTsContract(TS);
  assert.deepEqual(members.map((m) => m.name), ["isReady", "download", "start"]);
  assert.deepEqual(members[1].params, [
    { type: "string", optional: false },
    { type: "string", optional: false },
    { type: "string", optional: true },
  ]);
  assert.deepEqual(members[1].returnTypes, ["boolean", "void"]);
});

test("a consistent contract reports nothing", () => {
  assert.deepEqual(checkContract(parseJavaBridge(JAVA), parseTsContract(TS), parseReleaseGate(GATE)), []);
});

test("a method on one side only is reported from both directions", () => {
  const java = [...parseJavaBridge(JAVA), { name: "javaOnly", returnType: "void", params: [] }];
  const ts = [...parseTsContract(TS), { name: "tsOnly", optional: true, params: [], returnTypes: ["void"] }];
  const problems = checkContract(java, ts, [...parseReleaseGate(GATE), "javaOnly"]);
  assert.ok(problems.some((p) => p.startsWith("javaOnly: exposed by Java but not declared")));
  assert.ok(problems.some((p) => p.startsWith("tsOnly: declared in TS but no @JavascriptInterface")));
});

test("an argument count TS allows but Java cannot serve is reported", () => {
  const java = parseJavaBridge(JAVA).filter((m) => !(m.name === "download" && m.params.length === 2));
  const problems = checkContract(java, parseTsContract(TS), parseReleaseGate(GATE));
  assert.deepEqual(problems, ["download: TS allows a call with 2 argument(s) but no Java overload takes 2"]);
});

test("parameter and return type mismatches are reported", () => {
  const ts = parseTsContract(TS.replace("delayMs: number", "delayMs: string").replace("isReady(): boolean", "isReady(): string"));
  const problems = checkContract(parseJavaBridge(JAVA), ts, parseReleaseGate(GATE));
  assert.ok(problems.includes("start: parameter 2 is long in Java (number in JS) but string in TS"));
  assert.ok(problems.includes("isReady: Java returns boolean (boolean in JS) but TS declares string"));
});

test("the release gate must list every Java method and nothing else", () => {
  const problems = checkContract(parseJavaBridge(JAVA), parseTsContract(TS), ["isReady", "start", "ghost"]);
  assert.ok(problems.some((p) => p.startsWith("download: missing from EXPECT.bridgeMethods")));
  assert.ok(problems.some((p) => p.startsWith("ghost: listed in")));
});

test("the real Java bridge, TS contract and release gate agree", () => {
  const read = (file) => readFileSync(path.join(REPO_ROOT, file), "utf8");
  const java = parseJavaBridge(read(JAVA_BRIDGE));
  const ts = parseTsContract(read(TS_CONTRACT));
  const gate = parseReleaseGate(read(RELEASE_GATE));
  // Guards against a parser silently matching nothing, which would also report no drift.
  assert.ok(java.length >= 16, `parsed only ${java.length} Java methods`);
  assert.ok(ts.length >= 16, `parsed only ${ts.length} TS members`);
  assert.deepEqual(checkContract(java, ts, gate), []);
});
