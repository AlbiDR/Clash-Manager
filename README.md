# Clash Manager

[![Version](https://img.shields.io/badge/Version-6.2.7-0066CC?style=flat-square)](https://github.com/albidr/Clash-Manager)

A concise, production-focused toolkit for clan leadership and recruitment. Backend (GAS) processes and normalizes data; the Vue PWA provides an offline-capable administrative UI.

## Table of contents
- Overview
- Quick start
- Scoring (collapsed)
- Architecture
- Highlights
- Contributing
- License

---

## Overview
Clash Manager aggregates activity (war fame, donations, trophies) and produces a normalized performance score used to rank members and identify recruit candidates. It is designed for reliability: scheduled ETL, safe concurrency, and compact payloads for fast client rendering.

## Quick start
1. Deploy backend: follow `Backend-GAS/README.md`.
2. Configure frontend: `Frontend-PWA/README.md` (set `VITE_GAS_URL` in `.env`).
3. Validate: run the backend "health check" and open the PWA in development mode.

## Scoring (expand for details)
<details>
<summary>Performance model and rationale</summary>

Canonical formula (implemented in `Backend-GAS/ScoringSystem.gs.js`):

\[
\text{Performance Score} = \left[ (\text{Current Fame}\times 3) + (\text{Avg Fame}\times 15) + (\text{Donations}\times 50) + (\text{Trophies}\times 0.0002) + (\text{War Rate}\times 150) \right] \\
\times \left(0.92^{\max(0, \text{Days Inactive} - 4)}\right)
\]

Key points:
- Parameters live in `Backend-GAS/Configuration.gs.js` (WEIGHTS and PENALTIES).
- War Rate emphasizes reliability; Donations reward contribution; Avg Fame stabilizes volatility.
- Decay reduces score for inactivity after a short grace period.

Weights (canonical)

| Metric | Weight |
|---|---:|
| Current Fame | 3 |
| Avg Fame | 15 |
| Donations | 50 |
| Trophies | 0.0002 |
| War Rate | 150 |

> Note: These are the canonical weights used in the score implementation and mirrored in `Backend-GAS/Configuration.gs.js` (see `LEADERBOARD.WEIGHTS`). For security scanning and incident response guidance, see `docs/SECRETS.md` and `docs/REMEDIATION.md`.

</details>

---

## Architecture
```mermaid
flowchart TD
  CRAPI[Clash Royale API] --> GAS[Backend (GAS)]
  GAS --> GS[(Google Sheets DB)]
  GAS --> API[Headless JSON API]
  API --> PWA[Frontend PWA]
  subgraph Services
    GAS --> Scoring[ScoringSystem]
    GAS --> Recruiter[Recruiter]
  end
```

## Highlights
- Multi-dimensional performance score (impact, stability, reliability, contribution)
- Scheduled ETL and trend analysis
- Recruitment scanning pipeline
- Offline-first PWA with background sync

## Contributing
See `CONTRIBUTING.md` and the subproject READMEs for development workflows and contribution guidelines.

## License
Proprietary. © 2026 AlbiDR
