---
description: Execute the full release process from discovery to tagging.
---

# Workflow: Clinical Release Protocol

This workflow automates the execution of a "Clinical" release entry on GitHub by standardizing the discovery of commits, the analysis of architectural impact, and the generation of high-fidelity markdown via `release-schema.json` found at ".github/releases/release-schema.json".

---

## Phase 1: Contextual Synchronization & Discovery
Before analyzing changes, the environment must be synced to the absolute git state.

1.  **Sync Tags**:
    ```bash
    git fetch origin --tags
    ```
2.  **Identify Baseline**:
    ```bash
    ST=$(git describe --tags --abbrev=0 origin/Stable 2>/dev/null || git rev-list --max-parents=0 HEAD)
    ```
3.  **Extract Authoritative Delta**:
    ```bash
    git log "$ST"..origin/Stable --format="<c>%h: %s%n%b</c>%n"
    ```
4.  **Version Parity Check**:
    - Verify the `previous_version` (tag).
    - Verify the current `package.json` version.
    - Confirm the `expected_version` aligns with SemVer logic (Major/Minor/Patch).
    - **CRITICAL**: Do NOT proceed if the version chain is broken or non-sequential.

---

## Phase 2: Semantic Analysis & Gating
Evaluate the extracted delta for significance and systemic impact.

- **ZERO FILTERING**: Every commit in the log—including merges and chores—MUST be considered to maintain absolute narrative transparency.
- **Breaking Changes**: If any commit or body contains `!` or `BREAKING CHANGE:`, the increment **MUST** be `Major`.
- **New Logic**: If `feat:` exists without breaking changes, the increment **MUST** be `Minor`.
- **Iterative Polish**: Only if exclusively `fix:`, `chore:`, or `docs:` are present, it is a `Patch`.

---

## Phase 3: Clinical Drafting (Schema Execution)
Using the `release-schema.json`, generate the structural JSON then bake the final Markdown.

1.  **Title Geometry**: The release title must conform to `[Primary Feature Name]` or `[Primary Component] [Primary Action]`, but it **MUST** be catchy, insightful, and genuine.
2.  **Generate JSON**: Follow the narrational strictures (Passive Voice). Present the JSON draft for approval before proceeding.
3.  **Bake Markdown**: Apply the OCD delimiters (`--- <br>`).
4.  **Local Draft**: Create the local release file in `.github/releases/`. It serves as the definitive source.
    `file:///.github/releases/v[VERSION]: [Title].md`

---

## Phase 4: Finalization & Tagging
Commit the release artifact and lock the git history.

1.  **Stage Artifact**:
    ```bash
    git add .github/releases/v[VERSION]:\ [Title].md
    ```
2.  **Standardized Commit**:
    ```bash
    git commit -m "docs(release): archive clinical entry for v[VERSION]"
    ```
3.  **Lock & Push**:
    ```bash
    git tag v[VERSION]
    git push origin v[VERSION]
    git push origin Beta
    ```
4.  **Draft Release**:
    - Any release created on GitHub MUST be saved as a **DRAFT**.
    - If using `gh`: `gh release create v[VERSION] --draft --notes-file .github/releases/v[VERSION]:\ [Title].md`
    - Otherwise: Create via Web UI and leave as Draft for final review.

---
---