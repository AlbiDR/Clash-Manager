// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const VERSION = 1;
const DEFAULT_ROOT = "Frontend-PWA/src";
const DEFAULT_TSCONFIG = "Frontend-PWA/tsconfig.app.json";
const SOURCE_EXTENSIONS = new Set([".ts", ".vue"]);
const COMPONENT_EXTENSION = ".vue";

/**
 * Finds barrel-exported Vue components that nothing outside the tests uses.
 *
 * @remarks
 * [DECISION LOG] WHY THIS EXISTS AND KNIP IS NOT ENOUGH:
 * knip's Vue compiler never sees the implicit default export of an SFC, so
 * `knip --trace-file` reports "No exports found" for every .vue file, used or
 * not. A component re-exported from a barrel is therefore reachable (the
 * barrel is imported) and never an unused export, whatever happens to its last
 * consumer. HeaderInfoOverlay sat in that gap from the first commit until
 * 2026-10-06, kept alive by its own spec, and was still being migrated by
 * refactors that could not know it never rendered.
 *
 * The component list is derived, never written down: every
 * `export { default as Name } from "./Name.vue"` in any non-test source file
 * under the root is a barrel component.
 *
 * What counts as a consumer, in a non-test file other than the component:
 * - an import, static or dynamic, whose specifier resolves to the .vue file;
 * - a value import binding of the exported name from a source inside the
 *   project (relative or a tsconfig path alias), so a same-named export of an
 *   npm package does not count;
 * - a member access of the exported name (`import("@features/x").then(m => m.Name)`);
 * - a template tag `<Name` or `<kebab-name`.
 *
 * Nothing else counts: not comments, not string literals, not `import type`,
 * and not re-exports (`export ... from`), which are none of the forms above.
 * Forwarding a name is not using it, so a barrel that re-exports another
 * barrel keeps no component alive.
 *
 * A test file is a vitest spec name (*.spec.ts, *.test.ts) or anything inside a
 * `*-tests` folder, the repository's test-folder convention, which also holds
 * non-spec helpers such as theme-tests/wcag.ts.
 *
 * [DECISION LOG] WRONG IN THE LOUD DIRECTION:
 * Finding no barrel components at all, a barrel form this parser does not
 * understand, or a .vue specifier it cannot resolve returns DEGRADED (exit 2),
 * never PASS. A detector that cannot answer must not look like "no dead
 * components".
 *
 * The one quiet edge is the member-access form: `anything.Name` counts even on
 * an unrelated object. It is kept because route-level lazy loads reach view
 * components only that way.
 */
export function auditDeadComponents({ root = DEFAULT_ROOT, tsconfig = DEFAULT_TSCONFIG } = {}) {
  const report = {
    version: VERSION,
    status: "PASS",
    root: normalizeRepoPath(root),
    filesExamined: 0,
    componentsExamined: 0,
    violations: [],
    unsupported: [],
  };
  const rootPath = path.resolve(root);
  if (!existsSync(rootPath)) {
    return { ...report, status: "DEGRADED", error: `Source root is unavailable: ${root}` };
  }

  try {
    const aliases = readAliases(tsconfig);
    const files = walkFiles(rootPath);
    const sources = files.filter(file => !isTestFile(file));
    report.filesExamined = files.length;

    const components = [];
    for (const file of sources.filter(file => file.endsWith(".ts"))) {
      for (const entry of barrelComponents(file, aliases, report)) components.push(entry);
    }
    report.componentsExamined = components.length;
    if (components.length === 0) {
      return { ...report, status: "DEGRADED", error: "No barrel-exported components found; the audit cannot answer." };
    }

    const usages = sources.map(file => ({ file, usage: collectUsage(file, aliases, report) }));
    for (const component of components) {
      const used = usages.some(({ file, usage }) =>
        file !== component.target &&
        (usage.paths.has(component.target) ||
          usage.names.has(component.name) ||
          usage.tags.has(component.name) ||
          usage.tags.has(toKebab(component.name))),
      );
      if (!used) {
        report.violations.push({
          path: reportPath(component.barrel),
          line: component.line,
          name: component.name,
          component: reportPath(component.target),
        });
      }
    }
  } catch (error) {
    return { ...report, status: "DEGRADED", error: error.message };
  }

  if (report.unsupported.length > 0) {
    return { ...report, status: "DEGRADED", error: "Unsupported or unresolvable component references; see list." };
  }
  report.status = report.violations.length > 0 ? "FAIL" : "PASS";
  return report;
}

function readAliases(tsconfigPath) {
  const absolute = path.resolve(tsconfigPath);
  const { config, error } = ts.readConfigFile(absolute, ts.sys.readFile);
  if (error) throw new Error(`Cannot read ${tsconfigPath}: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`);
  const options = config?.compilerOptions ?? {};
  const base = path.resolve(path.dirname(absolute), options.baseUrl ?? ".");
  return Object.entries(options.paths ?? {}).map(([pattern, targets]) => ({
    pattern,
    targets: targets.map(target => path.resolve(base, target)),
  }));
}

function resolveSpecifier(specifier, fromFile, aliases) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return path.resolve(path.dirname(fromFile), specifier);
  }
  for (const { pattern, targets } of aliases) {
    const star = pattern.indexOf("*");
    if (star === -1) {
      if (specifier === pattern) return targets[0];
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
      const middle = specifier.slice(prefix.length, specifier.length - suffix.length);
      return targets[0].replace("*", middle);
    }
  }
  return null;
}

function barrelComponents(file, aliases, report) {
  const source = parse(file, readFileSync(file, "utf8"));
  const found = [];
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.endsWith(COMPONENT_EXTENSION)) continue;
    const line = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1;
    const target = resolveSpecifier(specifier, file, aliases);
    const clause = statement.exportClause;
    const defaults = clause && ts.isNamedExports(clause)
      ? clause.elements.filter(element => (element.propertyName ?? element.name).text === "default")
      : [];
    if (!target || !existsSync(target) || defaults.length === 0) {
      report.unsupported.push({ path: reportPath(file), line, detail: `export from "${specifier}"` });
      continue;
    }
    for (const element of defaults) {
      found.push({ name: element.name.text, target, barrel: file, line });
    }
  }
  return found;
}

function collectUsage(file, aliases, report) {
  const content = readFileSync(file, "utf8");
  const usage = { paths: new Set(), names: new Set(), tags: new Set() };
  const scripts = file.endsWith(COMPONENT_EXTENSION) ? vueScripts(content) : [content];
  if (file.endsWith(COMPONENT_EXTENSION)) {
    for (const tag of vueTemplateTags(content)) usage.tags.add(tag);
  }
  for (const script of scripts) {
    const source = parse(file, script);
    const recordPath = (specifier, node) => {
      if (!specifier.endsWith(COMPONENT_EXTENSION)) return;
      const target = resolveSpecifier(specifier, file, aliases);
      if (target) {
        usage.paths.add(target);
        return;
      }
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      report.unsupported.push({ path: reportPath(file), line, detail: `cannot resolve "${specifier}"` });
    };
    const visit = node => {
      if (ts.isImportDeclaration(node)) {
        const specifier = node.moduleSpecifier.text;
        recordPath(specifier, node);
        const clause = node.importClause;
        const local = resolveSpecifier(specifier, file, aliases) !== null;
        if (clause && !clause.isTypeOnly && local && clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            if (!element.isTypeOnly) usage.names.add((element.propertyName ?? element.name).text);
          }
        }
        return;
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [argument] = node.arguments;
        if (argument && ts.isStringLiteralLike(argument)) recordPath(argument.text, node);
      }
      if (ts.isPropertyAccessExpression(node)) usage.names.add(node.name.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return usage;
}

function vueScripts(content) {
  return [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
}

function vueTemplateTags(content) {
  const markup = content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  return [...markup.matchAll(/<([A-Za-z][\w-]*)/g)].map(match => match[1]);
}

function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function toKebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function isTestFile(file) {
  const parts = normalizeRepoPath(file).split("/");
  return /\.(spec|test)\.[cm]?[jt]sx?$/.test(parts.at(-1)) || parts.slice(0, -1).some(part => part.endsWith("-tests"));
}

function walkFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !entry.name.endsWith(".d.ts")) files.push(fullPath);
    }
  }
  return files.sort((a, b) => normalizeRepoPath(a).localeCompare(normalizeRepoPath(b)));
}

function normalizeRepoPath(filePath) {
  return String(filePath || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function reportPath(filePath) {
  const relative = normalizeRepoPath(path.relative(process.cwd(), filePath));
  return relative.startsWith("../") ? normalizeRepoPath(filePath) : relative;
}

export function renderHumanReport(report) {
  const lines = [
    `Dead component audit: ${report.status}`,
    `Root: ${report.root}`,
    `Files examined: ${report.filesExamined}`,
    `Barrel components examined: ${report.componentsExamined}`,
    `Dead components: ${report.violations.length}`,
  ];
  if (report.error) lines.push(`Error: ${report.error}`);
  for (const item of report.violations) {
    lines.push(`- ${item.path}:${item.line} ${item.name} (${item.component}) has no consumer outside tests`);
  }
  for (const item of report.unsupported) {
    lines.push(`- UNSUPPORTED ${item.path}:${item.line} ${item.detail}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const options = { json: false, root: DEFAULT_ROOT, tsconfig: DEFAULT_TSCONFIG };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
    } else if (token === "--root" || token === "--tsconfig") {
      options[token.slice(2)] = argv[index + 1];
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
    const report = auditDeadComponents(options);
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : renderHumanReport(report));
    process.exit(report.status === "PASS" ? 0 : report.status === "FAIL" ? 1 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
