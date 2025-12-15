# Clash Manager Client (PWA)

<!-- Dynamic Badges: These update automatically based on your repo status -->
[![Version](https://img.shields.io/github/package-json/v/albidr/Clash-Manager?filename=frontend%2Fpackage.json&style=flat-square&color=0061a4&label=Client)](https://github.com/albidr/Clash-Manager/blob/main/frontend/package.json)
[![Build Status](https://img.shields.io/github/actions/workflow/status/albidr/Clash-Manager/deploy.yml?branch=main&style=flat-square&label=Build)](https://github.com/albidr/Clash-Manager/actions)
[![License](https://img.shields.io/github/license/albidr/Clash-Manager?style=flat-square&color=green)](https://github.com/albidr/Clash-Manager/blob/main/LICENSE)

**Clash Manager Client** is the frontend PWA for the Clash Manager ecosystem. It is a "Headless" interface that consumes data from the Google Apps Script backend, designed to feel like a native app while running entirely in the browser.

It prioritizes **Offline-First** usability using a Stale-While-Revalidate (SWR) strategy:
1.  **Instant Load:** Data serves immediately from `localStorage`.
2.  **Background Sync:** Newer data is fetched silently from the GAS API.
3.  **Optimistic UI:** Actions (like dismissing a recruit) reflect instantly before network confirmation.

---

## 🛠️ Tech Stack

| Category | Technology | Context |
| :--- | :--- | :--- |
| **Core** | [Vue 3](https://vuejs.org/) | Composition API + `<script setup>`. |
| **Build** | [Vite 7](https://vitejs.dev/) | Fast HMR and optimized bundling. |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) | Utility-first styling with a custom "Neo-Material" theme. |
| **State** | Native Reactivity | `ref`/`reactive` (No Pinia required for this scale). |
| **PWA** | [Vite Plugin PWA](https://vite-pwa-org.netlify.app/) | Service Worker generation and offline asset caching. |

---

## 🚀 Getting Started

<details>
<summary><strong>Click to view Installation Steps</strong></summary>

### 1. Prerequisites
*   Node.js v20+
*   npm v10+

### 2. Install Dependencies
```bash
cd frontend
npm ci
```

### 3. Environment Configuration
Create a `.env` file in the `frontend` root. You need the Web App URL from your Google Apps Script deployment.

```properties
# .env
VITE_GAS_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

### 4. Run Development Server
```bash
npm run dev
```

### 5. Build for Production
This generates the `dist` folder ready for GitHub Pages or static hosting.
```bash
npm run build
```
</details>

---

## 🛡️ Key Features

### 🎨 Neo-Material Design
A custom visual language designed for clarity and aesthetics.
*   **Glassmorphism**: Context-aware blur overlays (`backdrop-filter`).
*   **Tonal Palettes**: UI colors adapt based on performance metrics (e.g., Red/Green scores).
*   **Physics**: Lists utilize spring-based animations for a "heavy", premium feel.

### 🏆 Leaderboard
*   **Hybrid Data**: Merges real-time API data (current trophies) with historical database records (tenure).
*   **War Visualization**: Includes micro-charts rendering 52 weeks of war performance history.

### 🔭 Headhunter
*   **Recruitment**: Visualizes the backend's "Deep Net" search results.
*   **Scoring**: Auto-sorts players by a calculated "Potential Score" vs. the clan's average.
*   **Deep Linking**: Supports direct links to open player profiles in Clash Royale.

---

## 📄 License

Proprietary.
Copyright © 2026 AlbiDR.
