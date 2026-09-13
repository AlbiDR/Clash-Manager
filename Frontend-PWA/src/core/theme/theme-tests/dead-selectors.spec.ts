// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * Drift firewall for CSS selectors that can never match anything.
 *
 * A rule whose selector names a class no element carries is invisible in every
 * way that matters: it compiles, it lints, it ships, and it silently does
 * nothing. Four defects of exactly this shape were found in one audit:
 *
 * - `core/theme/components.ts` shrank the console header's title through
 *   `.header-wrapper.is-scrolled .view-title`. No `.header-wrapper` exists
 *   anywhere in the app, so the header collapsed its padding and radius around
 *   a title that stayed at full size.
 * - `ModeSettings.vue` targeted `.toggle-row .row-label`. SettingRow's root is
 *   `.setting-row`, and a scoped block cannot reach a child component's
 *   internals without `:deep()` in any case, so an active master container
 *   painted its own background while the row kept resting-surface ink on it.
 * - `BackendRefresher.vue` declared `.no-padding` in its own scoped block and
 *   passed the name to SettingsCard, where the scope attribute made it
 *   unmatchable.
 * - `LaboratoryView.vue`, `base.ts`, `components.ts` and `skeletons.ts` each
 *   carried at least one rule for markup that no longer exists.
 *
 * The analysis is deliberately conservative. A component whose class bindings
 * cannot be resolved statically is skipped in full rather than guessed at, and
 * the set of skipped components is pinned below so that coverage cannot quietly
 * collapse to nothing while this file keeps reporting success.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '../../..');

/**
 * Theme modules that export a global stylesheet as a template literal.
 *
 * @remarks
 * Their selectors are not scoped to one component, so they are checked against
 * every template and script in the tree rather than against a single file.
 */
const GLOBAL_STYLE_MODULES = ['components.ts', 'skeletons.ts', 'AppShell.ts', 'base.ts', 'animations.ts'];

/**
 * Components whose class bindings cannot be resolved by static reading, and
 * which are therefore not analysed at all.
 *
 * @remarks
 * Each entry binds a class from a value only the running app knows, such as
 * `:class="apiStatus"` or `:class="rarity.toLowerCase()"`. Such a binding can
 * produce any class name, so no selector in that file can be proven dead.
 *
 * [THREAT:] Without pinning this list, one new dynamic binding would remove a
 * component from the analysis with no visible signal, and this suite would go
 * on passing while checking less and less. A new skip has to be added here
 * deliberately.
 */
const UNRESOLVABLE_COMPONENTS = [
  'app/App.vue',
  'features/laboratory/components/SummaryCard.vue',
  'features/laboratory/components/TrajectoryItem.vue',
  'features/laboratory/components/VaultCard.vue',
  'features/settings/components/NetworkSettings.vue',
  'shared/ui/BaseSelect.vue',
  'shared/ui/BenchmarkContent.vue',
  'shared/ui/EventManagement.vue',
  'shared/ui/MomentumPill.vue',
  'shared/ui/RoleBadge.vue',
  'shared/ui/SettingsCard.vue',
  'shared/ui/StatusPill.vue',
  'shared/ui/Toast.vue',
];

/** Classes Vue generates for a `<Transition name="x">`, as suffixes of that name. */
const TRANSITION_SUFFIXES = [
  'enter-from', 'enter-active', 'enter-to',
  'leave-from', 'leave-active', 'leave-to',
  'move',
];

const NESTING_AT_RULES = /^@(media|supports|container|layer|scope)\b/;

/**
 * Extracts the body of the first top-level block for a tag, counting nesting.
 *
 * @remarks
 * [THREAT:] A non-greedy `<template>([\s\S]*?)</template>` truncates at the
 * first nested `<template #slot>`, hiding most of the markup and making
 * everything styled below it look unreferenced.
 *
 * @param source - The file contents.
 * @param tag - The tag name to extract.
 * @returns The block body and its offset, or null when the tag is absent.
 */
function balancedBlock(source: string, tag: string): { body: string; start: number } | null {
  const opening = new RegExp(`<${tag}(\\s[^>]*)?>`);
  const first = opening.exec(source);
  if (!first) return null;

  const bodyStart = first.index + first[0].length;
  const scan = new RegExp(`<${tag}(?:\\s[^>]*)?>|</${tag}>`, 'g');
  scan.lastIndex = bodyStart;

  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = scan.exec(source))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return { body: source.slice(bodyStart, match.index), start: bodyStart };
  }
  return { body: source.slice(bodyStart), start: bodyStart };
}

/** Replaces comment bodies with blanks, preserving every line and offset. */
function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

interface SelectorList {
  selector: string;
  line: number;
  start: number;
  end: number;
}

/**
 * Collects every selector list in a stylesheet with its 1-based line.
 *
 * @remarks
 * Declaration bodies are never scanned, which is what keeps a `.5s` duration or
 * a `foo.ts` mentioned in a comment from being read as a class. `@keyframes`,
 * `@font-face` and `@property` bodies are skipped entirely, since their
 * contents are step percentages and descriptors rather than selectors, while
 * `@media` and friends are descended into because their children are rules.
 *
 * @param css - The stylesheet text.
 * @returns Each selector list with its line and offsets.
 */
function selectorLists(css: string): SelectorList[] {
  const clean = blankComments(css);
  const found: SelectorList[] = [];
  const stack: ('rule' | 'container' | 'skip')[] = [];

  let prelude = '';
  let preludeLine = 1;
  let line = 1;

  for (let index = 0; index < clean.length; index++) {
    const character = clean[index];
    if (character === '\n') line++;
    const enclosing = stack[stack.length - 1];

    if (enclosing === 'skip') {
      if (character === '{') stack.push('skip');
      else if (character === '}') stack.pop();
      continue;
    }

    if (character === '{') {
      const text = prelude.trim();
      if (text.startsWith('@')) {
        stack.push(NESTING_AT_RULES.test(text) ? 'container' : 'skip');
      } else if (enclosing === undefined || enclosing === 'container') {
        if (text) {
          found.push({ selector: text, line: preludeLine, start: index - prelude.length, end: index });
        }
        stack.push('rule');
      } else {
        stack.push('skip');
      }
      prelude = '';
    } else if (character === '}') {
      stack.pop();
      prelude = '';
    } else if (enclosing !== 'rule') {
      // Anchor the reported line to where the selector text starts, so blank
      // lines between rules are not counted against it.
      if (prelude.trim() === '' && !/\s/.test(character)) preludeLine = line;
      prelude += character;
    }
  }

  return found;
}

const PIERCING = /(?::deep|::v-deep|::part|:global)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)|\/deep\/|>>>/g;
const GLOBAL_HOST = /^(?::root|html|body)/;

/**
 * Class names a selector list actually depends on within its own component.
 *
 * @remarks
 * `:deep(...)` and its variants address a child component's internals, which
 * are legitimately absent from the local template. A class hung off `:root`,
 * `html` or `body` is applied to the document by the theme layer rather than
 * written in any template, so it is likewise not this component's to prove.
 *
 * @param selectorList - One comma-separated selector list.
 * @returns The class names the list requires locally.
 */
function localClasses(selectorList: string): Set<string> {
  const names = new Set<string>();

  for (const selector of selectorList.split(',')) {
    for (const compound of selector.replace(PIERCING, ' ').split(/[\s>+~]+/)) {
      if (!compound || GLOBAL_HOST.test(compound)) continue;
      for (const match of compound.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) names.add(match[1]);
    }
  }

  return names;
}

/**
 * Splits an expression on a separator, ignoring separators inside brackets or quotes.
 *
 * @param text - The expression text.
 * @param separator - The single character to split on.
 * @returns The top-level parts.
 */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let buffer = '';

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quote) {
      buffer += character;
      if (character === quote && text[index - 1] !== '\\') quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      buffer += character;
      continue;
    }
    if ('([{'.includes(character)) depth++;
    if (')]}'.includes(character)) depth--;
    if (character === separator && depth === 0) {
      parts.push(buffer);
      buffer = '';
      continue;
    }
    buffer += character;
  }

  parts.push(buffer);
  return parts;
}

interface ClassFacts {
  names: Set<string>;
  prefixes: Set<string>;
  unresolvable: boolean;
  reason: string;
}

/**
 * Resolves the class names a `:class` expression can produce.
 *
 * @remarks
 * Only the positions that actually hold a class name are followed: an object
 * literal contributes its keys and never its conditions, an array contributes
 * its elements, and a ternary contributes its two branches. A template literal
 * such as `cols-${n}` contributes the static prefix `cols-`, which suppresses
 * every class beginning with it rather than marking the whole file unreadable.
 * Anything else in a class position is an expression only the running app can
 * evaluate, and makes the component unresolvable.
 *
 * @param expression - The raw attribute value.
 * @returns Resolved names, suppression prefixes, and whether anything defeated analysis.
 */
function resolveClassExpression(expression: string): ClassFacts {
  const names = new Set<string>();
  const prefixes = new Set<string>();
  let unresolvable = false;
  let reason = '';

  const markUnresolvable = (text: string): void => {
    unresolvable = true;
    if (!reason) reason = text.replace(/\s+/g, ' ');
  };

  const addLiteral = (quoted: string): void => {
    for (const name of quoted.slice(1, -1).split(/\s+/)) if (name) names.add(name);
  };

  const addTemplatePrefix = (template: string, whole: string): void => {
    const prefix = template.slice(1).split('${')[0];
    if (prefix) prefixes.add(prefix);
    else markUnresolvable(whole);
  };

  const visit = (raw: string): void => {
    const text = raw.trim();
    if (!text) return;

    if (text.startsWith('{') && text.endsWith('}')) {
      for (const entry of splitTopLevel(text.slice(1, -1), ',')) {
        const key = splitTopLevel(entry, ':')[0].trim();
        if (!key) continue;
        if (/^'[^']*'$/.test(key) || /^"[^"]*"$/.test(key)) addLiteral(key);
        else if (/^[_a-zA-Z][\w-]*$/.test(key)) names.add(key);
        else if (key.startsWith('`')) addTemplatePrefix(key, key);
        else markUnresolvable(key);
      }
      return;
    }

    if (text.startsWith('[') && text.endsWith(']')) {
      splitTopLevel(text.slice(1, -1), ',').forEach(visit);
      return;
    }

    const aroundQuestion = splitTopLevel(text, '?');
    if (aroundQuestion.length === 2) {
      const branches = splitTopLevel(aroundQuestion[1], ':');
      if (branches.length === 2) {
        branches.forEach(visit);
        return;
      }
    }

    if (/^'[^']*'$/.test(text) || /^"[^"]*"$/.test(text)) {
      addLiteral(text);
      return;
    }

    if (text.startsWith('`')) {
      addTemplatePrefix(text, text);
      return;
    }

    markUnresolvable(text);
  };

  visit(expression);
  return { names, prefixes, unresolvable, reason };
}

/**
 * Every class a template can put on an element.
 *
 * @param template - The template body.
 * @returns Resolved names, suppression prefixes, and whether analysis is possible.
 */
function templateClassFacts(template: string): ClassFacts {
  const facts: ClassFacts = { names: new Set(), prefixes: new Set(), unresolvable: false, reason: '' };

  for (const match of template.matchAll(/\sclass="([^"]*)"/g)) {
    for (const name of match[1].split(/\s+/)) if (name) facts.names.add(name);
  }

  for (const match of template.matchAll(/\s:class="([^"]*)"/g)) {
    const resolved = resolveClassExpression(match[1].replace(/&quot;/g, '"'));
    resolved.names.forEach((name) => facts.names.add(name));
    resolved.prefixes.forEach((prefix) => facts.prefixes.add(prefix));
    if (resolved.unresolvable) {
      facts.unresolvable = true;
      if (!facts.reason) facts.reason = resolved.reason;
    }
  }

  // Vue derives six class names from a Transition's `name`, and a
  // TransitionGroup adds a seventh. None of them is ever written by hand.
  for (const match of template.matchAll(/<Transition(?:Group)?\b[^>]*\bname="([^"]+)"/g)) {
    for (const suffix of TRANSITION_SUFFIXES) facts.names.add(`${match[1]}-${suffix}`);
  }

  return facts;
}

/** Collects every .ts and .vue file under a directory, excluding test siblings. */
function walk(dir: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry.endsWith('-tests')) continue;
      walk(full, collected);
    } else if (/\.(ts|vue)$/.test(entry)) {
      collected.push(full);
    }
  }
  return collected;
}

/**
 * The text of a file that can legitimately USE a class.
 *
 * @remarks
 * [THREAT:] A stylesheet naturally contains every class it declares, so
 * including style text here would make the membership test vacuously true and
 * this whole suite would report success without ever being able to fail. For a
 * component that means the template and scripts only; for a theme module, whose
 * file also carries the static shell markup, it means the file with its
 * selector preludes blanked out, so `class="sh-header"` still counts as a use
 * while `.sh-header {` no longer proves its own liveness.
 *
 * @param file - Absolute path to the file.
 * @returns Text in which a class name may be counted as used.
 */
function usageText(file: string): string {
  const source = readFileSync(file, 'utf8');

  if (file.endsWith('.vue')) {
    const template = balancedBlock(source, 'template');
    const scripts = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    return [template?.body ?? '', ...scripts].join('\n');
  }

  let text = source;
  for (const rule of selectorLists(source).sort((left, right) => right.start - left.start)) {
    text = text.slice(0, rule.start) + ' '.repeat(rule.end - rule.start) + text.slice(rule.end);
  }
  return text;
}

/** Counts the newlines before an offset, so a block-relative line becomes absolute. */
function lineOffsetOf(source: string, offset: number): number {
  return source.slice(0, offset).match(/\n/g)?.length ?? 0;
}

interface Finding {
  location: string;
  className: string;
  selector: string;
}

const files = walk(SRC_DIR);

const globalTokens = new Set<string>();
for (const file of files) {
  for (const token of usageText(file).match(/[\w-]+/g) ?? []) globalTokens.add(token);
}

const componentFindings: Finding[] = [];
const analysed: string[] = [];
const skipped: string[] = [];

for (const file of files.filter((candidate) => candidate.endsWith('.vue'))) {
  const source = readFileSync(file, 'utf8');
  const template = balancedBlock(source, 'template');
  const styles = [...source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)]
    .filter((match) => /\bscoped\b/.test(match[1]))
    .map((match) => ({ body: match[2], start: match.index + match[0].indexOf(match[2]) }));

  if (!template || styles.length === 0) continue;

  const relativePath = relative(SRC_DIR, file);
  const facts = templateClassFacts(template.body);
  if (facts.unresolvable) {
    skipped.push(relativePath);
    continue;
  }
  analysed.push(relativePath);

  const scriptText = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .join('\n');
  const scriptTokens = new Set(scriptText.match(/[\w-]+/g) ?? []);

  for (const style of styles) {
    for (const rule of selectorLists(style.body)) {
      for (const className of localClasses(rule.selector)) {
        if (facts.names.has(className)) continue;
        if ([...facts.prefixes].some((prefix) => className.startsWith(prefix))) continue;
        if (scriptTokens.has(className)) continue;

        componentFindings.push({
          location: `${relativePath}:${lineOffsetOf(source, style.start) + rule.line}`,
          className,
          selector: rule.selector.replace(/\s+/g, ' '),
        });
      }
    }
  }
}

const globalFindings: Finding[] = [];
for (const file of files.filter((candidate) => GLOBAL_STYLE_MODULES.some((name) => candidate.endsWith(`/${name}`)))) {
  const source = readFileSync(file, 'utf8');
  for (const rule of selectorLists(source)) {
    for (const className of localClasses(rule.selector)) {
      if (globalTokens.has(className)) continue;
      globalFindings.push({
        location: `${relative(SRC_DIR, file)}:${rule.line}`,
        className,
        selector: rule.selector.replace(/\s+/g, ' '),
      });
    }
  }
}

/** Renders findings one per line for an assertion message. */
function report(findings: Finding[]): string {
  return findings.map((one) => `  ${one.location}  .${one.className}  in  ${one.selector}`).join('\n');
}

describe('CSS selectors that can never match', () => {
  it('every scoped class selector names a class its own template can carry', () => {
    expect(componentFindings, `unmatchable scoped selectors:\n${report(componentFindings)}`).toEqual([]);
  });

  it('every global class selector names a class some template carries', () => {
    expect(globalFindings, `unmatchable global selectors:\n${report(globalFindings)}`).toEqual([]);
  });

  it('analyses the components it claims to, rather than skipping its way to a pass', () => {
    // [THREAT:] Every check above passes trivially on an empty input set. Without
    // this, one new dynamic class binding per refactor would erode coverage to
    // nothing and the suite would stay green the whole way down.
    expect(skipped.sort()).toEqual([...UNRESOLVABLE_COMPONENTS].sort());
    expect(analysed.length).toBeGreaterThan(skipped.length);
  });
});
