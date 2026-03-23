/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // 1. Frontend Modular Rules
    {
      name: 'fe-no-cross-feature-import',
      comment: 'Frontend Layer 3 Features must be decoupled.',
      severity: 'error',
      from: { path: '^Frontend-PWA/src/features/([^/]+)/' },
      to: {
        path: '^Frontend-PWA/src/features/([^/]+)/',
        pathNot: '^Frontend-PWA/src/features/$1/'
      }
    },
    {
      name: 'fe-no-higher-layer-import-in-core',
      comment: 'Frontend Layer 1 (Core) must never depend on higher layers.',
      severity: 'error',
      from: { path: '^Frontend-PWA/src/core/' },
      to: { path: '^Frontend-PWA/src/(shared|features|app)/' }
    },

    // 2. GAS Flat Structure Rules (Underscore based)
    {
      name: 'gas-no-feature-to-feature-import',
      comment: 'GAS Layer 3 (Features like Roster, Headhunter) should not import each other.',
      severity: 'error',
      from: { path: '^Backend-GAS/(Roster|Headhunter|Scoring|Laboratory|Settings)' },
      to: {
        path: '^Backend-GAS/(Roster|Headhunter|Scoring|Laboratory|Settings)',
        pathNot: '^Backend-GAS/$1' // Assuming each is a group of files starting with the name
      }
    },
    {
      name: 'gas-kernel-isolation',
      comment: 'GAS Layer 1 (Kernels/Core) must not import from higher layers.',
      severity: 'error',
      from: { path: '^Backend-GAS/(Core|Scoring_Kernel|Network|Time)' },
      to: { path: '^Backend-GAS/(Roster|Headhunter|Database_View|Orchestrator|Registry|Webapp_Controller)' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' }
  }
};
