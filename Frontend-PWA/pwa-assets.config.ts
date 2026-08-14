// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { defineConfig, minimalPreset } from "@vite-pwa/assets-generator/config";
import type { Preset } from "@vite-pwa/assets-generator/config";
import { lightTokens, darkTokens } from "./src/core/theme/tokens";

// The app's canonical background color, matching manifest.json and the app shell.
// Used as the fill for maskable icons (which require an opaque background inside
// the safe-zone) and Apple touch icons. The 'any' / transparent variant intentionally
// omits this so Android's adaptive-icon system can apply its own launcher shape.
const APP_BACKGROUND_COLOR = darkTokens.color.background;

export default defineConfig({
  preset: {
    ...minimalPreset,
    transparent: {
      sizes: [64, 192, 512] as const,
      favicons: [[64, "favicon.ico"]] as const,
      resizeOptions: {
        // TRANSPARENT BACKGROUND: The 'any' icon variant must NOT have a filled
        // background. The OS applies its own adaptive-icon shape (circle, squircle,
        // etc.) over a transparent canvas. Forcing a background here causes Android
        // to wrap a filled square inside its own shape, producing a black box.
        fit: "contain" as const,
      },
      // Reduced padding keeps the logo large and clearly visible on all launchers.
      padding: 0.05,
    },
    maskable: {
      // Both 192 and 512 maskable sizes: some Android versions prefer 192px
      // for the launcher/splash while others use 512px.
      sizes: [192, 512] as const,
      resizeOptions: {
        background: APP_BACKGROUND_COLOR,
        fit: "contain" as const,
      },
      // IMPORTANT: Android crops maskable icons.
      // 0.18 (18%) padding ensures the logo stays inside the "Safe Zone" circle.
      // [OPTIMIZATION] Slightly tightened to 0.16 to better utilize available
      // real estate while remaining well within the 10% safety margin.
      padding: 0.16,
    },
    apple: {
      sizes: [180] as const,
      // Apple touch icons are a single static asset with no dark variant,
      // so this can't track light/dark like APP_BACKGROUND_COLOR does.
      // Reuses onPrimary rather than a second hand-typed white-hex literal.
      resizeOptions: { background: lightTokens.color.onPrimary },
      padding: 0.1,
    },
    monochrome: {
      sizes: [512] as const,
      padding: 0.18,
    },
  } satisfies Preset,
  images: ["public/assets/branding/logo.svg"] as const,
  manifestIconName: "pwa",
  maskableIconName: "pwa-maskable",
  appleIconName: "pwa-apple",
  monochromeIconName: "pwa-icon-monochrome",
});