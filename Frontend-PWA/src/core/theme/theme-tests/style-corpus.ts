// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * CLASH MANAGER - Style Corpus Helpers (test support, Layer 1)
 * ----------------------------------------------------------------------------
 * Shared source-reading primitives for the checks in this folder.
 *
 * @remarks
 * Every firewall here needs the same three things before it can assert
 * anything: the set of authored files, the CSS inside them, and the scale a
 * token group declares. `dead-selectors.spec.ts` and `theme-ssot.spec.ts` each
 * grew a private copy of the first two, and the motion check would have been a
 * third. Three copies of a walker is three chances for one of them to quietly
 * stop seeing a directory, which is the exact failure these checks exist to
 * catch, so it lives here once instead.
 *
 * `readScale` matters more than it looks. A check that hardcodes the values it
 * permits has to be edited every time the design system grows, and the edit is
 * invisible if it is forgotten - the check keeps passing while permitting
 * something that no longer exists, or fails on a token that does. Reading the
 * scale out of `base.ts` means adding a token widens the allowance by itself
 * and removing one narrows it, which is the ADR's dynamic-architecture rule
 * applied to the tooling rather than only to the app.
 *
 * Sibling `*-tests` folders are excluded throughout: a spec's own fixtures are
 * not authored UI and must never count as either usage or violation.
 * ============================================================================
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/** File extensions that can carry authored styles or tokens. */
const SOURCE_EXTENSIONS = new Set(['.vue', '.ts']);

/** Directory names that never contain authored UI. */
const EXCLUDED_DIRECTORIES = /(^__tests__$)|(-tests$)/;

/**
 * Collects every authored source file beneath a directory.
 *
 * @param directory - Absolute path to walk.
 * @param collected - Accumulator used by the recursive calls.
 * @returns Absolute paths, test siblings excluded.
 */
export function walkSource(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.test(entry)) walkSource(full, collected);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(extname(entry))) collected.push(full);
  }
  return collected;
}

/** A block of CSS together with where it starts in its file. */
export interface StyleBody {
  /** The CSS itself. */
  css: string;
  /** 1-indexed line in the file where `css` begins. */
  startLine: number;
}

/**
 * Extracts the CSS an authored file contributes.
 *
 * @param path - File to read.
 * @returns Every `<style>` body for an SFC, the whole module for a theme file
 *   that exports CSS as a template literal, and an empty array otherwise.
 *
 * @remarks
 * The start line travels with the body because a finding reported at the line
 * it sits on *within a style block* points at the wrong place in the file, and
 * a firewall that misdirects the reader is worse than one that says nothing -
 * it costs trust the first time someone opens the named line and finds
 * unrelated markup there.
 */
export function styleBodies(path: string): StyleBody[] {
  const source = readFileSync(path, 'utf8');
  const lineOf = (index: number): number => source.slice(0, index).split('\n').length;

  if (path.endsWith('.vue')) {
    return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => ({
      css: match[1],
      startLine: lineOf(match.index + match[0].indexOf(match[1])),
    }));
  }
  // A theme module contributes CSS only if it exports a backtick block.
  return /export const \w+(?::\s*\w+)?\s*=\s*`/.test(source) ? [{ css: source, startLine: 1 }] : [];
}

/**
 * Blanks CSS block comments while preserving line structure.
 *
 * @param css - A style body.
 * @returns The same text with every comment replaced by spaces, so line and
 *   column numbers still line up with the file.
 *
 * @remarks
 * A decision log that names the value it replaced - "its light green #166534
 * against --sys-color-success" - is documentation, not a declaration, and a
 * check that cannot tell the difference punishes the comments that explain
 * themselves best.
 */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  );
}

/**
 * Reads the numeric values a token group declares, in declaration order.
 *
 * @param tokenSource - Contents of the module declaring the tokens.
 * @param prefix - Token prefix without the leading `--sys-`, e.g. `space`.
 * @param unit - `px` for lengths, `ms` for durations (which normalises `s`).
 * @returns Ascending, de-duplicated values in the requested unit.
 *
 * @example
 * readScale(base, 'motion-duration', 'ms') // [100, 200, 250, 300, 400, 500, 800]
 */
export function readScale(tokenSource: string, prefix: string, unit: 'px' | 'ms'): number[] {
  const pattern =
    unit === 'px'
      ? new RegExp(String.raw`--sys-${prefix}[\w-]*:\s*([\d.]+)px`, 'g')
      : new RegExp(String.raw`--sys-${prefix}[\w-]*:\s*([\d.]+)(m?s)`, 'g');

  const values = new Set<number>();
  for (const match of tokenSource.matchAll(pattern)) {
    const raw = Number(match[1]);
    values.add(unit === 'ms' && match[2] === 's' ? raw * 1000 : raw);
  }
  return [...values].sort((first, second) => first - second);
}

/**
 * Finds every duration literal in a CSS body.
 *
 * @param css - A style body.
 * @returns Each duration in milliseconds, paired with the line it sits on.
 *
 * @remarks
 * Only `transition` and `animation` declarations are read. A bare `2s` inside
 * an unrelated property is not a motion decision and must not be graded as one.
 */
export function durationLiterals(css: string): { ms: number; line: number; text: string }[] {
  const found: { ms: number; line: number; text: string }[] = [];
  css.split('\n').forEach((text, index) => {
    for (const declaration of text.matchAll(/(?:transition|animation)[\w-]*\s*:\s*([^;]*)/g)) {
      for (const literal of declaration[1].matchAll(/\b(\d*\.?\d+)(m?s)\b/g)) {
        const raw = Number(literal[1]);
        found.push({
          ms: literal[2] === 's' ? raw * 1000 : raw,
          line: index + 1,
          text: text.trim(),
        });
      }
    }
  });
  return found;
}
