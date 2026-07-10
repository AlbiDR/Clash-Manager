#!/usr/bin/env bash
#
# build-apk.sh — Local Clash Manager APK compilation & sanity checks.
#
# Compiles the custom Java sources from APK/src/main/java/ into a DEX file,
# merges them into the smali files extracted from the base APK, builds the
# android/ directory, and runs apktool to verify build success and integrity.
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
SRC_DIR="${ROOT}/src/main/java"
OUT="${ROOT}/build-apk-out"
TMP_DIR="/tmp/clash-apk-build"

mkdir -p "${OUT}"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
BT="$(ls -d "${HOME}"/.bubblewrap/android_sdk/build-tools/* 2>/dev/null | sort -V | tail -1)"
KEYSTORE="${CLASHMANAGER_KEYSTORE:-${HOME}/.clash-manager-signing/android.keystore}"
KEY_ALIAS="${CLASHMANAGER_KEY_ALIAS:-android}"

[ -d "${ANDROID_DIR}" ] || { echo "✗ ${ANDROID_DIR} missing (the recovered project)"; exit 1; }
[ -n "${BT}" ] || { echo "✗ Android build-tools not found under ~/.bubblewrap/android_sdk"; exit 1; }

# Locate required compilation libraries from the Gradle cache and Android SDK
ANDROID_JAR="${HOME}/.bubblewrap/android_sdk/platforms/android-36/android.jar"
CP_LIBS="${HOME}/.gradle/caches/8.11.1/transforms/aafc4c61d3d07ce43d7cc3b1eec3ea16/transformed/androidbrowserhelper-2.6.2-runtime.jar:${HOME}/.gradle/caches/8.11.1/transforms/aafc4c61d3d07ce43d7cc3b1eec3ea16/transformed/androidbrowserhelper-2.6.2/jars/classes.jar:${HOME}/.gradle/caches/8.11.1/transforms/a5429f7b20c607b890f08b5283ad4ec0/transformed/core-1.13.0/jars/classes.jar:${HOME}/.gradle/caches/8.11.1/transforms/be57bd43967b699c12a0f6b8bd2f21c6/transformed/browser-1.9.0-alpha04/jars/classes.jar"

echo "▶ Compiling custom Java source files..."
rm -rf "${TMP_DIR}"
mkdir -p "${TMP_DIR}/classes"
mkdir -p "${TMP_DIR}/dex"

# Compile clean Java source tree
javac -bootclasspath "${ANDROID_JAR}" -cp "${CP_LIBS}" -source 8 -target 8 -d "${TMP_DIR}/classes" "${SRC_DIR}/com/albidr/clashmanager/"*.java

# Convert compiled classes to Dalvik DEX format using d8
"${BT}/d8" $(find "${TMP_DIR}/classes" -name "*.class") --lib "${ANDROID_JAR}" --output "${TMP_DIR}/dex/"

# Wrap classes.dex in a temporary zip so apktool can decode it
echo "▶ Disassembling compiled classes to smali..."
mkdir -p "${TMP_DIR}/fake-new-apk"
cp "${TMP_DIR}/dex/classes.dex" "${TMP_DIR}/fake-new-apk/classes.dex"
cd "${TMP_DIR}/fake-new-apk"
zip -q -r "${TMP_DIR}/fake-new.apk" classes.dex
cd - >/dev/null

apktool d -f "${TMP_DIR}/fake-new.apk" -o "${TMP_DIR}/smali-new"

# Extract base APK contents to preserve original dependency smali files
echo "▶ Unpacking base project files for merging..."
apktool d -f "${OUT}/clashmanager-unsigned.apk" -o "${TMP_DIR}/smali-orig" 2>/dev/null || {
  # Fallback if no built unsigned APK exists yet: disassemble the current repo classes.dex
  mkdir -p "${TMP_DIR}/fake-apk"
  cp "${ANDROID_DIR}/classes.dex" "${TMP_DIR}/fake-apk/classes.dex"
  cd "${TMP_DIR}/fake-apk"
  zip -q -r "${TMP_DIR}/fake-base.apk" classes.dex
  cd - >/dev/null
  apktool d -f "${TMP_DIR}/fake-base.apk" -o "${TMP_DIR}/smali-orig"
}

# Overwrite original Blitz/MainActivity/Accessibility smali files with our newly compiled clean smali classes
echo "▶ Injecting new custom layer classes into smali tree..."
# Remove any JADX-style synthetic lambda stubs that might linger in original smali
rm -f "${TMP_DIR}/smali-orig"/smali/com/albidr/clashmanager/BlitzService\$\$ExternalSyntheticLambda*.smali
rm -f "${TMP_DIR}/smali-orig"/smali/com/albidr/clashmanager/MainActivity\$AndroidBridge\$\$ExternalSyntheticLambda*.smali

# Copy new smali over
cp "${TMP_DIR}/smali-new"/smali/com/albidr/clashmanager/*.smali "${TMP_DIR}/smali-orig/smali/com/albidr/clashmanager/"

# Reassemble the merged smali files into the final classes.dex file in our source-controlled directory
echo "▶ Reassembling smali back to classes.dex..."
apktool b "${TMP_DIR}/smali-orig" -o "${TMP_DIR}/rebuilt.apk"
unzip -q -o "${TMP_DIR}/rebuilt.apk" classes.dex -d "${TMP_DIR}/rebuilt-dex/"
cp "${TMP_DIR}/rebuilt-dex/classes.dex" "${ANDROID_DIR}/classes.dex"

# Finally build the package using the updated classes.dex
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
