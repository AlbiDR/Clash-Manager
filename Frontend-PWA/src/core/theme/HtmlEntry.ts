import { getAppShellStyles, getAppShellHtml } from './AppShell';

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
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: https://script.google.com https://script.googleusercontent.com https://lh3.googleusercontent.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://script.google.com https://www.googletagmanager.com; connect-src 'self' https://script.google.com https://script.googleusercontent.com https://sheets.googleapis.com;" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="description" content="Clash Manager - Professional recruitment and performance analytics dashboard for Clash Royale clan leaders." />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://albidr.github.io/Clash-Manager/" />
    <meta property="og:title" content="Roster | Clash Manager: Professional Recruitment & Analytics" />
    <meta property="og:description" content="Professional recruitment and performance analytics for Clash Royale clan leaders. Optimize your roster with clinical precision." />
    <meta property="og:image" content="https://albidr.github.io/Clash-Manager/assets/branding/logo.svg" />

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content="https://albidr.github.io/Clash-Manager/" />
    <meta property="twitter:title" content="Roster | Clash Manager: Professional Recruitment & Analytics" />
    <meta property="twitter:description" content="Professional recruitment and performance analytics for Clash Royale clan leaders. Optimize your roster with clinical precision." />
    <meta property="twitter:image" content="https://albidr.github.io/Clash-Manager/assets/branding/logo.svg" />

    <!-- Theme Colors (Bi-Modal) -->
    <meta name="theme-color" content="#fdfcff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0b0e14" media="(prefers-color-scheme: dark)" />
    
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
    <meta name="msapplication-TileColor" content="#0b0e14" />
    
    <link rel="dns-prefetch" href="https://script.google.com" />
    <link rel="dns-prefetch" href="https://sheets.googleapis.com" />
    <link rel="preconnect" href="https://sheets.googleapis.com" crossorigin />
    <link rel="preconnect" href="https://script.google.com" crossorigin />
    
    <link rel="manifest" href="manifest.json" />
    <link rel="icon" href="assets/branding/favicon.ico" sizes="any" />
    <link rel="icon" href="assets/icons/icon-64.png" type="image/png" />
    <link rel="apple-touch-icon" href="assets/icons/pwa-apple.png" />
    
    <title>Roster | Clash Manager: Professional Recruitment & Analytics</title>

    <link rel="preload" href="./fonts/Inter-Variable.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="./fonts/JetBrainsMono-Bold.woff2" as="font" type="font/woff2" crossorigin />

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
        "softwareVersion": "13.2.1",
        "operatingSystem": "Android, iOS, Windows, macOS"
      }
    </script>
    <script type="module" src="/src/app/main.ts"></script>
  </body>
</html>
  `.trim();
}
