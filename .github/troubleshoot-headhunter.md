# Headhunter Troubleshooting Guide

If the headhunter (taskFastScout) is broken and not finding any new candidates, follow these steps to troubleshoot the issue:

## 1. Verify Global Triggers (Google Apps Script)
- Open the Clash Manager Google Sheet.
- Navigate to the custom menu: **Clash Manager > System Health > Verify API Keys**. Ensure at least one key is active.
- Run **Clash Manager > System Health > System Diagnostics** to verify that all module versions match the expected manifest.
- Check the Apps Script Executions dashboard (`Extensions > Apps Script` then click the "Executions" icon on the left) to see if `taskFastScout` is failing with any specific error messages (e.g., Lock timeouts, Quota Exhausted).

## 2. Check the RoyaleAPI Quota & Worker Delegation
- If the logs show "Service invoked too many times" or "DAILY QUOTA LIMIT REACHED", the embedded Google Apps Script has exhausted the daily RoyaleAPI quota.
- **Important:** If you use the intended Render Worker to look for tournaments, there is no need to worry about quota. Quota limits only apply to the embedded GAS search. Ensure the Render Worker is correctly configured and online to bypass this limitation.

## 3. Worker Node Health (Render)
- The headhunter can offload requests to the remote worker if configured. Verify the worker is awake and returning 200 OK statuses.
- In the spreadsheet menu, run **Clash Manager > Run Master Protocol** and observe the logs for the step "Recruitment: Executing Rapid Global Scout...".

## 4. Test Connectivity Manually
- Go to the spreadsheet and check cell A1 on the Headhunter tab (Mobile trigger). Check the box to `TRUE` to forcefully trigger `handleMobileEdit` which invokes `Registry.Actions["headhunter:scout"]()`.
- Wait for the status cell to update. If it gets stuck on "Updating..." or returns an error, the script is hanging on an API fetch or a structural sheet issue.

## 5. Review Sheet Structure
- Ensure no rows/columns were accidentally deleted or misconfigured in the Headhunter tab. 
- The script relies on specific tab names, so ensure the tab matches `CONFIG.SHEETS.HH`.

## 6. Inspect `Headhunter_View.ts`
- If no new candidates are found but no errors are thrown, the tournament search logic in `headhunter:scout` may be filtering everyone out. 
- Ensure that the minimum trophies or rules set for candidates haven't become impossible to meet (e.g., filtering for an obsolete tag or unusually high trophies).

## 7. Tournament Discovery Exhaustion
If the logs show `Exhausted tournament discovery retries. Discovery Yield: 0`, and warnings like `No 'open' tournaments >= 50 for keyword 'w'`, the script is overly restrictive by filtering for "open" statuses.
- **Tournament Status Filter:** There is absolutely no need to look for exclusively OPEN tournaments. All types of tournaments (active, full, private, or terminated) work perfectly for scouting candidates. 
- **The Golden Rule of Search:** Using alphanumeric search (`a-z`, `0-9`) is the absolutely BEST and ONLY way to execute the tournament search. Ensure no other character patterns are injected and DO NOT restrict by "open" status. Filtering by alphanumeric queries across all tournament states guarantees candidate discovery.
