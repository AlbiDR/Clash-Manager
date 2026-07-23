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
        throw new Error(`Merge conflicts (state: ${details.mergeable_state ?? "unknown"}).`);
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
        const pendingRegex = new RegExp(`### \\\\[.*?\\\\] PR #PENDING \\\\[Stage ${stage}\\\\]:.*\\n\\*\\*Domain:\\*\\* .*? \\| \\*\\*Commit:\\*\\* PENDING \\| \\\\[View PR\\\\]\\(PENDING\\)`, 'g');
        
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

  // Write changelog
  if (changelogUpdates && fs.existsSync(CONFIG.changelogPath)) {
    let content = fs.readFileSync(CONFIG.changelogPath, "utf8");
    const t1Marker = "## T1 -- Active (last 7 days)\n";
    const insertIdx = content.indexOf(t1Marker);
    
    if (insertIdx !== -1) {
      content = content.slice(0, insertIdx + t1Marker.length) + changelogUpdates + content.slice(insertIdx + t1Marker.length);
      fs.writeFileSync(CONFIG.changelogPath, content);
      log("Changelog updated with failed merges.", "success");
    } else {
      log("Failed to find T1 marker to insert merge failures.", "warn");
    }
  }
}

run().catch(e => {
  console.error("CRITICAL:", e.message);
  process.exit(1);
});
