---
name: apk-device-testing
description: See and test the Android app (APK) running on a device - the Android 16 emulator or the owner's phone - instead of reasoning about it blind. Use when changing anything in APK/ (Java, manifest, resources, the bridge), when checking a web change inside the app, when testing Blitz, or when the user mentions the emulator, CM Dev, the phone, rotation, dark mode or anything that only shows inside the app.
---

# APK device testing

The commands and their options are documented once, in
[`APK/README.md`](../../../../APK/README.md), section "Seeing it run". Read it
first; this file only says when to use them and what goes wrong.

## The loop

```bash
pnpm apk:emulator      # boot the pinned Android 16 virtual phone; prints its serial
pnpm apk:dev           # build CM Dev (the inspectable side-by-side build) and install it
node APK/apk-dev.mjs start | shot | ui | logs | eval "<js>"
```

With the emulator and a phone both attached, set `ANDROID_SERIAL` (the
emulator is `emulator-5554`). The owner's own phone is a Pixel 10 on
Android 16. The owner can also start the emulator without any agent: the **Android Emulator**
app in `/Applications` (built by `pnpm apk:emulator:app`) or a
double-click on `APK/Start Emulator.command`. If it is already running,
`pnpm apk:emulator` just finds it.

- Blitz: `node APK/apk-dev.mjs start --rehearsal`, then call
  `AndroidBridge.startBlitz(...)` through `eval`. A rehearsal runs the whole
  flow without opening Clash Royale; the run's log lines are under the tag
  `ClashManagerBlitz` and its result is `AndroidBridge.getLastBlitzRun()`.
- Unreleased web code inside the app: `node APK/apk-dev.mjs reverse 5173` and
  build with `CLASHMANAGER_DEV_URL=http://localhost:5173/Clash-Manager/`.
  The Vite dev server has a page-transition jam the production build does
  not; confirm a UI bug against `vite build` + `vite preview` before blaming code.

## Traps that cost real time

- **Never force-stop CM Dev** (`am start -S`, `am force-stop`, `apk-dev stop`).
  On Android 14+ it switches the app's accessibility service off, and Blitz
  stops tapping. `apk-dev` warns when it happens.
- **Accessibility and "Display over other apps" are security settings.** A
  person switches them on in the device's Settings; never do it for them, on
  the phone or the emulator. Ask, and say why.
- **Clash Royale switches USB debugging off while it is open.** Real-game runs
  cannot be watched; use rehearsals, and read `adb logcat` afterwards.
- **The emulator must draw with the GPU** (`gpu: host` in
  `APK/toolchain.json`). On `auto` it fell back to the CPU and was unusable.
- **A phone check comes before any rebuilt `classes.dex` is pushed.** The
  owner requires it, and the emulator or a phone both count.
