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

`.github/scripts/nightly-recap.mjs` is the single source of truth for those
facts. It scopes a run by DATE, using the ledger, the `nightly/<date>/stage-N/pr-*`
tags and the coverage logs, all read from `origin/Nightly`. It therefore gives
the same answer whether or not the branches have been synced, and can report on
any past run.

Your job is only to narrate its output. Do not re-derive, re-classify or
re-grade anything it reports: every agent must produce the same facts and differ
only in wording. If something looks wrong, fix the script and its tests rather
than working around it in a prompt.

