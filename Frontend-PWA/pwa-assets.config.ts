import { defineConfig, minimalPreset } from "@vite-pwa/assets-generator/config";
import type { Preset } from "@vite-pwa/assets-generator/config";

// The app's canonical background color, matching manifest.json and the app shell.
// Used consistently across all icon variants so the OS splash screen never
// shows a mismatched white background regardless of which icon it selects.
const APP_BACKGROUND_COLOR = "#0b0e14";

export default defineConfig({
  preset: {
    ...minimalPreset,
    transparent: {
      sizes: [64, 192, 512] as const,
      favicons: [[64, "favicon.ico"]] as const,
      resizeOptions: {
        // USING DARK BACKGROUND: Matches the manifest background_color so the
        // Android OS splash screen renders consistently regardless of whether it
        // picks the "any" or "maskable" icon variant.
        background: APP_BACKGROUND_COLOR,
        fit: "contain" as const,
      },
      padding: 0.1,
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
      padding: 0.18,
    },
    apple: {
      sizes: [180] as const,
      resizeOptions: { background: "#ffffff" },
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