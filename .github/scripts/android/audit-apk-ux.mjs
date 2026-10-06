// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = 1;
const DEFAULT_ROOT = "Frontend-PWA/src";
const ALLOWED_EXTENSIONS = new Set([".vue", ".html"]);

function normalizeRepoPath(filePath) {
  return String(filePath || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function reportPath(filePath) {
  const relative = normalizeRepoPath(path.relative(process.cwd(), filePath));
  return relative.startsWith("../") ? normalizeRepoPath(filePath) : relative;
}

function lineForOffset(content, offset) {
  return content.slice(0, offset).split("\n").length;
}

function walkFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (ALLOWED_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }
  return files.sort((a, b) => normalizeRepoPath(a).localeCompare(normalizeRepoPath(b)));
}

/**
 * The inside of one opening tag, where a ">" inside a quoted attribute value
 * belongs to the value and does not end the tag.
 *
 * Every scan here used to read a tag as `<name[^>]*>`, which ends at the first
 * ">" anywhere. `:disabled="position >= total"` therefore cut the tag short and
 * nothing after the comparison was seen: GhostBenchmarkHost.vue's "Show later
 * entry" stepper was invisible to every rule while its `<=` twin directly
 * above it was reported. Vue puts comparisons in attribute values routinely,
 * so an icon-only button written that way could ship with no accessible name
 * under a PASS.
 *
 * The three alternatives cannot overlap (only a quote opens a quoted value), so
 * the scan stays linear. A tag with an unbalanced quote is not matched.
 */
const TAG_BODY = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;

/**
 * The SFC's root <template> block, found by counting nesting rather than by a
 * non-greedy match.
 *
 * The previous expression was /<template\b[^>]*>([\s\S]*?)<\/template>/i. The
 * `*?` stops at the FIRST closing tag, so any component using a named slot had
 * everything after that slot silently unexamined: 18 of 77 .vue files in this
 * repository contain a nested <template>, and they are biased toward exactly
 * the composed components most likely to carry a slot-bearing control.
 *
 * Reproduced with two files differing only by a named slot above the offending
 * element: the one without it was reported, the one with it was not. The audit
 * printed "Violations: 1" and looked clean.
 *
 * An unterminated block returns the remainder rather than nothing, so a
 * malformed file is over-scanned rather than skipped. Wrong in the loud
 * direction is the only acceptable way for this to be wrong.
 */
function extractVueTemplate(content) {
  const opening = new RegExp(String.raw`<template\b${TAG_BODY}>`, "i").exec(content);
  if (!opening) return { text: content, offset: 0 };

  const innerStart = opening.index + opening[0].length;
  const tag = new RegExp(String.raw`<template\b(${TAG_BODY})>|<\/template\s*>`, "gi");
  tag.lastIndex = innerStart;

  let depth = 1;
  let match;
  while ((match = tag.exec(content)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return { text: content.slice(innerStart, match.index), offset: innerStart };
    } else if (!/\/\s*$/.test(match[1])) {
      depth += 1;
    }
  }
  return { text: content.slice(innerStart), offset: innerStart };
}

function stripTemplateComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, match => " ".repeat(match.length));
}

function tagAttributes(tag) {
  const attrs = new Map();
  const attrPattern = /([:@#\w.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrPattern.exec(tag))) {
    const name = match[1];
    if (name === tag.match(/^<\/?\s*([\w.-]+)/)?.[1]) continue;
    attrs.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function hasAttribute(attrs, names) {
  return names.some(name => attrs.has(name));
}

function hasExternalHref(attrs) {
  const href = attrs.get("href") || attrs.get(":href") || attrs.get("v-bind:href") || "";
  return /^https?:\/\//i.test(href);
}

function isNativeClickableObservation(tagName, tag, attrs) {
  if (/^[A-Z]/.test(tagName)) return false;
  if (/@click(?:\.self|\.[\w.-]*self\b)/.test(tag)) return false;
  return ["button", "a", "input"].includes(tagName) || attrs.get("role") === "button";
}


/**
 * An interactive control whose entire visible content is an icon.
 *
 * Deliberately narrow. The inner HTML is stripped of icon elements and
 * whitespace, and the control only qualifies when NOTHING remains: a button
 * containing an icon AND a word has a name and is not reported. Recall is
 * traded for precision on purpose, because an audit that cries wolf stops
 * being read, and this one already reports PASS on a tree where four icon-only
 * buttons had no accessible name.
 */
function isIconOnly(inner) {
  const withoutIcons = inner
    .replace(new RegExp(String.raw`<Icon\b${TAG_BODY}\/>`, "gi"), " ")
    .replace(new RegExp(String.raw`<Icon\b${TAG_BODY}>[\s\S]*?<\/Icon>`, "gi"), " ")
    .replace(new RegExp(String.raw`<svg\b${TAG_BODY}>[\s\S]*?<\/svg>`, "gi"), " ")
    .replace(new RegExp(String.raw`<\/?[A-Za-z]${TAG_BODY}>`, "g"), " ")
    .replace(/\{\{[\s\S]*?\}\}/g, "X");
  return /<Icon\b|<svg\b/i.test(inner) && withoutIcons.trim() === "";
}

const ACCESSIBLE_NAME_ATTRS = ["aria-label", ":aria-label", "v-bind:aria-label", "aria-labelledby", ":aria-labelledby", "title", ":title"];

/**
 * The SFC's script blocks with comments and string contents blanked, so that
 * neither a comment saying "haptics" nor a "(" inside a string is read as code.
 * Single and double quoted strings stop at a line end, so a quote inside a
 * regex literal cannot swallow the rest of the file.
 */
function scriptCode(content) {
  return [...content.matchAll(new RegExp(String.raw`<script\b${TAG_BODY}>([\s\S]*?)<\/script\s*>`, "gi"))]
    .map(match => match[1])
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g, token =>
      token.startsWith("/") ? " " : token[0].repeat(2),
    );
}

function identifierPattern(name) {
  return new RegExp(String.raw`(?<![\w$.])${name.replaceAll("$", "\\$")}(?![\w$])`);
}

/**
 * The local names the script binds from useHaptics(): `const haptics =
 * useHaptics()` gives haptics, `const { tap, success: ok } = useHaptics()`
 * gives tap and ok.
 */
function hapticBindings(code) {
  const names = [];
  for (const match of code.matchAll(/\b(?:const|let|var)\s+(\{[^}]*\}|[\w$]+)\s*(?::[^=]+)?=\s*useHaptics\s*\(/g)) {
    if (!match[1].startsWith("{")) {
      names.push(match[1]);
      continue;
    }
    for (const part of match[1].slice(1, -1).split(",")) {
      const local = part.split(":").pop().split("=")[0].replace("...", "").trim();
      if (local) names.push(local);
    }
  }
  return names;
}

/**
 * The source of the script's own declaration of `name`, from `function name`
 * or `const name =` until the brackets it opened are closed and its statement
 * ends. Empty when the script declares no such name, which is how a function
 * that comes from a composable (`const { hide } = useX()`) reads: no evidence.
 */
function declarationSource(code, name) {
  const id = name.replaceAll("$", "\\$");
  const start = new RegExp(String.raw`\bfunction\s*\*?\s*${id}(?![\w$])|\b(?:const|let|var)\s+${id}(?![\w$])`).exec(code);
  if (!start) return "";
  let depth = 0;
  for (let index = start.index; index < code.length; index += 1) {
    const char = code[index];
    if ("({[".includes(char)) depth += 1;
    else if (")}]".includes(char)) depth -= 1;
    if (depth < 0 || (depth === 0 && (char === ";" || char === "\n"))) return code.slice(start.index, index);
  }
  return "";
}

/**
 * The script functions a click expression calls by name: `open` and
 * `open(item)` name open; `item.open()` names nothing, because a member call
 * is not a function this file declares.
 */
function calledFunctions(expression) {
  const trimmed = expression.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) return [trimmed];
  return [...trimmed.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]);
}

/**
 * Whether this clickable element is itself wired to haptics.
 *
 * The rule used to accept any file in which the word useHaptics appeared, so
 * one imperative call anywhere exempted every click in that file, including
 * controls that never vibrate. The evidence now has to belong to the element:
 * v-tactile on it, or an event handler on it that uses a name the script binds
 * from useHaptics() (`haptics.tap(); go()`), or that calls a function the
 * script declares whose own body does (`selectOption(value)`). Every event on
 * the element counts, not only the click: NavigationDock vibrates on
 * pointerdown on purpose, so the tap is felt before the click resolves. Only
 * one level is followed: a handler that reaches haptics through a second
 * helper is reported, which is the direction an observation should be wrong in.
 */
function hasHapticEvidence(attrs, code) {
  if (hasAttribute(attrs, ["v-tactile", "vTactile"])) return true;
  const bindings = hapticBindings(code).map(identifierPattern);
  if (bindings.length === 0) return false;
  const usesHaptics = source => bindings.some(binding => binding.test(source));
  return [...attrs]
    .filter(([name]) => /^(?:@|v-on:)/.test(name))
    .some(([, handler]) => usesHaptics(handler) || calledFunctions(handler).some(name => usesHaptics(declarationSource(code, name))));
}

function auditTemplate({ repoPath, content }) {
  const template = extractVueTemplate(content);
  const searchable = stripTemplateComments(template.text);
  const code = scriptCode(content);
  const violations = [];
  const observations = [];

  for (const match of searchable.matchAll(new RegExp(String.raw`<select\b${TAG_BODY}>`, "gi"))) {
    violations.push({
      code: "raw-select",
      severity: "fail",
      path: repoPath,
      line: lineForOffset(content, template.offset + match.index),
      message: "Raw <select> elements must use the shared BaseSelect abstraction for Android WebView parity.",
    });
  }

  for (const match of searchable.matchAll(new RegExp(String.raw`<a\b${TAG_BODY}>`, "gi"))) {
    const attrs = tagAttributes(match[0]);
    if (!hasExternalHref(attrs)) continue;
    if (attrs.get("target") !== "_blank" || !/\bnoopener\b/.test(attrs.get("rel") || "")) {
      violations.push({
        code: "external-link-isolation",
        severity: "fail",
        path: repoPath,
        line: lineForOffset(content, template.offset + match.index),
        message: "External anchors must open outside the primary WebView and include rel=\"noopener\".",
      });
    }
  }

  // An icon-only control with no accessible name is unusable with TalkBack,
  // which is the screen reader on the Android device this app ships to. This
  // stage reported PASS on 77 files every night while four such buttons sat in
  // the tree: its three rules covered raw selects, external links and haptic
  // evidence, and nothing about whether a control can be named aloud.
  for (const match of searchable.matchAll(new RegExp(String.raw`<(button|a)\b(${TAG_BODY})>([\s\S]*?)<\/\1>`, "gi"))) {
    const attrs = tagAttributes(`<${match[1]}${match[2]}>`);
    if (hasAttribute(attrs, ACCESSIBLE_NAME_ATTRS)) continue;
    if (!isIconOnly(match[3])) continue;
    violations.push({
      code: "icon-only-control-without-accessible-name",
      severity: "fail",
      path: repoPath,
      line: lineForOffset(content, template.offset + match.index),
      message: `<${match[1]}> renders only an icon and has no accessible name. TalkBack announces it as an unlabelled control. Add aria-label, or visible text.`,
    });
  }

  for (const match of searchable.matchAll(new RegExp(String.raw`<([\w.-]+)\b${TAG_BODY}>`, "g"))) {
    const tagName = match[1];
    const attrs = tagAttributes(match[0]);
    if (![...attrs.keys()].some(name => /^@click(?:\.[\w.-]+)?$/.test(name))) continue;
    if (!isNativeClickableObservation(tagName, match[0], attrs)) continue;
    if (!hasHapticEvidence(attrs, code)) {
      observations.push({
        code: "click-without-local-haptic-evidence",
        severity: "observe",
        path: repoPath,
        line: lineForOffset(content, template.offset + match.index),
        message: "Clickable template element has no haptic evidence of its own (v-tactile, or an event handler that calls the script's useHaptics binding); inspect before selecting a Stage 12 target.",
      });
    }
  }

  return { violations, observations };
}

export function auditApkUx({ root = DEFAULT_ROOT } = {}) {
  const rootPath = path.resolve(root);
  const report = {
    version: VERSION,
    status: "PASS",
    root: normalizeRepoPath(root),
    filesExamined: 0,
    violations: [],
    observations: [],
    candidateFiles: [],
  };

  if (!existsSync(rootPath)) {
    return {
      ...report,
      status: "DEGRADED",
      error: `UX source root is unavailable: ${root}`,
    };
  }

  try {
    for (const filePath of walkFiles(rootPath)) {
      const repoPath = reportPath(filePath);
      const content = readFileSync(filePath, "utf8");
      const result = auditTemplate({ repoPath, content });
      report.filesExamined += 1;
      report.violations.push(...result.violations);
      report.observations.push(...result.observations);
    }
  } catch (error) {
    return {
      ...report,
      status: "DEGRADED",
      error: error.message,
    };
  }

  report.status = report.violations.length > 0 ? "FAIL" : "PASS";
  report.candidateFiles = [...new Set([...report.violations, ...report.observations].map(item => item.path))].sort();
  return report;
}

export function renderHumanReport(report) {
  const lines = [
    `APK UX audit: ${report.status}`,
    `Root: ${report.root}`,
    `Files examined: ${report.filesExamined}`,
    `Violations: ${report.violations.length}`,
    `Observations: ${report.observations.length}`,
  ];
  if (report.error) lines.push(`Error: ${report.error}`);
  for (const item of report.violations.slice(0, 20)) {
    lines.push(`- ${item.path}:${item.line} ${item.code}: ${item.message}`);
  }
  if (report.violations.length > 20) {
    lines.push(`- ... ${report.violations.length - 20} more violation(s) omitted`);
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const options = { json: false, root: DEFAULT_ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
    } else if (token === "--root") {
      options.root = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return options;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = auditApkUx({ root: options.root });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(renderHumanReport(report));
    }
    process.exit(report.status === "PASS" ? 0 : report.status === "FAIL" ? 1 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
