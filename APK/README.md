# `APK/` — the real Clash Manager Android app (recovered source + build tooling)

⚠️ **This folder is the single source of truth for the APK. Do NOT rebuild the
release with `bubblewrap`** — it produces a generic TWA that silently strips the
custom native layer.

## Why this exists

Clash Manager's APK is **not** a plain TWA. It carries a custom Kotlin native
layer on top of the Bubblewrap TWA shell:

| Component | Role |
| --- | --- |
| `com.albidr.clashmanager.BlitzService` | foreground service, `SYSTEM_ALERT_WINDOW` draw-over-apps overlay |
| `com.albidr.clashmanager.ClashManagerAccessibilityService` | `BIND_ACCESSIBILITY_SERVICE`, automated tap gestures (`canPerformGestures`) |
| `com.albidr.clashmanager.MainActivity` + `…$AndroidBridge` | launcher activity hosting the WebView `@JavascriptInterface` bridge |
| `com.albidr.clashmanager.Application` | app-wide init |

The PWA talks to it via `window.AndroidBridge` (7 methods — see
`Frontend-PWA/src/core/types/index.ts`). Presence of that object is also the
app's only "running inside the native wrapper" signal.

**There was never a Kotlin/Gradle source project** (the app was built through an
agentic IDE). The native layer existed only as compiled code inside the released
V4 APK. `android/` below is that APK decoded with `apktool d -s`, so the repo
(and GitHub) is now a durable source of truth for it.

## Layout

```
APK/
  README.md                  ← you are here
  android/                   ← apktool project = THE recovered app (rebuildable)
    AndroidManifest.xml       custom services/permissions/intent-filters
    apktool.yml               version lives here (versionInfo)
    classes.dex               compiled native layer, kept byte-for-byte
    res/  assets/  unknown/   resources + packaged extras
  build-apk.sh               canonical build: apktool b → zipalign → sign → verify
  gen-android-icons.mjs      regenerates the adaptive launcher icons into android/res
  verify-apk-integrity.mjs   release gate: asserts a built APK keeps the custom layer
  verify-android-source.mjs  CI gate: asserts android/ still has the custom layer
  reference/                 archives — original V4 APK + the Bubblewrap twa-manifest.json
```

## Releasing a new version

1. Release builds are handled exclusively via GitHub Actions:
   Trigger the `APK Release Build` workflow manually on the `Beta` branch via the Actions tab on GitHub.
2. The workflow compiles, signs, verifies, and publishes the versioned installable APK (e.g. `clashmanager-v14.2.6.apk`) as a downloadable workflow run artifact.
3. The repository does not track compiled APK files.

## Local Development & Sanity Checks

```bash
pnpm apk:check            # local compile + verify integrity check (no signing)
pnpm apk:verify:source    # assert that the local android/ tree still has the custom native layer
pnpm apk:verify <apk>     # test integrity of any local .apk file
```

## Make changes

- **Version bump:** `android/apktool.yml` → `versionInfo.versionCode` / `versionName`.
- **Icons:** `pnpm icons:android` regenerates into `android/res` from the brand
  `logo.svg`. Adaptive icon = `@color/colorPrimary` (#0b0e14) bg +
  `ic_launcher_foreground` + `ic_launcher_monochrome` (themed icons). New mipmap
  symbols are pinned in `android/res/values/public.xml`; **do not delete
  `ic_maskable`** (the compiled `R` class references its id).
- **Native code (Kotlin):** not editable as smali here. To change it, run `jadx`
  on `android/classes.dex` to recover readable Kotlin, rebuild a Gradle project,
  then re-verify with `pnpm apk:verify`.

## Never do

- ❌ `bubblewrap build` / `bubblewrap update` as the release path — a `PreToolUse`
  hook (`.claude/settings.json`) blocks these.
- ❌ delete `ic_maskable` resources, or the `<service>` / `<uses-permission>`
  entries in `android/AndroidManifest.xml`.
