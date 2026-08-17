// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { getAppShellStyles, getAppShellHtml } from './AppShell';
import { lightTokens, darkTokens } from './tokens';
import { BOOT_THEME_SCRIPT } from './themeContract';

/**
 * CLASH MANAGER - HTML Entry Point (TypeScript Source of Truth)
 * This file replaces the physical index.html to achieve 100% Technical Purity.
 */

export function generateHtmlEntry(version: string): string {
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- [THREAT:] Every Google origin previously allowed here was dead surface: the app
         ships no analytics (no gtag/GTM/GA loader exists anywhere in src/), no Google
         auth (SupabaseClient runs keyed and session-less), and both typefaces are
         self-hosted via @font-face in core/theme/base.ts against public/fonts/.
         Allowlisting script-src for a tag manager that is never loaded hands an
         injected script a pre-approved exfiltration origin for free.
         [DECISION LOG] Narrow every directive to origins the app actually contacts.
         Re-add a specific origin here only alongside the code that calls it.

         [THREAT:] connect-src source expressions match on scheme, so an https-only
         supabase entry does NOT cover the wss:// upgrade Supabase Realtime opens -
         Chrome blocked every realtime socket outright ("violates the following
         Content Security Policy directive"), silently degrading live sync to
         poll-only for the entire deployed lifetime of this policy.
         [DECISION LOG] Declare the wss origin explicitly alongside the https one. -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' blob:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://raw.githubusercontent.com https://api.github.com;" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <meta name="description" content="Clash Manager - Professional recruitment and performance analytics dashboard for Clash Royale clan leaders." />

    <!-- [CRAWLER CONTRACT]
         [THREAT:] A robots.txt is only honoured at an origin root. This app deploys to
         the GitHub Pages project subpath /Clash-Manager/, so a public/robots.txt would
         ship to /Clash-Manager/robots.txt and be ignored by every crawler - the control
         that actually binds at this path is the per-document robots meta.
         [DECISION LOG] Declare indexing policy in-document. max-image-preview:large is
         what permits the 1200x630 og-card.png to render full-bleed in search results.
         Router history is hash-based, so every route collapses to one indexable URL;
         the canonical link states that explicitly instead of leaving Google to guess. -->
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <link rel="canonical" href="https://albidr.github.io/Clash-Manager/" />
    
    <!-- Open Graph / Facebook -->
    <!-- [THREAT:] SVG is not a supported og:image format on any major unfurler
         (Facebook, X, Discord, WhatsApp, LinkedIn, Slack, Reddit). Pointing this
         at logo.svg silently produced a bare text link on every share.
         [DECISION LOG] Serve a pre-rendered 1200x630 PNG social card, and declare
         width/height so unfurlers can reserve layout before the image is fetched.
         SSOT for the card is assets/branding/og-card.svg (see scripts/render_og_card.sh). -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Clash Manager" />
    <meta property="og:url" content="https://albidr.github.io/Clash-Manager/" />
    <meta property="og:title" content="Roster | Clash Manager: Professional Recruitment & Analytics" />
    <meta property="og:description" content="Professional recruitment and performance analytics for Clash Royale clan leaders. Optimize your roster with clinical precision." />
    <meta property="og:image" content="https://albidr.github.io/Clash-Manager/assets/branding/og-card.png" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Clash Manager - recruitment and performance analytics for Clash Royale clan leaders." />

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content="https://albidr.github.io/Clash-Manager/" />
    <meta property="twitter:title" content="Roster | Clash Manager: Professional Recruitment & Analytics" />
    <meta property="twitter:description" content="Professional recruitment and performance analytics for Clash Royale clan leaders. Optimize your roster with clinical precision." />
    <meta property="twitter:image" content="https://albidr.github.io/Clash-Manager/assets/branding/og-card.png" />
    <meta property="twitter:image:alt" content="Clash Manager - recruitment and performance analytics for Clash Royale clan leaders." />

    <!-- Theme Colors (Bi-Modal) -->
    <meta name="theme-color" content="${lightTokens.color.background}" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="${darkTokens.color.background}" media="(prefers-color-scheme: dark)" />
    
    <!-- iOS PWA -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Clash Manager" />
    
    <!-- Splash Screens (iOS) -->
    <link rel="apple-touch-startup-image" href="assets/branding/headhunter-dark.webp" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
    <link rel="apple-touch-startup-image" href="assets/branding/headhunter-dark.webp" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
    <link rel="apple-touch-startup-image" href="assets/branding/headhunter-dark.webp" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
    <link rel="apple-touch-startup-image" href="assets/branding/headhunter-dark.webp" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
    <link rel="apple-touch-startup-image" href="assets/branding/headhunter-dark.webp" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />

    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="application-name" content="Clash Manager" />
    <meta name="msapplication-TileColor" content="${darkTokens.color.background}" />
    
    <link rel="manifest" href="manifest.json" />
    <link rel="icon" href="assets/branding/favicon.ico" sizes="any" />
    <link rel="icon" href="assets/icons/icon-64.png" type="image/png" />
    <link rel="apple-touch-icon" href="assets/icons/pwa-apple.png" />
    
    <title>Roster | Clash Manager: Professional Recruitment & Analytics</title>

    <!-- Critical Origin Preconnect -->
    <link rel="preconnect" href="https://hucktamloykszinwbtuh.supabase.co" crossorigin />

    <!-- [OPTIMIZATION] Critical Asset Preloads for Hybrid Shell LCP -->
    <link rel="preload" href="assets/branding/logo.svg" as="image" type="image/svg+xml" />
    <link rel="preload" href="./fonts/Inter-Variable.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="./fonts/JetBrainsMono-Bold.woff2" as="font" type="font/woff2" crossorigin />

    <script>${BOOT_THEME_SCRIPT}</script>
    <script>
      (function() {
        // Boot-stuck guard: if Vue hasn't replaced the static app shell after 10s,
        // the JS bundle failed to load/execute (stale cache, 404 chunk, network error).
        // Reload up to 2x to recover; the SW self-heal (reload-on-activate) handles the
        // stale-but-mounted case, so this only covers a genuinely failed boot.
        var retryKey = 'cm_boot_retry';
        var retries = parseInt(sessionStorage.getItem(retryKey) || '0');
        if (retries < 2) {
          setTimeout(function() {
            if (document.getElementById('app-shell')) {
              sessionStorage.setItem(retryKey, String(retries + 1));
              window.location.reload();
            } else {
              sessionStorage.removeItem(retryKey);
            }
          }, 10000);
        } else {
          sessionStorage.removeItem(retryKey);
        }
      })();
    </script>
    <style id="critical-substrate">
      ${getAppShellStyles()}
    </style>
  </head>

  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="app">
      ${getAppShellHtml()}
    </div>
    
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "Clash Manager",
        "url": "https://albidr.github.io/Clash-Manager/",
        "description": "Professional recruitment and analytics for Clash Royale.",
        "softwareVersion": "${version}",
        "operatingSystem": "Android, iOS, Windows, macOS"
      }
    </script>
    <script type="module" src="src/app/main.ts"></script>
  </body>
</html>
  `.trim();
}
