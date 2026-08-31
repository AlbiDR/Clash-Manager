// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// Single source of truth for deriving an Android versionCode from the project
// semver. Before this module the same arithmetic was written out by hand in
// four places (validate-project.ts twice, verify-apk-integrity.mjs,
// audit-wrapper-integrity.mjs) plus a fifth copy inside the shipped PWA, and
// they had no way of disagreeing loudly.
//
// THE BUG THIS REPLACES
// The old formula was `major * 1000 + minor * 100 + patch * 10`. Each component
// was given a slot only 10 wide while the components themselves are unbounded,
// so any patch above 9 overflowed its slot and borrowed from the minor slot:
//
//   14.46.22 -> 14000 + 4600 + 220 = 18820
//   14.47.0  -> 14000 + 4700 +   0 = 18700   LOWER, by 120
//
// A minor bump from any x.y.z with z > 10 therefore produced a versionCode
// BELOW the version before it, and Android refuses to install an APK whose
// versionCode is lower than the installed one. Every user would have silently
// stopped receiving updates, with no error anywhere to say why. The same class
// of failure applied to a major bump whenever minor was above 10.
//
// WHY THIS ONE CANNOT DO THAT
// Each component gets a slot 1000 wide, and, more importantly, the slot width
// is ENFORCED rather than assumed: a component that would overflow throws
// instead of silently corrupting the value. A formula that is merely correct
// for the inputs someone imagined is what produced the previous bug. This one
// is correct for every input it accepts, and rejects everything else loudly.
//
// Headroom: with major 999 the largest possible code is 999_999_999, comfortably
// inside Android's 2_100_000_000 ceiling.
//
// THE ONE-TIME MIGRATION, RECORDED BECAUSE IT IS INVISIBLE FROM THE CODE
// Changing this derivation is only safe on a PATCH release, and the release
// that carried it (14.46.23, over 14.46.22 installed) was one. The reason is
// that an already-installed app decides whether an update exists using ITS OWN
// build of the app, which contains the OLD derivation. Until a device has taken
// the new build, the old arithmetic is what governs whether it is offered:
//
//   installed 14.46.22, real code 18820 (built by the old formula)
//   next      14.46.23, real code 14046023 (built by this one)
//   the old app derives 18830 from the filename, sees 18820 < 18830, offers it
//   Android accepts the install because 14046023 > 18820
//
// Had that release been a minor bump instead, the old app would have derived
// 18700 for 14.47.0, concluded from 18820 > 18700 that it was already newer,
// and every existing user would have been cut off from all future updates with
// nothing logged anywhere. If this derivation ever has to change again, the
// same rule applies: ship it on a release the PREVIOUS scheme also considers
// an increase.

// Widest value any single semver component may take. Not a tuning knob: it is
// the slot width the formula below is built on, and the two must move together.
export const MAX_COMPONENT = 999;

// Android's hard ceiling for versionCode.
export const ANDROID_MAX_VERSION_CODE = 2_100_000_000;

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(version) {
  const match = SEMVER_PATTERN.exec(String(version ?? "").trim());
  if (!match) {
    throw new Error(`Not a valid semver string: ${JSON.stringify(version)}. Expected "MAJOR.MINOR.PATCH".`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * Derives the Android versionCode for a semver string.
 *
 * Strictly increasing in semver order for every accepted input, which is the
 * only property Android actually requires of it.
 */
export function androidVersionCode(version) {
  const { major, minor, patch } = parseSemver(version);

  // The overflow guard is the whole point. Silently returning a wrong number is
  // what stranded users last time, so an out-of-range component is a hard error.
  for (const [name, value] of [["minor", minor], ["patch", patch]]) {
    if (value > MAX_COMPONENT) {
      throw new Error(
        `Cannot derive an Android versionCode for ${version}: ${name} is ${value}, above the maximum of ${MAX_COMPONENT}. `
        + "Raising MAX_COMPONENT would change the slot width and renumber every future release, "
        + "so this needs a deliberate migration, not a quick edit.",
      );
    }
  }

  const code = major * 1_000_000 + minor * 1_000 + patch;

  if (code > ANDROID_MAX_VERSION_CODE) {
    throw new Error(`Derived versionCode ${code} for ${version} exceeds Android's maximum of ${ANDROID_MAX_VERSION_CODE}.`);
  }
  return code;
}

/**
 * Guards a release against shipping a versionCode at or below the one already
 * recorded, whatever the reason.
 *
 * This is the belt to the formula's braces, and it is deliberately independent
 * of the formula: it compares actual numbers rather than trusting that whatever
 * arithmetic produced them was monotonic. A future edit to the formula that
 * reintroduced a regression would be caught here even though the formula itself
 * looked fine to whoever wrote it.
 */
export function assertVersionCodeNotRegressed(previousCode, nextCode, context = "versionCode") {
  if (!Number.isInteger(previousCode)) return nextCode;
  if (nextCode <= previousCode) {
    throw new Error(
      `${context} would regress: ${previousCode} -> ${nextCode}. `
      + "Android refuses to install an APK whose versionCode is not above the installed one, so shipping this "
      + "would silently cut existing users off from all future updates.",
    );
  }
  return nextCode;
}
