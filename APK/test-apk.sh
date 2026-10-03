#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR
#
# test-apk.sh - runs the JVM unit tests for the native layer in APK/test.
#
# The Java in APK/src had no tests of any kind. These run on a plain JVM, with
# no device, emulator or Gradle: the source compiles against android.jar, whose
# stub classes load normally and only throw when an Android method is actually
# called. So pure logic (arithmetic, formatting, validation) is testable today,
# while anything that touches a real Context, View or Service still needs a
# device. Toolchain and classpath come from toolchain-env.sh, the same inputs
# build-apk.sh compiles the shipped dex with.
#
#   ./APK/test-apk.sh
set -euo pipefail

# shellcheck source=toolchain-env.sh
source "$(dirname "$0")/toolchain-env.sh"

TEST_DIR="${ROOT}/test"
WORK="${ROOT}/.build/test"
TEST_CP="$(deps classpath test)"

rm -rf "${WORK}"
mkdir -p "${WORK}/src-classes" "${WORK}/test-classes"

echo "▶ Compiling APK/src (JDK ${JDK_MAJOR}, Java ${JAVA_TARGET})..."
javac "${JAVAC_PLATFORM[@]}" -nowarn -Xlint:none \
  -d "${WORK}/src-classes" "${ROOT}/src/com/albidr/clashmanager/"*.java 2>&1 | grep -v '^Note:' || true
[ -f "${WORK}/src-classes/com/albidr/clashmanager/BlitzService.class" ] || { echo "✗ APK/src did not compile"; exit 1; }

TEST_SOURCES=()
while IFS= read -r file; do TEST_SOURCES+=("${file}"); done < <(find "${TEST_DIR}" -name '*Test.java' | sort)
[ "${#TEST_SOURCES[@]}" -gt 0 ] || { echo "✗ no *Test.java files under ${TEST_DIR}"; exit 1; }

# JUnit comes before android.jar: android.jar ships its own junit.framework
# stubs, and the first class on the classpath wins.
RUN_CP="${WORK}/test-classes:${WORK}/src-classes:${TEST_CP}:${CP_LIBS}:${ANDROID_JAR}"

echo "▶ Compiling ${#TEST_SOURCES[@]} test class(es)..."
javac -cp "${RUN_CP}" -d "${WORK}/test-classes" "${TEST_SOURCES[@]}"

TEST_CLASSES=()
for file in "${TEST_SOURCES[@]}"; do
  rel="${file#"${TEST_DIR}/"}"
  rel="${rel%.java}"
  TEST_CLASSES+=("${rel//\//.}")
done

echo "▶ Running ${TEST_CLASSES[*]}"
java -cp "${RUN_CP}" org.junit.runner.JUnitCore "${TEST_CLASSES[@]}"
