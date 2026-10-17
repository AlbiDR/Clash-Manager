// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { prBodySidecarPath } from "./nightly-stage.mjs";
import { getCycleDate, getCycleId } from "./nightly-events.mjs";

/** Separate a stage's work from commits pulled after Jules captured its snapshot.
 * A private index reconstructs the exported tree without touching the checkout.
 * The execution base must be recorded in the stage's own finalized sidecar and
 * lie between the artifact base and the current upstream. No path is discarded
 * by name: all changes after that execution base remain for boundary validation.
 */
export function isolateStagePatch({ patch, baseCommitId, stage, date, targetRef = "origin/Nightly", cwd = process.cwd(), parseMetadata, allowSameBase = false }) {
  if (!/^[a-f0-9]{40,64}$/i.test(baseCommitId || "")) throw new Error("Patch has no complete base commit identity.");
  const dir = mkdtempSync(path.join(tmpdir(), "nightly-patch-base-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(dir, "index") };
  const git = (args, input) => {
    const result = spawnSync("git", args, { cwd, env, input, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Patch base verification failed (${args[0]}): ${String(result.stderr || "").trim().slice(0, 300)}`);
    return result.stdout;
  };
  try {
    git(["read-tree", baseCommitId]);
    git(["apply", "--cached", "--binary", "-"], patch);
    const tree = git(["write-tree"]).trim();
    const sidecar = git(["show", `${tree}:${prBodySidecarPath(stage)}`]);
    const meta = parseMetadata({ body: sidecar });
    if (meta.cycle !== getCycleId(getCycleDate(stage.number, date))) throw new Error("Finalized sidecar does not identify this cycle.");
    if (!/^[a-f0-9]{40,64}$/i.test(meta.execution || "")) throw new Error("Finalized sidecar has no complete execution revision.");
    const executionRevision = meta.execution;
    if (executionRevision === baseCommitId && !allowSameBase) throw new Error("Execution revision equals the artifact base; no inherited changes can be separated.");
    git(["merge-base", "--is-ancestor", baseCommitId, executionRevision]);
    git(["merge-base", "--is-ancestor", executionRevision, targetRef]);
    const isolatedPatch = git(["diff", "--binary", executionRevision, tree, "--"]);
    return {
      patch: isolatedPatch,
      normalization: {
        executionRevision,
        upstreamRevision: git(["rev-parse", `${targetRef}^{commit}`]).trim(),
        reconstructedTree: tree,
        sha256: createHash("sha256").update(isolatedPatch).digest("hex"),
        inheritedPaths: git(["diff", "--name-only", "-z", baseCommitId, executionRevision, "--"]).split("\0").filter(Boolean),
      },
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
