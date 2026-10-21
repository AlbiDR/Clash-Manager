<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

# Nightly diagnostics

Start with the question you need answered. These tools read existing evidence;
they do not change the grade or replace the pipeline's lifecycle contract.

| Question | Source of truth | Command or location |
| --- | --- | --- |
| What did the night accomplish? | Canonical recap, scoped by cycle | `pnpm nightly:recap` |
| Why was a stage classified that way? | Hash-chained ledger events, coverage and merge evidence | `pnpm nightly:explain --date YYYY-MM-DD --stage N` |
| What command or request failed, retried or hung? | Operation trace for that specific workflow attempt | `pnpm nightly:trace --file /tmp/nightly-trace/nightly-trace.jsonl` |
| Did the final ledger publication step fail? | Trace index with workflow step outcomes | `nightly-trace.jsonl.index.json` in the same artifact |
| Which code actually ran? | Execution provenance and process revision | Trace root records and index |
| Are all release branches aligned? | SyncBranches content-parity gate | `Verify branch contents` job and `SYNC_SNAPSHOT` lines |

## Download one workflow's trace

The dispatcher, watchdog and merge coordinator each preserve an artifact named
`nightly-trace-<run-id>-<attempt>`, including after a failed step. Download it:

```bash
gh run download RUN_ID --name nightly-trace-RUN_ID-ATTEMPT --dir /tmp/nightly-trace
pnpm nightly:trace --file /tmp/nightly-trace/nightly-trace.jsonl
pnpm nightly:trace --file /tmp/nightly-trace/nightly-trace.jsonl --json
```

The index links to the workflow and records checkout, script and ledger-publication
step outcomes. It excludes step outputs. Artifact retention follows the repository's
GitHub Actions settings; these are diagnostic files, not permanent stage history.

## Read the operation timeline

Each operation records its start and end, duration, execution identity and parent
span. A merge PR adds its cycle, stage and PR number; child Git commands and API
requests inherit that context. Watchdog recovery phases carry the cycle; provider
requests record each retry attempt without request headers or bodies.

One GitHub run can invoke the merge script repeatedly. Each process has a distinct
invocation ID, and `controlAttempt` records the shell retry number. GitHub's own
workflow retry remains a separate attempt in the execution identity. The original
checkout SHA, the workflow-definition SHA and each process's actual HEAD are
reported separately, because branch synchronization between retries can move HEAD.

- `OK`: the operation returned normally. It does not assert a successful stage.
- `NONZERO`: a command or request returned a nonzero/error result that its caller
  may handle. A Git ancestry predicate returning 1 can be expected; inspect context.
- `ERROR`: the operation threw. Its original error still reaches the caller.
- `INCOMPLETE`: a start has no matching end. Cancellation or termination is possible;
  the trace does not invent a duration or classify it as a success.
- `START_MISSING`: an end survived without a start. Evidence is incomplete.

A truncated final record is reported explicitly. Malformed records elsewhere are
errors, not empty evidence. Tracing failures warn and leave the pipeline's behavior
unchanged. When no trace exists, the index says `UNAVAILABLE`.

## Boundaries

The ledger owns stage state, interventions and causal event integrity. The recap
owns grading. The trace owns diagnostic operation timing; it does not write either
of those authorities. It observes the repository's control plane, not the commands
inside Jules' remote VM. Merge Git/API operations, provider-read retries and recovery
phases are instrumented; shell publication is represented by workflow step outcomes.

Configured GitHub/Jules credentials are redacted before trace writes. Request bodies,
patch contents, successful command output, environment dumps and step outputs are
not recorded. New adapters must preserve those boundaries and use `nightly-trace.mjs`
instead of creating another logger.
