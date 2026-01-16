# Clash Manager — Client Core (PWA)

[![Version](https://img.shields.io/badge/Version-8.11.0-0066CC?style=flat-square)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../../docs/ARCHITECTURE.md)

The heart of the Clash Manager interface. This is a high-performance Vue 3 application built as a **Progressive Web App (PWA)** for desktop-class administrative excellence.

---

---

## Visual Experience

<p align="center">
  The interface adapts fluidly to your device and system theme preferences.
</p>

<p align="center">
  <strong>Desktop Command Center</strong>
</p>

<p align="center">
  <img src="public/screenshot-desktop-light.webp" width="48%" />
  &nbsp;
  <img src="public/screenshot-desktop-dark.webp" width="48%" />
</p>

<br />

<p align="center">
  <strong>Mobile Operations</strong>
</p>

<p align="center">
  <img src="public/screenshot-mobile-light.webp" width="28%" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="public/screenshot-mobile-dark.webp" width="28%" />
</p>

---

## Architectural Components

- **Logic**: Vue 3 + TypeScript
- **Aesthetics**: Vanilla CSS (Sovereign Design System)
- **State**: Reactive Composables + IndexedDB (Local Cache)
- **Validation**: Zod (Dynamic API Inflation)
- **Testing**: Vitest + JSDOM

---

## Quality Assurance

We maintain a 100% logic coverage goal for all business logic and reactive states.

```bash
pnpm test                # Run unit tests
pnpm test:ui             # Visual test runner
pnpm test:coverage       # Generate coverage reports
```

> **Note**: The project is configured with a `jsdom` global setup. Ensure `vitest.setup.ts` is present for hardware/API mocking.

---

## System Resilience

The client implements several "Self-Healing" patterns:

- **Reactive Integrity**: Direct reactive state access without `.value` pitfalls
- **Double-Unwrap Protection**: Robust API envelope handling in `gasClient.ts`
- **Offline Persistence**: Automatic SWR (Stale-While-Revalidate) caching via IndexedDB

---

## License

Proprietary. © 2026 AlbiDR. All rights reserved.
