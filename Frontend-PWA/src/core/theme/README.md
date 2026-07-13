// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Theme Engine (@core/theme)

The **Visual DNA**. A clinical, CSS-variable-driven design system responsible for orchestrating global styles, design tokens, and the zero-flicker application shell.

---

## Purpose
The Theme Engine (Layer 1) provides the structural and aesthetic foundations of the Clash Manager ecosystem. It ensures that the application maintains a consistent visual identity, supports seamless Light/Dark mode transitions, and achieves sub-second visual stability through a hardcoded HTML substrate.

## Architectural Context
- **Layer**: Layer 1 (@core/theme)
- **Role**: Design System SSOT & Shell Architect.
- **Import Boundaries**:
 - **Allowed**: Can import from Layer 0 (@substrate) and other Layer 1 modules.
 - **Forbidden**: Strictly forbidden from importing from any higher layers (Shared, Features, App).

## Core Modules

### Design Tokens (`tokens.ts`)
The authoritative Single Source of Truth for the design system.
- **Theme Definitions**: Defines the `ThemeTokens` interface and provides concrete implementations for `lightTokens` and `darkTokens`.
- **CSS Variable Generation**: Orchestrates the mapping of design tokens to standardized `--sys-color-*` and `--sh-*` (shell-specific) CSS variables.

### Foundational Substrate (`base.ts`)
Injects the global CSS reset and static design tokens.
- **CSS Reset**: Normalizes browser styles and enforces native-feeling gesture overrides (touch-action, overscroll-behavior).
- **Static Tokens**: Centralizes non-color design tokens including Typography scales (`--sys-typescale-*`), Spacing (`--sys-space-*`), Shapes (`--sys-shape-*`), and Z-Index layers.

### App Shell Architect (`AppShell.ts` & `HtmlEntry.ts`)
The structural orchestrators responsible for the "Zero-Flicker" hydration strategy and technical purity.
- **HtmlEntry.ts**: The **TypeScript Source of Truth** for the application's entry point. It replaces the physical `index.html` file, allowing the system to dynamically inject versioning, metadata, and critical shell artifacts during the build process.
- **AppShell.ts**: The structural architect. Generates the self-contained CSS and HTML substrate (including skeletons) required for sub-second visual stability.
- **Critical CSS**: Generates `getAppShellStyles()`, which includes critical layout styles and theme tokens for immediate injection into the `<head>`.
- **HTML Substrate**: Generates `getAppShellHtml()`, providing the hardcoded DOM structure that mirrors the initial Vue render to eliminate hydration-related layout shifts.

### Skeletons & Animations (`skeletons.ts` & `animations.ts`)
Provides the geometric and temporal foundations for the loading state.
- **Skeletons**: Defines the standard `.sh-card` and `.sh-header` skeletons used in the App Shell.
- **Animations**: Centralizes high-performance CSS keyframes (e.g., `sh-pulse`) for shell-wide interactions.

### Icon SSOT (`icons.ts`)
The authoritative source for all vector artwork.
- **SVG Paths**: Centralizes all SVG path definitions, which are consumed exclusively by the `Icon.vue` primitive.
- **Visual Purity**: Enforces the project's zero-library icon policy, ensuring absolute stylistic control and minimal bundle weight.

---

## Integration Standards
- **CSS Variable Consumption**: All UI components (Layer 2+) must consume colors via `--sys-color-*` variables to ensure theme compatibility.
- **Hydration Parity**: Any change to the structural layout of `ConsoleLayout` or `App.vue` must be manually synchronized with `AppShell.ts` to maintain hydration parity.
- **Stateless Purity**: The theme engine is stateless. Dynamic theme switching is managed by the `useTheme` composable in the Shared layer, which manipulates the `html.dark` class and `theme-color` meta tag.
