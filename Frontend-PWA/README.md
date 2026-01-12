# Clash Manager — Client Core (PWA)

The heart of the Clash Manager interface. This is a high-performance Vue 3 application built as a **Progressive Web App (PWA)** for desktop-class administrative excellence.

---

## 🏗️ Architectural Versatility

- **PWA Mode**: Optimized for desktop/Mac browser usage, featuring full offline support, service worker caching, and rapid LCP.

* **Logic**: Vue 3 + TypeScript
* **Aesthetics**: Vanilla CSS (Sovereign Design System)
* **State**: Reactive Composables + IndexedDB (Local Cache)
* **Validation**: Zod (Dynamic API Inflation)
* **Testing**: Vitest + JSDOM

---

## 🛠️ Development Lifecycle

### Environment Configuration

Create a `.env` in this directory:

```env
VITE_GAS_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

---

## 🧪 Quality Assurance

We maintain a 100% logic coverage goal for all business logic and reactive states.

```bash
pnpm test                # Run unit tests
pnpm test:ui             # Visual test runner
pnpm test:coverage       # Generate coverage reports
```

> [!NOTE] > **Test Environment**: The project is configured with a `jsdom` global setup. Ensure `vitest.setup.ts` is present for hardware/API mocking.

---

---

## 🛡️ System Resilience

The client implements several "Self-Healing" patterns:

- **Reactive Integrity**: Direct reactive state access without `.value` pitfalls.
- **Double-Unwrap Protection**: Robust API envelope handling in `gasClient.ts`.
- **Offline Persistence**: Automatic SWR (Stale-While-Revalidate) caching via IndexedDB.

---

## 📜 License

Proprietary. © 2026 AlbiDR. All rights reserved.
