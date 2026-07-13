// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/** @type {import('dependency-cruiser').IConfiguration} */
const config = {
  forbidden: [
    // 1. Layer 1 (Core) Isolation
    {
      name: 'fe-no-higher-layer-import-in-core',
      comment: 'Frontend Layer 1 (Core) must never depend on higher layers (Shared, Features, App).',
      severity: 'error',
      from: { path: '^Frontend-PWA/src/core/' },
      to: { path: '^Frontend-PWA/src/(shared|features|app)/' }
    },

    // 2. Layer 2 (Shared) Isolation
    {
      name: 'fe-no-higher-layer-import-in-shared',
      comment: 'Frontend Layer 2 (Shared) must never depend on higher layers (Features, App).',
      severity: 'error',
      from: { path: '^Frontend-PWA/src/shared/' },
      to: { path: '^Frontend-PWA/src/(features|app)/' }
    },

    // 3. Layer 3 (Features) Isolation
    {
      name: 'fe-no-higher-layer-import-in-features',
      comment: 'Frontend Layer 3 (Features) must never depend on higher layers (App).',
      severity: 'error',
      from: { path: '^Frontend-PWA/src/features/' },
      to: { path: '^Frontend-PWA/src/app/' }
    },

    // 4. Feature-to-Feature Isolation
    {
      name: 'fe-no-cross-feature-import',
      comment: 'Frontend Layer 3 Features must be strictly decoupled from other features.',
      severity: 'error',
      from: { path: '^Frontend-PWA/src/features/([^/]+)/' },
      to: {
        path: '^Frontend-PWA/src/features/([^/]+)/',
        pathNot: '^Frontend-PWA/src/features/$1/'
      }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' }
  }
};

export default config;
