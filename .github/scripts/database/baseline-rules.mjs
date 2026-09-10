// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: BASELINE DDL RULES
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Single source of truth for the re-runnability and safety rules
 * the master migration baseline must satisfy. Every object the baseline
 * declares has to survive being applied to a database that already has it,
 * because the baseline is the disaster-recovery path: it is replayed whole.
 *
 * WHY THIS MODULE EXISTS (RCA, 2026-09-10):
 * These rules previously lived only inside the deploy gate
 * (.github/scripts/project/validate-project.ts), while the nightly Stage 3
 * lane graded its own folding work with audit-migrations.mjs, which did not
 * check them at all. On 2026-09-08 a fold (PR 1735) copied a bare
 * CREATE TRIGGER out of an incremental migration into the baseline. The
 * lane's own checker reported PASS with 0 violations, so the work looked
 * finished, and the deploy gate then blocked every PWA release built from
 * that branch. Two checkers, one blind, and the blind one was the one
 * steering the work.
 *
 * CAPA: both callers import their baseline DDL rules from here, so a rule can
 * no longer be enforced at the release gate without also being enforced at the
 * desk of the agent doing the folding. Add new baseline DDL rules HERE, never
 * in a caller.
 * ============================================================================
 */

/**
 * Yields the executable fragment of every line, with SQL comments removed and
 * the original 1-based line number preserved for error messages.
 *
 * Both `--` line comments and `/* ... *\/` block comments are stripped rather
 * than skipped, so a real statement carrying a trailing note is still checked.
 */
export function executableLines(source) {
  const lines = source.split('\n');
  const result = [];
  let inBlockComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    let text = lines[index].replace(/\/\*[\s\S]*?\*\//g, '');

    if (inBlockComment) {
      const close = text.indexOf('*/');
      if (close === -1) continue;
      text = text.slice(close + 2);
      inBlockComment = false;
    }

    const open = text.indexOf('/*');
    if (open !== -1) {
      text = text.slice(0, open);
      inBlockComment = true;
    }

    const lineComment = text.indexOf('--');
    if (lineComment !== -1) text = text.slice(0, lineComment);

    if (!text.trim()) continue;
    result.push({ lineNumber: index + 1, text });
  }

  return result;
}

/**
 * Line-scoped baseline rules. Each rule inspects one comment-stripped line.
 *
 * `skipQuotedLines` exists for CREATE TABLE only: the baseline contains
 * GRANT and COMMENT statements whose string literals mention table DDL, and
 * matching inside a literal would report a violation that does not exist.
 */
const LINE_RULES = [
  {
    id: 'table-not-idempotent',
    pattern: /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)([\w.]+)/i,
    skipQuotedLines: true,
    message: (match, lineNumber) => `Table ${match[1]} at line ${lineNumber} missing IF NOT EXISTS`,
  },
  {
    id: 'trigger-not-idempotent',
    pattern: /CREATE\s+(?!OR\s+REPLACE\s+)TRIGGER/i,
    skipQuotedLines: false,
    message: (_match, lineNumber) => `Trigger at line ${lineNumber} missing OR REPLACE`,
  },
];

/**
 * Whole-source baseline rules, for defects that are not tied to one line.
 */
const SOURCE_RULES = [
  {
    id: 'out-of-line-unique',
    // Matches a single ALTER TABLE statement adding a UNIQUE constraint, e.g.
    // ALTER TABLE foo ADD CONSTRAINT bar UNIQUE (col). Inline UNIQUE inside
    // CREATE TABLE and FK-only ALTER TABLE statements are not flagged.
    pattern: /ALTER\s+TABLE\s+\S+\s+ADD\s+CONSTRAINT\s+\S+\s+UNIQUE\b/i,
    message: () => 'Found out-of-line UNIQUE constraints',
  },
  {
    id: 'unqualified-moddatetime',
    pattern: /EXECUTE\s+FUNCTION\s+moddatetime/i,
    message: () => 'Unqualified moddatetime call found',
  },
];

/**
 * Returns every baseline DDL rule violation in `source`, as human-readable
 * strings. An empty array means the baseline is re-runnable as far as these
 * rules can tell.
 *
 * @param {string} source - full text of the master migration baseline
 * @returns {string[]}
 */
export function baselineDdlViolations(source) {
  const violations = [];

  for (const { lineNumber, text } of executableLines(source)) {
    for (const rule of LINE_RULES) {
      if (rule.skipQuotedLines && (text.includes("'") || text.includes('"'))) continue;
      const match = rule.pattern.exec(text);
      if (match) violations.push(rule.message(match, lineNumber));
    }
  }

  for (const rule of SOURCE_RULES) {
    if (rule.pattern.test(source)) violations.push(rule.message());
  }

  return violations;
}

/** Rule identifiers, exposed so tests can assert full coverage of the set. */
export const BASELINE_DDL_RULE_IDS = [...LINE_RULES, ...SOURCE_RULES].map(rule => rule.id);
