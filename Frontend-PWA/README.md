# Clash Manager — Client Core (Tauri & PWA)

The heart of the Clash Manager interface. This is a high-performance Vue 3 application built for **Dual-Mode Deployment**: a **Tauri 2.0** native mobile core and a **Progressive Web App (PWA)** for desktop-class administrative excellence.

---

## 🏗️ Architectural Versatility

- **PWA Mode**: Optimized for desktop/Mac browser usage, featuring full offline support, service worker caching, and rapid LCP.
- **Native Mode**: Uses Tauri 2.0 (Rust) for deep Android integration, including native deep-link handling and system-level performance.

* **Logic**: Vue 3 + TypeScript
* **Aesthetics**: Vanilla CSS (Sovereign Design System)
* **Native Bridge**: Tauri 2.0 (Rust)
* **State**: Reactive Composables + IndexedDB (Local Cache)
* **Validation**: Zod (Dynamic API Inflation)
* **Testing**: Vitest + JSDOM

---

## 🛠️ Development Lifecycle

### Native Development (Tauri)

To run the application with native Android features:

```bash
# Debug in the browser
pnpm dev

# Debug on a tethered Android device
pnpm tauri android dev
```

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

## 📦 Distribution & CI/CD

The Android build process is fully automated via GitHub Actions (`deploy-android.yml`).

### Distribution Workflow

1.  **Tag Push**: Pushing a tag (`v*`) triggers the build.
2.  **Environment Sync**: Secrets (Keystore, Alias, Passwords) are injected into the Google Cloud / Android build environment.
3.  **Cross-Compilation**: Tauri compiles the Rust core and optimizes the Vue assets.
4.  **Artifact Generation**: A production-signed APK and AAB are generated and uploaded to the GitHub Release.

---

## 🛡️ System Resilience

The client implements several "Self-Healing" patterns:

- **Reactive Integrity**: Direct reactive state access without `.value` pitfalls.
- **Double-Unwrap Protection**: Robust API envelope handling in `gasClient.ts`.
- **Offline Persistence**: Automatic SWR (Stale-While-Revalidate) caching via IndexedDB.

---

## 📜 License

Proprietary. © 2026 AlbiDR. All rights reserved.
