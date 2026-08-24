// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * Drift firewall for the theme token pipeline. These tests exist to make
 * re-introducing a hand-copied color literal, a --sh-/--sk- namespace
 * collision, or an untested contrast pairing fail loudly - see
 * "Theme Token SSOT Collapse" plan for the full duplication inventory this
 * closes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

import {
  generateCssVariables,
  lightTokens,
  darkTokens,
  hexToRgbTriplet,
  type ThemeTokens,
} from '../tokens';
import { getAppShellStyles } from '../AppShell';
import { skeletonStyles } from '../skeletons';
import { componentStyles } from '../components';
import { staticTokens } from '../base';
import { generateHtmlEntry } from '../HtmlEntry';
import { BOOT_THEME_SCRIPT, resolveIsDark } from '../themeContract';
import { hexToRgb, contrastRatio } from './wcag';

const __dirname = dirname(fileURLToPath(import.meta.url));
const THEME_DIR = join(__dirname, '..');
const SRC_DIR = join(__dirname, '../../../..', 'src');

const HEX_LITERAL = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;

// Uses the LAST occurrence of the selector: getAppShellStyles() is
// `staticTokens + criticalCss`, and staticTokens has its own unrelated
// `:root { ...layout tokens... }` block ahead of the color-tokens one this
// helper actually wants.
function extractBlock(css: string, selector: string): string {
  const start = css.lastIndexOf(`${selector} {`);
  if (start === -1) throw new Error(`Selector "${selector}" not found`);
  const bodyStart = css.indexOf('{', start) + 1;
  const bodyEnd = css.indexOf('}', bodyStart);
  return css.slice(bodyStart, bodyEnd);
}

function extractVarDeclarations(cssBlock: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const match of cssBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    vars[match[1]] = match[2].trim();
  }
  return vars;
}

// Only `var(--x)` references WITHOUT a fallback are required to be defined
// somewhere globally - a fallback (`var(--x, default)`) is how this codebase
// marks a custom property as intentionally instance-scoped (set inline via
// a Vue :style binding, e.g. --score-raw, --ptr-offset), not a theme token.
function extractVarReferences(css: string): Set<string> {
  const refs = new Set<string>();
  for (const match of css.matchAll(/var\((--[\w-]+)\s*([,)])/g)) {
    if (match[2] === ')') refs.add(match[1]);
  }
  return refs;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'theme-tests') continue;
      walk(full, out);
    } else if (/\.(ts|vue)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('Theme token SSOT drift firewall', () => {
  it('has no hex literals in the theme-plumbing source files', () => {
    const files = ['AppShell.ts', 'HtmlEntry.ts'].map((f) => join(THEME_DIR, f));
    files.push(join(THEME_DIR, '../../shared/composables/useTheme.ts'));
    files.push(join(THEME_DIR, '../../../pwa-assets.config.ts'));

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const matches = source.match(HEX_LITERAL) ?? [];
      expect(matches, `${relative(THEME_DIR, file)} contains hex literal(s): ${matches.join(', ')}`).toEqual([]);
    }
  });

  it('generateCssVariables never emits a --sh- namespaced var (that namespace belongs solely to AppShell.ts)', () => {
    for (const tokens of [lightTokens, darkTokens]) {
      const shKeys = Object.keys(generateCssVariables(tokens)).filter((k) => k.startsWith('--sh-'));
      expect(shKeys).toEqual([]);
    }
  });

  it('every var(--x) referenced by the shell/skeleton/component CSS is actually defined somewhere', () => {
    const definedLight = new Set([
      ...Object.keys(generateCssVariables(lightTokens)),
      ...Object.keys(extractVarDeclarations(extractBlock(getAppShellStyles(), ':root'))),
      ...Object.keys(extractVarDeclarations(extractBlock(staticTokens, ':root'))),
    ]);

    const referenced = new Set([
      ...extractVarReferences(getAppShellStyles()),
      ...extractVarReferences(skeletonStyles),
      ...extractVarReferences(componentStyles),
    ]);

    const dangling = [...referenced].filter((v) => !definedLight.has(v));
    expect(dangling, `referenced but never defined: ${dangling.join(', ')}`).toEqual([]);
  });

  it('the static shell block is exactly generateCssVariables output plus the documented shell aliases', () => {
    for (const [selector, tokens] of [
      [':root', lightTokens],
      ['html.dark', darkTokens],
    ] as [string, ThemeTokens][]) {
      const declared = extractVarDeclarations(extractBlock(getAppShellStyles(), selector));
      const runtime = generateCssVariables(tokens);

      for (const [key, value] of Object.entries(runtime)) {
        expect(declared[key], `${selector} is missing ${key}`).toBe(value);
      }

      // Anything declared beyond the runtime set must be a --sh- alias -
      // this is the direct guard for the historical --sh-surf collision
      // (a shell-only var quietly diverging from the runtime value).
      const extras = Object.keys(declared).filter((k) => !(k in runtime));
      expect(extras.every((k) => k.startsWith('--sh-')), `unexpected non-alias extra var(s): ${extras.join(', ')}`).toBe(true);
    }
  });

  it('the boot script and resolveIsDark() agree on every (stored pref) x (OS preference) combination', () => {
    function runBootScript(pref: string | null, prefersDark: boolean): boolean {
      const classes = new Set<string>();
      const localStorage = { getItem: () => pref };
      const window = { matchMedia: () => ({ matches: prefersDark }) };
      const document = {
        documentElement: {
          classList: {
            add: (c: string) => classes.add(c),
            remove: (c: string) => classes.delete(c),
          },
        },
      };
       
      const run = new Function('localStorage', 'window', 'document', BOOT_THEME_SCRIPT);
      run(localStorage, window, document);
      return classes.has('dark');
    }

    for (const pref of [null, 'light', 'dark', 'auto', 'garbage']) {
      for (const prefersDark of [true, false]) {
        expect(runBootScript(pref, prefersDark)).toBe(resolveIsDark(pref, prefersDark));
      }
    }
  });

  it('hexToRgbTriplet round-trips against the hex it was derived from', () => {
    expect(hexToRgbTriplet('#0061a4')).toBe('0, 97, 164');
    expect(hexToRgbTriplet('#ffffff')).toBe('255, 255, 255');
    expect(hexToRgbTriplet('#000000')).toBe('0, 0, 0');
    for (const tokens of [lightTokens, darkTokens]) {
      expect(hexToRgbTriplet(tokens.color.primary)).toBe(
        generateCssVariables(tokens)['--sys-color-primary-rgb']
      );
    }
  });

  it('the generated HTML entry and manifest.json agree with tokens.ts on both brand background colors', () => {
    const html = generateHtmlEntry('0.0.0-test');
    expect(html).toContain(`content="${lightTokens.color.background}" media="(prefers-color-scheme: light)"`);
    expect(html).toContain(`content="${darkTokens.color.background}" media="(prefers-color-scheme: dark)"`);
    expect(html).toContain(`name="msapplication-TileColor" content="${darkTokens.color.background}"`);

    const manifestPath = join(THEME_DIR, '../../../public/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(
      manifest.theme_color,
      'public/manifest.json cannot import tokens.ts (static JSON) - keep it hand-synced to darkTokens.color.background'
    ).toBe(darkTokens.color.background);
    expect(manifest.background_color).toBe(darkTokens.color.background);
  });

  it('no file outside AppShell.ts references the shell-private --sh- namespace', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_DIR)) {
      if (file === join(THEME_DIR, 'AppShell.ts')) continue;
      const source = readFileSync(file, 'utf8');
      if (/--sh-/.test(source)) offenders.push(relative(SRC_DIR, file));
    }
    expect(offenders).toEqual([]);
  });

  it('light and dark token color shapes have exactly the same key set', () => {
    expect(Object.keys(lightTokens.color).sort()).toEqual(Object.keys(darkTokens.color).sort());
  });

  const CONTRAST_PAIRS: [keyof ThemeTokens['color'], keyof ThemeTokens['color']][] = [
    ['onPrimary', 'primary'],
    ['onPrimaryContainer', 'primaryContainer'],
    ['onSecondary', 'secondary'],
    ['onSecondaryContainer', 'secondaryContainer'],
    ['onError', 'error'],
    ['onErrorContainer', 'errorContainer'],
    ['onSuccess', 'success'],
    ['onSuccessContainer', 'successContainer'],
    ['onWarning', 'warning'],
    ['onWarningContainer', 'warningContainer'],
  ];

  it.each(CONTRAST_PAIRS)('%s on %s clears 4.5:1 in both themes', (onKey, bgKey) => {
    for (const [label, tokens] of [
      ['light', lightTokens],
      ['dark', darkTokens],
    ] as [string, ThemeTokens][]) {
      const ratio = contrastRatio(hexToRgb(tokens.color[onKey]), hexToRgb(tokens.color[bgKey]));
      expect(ratio, `${label} ${String(onKey)}/${String(bgKey)} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
