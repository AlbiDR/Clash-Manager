#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR

import sys
import re
from datetime import datetime

# Self-Healing Sweeper Guard:
# Scans for entries written at the very top of the file (before TIER_CONFIG) and moves them
# back to the proper T1 active section. This guarantees that even if a legacy agent bypasses
# the script and writes to the top, it will be automatically healed on the next run.
def sweep_orphan_entries(file_path):
    try:
        with open(file_path, "r") as f:
            content = f.read()
    except FileNotFoundError:
        return

    config_marker = "TIER_CONFIG:"
    if config_marker not in content:
        return

    parts = content.split("<!--")
    # Anything before the first <!-- is considered the orphan zone
    orphan_zone = parts[0].strip()
    
    # If the orphan zone contains T1 blocks, we need to extract and sweep them
    if "### [" in orphan_zone:
        print("Self-Healing: Detected orphan entries at the top of the file. Initiating recovery sweep...")
        
        # Split correct zones
        # The correct zone starts with the comment block <!-- TIER_CONFIG...
        correct_zone = "<!--" + "<!--".join(parts[1:])
        
        # Extract headers and blocks from orphan zone
        t1_blocks = []
        current_block = []
        for line in orphan_zone.split("\n"):
            if line.strip().startswith("### "):
                if current_block:
                    t1_blocks.append("\n".join(current_block))
                current_block = [line]
            elif current_block:
                current_block.append(line)
        if current_block:
            t1_blocks.append("\n".join(current_block))

        # Re-insert these blocks into the ## T1 -- Active section of the correct zone
        t1_marker = "## T1 -- Active (last 7 days)"
        t1_parts = correct_zone.split(t1_marker)
        if len(t1_parts) >= 2:
            new_entries = "\n" + "\n\n".join(t1_blocks).strip() + "\n"
            healed_content = t1_parts[0] + t1_marker + new_entries + t1_parts[1]
            
            with open(file_path, "w") as f:
                f.write(healed_content)
            print(f"Self-Healing: Successfully swept and recovered {len(t1_blocks)} entries.")

def run_aging(today_str):
    file_path = ".github/nightly-logs/00-pr-history.md"
    sweep_orphan_entries(file_path)

    try:
        today = datetime.strptime(today_str, "%Y-%m-%d")
    except ValueError:
        print(f"Invalid date format: {today_str}. Must be YYYY-MM-DD")
        sys.exit(1)

    try:
        with open(file_path, "r") as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: {file_path} not found")
        sys.exit(1)

    # Extract sections
    t1_marker = "## T1 -- Active (last 7 days)"
    t2_marker = "## T2 -- Recent (8-30 days)"
    t3_marker = "## T3 -- Historical (31-90 days)"
    t4_marker = "## T4 -- Archive (90+ days)"

    parts_t1 = content.split(t1_marker)
    if len(parts_t1) < 2:
        print("Could not find T1 section")
        sys.exit(1)
    header = parts_t1[0] + t1_marker
    
    parts_t2 = parts_t1[1].split(t2_marker)
    if len(parts_t2) < 2:
        print("Could not find T2 section")
        sys.exit(1)
    t1_content = parts_t2[0]
    
    parts_t3 = parts_t2[1].split(t3_marker)
    if len(parts_t3) < 2:
        print("Could not find T3 section")
        sys.exit(1)
    t2_content = parts_t3[0]
    
    parts_t4 = parts_t3[1].split(t4_marker)
    if len(parts_t4) < 2:
        print("Could not find T4 section")
        sys.exit(1)
    t3_content = parts_t4[0]
    t4_content = parts_t4[1]

    # Parse T1 Blocks
    t1_blocks = []
    current_block = []
    
    for line in t1_content.split("\n"):
        if line.startswith("### "):
            if current_block:
                t1_blocks.append("\n".join(current_block))
            current_block = [line]
        elif current_block:
            current_block.append(line)
    if current_block:
        t1_blocks.append("\n".join(current_block))

    new_t1_blocks = []
    aged_to_t2 = []

    for block in t1_blocks:
        match_date = re.search(r"### \[(\d{4}-\d{2}-\d{2})\]", block)
        if not match_date:
            new_t1_blocks.append(block)
            continue
        entry_date = datetime.strptime(match_date.group(1), "%Y-%m-%d")
        age = (today - entry_date).days
        
        if age <= 7:
            new_t1_blocks.append(block)
        else:
            pr_match = re.search(r"### \[\d{4}-\d{2}-\d{2}\] PR #([^\s\]]+) \[([^\]]+)\]: (.*)", block)
            domain_match = re.search(r"\*\*Domain:\*\* ([^|]+)", block)
            commit_match = re.search(r"\*\*Commit:\*\* ([^|]+)", block)
            view_match = re.search(r"\[View PR\]\(([^)]+)\)", block)
            
            pr_num = pr_match.group(1) if pr_match else "PENDING"
            stage = pr_match.group(2) if pr_match else "Stage Unknown"
            title = pr_match.group(3) if pr_match else "No Title"
            domain = domain_match.group(1).strip() if domain_match else stage
            commit = commit_match.group(1).strip() if commit_match else "PENDING"
            view_url = view_match.group(1).strip() if view_match else "PENDING"
            
            t2_line = f"* [{match_date.group(1)}] PR #{pr_num} [{domain}]: {title} (``{commit}``) [View]({view_url})"
            aged_to_t2.append(t2_line)

    # Parse T2 lines
    t2_lines = []
    for line in t2_content.split("\n"):
        line = line.strip()
        if line.startswith("* "):
            t2_lines.append(line)

    new_t2_lines = aged_to_t2 + t2_lines
    final_t2_lines = []
    aged_to_t3 = []

    for line in new_t2_lines:
        match_date = re.search(r"\* \[(\d{4}-\d{2}-\d{2})\] PR #([^\s]+)", line)
        if not match_date:
            final_t2_lines.append(line)
            continue
        entry_date = datetime.strptime(match_date.group(1), "%Y-%m-%d")
        age = (today - entry_date).days
        
        if age <= 30:
            final_t2_lines.append(line)
        else:
            domain_match = re.search(r"PR #[^\s]+ \[([^\]]+)\]", line)
            domain = domain_match.group(1).strip() if domain_match else "Unknown"
            pr_num = match_date.group(2)
            aged_to_t3.append({"date": entry_date, "domain": domain, "pr": pr_num})

    # Regroup T3 by ISO week
    t3_data = {}
    
    for item in aged_to_t3:
        year, week, _ = item["date"].isocalendar()
        week_key = f"{year}-W{week:02d}"
        if week_key not in t3_data:
            t3_data[week_key] = {}
        domain = item["domain"]
        if domain not in t3_data[week_key]:
            t3_data[week_key][domain] = set()
        t3_data[week_key][domain].add(item["pr"])

    t3_body = "\n> Grouped by week and domain. Use for pattern recognition.\n\n"
    existing_t3_weeks = {}
    current_week = None
    for line in t3_content.split("\n"):
        if line.startswith("#### "):
            current_week = line.replace("#### ", "").strip()
            existing_t3_weeks[current_week] = []
        elif current_week and line.strip().startswith("* "):
            existing_t3_weeks[current_week].append(line.strip())

    all_weeks = sorted(list(set(list(t3_data.keys()) + list(existing_t3_weeks.keys()))), reverse=True)
    
    for wk in all_weeks:
        try:
            week_start = datetime.strptime(wk + '-1', "%G-W%V-%u")
            age_wk = (today - week_start).days
        except Exception:
            age_wk = 0
            
        if age_wk > 90:
            continue
            
        t3_body += f"#### {wk}\n"
        merged_groups = {}
        if wk in existing_t3_weeks:
            for line in existing_t3_weeks[wk]:
                match_grp = re.search(r"\* \d+ PRs \[([^\]]+)\]: (.*)", line)
                if match_grp:
                    dom = match_grp.group(1).strip()
                    prs = set(re.findall(r"#(\d+)", match_grp.group(2)))
                    merged_groups[dom] = prs
                    
        if wk in t3_data:
            for dom, prs in t3_data[wk].items():
                if dom not in merged_groups:
                    merged_groups[dom] = set()
                merged_groups[dom].update(prs)
                
        for dom in sorted(merged_groups.keys()):
            prs_str = ", ".join([f"#{p}" for p in sorted(list(merged_groups[dom])) if p.isdigit()])
            if prs_str:
                count = len(merged_groups[dom])
                t3_body += f"* {count} PRs [{dom}]: {prs_str}\n"
        t3_body += "\n"

    t2_body = "\n> Lean reference. Sufficient for deduplication and scope awareness.\n\n" + "\n".join(final_t2_lines) + "\n\n"
    t1_body = "\n" + "\n\n".join(new_t1_blocks).strip() + "\n\n"
    updated_header = re.sub(r"LAST_AGED:\s+\d{4}-\d{2}-\d{2}", f"LAST_AGED:   {today_str}", header)

    final_output = (
        updated_header +
        t1_body +
        t2_marker +
        t2_body +
        t3_marker +
        t3_body +
        t4_marker +
        t4_content
    )

    with open(file_path, "w") as f:
        f.write(final_output)

    print("PR History successfully aged to date:", today_str)

def run_add_entry(today_str, stage_name, domain, pr_num, files_list, why_desc, change_desc, result_desc):
    file_path = ".github/nightly-logs/00-pr-history.md"
    sweep_orphan_entries(file_path)

    try:
        with open(file_path, "r") as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: {file_path} not found")
        sys.exit(1)

    t1_marker = "## T1 -- Active (last 7 days)"
    parts = content.split(t1_marker)
    if len(parts) < 2:
        print("Could not find T1 section")
        sys.exit(1)

    new_entry = (
        f"\n### [{today_str}] PR #{pr_num} [{stage_name}]: {change_desc}\n"
        f"**Domain:** {domain} | **Commit:** PENDING | [View PR](PENDING)\n"
        f"**Files:** {files_list}\n"
        f"**Why:** {why_desc}\n"
        f"**Change:** {change_desc}\n"
        f"**Result:** {result_desc}\n"
    )

    final_output = parts[0] + t1_marker + "\n" + new_entry + parts[1]

    with open(file_path, "w") as f:
        f.write(final_output)

    print(f"Successfully added {stage_name} PR entry to T1 section.")

def main():
    if len(sys.argv) < 3:
        print("Usage:")
        print("  age_pr_history.py age <TODAY_YYYY-MM-DD>")
        print("  age_pr_history.py add <TODAY_YYYY-MM-DD> <STAGE_NAME> <DOMAIN> <PR_NUM> <FILES> <WHY> <CHANGE> <RESULT>")
        sys.exit(1)

    action = sys.argv[1]
    if action == "age":
        run_aging(sys.argv[2])
    elif action == "add":
        if len(sys.argv) < 10:
            print("Missing arguments for 'add' command.")
            sys.exit(1)
        run_add_entry(
            sys.argv[2],
            sys.argv[3],
            sys.argv[4],
            sys.argv[5],
            sys.argv[6],
            sys.argv[7],
            sys.argv[8],
            sys.argv[9]
        )
    else:
        print(f"Unknown action: {action}")
        sys.exit(1)

if __name__ == "__main__":
    main()
