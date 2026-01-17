const fs = require("fs");
const path = require("path");
const https = require("https");

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  targetOwner: process.env.GITHUB_REPOSITORY.split("/")[0],
  targetRepo: process.env.GITHUB_REPOSITORY.split("/")[1],
  targetBranch: "Jules",
  author: "google-labs-jules",
  token: process.env.GITHUB_TOKEN,
  changelogPath: path.join(".jules", "CHANGELOG.md"),
};

// ============================================================================
// CORE ENGINE: HTTP REQUEST HANDLER
// ============================================================================
function request(method, path, body = null, isGraphQL = false) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: path,
      method: method,
      headers: {
        Authorization: `token ${CONFIG.token}`,
        "User-Agent": "Script",
        Accept: isGraphQL
          ? "application/json"
          : "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch (e) {
            resolve(data); // In case of non-JSON response
          }
        } else {
          reject(
            new Error(
              `API Error: ${res.statusCode} ${res.statusMessage} - ${data}`,
            ),
          );
        }
      });
    });

    req.on("error", (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ============================================================================
// GRAPHQL HELPERS
// ============================================================================
async function markReadyForReview(nodeId) {
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
  return request(
    "POST",
    "/graphql",
    { query, variables: { id: nodeId } },
    true,
  );
}

// ============================================================================
// AUTOMATION LOGIC: Jules PR Merge Engine
// ============================================================================
async function run() {
  try {
    console.log(
      `Checking for PRs from ${CONFIG.author} (or [bot]) targeting ${CONFIG.targetBranch}...`,
    );

    // 1. Fetch Open PRs (Paginated)
    let prs = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const pagePrs = await request(
        "GET",
        `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls?state=open&per_page=100&page=${page}`,
      );
      if (pagePrs.length === 0) {
        hasMore = false;
      } else {
        prs = prs.concat(pagePrs);
        page++;
      }
    }

    // --- DEBUGGING BLOCK START ---
    console.log(`\n🔎 DEBUG: Found ${prs.length} total open PRs.`);
    if (prs.length > 0) {
      console.log("---------------------------------------------------");
      console.log("| #   | Author (Login)           | Target Branch | Title");
      console.log("---------------------------------------------------");
      prs.forEach((p) => {
        console.log(
          `| ${p.number.toString().padEnd(3)} | ${p.user.login.padEnd(24)} | ${p.base.ref.padEnd(13)} | ${p.title.substring(0, 30)}...`,
        );
      });
      console.log("---------------------------------------------------\n");
    }
    // --- DEBUGGING BLOCK END ---

    const authorPrs = prs.filter((pr) => {
      const login = pr.user.login.toLowerCase();
      const author = CONFIG.author.toLowerCase();
      // Check for exact match or [bot] suffix
      return login === author || login === `${author}[bot]`;
    });

    const targetPrs = authorPrs.filter(
      (pr) => pr.base.ref === CONFIG.targetBranch,
    );

    if (authorPrs.length > 0 && targetPrs.length === 0) {
      console.log(
        `⚠️ Found ${authorPrs.length} PR(s) from ${CONFIG.author}, but none target '${CONFIG.targetBranch}'.`,
      );
      authorPrs.forEach((pr) =>
        console.log(` - PR #${pr.number} targets '${pr.base.ref}'`),
      );
      return;
    }

    if (targetPrs.length === 0) {
      console.log("No matching PRs found (Author + Target Branch mismatch).");
      return;
    }

    console.log(
      `Found ${targetPrs.length} PR(s) targeting ${CONFIG.targetBranch}. Processing...`,
    );

    // Ensure .jules directory exists
    const dir = path.dirname(CONFIG.changelogPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let changelogUpdates = "";

    for (const pr of targetPrs) {
      console.log(`Processing PR #${pr.number}: ${pr.title}`);

      // 2. Extract Data
      const prData = {
        number: pr.number,
        nodeId: pr.node_id,
        title: pr.title,
        body: pr.body,
        sha: pr.head.sha,
        url: pr.html_url,
      };

      const maxTries = 5; // Defined here for scope visibility in catch block

      // 3. Merge PR Logic (Ultra-Robust)
      try {
        // Fetch details specifically to check for draft status
        const details = await request(
          "GET",
          `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls/${pr.number}`,
        );

        if (details.draft) {
          console.log(
            `PR #${pr.number} is in DRAFT mode. Marking as ready for review via GraphQL...`,
          );
          try {
            await markReadyForReview(prData.nodeId);
            console.log(`PR #${pr.number} is now ready for review.`);
          } catch (draftError) {
            console.warn(
              `⚠️ Failed to mark PR #${pr.number} as ready for review (ignoring and attempting merge anyway): ${draftError.message}`,
            );
          }
        }

        // Ultra-Robust Strategy: Try Force Merge -> Fallback to Exponential Backoff
        let merged = false;
        let tryCount = 1;

        const mergeBody = {
          merge_method: "squash",
          commit_title: `${pr.title} (#${pr.number})`,
          commit_message: `Auto-merged PR #${pr.number} from ${CONFIG.author}`,
        };

        while (!merged && tryCount <= maxTries) {
          try {
            console.log(
              `Attempting to merge PR #${pr.number} (Attempt ${tryCount}/${maxTries})...`,
            );
            await request(
              "PUT",
              `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls/${pr.number}/merge`,
              mergeBody,
            );
            merged = true;
            console.log(`Successfully merged PR #${pr.number}`);
          } catch (error) {
            // Check if error is a temporary blocker (405 or 409)
            if (
              tryCount < maxTries &&
              (error.message.includes("405") || error.message.includes("409"))
            ) {
              const waitMs = Math.pow(2, tryCount) * 1000; // Exponential backoff: 2s, 4s, 8s, 16s
              console.log(
                `Merge temporarily blocked or calculating. Retrying in ${waitMs / 1000}s...`,
              );
              await new Promise((resolve) => setTimeout(resolve, waitMs));
              tryCount++;
            } else {
              throw error; // Permanent failure or exhausted retries
            }
          }
        }
      } catch (error) {
        console.error(
          `CRITICAL: Failed to merge PR #${pr.number}:`,
          error.message,
        );

        // Final Fallback: Log failure to changelog so it's visible in the repo
        const date = new Date().toISOString().split("T")[0];
        const failureEntry = `
## [${date}] ❌ FAILED MERGE: PR #${pr.number}: ${pr.title}
> [!CAUTION]
> **Status**: Auto-merge failed after ${maxTries} attempts.
> **Error**: \`${error.message}\`  
> **Requirement**: Manual intervention (likely a merge conflict) is required.
> **PR Link**: [Link](${pr.html_url})

---
`;
        changelogUpdates = failureEntry + changelogUpdates;
        continue;
      }

      // 4. Format Successful Merger Entry
      const date = new Date().toISOString().split("T")[0];
      const entry = `
## [${date}] PR #${prData.number}: ${prData.title}
**Commit**: \`${prData.sha}\`
**Original PR**: [Link](${prData.url})

${prData.body ? "### Description\n" + prData.body : ""}

---
`;
      changelogUpdates = entry + changelogUpdates;
    }

    // 5. Update Changelog File
    if (changelogUpdates) {
      let currentContent = "";
      if (fs.existsSync(CONFIG.changelogPath)) {
        currentContent = fs.readFileSync(CONFIG.changelogPath, "utf8");
      } else {
        currentContent =
          "# Changelog\n\nAutomated changelog of merges from google-labs-jules.\n\n";
      }

      let newContent = "";
      if (currentContent.startsWith("# Changelog")) {
        if (currentContent.includes("\n\n")) {
          const splitIndex = currentContent.indexOf("\n\n") + 2;
          newContent =
            currentContent.slice(0, splitIndex) +
            changelogUpdates +
            currentContent.slice(splitIndex);
        } else {
          newContent = currentContent + "\n" + changelogUpdates;
        }
      } else {
        newContent = "# Changelog\n\n" + changelogUpdates + currentContent;
      }

      fs.writeFileSync(CONFIG.changelogPath, newContent);
      console.log("Changelog updated locally.");
    }
  } catch (error) {
    console.error("Fatal Error:", error.message);
    process.exit(1);
  }
}

run();
