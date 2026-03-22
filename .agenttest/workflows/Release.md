---
description: Execute the full release process from discovery to tagging.
---

# Workflow: Clinical Release Protocol

This workflow automates the execution of a "Clinical" release entry on GitHub by standardizing the discovery of commits, the analysis of architectural impact, and the generation of high-fidelity markdown via `release-schema.json` found at ".github/releases/release-schema.json".

---

## Phase 1: Contextual Synchronization & Discovery
Before analyzing changes, the environment must be synced to the absolute git state and a persistent changelog must be generated.

1.  **Sync Tags**:
    ```bash
    git fetch origin --tags
    ```
2.  **Identify Baseline (Multi-Source)**:
    - **Git Source**: `ST=$(git describe --tags --abbrev=0 HEAD 2>/dev/null || git rev-list --max-parents=0 HEAD)`
    - **Folder Source**: List files in `.github/releases/` and identify the version of the most recent entry.
    - **Cross-Reference**: **CRITICAL**: Verify that the latest tag aligns with the most recent file in `.github/releases/`. If they differ, hypothesize the cause and use the higher version as the true baseline.
    - **Final Baseline**: `ST` must reflect the authoritative previous version.
3.  **Generate Temp Changelog**:
    Dump the FULL commit log AND diff stat into a temporary file. This file is the **Single Source of Truth** for all subsequent analysis and drafting.
    ```bash
    FN=".github/releases/_changelog_from_${ST}.md"
    printf "# Changelog: ${ST} -> HEAD\nPROJECT: Clash Manager\nRANGE:   ${ST} -> HEAD\nDATE:    $(date +'%Y-%m-%d %H:%M')\n===\n\n## Commit Log\n\n" > "$FN"
    git log "${ST}"..HEAD --format="<c>%h: %s%n%b</c>%n" >> "$FN"
    printf "\n## Diff Stat\n\n" >> "$FN"
    git diff "${ST}"..HEAD --stat >> "$FN"
    ```
4.  **Mandatory Ingestion**:
    - The AI **MUST** read the generated `_changelog_from_[TAG].md` file using `view_file`.
    - The AI **MUST** explicitly report the total commit count, total file count, and insertion/deletion summary before proceeding to Phase 2.
    - **CRITICAL**: If the AI cannot confirm these numbers, it MUST NOT proceed.
5.  **Version Parity Check**:
    - Verify the `previous_version` (against tags and `.github/releases/` history).
    - Verify the current `package.json` version.
    - Confirm the `expected_version` aligns with SemVer logic.
    - **CRITICAL**: Do NOT proceed if the version chain is broken or non-sequential.

---

## Phase 2: Semantic Analysis & Gating
Evaluate the extracted delta for significance and systemic impact. All analysis MUST reference the temp changelog file, not terminal output.

- **ZERO FILTERING**: Every commit in the changelog—including merges and chores—MUST be considered to maintain absolute narrative transparency.
- **Breaking Changes**: If any commit or body contains `!` or `BREAKING CHANGE:`, the increment **MUST** be `Major`.
- **New Logic**: If `feat:` exists without breaking changes, the increment **MUST** be `Minor`.
- **Iterative Polish**: Only if exclusively `fix:`, `chore:`, or `docs:` are present, it is a `Patch`.

---

## Phase 3: Clinical Drafting (Schema Execution)
Using the `release-schema.json`, generate the structural JSON then bake the final Markdown. The "Files Modified" section MUST reflect the quantitative reality from the temp changelog's Diff Stat section.

1.  **Title Geometry**: The release title must conform to `[Primary Feature Name]` or `[Primary Component] [Primary Action]`, but it **MUST** be catchy, insightful, and genuine.
2.  **Generate JSON**: Follow the narrational strictures (Passive Voice). Present the JSON draft for approval before proceeding.
3.  **Bake Markdown**: Apply the OCD delimiters (`--- <br>`).
4.  **Local Drafts**: Create the new release file in `.github/releases/`. The **files** in this directory serve as the definitive "Draft" source of truth for the stack.
    `file:///.github/releases/v[VERSION]: [Title].md`

---

## Phase 4: Finalization & Tagging
Commit the release artifact, clean up temp files, and lock the git history.

1.  **Delete Temp Changelog**:
    ```bash
    rm .github/releases/_changelog_from_*.md
    ```
    The temp changelog must NEVER be committed to git.
2.  **Stage Artifact**:
    ```bash
    git add .github/releases/v[VERSION]:\ [Title].md
    ```
3.  **Standardized Commit**:
    ```bash
    git commit -m "docs(release): archive clinical entry for v[VERSION]"
    ```
4.  **Lock & Push**:
    ```bash
    git tag v[VERSION]
    git push origin v[VERSION]
    git push origin Beta
    ```
5.  **Draft Release**:
    - Any release created on GitHub MUST be saved as a **DRAFT**.
    - If using `gh`: `gh release create v[VERSION] --draft --notes-file .github/releases/v[VERSION]:\ [Title].md`
    - Otherwise: Create via Web UI and leave as Draft for final review.

---
---