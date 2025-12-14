# Clash Manager PWA Client

<!-- 
  DYNAMIC BADGES 
  These update automatically based on your Repo state and GitHub Actions.
-->
![GitHub Release](https://img.shields.io/github/v/release/albidr/Clash-Manager?style=flat-square&color=0061a4&label=Release)
![Build Status](https://img.shields.io/github/actions/workflow/status/albidr/Clash-Manager/deploy.yml?branch=main&style=flat-square&label=Build)
![License](https://img.shields.io/github/license/albidr/Clash-Manager?style=flat-square&color=green)

<!-- 
  TECH STACK BADGES 
  Kept at Major versions to minimize maintenance frequency.
-->
![Vue](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat-square&logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?style=flat-square&logo=vite&logoColor=white)

**Clash Manager** is a specialized, high-performance Progressive Web Application (PWA) designed for advanced Clash Royale clan management. It operates as the frontend presentation layer in a **Headless Architecture**, communicating with a serverless Google Apps Script (GAS) backend via a custom JSON REST API.

This application is engineered for **Offline-First** capability, leveraging Optimistic UI patterns and Stale-While-Revalidate (SWR) caching strategies to ensure instant data availability regardless of network conditions.

---

## 🏗️ Architecture

The system utilizes a decoupled architecture to bypass the traditional limitations of Google Apps Script hosted UIs (`HtmlService`).

### 1. Headless Communication Protocol
Instead of serving HTML directly from GAS, this PWA consumes a raw JSON API exposed by the backend.
*   **Transport**: HTTPS (`fetch`) via `doGet` and `doPost`.
*   **Serialization**: Custom **String Transport Protocol** to handle large payloads and specialized characters (Emojis) safely across the GAS bridge.
*   **Payload Strategy**: The backend delivers a unified "Matrix" payload (compressed Array-of-Arrays) to minimize bandwidth, which the frontend hydrates into reactive TypeScript interfaces.

### 2. State Management (SWR Pattern)
Data persistence and synchronization are handled by the `useClanData` composable (`src/composables/useClanData.ts`).
1.  **Hydration**: On boot, data is synchronously loaded from `localStorage` into the Vue Reactive Graph.
2.  **Revalidation**: A background asynchronous fetch triggers immediately to check for server-side updates.
3.  **Synchronization**: If the server timestamp is newer, the UI silently updates (or notifies the user).
4.  **Optimistic Updates**: Actions like "Dismiss Recruit" update the local state immediately before the network request resolves.

### 3. Neo-Material Design System
The UI implements a bespoke design language targeting 2026 aesthetics:
*   **Glassmorphism**: extensive use of `backdrop-filter: blur()`.
*   **Tonal Palettes**: Dynamic color mapping based on data values (e.g., performance scores).
*   **Fluid Physics**: Spring-based animations for list reordering and card expansion.

---

## 🛠️ Technology Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| **Core Framework** | Vue 3 (Composition API) | Reactive UI Component Architecture |
| **Language** | TypeScript 5.x | Strict typing and enterprise maintainability |
| **Build Tool** | Vite 6.x | Next-generation frontend tooling |
| **Styling** | Tailwind CSS 4.0 | Utility-first CSS framework |
| **PWA** | Vite Plugin PWA (Workbox) | Service Worker generation, offline caching, and installability |
| **Routing** | Vue Router 4.x | SPA navigation (Hash Mode for GitHub Pages compatibility) |
| **State** | Native Reactivity (ref/reactive) | Lightweight state management without external stores (Pinia not required) |

---

## 🚀 Getting Started

### Prerequisites
*   **Node.js**: v20.0.0 or higher (LTS recommended)
*   **npm**: v10.0.0 or higher

### Installation

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```

2.  Install dependencies:
    ```bash
    npm ci
    ```

### Environment Configuration

Create a `.env` file in the `frontend` root (or configure your CI/CD secrets):

```env
# The deployed Web App URL of your Google Apps Script backend
VITE_GAS_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

> **Note**: For local development, you can also override this URL at runtime via the App Settings menu, which persists to `localStorage`.

### Development Server

Start the local development server with Hot Module Replacement (HMR):

```bash
npm run dev
```

Access the app at `http://localhost:5173/Clash-Manager/`.

### Production Build

Type-check and compile the application for production:

```bash
npm run build
```

The output will be generated in the `dist/` directory, optimized for static hosting.

---

## 📂 Project Structure

```
frontend/
├── public/                 # Static assets (favicons, manifests)
├── src/
│   ├── api/                # API Client & Transport Layer
│   │   └── gasClient.ts    # GAS-specific fetch wrapper & envelope parsing
│   ├── assets/             # Bundled assets
│   ├── components/         # Reusable UI Components
│   │   ├── ConsoleHeader.vue # Sticky glass header
│   │   ├── MemberCard.vue    # Complex data visualization card
│   │   └── FloatingDock.vue  # iOS-style bottom navigation
│   ├── composables/        # Shared Logic (Hooks)
│   │   ├── useClanData.ts    # Main Data Store (SWR)
│   │   └── useApiState.ts    # Network connectivity logic
│   ├── types/              # TypeScript Interfaces
│   ├── views/              # Page Components (Router Targets)
│   ├── App.vue             # Root Component & Layout
│   ├── main.ts             # Entry Point & Global Config
│   └── style.css           # Global CSS Variables & Tailwind Imports
├── index.html              # HTML Entry Point
├── vite.config.ts          # Vite & PWA Configuration
└── tailwind.config.js      # Design System Configuration
```

---

## 📦 Deployment

The application is configured for automated deployment to **GitHub Pages** via GitHub Actions.

### Workflow: `.github/workflows/deploy.yml`
1.  Triggers on push to `main`.
2.  Sets up Node.js environment.
3.  Injects the `VITE_GAS_URL` secret.
4.  Builds the application (`npm run build`).
5.  Uploads the `dist` artifact to GitHub Pages.

**Important**: Ensure the `base` property in `vite.config.ts` matches your repository name (e.g., `/Clash-Manager/`) to ensure asset paths resolve correctly.

---

## 🧩 Key Features

### 🏆 Leaderboard
*   **Deep Analysis**: Merges real-time trophy data with historical database records.
*   **Performance Scoring**: Calculates a weighted score based on donations, war history, and tenure.
*   **War Visualization**: Micro-charts showing the last 52 weeks of river race performance.

### 🔭 Headhunter (Recruiter)
*   **Talent Scouting**: Interfaces with the backend's "Deep Net" protocol to find un-clanned players.
*   **Smart Filtering**: Sorts by "Potential Score", highlighting players with high war wins and donation ratios.
*   **Bulk Actions**: Select multiple recruits to "Dismiss" (hide) or "Open" (in Clash Royale).

### ⚙️ System
*   **Deep Linking**: Supports URL parameters (e.g., `?mode=leaderboard&pin=TAG`) to open specific player cards directly.
*   **Offline Mode**: Full read-access to cached data when no internet connection is available.
*   **Installable**: Meets all PWA criteria (Manifest, HTTPS, Service Worker) for A2HS (Add to Home Screen).

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Engineered by Alberto Di Rosa for Clash Manager V5.*
