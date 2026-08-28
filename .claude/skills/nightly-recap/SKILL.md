---
name: nightly-recap
description: Describe what the nightly pipeline did on a run. Reports each of the 13 Jules stages, whether it merged, whether it needed rescuing, and grades the run 1-10. Use when the user asks for a nightly recap, what Jules did last night, how the nightly run went, or about a specific past run date.
---

# Nightly Recap

The facts come from one place, and it is not this file.

```bash
pnpm nightly:recap --json
```

Optionally `--date YYYY-MM-DD` for a specific run; the default is the newest run
in the ledger.

## What to do

1. Run the command above.
2. Narrate the result: per stage, what it did and why, then the grade and its
   rationale. Group by stage number, 01 to 13.
3. Mention any stage where `rescued` is true, and say which mechanism rescued it
   (`rescuedBy`). A stage that merged only because something rescued it is not
   the same as one that merged unaided.
4. Surface any `health.verdict` that is not HEALTHY or UNKNOWN. Those are
   cross-run trends that no single run can show.

## What NOT to do

- Do not re-derive the facts from git log, tags, coverage logs or the ledger.
  The script already did that, deterministically and with tests. Reconstructing
  them by hand is how three different tools ended up giving three different
  answers to the same question.
- Do not re-grade the run. The rubric is encoded in `GRADE_RUBRIC`.
- Do not scope the run by comparing branches. Scope is the run DATE. A branch
  diff silently changes what it reports the moment the branches are synced, and
  used to misreport a healthy synced stage as STUCK.
- Never commit, push or tag. This is read-only.
- No em-dashes and no emojis in the output.

If the script is wrong, fix `.github/scripts/nightly-recap.mjs` and its tests.
Never work around it here: this file is local and gitignored, the script is not.
