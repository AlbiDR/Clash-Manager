#!/usr/bin/env bash
#
# build-apk.sh — Local Clash Manager APK compilation & sanity checks.
#
# Compiles the committed android/ project (apktool) to verify build success and
# integrity. This is a local verification tool only; production release builds
# are run and signed exclusively in CI (apk-release.yml).
#
#   ./build-apk.sh --no-sign       # compile unsigned + verify integrity (typical dev flow)
#   ./build-apk.sh                 # build + sign (only if local keystore is available)
#
# Env overrides:
#   JAVA_HOME              (default: JDK 17 — Gradle/apktool reject the system JDK 26)
#   CLASHMANAGER_KEYSTORE  signing keystore (default: ~/.clash-manager-signing/android.keystore)
#   CLASHMANAGER_KEY_ALIAS keystore alias   (default: android)
#   CLASHMANAGER_KEY_PASS  keystore password (if set, signing runs non-interactively)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ANDROID_DIR="${ROOT}/android"
OUT="${ROOT}/build-apk-out"
mkdir -p "${OUT}"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
BT="$(ls -d "${HOME}"/.bubblewrap/android_sdk/build-tools/* 2>/dev/null | sort -V | tail -1)"
KEYSTORE="${CLASHMANAGER_KEYSTORE:-${HOME}/.clash-manager-signing/android.keystore}"
KEY_ALIAS="${CLASHMANAGER_KEY_ALIAS:-android}"

[ -d "${ANDROID_DIR}" ] || { echo "✗ ${ANDROID_DIR} missing (the recovered project)"; exit 1; }
[ -n "${BT}" ] || { echo "✗ Android build-tools not found under ~/.bubblewrap/android_sdk"; exit 1; }

echo "▶ Building from android/ via apktool ..."
apktool b "${ANDROID_DIR}" -o "${OUT}/clashmanager-unsigned.apk"

if [ "${1:-}" = "--no-sign" ]; then
  echo "▶ Verifying integrity (unsigned) ..."
  node "${ROOT}/verify-apk-integrity.mjs" "${OUT}/clashmanager-unsigned.apk"
  echo "✓ Unsigned APK: ${OUT}/clashmanager-unsigned.apk"
  exit 0
fi

[ -f "${KEYSTORE}" ] || { echo "✗ keystore not found: ${KEYSTORE} (set CLASHMANAGER_KEYSTORE)"; exit 1; }

echo "▶ Zipalign ..."
"${BT}/zipalign" -f -p 4 "${OUT}/clashmanager-unsigned.apk" "${OUT}/clashmanager-aligned.apk"

echo "▶ Signing ..."
if [ -n "${CLASHMANAGER_KEY_PASS:-}" ]; then
  "${BT}/apksigner" sign --ks "${KEYSTORE}" --ks-key-alias "${KEY_ALIAS}" \
    --ks-pass "pass:${CLASHMANAGER_KEY_PASS}" \
    --out "${OUT}/clashmanager.apk" "${OUT}/clashmanager-aligned.apk"
else
  echo "  (no CLASHMANAGER_KEY_PASS set — prompting interactively; set it in CI to avoid hanging)"
  "${BT}/apksigner" sign --ks "${KEYSTORE}" --ks-key-alias "${KEY_ALIAS}" \
    --out "${OUT}/clashmanager.apk" "${OUT}/clashmanager-aligned.apk"
fi

echo "▶ Verifying native-layer integrity (release gate) ..."
node "${ROOT}/verify-apk-integrity.mjs" "${OUT}/clashmanager.apk"

echo "✓ Release APK: ${OUT}/clashmanager.apk"
