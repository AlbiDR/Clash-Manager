# Clash Manager Serverless Backend

![GitHub Release](https://img.shields.io/github/v/release/albidr/Clash-Manager?include_prereleases&style=flat-square&label=Release&color=0061a4)
![Last Commit](https://img.shields.io/github/last-commit/albidr/Clash-Manager?path=backend&style=flat-square&label=Updated)
![Repo Size](https://img.shields.io/github/repo-size/albidr/Clash-Manager?style=flat-square&label=Codebase)
![License](https://img.shields.io/github/license/albidr/Clash-Manager?style=flat-square&color=green)

![Platform](https://img.shields.io/badge/Google%20Apps%20Script-V8%20Runtime-4285F4?style=flat-square&logo=google&logoColor=white)
![API Standard](https://img.shields.io/badge/API-REST%20over%20HTTPS-orange?style=flat-square&logo=json)

The **Clash Manager Backend** is a sophisticated Serverless application hosted on the Google Apps Script (GAS) runtime. It serves as the Data Layer, Logic Engine, and API Gateway for the Clash Manager PWA.

Unlike traditional CRUD apps, this system implements a **Headless Architecture**, decoupling the heavy data processing (ETL, Scoring, Recruiting) from the presentation layer. It utilizes Google Sheets as a high-performance relational database and state store.

---

## 🏗️ System Architecture

The backend operates on a **Cycle-Based** execution model rather than an event-loop.

### 1. Data Ingestion (ETL)
*   **Source**: [Official Clash Royale API](https://developer.clashroyale.com) via Proxy.
*   **Key Rotation**: Implements a Round-Robin rotation of up to 10 API Keys (`CRK1` - `CRK10`) to bypass rate limits during heavy scanning.
*   **Caching**: `Utilities.fetchRoyaleAPI` implements request deduplication and execution-level caching.

### 2. Logic Engines
*   **Leaderboard Engine**: Calculates complex performance scores based on weighted metrics (War History, Donation Ratios, Tenure).
*   **Headhunter (Recruiter)**: Uses the **Deep Net Protocol** to scan thousands of open tournaments stochastically to find clanless players.
*   **Scoring System**: A protected, pure-math module (`ScoringSystem.gs`) that ensures consistent ranking logic across the platform.

### 3. API Gateway (`API_Public`)
*   **Protocol**: Custom **String Transport Protocol** over HTTPS (`doGet`/`doPost`).
*   **Payload**: Delivers a **Matrix-Compressed** JSON payload (Array-of-Arrays) to minimize bandwidth by ~40%.
*   **Latency**: Pre-computes and caches the frontend payload (`Controller_Webapp`) to ensure sub-second API response times, bypassing Sheet read latency.

---

## 📂 Module Reference

| Module | Version | Responsibility |
| :--- | :--- | :--- |
| **`API_Public`** | v6.0.0 | **Router**: Handles HTTP requests, CORS, and response enveloping. |
| **`Controller_Webapp`** | v6.1.0 | **Data Layer**: Generates, compresses, and caches the web payload. |
| **`Recruiter`** | v5.1.1 | **Intelligence**: Runs the "Deep Net" scan, filters recruits, and manages the blacklist. |
| **`Leaderboard`** | v5.0.3 | **Ranking**: Aggregates member data and historical war logs. |
| **`Logger`** | v5.0.1 | **Database**: Handles daily snapshots, pruning, and historical data persistence. |
| **`ScoringSystem`** | v5.1.2 | **Math**: Isolated scoring algorithms and comparators. |
| **`Orchestrator`** | v5.0.2 | **Control**: Manages triggers, menu items, and master update sequences. |
| **`Utilities`** | v5.1.0 | **Core**: Mutex locking, sharded storage, and robust API fetching. |
| **`Configuration`** | v5.0.9 | **Config**: Central definition of schema, weights, and system constants. |

---

## 🔌 API Reference

The backend exposes a single HTTP endpoint (the Web App URL).

### Base Request Format
All requests return a standard JSON envelope:
```json
{
  "status": "success", // or "error"
  "data": { ... },     // Payload
  "error": null,       // Error details if failed
  "timestamp": "ISO_DATE_STRING"
}
```

### Endpoints

#### `GET ?action=getwebappdata`
Returns the monolithic payload required to hydrate the PWA.
*   **Response**: Matrix-compressed objects for Leaderboard (`lb`) and Headhunter (`hh`).
*   **Cache**: served from `ScriptCache` / `PropertiesService` for speed.

#### `GET ?action=ping`
System health check.
*   **Response**: System status, version map, and Sheet GIDs for deep linking.

#### `POST` (Body: `{ "action": "dismissRecruits", "ids": ["tag1", "tag2"] }`)
Bulk dismisses recruits.
*   **Logic**: Updates the `Headhunter` sheet to mark tags as invited and adds them to the **Time-Decaying Blacklist** (7 days).

---

## 🚀 Deployment Guide

### Prerequisites
*   A Google Account.
*   [Clash Royale Developer Account](https://developer.clashroyale.com) (for API Keys).

### 1. Installation
1.  Create a new **Google Sheet**.
2.  Open **Extensions > Apps Script**.
3.  Copy the contents of each `.gs.js` file into corresponding `.gs` files in the script editor.
    *   *Note: Remove the `.js` extension when creating files in GAS.*

### 2. Configuration (Script Properties)
Go to **Project Settings > Script Properties** and add the following:

| Property | Description | Required |
| :--- | :--- | :--- |
| `ClanTag` | Your Clan Tag (e.g., `#29Uqq282`) | ✅ |
| `CRK1` | Clash Royale API Key (IP agnostic recommended) | ✅ |
| `CRK2`...`CRK10` | Additional API Keys for rotation | Optional |
| `WebAppUrl` | The URL of your deployed Frontend (for CORS/Hyperlinks) | Optional |

### 3. Deploy as Web App
1.  Click **Deploy > New Deployment**.
2.  Select type: **Web App**.
3.  **Description**: `v1`
4.  **Execute as**: `Me` (Your account).
5.  **Who has access**: `Anyone` (Required for PWA fetch).
6.  Click **Deploy** and copy the **Web App URL**.

### 4. Initialization
1.  Reload the Google Sheet.
2.  Wait for the **"👑 Clan Manager"** menu to appear.
3.  Run **"🛡️ Health Check"** to verify system integrity.
4.  Run **"🚀 Run Master Sequence"** to populate data for the first time.

---

## 📱 Mobile Controls (Hybrid Trigger)

Google Apps Script cannot normally be triggered from the Google Sheets mobile app. This backend implements a **Hybrid Trigger System** to bypass this limitation.

1.  Run **👑 Clan Manager > 📱 Enable Mobile Controls** from the desktop.
2.  This draws a Red Checkbox in cell `A1` of every main sheet.
3.  **On Mobile**: Tap the checkbox to `TRUE`.
4.  **Backend**: Detects the edit event, resets the checkbox to `FALSE`, acquires a Mutex Lock, and runs the update sequence for that specific view.

---

## 🛡️ Robustness & Safety

### Mutex Locking (`Utils.executeSafely`)
Prevents race conditions. If a trigger fires while another is running (e.g., Mobile Trigger + Time Trigger), the second instance gracefully aborts or waits, preventing database corruption.

### Self-Healing Backups
Before every major write operation, the system creates a named backup of the target sheet (e.g., `Backup 1 Leaderboard`). It maintains a rolling window of 5 backups and strictly enforces tab visibility/ordering to keep the UI clean.

### Property Sharding
Google Properties have a 9KB limit. The `Utils.Props` engine automatically fragments large JSON payloads (like the Blacklist or Web Cache) into chunked keys (`KEY_0`, `KEY_1`, ...) to support payloads up to 100KB+.

---

## 📄 License

Proprietary Source Code for Clash Manager.
Copyright © 2026 Alberto Di Rosa.
