# Clash Manager Client (PWA)

<!-- Dynamic Badges: These update automatically based on your repo status -->
[![Version](https://img.shields.io/github/package-json/v/albidr/Clash-Manager?filename=Frontend-PWA%2Fpackage.json&style=flat-square&color=0061a4&label=Client)](https://github.com/albidr/Clash-Manager/blob/Stable/Frontend-PWA/package.json)
[![Build Status](https://img.shields.io/github/actions/workflow/status/albidr/Clash-Manager/deploy.yml?branch=Stable&style=flat-square&label=Build)](https://github.com/albidr/Clash-Manager/actions)
[![License](https://img.shields.io/badge/License-Proprietary-green?style=flat-square)](https://github.com/albidr/Clash-Manager/blob/Stable/LICENSE)

**Clash Manager Client** is the frontend PWA for the Clash Manager ecosystem. It is a "Headless" interface that consumes data from the Google Apps Script backend, designed to feel like a native app while running entirely in the browser.

It prioritizes **Offline-First** usability using a Stale-While-Revalidate (SWR) strategy:
1.  **Instant Load:** Data serves immediately from `localStorage`.
2.  **Background Sync:** Newer data is fetched silently from the GAS API.
3.  **Optimistic UI:** Actions (like dismissing a recruit) reflect instantly before network confirmation.

---

## Tech stack

| Category | Technology | Context |
| :--- | :--- | :--- |
| **Core** | [Vue 3](https://vuejs.org/) | Composition API + `<script setup>`. |
| **Build** | [Vite 7](https://vitejs.dev/) | Fast HMR and optimized bundling. |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) | Utility-first styling with a custom "Neo-Material" theme. |
| **State** | Native Reactivity | `ref`/`reactive` (No Pinia required for this scale). |
| **PWA** | [Vite Plugin PWA](https://vite-pwa-org.netlify.app/) | Service Worker generation and offline asset caching. |
| **Testing**| [Vitest](https://vitest.dev/) | Unit & Component testing with JSDOM. |


---

## Getting started

Prerequisites: Node.js v20+ and npm v10+.

Install and run locally:

```bash
cd Frontend-PWA
npm ci
npm run dev
```

Environment (.env):

```env
VITE_GAS_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Run tests:

```bash
npm test         # run once
npm run test:ui  # watch with UI
npm run test:coverage
```

Build for production:

```bash
npm run build
```

---

## CI / CD

This project is configured with GitHub Actions to ensure code quality and automate deployments.
*   **Automated Testing**: On every push to `Stable` or a `v*` tag, the full test suite is run. Failed tests will block deployment, preventing regressions.
*   **Automated Deployment**: Successful builds on the `Stable` branch are automatically deployed to GitHub Pages.
*   **Automated Releases**: Pushing a `v*` tag (e.g., `v6.2.1`) will automatically build the app, create a GitHub Release, and attach the production-ready `.zip` file.

---

## Key features

### Design
A clean, responsive visual system with motion and adaptive palettes for clarity.

### Leaderboard
*   Hybrid data (live + historical).
*   War history visualization.
*   Performance scores are computed server-side; see the repository `README.md` (Scoring section) for the formula and rationale.

### Recruitment
*   **Recruitment**: Visualizes the backend's "Deep Net" search results.
*   **Scoring**: Auto-sorts players by a calculated "Potential Score" vs. the clan's average.
*   **Deep Linking**: Supports direct links to open player profiles in Clash Royale.

---

## License

Proprietary.
Copyright © 2026 AlbiDR.
