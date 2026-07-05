// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi } from 'vitest';
import { generateHtmlEntry } from '../HtmlEntry';
import * as AppShell from '../AppShell';

describe('HtmlEntry Module', () => {
  const mockVersion = '14.2.6';

  it('should generate a valid HTML5 document structure', () => {
    const html = generateHtmlEntry(mockVersion);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
    expect(html).toContain('</html>');
  });

  it('should inject the correct version into JSON-LD metadata', () => {
    const html = generateHtmlEntry(mockVersion);
    expect(html).toContain(`"softwareVersion": "${mockVersion}"`);
  });

  it('should include the mandatory Content Security Policy (CSP)', () => {
    const html = generateHtmlEntry(mockVersion);
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'self'");
    expect(html).toContain("https://*.supabase.co");
  });

  it('should include mobile-first viewport constraints', () => {
    const html = generateHtmlEntry(mockVersion);
    expect(html).toContain('name="viewport"');
    expect(html).toContain('width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
  });

  it('should include PWA manifest and icon links', () => {
    const html = generateHtmlEntry(mockVersion);
    expect(html).toContain('rel="manifest" href="manifest.json"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('rel="icon"');
  });

  it('should include the theme-color meta tags for light and dark modes', () => {
    const html = generateHtmlEntry(mockVersion);
    expect(html).toContain('name="theme-color" content="#fdfcff" media="(prefers-color-scheme: light)"');
    expect(html).toContain('name="theme-color" content="#0b0e14" media="(prefers-color-scheme: dark)"');
  });

  it('should include the theme preference script (early execution)', () => {
    const html = generateHtmlEntry(mockVersion);
    expect(html).toContain('localStorage.getItem("cm_theme_preference")');
    expect(html).toContain('document.documentElement.classList.add("dark")');
  });

  it('should include the boot-stuck guard mechanism', () => {
    const html = generateHtmlEntry(mockVersion);
    expect(html).toContain('cm_boot_retry');
    expect(html).toContain('document.getElementById(\'app-shell\')');
    expect(html).toContain('window.location.reload()');
    expect(html).toContain('10000'); // 10s timeout
  });

  it('should inject App Shell styles into the critical-substrate style block', () => {
    const stylesSpy = vi.spyOn(AppShell, 'getAppShellStyles').mockReturnValue('.mock-styles { color: red; }');
    const html = generateHtmlEntry(mockVersion);

    expect(html).toContain('<style id="critical-substrate">');
    expect(html).toContain('.mock-styles { color: red; }');

    stylesSpy.mockRestore();
  });

  it('should inject App Shell HTML into the #app container', () => {
    const htmlSpy = vi.spyOn(AppShell, 'getAppShellHtml').mockReturnValue('<div id="mock-shell"></div>');
    const html = generateHtmlEntry(mockVersion);

    expect(html).toContain('<div id="app">');
    expect(html).toContain('<div id="mock-shell"></div>');

    htmlSpy.mockRestore();
  });

  it('should include the main entry point script as a module', () => {
    const html = generateHtmlEntry(mockVersion);
    expect(html).toContain('<script type="module" src="src/app/main.ts"></script>');
  });

  it('should maintain 100% technical purity by avoiding external dependencies in the entry point', () => {
    const html = generateHtmlEntry(mockVersion);
    // Ensure no CDNs are used for core logic (except allowed Google/Supabase domains in CSP)
    const externalScripts = html.match(/<script[^>]+src="([^"]+)"/g) || [];
    externalScripts.forEach(script => {
      if (script.includes('src="http')) {
        expect(script).toMatch(/google|supabase/);
      }
    });
  });
});
