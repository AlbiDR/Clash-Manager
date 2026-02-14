# Clash Manager — Client Core (PWA)

[![Client](https://img.shields.io/badge/Client-v10.0.0-0066CC?style=flat-square&logo=vue.js&logoColor=white)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../docs/ARCHITECTURE.md) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)](../LICENSE)

The **Operational Command Center**. A high-performance, offline-first Vue 3 application that serves as the primary interface for clan management.

---
<br />

<div align="left">
  <details style="margin-bottom: 16px; border: 1px solid #3178C6; border-radius: 10px; background-color: #f6f8fa;">
    <summary style="cursor: pointer; color: #3178C6; padding: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <strong>Light Mode</strong>
    </summary>
    <div style="display: flex; gap: 10px; padding: 10px; background-color: #ffffff; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">
      <img src="public/assets/branding/roster-light.webp" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="public/assets/branding/headhunter-light.webp" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
    </div>
  </details>

  <details style="margin-bottom: 16px; border: 1px solid #3178C6; border-radius: 10px; background-color: #161b22;">
    <summary style="cursor: pointer; color: #3178C6; padding: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <strong>Dark Mode</strong>
    </summary>
    <div style="display: flex; gap: 10px; padding: 10px; background-color: #0d1117; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">
      <img src="public/assets/branding/roster-dark.webp" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="public/assets/branding/headhunter-dark.webp" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
    </div>
  </details>
</div>

---
<br />

## Sovereign Design System

The application has migrated away from utility frameworks to a custom, highly-optimized **Vanilla CSS** architecture (`style.css`).

- **Theme Engine**: Real-time HSL variable injection for seamless Light/Dark mode transitions.
- **Glassmorphism**: Hardware-accelerated blurs and translucency effects.
- **Fluid Topology**: Layouts that adapt continuously from mobile viewports to ultra-wide desktop dashboards.
- **Micro-Interactions**: Haptic feedback patterns (vibration) synchronized with visual cues.

---
<br />

## Technical Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Core** | **Vue 3** | Composition API (`<script setup>`) for maximum type inference |
| **Language** | **TypeScript** | Strict mode enabled for 100% type safety |
| **State** | **Composables** | Decentralized, atomic state management (No Pinia/Vuex overhead) |
| **Network** | **GasClient** | Specialized bridge for communicating with Google Apps Script |
| **Schema** | **Valibot** | Runtime payload validation to ensure data integrity |
| **PWA** | **Vite PWA** | Service Worker registration, asset caching, and offline support |
| **Testing** | **Vitest** | Unit and component testing with JSDOM environment |

---
<br />

The codebase is organized using a layered, feature-driven architecture to ensure scalability and maintainable "Clean Stack" principles.

```text
src/
├── app/             # Application shell (Router, App.vue, Main entry)
├── core/            # Business Logic Layer (API clients, Storage, Global services)
├── features/        # Domain-Specific Silos (Laboratory, Roster, Headhunter, Settings)
├── shared/          # Atomic UI Layer (Common components, directives, haptics)
└── env.d.ts         # Environment definitions
```

---
<br />

## Development

### Prerequisites
- Node.js `v20+`
- pnpm `v9+`

### Quick Start

```bash
# Install dependencies
pnpm install

# Start local development server (Hot Module Replacement)
pnpm dev
# > Available at http://localhost:5173
```

### Environment Setup
Create a `.env` file in the root directory to link to your backend:

```ini
# URL of your Google Apps Script Web App execution
VITE_GAS_URL=https://script.google.com/macros/s/.../exec
```

---
<br />

## Quality Assurance

The project adheres to strict testing standards to prevent regression in critical clan operations.

```bash
pnpm test          # Run unit logic tests
pnpm test:ui       # Open the Vitest UI dashboard
pnpm type-check    # Verify TypeScript types
```

---
<br />

## Mobile-First Features

- **Installable**: Meets all PWA criteria for installation on iOS and Android.
- **Offline Capable**: Views cache automatically (`Stale-While-Revalidate` strategy).
- **Haptics**: Uses `navigator.vibrate` for tactile feedback on interactions.
- **Deep Linking**: Supports URL routing for sharing specific clan profiles or searches.

---
<br />

## License

**GNU GPL v3**.
Copyright (c) 2026 AlbiDR.
This project is free software and available under the [GPL v3 License](../LICENSE).
