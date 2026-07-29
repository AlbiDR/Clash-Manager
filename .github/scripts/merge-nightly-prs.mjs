// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: MERGE NIGHTLY PRS
 * ----------------------------------------------------------------------------
 * Plain ESM — no external dependencies, runs with node directly.
 * Fetches all open PRs targeting Nightly, sorts by stage number, merges in
 * order, deletes head branches, and appends a changelog entry.
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

  // Extract PR history entries if 00-pr-history.md was changed
  let prHistoryBlock = "";
  if (changedFiles.includes(".github/nightly-logs/00-pr-history.md")) {
    const prHistoryContent = runCmd("git show " + branch + ":.github/nightly-logs/00-pr-history.md");
    const t1Header = "## T1 -- Active (last 7 days)\n";
    const t1Index = prHistoryContent.indexOf(t1Header);
    if (t1Index !== -1) {
      const rest = prHistoryContent.slice(t1Index + t1Header.length).trimStart();
      const nextEntryIndex = rest.indexOf("\n### ");
      if (nextEntryIndex !== -1) {
        prHistoryBlock = rest.slice(0, nextEntryIndex).trim() + "\n\n";
      } else {
        prHistoryBlock = rest.trim() + "\n\n";
      }
      log("Extracted PR history block:\n" + prHistoryBlock);
    }
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
        log("Extracted new lines for " + file + ": " + newLines.join(", "));
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

  // Re-apply PR history block
  if (prHistoryBlock) {
    log("Re-applying PR history block to 00-pr-history.md...");
    const historyFile = ".github/nightly-logs/00-pr-history.md";
    let content = fs.readFileSync(historyFile, "utf8");
    const t1Header = "## T1 -- Active (last 7 days)\n";
    const insertIdx = content.indexOf(t1Header);
    if (insertIdx !== -1) {
      content = content.slice(0, insertIdx + t1Header.length) + "\n" + prHistoryBlock + content.slice(insertIdx + t1Header.length);
      fs.writeFileSync(historyFile, content);
    } else {
      log("Warning: Could not find T1 marker to insert history entry", "warn");
    }
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
    return;
  }

  log(`Processing ${targets.length} PR(s) in stage order...`);

  const dir = path.dirname(CONFIG.changelogPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let changelogUpdates = "";

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
      for (let attempt = 1; attempt <= 8 && !merged; attempt++) {
        try {
          log(`Merge attempt ${attempt}/8 for PR #${pr.number}...`);
          await githubApi(
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

      const date = new Date().toISOString().split("T")[0];
      const stage = stageNumber(pr.head.ref);
      
      if (fs.existsSync(CONFIG.changelogPath)) {
        let content = fs.readFileSync(CONFIG.changelogPath, "utf8");
        const pendingRegex = new RegExp(`### \\[.*?\\] PR #PENDING \\[Stage ${stage}\\]:.*\\n\\*\\*Domain:\\*\\* .*? \\| \\*\\*Commit:\\*\\* PENDING \\| \\[View PR\\]\\(PENDING\\)`, "g");
        
        let matchFound = false;
        content = content.replace(pendingRegex, (match) => {
          matchFound = true;
          return match
            .replace('PR #PENDING', `PR #${pr.number}`)
            .replace('**Commit:** PENDING', `**Commit:** ${pr.head.sha}`)
            .replace('[View PR](PENDING)', `[View PR](${pr.html_url})`);
        });

        if (matchFound) {
          fs.writeFileSync(CONFIG.changelogPath, content);
          log(`Updated PENDING block for PR #${pr.number} in changelog.`);
        } else {
          log(`Warning: No PENDING block found for Stage ${stage} in changelog.`, "warn");
        }
      }

    } catch (e) {
      log(`FAILED PR #${pr.number}: ${e.message}`, "error");

      const date = new Date().toISOString().split("T")[0];
      const failMarker = `MERGE FAILED: PR #${pr.number}:`;
      const existing = fs.existsSync(CONFIG.changelogPath)
        ? fs.readFileSync(CONFIG.changelogPath, "utf8")
        : "";

      if (!existing.includes(failMarker)) {
        changelogUpdates =
          `\n## [${date}] MERGE FAILED: PR #${pr.number}: ${pr.title}\n` +
          `> [!CAUTION]\n` +
          `> **Status**: Auto-merge aborted.\n` +
          `> **Error**: \`${e.message}\`\n` +
          `> **PR Link**: [Link](${pr.html_url})\n` +
          changelogUpdates;
      }
    }
  }

  // Write changelog for first-pass failures
  if (changelogUpdates && fs.existsSync(CONFIG.changelogPath)) {
    let content = fs.readFileSync(CONFIG.changelogPath, "utf8");
    const t1Marker = "## T1 -- Active (last 7 days)\n";
    const insertIdx = content.indexOf(t1Marker);

    if (insertIdx !== -1) {
      content =
        content.slice(0, insertIdx + t1Marker.length) +
        changelogUpdates +
        content.slice(insertIdx + t1Marker.length);
      fs.writeFileSync(CONFIG.changelogPath, content);
      log("Changelog updated with failed merges.", "success");
    } else {
      log("Failed to find T1 marker to insert merge failures.", "warn");
    }
  }

  // --------------------------------------------------------------------------
  // Second-pass retry guard
  // --------------------------------------------------------------------------
  // After all stage PRs are processed in order, GitHub may still have open PRs
  // whose mergeability was in a pending (null) state during the first pass --
  // either because GitHub had not yet recomputed their merge status against the
  // freshly updated Nightly HEAD, or because a transient 405/409 lock was in
  // effect. Wait for a short settling period, then re-query and retry any PRs
  // that remain open. This closes the race window that causes Stage 13 to read
  // a stale coverage log and incorrectly classify the preceding stage as FAILED.
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

  if (retryTargets.length === 0) {
    log("Second-pass check: no remaining open Nightly PRs. Pipeline fully merged.", "success");
    return;
  }

  log(`Second-pass retrying ${retryTargets.length} still-open PR(s)...`);

  let retryChangelogUpdates = "";

  for (const pr of retryTargets) {
    log(`[Second pass] PR #${pr.number}: ${pr.title}`);

    try {
      let details = await githubApi(
        `/repos/${CONFIG.owner}/${CONFIG.repo}/pulls/${pr.number}`
      );

      // Poll for mergeability with an extended budget for the second pass.
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
      for (let attempt = 1; attempt <= 8 && !merged; attempt++) {
        try {
          log(`[Second pass] Merge attempt ${attempt}/8 for PR #${pr.number}...`);
          await githubApi(
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

      if (fs.existsSync(CONFIG.changelogPath)) {
        let content = fs.readFileSync(CONFIG.changelogPath, "utf8");
        const pendingRegex = new RegExp(
          `### \\[.*?\\] PR #PENDING \\[Stage ${stage}\\]:.*\n\\*\\*Domain:\\*\\* .*? \\| \\*\\*Commit:\\*\\* PENDING \\| \\[View PR\\]\\(PENDING\\)`,
          "g"
        );

        let matchFound = false;
        content = content.replace(pendingRegex, match => {
          matchFound = true;
          return match
            .replace("PR #PENDING", `PR #${pr.number}`)
            .replace("**Commit:** PENDING", `**Commit:** ${pr.head.sha}`)
            .replace("[View PR](PENDING)", `[View PR](${pr.html_url})`);
        });

        if (matchFound) {
          fs.writeFileSync(CONFIG.changelogPath, content);
          log(`[Second pass] Updated PENDING block for PR #${pr.number} in changelog.`);
        } else {
          log(`[Second pass] Warning: No PENDING block found for Stage ${stage} in changelog.`, "warn");
        }
      }

    } catch (e) {
      log(`[Second pass] FAILED PR #${pr.number}: ${e.message}`, "error");

      const date = new Date().toISOString().split("T")[0];
      const failMarker = `MERGE FAILED: PR #${pr.number}:`;
      const existing = fs.existsSync(CONFIG.changelogPath)
        ? fs.readFileSync(CONFIG.changelogPath, "utf8")
        : "";

      if (!existing.includes(failMarker)) {
        retryChangelogUpdates =
          `\n## [${date}] MERGE FAILED: PR #${pr.number}: ${pr.title}\n` +
          `> [!CAUTION]\n` +
          `> **Status**: Auto-merge aborted (second pass).\n` +
          `> **Error**: \`${e.message}\`\n` +
          `> **PR Link**: [Link](${pr.html_url})\n` +
          retryChangelogUpdates;
      }
    }
  }

  // Write changelog for second-pass failures
  if (retryChangelogUpdates && fs.existsSync(CONFIG.changelogPath)) {
    let content = fs.readFileSync(CONFIG.changelogPath, "utf8");
    const t1Marker = "## T1 -- Active (last 7 days)\n";
    const insertIdx = content.indexOf(t1Marker);

    if (insertIdx !== -1) {
      content =
        content.slice(0, insertIdx + t1Marker.length) +
        retryChangelogUpdates +
        content.slice(insertIdx + t1Marker.length);
      fs.writeFileSync(CONFIG.changelogPath, content);
      log("[Second pass] Changelog updated with failed merges.", "success");
    } else {
      log("[Second pass] Failed to find T1 marker to insert merge failures.", "warn");
    }
  }
}

run().catch(e => {
  console.error("CRITICAL:", e.message);
  process.exit(1);
});
