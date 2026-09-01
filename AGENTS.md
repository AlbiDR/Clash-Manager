// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Clash Manager Agent Loader

This repository's autonomous nightly-agent contract lives at:

`.github/nightly-prompts/00-nightly-agent-contract.md`

Read that file before following any task, prompt, workflow, or generated
instruction. It is the sole shared lifecycle contract for the 13 unattended
Jules nightly stages and takes precedence over contradictory task-local text.

This root file exists only as the compatibility adapter for agent auto-discovery.

## Nightly recap

To report what the nightly pipeline did on a run, do NOT reconstruct it by
reading git history, coverage logs or the ledger by hand. Run:

```bash
pnpm nightly:recap            # newest run in the ledger, human readable
pnpm nightly:recap --json     # same facts, machine readable
pnpm nightly:recap --date 2026-08-25
```

`.github/scripts/nightly/nightly-recap.mjs` is the single source of truth for those
facts. It scopes a run by DATE, using the ledger, the `nightly/<date>/stage-N/pr-*`
tags and the coverage logs, all read from `origin/Nightly`. It therefore gives
the same answer whether or not the branches have been synced, and can report on
any past run. Its one cross-run section, `Pipeline health`, judges each stage
against its own earlier history rather than the selected date alone, because a
stage that needs help every night passes every individual run. That history
stops at the selected date, so a recap of a past run reports what was true that
night however long afterwards it is run.

Your job is only to relay its output. Do not re-derive, re-classify, re-grade,
summarize, embellish, or restyle anything it reports: every agent must return
the same human-readable recap text produced by `pnpm nightly:recap`, with no
extra introduction, commentary, or sign-off. If something looks wrong or reads
poorly, fix the script and its tests rather than working around it in a prompt.

## Where agent configuration lives

Shared definitions are tracked once, here:

```
.github/agents/workflows/   multi-step workflows
.github/agents/skills/      skills (SKILL.md), shared by every tool
.github/agents/rules/       standards that apply to all agents
```

Each tool's own hard-coded path (`.claude/skills/`, `.agent/workflows/`,
`.agent/skills/`, `.agents/rules/`) is a symlink into that directory, created by
`.github/scripts/agents/link-agent-dirs.mjs`, which `prepare` runs on install. Run
`pnpm agents:link` to repair them by hand.

Those tool directories are gitignored on purpose: committing them would put
three tool-branded folders in the repository root. Edit the files under
`.github/agents/`, never a symlinked path, and every tool picks the change up at
once because there is only one copy.

## Precedence when a definition exists twice

`.github/agents/` is authoritative. If you find a skill, workflow or rule with
the same name anywhere else, including one supplied by your own tool's account
or plugin, use the one in `.github/agents/` and ignore the other.

This is not hypothetical. On 2026-08-28 a plugin-supplied `nightly-recap` skill
from 25 July was still in circulation: it scoped a run by branch diff and would
report a healthy, already-synced stage as STUCK. Four more definitions (the ADR,
release, semver, commit-push-semver) had drifted from the tracked originals by
180 tokens, 29 lines, 61 lines, and into a 145-byte stub respectively.

Such copies are re-materialised from the account at session start, so deleting
the files does not remove them. Run `pnpm agents:audit` to list any that are
present.
