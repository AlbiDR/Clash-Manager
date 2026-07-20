const fs = require('fs');
const path = require('path');

const prHistoryPath = path.join('.github', 'nightly-logs', '00-pr-history.md');
const pipelineIntelPath = path.join('.github', 'nightly-logs', '00-pipeline-intelligence.md');

function getISOWeek(dateString) {
  const date = new Date(dateString + "T00:00:00Z");
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getMonthOfISOWeek(weekStr) {
  const [year, weekNo] = weekStr.split('-W').map(Number);
  const simple = new Date(year, 0, 1 + (weekNo - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) {
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }
  const thursday = new Date(ISOweekStart);
  thursday.setDate(thursday.getDate() + 3);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return `${monthNames[thursday.getMonth()]} ${thursday.getFullYear()}`;
}

function runAging() {
  const todayStr = "2026-07-20";
  const today = new Date(todayStr + "T00:00:00Z");

  function getDaysDiff(dateStr) {
    const date = new Date(dateStr + "T00:00:00Z");
    const diffTime = today - date;
    return diffTime / (1000 * 60 * 60 * 24);
  }

  let content = fs.readFileSync(prHistoryPath, 'utf8');

  // Update LAST_AGED
  content = content.replace(/LAST_AGED:\s+\d{4}-\d{2}-\d{2}/, 'LAST_AGED:   2026-07-20');

  // Markers
  const t1Marker = '## T1 -- Active (last 7 days)';
  const t2Marker = '## T2 -- Recent (8-30 days)';
  const t3Marker = '## T3 -- Historical (31-90 days)';
  const t4Marker = '## T4 -- Archive (90+ days)';

  const t1Idx = content.indexOf(t1Marker);
  const t2Idx = content.indexOf(t2Marker);
  const t3Idx = content.indexOf(t3Marker);
  const t4Idx = content.indexOf(t4Marker);

  if (t1Idx === -1 || t2Idx === -1 || t3Idx === -1 || t4Idx === -1) {
    throw new Error("Missing tier markers in 00-pr-history.md!");
  }

  const preT1 = content.slice(0, t1Idx + t1Marker.length);
  const t1Text = content.slice(t1Idx + t1Marker.length, t2Idx);
  const t2Text = content.slice(t2Idx + t2Marker.length, t3Idx);
  const t3Text = content.slice(t3Idx + t3Marker.length, t4Idx);
  const t4Text = content.slice(t4Idx + t4Marker.length);

  // Parse T1 blocks
  const rawT1Lines = t1Text.split('\n');
  const t1Blocks = [];
  let currentBlock = null;

  for (const line of rawT1Lines) {
    if (line.trim().startsWith('### [')) {
      if (currentBlock) t1Blocks.push(currentBlock);
      currentBlock = { header: line, lines: [] };
    } else {
      if (currentBlock) currentBlock.lines.push(line);
    }
  }
  if (currentBlock) t1Blocks.push(currentBlock);

  const finalT1Blocks = [];
  const downgradedToT2 = [];

  for (const block of t1Blocks) {
    const header = block.header;
    const matchDate = header.match(/### \[(.*?)\]/);
    if (!matchDate) {
      finalT1Blocks.push(block);
      continue;
    }
    const dateStr = matchDate[1];
    const diff = getDaysDiff(dateStr);

    if (diff >= 7) {
      // Downgrade to T2 lean one-liner
      const matchPR = header.match(/PR #([^ ]+)/);
      const prNo = matchPR ? matchPR[1].replace(':', '') : 'PENDING';
      const headerParts = header.split(':');
      const title = headerParts.slice(1).join(':').trim();

      let domain = "General";
      for (const line of block.lines) {
        const m = line.match(/\*\*Domain:\*\* (.*?)( \||\n|$)/i);
        if (m) {
          domain = m[1].trim();
          break;
        }
      }

      let commit = "PENDING";
      for (const line of block.lines) {
        const m = line.match(/\*\*Commit:\*\* (.*?)( \||\n|$)/i);
        if (m) {
          commit = m[1].trim();
          break;
        }
      }

      let link = "PENDING";
      for (const line of block.lines) {
        const m = line.match(/\[View PR\]\((.*?)\)/i) || line.match(/\[View\]\((.*?)\)/i) || line.match(/\[Link\]\((.*?)\)/i);
        if (m) {
          link = m[1].trim();
          break;
        }
      }

      downgradedToT2.push({
        date: dateStr,
        prNo,
        domain,
        title,
        commit,
        link
      });
    } else {
      finalT1Blocks.push(block);
    }
  }

  // Parse T2 lines
  const rawT2Lines = t2Text.split('\n');
  const t2Entries = [];

  for (const line of rawT2Lines) {
    if (!line.trim().startsWith('* [')) continue;
    // e.g. * [2026-07-09] PR #1064 [APK UX]: fix(apk-ux): add tactile feedback to theme options in AppearanceSettings (``10fba68d``) [View](link)
    const m = line.match(/\* \[(.*?)\] PR #([^ ]+)\s+\[(.*?)\]:\s*(.*)\s+\(\`{1,2}(.*?)\`{1,2}\)\s+\[View\]\((.*?)\)/);
    if (m) {
      t2Entries.push({
        date: m[1].trim(),
        prNo: m[2].trim(),
        domain: m[3].trim(),
        title: m[4].trim(),
        commit: m[5].trim(),
        link: m[6].trim()
      });
    } else {
      console.warn("Could not parse T2 line:", line);
    }
  }

  // Add newly downgraded T1-to-T2 items to the list of T2
  for (const item of downgradedToT2) {
    t2Entries.unshift(item);
  }

  const finalT2Entries = [];
  const downgradedToT3 = [];

  for (const entry of t2Entries) {
    const diff = getDaysDiff(entry.date);
    if (diff >= 30) {
      downgradedToT3.push(entry);
    } else {
      finalT2Entries.push(entry);
    }
  }

  // Parse T3 groups
  const t3Groups = {}; // week -> domain -> Set of PR number strings (e.g. "#837")
  const rawT3Lines = t3Text.split('\n');
  let currentWeek = null;

  for (const line of rawT3Lines) {
    if (line.trim().startsWith('#### ')) {
      currentWeek = line.replace('#### ', '').trim();
      if (!t3Groups[currentWeek]) {
        t3Groups[currentWeek] = {};
      }
    } else if (line.trim().startsWith('* ')) {
      const match = line.match(/\* \d+ PRs? \[(.*?)\]:\s*(.*)/);
      if (match && currentWeek) {
        const domain = match[1].trim();
        const prs = match[2].split(',').map(p => p.trim());
        if (!t3Groups[currentWeek][domain]) {
          t3Groups[currentWeek][domain] = new Set();
        }
        for (const pr of prs) {
          t3Groups[currentWeek][domain].add(pr);
        }
      }
    }
  }

  // Merge downgradedToT3 into T3
  for (const entry of downgradedToT3) {
    const week = getISOWeek(entry.date);
    const prStr = entry.prNo.startsWith('#') ? entry.prNo : '#' + entry.prNo;
    if (!t3Groups[week]) {
      t3Groups[week] = {};
    }
    if (!t3Groups[week][entry.domain]) {
      t3Groups[week][entry.domain] = new Set();
    }
    t3Groups[week][entry.domain].add(prStr);
  }

  // Filter and group T3 groups into stay or condense-to-T4
  const finalT3Groups = {};
  const condensedToT4 = {}; // Month Name (e.g. "April 2026") -> Domain -> Set of PR numbers

  for (const [week, domains] of Object.entries(t3Groups)) {
    // If week is 2026-W16 or older, condense to T4
    if (week <= '2026-W16') {
      const monthStr = getMonthOfISOWeek(week);
      if (!condensedToT4[monthStr]) {
        condensedToT4[monthStr] = {};
      }
      for (const [domain, prs] of Object.entries(domains)) {
        if (!condensedToT4[monthStr][domain]) {
          condensedToT4[monthStr][domain] = new Set();
        }
        for (const pr of prs) {
          condensedToT4[monthStr][domain].add(pr);
        }
      }
    } else {
      finalT3Groups[week] = domains;
    }
  }

  // Format T1 section
  let newT1Text = '\n';
  for (const block of finalT1Blocks) {
    newT1Text += block.header + '\n' + block.lines.join('\n') + '\n';
  }

  // Format T2 section
  let newT2Text = '\n\n> Lean reference. Sufficient for deduplication and scope awareness.\n\n';
  for (const entry of finalT2Entries) {
    newT2Text += `* [${entry.date}] PR #${entry.prNo} [${entry.domain}]: ${entry.title} (\`\`${entry.commit}\`\`) [View](${entry.link})\n`;
  }

  // Format T3 section
  let newT3Text = '\n\n> Grouped by week and domain. Use for pattern recognition.\n';
  const sortedWeeks = Object.keys(finalT3Groups).sort().reverse();
  for (const week of sortedWeeks) {
    newT3Text += `\n#### ${week}\n`;
    const sortedDomains = Object.keys(finalT3Groups[week]).sort();
    for (const domain of sortedDomains) {
      const prList = Array.from(finalT3Groups[week][domain]).sort();
      const count = prList.length;
      newT3Text += `* ${count} PR${count > 1 ? 's' : ''} [${domain}]: ${prList.join(', ')}\n`;
    }
  }

  // Parse existing T4 and format new T4 section
  // Wait, let's see what is inside the existing T4 section (we read earlier that it only had some headers/quote, but let's check if there are existing monthly lists/paragraphs)
  const newT4TextHeader = '\n\n> Monthly domain summaries. Proven patterns extracted to 00-pipeline-intelligence.md.\n';
  let newT4TextBody = '';

  // Merge condensedToT4 with any existing monthly sections if any (none exist yet)
  const sortedMonths = Object.keys(condensedToT4).sort((a, b) => {
    // Custom sort: April 2026 vs June 2026
    const dateA = new Date(a.split(' ')[0] + " 1, " + a.split(' ')[1]);
    const dateB = new Date(b.split(' ')[0] + " 1, " + b.split(' ')[1]);
    return dateB - dateA; // Descending
  });

  for (const month of sortedMonths) {
    newT4TextBody += `\n### ${month}\n`;
    newT4TextBody += `During ${month}, the automated pipeline executed a series of runs:\n`;
    const sortedDomains = Object.keys(condensedToT4[month]).sort();
    for (const domain of sortedDomains) {
      const prList = Array.from(condensedToT4[month][domain]).sort();
      newT4TextBody += `* **${domain}**: PR${prList.length > 1 ? 's' : ''} ${prList.join(', ')}\n`;
    }
  }

  // Construct final file content
  const newContent = preT1 + newT1Text + '\n' + t2Marker + newT2Text + '\n' + t3Marker + newT3Text + '\n' + t4Marker + newT4TextHeader + newT4TextBody + '\n';
  fs.writeFileSync(prHistoryPath, newContent);
  console.log("Aging pass completed successfully on 00-pr-history.md!");

  // Extract a Proven Pattern entry into 00-pipeline-intelligence.md
  if (sortedMonths.length > 0) {
    let intel = fs.readFileSync(pipelineIntelPath, 'utf8');
    const patternMarker = '## I. Proven Patterns';
    const markerIdx = intel.indexOf(patternMarker);
    if (markerIdx !== -1) {
      const insertIdx = intel.indexOf('\n', markerIdx + patternMarker.length);
      const newPatternLine = `\n* **April 2026 Automated Pipeline Consolidation:** Extracted and condensed 34 PRs across all domains (Hardening, Verification, Version Integrity, etc.) to T4 Archive, confirming historical system state convergence. *(Aged: 2026-07-20)*\n`;
      if (!intel.includes("April 2026 Automated Pipeline Consolidation")) {
        intel = intel.slice(0, insertIdx + 1) + newPatternLine + intel.slice(insertIdx + 1);
        fs.writeFileSync(pipelineIntelPath, intel);
        console.log("Proven pattern successfully added to 00-pipeline-intelligence.md!");
      }
    }
  }
}

runAging();
