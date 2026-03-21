---
description: [Clinical Release Protocol] execute the full release process from discovery to tagging.
---

# Workflow: Clinical Release Protocol

This workflow automates the execution of a "Clinical" release entry on GitHub by standardizing the discovery of commits, the analysis of architectural impact, and the generation of high-fidelity markdown via `release-schema.json` found at ".github/releases/release-schema.json".

---

## Phase 1: Contextual Synchronization
Before analyzing changes, the environment must be synced to the absolute git state.

1.  **Sync Tags**:
    ```bash
    git fetch origin --tags
    ```
2.  **Identify Baseline**:
    ```bash
    ST=$(git describe --tags --abbrev=0 Beta)
    ```
3.  **Extract Logical Delta**:
    ```bash
    git log "$ST"..Beta --format="<c>%h: %s%n%b</c>%n"
    ```

---

## Phase 2: Semantic Analysis & Gating
Evaluate the extracted delta for significance and systemic impact.

- **Breaking Changes**: If any commit contains `!` or `BREAKING CHANGE:`, the increment **MUST** be `Major`.
- **New Logic**: If `feat:` exists without breaking changes, the increment **MUST** be `Minor`.
- **Iterative Polish**: Only if exclusively `fix:`, `chore:`, or `docs:` are present, it is a `Patch`.

---

## Phase 3: Clinical Drafting (Schema Execution)
Using the `release-schema.json`, generate the structural JSON then bake the final Markdown.

1.  **Generate JSON**: Follow the narrational strictures (Passive Voice, Genuine Tone).
2.  **Bake Markdown**: Apply the OCD delimiters (`--- <br>`).
3.  **Persist**: Create the release file:
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

---
---