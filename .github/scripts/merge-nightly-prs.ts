import fs from "fs";
import path from "path";

/**
 * ============================================================================
 * SCRIPT: MERGE NIGHTLY PRS
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Automates the merging of PRs from machine authors.
 * VERSION: 3.3.0
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION & TYPES
// ============================================================================
const CONFIG = {
  targetOwner: process.env.GITHUB_REPOSITORY?.split("/")[0] || "",
  targetRepo: process.env.GITHUB_REPOSITORY?.split("/")[1] || "",
  targetBranch: "Nightly",
  allowedAuthors: ["google-labs-jules", "AlbiDR"],
  token: process.env.GITHUB_TOKEN || "",
  changelogPath: path.join(".github", "nightly-logs", "PR_HISTORY.md"),
};

function log(message: string, type: "info" | "warn" | "error" | "success" = "info") {
  const timestamp = new Date().toISOString();
  const labels = {
    info: "[INFO]   ",
    warn: "[NOTICE] ",
    error: "[FAIL]   ",
    success: "[DONE]   "
  };
  console.log(`${timestamp} ${labels[type]} ${message}`);
}

interface GitHubPR {
  number: number;
  node_id: string;
  title: string;
  body: string | null;
  html_url: string;
  draft: boolean;
  base: {
    ref: string;
  };
  user: {
    login: string;
  };
  head: {
    sha: string;
    ref: string;
  };
}

interface GraphQLResponse {
  data?: {
    markPullRequestReadyForReview?: {
      pullRequest?: {
        id: string;
        isDraft: boolean;
      };
    };
  };
  errors?: Array<{ message: string }>;
}

// ============================================================================
// CORE ENGINE: FETCH HANDLER
// ============================================================================
async function githubApi(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body: any = null,
  isGraphQL: boolean = false,
): Promise<any> {
  const url = isGraphQL
    ? "https://api.github.com/graphql"
    : `https://api.github.com${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `token ${CONFIG.token}`,
      "User-Agent": "Clash-Manager-Automation",
      Accept: isGraphQL ? "application/json" : "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API Error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return response.json();
}

// ============================================================================
// GRAPHQL HELPERS
// ============================================================================
async function markReadyForReview(nodeId: string): Promise<void> {
  const query = `
    mutation($id: ID!) {
      markPullRequestReadyForReview(input: {pullRequestId: $id}) {
        pullRequest {
          id
          isDraft
        }
      }
    }
  `;
  const res: GraphQLResponse = await githubApi(
    "",
    "POST",
    { query, variables: { id: nodeId } },
    true,
  );
  if (res.errors) {
    throw new Error(res.errors.map((e) => e.message).join(", "));
  }
}

// ============================================================================
// AUTOMATION LOGIC: Nightly PR Merge Engine
// ============================================================================
async function run() {
  try {
    if (!CONFIG.token) {
      throw new Error("GITHUB_TOKEN is missing in environment.");
    }

    log(`Checking for PRs targeting ${CONFIG.targetBranch}...`);

    // 1. Fetch Open PRs (Paginated)
    let prs: GitHubPR[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const pagePrs: GitHubPR[] = await githubApi(
        `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls?state=open&per_page=100&page=${page}`,
      );
      if (pagePrs.length === 0) {
        hasMore = false;
      } else {
        prs = prs.concat(pagePrs);
        page++;
      }
    }

    log(`Found ${prs.length} total open PRs.`);

    // 2. Filter for Nightly PRs and Sort by Number ASC
    const targetPrs = prs
      .filter((pr: GitHubPR) => {
        const login = pr.user.login.toLowerCase();
        const isAllowedAuthor = CONFIG.allowedAuthors.some(allowed =>
          login === allowed.toLowerCase() || login === `${allowed.toLowerCase()}[bot]`
        );

        const isTargetBranch = pr.base.ref === CONFIG.targetBranch;

        if (isTargetBranch && !isAllowedAuthor) {
          log(`Skipping PR #${pr.number} by ${login} (Authentication failed: Author not on whitelist)`, "warn");
        }

        return isAllowedAuthor && isTargetBranch;
      })
      .sort((a: GitHubPR, b: GitHubPR) => a.number - b.number); // Preserve pipeline sequence

    if (targetPrs.length === 0) {
      log("No matching Nightly PRs found.", "success");
      return;
    }

    log(`Processing ${targetPrs.length} PR(s) targeting ${CONFIG.targetBranch}...`);

    // Ensure .nightly directory exists
    const dir = path.dirname(CONFIG.changelogPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let changelogUpdates = "";

    for (const pr of targetPrs) {
      log(`Processing PR #${pr.number}: ${pr.title}`);

      try {
        // Fetch full details to check for draft status and mergeability
        let details: GitHubPR & { mergeable?: boolean | null, mergeable_state?: string } = await githubApi(
          `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls/${pr.number}`,
        );

        if (details.draft) {
          log(`PR #${pr.number} is a Draft. Marking as Ready for Review...`, "info");
          try {
            await markReadyForReview(pr.node_id);
            // Refresh details after undrafting
            details = await githubApi(`/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls/${pr.number}`);
          } catch (e: any) {
            log(`Draft conversion failed for PR #${pr.number}: ${e.message}`, "warn");
          }
        }

        // Poll for mergeability resolution (GitHub calculates this asynchronously)
        let pollCount = 0;
        while (details.mergeable === null && pollCount < 5) {
          log(`Waiting for GitHub to calculate mergeability for PR #${pr.number}...`, "info");
          await new Promise((r) => setTimeout(r, 4000));
          details = await githubApi(`/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls/${pr.number}`);
          pollCount++;
        }

        if (details.mergeable === false) {
          throw new Error(`PR has hard merge conflicts (State: ${details.mergeable_state || 'unknown'}). Cannot auto-merge.`);
        }

        // 3. Merge Logic with Exponential Backoff
        const maxTries = 5;
        let merged = false;
        let tryCount = 1;

        const mergeBody = {
          merge_method: "squash",
          commit_title: `${pr.title} (#${pr.number})`,
          commit_message: `Automated merge of PR #${pr.number} (Actor: ${pr.user.login})`,
        };

        while (!merged && tryCount <= maxTries) {
          try {
            log(`Attempting merge #${tryCount}/${maxTries} for PR #${pr.number}...`, "info");
            await githubApi(
              `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls/${pr.number}/merge`,
              "PUT",
              mergeBody,
            );
            log(`Successfully merged PR #${pr.number}`, "success");

            // 3.1 Delete Head Branch
            log(`Attempting to delete head branch ${pr.head.ref} for PR #${pr.number}...`, "info");
            try {
              await githubApi(
                `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/git/refs/heads/${pr.head.ref}`,
                "DELETE"
              );
              log(`Successfully deleted branch ${pr.head.ref}`, "success");
            } catch (deleteError: any) {
              // 404 is acceptable (branch already deleted by GitHub settings if enabled)
              if (deleteError.message.includes("404")) {
                log(`Branch ${pr.head.ref} already deleted.`, "info");
              } else {
                log(`Failed to delete branch ${pr.head.ref}: ${deleteError.message}`, "warn");
              }
            }
            merged = true;
          } catch (error: any) {
            if (
              tryCount < maxTries &&
              (error.message.includes("405") || error.message.includes("409"))
            ) {
              const waitMs = Math.pow(2, tryCount) * 1000;
              log(`Merge blocked. Retrying in ${waitMs / 1000}s...`, "warn");
              await new Promise((r) => setTimeout(r, waitMs));
              tryCount++;
            } else {
              throw error;
            }
          }
        }

        // 4. Record Success
        const date = new Date().toISOString().split("T")[0];
        changelogUpdates =
          `
## [${date}] PR #${pr.number}: ${pr.title}
**Commit**: \`${pr.head.sha}\`
**Original PR**: [Link](${pr.html_url})

${pr.body ? "### Description\n" + pr.body : ""}

---
` + changelogUpdates;
      } catch (error: any) {
        console.error(`FAILED: PR #${pr.number}: ${error.message}`);
        const date = new Date().toISOString().split("T")[0];
        changelogUpdates =
          `
## [${date}] MERGE FAILED: PR #${pr.number}: ${pr.title}
> [!CAUTION]
> **Status**: Auto-merge aborted.
> **Error**: \`${error.message}\`  
> **PR Link**: [Link](${pr.html_url})

---
` + changelogUpdates;
      }
    }

    // 5. Update Changelog
    if (changelogUpdates) {
      let content = fs.existsSync(CONFIG.changelogPath)
        ? fs.readFileSync(CONFIG.changelogPath, "utf-8")
        : "# Changelog\n\nAutomated changelog of Nightly merges.\n\n";

      if (content.includes("\n\n")) {
        const split = content.indexOf("\n\n") + 2;
        content =
          content.slice(0, split) + changelogUpdates + content.slice(split);
      } else {
        content += "\n" + changelogUpdates;
      }

      fs.writeFileSync(CONFIG.changelogPath, content);
      console.log("DONE: Changelog updated.");
    }
  } catch (error: any) {
    console.error("CRITICAL: Fatal Engine Error:", error.message);
    (process as any).exit(1);
  }
}

run();
