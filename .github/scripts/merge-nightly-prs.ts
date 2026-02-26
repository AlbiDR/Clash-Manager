import fs from "fs";
import path from "path";

/**
 * ============================================================================
 * 🤖 SCRIPT: MERGE NIGHTLY PRS (TypeScript Edition)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Automates the merging of PRs from google-labs-jules.
 * 🏷️ VERSION: 3.1.0
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
  changelogPath: path.join(".nightly", "CHANGELOG.md"),
};

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

    console.log(`🔎 Checking for PRs targeting ${CONFIG.targetBranch}...`);

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

    console.log(`Found ${prs.length} total open PRs.`);

    // 2. Filter for Nightly PRs
    const targetPrs = prs.filter((pr) => {
      const login = pr.user.login.toLowerCase();
      // Check if the author is in our allowed list (or is a bot version of them)
      const isAllowedAuthor = CONFIG.allowedAuthors.some(allowed =>
        login === allowed.toLowerCase() || login === `${allowed.toLowerCase()}[bot]`
      );

      const isTargetBranch = pr.base.ref === CONFIG.targetBranch;

      // Debugging Output (so you know why it skips next time)
      if (isTargetBranch && !isAllowedAuthor) {
        console.log(`⚠️ Skipping PR #${pr.number} by ${login} (Author not allowed)`);
      }

      return isAllowedAuthor && isTargetBranch;
    });

    if (targetPrs.length === 0) {
      console.log("✅ No matching Nightly PRs found.");
      return;
    }

    console.log(
      `Processing ${targetPrs.length} PR(s) targeting ${CONFIG.targetBranch}...`,
    );

    // Ensure .nightly directory exists
    const dir = path.dirname(CONFIG.changelogPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let changelogUpdates = "";

    for (const pr of targetPrs) {
      console.log(`🚀 Processing PR #${pr.number}: ${pr.title}`);

      try {
        // Fetch full details to check for draft status
        const details: GitHubPR = await githubApi(
          `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls/${pr.number}`,
        );

        if (details.draft) {
          console.log(
            `🛠️ PR #${pr.number} is a Draft. Marking as Ready for Review...`,
          );
          try {
            await markReadyForReview(pr.node_id);
          } catch (e: any) {
            console.warn(
              `⚠️ Draft conversion failed for PR #${pr.number}: ${e.message}`,
            );
          }
        }

        // 3. Merge Logic with Exponential Backoff
        const maxTries = 5;
        let merged = false;
        let tryCount = 1;

        const mergeBody = {
          merge_method: "squash",
          commit_title: `${pr.title} (#${pr.number})`,
          commit_message: `Auto-merged PR #${pr.number} from ${pr.user.login}`,
        };

        while (!merged && tryCount <= maxTries) {
          try {
            console.log(`Attempting merge #${tryCount}/${maxTries}...`);
            await githubApi(
              `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls/${pr.number}/merge`,
              "PUT",
              mergeBody,
            );
            merged = true;
            console.log(`✅ Successfully merged PR #${pr.number}`);
          } catch (error: any) {
            if (
              tryCount < maxTries &&
              (error.message.includes("405") || error.message.includes("409"))
            ) {
              const waitMs = Math.pow(2, tryCount) * 1000;
              console.log(`⏳ Merge blocked. Retrying in ${waitMs / 1000}s...`);
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
        console.error(`❌ FAILED: PR #${pr.number}: ${error.message}`);
        const date = new Date().toISOString().split("T")[0];
        changelogUpdates =
          `
## [${date}] ❌ FAILED MERGE: PR #${pr.number}: ${pr.title}
> [!CAUTION]
> **Status**: Auto-merge failed.
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
      console.log("✅ Changelog updated.");
    }
  } catch (error: any) {
    console.error("💀 Fatal Engine Error:", error.message);
    (process as any).exit(1);
  }
}

run();
