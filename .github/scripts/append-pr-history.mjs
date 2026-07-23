// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import fs from 'fs';
import path from 'path';

// Parse arguments
const [, , date, prNumber, stageInfo, domain, commit, prUrl, files, why, change, result] = process.argv;

if (!result) {
  console.error("Usage: node append-pr-history.mjs <date> <prNumber> <stageInfo> <domain> <commit> <prUrl> <files> <why> <change> <result>");
  process.exit(1);
}

const historyPath = path.resolve('.github/nightly-logs/00-pr-history.md');

const t1Block = `### [${date}] PR ${prNumber} [${stageInfo}]: ${domain}
**Domain:** ${domain} | **Commit:** ${commit} | [View PR](${prUrl})
**Files:** ${files}
**Why:** ${why}
**Change:** ${change}
**Result:** ${result}

`;

try {
  let content = fs.readFileSync(historyPath, 'utf8');
  
  // Find the T1 header and insert right after it
  const t1HeaderMarker = '## T1 -- Active (last 7 days)\n';
  const insertionIndex = content.indexOf(t1HeaderMarker);
  
  if (insertionIndex === -1) {
    throw new Error("Could not find '## T1 -- Active' section in 00-pr-history.md");
  }
  
  const insertAt = insertionIndex + t1HeaderMarker.length;
  content = content.slice(0, insertAt) + t1Block + content.slice(insertAt);
  
  fs.writeFileSync(historyPath, content, 'utf8');
  console.log(`Successfully prepended T1 block to 00-pr-history.md`);
} catch (error) {
  console.error("Failed to append to PR history:", error);
  process.exit(1);
}
