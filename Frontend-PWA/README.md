# Clash Manager — Client (PWA)

Compact Vue PWA that consumes the backend payload, provides offline-first UX, and supports recruitment workflows.

## Quick facts
- Stack: Vue 3, Vite, Tailwind
- Tests: Vitest
- PWA: Service Worker + background sync

## Local development
```bash
cd Frontend-PWA
npm ci
npm run dev
```

Environment
```env
VITE_GAS_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Testing
```bash
npm test
npm run test:ui
npm run test:coverage
```

Build
```bash
npm run build
```

## Features
- Offline-first UI with optimistic updates
- Leaderboard and war history visualizations
- Recruitment views and deep linking support

See `README.md` (root) for scoring details and project overview.

## CI / CD
GitHub Actions run tests and deploy stable builds.

## License
Proprietary. © 2026 AlbiDR
