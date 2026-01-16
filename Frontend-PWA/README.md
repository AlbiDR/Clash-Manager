# Clash Manager — Client Core (PWA)

[![Version](https://img.shields.io/badge/Version-8.11.0-0066CC?style=flat-square)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../../docs/ARCHITECTURE.md)

The heart of the Clash Manager interface. This is a high-performance Vue 3 application built as a **Progressive Web App (PWA)** for desktop-class administrative excellence.

---

## Getting Started

This guide provides instructions for setting up and running the frontend application locally.

### 1. Setup (One-Time)

Complete these steps to configure your local environment.

1.  **Navigate to Directory**:
    ```bash
    cd Frontend-PWA
    ```

2.  **Install Dependencies**:
    ```bash
    pnpm install
    ```

3.  **Configure Environment**:
    <details>
    <summary>Create a `.env` file and set the `VITE_GAS_URL` variable.</summary>

    Create a file named `.env` in the `Frontend-PWA/` directory. You will need to add the deployment URL of your Google Apps Script backend to this file.

    ```env
    VITE_GAS_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
    ```

    </details>

### 2. Development (Recurring)

Once the initial setup is complete, use the following command to start the development server:

```bash
pnpm dev
```

This will start the Vite development server, typically available at `http://localhost:5173`.

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
