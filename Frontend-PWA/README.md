# Clash Manager — Client (PWA)

A compact, offline-first Vue 3 PWA that consumes the backend's headless payload and provides fast, resilient administrative workflows.

## Table of contents

- Local development
- Environment
- Testing
- Build & deployment
- Android / TWA
- PWA & Service worker
- CI / CD
- Troubleshooting

## Local development

```bash
cd Frontend-PWA
npm ci
npm run dev
```

Environment

```env
VITE_GAS_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
# Optional for analytics or other integrations
# VITE_SENTRY_DSN=
```

Testing

```bash
npm test        # unit tests via Vitest
npm run test:ui # ui / integration tests
npm run test:coverage
npm run lint     # runs ESLint and style checks
```

Build & Release

```bash
npm run build    # produces production assets in dist/
# Deploy to Netlify / Vercel / Firebase Hosting / GitHub Pages
```

Android / TWA

- Use `scripts/build-android.sh` to create a Trusted Web Activity bundle.
- Follow the `Frontend-PWA/README.md` steps in your Android build pipeline to sign and publish.

PWA & Service Worker

- Service worker is in `dev-dist/sw.js` — update carefully and bump the cache version when changing caching strategies.
- For troubleshooting updates, instruct users to hard refresh and clear site data.

CI / CD

- GitHub Actions run tests and produce artifacts. Production deploys should trigger only after a successful main/Stable build and release tag.

## Troubleshooting

- CORS / API errors: verify `VITE_GAS_URL` is set to your deployed WebApp URL and that the Web App allows requests from the host.
- Offline Cache: If new assets aren't loading, check service worker registration and cache invalidation logic.

See the root `README.md` and `docs/DEPLOYMENT.md` for architecture, deployment, and release notes.

## License

Proprietary. © 2026 AlbiDR
