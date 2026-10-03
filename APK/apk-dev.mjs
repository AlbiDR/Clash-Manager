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
 *   node APK/apk-dev.mjs start --rehearsal  relaunch CM Dev so Blitz runs without opening Clash Royale
 *                                          (the game switches USB debugging off while it is open)
 *   node APK/apk-dev.mjs shot [file.png]    screenshot of the phone (default: APK/.build/screen.png)
 *   node APK/apk-dev.mjs ui [file.xml]      the on-screen view hierarchy, including other apps and overlays
 *   node APK/apk-dev.mjs logs               CM Dev's log lines, PWA console output included
 *   node APK/apk-dev.mjs eval "<js>"        evaluate JavaScript inside CM Dev's WebView (Chrome DevTools Protocol)
 *   node APK/apk-dev.mjs reverse <port>     make the phone's localhost:<port> reach this machine (dev server)
 *   node APK/apk-dev.mjs emulator           create (once) and boot the virtual phone pinned in toolchain.json,
 *                                          then print its serial for ANDROID_SERIAL
 *   node APK/apk-dev.mjs debloat            disable the emulator's background apps listed in toolchain.json
 *   node APK/apk-dev.mjs mac-app [dir]      build "Clash Manager Emulator.app" (default /Applications): a Dock-
 *                                          pinnable app that starts the virtual phone without a terminal or agent
 *
 * With more than one device attached, set ANDROID_SERIAL (adb reads it).
 * Read-only by design: nothing here taps, types or grants permissions. Those
 * act on the owner's real accounts and settings and stay the owner's call.
 */

import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEV_PACKAGE } from "./make-dev-variant.mjs";

const APK_DIR = path.dirname(fileURLToPath(import.meta.url));
const ACTIVITY = `${DEV_PACKAGE}/com.albidr.clashmanager.MainActivity`;

/** The launch extra BlitzService honours in debuggable builds, read from the Java so it has one definition. */
function rehearsalExtra() {
  const source = readFileSync(path.join(APK_DIR, "src", "com", "albidr", "clashmanager", "BlitzService.java"), "utf8");
  const match = source.match(/EXTRA_REHEARSAL\s*=\s*"(\w+)"/);
  if (!match) die("EXTRA_REHEARSAL not found in BlitzService.java");
  return match[1];
}
// Hard timeout per adb call, matching the other APK scripts.
const EXEC_TIMEOUT_MS = 120_000;

function adb(args, { binary = false } = {}) {
  return execFileSync("adb", args, {
    encoding: binary ? undefined : "utf8",
    // stderr is kept with the error instead of printed: polling a booting
    // emulator otherwise floods the terminal with "device offline".
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 << 20,
    timeout: EXEC_TIMEOUT_MS,
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The SDK holding the emulator, searched in the same order as toolchain-env.sh. */
function sdkWithEmulator() {
  const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), ".bubblewrap", "android_sdk"), path.join(os.homedir(), "Library", "Android", "sdk")];
  const sdk = candidates.find((dir) => dir && existsSync(path.join(dir, "emulator", "emulator")));
  if (!sdk) die("no Android SDK with the emulator installed (see APK/README.md, Emulator)");
  return sdk;
}

/**
 * Writes the AVD definition for the pinned system image, screen and graphics
 * mode: the same two files avdmanager would write, so it needs no extra tool.
 * The config is rewritten on every boot, so a change in toolchain.json always
 * takes effect; the phone's own state (installed apps, granted settings) lives
 * in its data image and is untouched. Returns true when the AVD is new.
 */
function ensureAvd(sdk, avdHome, emulator) {
  const [, platform, tag, abi] = emulator.systemImage.split(";");
  const imageDir = emulator.systemImage.split(";").join("/") + "/";
  if (!existsSync(path.join(sdk, imageDir, "system.img"))) die(`system image ${emulator.systemImage} is not installed in ${sdk}`);
  const avdDir = path.join(avdHome, `${emulator.avd}.avd`);
  const created = !existsSync(path.join(avdDir, "config.ini"));
  mkdirSync(avdDir, { recursive: true });
  writeFileSync(path.join(avdHome, `${emulator.avd}.ini`), [
    "avd.ini.encoding=UTF-8", `path=${avdDir}`, `path.rel=avd/${emulator.avd}.avd`, `target=${platform}`, "",
  ].join("\n"));
  writeFileSync(path.join(avdDir, "config.ini"), [
    `AvdId=${emulator.avd}`, `avd.ini.displayname=Clash Manager ${platform}`, "avd.ini.encoding=UTF-8",
    `abi.type=${abi}`, `hw.cpu.arch=${abi.startsWith("arm64") ? "arm64" : abi}`, "hw.cpu.ncore=4", "hw.ramSize=4096",
    "disk.dataPartition.size=6G", `image.sysdir.1=${imageDir}`, `tag.id=${tag}`, `target=${platform}`,
    `hw.lcd.width=${emulator.screen.width}`, `hw.lcd.height=${emulator.screen.height}`, `hw.lcd.density=${emulator.screen.density}`,
    "hw.keyboard=yes", "hw.mainKeys=no", "hw.gpu.enabled=yes", `hw.gpu.mode=${emulator.gpu}`,
    "hw.accelerometer=yes", "hw.sensors.orientation=yes", "showDeviceFrame=no",
    "hw.audioInput=no", "hw.audioOutput=no", "hw.camera.back=none", "hw.camera.front=none", "",
  ].join("\n"));
  return created;
}

/** The serial of a running emulator that is this AVD, or null. */
function runningEmulator(avd) {
  const serials = adb(["devices"]).split("\n").map((line) => line.split("\t")[0]).filter((serial) => serial.startsWith("emulator-"));
  return serials.find((serial) => {
    try {
      return adb(["-s", serial, "emu", "avd", "name"]).split("\n")[0].trim() === avd;
    } catch {
      return false;
    }
  }) ?? null;
}

/** Whether CM Dev's accessibility service is in Android's switched-on list. */
function accessibilityOn() {
  const enabled = adb(["shell", "settings", "get", "secure", "enabled_accessibility_services"]).trim();
  return enabled.split(":").some((entry) => entry.startsWith(`${DEV_PACKAGE}/`));
}

const ACCESSIBILITY_OFF_NOTE =
  "Android switched CM Dev Blitz's accessibility service off. It is a security setting, so a person turns it on again (Settings > Accessibility > CM Dev Blitz) before taps can be tested.";

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
    const wasOn = accessibilityOn();
    console.log(adb(["install", "-r", file]).trim());
    // Say so when the update cost the service its switch, rather than letting a
    // later tap test fail with no obvious cause.
    if (wasOn && !accessibilityOn()) console.log(ACCESSIBILITY_OFF_NOTE);
  },
  start(flag) {
    if (flag && flag !== "--rehearsal") die("usage: apk-dev.mjs start [--rehearsal]");
    // MainActivity is singleTask and reads the extra in onCreate and onNewIntent,
    // so a plain start reaches it either way. Never force-stop (-S) for this:
    // Android then leaves the accessibility service unbound until it is toggled.
    const args = flag ? ["--ez", rehearsalExtra(), "true"] : [];
    console.log(adb(["shell", "am", "start", "-W", ...args, "-n", ACTIVITY]).trim());
  },
  stop() {
    // A force-stop is the only way to end the app from outside, and on Android
    // 14+ it also removes the app's accessibility service from the switched-on
    // list. Prefer start, which reuses the running app.
    const wasOn = accessibilityOn();
    adb(["shell", "am", "force-stop", DEV_PACKAGE]);
    console.log(`stopped ${DEV_PACKAGE}`);
    if (wasOn) console.log(ACCESSIBILITY_OFF_NOTE);
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
    let response;
    for (let attempt = 1; !response; attempt++) {
      try {
        response = await devtools("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      } catch (error) {
        // The PWA reloads itself once when a new service worker takes over (the
        // first launch on a fresh device, or after a deploy), which ends the page
        // the expression was running in. Run it again on the new page.
        if (attempt >= 3 || !/context was destroyed|target navigated|closed/i.test(error.message)) throw error;
        await sleep(2000);
      }
    }
    const { url, result } = response;
    if (result.exceptionDetails) die(`${result.exceptionDetails.exception?.description || result.exceptionDetails.text} (page ${url})`);
    console.log(JSON.stringify(result.result.value, null, 2));
  },
  async emulator() {
    const toolchain = JSON.parse(readFileSync(path.join(APK_DIR, "toolchain.json"), "utf8"));
    const emulator = toolchain.emulator;
    const sdk = sdkWithEmulator();
    const avdHome = process.env.ANDROID_AVD_HOME || path.join(os.homedir(), ".android", "avd");
    if (ensureAvd(sdk, avdHome, emulator)) console.log(`created ${emulator.avd} (${emulator.systemImage})`);

    let serial = runningEmulator(emulator.avd);
    if (!serial) {
      const log = outPath(null, "emulator.log");
      const child = spawn(path.join(sdk, "emulator", "emulator"), ["-avd", emulator.avd, "-no-boot-anim", "-gpu", emulator.gpu], {
        detached: true,
        stdio: ["ignore", openSync(log, "w"), openSync(log, "a")],
        env: { ...process.env, ANDROID_SDK_ROOT: sdk, ANDROID_AVD_HOME: avdHome },
      });
      child.unref();
      console.log(`starting ${emulator.avd} (log: ${log})`);
    }
    // Boot is done when Android says so, not when adb first sees the device.
    const deadline = Date.now() + 5 * EXEC_TIMEOUT_MS;
    while (Date.now() < deadline) {
      serial = serial || runningEmulator(emulator.avd);
      if (serial) {
        try {
          if (adb(["-s", serial, "shell", "getprop", "sys.boot_completed"]).trim() === "1") {
            console.log(`ready: ${serial}  (export ANDROID_SERIAL=${serial})`);
            return;
          }
        } catch {
          // Still booting: adb answers before the shell does.
        }
      }
      await sleep(2000);
    }
    die(`${emulator.avd} did not finish booting; see APK/.build/emulator.log`);
  },
  debloat() {
    const serial = process.env.ANDROID_SERIAL || "";
    if (!serial.startsWith("emulator-")) die("debloat is for the emulator only: set ANDROID_SERIAL=emulator-<port>");
    const toolchain = JSON.parse(readFileSync(path.join(APK_DIR, "toolchain.json"), "utf8"));
    const installed = new Set(adb(["shell", "pm", "list", "packages"]).split("\n").map((line) => line.replace("package:", "").trim()));
    for (const pkg of toolchain.emulator.disabledPackages) {
      if (!installed.has(pkg)) continue;
      adb(["shell", "pm", "disable-user", "--user", "0", pkg]);
      console.log(`disabled ${pkg}`);
    }
    console.log("undo one with: adb shell pm enable <package>");
  },
  "mac-app"(dir) {
    if (process.platform !== "darwin") die("mac-app builds a macOS application");
    const appName = "Clash Manager Emulator";
    const app = path.join(path.resolve(dir || "/Applications"), `${appName}.app`);
    const repo = path.resolve(APK_DIR, "..");
    const node = process.execPath;
    const adbDir = path.dirname(execFileSync("/usr/bin/which", ["adb"], { encoding: "utf8" }).trim());
    const version = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8")).version;
    const contents = path.join(app, "Contents");
    rmSync(app, { recursive: true, force: true });
    mkdirSync(path.join(contents, "MacOS"), { recursive: true });
    mkdirSync(path.join(contents, "Resources"), { recursive: true });

    writeFileSync(path.join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${appName}</string>
  <key>CFBundleDisplayName</key><string>${appName}</string>
  <key>CFBundleIdentifier</key><string>com.albidr.clashmanager.emulator</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`);

    // An app started from Finder or the Dock gets no shell PATH, so the tools it
    // needs are named by the absolute paths they have on this machine now.
    const alert = (message) => `/usr/bin/osascript -e 'display alert "${appName}" message "${message}"'`;
    const launcher = path.join(contents, "MacOS", "launcher");
    writeFileSync(launcher, `#!/bin/zsh
# Generated by APK/apk-dev.mjs mac-app. Rebuild it after moving the repository
# or Node: node APK/apk-dev.mjs mac-app
export PATH="${adbDir}:${path.dirname(node)}:/usr/bin:/bin"
REPO="${repo}"
if [ ! -f "$REPO/APK/apk-dev.mjs" ]; then
  ${alert("The clash-manager folder has moved. Open it in a terminal and run: node APK/apk-dev.mjs mac-app")}
  exit 1
fi
mkdir -p "$REPO/APK/.build"
LOG="$REPO/APK/.build/emulator-app.log"
"${node}" "$REPO/APK/apk-dev.mjs" emulator > "$LOG" 2>&1 || ${alert("The virtual phone did not start. Details: APK/.build/emulator-app.log")}
`);
    chmodSync(launcher, 0o755);

    // The app's own launcher icon, at every size macOS asks for.
    const source = path.join(repo, "Frontend-PWA", "public", "assets", "icons", "icon-512.png");
    const iconset = path.join(APK_DIR, ".build", "AppIcon.iconset");
    rmSync(iconset, { recursive: true, force: true });
    mkdirSync(iconset, { recursive: true });
    for (const size of [16, 32, 128, 256, 512]) {
      for (const [scale, suffix] of [[1, ""], [2, "@2x"]]) {
        const px = String(size * scale);
        execFileSync("/usr/bin/sips", ["-z", px, px, source, "--out", path.join(iconset, `icon_${size}x${size}${suffix}.png`)], { stdio: "ignore" });
      }
    }
    execFileSync("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", path.join(contents, "Resources", "AppIcon.icns")]);
    rmSync(iconset, { recursive: true, force: true });
    execFileSync("/usr/bin/touch", [app]);
    console.log(`built ${app}`);
    console.log("Pin it: drag it from Applications onto the Dock.");
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
