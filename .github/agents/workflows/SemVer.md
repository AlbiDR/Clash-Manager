---
description: Check commits and release a SemVer tag on Github
---

# Workflow: SemVer Tagging Protocol

This workflow calculates the correct next SemVer tag from an analyzed commit range and pushes it to GitHub. It does NOT generate release notes or changelog pages.

Execute the following phases sequentially. **Do NOT skip any phase or re-order steps.**

> **Tip**: For maximum reliability on unattended or complex runs, invoke this workflow via the `/goal` slash command in the chat. `/goal` activates the agent's highest-persistence mode and mirrors the autonomous protocol defined in Phase 0.

---

## Phase 0: Autonomous Protocol

This workflow must run to full completion without stopping for non-mandatory reasons. Apply the following operating mode for the entire task: - **Operate autonomously**: Do not pause to ask clarifying questions or request permission for any step that is already specified in this workflow. The only permitted pause points are the mandatory approval gates in Phase 2 (scope selection) and Phase 3 (version tag). - **Recover silently from minor tool failures**: If a command produces a non-fatal warning (e.g., no prior tag found), log it in the summary and continue. - **Hard-stop on ambiguity or conflict**: If any phase produces an unresolvable state (missing branch, push rejection), stop immediately, report the exact error verbatim, and wait for user instruction. - **Complete the full pipeline**: Do not consider the task done until Phase 4 has finished and the final confirmation has been reported to the user.

---

## Phase 1: Pre-Flight Checks

Before analyzing any commits, verify the local repository is fully in sync with origin.

1. **Fetch remote state** (tags included):
   ```bash
   git fetch origin --tags
   ```
2. **Identify the current branch**:
   ```bash
   git branch --show-current
   ```
3. **Pull the latest remote commits using rebase** (preserves linear history):
   ```bash
   git pull --rebase origin <current-branch>
   ```
   If the rebase reports conflicts, stop immediately, report the conflicting files verbatim to the user, and wait for manual resolution.
4. **Verify the latest tag is visible**:
   ```bash
   git describe --tags --abbrev=0 HEAD 2>/dev/null || echo "no-prior-tag"
   ```
   If no prior tag exists, treat `v0.0.0` as the baseline and note this in the summary.

---

## Phase 2: Determine Commit Scope

Interactively ask the user to choose the commit range to analyze. Present the following options and pause for explicit selection. This is a mandatory gate. - **Since last tag**: All commits from the most recent tag to `HEAD`.
  ```bash
  git log $(git describe --tags --abbrev=0 HEAD 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline
  ``` - **Whole chat**: Commits generated during this active conversation. - **Specific feature**: Commits spanning a user-specified feature or branch range.

After the user selects a scope, run the corresponding command and display the resulting commit list to the user before proceeding.

---

## Phase 3: SemVer Tag Calculation

Analyze the commits in the selected scope and calculate the correct version bump.

1. **Calculate the version bump** using both Conventional Commits keywords AND semantic AI reasoning of the actual changes (apply the highest-severity match across all commits in the range): - **Major bump**: Any commit contains `!` or the trailer `BREAKING CHANGE:`, OR the body semantically describes a fundamental architectural shift or contract break. - **Minor bump**: Any commit starts with `feat:` or `feat(`, with no breaking changes present. OR semantically introduces net-new functionality or non-breaking additions. - **Patch bump**: All commits are exclusively `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`, or `style:` with no features or breaking changes. OR semantically represents bug fixes, refactoring, optimization, or routine maintenance.
2. **Propose the new version**: Present the calculation rationale (listing each relevant commit and which rule it triggered) and the proposed tag (e.g., `v1.2.3 -> v1.3.0`) to the user. Pause and wait for explicit approval. This is a mandatory gate.

---

## Phase 4: Tag and Publish

Execute only after Phase 3 approval.

1. **Create and push the tag**:
   ```bash
   git tag v<NEW_VERSION>
   git push origin v<NEW_VERSION>
   ```
2. **Confirm** by reporting the tag URL:
   `https://github.com/AlbiDR/Clash-Manager/releases/tag/v<NEW_VERSION>`
3. **Final summary**: Report the analyzed commit range, version bump rationale, and the new SemVer tag in a concise summary block.

---

## Guardrails - **Never force-push** (`--force`) under any circumstance. - **Never skip Phase 2 scope selection** or Phase 3 approval. Both are mandatory gates. - **Never auto-increment** without showing the reasoning. Every bump decision must be traceable to specific commits. - If the rebase in Phase 1 encounters conflicts, stop and report. Do not resolve conflicts autonomously. - If the push in Phase 4 fails, report the error verbatim and stop. Do not retry or re-rebase automatically.
