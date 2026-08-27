<!--
SPDX-License-Identifier: GPL-3.0-only
Copyright (C) 2026 AlbiDR
-->

# Jules Scheduled Tasks: Off-Repository Trigger Snapshot

## Why this file exists

Every one of the 13 nightly stages is triggered by a scheduled task configured
by hand inside the Jules web UI. Those 13 task definitions are the only part of
the nightly pipeline that lives nowhere in this repository. They have no export,
no backup, no review trail, and no way to detect an accidental edit. If the Jules
account state were lost, or if a task were silently retimed or disabled, nothing
in this repository would notice and nothing here would be sufficient to rebuild
it.

This file is the offline snapshot of that state. It is documentation, not
configuration: nothing reads it at runtime. It exists so that the trigger layer
can be reconstructed by hand, and so that a future migration to
`.github/workflows/nightly-dispatch.yml` has a verifiable "before" picture to be
measured against.

Related:
- `.github/nightly-config/stages.json` is the in-repository half of stage
  identity (prompt path, coverage log, branch prefix, commit scope). It is
  already version controlled and is NOT duplicated here.
- `.github/workflows/nightly-dispatch.yml` is the eventual replacement for this
  entire layer. It is currently inert (`workflow_dispatch` only, no `schedule`).

## Status of the migration

Deliberately deferred. A migration changes the trigger path, so it needs a
stable baseline to be measured against, and it should be done while the pipeline
is healthy rather than while it is being repaired. The protocol is already
recorded in the header of `nightly-dispatch.yml` and in commit `e1c05d0a`:

1. One stage at a time, never a batch.
2. A manual `workflow_dispatch` pilot run for that stage must be confirmed
   working end to end first.
3. The Jules UI scheduled task for that stage is disabled in the same change
   that adds its `cron` line, so a stage is never triggered from both places at
   once.
4. Start with **Stage 13**, not Stage 1. Stage 13's only output is a markdown
   document, so it has the smallest blast radius of the 13. Stage 1 is the worst
   possible pilot: it performs the PR-history aging pass that every later stage's
   logging depends on.

## Observed trigger cadence

The Jules API credential is not available locally, so these are not read from
the task definitions. They are **observed landing times** of each stage's merge
commit on `origin/Nightly`, sampled across the three most recent runs. A landing
time lags its trigger time by the session's actual work duration, so treat these
as a lower bound on the trigger time and an upper bound on the ordering.

All times UTC.

| Stage | Slug | 2026-08-25 | 2026-08-26 | 2026-08-27 | Approx. slot |
|---|---|---|---|---|---|
| 1 | hardening | 01:21 | 01:34 | 01:34 | 01:30 |
| 2 | verification | 02:19 | 02:40 | 02:35 | 02:30 |
| 3 | baseline-consolidation | 03:11 | 03:30 | 03:36 | 03:30 |
| 4 | optimization | 04:07 | 04:15 | 04:15 | 04:15 |
| 5 | documentation-readme | 06:23 | 05:20 | 06:42 | 06:00 (variable) |
| 6 | documentation-tsdoc | 06:13 | 06:23 | 06:31 | 06:25 |
| 7 | version-integrity | 07:07 | 07:15 | 07:17 | 07:15 |
| 8 | dependency-audit | 08:12 | 09:40 | 08:17 | 08:15 |
| 9 | refactor-proposals | 10:08 | 09:34 | 09:18 | 09:30 |
| 10 | apk-integrity | 10:08 | 10:35 | 10:31 | 10:30 |
| 11 | apk-optimization | 11:07 | 11:21 | 11:33 | 11:20 |
| 12 | apk-ux | 12:10 | 12:14 | 12:22 | 12:15 |
| 13 | self-healing-protocol | 13:07 | 13:17 | 13:08 | 13:10 |

These times are recorded for human orientation and for reconstructing the tasks
by hand. **Nothing executable may depend on them.** Deriving a cron, a timeout or
a threshold from this table would recreate the exact problem this pipeline is
meant to avoid: a hardcoded number, written once, that silently becomes wrong
the day the schedule changes and that nobody remembers to go and update.

Notes on the shape of this window:

- The stages run strictly sequentially, roughly one per hour, from about 01:30
  to about 13:10 UTC. Stage 1 lands on the calendar day AFTER the run date it
  logs, which is why `expectedEvidenceDate()` exists in
  `nightly-watchdog.mjs` and why Stage 1's coverage log entry carries the prior
  date. This is expected, not a defect.
- Stage 5 is the least punctual of the 13 and is the stage that has most often
  needed a watchdog nudge (2026-08-25, 2026-08-27). If any stage's schedule is
  worth inspecting first, it is this one.
- `merge-nightly-prs.yml` runs its scheduled safety-net pass at 12:00 UTC and
  `nightly-watchdog.yml` at 13:00 UTC, both of which sit inside this window by
  design: they are also triggered reactively by every stage PR landing, so the
  cron lines are backstops rather than the primary path.

## Fields that exist only in the Jules UI

These cannot be derived from this repository and must be transcribed by hand.
Fill them in from the Jules UI and keep this table current whenever a task is
changed. Leave a cell as `UNVERIFIED` rather than guessing.

For each of the 13 tasks, record:

| Field | Notes |
|---|---|
| Task name | As shown in the Jules scheduled-tasks list. |
| Schedule expression | The exact recurrence as the UI states it, plus the timezone the UI is interpreting it in. This is the single most important field here. |
| Repository | Expected: `AlbiDR/Clash-Manager`. |
| Target branch | Expected: `Nightly` for all 13. |
| Prompt source | Whether the task body is pasted inline or references the repository prompt file. If pasted inline, the UI copy can drift from `.github/nightly-prompts/`, which would be invisible to every check in this repository. |
| Auto-create PR | Expected: enabled. A disabled setting here reproduces exactly the `JULES_SESSION_STUCK` failure mode the watchdog was built to recover from. |
| Enabled / paused | Whether the task is currently live. |

### Transcription table

Status: **UNVERIFIED**. Not yet transcribed from the Jules UI.

| Stage | Task name | Schedule (as stated in UI) | Timezone | Prompt source | Auto-PR | Enabled |
|---|---|---|---|---|---|---|
| 1 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 2 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 3 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 4 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 5 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 6 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 7 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 8 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 9 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 10 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 11 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 12 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 13 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |

## Known-good baseline

The control plane that produced the first fully clean run (13 of 13 stages
merged, zero failure classes, 2026-08-27) is tagged:

```
control-plane/2026-08-27-13of13
```

That tag is the diff target and the revert target for any future control-plane
change. To see what has changed in the control plane since the last known-good
state:

```bash
git diff control-plane/2026-08-27-13of13 origin/Nightly -- .github/scripts/ .github/workflows/ .github/nightly-config/
```

## Standing rule for control-plane changes

The 10 files listed in `CONTROL_PLANE_FILES` in
`.github/scripts/nightly-deploy-check.mjs` are read from different branches at
runtime: a workflow's own YAML comes from the default branch (Stable), while the
scripts it invokes come from its `ref: Nightly` checkout. A change that reaches
only one branch is not deployed; it sits inert and nothing errors to say so.
That is the failure that stranded the 2026-08-16 recovery-pass fix on Beta for a
full day while three more stages went unrecovered.

So any change to those files must:

1. Reach Nightly, Beta and Stable, not just one of them.
2. Pass `pnpm test:nightly-control-plane` (79 tests at the time of writing).
3. Report clean from `pnpm nightly:deploy-check`.
4. Be diffed against `control-plane/2026-08-27-13of13` before it ships.

`.github/workflows/control-plane-guard.yml` enforces this automatically, and it
does so reactively rather than on a clock. It triggers on every nightly stage
pull request landing on `Nightly`, the same trigger `nightly-watchdog.yml` and
`merge-nightly-prs.yml` already use, because a stage PR arriving is direct
evidence that the control plane is in use at that moment. Nothing in it encodes
when the stage window opens, so retiming the stages, adding stages or removing
them requires no change to the guard.

Note the direction it checks. `Nightly` being AHEAD of `Beta` and `Stable` is
never reported: see the branch-promotion rationale below. Only the reverse,
control-plane work reachable from `Beta` or `Stable` but not from `Nightly`, is
a fault, because that means the nightly stages are executing a superseded script
while the fix reads as merged.

## Why the branch sync is manual

`sync-branches.yml` is `workflow_dispatch` only, and that is a deliberate
architectural choice rather than an omission. `Nightly` is fully automated,
while the live APK, PWA and Backend deploys are all driven from `Beta` and
`Stable`. Holding `Beta` and `Stable` back is what guarantees that no automated
nightly change can reach users out of the blue, and syncing by hand keeps a
human in the loop at the exact moment work is promoted, so a critical breakage
is noticed immediately rather than discovered later.

Two consequences follow, and anything built around this pipeline must respect
both:

1. `Nightly` running ahead of `Beta` and `Stable` is the intended steady state,
   for as long as the operator chooses to leave it that way. It is not drift and
   must never be alarmed on.
2. No check may assume the branches converge on any particular cadence, because
   there is no cadence. They converge when a human decides they should.
