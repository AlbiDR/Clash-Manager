// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: MERGE NIGHTLY PRS
 * ----------------------------------------------------------------------------
 * Plain ESM — no external dependencies, runs with node directly.
 * Fetches all open PRs targeting Nightly, sorts by stage number, merges in
 * order, deletes head branches, and appends a changelog entry via Git tags.
 * ============================================================================
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const CONFIG = {
  owner: process.env.GITHUB_REPOSITORY?.split("/")[0] ?? "",
  repo:  process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "",
  targetBranch: "Nightly",
  allowedAuthors: ["google-labs-jules", "AlbiDR"],
  token: process.env.GITHUB_TOKEN ?? "",
  changelogPath: path.join(".github", "nightly-logs", "00-pr-history.md"),
};

// ----------------------------------------------------------------------------
// Logging
// ----------------------------------------------------------------------------
function log(msg, type = "info") {
  const labels = { info: "[INFO]   ", warn: "[NOTICE] ", error: "[FAIL]   ", success: "[DONE]   " };
  console.log(`${new Date().toISOString()} ${labels[type] ?? "[INFO]   "} ${msg}`);
}

// ----------------------------------------------------------------------------
// GitHub API
// ----------------------------------------------------------------------------
async function githubApi(endpoint, method = "GET", body = null, isGraphQL = false) {
  const url = isGraphQL
    ? "https://api.github.com/graphql"
    : `https://api.github.com${endpoint}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${CONFIG.token}`,
      "User-Agent": "Clash-Manager-Automation",
      Accept: isGraphQL ? "application/json" : "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status} ${res.statusText}: ${text}`);
  }

  return res.json();
}

// ----------------------------------------------------------------------------
// GraphQL: un-draft a PR
// ----------------------------------------------------------------------------
async function markReadyForReview(nodeId) {
  const query = `
    mutation($id: ID!) {
      markPullRequestReadyForReview(input: {pullRequestId: $id}) {
        pullRequest { id isDraft }
      }
    }
  `;
  const res = await githubApi("", "POST", { query, variables: { id: nodeId } }, true);
  if (res.errors) throw new Error(res.errors.map(e => e.message).join(", "));
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function stageNumber(ref) {
  const m = ref.match(/nightly\/stage-(\d+)/i);
  return m ? parseInt(m[1], 10) : 999;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// How long to wait after the primary merge loop before attempting the second
// pass. This gives GitHub time to recompute mergeability for all remaining
// open PRs against the newly updated Nightly HEAD, closing the race window
// that caused Stage 11 PRs to be invisible to Stage 13's coverage-log read.
const SECOND_PASS_SETTLE_MS = 15_000;

// Maximum number of mergeability polls per PR in the second pass.
// 8 attempts x 5 seconds = 40 seconds max wait per PR.
const SECOND_PASS_POLL_MAX = 8;

// ----------------------------------------------------------------------------
// Conflict Resolution and Rebasing
// ----------------------------------------------------------------------------
function runCmd(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

async function resolveConflictsAndRebase(pr) {
  const branch = pr.head.ref;
  log("Rebasing and resolving conflicts for branch " + branch);

  // Ensure git user is configured
  runCmd("git config --global user.name 'github-actions[bot]'");
  runCmd("git config --global user.email 'github-actions[bot]@users.noreply.github.com'");

  // Fetch the latest PR branch
  runCmd("git fetch origin " + branch + ":" + branch);

  // Get the merge base
  const mergeBase = runCmd("git merge-base " + branch + " Nightly");

  // List all files changed in the PR branch compared to the merge base
  const changedFiles = runCmd("git diff --name-only " + mergeBase + " " + branch).split("\n").filter(Boolean);
  log("Changed files in PR: " + changedFiles.join(", "));

  // We will store the modifications
  const sourcePatchPath = "/tmp/source.patch";
  
  // Create a patch of all non-log files
  try {
    if (fs.existsSync(sourcePatchPath)) fs.unlinkSync(sourcePatchPath);
    const sourceDiff = runCmd("git diff " + mergeBase + " " + branch + " -- . ':!.github/nightly-logs/*'");
    if (sourceDiff) {
      fs.writeFileSync(sourcePatchPath, sourceDiff);
    }
  } catch (e) {
    log("Failed to create source diff patch: " + e.message, "warn");
  }

  // Extract coverage log lines
  const coverageLogs = {};
  for (const file of changedFiles) {
    if (file.startsWith(".github/nightly-logs/") && file.endsWith("-coverage.log")) {
      const prLogContent = runCmd("git show " + branch + ":" + file);
      const prLines = prLogContent.split("\n").filter(Boolean);
      const nightlyLogContent = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      const nightlyLines = new Set(nightlyLogContent.split("\n").filter(Boolean));
      const newLines = prLines.filter(line => !nightlyLines.has(line));
      if (newLines.length > 0) {
        coverageLogs[file] = newLines;
        log("Extracting new lines for " + file + ": " + newLines.join(", "));
      }
    }
  }

  // For other files under .github/nightly-logs/
  const otherLogs = {};
  for (const file of changedFiles) {
    if (file.startsWith(".github/nightly-logs/") && !file.endsWith("-coverage.log") && file !== ".github/nightly-logs/00-pr-history.md") {
      const content = runCmd("git show " + branch + ":" + file);
      otherLogs[file] = content;
      log("Stored content for other log file: " + file);
    }
  }

  // Reset the PR branch to the current Nightly HEAD
  runCmd("git checkout " + branch);
  runCmd("git reset --hard Nightly");

  // Re-apply source file changes
  if (fs.existsSync(sourcePatchPath) && fs.readFileSync(sourcePatchPath, "utf8").trim()) {
    log("Applying source code patch...");
    runCmd("git apply " + sourcePatchPath);
  }

  // Re-apply coverage log entries
  for (const [file, lines] of Object.entries(coverageLogs)) {
    log("Re-applying coverage log entries to " + file);
    let content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (!content.endsWith("\n") && content.length > 0) content += "\n";
    content += lines.join("\n") + "\n";
    fs.writeFileSync(file, content);
  }

  // Re-apply other log files
  for (const [file, content] of Object.entries(otherLogs)) {
    log("Overwriting " + file + " with PR version...");
    fs.writeFileSync(file, content);
  }

  // Add and commit changes
  runCmd("git add .");
  const status = runCmd("git status --porcelain");
  if (status) {
    runCmd("git commit -m \"" + pr.title + "\"");
    log("Committed resolved changes on PR branch.");
    const repoUrl = "https://x-access-token:" + CONFIG.token + "@github.com/" + CONFIG.owner + "/" + CONFIG.repo + ".git";
    runCmd("git push " + repoUrl + " HEAD:" + branch + " --force");
    log("Successfully force-pushed resolved branch " + branch + " to origin.");
  } else {
    log("No changes detected after rebase. Branch is identical to Nightly.");
  }

  // Go back to Nightly branch and clean up
  runCmd("git checkout Nightly");
}

// ----------------------------------------------------------------------------
// Metadata Extraction & Tagging
// ----------------------------------------------------------------------------
function extractMetadata(pr) {
  const body = pr.body || "";
  
  // Try parsing the NIGHTLY_PR_METADATA block
  const metaMatch = body.match(/NIGHTLY_PR_METADATA:\s*([\s\S]*?)-->/);
  
  let domain = "Unknown";
  let why = "Daily audit pass.";
  let change = pr.title;
  let result = "Nominal validation.";

  if (metaMatch) {
    const lines = metaMatch[1].split("\n");
    lines.forEach(line => {
      const match = line.match(/^\s*([^:]+):\s*(.*)$/);
      if (match) {
        const key = match[1].trim().toLowerCase();
        const val = match[2].trim();
        if (key === "domain") domain = val;
        if (key === "why") why = val;
        if (key === "change") change = val;
        if (key === "result") result = val;
      }
    });
  } else {
    // Try to parse standard sections from the description if present
    const whyMatch = body.match(/\*\*\[Reasoning\]\*\*:\s*([^\n]+)/i) || body.match(/\*\*\[Why\]\*\*:\s*([^\n]+)/i);
    const changeMatch = body.match(/\*\*\[Changes\]\*\*:\s*([^\n]+)/i) || body.match(/\*\*\[Change\]\*\*:\s*([^\n]+)/i);
    const resultMatch = body.match(/\*\*\[Result\]\*\*:\s*([^\n]+)/i) || body.match(/\*\*\[Verification\]\*\*:\s*([^\n]+)/i);
    
    if (whyMatch) why = whyMatch[1].trim();
    if (changeMatch) change = changeMatch[1].trim();
    if (resultMatch) result = resultMatch[1].trim();
  }

  // Sanitize values to prevent command injection
  const sanitize = (str) => str.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  return {
    domain: sanitize(domain),
    why: sanitize(why),
    change: sanitize(change),
    result: sanitize(result)
  };
}

function tagMergeCommit(sha, stage, prNum, meta) {
  const date = new Date().toISOString().split("T")[0];
  const tagName = `nightly/${date}/stage-${stage}`;
  const tagMessage = `PR: #${prNum}
Domain: ${meta.domain}
Why: ${meta.why}
Change: ${meta.change}
Result: ${meta.result}`;

  try {
    // Create local annotated tag
    runCmd(`git tag -a "${tagName}" -m "${tagMessage}" ${sha}`);
    // Push the tag to remote
    const repoUrl = `https://x-access-token:${CONFIG.token}@github.com/${CONFIG.owner}/${CONFIG.repo}.git`;
    runCmd(`git push ${repoUrl} "${tagName}"`);
    log(`Successfully pushed annotated Git tag: ${tagName}`, "success");
  } catch (err) {
    log(`Failed to create/push tag ${tagName}: ${err.message}`, "warn");
  }
}

function compileChangelog(newFailedMerges = []) {
  log("Recompiling T1 history from Git tags...");
  runCmd("git fetch --tags");
  
  // List all nightly/ tags
  const tagsStr = runCmd("git tag -l 'nightly/*'").trim();
  const tags = tagsStr ? tagsStr.split("\n").filter(Boolean) : [];
  
  const dateLimit = new Date();
  dateLimit.setDate(dateLimit.getDate() - 7); // 7 days ago

  const entries = [];

  for (const tag of tags) {
    // tag format: nightly/YYYY-MM-DD/stage-N
    const match = tag.match(/^nightly\/(\d{4}-\d{2}-\d{2})\/stage-(\d+)$/);
    if (!match) continue;

    const tagDateStr = match[1];
    const stage = match[2];
    const tagDate = new Date(tagDateStr);
    
    // Skip if older than 7 days
    if (tagDate < dateLimit) continue;

    try {
      // Get the tag details
      const sha = runCmd(`git rev-parse ${tag}`);
      const body = runCmd(`git tag -l ${tag} --format="%(contents)"`);
      
      // Parse tag body lines
      const lines = body.split("\n");
      let prNum = "PENDING";
      let domain = "Unknown";
      let why = "";
      let change = "";
      let result = "";

      lines.forEach(line => {
        const matchLine = line.match(/^([^:]+):\s*(.*)$/);
        if (matchLine) {
          const key = matchLine[1].trim().toLowerCase();
          const val = matchLine[2].trim();
          if (key === "pr") prNum = val.replace("#", "");
          if (key === "domain") domain = val;
          if (key === "why") why = val;
          if (key === "change") change = val;
          if (key === "result") result = val;
        }
      });

      if (!change) {
        change = `Stage ${stage} run record`;
      }

      // Query files changed for the squash merge commit SHA
      let filesList = "codebase";
      try {
        const filesStr = runCmd(`git diff-tree --no-commit-id --name-only -r ${sha}`).trim();
        if (filesStr) {
          const files = filesStr.split("\n").filter(Boolean);
          if (files.length <= 5) {
            filesList = files.join(", ");
          } else {
            // Group files by top-level directory
            const groups = {};
            files.forEach(f => {
              const dir = f.split("/").slice(0, 3).join("/");
              groups[dir] = (groups[dir] || 0) + 1;
            });
            filesList = Object.entries(groups)
              .map(([dir, count]) => `${dir}/* (${count} files)`)
              .join(", ");
          }
        }
      } catch (err) {
        log(`Warning: Failed to fetch files for tag ${tag}: ${err.message}`, "warn");
      }

      const viewUrl = `https://github.com/${CONFIG.owner}/${CONFIG.repo}/pull/${prNum}`;

      const block = `### [${tagDateStr}] PR #${prNum} [Stage ${stage}]: ${change}
**Domain:** ${domain} | **Commit:** ${sha} | [View PR](${viewUrl})
**Files:** ${filesList}
**Why:** ${why}
**Change:** ${change}
**Result:** ${result}`;

      entries.push({ date: tagDate, stage: parseInt(stage, 10), isMergeFailed: false, block });
    } catch (err) {
      log(`Failed parsing tag ${tag}: ${err.message}`, "warn");
    }
  }

  // Extract existing recent MERGE FAILED blocks from 00-pr-history.md
  const failedBlocks = [...newFailedMerges];
  if (fs.existsSync(CONFIG.changelogPath)) {
    const fileContent = fs.readFileSync(CONFIG.changelogPath, "utf8");
    const t1Marker = "## T1 -- Active (last 7 days)\n";
    const t2Marker = "## T2 -- Recent (8-30 days)";
    const parts1 = fileContent.split(t1Marker);
    if (parts1.length >= 2) {
      const parts2 = parts1[1].split(t2Marker);
      if (parts2.length >= 2) {
        const t1Section = parts2[0];
        const lines = t1Section.split("\n");
        let currentBlock = [];
        lines.forEach(line => {
          if (line.startsWith("## [") && line.includes("MERGE FAILED")) {
            if (currentBlock.length > 0) failedBlocks.push(currentBlock.join("\n"));
            currentBlock = [line];
          } else if (currentBlock.length > 0) {
            if (line.startsWith("### ") || line.startsWith("## T")) {
              failedBlocks.push(currentBlock.join("\n"));
              currentBlock = [];
            } else {
              currentBlock.push(line);
            }
          }
        });
        if (currentBlock.length > 0) failedBlocks.push(currentBlock.join("\n"));
      }
    }
  }

  // Parse date and push failed merge blocks
  failedBlocks.forEach(block => {
    const dateMatch = block.match(/## \[(\d{4}-\d{2}-\d{2})\]/);
    if (dateMatch) {
      const blockDateStr = dateMatch[1];
      const blockDate = new Date(blockDateStr);
      if (blockDate >= dateLimit) {
        // Find PR number if possible for sorting, default to 0
        const prMatch = block.match(/PR #(\d+)/);
        const prNum = prMatch ? parseInt(prMatch[1], 10) : 0;
        entries.push({ date: blockDate, stage: prNum, isMergeFailed: true, block });
      }
    }
  });

  // Deduplicate entries by block content signature
  const seenSignatures = new Set();
  const dedupedEntries = [];
  for (const entry of entries) {
    // Generate a simple signature from the block's first 60 chars to avoid exact duplicate inserts
    const sig = entry.block.trim().split("\n").slice(0, 3).join("\n");
    if (!seenSignatures.has(sig)) {
      seenSignatures.add(sig);
      dedupedEntries.push(entry);
    }
  }

  // Sort entries: newest date first, then highest stage/PR number first
  dedupedEntries.sort((a, b) => {
    const diffDate = b.date - a.date;
    if (diffDate !== 0) return diffDate;
    return b.stage - a.stage;
  });

  const t1Content = dedupedEntries.map(e => e.block.trim()).join("\n\n\n") + "\n\n";

  // Re-write 00-pr-history.md
  if (fs.existsSync(CONFIG.changelogPath)) {
    let fileContent = fs.readFileSync(CONFIG.changelogPath, "utf8");
    const t1Marker = "## T1 -- Active (last 7 days)\n";
    const t2Marker = "## T2 -- Recent (8-30 days)";
    
    const parts1 = fileContent.split(t1Marker);
    if (parts1.length >= 2) {
      const parts2 = parts1[1].split(t2Marker);
      if (parts2.length >= 2) {
        const newFileContent = parts1[0] + t1Marker + "\n" + t1Content + t2Marker + parts2[1];
        fs.writeFileSync(CONFIG.changelogPath, newFileContent);
        log("Successfully recompiled 00-pr-history.md T1 section from Git tags.", "success");
      } else {
        log("Error: Could not find T2 marker in 00-pr-history.md", "error");
      }
    } else {
      log("Error: Could not find T1 marker in 00-pr-history.md", "error");
    }
  }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function run() {
  if (!CONFIG.token) throw new Error("GITHUB_TOKEN is missing.");

  log(`Fetching open PRs targeting ${CONFIG.targetBranch}...`);

  // Paginate all open PRs
  let prs = [];
  let page = 1;
  while (true) {
    const page_prs = await githubApi(
      `/repos/${CONFIG.owner}/${CONFIG.repo}/pulls?state=open&per_page=100&page=${page}`
    );
    if (page_prs.length === 0) break;
    prs = prs.concat(page_prs);
    page++;
  }

  log(`Found ${prs.length} total open PR(s).`);

  // Filter to allowed authors targeting Nightly, sort by stage number
  const targets = prs
    .filter(pr => {
      const login = pr.user.login.toLowerCase();
      const allowed = CONFIG.allowedAuthors.some(a =>
        login === a.toLowerCase() || login === `${a.toLowerCase()}[bot]`
      );
      const isTargetBranch = pr.base.ref === CONFIG.targetBranch;
      const isNightlyBranch = pr.head.ref.startsWith("nightly/");
      if (isTargetBranch && !allowed) {
        log(`Skipping PR #${pr.number} by ${login} — author not on allowlist.`, "warn");
      }
      if (isTargetBranch && allowed && !isNightlyBranch) {
        log(`Skipping PR #${pr.number} — head '${pr.head.ref}' is not a nightly/* branch.`, "warn");
      }
      return allowed && isTargetBranch && isNightlyBranch;
    })
    .sort((a, b) => {
      const diff = stageNumber(a.head.ref) - stageNumber(b.head.ref);
      return diff !== 0 ? diff : a.number - b.number;
    });

  if (targets.length === 0) {
    log("No matching Nightly PRs found.", "success");
    // Even if no PRs were merged, compile the changelog to keep it aged and self-healed
    compileChangelog();
    return;
  }

  log(`Processing ${targets.length} PR(s) in stage order...`);

  const dir = path.dirname(CONFIG.changelogPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const currentFailedMerges = [];

  for (const pr of targets) {
    log(`PR #${pr.number}: ${pr.title}`);

    try {
      // Fetch full details
      let details = await githubApi(
        `/repos/${CONFIG.owner}/${CONFIG.repo}/pulls/${pr.number}`
      );

      // Un-draft if needed
      if (details.draft) {
        log(`PR #${pr.number} is a draft — marking ready for review...`);
        try {
          await markReadyForReview(pr.node_id);
          details = await githubApi(`/repos/${CONFIG.owner}/${CONFIG.repo}/pulls/${pr.number}`);
        } catch (e) {
          log(`Draft conversion failed for PR #${pr.number}: ${e.message}`, "warn");
        }
      }

      // Poll for mergeability — 5 attempts × 5 seconds = 25 seconds max
      let polls = 0;
      while (details.mergeable === null && polls < 5) {
        log(`Waiting for mergeability on PR #${pr.number} (${polls + 1}/5)...`);
        await sleep(5000);
        details = await githubApi(`/repos/${CONFIG.owner}/${CONFIG.repo}/pulls/${pr.number}`);
        polls++;
      }

      if (details.mergeable === false) {
        log("PR #" + pr.number + " has merge conflicts. Attempting automatic resolution...");
        try {
          await resolveConflictsAndRebase(pr);
          details = await githubApi("/repos/" + CONFIG.owner + "/" + CONFIG.repo + "/pulls/" + pr.number);
          let refetchPolls = 0;
          while (details.mergeable === null && refetchPolls < 5) {
            log("Waiting for GitHub to compute mergeability after force-push (" + (refetchPolls + 1) + "/5)...");
            await sleep(5000);
            details = await githubApi("/repos/" + CONFIG.owner + "/" + CONFIG.repo + "/pulls/" + pr.number);
            refetchPolls++;
          }
        } catch (rebaseError) {
          log("Automatic conflict resolution failed for PR #" + pr.number + ": " + rebaseError.message, "error");
          throw rebaseError;
        }
      }

      // Merge with exponential backoff
      const mergeBody = {
        merge_method: "squash",
        commit_title: `${pr.title} (#${pr.number})`,
        commit_message: `Automated merge of PR #${pr.number} (author: ${pr.user.login})`,
      };

      let merged = false;
      let mergeResult = null;
      for (let attempt = 1; attempt <= 8 && !merged; attempt++) {
        try {
          log(`Merge attempt ${attempt}/8 for PR #${pr.number}...`);
          mergeResult = await githubApi(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/pulls/${pr.number}/merge`,
            "PUT",
            mergeBody
          );
          log(`Merged PR #${pr.number}.`, "success");
          merged = true;
        } catch (e) {
          if (attempt < 8 && (e.message.includes("405") || e.message.includes("409"))) {
            const wait = Math.pow(2, attempt) * 1000;
            log(`Merge blocked — retrying in ${wait / 1000}s...`, "warn");
            await sleep(wait);
          } else {
            throw e;
          }
        }
      }

      // Delete head branch
      try {
        await githubApi(
          `/repos/${CONFIG.owner}/${CONFIG.repo}/git/refs/heads/${pr.head.ref}`,
          "DELETE"
        );
        log(`Deleted branch ${pr.head.ref}.`, "success");
      } catch (e) {
        if (e.message.includes("404")) {
          log(`Branch ${pr.head.ref} already deleted.`);
        } else {
          log(`Failed to delete branch ${pr.head.ref}: ${e.message}`, "warn");
        }
      }

      const stage = stageNumber(pr.head.ref);
      if (merged && mergeResult && mergeResult.sha) {
        const meta = extractMetadata(pr);
        tagMergeCommit(mergeResult.sha, stage, pr.number, meta);
      }

    } catch (e) {
      log(`FAILED PR #${pr.number}: ${e.message}`, "error");

      const date = new Date().toISOString().split("T")[0];
      currentFailedMerges.push(
        `## [${date}] MERGE FAILED: PR #${pr.number}: ${pr.title}\n` +
        `> [!CAUTION]\n` +
        `> **Status**: Auto-merge aborted.\n` +
        `> **Error**: \`${e.message}\`\n` +
        `> **PR Link**: [Link](${pr.html_url})`
      );
    }
  }

  // --------------------------------------------------------------------------
  // Second-pass retry guard
  // --------------------------------------------------------------------------
  log(`Settling for ${SECOND_PASS_SETTLE_MS / 1000}s before second-pass check...`);
  await sleep(SECOND_PASS_SETTLE_MS);

  let retryPrs = [];
  let retryPage = 1;
  while (true) {
    const pagePrs = await githubApi(
      `/repos/${CONFIG.owner}/${CONFIG.repo}/pulls?state=open&per_page=100&page=${retryPage}`
    );
    if (pagePrs.length === 0) break;
    retryPrs = retryPrs.concat(pagePrs);
    retryPage++;
  }

  const retryTargets = retryPrs
    .filter(pr => {
      const login = pr.user.login.toLowerCase();
      const allowed = CONFIG.allowedAuthors.some(a =>
        login === a.toLowerCase() || login === `${a.toLowerCase()}[bot]`
      );
      return (
        allowed &&
        pr.base.ref === CONFIG.targetBranch &&
        pr.head.ref.startsWith("nightly/")
      );
    })
    .sort((a, b) => {
      const diff = stageNumber(a.head.ref) - stageNumber(b.head.ref);
      return diff !== 0 ? diff : a.number - b.number;
    });

  if (retryTargets.length > 0) {
    log(`Second-pass retrying ${retryTargets.length} still-open PR(s)...`);

    for (const pr of retryTargets) {
      log(`[Second pass] PR #${pr.number}: ${pr.title}`);

      try {
        let details = await githubApi(
          `/repos/${CONFIG.owner}/${CONFIG.repo}/pulls/${pr.number}`
        );

        let polls = 0;
        while (details.mergeable === null && polls < SECOND_PASS_POLL_MAX) {
          log(`[Second pass] Waiting for mergeability on PR #${pr.number} (${polls + 1}/${SECOND_PASS_POLL_MAX})...`);
          await sleep(5_000);
          details = await githubApi(`/repos/${CONFIG.owner}/${CONFIG.repo}/pulls/${pr.number}`);
          polls++;
        }

        if (details.mergeable === false) {
          log("[Second pass] PR #" + pr.number + " has merge conflicts. Attempting automatic resolution...");
          try {
            await resolveConflictsAndRebase(pr);
            details = await githubApi("/repos/" + CONFIG.owner + "/" + CONFIG.repo + "/pulls/" + pr.number);
            let refetchPolls = 0;
            while (details.mergeable === null && refetchPolls < SECOND_PASS_POLL_MAX) {
              log("[Second pass] Waiting for GitHub to compute mergeability after force-push (" + (refetchPolls + 1) + "/" + SECOND_PASS_POLL_MAX + ")...");
              await sleep(5000);
              details = await githubApi("/repos/" + CONFIG.owner + "/" + CONFIG.repo + "/pulls/" + pr.number);
              refetchPolls++;
            }
          } catch (rebaseError) {
            log("[Second pass] Automatic conflict resolution failed for PR #" + pr.number + ": " + rebaseError.message, "error");
            throw rebaseError;
          }
        }

        const mergeBody = {
          merge_method: "squash",
          commit_title: `${pr.title} (#${pr.number})`,
          commit_message: `Automated merge of PR #${pr.number} (author: ${pr.user.login})`,
        };

        let merged = false;
        let mergeResult = null;
        for (let attempt = 1; attempt <= 8 && !merged; attempt++) {
          try {
            log(`[Second pass] Merge attempt ${attempt}/8 for PR #${pr.number}...`);
            mergeResult = await githubApi(
              `/repos/${CONFIG.owner}/${CONFIG.repo}/pulls/${pr.number}/merge`,
              "PUT",
              mergeBody
            );
            log(`[Second pass] Merged PR #${pr.number}.`, "success");
            merged = true;
          } catch (e) {
            if (attempt < 8 && (e.message.includes("405") || e.message.includes("409"))) {
              const wait = Math.pow(2, attempt) * 1000;
              log(`[Second pass] Merge blocked -- retrying in ${wait / 1000}s...`, "warn");
              await sleep(wait);
            } else {
              throw e;
            }
          }
        }

        // Delete head branch
        try {
          await githubApi(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/git/refs/heads/${pr.head.ref}`,
            "DELETE"
          );
          log(`[Second pass] Deleted branch ${pr.head.ref}.`, "success");
        } catch (e) {
          if (e.message.includes("404")) {
            log(`[Second pass] Branch ${pr.head.ref} already deleted.`);
          } else {
            log(`[Second pass] Failed to delete branch ${pr.head.ref}: ${e.message}`, "warn");
          }
        }

        const stage = stageNumber(pr.head.ref);
        if (merged && mergeResult && mergeResult.sha) {
          const meta = extractMetadata(pr);
          tagMergeCommit(mergeResult.sha, stage, pr.number, meta);
        }

      } catch (e) {
        log(`[Second pass] FAILED PR #${pr.number}: ${e.message}`, "error");

        const date = new Date().toISOString().split("T")[0];
        currentFailedMerges.push(
          `## [${date}] MERGE FAILED: PR #${pr.number}: ${pr.title}\n` +
          `> [!CAUTION]\n` +
          `> **Status**: Auto-merge aborted (second pass).\n` +
          `> **Error**: \`${e.message}\`\n` +
          `> **PR Link**: [Link](${pr.html_url})`
        );
      }
    }
  }

  // Compile final changelog dynamically from tags and write it to 00-pr-history.md
  compileChangelog(currentFailedMerges);
}

run().catch(e => {
  console.error("CRITICAL:", e.message);
  process.exit(1);
});
