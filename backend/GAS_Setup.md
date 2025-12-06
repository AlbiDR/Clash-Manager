

# GAS Setup Instructions

## 1. Project Initialization
1. Open your Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Rename the project to "Clan Manager Backend".

## 2. File Creation
Create the following files in the Apps Script editor and paste the content from the corresponding local files:

| Local File | Apps Script File | Type |
|------------|------------------|------|
| `Configuration.gs.js` | `Configuration` | Script |
| `Utilities.gs.js` | `Utilities` | Script |
| `Orchestrator & Triggers.gs.js` | `Orchestrator & Triggers` | Script |
| `Logger.gs.js` | `Logger` | Script |
| `Leaderboard.gs.js` | `Leaderboard` | Script |
| `ScoringSystem.gs.js` | `ScoringSystem` | Script |
| `Recruiter.gs.js` | `Recruiter` | Script |
| `Controller_Webapp.gs.js` | `Controller_Webapp` | Script |
| `API_Public.gs.js` | `API_Public` | Script |
| `View_Webapp.html` | `View_Webapp` | HTML |

## 3. Configuration
1. Open `Configuration.gs`.
2. Ensure `CONFIG` reflects your Sheet names and Tags.
3. **Project Settings**: Go to Project Settings (Gear icon) > **Script Properties**.
4. Add the following properties:
   * `ClanTag`: Your clan tag (e.g., `#ABC1234`).
   * `CMV1`, `CMV2`... `CMV10`: Your RoyaleAPI proxy keys.

## 4. Deployment
The new architecture requires a fresh deployment to serve the updated `View_Webapp`.

1. Click **Deploy > New Deployment**.
2. Select type: **Web app**.
3. Description: `v5.0.0 - Initial Release`.
4. Execute as: **Me**.
5. Who has access: **Anyone**.
6. Click **Deploy**.
7. Copy the **Web App URL** and update `WEB_APP_URL` in `Configuration.gs` so the spreadsheet hyperlinks point to the correct version.

## 5. Mobile Controls Setup (Optional)
To enable the checkboxes on your phone:
1. Refresh your Google Sheet.
2. Click the custom menu **👑 Clan Manager** (on Desktop).
3. Select **📱 Enable Mobile Controls**.
4. Grant the required permissions when prompted.
5. You can now use the red checkbox in cell **A1** on any tab to trigger updates from your phone.