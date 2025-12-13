# G.A.S. Backend Source Control

This directory contains the Google Apps Script (GAS) code that powers the Clan Manager backend. Since GAS does not support direct Git integration, these files serve as the Source of Truth.

## 📂 File Directory

| File | Type | Description |
|------|------|-------------|
| `Configuration.gs.js` | Script | **Start Here.** Defines schema, API keys, and setup logic. |
| `Controller_Webapp.gs.js` | Script | **Data Layer.** Manages data generation, caching, and serialization. |
| `API_Public.gs.js` | Script | **Router.** Handles `doGet` and `doPost` requests from the React frontend. |
| `Utilities.gs.js` | Script | Helper library for API fetching, date math, and layouts. |
| `Orchestrator & Triggers.gs.js` | Script | Manages automation triggers and the "Master Sequence". |
| `Logger.gs.js` | Script | **ETL Engine.** Fetches API data and updates the database sheet. |
| `Leaderboard.gs.js` | Script | Calculates rankings and updates the Leaderboard sheet. |
| `ScoringSystem.gs.js` | Script | **Math Engine.** Pure logic for calculating scores and sorting. |
| `Recruiter.gs.js` | Script | **Headhunter.** Scans tournaments for new recruits. |

---

## 🚀 Setup & Deployment Guide

Follow these steps to deploy your own instance of the Clan Manager backend.

### 1. Project Initialization
1. Create a new Google Sheet.
2. Rename it to **"Clash Manager"** (or similar).
3. Go to **Extensions > Apps Script**.
4. Rename the project to **"Clash Manager"**.

### 2. File Creation
Manually create the files listed in the **File Directory** table above within the Apps Script editor.
*   **For Script files (`.gs`):** Copy the content from `filename.gs.js` into a file named `filename` (e.g., `Configuration`).

### 3. Configuration (Critical)
The system relies on **Script Properties** to store sensitive keys and configuration to avoid hardcoding them.

1. In the Apps Script editor, go to **Project Settings** (Gear icon) > **Script Properties**.
2. Click **Edit script properties** and add the following key-value pairs:

| Property | Value | Required |
|----------|-------|----------|
| `ClanTag` | Your clan tag (e.g., `#ABC1234`) | **Yes** |
| `CRK1` | Clash Royale Key 1 | **Yes** |
| `CRK2` - `CRK10` | Additional Keys (for rotation/redundancy) | Optional |
| `WebAppUrl` | URL of your hosted React App (e.g., `https://yourname.github.io/repo/`). If omitted, it defaults to the URL hardcoded in `Configuration.gs`. | Optional |

> **Note on Keys and Proxies:** The system requires **official API keys** obtained directly from the [Clash Royale Developer Portal](https://developer.clashroyale.com). All API calls using these keys are automatically routed through the **RoyaleAPI Proxy Endpoint** to ensure speed, stability, and handling of necessary header authorization.

### 4. Deployment
To make the backend accessible to your React frontend, you must deploy it as a Web App.

1. Click **Deploy > New Deployment**.
2. Click the **Select type** icon (Start) > **Web app**.
3. **Description**: `v5.0.0 - Initial Release`.
4. **Execute as**: **Me** (your account).
5. **Who has access**: **Anyone** (This is required for the React app to fetch data without OAuth complexity).
6. Click **Deploy**.
7. **Copy the Web App URL** (starts with `https://script.google.com/macros/s/...`).

### 5. Frontend Connection
1. Open your local `index.tsx` file.
2. Locate the `API_URL` constant near the top of the file.
3. Replace the placeholder with the **Web App URL** you copied in step 4.
4. Commit and push your frontend changes to deploy your React app (e.g., to GitHub Pages).

### 6. Mobile Controls (Optional)
This allows you to trigger updates directly from the Google Sheet mobile app using a checkbox.

1. Refresh your Google Sheet in the browser.
2. Wait for the custom menu **👑 Clan Manager** to appear in the toolbar.
3. Click **👑 Clan Manager > 📱 Enable Mobile Controls**.
4. Grant the required permissions when prompted.
5. **Usage**: Tap the red checkbox in cell **A1** of any sheet to trigger an update for that specific tab.
6. **Reason**: Google Apps Script (GAS) cannot be accessed from mobile if not from Web; this tool is a workaround for manual updates of the data even from mobile.

---

## 🛠️ Troubleshooting

*   **"Permissions Denied"**: Ensure you deployed the Web App as "Execute as: Me" and "Access: Anyone".
*   **"API Error"**: Check the `Logger` in Apps Script to see if your `CRK` keys are valid or if you are hitting rate limits.
*   **"System Busy"**: The system uses a locking mechanism. Wait 30 seconds and try again.
