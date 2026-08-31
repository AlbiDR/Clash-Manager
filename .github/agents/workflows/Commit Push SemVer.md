---
description: Stage, commit, push changes, and create a SemVer tag directly on GitHub.
---

# Workflow: Commit-Push Pipeline

Run all phases sequentially. **Batch every phase into a single shell call.** Minimize tool round-trips.

**Autonomous by default**: Run without pausing unless the bump is major (e.g., `14.3.6` to `15.0.0`). For major bumps pause at Phase 3 and Phase 5 only.

**Stop on**: merge conflict, stash-pop conflict, push rejection. Report error verbatim and wait. Log non-fatal warnings and continue.

**Output discipline**: Report only what changed. No narration between steps. Final summary only.

---

## Phase 1+2: Pre-Flight and Sync (single call)

```bash
git fetch origin --tags --quiet \
  && git stash push --include-untracked -q -m "pre-sync stash" \
  && git pull --rebase --quiet origin "$(git branch --show-current)" \
  && git stash pop -q 2>/dev/null || true \
  && git status --short \
  && git branch --show-current
```

- If `git status --short` is empty, stop: nothing to commit.
- Stop on rebase or stash-pop conflict; report files verbatim.
- The `|| true` on `stash pop` is safe: it is a no-op when no stash was created.

---

## Phase 3: Classify and Write Commit Message

```bash
git diff HEAD
```

Pick the highest-severity type:

| Type | When |
|---|---|
| `feat` | New functionality, component, route, or Edge Function |
| `fix` | Bug fix or logic correction |
| `chore` | Tooling, deps, config, CI/CD |
| `docs` | Docs/comments/release notes only |
| `refactor` | Structure change, no behavior change |
| `perf` | Performance only |
| `test` | Tests only |
| `style` | Formatting/whitespace/lint only |

Append `!` for breaking changes (e.g., `feat!:`).

```
<type>[scope]: <imperative summary, max 72 chars>

[WHY, not WHAT. 72-char wrap.]

[BREAKING CHANGE: <desc>  /  Closes #<n>]
```

**Major bump only**: Show message and wait for approval.

---

## Phase 4: Stage, Commit, Push (single call)

```bash
git add -A \
  && git commit -m "<message>" \
  && git push origin "$(git branch --show-current)"
```

Report only the resulting commit hash.

---

## Phase 5: SemVer Bump (single call)

**`package.json` is the only source of truth for the version — never compute the next
version from `git describe`/tag history.** Tags are attached to commits after the fact;
they are not guaranteed to reflect what any given commit actually contains. Bumping from
tag history instead of `package.json` is what caused a real incident: multiple sessions
(across both this Antigravity workflow and its Claude Code counterpart) each tagged off
the latest git tag without ever touching `package.json`, producing tags that didn't match
the version in the files they pointed to (see `git show v14.37.8:package.json` in
history — it still read `14.37.4`). Always bump from `package.json`, never from
`git describe`.

The bump-type decision itself is untouched by this fix and stays exactly as it was —
**it must come from the semantic classification already done in Phase 3 (reading
`git diff HEAD`), not from string-matching commit message prefixes after the fact.**
The rules below just map that already-decided type to a bump size:

- **Major**: `!` or `BREAKING CHANGE:` in any commit, or semantically breaks a contract.
- **Minor**: any `feat:` / `feat(` commit, no breaking change.
- **Patch**: all other types.

**Major only**: Show rationale + proposed new version and wait for approval before running
the bump. Minor/patch: proceed autonomously.

```bash
node .github/scripts/project/bump-version.mjs <patch|minor|major>
```

This writes the new version to all three `package.json` files and auto-syncs every other
reference in the monorepo (`protocol.ts`, README badges, `apktool.yml`,
`twa-manifest.json`, etc.) via `validate-project.ts --fix`. Then commit and push that as
its own commit:

```bash
git add -A \
  && git commit -m "chore(version): bump to vX.Y.Z" \
  && git push origin "$(git branch --show-current)"
```

---

## Phase 6: Tag creation is NOT this workflow's job

**Do not run `git tag` or `git push origin <tag>` from this workflow.** Tag creation is
centralized in a single CI job (`.github/workflows/auto-tag.yml`) that fires on push,
reads `package.json` at the new commit, and creates the tag itself if one doesn't already
exist for that version. This is deliberate: when every session/agent/platform tags
locally and independently, tags drift from `package.json` the moment any one of them
skips or mis-times the bump (this happened repeatedly — see Phase 5). A single
server-side authority for tag creation makes that class of drift structurally impossible
instead of relying on every workflow, on every platform, following the rules correctly.

If `.github/workflows/auto-tag.yml` does not exist in this repo, stop and tell the user —
do not fall back to tagging manually.

**Final summary** (one block, nothing else):

```
Branch  : <branch>
Commit  : <hash of the version-bump commit>
Files   : <list>
Version : vX.Y.Z (tag will be created by CI — check the Actions tab / releases page shortly)
```

---

## Guardrails

- No `--force`. No amending pushed commits.
- Approval gates active only for major bumps.
- Every bump must trace to specific commits.
- Stop verbatim on: rebase conflict, stash-pop conflict, push failure.
- Never tag locally (see Phase 6). Never compute a version from tag history (see Phase 5).