#!/usr/bin/env bash
#
# build-apk.sh — canonical Clash Manager APK release build.
#
# Builds from the committed android/ project (apktool), which PRESERVES the
# custom native layer (Blitz overlay service, accessibility tap-gesture service,
# WebView JS bridge). It does NOT use ~/bubblewrap-project, which is a generic
# decoy that strips all of that. The build is rejected if the integrity gate
# (verify-apk-integrity.mjs) finds the custom layer missing.
#
#   ./build-apk.sh                 # build + sign + verify -> build-apk-out/clashmanager.apk
#   ./build-apk.sh --no-sign       # build unsigned + verify only
#
# Env overrides:
#   JAVA_HOME            (default: JDK 17 — Gradle/apktool reject the system JDK 26)
#   CLASHMANAGER_KEYSTORE  signing keystore (default: ~/.clash-manager-signing/android.keystore)
#   CLASHMANAGER_KEY_ALIAS keystore alias  (default: android)
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

echo "▶ Signing (you will be prompted for the keystore password) ..."
"${BT}/apksigner" sign --ks "${KEYSTORE}" --ks-key-alias "${KEY_ALIAS}" \
  --out "${OUT}/clashmanager.apk" "${OUT}/clashmanager-aligned.apk"

echo "▶ Verifying native-layer integrity (release gate) ..."
node "${ROOT}/verify-apk-integrity.mjs" "${OUT}/clashmanager.apk"

echo "✓ Release APK: ${OUT}/clashmanager.apk"
