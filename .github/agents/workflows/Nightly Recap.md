---
description: Describe what the nightly pipeline did on a run, via pnpm nightly:recap
---

# Workflow: Nightly Recap

This workflow is a pointer. The recap is computed by code, not by prose.

```bash
pnpm nightly:recap            # newest run, human readable
pnpm nightly:recap --json     # same facts, machine readable
pnpm nightly:recap --date 2026-08-25
```

The single source of truth is `.github/scripts/nightly-recap.mjs`, which is
tracked in the repository, covered by tests, and shared by every agent.

## Why this file no longer contains the logic

It used to describe the whole procedure in prose, and so did the equivalent file
for every other AI tool. The same question therefore got a different answer
depending on which tool was asked, none of the logic was testable or reviewable,
and none of it survived a fresh clone. The pipeline being judged is code with a
test suite; its judgement should not have been the least rigorous part of the
system.

It also scoped a run as "commits in Nightly not yet in Beta", which is a proxy
for "last night" that holds only until the branches are synced. Syncing first
made a healthy stage vanish from the report, or worse, be classified STUCK. The
script scopes by run date instead, so the answer does not depend on the order
you happen to do things in.

## Your job

Narrate the script's output. Do not re-derive, re-classify or re-grade anything.
Read-only: never commit, push or tag. No em-dashes and no emojis.

If something is wrong, fix the script and its tests.
