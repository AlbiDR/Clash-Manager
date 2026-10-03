#!/bin/zsh -l
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR
#
# Double-click in Finder to start the Android 16 virtual phone used for testing
# the APK (the same as `pnpm apk:emulator`). It runs on its own: closing this
# window, Claude, Codex or Antigravity does not stop it. Close the phone's
# window to shut it down.
cd "$(dirname "$0")/.." || exit 1
node APK/apk-dev.mjs emulator
echo
echo "The virtual phone is running. This window can be closed."
