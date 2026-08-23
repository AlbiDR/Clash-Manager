// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Clash Manager Nightly Agent Contract

This file is the single shared operating contract for the 13 unattended Jules
stages. Stage prompts define only their own scope and verification. When rules
conflict, this contract wins.

## 1. Required Outcome

Every scheduled run must finish with one valid change set for Jules' native
scheduled-task publisher to open as a non-draft Pull Request targeting
`Nightly`. Jules owns publication. The agent must not manually create a branch,
commit, push, or retry the publishing API.

There are two valid outcome classes:

1. `CHANGED` or `CLEAN`: the selected work is complete and verified.
2. `SKIPPED` or `PARTIAL-RUN`: incomplete or unsafe source edits have been
   restored and only the stage coverage log remains changed.

Both outcomes are publishable. Ending without a final change set, waiting for
human input, or entering an optional review loop is a failed run.

## 2. Start Protocol

The first command in every stage prompt is authoritative:

```bash
node .github/scripts/nightly-stage.mjs start --stage N
```

The lifecycle coordinator verifies the branch and clean worktree, performs a
bounded non-interactive `git pull --ff-only origin Nightly`, records the UTC
date and start time, refreshes dependencies only when the snapshot lockfile is
stale, regenerates stage-aware `/tmp/nightly` context, and writes the stage's
`IN-PROGRESS` sentinel. Do not duplicate those operations manually.

If branch synchronization fails, do not edit source. Use the existing checkout
only to record a `PARTIAL-RUN` in the correct coverage log and return a final
change set if the environment still permits it.

## 3. Execution Bounds

- Select one highest-value, low-ambiguity target within the stage's write scope.
- Make one atomic change. Do not combine unrelated cleanup or opportunistic work.
- Use local repository and shell tools. Never ask a user for a decision, review,
  permission, secret, or clarification.
- Package, build, and installer commands must use `CI=true` and
  `DEBIAN_FRONTEND=noninteractive` and must never wait for input.
- Run only the verification required by the stage prompt. CI Auto-Fixer operates
  after a PR exists and does not replace local verification.
- A failing validation receives at most one targeted correction and one rerun.
  After the second failure, restore unverified source edits and finalize a
  `PARTIAL-RUN` log-only result.
- Never ask whether to fix a validation, type-check, build, or compile failure.
  If the fix is clearly inside the stage's write scope, make one targeted
  correction and rerun once; otherwise restore unsafe edits and finalize
  `PARTIAL-RUN` with the blocker recorded.
- Do not invoke optional Jules code review, plan review, memory, reflection, or
  post-validation analysis.

At each prompt checkpoint, run:

```bash
node .github/scripts/nightly-stage.mjs budget --stage N
```

`WORK` permits continued work. `SUBMIT` means stop immediately, restore any
unverified source edits, and finalize. The work phase ends at 45 minutes so the
60-minute session retains a 15-minute completion reserve.

## 4. Evidence and Context

- `/tmp/nightly/TODAY` is the canonical date for the run.
- Read only the stage-relevant section of
  `.github/nightly-logs/00-pipeline-intelligence.md` and the active T1 portion of
  `.github/nightly-logs/00-pr-history.md`. Do not load either complete historical
  file unless the stage prompt explicitly defines a bounded exception.
- Ordinary stages must not read every stage prompt or every coverage log.
- Prompt files contain executable instructions, never run transcripts,
  diagnostics, or accumulated evidence.
- Detailed incident evidence belongs in the relevant coverage log or
  `.github/nightly-logs/13-self-healing-protocol.md`. Keep pipeline intelligence
  to concise, durable constraints only.
- Do not use Supabase MCP tools when the stage prompt prohibits them. A local
  source read always takes precedence over an equivalent remote tool call.

## 5. Logs and History Ownership

- Each run owns exactly one coverage log identified by
  `.github/nightly-config/stages.json`.
- The lifecycle coordinator writes the initial sentinel and replaces it during
  finalization. Do not append a second summary record for the same run.
- Stage 1 alone may run `age_pr_history.py age` to age, prune, and fold
  `.github/nightly-logs/00-pr-history.md`.
- No stage writes successful PR history. The merge coordinator compiles finalized
  history from merge tags after the PR merges.
- `NIGHTLY_PR_METADATA` improves history quality but must never block completion;
  the merge coordinator has safe defaults.
- Stages must not modify root `AGENTS.md`, this contract,
  `.github/nightly-prompts/`, lifecycle or merge coordinators, workflows,
  another stage's log, or other pipeline control files. Stage 13 records
  proposed pipeline changes in its protocol log only.

## 6. Finalization and Native Publication

After required validation, or as soon as the budget reports `SUBMIT`, run the
stage prompt's `nightly-stage.mjs finalize` command. For `SKIPPED` and
`PARTIAL-RUN`, restore every non-log change first. For `CLEAN`, only the coverage
log may change, except that Stage 1 may also include verified history aging.

Finalization must leave no `IN-PROGRESS` sentinel. It writes:

- `/tmp/nightly/pr-body.md`
- `/tmp/nightly/final-handoff.txt`

Read the handoff, return its concise status and suggested publication data, and
end the task successfully. Do not perform any work after finalization. The
native scheduled-task publisher then creates the single non-draft PR targeting
`Nightly`; the GitHub merge coordinator owns everything after that boundary.

If the lifecycle helper fails, attempt it only once. Manually replace the
sentinel with a `PARTIAL-RUN` record, ensure the diff is log-only, return a final
change set, and stop. Do not repair pipeline infrastructure from a nightly run.
