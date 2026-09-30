#!/usr/bin/env bash
#
# build-apk.sh - Clash Manager APK compilation & sanity checks.
#
# Compiles the custom Java sources from APK/src/ into a DEX file, merges them
# into the smali decoded from the committed APK/android/classes.dex, writes the
# result back to APK/android/classes.dex, and packages android/ with apktool.
#
#   ./build-apk.sh --no-sign       # compile, merge, package unsigned + verify integrity (typical dev flow)
#   ./build-apk.sh --check         # prove APK/android/classes.dex was built from APK/src; writes no tracked file (CI gate)
#   ./build-apk.sh --dev           # --no-sign, then package "CM Dev": a debuggable copy under its own package id,
#                                  # signed with the local debug key, that installs next to the real app
#   ./build-apk.sh                 # build + sign (only if local keystore is available)
#
# Toolchain: every version (JDK, build-tools, platform, apktool, compile jars) is
# pinned in APK/toolchain.json and resolved by toolchain-env.sh, so this runs
# the same on any Mac, Linux box or CI runner. See toolchain-env.sh for the
# JAVA_HOME, ANDROID_HOME and APKTOOL_JAR overrides.
#
# Env overrides (signing only):
#   CLASHMANAGER_KEYSTORE  signing keystore (default: ~/.clash-manager-signing/android.keystore)
#   CLASHMANAGER_KEY_ALIAS keystore alias   (default: android)
#   CLASHMANAGER_KEY_PASS  keystore password (if set, signing runs non-interactively)
#
# Env overrides (--dev only):
#   CLASHMANAGER_DEV_URL   PWA the dev variant loads (default: the production PWA)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ANDROID_DIR="${ROOT}/android"
SRC_DIR="${ROOT}/src"
OUT="${ROOT}/release"
TMP_DIR="${ROOT}/.build"

MODE="${1:-sign}"
case "${MODE}" in
  --no-sign|--check|--dev|sign) ;;
  *) echo "usage: build-apk.sh [--no-sign|--check|--dev]"; exit 2 ;;
esac

# shellcheck source=toolchain-env.sh
source "$(dirname "$0")/toolchain-env.sh"

[ -d "${ANDROID_DIR}" ] || { echo "✗ ${ANDROID_DIR} missing (the recovered project)"; exit 1; }

# Wraps a bare classes.dex in a zip so apktool can decode it to smali.
decode_dex() {
  local dex="$1" dest="$2" work
  work="$(mktemp -d "${TMP_DIR}/wrap.XXXXXX")"
  cp "${dex}" "${work}/classes.dex"
  (cd "${work}" && zip -q -r wrapped.apk classes.dex)
  "${APKTOOL[@]}" d -f -q "${work}/wrapped.apk" -o "${dest}" >/dev/null
  rm -rf "${work}"
}

echo "▶ Compiling custom Java source files (JDK ${JDK_MAJOR}, Java ${JAVA_TARGET}, minSdk ${MIN_API}, build-tools ${BT_VERSION}, apktool ${APKTOOL_VERSION})..."
rm -rf "${TMP_DIR}"
mkdir -p "${TMP_DIR}/classes" "${TMP_DIR}/dex"

# Compile clean Java source tree without debug information for minification.
javac "${JAVAC_PLATFORM[@]}" -g:none -d "${TMP_DIR}/classes" "${SRC_DIR}/com/albidr/clashmanager/"*.java

# Convert compiled classes to Dalvik DEX format; D8_ARGS carries --release, the
# app's --min-api and the compile classpath (see toolchain-env.sh).
"${BT}/d8" "${D8_ARGS[@]}" $(find "${TMP_DIR}/classes" -name "*.class") --output "${TMP_DIR}/dex/"

echo "▶ Disassembling compiled classes to smali..."
decode_dex "${TMP_DIR}/dex/classes.dex" "${TMP_DIR}/smali-new"

# The base is always the committed classes.dex. It carries the ~7,000 library
# classes (androidx, kotlin, com.google) that have no source here, plus the
# generated R classes. Using any other base, such as a leftover local build,
# would let two machines start from different inputs.
decode_dex "${ANDROID_DIR}/classes.dex" "${TMP_DIR}/smali-orig"

if [ "${MODE}" = "--check" ]; then
  echo "▶ Comparing APK/src against the committed classes.dex..."
  node "${ROOT}/verify-dex-source.mjs" "${TMP_DIR}/smali-new" "${TMP_DIR}/smali-orig"
  exit $?
fi

# Replace every app class with the freshly compiled set. Deleting first matters:
# copying over the top would keep any class the source no longer produces (an
# anonymous class that was removed, a synthetic helper from an older compiler),
# and those orphans used to accumulate in the shipped dex. The generated R
# classes have no Java source and stay.
echo "▶ Injecting new custom layer classes into smali tree..."
APP_SMALI="${TMP_DIR}/smali-orig/smali/com/albidr/clashmanager"
find "${APP_SMALI}" -maxdepth 1 -name '*.smali' ! -name 'R.smali' ! -name 'R$*.smali' -delete
cp "${TMP_DIR}/smali-new"/smali/com/albidr/clashmanager/*.smali "${APP_SMALI}/"

# Reassemble the merged smali files into the final classes.dex file in our source-controlled directory
echo "▶ Reassembling smali back to classes.dex..."
"${APKTOOL[@]}" b "${TMP_DIR}/smali-orig" -o "${TMP_DIR}/rebuilt.apk"
unzip -q -o "${TMP_DIR}/rebuilt.apk" classes.dex -d "${TMP_DIR}/rebuilt-dex/"
cp "${TMP_DIR}/rebuilt-dex/classes.dex" "${ANDROID_DIR}/classes.dex"

# Finally build the package using the updated classes.dex
#
# apktool caches its last decode under android/build/ and skips re-injecting the
# manifest/resources when it thinks nothing changed ("AndroidManifest.xml and
# resources have not changed"), which silently ships a stale versionCode/
# versionName baked into that cache instead of the current apktool.yml. android/build/
# is untracked (.gitignore'd) so this cache only exists locally - CI always starts
# from a clean checkout and is unaffected - but a local build can otherwise report
# (and verify-apk-integrity.mjs can otherwise pass) the WRONG version.
rm -rf "${ANDROID_DIR}/build"
mkdir -p "${OUT}"
echo "▶ Building from android/ via apktool ..."
"${APKTOOL[@]}" b "${ANDROID_DIR}" -o "${OUT}/clashmanager-unsigned.apk"

export AAPT2="${BT}/aapt2"

if [ "${MODE}" = "--no-sign" ] || [ "${MODE}" = "--dev" ]; then
  echo "▶ Verifying integrity (unsigned) ..."
  node "${ROOT}/verify-apk-integrity.mjs" "${OUT}/clashmanager-unsigned.apk"
  echo "✓ Unsigned APK: ${OUT}/clashmanager-unsigned.apk"
  [ "${MODE}" = "--dev" ] || exit 0
fi

if [ "${MODE}" = "--dev" ]; then
  echo "▶ Packaging the CM Dev variant ..."
  DEV_DIR="${TMP_DIR}/dev-android"
  rm -rf "${DEV_DIR}"
  cp -R "${ANDROID_DIR}" "${DEV_DIR}"
  rm -rf "${DEV_DIR}/build"
  node "${ROOT}/make-dev-variant.mjs" "${DEV_DIR}" ${CLASHMANAGER_DEV_URL:+"${CLASHMANAGER_DEV_URL}"}
  "${APKTOOL[@]}" b "${DEV_DIR}" -o "${TMP_DIR}/dev-unsigned.apk"

  # Android's standard debug key, created the way the Android Gradle Plugin
  # creates it. Its password is the public "android": it signs nothing but
  # local dev builds, and it is never the release keystore.
  DEBUG_KEYSTORE="${HOME}/.android/debug.keystore"
  RELEASE_KEYSTORE="${CLASHMANAGER_KEYSTORE:-${HOME}/.clash-manager-signing/android.keystore}"
  if [ -f "${RELEASE_KEYSTORE}" ] && [ "$(cd "$(dirname "${RELEASE_KEYSTORE}")" && pwd -P)/$(basename "${RELEASE_KEYSTORE}")" = "$(cd "$(dirname "${DEBUG_KEYSTORE}")" 2>/dev/null && pwd -P)/$(basename "${DEBUG_KEYSTORE}")" ]; then
    echo "✗ the debug keystore path is the release keystore; refusing to sign a debuggable build with it"
    exit 1
  fi
  if [ ! -f "${DEBUG_KEYSTORE}" ]; then
    mkdir -p "$(dirname "${DEBUG_KEYSTORE}")"
    keytool -genkeypair -keystore "${DEBUG_KEYSTORE}" -storepass android -keypass android \
      -alias androiddebugkey -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000 >/dev/null
  fi
  "${BT}/zipalign" -f -p 4 "${TMP_DIR}/dev-unsigned.apk" "${TMP_DIR}/dev-aligned.apk"
  "${BT}/apksigner" sign --ks "${DEBUG_KEYSTORE}" --ks-key-alias androiddebugkey \
    --ks-pass pass:android --key-pass pass:android \
    --out "${OUT}/clashmanager-dev.apk" "${TMP_DIR}/dev-aligned.apk"

  DEV_BADGING="$("${AAPT2}" dump badging "${OUT}/clashmanager-dev.apk")"
  grep -q "package: name='com.albidr.clashmanager.dev'" <<< "${DEV_BADGING}" || { echo "✗ dev APK has the wrong package id"; exit 1; }
  grep -q "application-debuggable" <<< "${DEV_BADGING}" || { echo "✗ dev APK is not debuggable"; exit 1; }
  echo "✓ CM Dev APK: ${OUT}/clashmanager-dev.apk (install: node APK/apk-dev.mjs install)"
  exit 0
fi

KEYSTORE="${CLASHMANAGER_KEYSTORE:-${HOME}/.clash-manager-signing/android.keystore}"
KEY_ALIAS="${CLASHMANAGER_KEY_ALIAS:-android}"
[ -f "${KEYSTORE}" ] || { echo "✗ keystore not found: ${KEYSTORE} (set CLASHMANAGER_KEYSTORE)"; exit 1; }

echo "▶ Zipalign ..."
"${BT}/zipalign" -f -p 4 "${OUT}/clashmanager-unsigned.apk" "${OUT}/clashmanager-aligned.apk"

echo "▶ Signing ..."
if [ -n "${CLASHMANAGER_KEY_PASS:-}" ]; then
  "${BT}/apksigner" sign --ks "${KEYSTORE}" --ks-key-alias "${KEY_ALIAS}" \
    --ks-pass "pass:${CLASHMANAGER_KEY_PASS}" \
    --out "${OUT}/clashmanager.apk" "${OUT}/clashmanager-aligned.apk"
else
  echo "  (no CLASHMANAGER_KEY_PASS set - prompting interactively; set it in CI to avoid hanging)"
  "${BT}/apksigner" sign --ks "${KEYSTORE}" --ks-key-alias "${KEY_ALIAS}" \
    --out "${OUT}/clashmanager.apk" "${OUT}/clashmanager-aligned.apk"
fi

echo "▶ Verifying native-layer integrity (release gate) ..."
node "${ROOT}/verify-apk-integrity.mjs" "${OUT}/clashmanager.apk"

echo "✓ Release APK: ${OUT}/clashmanager.apk"
