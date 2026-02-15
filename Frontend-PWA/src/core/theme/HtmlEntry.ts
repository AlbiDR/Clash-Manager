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
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Clash Manager" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="application-name" content="Clash Manager" />
    <meta name="msapplication-TileColor" content="#0b0e14" />
    
    <link rel="preconnect" href="https://sheets.googleapis.com" />
    <link rel="preconnect" href="https://script.google.com" />
    
    <link rel="manifest" href="manifest.json" />
    <link rel="icon" href="assets/branding/favicon.ico" sizes="any" />
    <link rel="icon" href="assets/icons/pwa-64.png" type="image/png" />
    <link rel="apple-touch-icon" href="assets/icons/pwa-apple.png" />
    
    <title>Clash Manager</title>

    <link rel="preload" href="/fonts/Inter-Variable.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/JetBrainsMono-Bold.woff2" as="font" type="font/woff2" crossorigin />

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
    <script type="module" src="/src/app/main.ts"></script>
  </body>
</html>
  `.trim();
}
