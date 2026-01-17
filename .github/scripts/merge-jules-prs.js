const fs = require("fs");
const path = require("path");
const https = require("https");

// Configuration
const CONFIG = {
  targetOwner: process.env.GITHUB_REPOSITORY.split("/")[0],
  targetRepo: process.env.GITHUB_REPOSITORY.split("/")[1],
  targetBranch: "Jules",
  author: "google-labs-jules",
  token: process.env.GITHUB_TOKEN,
  changelogPath: path.join(".jules", "CHANGELOG.md"),
};

// Helper: Make HTTP Request
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: path,
      method: method,
      headers: {
        Authorization: `token ${CONFIG.token}`,
        "User-Agent": "Script",
        Accept: "application/vnd.github.v3+json",
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

// Main Function
async function run() {
  try {
    console.log(
      `Checking for PRs from ${CONFIG.author} targeting ${CONFIG.targetBranch}...`,
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

    const authorPrs = prs.filter((pr) => pr.user.login === CONFIG.author);
    const targetPrs = authorPrs.filter(
      (pr) => pr.base.ref === CONFIG.targetBranch,
    );

    if (authorPrs.length > 0 && targetPrs.length === 0) {
      console.log(
        `Found ${authorPrs.length} PR(s) from ${CONFIG.author}, but none target '${CONFIG.targetBranch}'.`,
      );
      authorPrs.forEach((pr) =>
        console.log(` - PR #${pr.number} targets '${pr.base.ref}'`),
      );
      return;
    }

    if (targetPrs.length === 0) {
      console.log("No matching PRs found.");
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
        title: pr.title,
        body: pr.body,
        sha: pr.head.sha,
        url: pr.html_url,
      };

      // 3. Merge PR
      try {
        // Check mergeability and draft status first
        let details = await request(
          "GET",
          `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls/${pr.number}`,
        );

        // Poll for mergeability if it's null (calculating)
        let retries = 5;
        while (details.mergeable === null && retries > 0) {
          console.log(
            `Mergeability for PR #${pr.number} is still being calculated. Retrying in 2s...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
          details = await request(
            "GET",
            `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls/${pr.number}`,
          );
          retries--;
        }

        if (details.draft) {
          console.log(
            `PR #${pr.number} is in DRAFT mode. Marking as ready for review...`,
          );
          await request(
            "POST",
            `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls/${pr.number}/ready_for_review`,
          );
          console.log(`PR #${pr.number} is now ready for review.`);
        }

        if (details.mergeable === false) {
          console.warn(
            `PR #${pr.number} is not mergeable (conflicts or status checks). Skipping.`,
          );
          continue;
        }

        await request(
          "PUT",
          `/repos/${CONFIG.targetOwner}/${CONFIG.targetRepo}/pulls/${pr.number}/merge`,
          {
            merge_method: "squash", // Consolidate commits
            commit_title: `${pr.title} (#${pr.number})`,
            commit_message: `Auto-merged PR #${pr.number} from ${CONFIG.author}`,
          },
        );
        console.log(`Successfully merged PR #${pr.number}`);
      } catch (error) {
        console.error(`Failed to merge PR #${pr.number}:`, error.message);
        continue; // Skip changelog update if merge fails
      }

      // 4. Format Changelog Entry
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

      // Insert new entries after the header (simple prepend logic)
      // If the file starts with specific header, we might want to append after it.
      // For simplicity, we'll prepend new entries to the top of the log area.

      // If file has content, check for header
      let newContent = "";
      if (currentContent.startsWith("# Changelog")) {
        const lines = currentContent.split("\n");
        // Find where the header ends (e.g. after the first few empty lines or explanation)
        // We'll just append after the first H1 and its immediate text.
        // Simpler: Just Prepend to content if we ignore the very top header,
        // but let's just put it at the top of the "entries" section.
        // For now, let's just prepend to the whole file if it's empty, or insert after the first line.

        if (currentContent.includes("\n\n")) {
          // Insert after the first double newline (assumed header end)
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
