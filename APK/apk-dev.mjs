#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * apk-dev.mjs - drives the CM Dev build on a phone or emulator over adb, so the
 * wrapper can be seen and exercised from the development machine.
 *
 * WHY: nobody working on the APK could see it run. There was no inspectable
 * build and no way to read its screen, its logs or the state of the PWA inside
 * its WebView, so native work was done blind and checked, if at all, by hand
 * on the phone afterwards. With the dev build (./APK/build-apk.sh --dev) this
 * gives a terminal, a person or an agent the same view:
 *
 *   node APK/apk-dev.mjs install [apk]      install CM Dev (default: APK/release/clashmanager-dev.apk)
 *   node APK/apk-dev.mjs start | stop       launch or force-stop CM Dev
 *   node APK/apk-dev.mjs shot [file.png]    screenshot of the phone (default: APK/.build/screen.png)
 *   node APK/apk-dev.mjs ui [file.xml]      the on-screen view hierarchy, including other apps and overlays
 *   node APK/apk-dev.mjs logs               CM Dev's log lines, PWA console output included
 *   node APK/apk-dev.mjs eval "<js>"        evaluate JavaScript inside CM Dev's WebView (Chrome DevTools Protocol)
 *   node APK/apk-dev.mjs reverse <port>     make the phone's localhost:<port> reach this machine (dev server)
 *
 * With more than one device attached, set ANDROID_SERIAL (adb reads it).
 * Read-only by design: nothing here taps, types or grants permissions. Those
 * act on the owner's real accounts and settings and stay the owner's call.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEV_PACKAGE } from "./make-dev-variant.mjs";

const APK_DIR = path.dirname(fileURLToPath(import.meta.url));
const ACTIVITY = `${DEV_PACKAGE}/com.albidr.clashmanager.MainActivity`;
// Hard timeout per adb call, matching the other APK scripts.
const EXEC_TIMEOUT_MS = 120_000;

function adb(args, { binary = false } = {}) {
  return execFileSync("adb", args, {
    encoding: binary ? undefined : "utf8",
    maxBuffer: 64 << 20,
    timeout: EXEC_TIMEOUT_MS,
  });
}

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function devPid() {
  const pid = adb(["shell", "pidof", DEV_PACKAGE]).trim();
  if (!pid) die(`${DEV_PACKAGE} is not running (node APK/apk-dev.mjs start)`);
  return pid;
}

function outPath(given, fallback) {
  const file = path.resolve(given || path.join(APK_DIR, ".build", fallback));
  mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

/** Opens a DevTools session on CM Dev's WebView page and runs one CDP call. */
async function devtools(method, params) {
  const socket = `webview_devtools_remote_${devPid()}`;
  const port = adb(["forward", "tcp:0", `localabstract:${socket}`]).trim();
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((target) => target.type === "page");
    if (!page) die("no WebView page found; is CM Dev a debuggable build and showing the PWA?");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), EXEC_TIMEOUT_MS);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method, params }));
      ws.onerror = () => reject(new Error("DevTools connection failed"));
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timer);
        ws.close();
        if (message.error) reject(new Error(message.error.message));
        else resolve({ url: page.url, result: message.result });
      };
    });
  } finally {
    adb(["forward", "--remove", `tcp:${port}`]);
  }
}

const commands = {
  install(apk) {
    const file = path.resolve(apk || path.join(APK_DIR, "release", "clashmanager-dev.apk"));
    console.log(adb(["install", "-r", file]).trim());
  },
  start() {
    console.log(adb(["shell", "am", "start", "-W", "-n", ACTIVITY]).trim());
  },
  stop() {
    adb(["shell", "am", "force-stop", DEV_PACKAGE]);
    console.log(`stopped ${DEV_PACKAGE}`);
  },
  shot(file) {
    const target = outPath(file, "screen.png");
    writeFileSync(target, adb(["exec-out", "screencap", "-p"], { binary: true }));
    console.log(target);
  },
  ui(file) {
    const target = outPath(file, "ui.xml");
    const remote = "/data/local/tmp/cm-dev-ui.xml";
    adb(["shell", "uiautomator", "dump", remote]);
    adb(["pull", remote, target]);
    adb(["shell", "rm", "-f", remote]);
    console.log(target);
  },
  logs() {
    process.stdout.write(adb(["logcat", "-d", "-v", "time", `--pid=${devPid()}`]));
  },
  async eval(expression) {
    if (!expression) die('usage: apk-dev.mjs eval "<js>"');
    const { url, result } = await devtools("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) die(`${result.exceptionDetails.exception?.description || result.exceptionDetails.text} (page ${url})`);
    console.log(JSON.stringify(result.result.value, null, 2));
  },
  reverse(port) {
    if (!/^\d+$/.test(port || "")) die("usage: apk-dev.mjs reverse <port>");
    adb(["reverse", `tcp:${port}`, `tcp:${port}`]);
    console.log(`phone localhost:${port} -> this machine localhost:${port}`);
  },
};

const [command, ...args] = process.argv.slice(2);
if (!commands[command]) die(`usage: apk-dev.mjs <${Object.keys(commands).join("|")}> [...]`);
await commands[command](...args);
