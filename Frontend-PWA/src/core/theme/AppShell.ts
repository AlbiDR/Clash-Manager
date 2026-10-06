// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { lightTokens, darkTokens, generateCssVariables } from './tokens';
import { staticTokens } from './base';
import { getBone } from './bones';
import { NAV_ITEMS } from '../utils/navigation';

/**
 * CLASH MANAGER - App Shell (TypeScript Source of Truth)
 * Standards: 100/100 Lighthouse FCP, technical purity, zero drift.
 */

// Zero semantic content - just serializes a flat var record as CSS declarations.
function serializeVars(vars: Record<string, string>): string {
  return Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// Shell-only aliases, theme-agnostic by construction: each is a var()
// indirection onto the real --sys-color-* token, not a baked value, so it
// automatically tracks useTheme.ts's runtime setProperty() updates on a live
// theme toggle instead of going stale the instant the user switches themes.
// Do not add a --sh-surf alias here: nothing in this file's own CSS reads
// it, and the name previously collided with the unrelated --sk-surf
// skeleton-loading token (see ThemeTokens.skeleton's doc comment).
const SHELL_ALIASES = `
  --sh-bg: var(--sys-color-background);
  --sh-surf-c: var(--sys-color-surface-container);
  --sh-surf-h: var(--sys-color-surface-container-high);
  --sh-text: var(--sys-color-on-surface);
  --sh-outline: var(--sys-color-outline);
  --sh-glass: var(--sys-color-surface-container);
  --sh-border: var(--sys-color-outline-variant);
  --sh-sk: var(--sys-color-surface-container-highest);
`;

export function getAppShellStyles(): string {
  return staticTokens + `
    :root {
      ${serializeVars(generateCssVariables(lightTokens))}
      ${SHELL_ALIASES}
    }

    html.dark {
      ${serializeVars(generateCssVariables(darkTokens))}
      ${SHELL_ALIASES}
    }

    body {
      background-color: var(--sh-bg);
      margin: 0;
      font-family: var(--sys-font-family-body);
      -webkit-font-smoothing: antialiased;
      /* clip rather than hidden: hidden on one axis computes the other from
         visible to auto, making the body a scroll container and breaking every
         position: sticky above it. See the note on .app-shell in App.vue. */
      overflow-x: clip;
      min-height: 100dvh;
      /* In landscape a navigation bar or camera cutout covers one side. The
         background still runs under it; the content stays beside it. */
      padding-left: var(--sys-safe-left);
      padding-right: var(--sys-safe-right);
    }

    /* The page runs edge to edge, under the status bar. This strip, in the
       page's own background, covers the status bar so the list scrolls away
       beneath it rather than behind the clock and battery icons. At rest it
       matches the page and cannot be seen. This stylesheet stays for the life
       of the page, so the one rule serves the skeleton and the live app. */
    body::before {
      content: "";
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: var(--sys-safe-top);
      background: var(--sh-bg);
      z-index: var(--sys-z-header);
      pointer-events: none;
    }

    #app-shell {
      display: block;
      max-width: var(--sys-layout-max-width);
      margin: 0 auto;
      padding: 0 var(--sys-space-12);
      padding-top: calc(var(--sys-space-12) + var(--sys-safe-top));
      padding-bottom: var(--sys-space-120);
      contain: content;
    }

    .sh-header {
      position: sticky;
      top: var(--sys-safe-top);
      z-index: 10;
      background: var(--sh-glass);
      border: 1px solid var(--sh-border);
      border-radius: var(--sys-shape-corner-l);
      padding: var(--sys-space-18);
      margin-bottom: var(--sys-space-20);
      display: flex;
      flex-direction: column;
      gap: var(--sys-space-14);
      box-shadow: var(--sys-elevation-2);
    }

    .sh-h-row { display: flex; justify-content: space-between; align-items: center; }

    .view-title {
      margin: 0;
      font-size: var(--sys-typescale-title-lg);
      font-weight: 900;
      color: var(--sh-text);
      letter-spacing: var(--sys-tracking-snug);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--sys-font-family-body);
      contain: paint;
    }

    .sh-pill { width: 100px; height: 28px; background: var(--sh-surf-c); border-radius: var(--sys-shape-corner-stat); }
    .sh-search { height: 46px; background: var(--sh-surf-h); border-radius: var(--sys-shape-corner-input); display: flex; align-items: center; padding: 0 var(--sys-space-14); gap: var(--sys-space-12); }
    .sh-s-icon { width: 20px; height: 20px; border-radius: 50%; background: var(--sh-outline); opacity: 0.3; }
    .sh-s-line { height: 12px; width: 80px; background: var(--sh-outline); opacity: 0.1; border-radius: var(--sys-shape-corner-extra-small); }

    .sh-list { display: flex; flex-direction: column; gap: var(--sys-space-8); }
    .sh-card {
      height: var(--sys-space-76);
      background: var(--sh-surf-c);
      border-radius: var(--sys-shape-corner-m);
      padding: var(--sys-space-12) var(--sys-space-16);
      display: flex;
      align-items: center;
      justify-content: space-between;
      border: 1px solid rgba(128, 128, 128, 0.05);
      contain: content;
    }

    .sh-c-left { display: flex; gap: var(--sys-space-14); align-items: center; }
    .sh-c-meta { display: flex; flex-direction: column; gap: var(--sys-space-4); width: 60px; }
    .sh-badge { height: var(--sys-space-18); background: var(--sh-surf-h); border-radius: var(--sys-shape-corner-badge); opacity: 0.8; }
    .sh-c-info { display: flex; flex-direction: column; gap: var(--sys-space-8); }
    .sh-name { width: ${getBone('RosterShell', 'name')?.width ?? 120}px; height: 16px; background: var(--sh-sk); border-radius: var(--sys-shape-corner-extra-small); }
    .sh-sub { width: 80px; height: 12px; background: var(--sh-sk); border-radius: var(--sys-shape-corner-extra-small); opacity: 0.8; }
    .sh-score { width: var(--sys-space-48); height: var(--sys-space-48); background: var(--sh-sk); border-radius: var(--sys-shape-corner-input); margin-right: var(--sys-space-4); }
    .sh-expand { width: 36px; height: 36px; background: var(--sh-surf-h); border-radius: var(--sys-shape-corner-medium); opacity: 0.6; }

    #app-shell .dock-container {
      position: fixed;
      bottom: calc(var(--sys-space-24) + var(--sys-safe-bottom) + var(--safe-frame-offset, 0px));
      left: var(--sys-safe-center-x);
      transform: translate3d(-50%, 0, 0);
      background: var(--sys-surface-glass);
      -webkit-backdrop-filter: var(--sys-surface-glass-blur);
      backdrop-filter: var(--sys-surface-glass-blur);
      border: var(--sys-border-width-glass) solid var(--sys-surface-glass-border);
      padding: var(--sys-space-6);
      border-radius: var(--sys-shape-corner-full);
      display: flex;
      gap: var(--sys-space-6);
      z-index: var(--sys-z-dock);
      box-shadow: var(--sys-elevation-3);
      touch-action: manipulation;
      pointer-events: auto;
      user-select: none;
      contain: layout paint style;
      isolation: isolate;
      box-sizing: border-box;
    }

    #app-shell .dock-mode { display: flex; align-items: center; min-width: 0; }
    #app-shell .dock-item {
      position: relative;
      box-sizing: border-box;
      height: var(--sys-space-56);
      flex: 1;
      min-width: var(--sys-layout-dock-item-min-width);
      padding: 0 var(--sys-space-12);
      border-radius: var(--sys-shape-corner-full);
      display: flex;
      gap: var(--sys-space-10);
      align-items: center;
      justify-content: center;
      color: var(--sh-text);
      font-size: var(--sys-typescale-body-rg);
      font-weight: var(--sys-font-weight-dock);
      font-family: inherit;
      white-space: nowrap;
      background: none;
      border: none;
      transform: translateZ(0);
      touch-action: manipulation;
    }
    #app-shell .dock-item.active { color: var(--sys-color-on-primary); flex: var(--sys-layout-dock-active-grow); }
    #app-shell .dock-item:focus-visible { outline: var(--sys-space-2) solid var(--sys-color-primary); outline-offset: var(--sys-space-2); }
    #app-shell .capsule-bg { position: absolute; inset: 0; background: var(--sys-color-primary); border-radius: var(--sys-shape-corner-full); z-index: -1; box-shadow: var(--sys-elevation-dock-active); }
    #app-shell .dock-icon-placeholder { display: block; width: var(--sys-layout-dock-icon-size); height: var(--sys-layout-dock-icon-size); flex: 0 0 var(--sys-layout-dock-icon-size); border-radius: var(--sys-shape-corner-small); background: currentColor; opacity: var(--sys-opacity-dock-placeholder); }
    #app-shell .dock-label { white-space: nowrap; letter-spacing: var(--sys-tracking-neg-1); }

    @media (max-width: 600px) {
      #app-shell .dock-container {
        width: calc(100% - var(--sys-safe-left) - var(--sys-safe-right) - var(--sys-space-32));
        max-width: var(--sys-layout-dock-compact-max-width);
        padding: var(--sys-space-4);
        gap: var(--sys-space-4);
      }
      #app-shell .dock-mode { flex: 1 1 auto; width: 100%; }
      #app-shell .dock-item { flex: 1; min-width: 0; padding: 0; gap: var(--sys-space-4); font-size: var(--sys-typescale-body-sm); }
      #app-shell .dock-item .dock-label { display: none; }
      #app-shell .dock-item.active { flex: var(--sys-layout-dock-compact-active-grow); }
      #app-shell .dock-item.active .dock-label { display: block; max-width: var(--sys-layout-dock-label-max-width); overflow: hidden; text-overflow: ellipsis; }
    }
    @media (orientation: landscape) and (max-height: 520px) {
      #app-shell .dock-container {
        right: calc(var(--sys-safe-right) + var(--sys-space-16) + var(--safe-frame-offset, 0px));
        bottom: calc(var(--sys-space-12) + var(--sys-safe-bottom) + var(--safe-frame-offset, 0px));
        left: auto;
        transform: translate3d(0, 0, 0);
        padding: var(--sys-space-4);
        gap: var(--sys-space-4);
      }
      #app-shell .dock-item {
        flex: 0 0 var(--sys-space-48);
        min-width: var(--sys-space-48);
        width: var(--sys-space-48);
        height: var(--sys-space-48);
        padding: 0;
      }
      #app-shell .dock-item.active { flex: 0 0 var(--sys-space-48); }
      #app-shell .dock-label { display: none; }
    }
    .sh-pulse {
      opacity: 0.85;
      animation: sh-pulse 1.5s infinite ease-in-out;
    }
    @keyframes sh-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
  `;
}

export function getAppShellHtml(): string {
  const shellNavigation = NAV_ITEMS.map((navigationItem, navigationIndex) => `
          <button type="button" class="dock-item${navigationIndex === 0 ? ' active' : ''}" aria-label="${escapeHtml(navigationItem.label)}"${navigationIndex === 0 ? ' aria-current="page"' : ''}>
            ${navigationIndex === 0 ? '<div class="capsule-bg"></div>' : ''}
            <span class="dock-icon dock-icon-placeholder" aria-hidden="true"></span>
            <span class="dock-label">${escapeHtml(navigationItem.label)}</span>
          </button>
  `).join('');

  return `
    <main id="app-shell">
      <div class="sh-header">
        <div class="sh-h-row">
          <h1 class="view-title"><span>Roster</span></h1>
          <div class="sh-pill sh-pulse"></div>
        </div>
        <div class="sh-search">
          <div class="sh-s-icon"></div>
          <div class="sh-s-line"></div>
        </div>
      </div>

      <div class="sh-list">
        ${Array(8).fill(`
          <div class="sh-card sh-pulse">
            <div class="sh-c-left">
              <div class="sh-c-meta">
                <div class="sh-badge"></div>
                <div class="sh-badge"></div>
              </div>
              <div class="sh-c-info">
                <div class="sh-name"></div>
                <div class="sh-sub"></div>
              </div>
            </div>
            <div class="sh-score"></div>
            <div class="sh-expand"></div>
          </div>
        `).join('')}
      </div>

      <div class="dock-container">
        <nav class="dock-mode" aria-label="Main navigation">
          ${shellNavigation}
        </nav>
      </div>
    </main>
  `;
}
