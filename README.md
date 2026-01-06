# Clash Manager

Clash Manager is a concise, reliable toolkit for clan leaders and recruiters. It combines a Google Apps Script backend with a Vue Progressive Web App to measure member performance and support recruitment decisions.

## What this repository contains
- `Backend-GAS/` — Server-side logic, ETL, and API.
- `Frontend-PWA/` — Vue PWA client and UI.
- `SCORING.md` — Compact reference for the scoring formula and rationale (linked where scores are used).

## Key features (short)
- Scheduled data hydration and normalized leaderboards.
- Recruitment engine to find active, clanless players.
- Offline-first PWA with background sync.

## Getting started
1. Deploy the backend using `Backend-GAS/README.md`.
2. Configure and run the frontend using `Frontend-PWA/README.md`.

## Scoring

<details>
<summary>Performance model and rationale (expand for details)</summary>

The canonical Performance Score (implemented in `Backend-GAS/ScoringSystem.gs.js`):

\[
\text{Performance Score} = \left[ (\text{Current Fame}\times 3) + (\text{Avg Fame}\times 15) + (\text{Donations}\times 50) + (\text{Trophies}\times 0.0002) + (\text{War Rate}\times 150) \right] \\
\times \left(0.92^{\max(0, \text{Days Inactive} - 4)}\right)
\]

Parameters are configured in `Backend-GAS/Configuration.gs.js` (WEIGHTS and PENALTIES). Brief rationale:

- **War Rate ×150** — promotes reliable participants.
- **Donations ×50** — surfaces contributors.
- **Avg Fame ×15 / Current Fame ×3** — stabilizes ranking against short-term spikes.
- **Trophies ×0.0002** — normalizes a large-valued metric to act as a tie-breaker.
- **Decay** — exponential decay (8% per day) after a 4-day grace period.

Example (brief): Current Fame=40, Avg Fame=30, Donations=120, Trophies=5000, War Rate=90, Days Inactive=6 → Performance ≈ 16,987.

</details>

Implementation: see `Backend-GAS/ScoringSystem.gs.js` and `Backend-GAS/Configuration.gs.js` for the source code and constants.

For more detail on recruiting, features, and the front-end UI, see the subproject READMEs:

- `Backend-GAS/README.md`
- `Frontend-PWA/README.md`

---


## License

Proprietary.  
Copyright © 2026 AlbiDR.
