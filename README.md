# Clash Manager

[![Version](https://img.shields.io/badge/Version-8.11.0-0066CC?style=flat-square)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](docs/ARCHITECTURE.md)

**Sovereign Clan Intelligence Engine.** A high-precision, production-grade toolkit for elite Clash Royale clan leadership. This system orchestrates a synchronized stack: a **Google Apps Script Backend** for heavy-lift ETL, and a versatile **Frontend Core** that operates as a **Standalone Progressive Web App (PWA)** for desktop and browser-based workflows.

---

## 🏛️ Architecture

<details>
<summary>View System Diagram</summary>

The system is designed for high data integrity and low-latency interaction.

    subgraph "External Data"
        CRAPI["Clash Royale API"]
    end

    subgraph "Cloud Core (Google Apps Script)"
        GAS["Backend Engine"]
        GS["Sheet Data Store"]
        Scoring["ScoringSystem.gs"]
        Recruiter["Recruiter.gs"]
    end

    subgraph "Client Core (Vue 3 PWA)"
        VueUI["Vue 3 Frontend"]
        IDB[(IndexedDB Cache)]
    end

    CRAPI -->|ETL| GAS
    GAS <--> GS
    GAS -->|Headless JSON| VueUI
    VueUI <--> IDB

### Strategic Components

- **Backend (GAS)**: Handles scheduled ETL, matrix normalization, and the canonical scoring algorithm.
- **Client (Vite/Vue)**: An offline-first, glassmorphic UI designed for "Self-Healing" resilience and rapid recruitment workflows.

</details>

---

## 🚀 Quick Start

### 1. Backend Engine (GAS)

1. Deploy the code in `Backend-GAS/` via `clasp` or the Apps Script Editor.
2. Set Script Properties: `ClanTag`, `WebAppUrl`.
3. Configure time-based triggers for `hourlyUpdate`.

### 2. Client Setup

```bash
cd Frontend-PWA
pnpm install
```

### 3. Automated PWA Deployment

The project uses a sophisticated GitHub Actions pipeline (`deploy-pwa.yml`) that deploys the application to GitHub Pages.

---

## ⚖️ The Performance Model

<details>
<summary>Explore the Scoring Algorithm</summary>

The core value of Clash Manager is its multi-dimensional scoring algorithm (implemented in `ScoringSystem.gs.js`). It transforms raw metrics into a single, actionable **Performance Score**.

| Metric           |  Factor   | Influence                    |
| :--------------- | :-------: | :--------------------------- |
| **Current Fame** |   `3x`    | Immediate War Impact         |
| **Average Fame** |   `15x`   | Long-term Consistency        |
| **Donations**    |   `50x`   | Clan Economy Contribution    |
| **Trophies**     | `0.0002x` | Skill Weighting (Normalized) |
| **War Rate**     |  `150x`   | Reliability & Participation  |

> [!IMPORTANT] > **Exponential Decay**: Inactivity is penalized after a 4-day grace period using the formula: $Score \times 0.92^{\max(0, \text{Days Inactive} - 4)}$.

</details>

---

## 🛠️ Development & Contributing

We prioritize technical purity and architectural coherence.

- **Refactor First**: If logic violates DRY or Modularization, split it before extending.
- **Test-Driven**: Every feature or hotfix MUST include a `Vitest` suite.
- **Semantic Integrity**: Use [Conventional Commits](https://www.conventionalcommits.org/).

---

## 📜 License

Proprietary. © 2026 AlbiDR. All rights reserved.
