# Clash Manager

A compact, production-grade toolkit for clan leaders and recruiters. It pairs a Google Apps Script backend with a Vue Progressive Web App to compute performance, manage recruitment, and present an offline-capable admin UI.

## Contents
- `Backend-GAS/` — Server-side logic, ETL, and API generation.
- `Frontend-PWA/` — Vue PWA, UI components, and client logic.

## Quick start
1. Deploy the backend: `Backend-GAS/README.md`.
2. Configure and run the frontend: `Frontend-PWA/README.md`.

## Scoring (expand for details)

<details>
<summary>Performance model and rationale</summary>

Canonical formula (implemented in `Backend-GAS/ScoringSystem.gs.js`):

\[
\text{Performance Score} = \left[ (\text{Current Fame}\times 3) + (\text{Avg Fame}\times 15) + (\text{Donations}\times 50) + (\text{Trophies}\times 0.0002) + (\text{War Rate}\times 150) \right] \\
\times \left(0.92^{\max(0, \text{Days Inactive} - 4)}\right)
\]

Configuration values are in `Backend-GAS/Configuration.gs.js`. Summary rationale:
- War Rate (×150): reliability signal (0–100) prioritized.
- Donations (×50): community contribution indicator.
- Avg Fame (×15) vs Current Fame (×3): stability vs recency balance.
- Trophies (×0.0002): normalized tie-breaker.
- Decay: exponential reduction after a 4-day grace period.

Example: Current Fame=40, Avg Fame=30, Donations=120, Trophies=5000, War Rate=90, Days Inactive=6 → Performance ≈ 16,987.

</details>

## Links
- Backend: `Backend-GAS/README.md` — deployment & API.
- Frontend: `Frontend-PWA/README.md` — development, build, and CI.

## License
Proprietary. © 2026 AlbiDR.
