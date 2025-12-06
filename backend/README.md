

G.A.S. SOURCE OF TRUTH (MANUAL DEPLOYMENT REQUIRED)

This directory serves as the mandatory source control for the Google Apps Script (GAS) code that functions as the data bridge for the Clan Manager application.

## Directory Contents

| File | Description |
|------|-------------|
| **`GAS_Setup.md`** | **Start Here.** Step-by-step guide to creating and deploying the backend. |
| `Configuration.gs.js` | Defines database schema, API keys, and setup logic. Paste into `Configuration.gs`. |
| `Controller_Webapp.gs.js` | **Web App Handler (v5.0.0).** Manages data injection, sanitization, and caching. Paste into `Controller_Webapp.gs`. |
| `API_Public.gs.js` | **Frontend Bridge.** Exposes `getMembers` & `getWarLog` for React. Paste into `API_Public.gs`. |
| `Utilities.gs.js` | Helper library for Fetching, Dates, and Layouts. Paste into `Utilities.gs`. |
| `Orchestrator & Triggers.gs.js` | Automation triggers and menu creation. Paste into `Orchestrator & Triggers.gs`. |
| `Logger.gs.js` | Daily Database Logger (ETL). Paste into `Logger.gs`. |
| `Leaderboard.gs.js` | Leaderboard calculation logic. Paste into `Leaderboard.gs`. |
| `ScoringSystem.gs.js` | **Protected.** The mathematical engine for Scores & Sorting. Paste into `ScoringSystem.gs`. |
| `Recruiter.gs.js` | Player scanning and scouting logic. Paste into `Recruiter.gs`. |
| `View_Webapp.html` | **SPA Frontend (v5.0.0).** The Single Page Application with client-side sorting and visualizers. Paste into `View_Webapp.html`. |