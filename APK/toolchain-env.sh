# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR
#
# toolchain-env.sh - resolves the pinned native toolchain. Sourced, not run, by
# build-apk.sh and test-apk.sh, so both compile with exactly the same inputs.
#
# Every version comes from APK/toolchain.json. The JDK is validated rather than
# assumed, because javac output depends on its version: the same source compiled
# by a different JDK produces a different classes.dex.
#
# Sets: ROOT, JAVA_HOME (exported, and first on PATH), JDK_MAJOR, JAVA_TARGET, SDK, BT,
#       ANDROID_JAR, APKTOOL (array), APKTOOL_VERSION, CP_LIBS, MIN_API,
#       JAVAC_PLATFORM (array: javac platform, classpath and language level),
#       D8_ARGS (array), and deps().
#
# Env overrides:
#   JAVA_HOME                       a JDK whose major version is toolchain.json "jdkMajor"
#   ANDROID_HOME / ANDROID_SDK_ROOT an SDK holding the pinned build-tools and platform
#                                   (falls back to the legacy ~/.bubblewrap/android_sdk location)
#   APKTOOL_JAR                     an apktool jar to use instead of the pinned download

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

deps() { node "${ROOT}/fetch-build-deps.mjs" "$@"; }

JDK_MAJOR="$(deps get jdkMajor)"
JAVA_TARGET="$(deps get javaTarget)"
BT_VERSION="$(deps get buildTools)"
PLATFORM="$(deps get androidPlatform)"
APKTOOL_VERSION="$(deps get apktool.version)"

# ---- JDK -------------------------------------------------------------------
javac_major() { "$1/bin/javac" -version 2>&1 | sed -nE 's/^javac ([0-9]+).*/\1/p'; }

if [ -z "${JAVA_HOME:-}" ] || [ "$(javac_major "${JAVA_HOME}" 2>/dev/null)" != "${JDK_MAJOR}" ]; then
  for cand in \
    "$(/usr/libexec/java_home -v "${JDK_MAJOR}" 2>/dev/null || true)" \
    "/opt/homebrew/opt/openjdk@${JDK_MAJOR}/libexec/openjdk.jdk/Contents/Home" \
    "/usr/local/opt/openjdk@${JDK_MAJOR}/libexec/openjdk.jdk/Contents/Home" \
    "/usr/lib/jvm/java-${JDK_MAJOR}-openjdk-amd64" \
    "/usr/lib/jvm/temurin-${JDK_MAJOR}-jdk-amd64"; do
    if [ -n "${cand}" ] && [ -x "${cand}/bin/javac" ] && [ "$(javac_major "${cand}")" = "${JDK_MAJOR}" ]; then
      JAVA_HOME="${cand}"
      break
    fi
  done
fi
if [ -z "${JAVA_HOME:-}" ] || [ "$(javac_major "${JAVA_HOME}" 2>/dev/null)" != "${JDK_MAJOR}" ]; then
  echo "✗ JDK ${JDK_MAJOR} not found. Install it (macOS: brew install openjdk@${JDK_MAJOR}) or set JAVA_HOME."
  echo "  A different JDK compiles different bytecode, so classes.dex would no longer match the committed one."
  exit 1
fi
export JAVA_HOME
# d8, apktool and the test JVM are Java programs too; run them all on the pinned JDK.
export PATH="${JAVA_HOME}/bin:${PATH}"

# ---- Android SDK -------------------------------------------------------------
SDK=""
for cand in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "${HOME}/.bubblewrap/android_sdk" "${HOME}/Library/Android/sdk"; do
  if [ -n "${cand}" ] && [ -x "${cand}/build-tools/${BT_VERSION}/d8" ] && [ -f "${cand}/platforms/${PLATFORM}/android.jar" ]; then
    SDK="${cand}"
    break
  fi
done
if [ -z "${SDK}" ]; then
  echo "✗ No Android SDK with build-tools ${BT_VERSION} and ${PLATFORM} found."
  echo "  Set ANDROID_HOME, then: sdkmanager \"build-tools;${BT_VERSION}\" \"platforms;${PLATFORM}\""
  exit 1
fi
BT="${SDK}/build-tools/${BT_VERSION}"
ANDROID_JAR="${SDK}/platforms/${PLATFORM}/android.jar"

# ---- apktool -------------------------------------------------------------------
if [ -n "${APKTOOL_JAR:-}" ]; then
  APKTOOL=(java -jar "${APKTOOL_JAR}")
elif command -v apktool >/dev/null 2>&1 && [ "$(apktool --version 2>/dev/null)" = "${APKTOOL_VERSION}" ]; then
  APKTOOL=(apktool)
else
  APKTOOL=(java -jar "$(deps apktool)")
fi

CP_LIBS="$(deps classpath compile)"

# ---- javac platform --------------------------------------------------------------
# Above Java 8, javac refuses -bootclasspath, and compiling against the JDK's own
# java.base would accept APIs Android does not have (List.of, java.time, ...)
# that then crash on older phones. So, like the Android Gradle Plugin, turn the
# platform's core-for-system-modules.jar into a java.base module image and
# compile against that. The image is cached per platform jar and JDK build.
android_system_image() {
  local core="${SDK}/platforms/${PLATFORM}/core-for-system-modules.jar"
  [ -f "${core}" ] || { echo "✗ ${core} missing; javaTarget ${JAVA_TARGET} needs it" >&2; exit 1; }
  local key
  key="$( { shasum -a 256 "${core}" | cut -d' ' -f1; java -version 2>&1; } | shasum -a 256 | cut -c1-16)"
  local dir="${ROOT}/.deps/system-image-${key}"
  if [ ! -f "${dir}/image/lib/modules" ]; then
    echo "▶ Building the ${PLATFORM} system image for javac ${JDK_MAJOR}..." >&2
    rm -rf "${dir}"
    mkdir -p "${dir}/classes" "${dir}/module-src" "${dir}/module-out" "${dir}/jmods"
    (cd "${dir}/classes" && unzip -q "${core}")
    {
      echo "module java.base {"
      (cd "${dir}/classes" && find . -name '*.class' ! -name 'module-info.class' -exec dirname {} \; \
        | sort -u | sed 's#^\./##; s#/#.#g; s#^#  exports #; s#$#;#')
      echo "}"
    } > "${dir}/module-src/module-info.java"
    javac --system=none --patch-module "java.base=${core}" -d "${dir}/module-out" "${dir}/module-src/module-info.java"
    cp "${dir}/module-out/module-info.class" "${dir}/classes/"
    # jlink insists the module version equal its own, and needs a target
    # platform; the image is only ever read by javac, so neither is meaningful.
    jmod create --module-version "${JDK_MAJOR}" --target-platform linux-amd64 \
      --class-path "${dir}/classes" "${dir}/jmods/java.base.jmod"
    jlink --module-path "${dir}/jmods" --add-modules java.base --output "${dir}/image" --disable-plugin system-modules
    cp "${JAVA_HOME}/lib/jrt-fs.jar" "${dir}/image/lib/"
    rm -rf "${dir}/classes" "${dir}/module-src" "${dir}/module-out" "${dir}/jmods"
  fi
  printf '%s\n' "${dir}/image"
}

if [ "${JAVA_TARGET}" -le 8 ]; then
  JAVAC_PLATFORM=(-bootclasspath "${ANDROID_JAR}" -cp "${CP_LIBS}")
else
  JAVAC_PLATFORM=(--system "$(android_system_image)" -cp "${ANDROID_JAR}:${CP_LIBS}")
fi
JAVAC_PLATFORM+=(-source "${JAVA_TARGET}" -target "${JAVA_TARGET}")

# ---- d8 --------------------------------------------------------------------------
# d8 desugars lambdas, records and nest access for the app's real minimum API,
# and needs the compile jars to see the interfaces those lambdas implement.
MIN_API="$(sed -nE "s/^[[:space:]]*minSdkVersion:[[:space:]]*'?([0-9]+)'?.*/\1/p" "${ROOT}/android/apktool.yml")"
[ -n "${MIN_API}" ] || { echo "✗ minSdkVersion not found in ${ROOT}/android/apktool.yml"; exit 1; }
D8_ARGS=(--release --min-api "${MIN_API}" --lib "${ANDROID_JAR}")
IFS=':' read -r -a _cp_jars <<< "${CP_LIBS}"
for _jar in "${_cp_jars[@]}"; do D8_ARGS+=(--classpath "${_jar}"); done
unset _cp_jars _jar
