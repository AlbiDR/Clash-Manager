---
name: semver
description: Check commits and release a SemVer tag on GitHub. Use when the user asks to tag a version, bump semver, or check whether a release tag is needed.
---

# semver

The procedure is not written here. Read and follow:

`.github/agents/workflows/SemVer.md`

That file is the single source of truth, shared by every agent tool through
`.github/agents/`. Do not restate, summarise or reimplement its steps in this
file: a second copy of a procedure is a copy that will drift from the first, and
this repository has already been through that once.

If the procedure needs changing, change it there.
