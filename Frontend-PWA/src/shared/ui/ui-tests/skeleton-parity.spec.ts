// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * Drift firewall for loading skeletons.
 *
 * A skeleton exists to occupy exactly the space its real component will, so
 * that hydrating a screen changes what is drawn and not where anything sits.
 * Nothing in the type system or the linter relates a placeholder to the thing
 * it stands in for, so every one of these pairs had drifted: the settings
 * skeleton carried a 24px radius against the real card's 8px and a header
 * padded 16px/20px against 12px/16px, and `.sk-button-m` stood 44px tall
 * against `.btn-action`'s 48px.
 *
 * These tests compare the declarations directly, so restyling one half of a
 * pair without the other fails here rather than shipping as a visible jump.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(__dirname, '..');
const THEME_DIR = join(__dirname, '../../../core/theme');

/**
 * Reads one CSS rule's declarations out of a source file.
 *
 * @param source - The file contents to search.
 * @param selector - The exact selector text to match.
 * @returns The declarations, keyed by property.
 */
function readRule(source: string, selector: string): Record<string, string> {
  const start = source.indexOf(`${selector} {`);
  expect(start, `selector "${selector}" not found`).toBeGreaterThan(-1);
  const body = source.slice(source.indexOf('{', start) + 1, source.indexOf('}', start));
  const declarations: Record<string, string> = {};
  for (const match of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) {
    declarations[match[1]] = match[2].trim();
  }
  return declarations;
}

const settingsCard = readFileSync(join(UI_DIR, 'SettingsCard.vue'), 'utf8');
const settingsSkeleton = readFileSync(join(UI_DIR, 'SkeletonSettingsCard.vue'), 'utf8');
const skeletonStyles = readFileSync(join(THEME_DIR, 'skeletons.ts'), 'utf8');
const componentStyles = readFileSync(join(THEME_DIR, 'components.ts'), 'utf8');

describe('skeleton geometry matches the component it stands in for', () => {
  const SETTINGS_CARD_SHARED = ['border-radius', 'background', 'border'];

  it.each(SETTINGS_CARD_SHARED)(
    'SkeletonSettingsCard and SettingsCard agree on .settings-card %s',
    (property) => {
      const real = readRule(settingsCard, '.settings-card');
      const skeleton = readRule(settingsSkeleton, '.settings-card');
      expect(skeleton[property]).toBe(real[property]);
    }
  );

  it('neither settings card contributes its own outer spacing', () => {
    // The settings column supplies the gap. A margin on either half makes the
    // two lists space themselves differently.
    expect(readRule(settingsCard, '.settings-card').margin).toBe('0');
    expect(readRule(settingsSkeleton, '.settings-card').margin).toBe('0');
    expect(readRule(settingsSkeleton, '.settings-card')['margin-bottom']).toBeUndefined();
  });

  const CARD_HEADER_SHARED = ['min-height', 'padding', 'gap'];

  it.each(CARD_HEADER_SHARED)(
    'SkeletonSettingsCard and SettingsCard agree on .card-header %s',
    (property) => {
      const real = readRule(settingsCard, '.card-header');
      const skeleton = readRule(settingsSkeleton, '.card-header');
      expect(skeleton[property]).toBe(real[property]);
    }
  );

  it('.sk-button-m stands as tall as the .btn-action it replaces', () => {
    expect(readRule(skeletonStyles, '.sk-button-m').height).toBe(
      readRule(componentStyles, '.btn-action').height
    );
  });

  it('.sk-card declares no height of its own', () => {
    // Height is bound per capture group by BaseCardSkeleton, because MemberCard
    // and RecruitCard are not the same height and one flat value here resized
    // every row of whichever list it did not describe.
    expect(readRule(skeletonStyles, '.sk-card').height).toBeUndefined();
  });

  it('the live app reserves the same top inset as the static pre-paint shell', () => {
    // [THREAT:] The shell is replaced wholesale at mount. Any padding it
    // declares and the app does not becomes an instant jump of that size, and
    // the notch inset makes this the largest one in the app.
    const appShell = readFileSync(join(THEME_DIR, 'AppShell.ts'), 'utf8');
    const app = readFileSync(join(UI_DIR, '../../app/App.vue'), 'utf8');

    expect(readRule(app, '.app-container')['padding-top']).toBe(
      readRule(appShell, '#app-shell')['padding-top']
    );
  });
});
