# Clash Manager — Backend (GAS)

Small, focused server that performs ETL, computes scores, and serves a compact JSON payload consumed by the PWA.

## Quick overview
- Scheduled ETL and scoring
- Headless JSON API for the client
- Recruitment scanning and scoring

## Modules
| File | Purpose |
| --- | --- |
| `API_Public.gs.js` | Router and public endpoints |
| `Controller_Webapp.gs.js` | Payload generation and caching |
| `Leaderboard.gs.js` | War history aggregation and normalization |
| `ScoringSystem.gs.js` | Scoring algorithms (isolated logic) |
| `Recruiter.gs.js` | Tournament scanning and candidate scoring |
| `Configuration.gs.js` | Weights, penalties, and schema constants |

## Setup (short)
1. Create a Google Sheet and open Apps Script.
2. Copy `.gs.js` files into the project (rename to `.gs`).
3. Add project script properties: `ClanTag`, `CRK1..CRKn`, `WebAppUrl`.
4. Deploy as Web App and run the health check.

## API
- `GET ?action=getwebappdata` — compressed leaderboard + recruits
- `GET ?action=ping` — health and version
- `POST` — management actions (example: `dismissRecruits`)

For scoring details see the main `README.md` (Scoring section).

## License
Proprietary. © 2026 AlbiDR
