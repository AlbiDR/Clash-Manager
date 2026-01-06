# Deployment

This guide covers deployment and release hygiene for both Backend (GAS) and Frontend (PWA).

## Backend (Google Apps Script)
1. Use `clasp` for local development and versioned deployments:
   - Install: `npm i -g @google/clasp`
   - Login and clone your Apps Script project, or create a new one.
2. Script properties (Project Settings > Script Properties):
   - `ClanTag` (required)
   - `WebAppUrl` (set after first deploy)
   - Any API keys or integration settings (store in CI secrets when deploying automatically)
3. Deploy as Web App:
   - Execute as: **Me**
   - Access: **Anyone** (or restrict to your org)
4. Triggers: configure time-based triggers for ETL operations; prefer smaller batches and backoff.

## Frontend (PWA)
- Build: `npm run build` (produces `dist/`)
- Hosts: Netlify, Vercel, Firebase Hosting, GitHub Pages. Configure redirects and caching appropriately.
- Web App Manifest: ensure icons and TWA settings are provided when building Android packages.

## CI/CD
- Tests, linting, and security scans run on pushed branches. Only merge to `Stable`/`main` after green CI.
- Security scans: run TruffleHog with `--exclude-paths=.git` for filesystem scans and `--only-verified` for git scans to reduce false positives.

## Rollbacks and versioning
- Tag releases with `vX.Y.Z` and keep a changelog for notable changes.
- For backend critical fixes, redeploy a previous Apps Script version as needed.
