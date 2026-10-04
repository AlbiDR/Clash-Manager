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
 * author, because every nightly lane commits as the same bot. A documentation
 * lane's own commit is ALSO recognised by the coverage log it touched, because
 * the subject is not reliable: of the eight S05/S06 merges from 2026-10-01 to
 * 2026-10-04, four were titled "Nightly Stage 6: ..." or "[Stage 5] ..." and
 * matched no documentation subject at all.
 *
 * A CLEAN CHECK CLEARS THE FILE
 * A documentation lane that opens a listed file and finds its prose already
 * accurate passes `--verified <path>` to finalize, which writes a Verified line
 * into the description it commits. That counts as documenting the file at that
 * commit. Without it a clean check left no trace, so the same file came back
 * every night: ViewOptions.vue was audited and found accurate by both lanes on
 * 2026-10-01, 10-02 and 10-04, and stayed listed throughout.
 *
 * KNOWN IMPRECISION, stated so a lane does not chase it
 * The semver bump rewrites a version marker inside a couple of source files
 * on every push, and it rides along in whatever commit carried the change. So
 * a file can appear here because a `fix(...)` commit touched nothing in it but
 * that marker comment. Frontend-PWA/src/core/services/useProgressiveList.ts
 * and Backend/supabase/functions/_shared/protocol.ts are the usual two. A lane
 * that opens such a file and finds the prose already accurate should record it
 * as accurate (`--verified`) and move on, not manufacture an edit.
 * ============================================================================
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** The registry domain of the lanes that describe code rather than change it. */
export const DOCUMENTATION_DOMAIN = 'documentation';

/**
 * The metadata field a documentation lane writes for files it checked and found
 * accurate. Defined here, where it is read, and imported by the stage runner
 * that writes it, so the two can never spell it differently.
 */
export const VERIFIED_FIELD = 'Verified';

/** Every stage's coverage log, mapped to that stage's registry domain. */
export function laneLogDomains(registry) {
  return new Map((registry?.stages || []).map(stage => [stage.coverageLog, stage.domain]));
}

/**
 * The documentation lane's coverage log if this commit is that lane's own,
 * else null.
 *
 * A lane's own merge touches its own coverage log and no other lane's. That is
 * the definition, not a tolerance: a commit touching several logs is not any
 * lane's work. Four repository-wide commits in this history (about 1,000 files
 * each, including every coverage log) would otherwise read as documentation
 * lanes describing 428 source files at once.
 */
export function documentationLaneLog(files, laneDomains) {
  const touched = files.filter(file => laneDomains.has(file));
  return touched.length === 1 && laneDomains.get(touched[0]) === DOCUMENTATION_DOMAIN ? touched[0] : null;
}

/**
 * The documented sources a committed description's Verified field names.
 *
 * Read only inside the NIGHTLY_PR_METADATA block, so prose elsewhere in a file
 * can never be mistaken for the field. Anything that is not a documented source
 * path is dropped: an empty list and an absent field mean the same thing here.
 */
export function parseVerified(body) {
  const block = /NIGHTLY_PR_METADATA:\s*([\s\S]*?)-->/.exec(String(body || ''));
  if (!block) return [];
  const field = new RegExp(`^\\s*${VERIFIED_FIELD}:\\s*(.*)$`, 'm').exec(block[1]);
  if (!field) return [];
  return [...new Set(field[1].split(',').map(item => item.trim()).filter(item => DOCUMENTED_SOURCE.test(item)))];
}

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
 *
 * `laneDomains` maps each stage's coverage log to its domain (laneLogDomains):
 * a documentation lane's own commit counts as documentation whatever its
 * subject says. An entry's `verified` files are ones the lane checked and found
 * accurate at that commit, which describes them as surely as an edit would.
 */
export function findDocDebt(log, { laneDomains = new Map() } = {}) {
  const newestCode = new Map();
  const newestDoc = new Map();

  log.forEach((entry, index) => {
    const laneCommit = documentationLaneLog(entry.files, laneDomains) !== null;
    const kind = laneCommit ? 'doc'
      : CODE_SUBJECT.test(entry.subject) ? 'code'
        : DOC_SUBJECT.test(entry.subject) ? 'doc'
          : null;
    if (!kind) return;
    const target = kind === 'code' ? newestCode : newestDoc;
    const files = kind === 'doc' ? [...entry.files, ...(entry.verified || [])] : entry.files;
    for (const file of files) {
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

/** `git log` output in readLog's format: sentinel, hash and subject, then the files. */
export function parseLog(raw) {
  return raw
    .split(COMMIT_SENTINEL)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const [head, ...rest] = block.split('\n');
      const match = /^([0-9a-f]{40})(?: (.*))?$/.exec(head.trim());
      return {
        hash: match ? match[1] : null,
        subject: (match ? match[2] || '' : head).trim(),
        files: rest.map(line => line.trim()).filter(Boolean),
      };
    });
}

/**
 * History newest-first, with each documentation-lane commit's Verified files
 * read from the descriptions that commit wrote.
 *
 * The descriptions are found as the Markdown files the commit touched beside
 * the lane's own coverage log, rather than by rebuilding the stage runner's
 * sidecar name here, so the runner stays the only place that names it. A file
 * that cannot be read costs that one commit its verification, never the scan.
 */
export function readLog({ laneDomains = new Map(), show = (hash, file) => git(['show', `${hash}:${file}`]) } = {}) {
  const log = parseLog(git(['log', '--no-merges', '--name-only', `--format=${COMMIT_SENTINEL}%H %s`]));
  for (const entry of log) {
    const laneLog = entry.hash ? documentationLaneLog(entry.files, laneDomains) : null;
    if (!laneLog) continue;
    const laneDir = path.posix.dirname(laneLog);
    entry.verified = [...new Set(entry.files
      .filter(file => path.posix.dirname(file) === laneDir && file.endsWith('.md'))
      .flatMap(file => {
        try {
          return parseVerified(show(entry.hash, file));
        } catch {
          return [];
        }
      }))];
  }
  return log;
}

/**
 * The documentation lanes from the stage registry, or none if it cannot be
 * read. None falls back to subject-only lane identity, the behaviour before
 * the registry was consulted, and says so: a refinement that cannot load must
 * not cost the lanes their whole signal.
 */
function loadLaneDomains() {
  try {
    const registry = JSON.parse(readFileSync(new URL('../../nightly-config/stages.json', import.meta.url), 'utf8'));
    return laneLogDomains(registry);
  } catch (error) {
    console.error(`doc-debt: stage registry unreadable (${error.message}); lane commits are recognised by subject only.`);
    return new Map();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const laneDomains = loadLaneDomains();
  const debt = findDocDebt(readLog({ laneDomains }), { laneDomains });
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
