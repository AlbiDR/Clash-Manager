#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: DOC DEBT
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Lists source files whose code was changed after the last time a
 * documentation lane described them. Those files carry comments that describe
 * behaviour the code no longer has, which is worse than an undocumented file,
 * because a reader trusts them.
 *
 * THE CASE THIS WAS BUILT FROM (verified 2026-09-10)
 * Frontend-PWA/src/core/services/useBenchmarking.ts
 *   2026-09-06  docs(tsdoc): harden useBenchmarking interface contracts  (#1712)
 *   2026-09-07  refactor(core): fix stale store singleton state pollution (#1727)
 * The doc lane documented the file one day before the code lane removed the
 * singleton behaviour, and never came back. Lines 171 and 219 still read
 * "looking up pre-calculated statistics in singleton state", describing
 * exactly what #1727 deleted.
 *
 * WHY A DEDICATED SIGNAL
 * The doc lanes used to stumble onto recently changed code through
 * changed-files.txt, which listed everything recent including the pipeline's
 * own commits. That signal now filters to human-authored commits, which is
 * correct for choosing what to work on but removes the accidental mechanism by
 * which a doc lane noticed a code lane's edit. This restores it deliberately,
 * and narrowly: only files where documentation is provably behind the code.
 *
 * Lane identity comes from the conventional-commit subject rather than the
 * author, because every nightly lane commits as the same bot.
 *
 * KNOWN IMPRECISION, stated so a lane does not chase it
 * The semver bump rewrites a version marker inside a couple of source files
 * on every push, and it rides along in whatever commit carried the change. So
 * a file can appear here because a `fix(...)` commit touched nothing in it but
 * that marker comment. Frontend-PWA/src/core/services/useProgressiveList.ts
 * and Backend/supabase/functions/_shared/protocol.ts are the usual two. A lane
 * that opens such a file and finds the prose already accurate should record it
 * as accurate and move on, not manufacture an edit.
 * ============================================================================
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Subjects written by lanes that change behaviour. */
export const CODE_SUBJECT = /^(?:refactor|perf|fix)\(|^chore\((?:refactor|optimize|verify|deps|database)\)/i;

/** Subjects written by lanes that only describe behaviour. */
export const DOC_SUBJECT = /^docs?\(|^chore\(docs\)/i;

/** Files worth reporting: source that carries prose a reader would trust. */
export const DOCUMENTED_SOURCE = /^(?:Frontend-PWA|Backend|APK)\/.*\.(?:ts|tsx|vue|mjs)$/;

/**
 * Printable rather than a NUL or record separator: this output is read back by
 * shell and by humans, and a control character in the stream is invisible in
 * every log that carries it.
 */
export const COMMIT_SENTINEL = '@@COMMIT@@';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Walks history newest-first and returns the files whose most recent
 * behaviour-changing commit is newer than their most recent documentation
 * commit. Index 0 is the newest commit, so a LOWER index means more recent.
 */
export function findDocDebt(log) {
  const newestCode = new Map();
  const newestDoc = new Map();

  log.forEach((entry, index) => {
    const kind = CODE_SUBJECT.test(entry.subject) ? 'code' : DOC_SUBJECT.test(entry.subject) ? 'doc' : null;
    if (!kind) return;
    const target = kind === 'code' ? newestCode : newestDoc;
    for (const file of entry.files) {
      if (!DOCUMENTED_SOURCE.test(file)) continue;
      if (!target.has(file)) target.set(file, { index, subject: entry.subject });
    }
  });

  const debt = [];
  for (const [file, code] of newestCode) {
    const doc = newestDoc.get(file);
    // A file a documentation lane has never described is a COVERAGE question,
    // not debt, and it is what those lanes' ordinary backlog is for. Including
    // it produced 430 entries on this repository, which is not a signal any
    // lane can act on. Debt is narrower and far more damaging: prose that a
    // lane wrote and that the code has since contradicted. A higher index
    // means further back in history, so doc older than code is debt.
    if (doc && doc.index > code.index) {
      debt.push({ file, codeSubject: code.subject, lastDocSubject: doc.subject });
    }
  }
  return debt.sort((a, b) => a.file.localeCompare(b.file));
}

export function parseLog(raw) {
  return raw
    .split(COMMIT_SENTINEL)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n');
      return { subject: lines[0].trim(), files: lines.slice(1).map(line => line.trim()).filter(Boolean) };
    });
}

export function readLog() {
  return parseLog(git(['log', '--no-merges', '--name-only', `--format=${COMMIT_SENTINEL}%s`]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const debt = findDocDebt(readLog());
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ version: 1, count: debt.length, debt }, null, 2));
  } else if (debt.length === 0) {
    console.log('No documentation debt: every documented source file was described after its last code change.');
  } else {
    for (const item of debt) {
      console.log(item.file);
      console.log(`  code changed by : ${item.codeSubject}`);
      console.log(`  last documented : ${item.lastDocSubject || 'never by a documentation lane'}`);
    }
  }
}
