---
name: release
description: Execute the full release process from discovery to tagging. Use when the user asks to cut a release, publish a version, or run the release process.
---

# release

The procedure is not written here. Read and follow:

`.github/agents/workflows/Release.md`

That file is the single source of truth, shared by every agent tool through
`.github/agents/`. Do not restate, summarise or reimplement its steps in this
file: a second copy of a procedure is a copy that will drift from the first, and
this repository has already been through that once.

If the procedure needs changing, change it there.
