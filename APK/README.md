// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Android Application Package Substrate (APK)

The Android wrapper layer. This directory serves as the authoritative repository for the decoded hybrid Android application package, combining a native Kotlin overlay with the core progressive web application.

---
<br>

## Purpose

The application wrapper provides hardware-level access and background capabilities that are unavailable to standard browser environments. It integrates a native layer directly on top of the PWA shell, enabling high-precision automation and custom overlay services.

---
<br>

## Native Architecture

The wrapper contains a custom native layer that communicates with the client PWA:

| Service | Component Role |
| :--- | :--- |
| `com.albidr.clashmanager.BlitzService` | Foreground service managing the system alert window overlay. |
| `com.albidr.clashmanager.ClashManagerAccessibilityService` | Accessibility service implementing automated gestures. |
| `com.albidr.clashmanager.MainActivity` | Host activity containing the JavascriptInterface bridge. |
| `com.albidr.clashmanager.Application` | Application-wide initialization entry point. |

The PWA interfaces with the native layer via `window.AndroidBridge`. The presence of this object acts as the primary indicator that the client is executing inside the native wrapper environment.

---
<br>

## Directory Layout

```
APK/
  README.md - Documentation kernel
  android/ - Decoded APK structure containing the active assets and layout
    AndroidManifest.xml - Service configurations, intents, and hardware permissions
    apktool.yml - Package metadata and version info
    classes.dex - Compiled Kotlin native layer binaries
    res/ - Application resources and theme variables
  build-apk.sh - Shell script for building, aligning, signing, and verifying the package
  gen-android-icons.mjs - Generator utility for adaptive launcher icons
  verify-apk-integrity.mjs - Release validation script asserting the integrity of built APKs
  verify-android-source.mjs - Integration check asserting the integrity of the android source tree
  reference/ - Static archives of reference manifestations
```

---
<br>

## Release Integration

Release builds are orchestrated via GitHub Actions:
1. The release workflow is triggered manually on the Beta branch.
2. The pipeline compiles, signs, verifies, and packages the versioned installer.
3. Compiled binaries are published as run artifacts and are not tracked directly in version control.

---
<br>

## Verification and Diagnostics

Local scripts are provided to verify the integrity of the build:

```bash
pnpm apk:check            # Compile package and run verification checks without signing
pnpm apk:verify:source    # Assert that the local source tree maintains the native layer
pnpm apk:verify <path>    # Perform integrity checks on a specified package file
```

---
<br>

## Customization and Modification

- **Version Management**: Update version mappings in `android/apktool.yml` under `versionInfo`.
- **Launcher Icons**: Execute `pnpm icons:android` to regenerate adaptive assets into `android/res` using the master vector logo. The configuration maps themed foregrounds and backgrounds.
- **Native Implementation**: The native Kotlin layer is maintained within `android/classes.dex`. Modifying compiling structures requires de-compiling the binary, reconstructing the source project, and rebuilding the classes artifact.

---
<br>

## Forbidden Actions

- **Direct Bubblewrap Rebuilds**: Building directly via bubblewrap commands is prohibited as it overwrites the custom native layer with a generic shell.
- **Resource Deletion**: Modifying or removing essential adaptive assets (such as maskable icons) or removing access permissions from `AndroidManifest.xml` is prohibited.
