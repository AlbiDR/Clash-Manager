import { type ThemeTokens, lightTokens, darkTokens } from './tokens';

/**
 * CLASH MANAGER - App Shell (TypeScript Source of Truth)
 * Standards: 100/100 Lighthouse FCP, technical purity, zero drift.
 */

export function getAppShellStyles(): string {
  const getVars = (t: ThemeTokens) => `
    --sh-bg: ${t.color.background};
    --sh-surf: ${t.color.surface};
    --sh-surf-c: ${t.color.surfaceContainer};
    --sh-surf-h: ${t.color.surfaceContainerHigh};
    --sh-text: ${t.color.onSurface};
    --sh-outline: ${t.color.outline};
    --sh-primary: ${t.color.primary};
    --sh-glass: ${t.color.surfaceContainer};
    --sh-border: ${t.color.outlineVariant};
    --sh-sk: ${t.color.surfaceContainerHighest};
  `;

  return `
    :root {
      ${getVars(lightTokens)}
    }

    @media (prefers-color-scheme: dark) {
      :root {
        ${getVars(darkTokens)}
      }
    }

    body {
      background-color: var(--sh-bg);
      margin: 0;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
      min-height: 100dvh;
    }

    #app-shell {
      display: block;
      max-width: 720px;
      margin: 0 auto;
      padding: 0 12px;
      padding-top: calc(12px + env(safe-area-inset-top));
      padding-bottom: 120px;
      contain: content;
    }

    .sh-header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--sh-glass);
      border: 1px solid var(--sh-border);
      border-radius: 24px;
      padding: 18px;
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    }

    .sh-h-row { display: flex; justify-content: space-between; align-items: center; }

    .view-title {
      margin: 0;
      font-size: 24px;
      font-weight: 900;
      color: var(--sh-text);
      letter-spacing: -0.03em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: "Inter", system-ui, sans-serif;
      contain: paint;
    }

    .sh-pill { width: 100px; height: 28px; background: var(--sh-surf-c); border-radius: 10px; }
    .sh-search { height: 46px; background: var(--sh-surf-h); border-radius: 14px; display: flex; align-items: center; padding: 0 14px; gap: 12px; }
    .sh-s-icon { width: 20px; height: 20px; border-radius: 50%; background: var(--sh-outline); opacity: 0.3; }
    .sh-s-line { height: 12px; width: 80px; background: var(--sh-outline); opacity: 0.1; border-radius: 4px; }

    .sh-list { display: flex; flex-direction: column; gap: 8px; }
    .sh-card {
      height: 76px;
      background: var(--sh-surf-c);
      border-radius: 20px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border: 1px solid rgba(128, 128, 128, 0.05);
      contain: content;
    }

    .sh-c-left { display: flex; gap: 14px; align-items: center; }
    .sh-c-meta { display: flex; flex-direction: column; gap: 4px; width: 60px; }
    .sh-badge { height: 18px; background: var(--sh-surf-h); border-radius: 6px; opacity: 0.8; }
    .sh-c-info { display: flex; flex-direction: column; gap: 8px; }
    .sh-name { width: 120px; height: 16px; background: var(--sh-sk); border-radius: 4px; }
    .sh-sub { width: 80px; height: 12px; background: var(--sh-sk); border-radius: 4px; opacity: 0.8; }
    .sh-score { width: 48px; height: 48px; background: var(--sh-sk); border-radius: 14px; margin-right: 4px; }
    .sh-expand { width: 36px; height: 36px; background: var(--sh-surf-h); border-radius: 12px; opacity: 0.6; }

    .sh-dock {
      position: fixed;
      bottom: calc(24px + env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      background: var(--sh-glass);
      border: 1px solid var(--sh-border);
      padding: 6px;
      border-radius: 99px;
      display: flex;
      gap: 4px;
      z-index: 50;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
    }

    .sh-d-item { padding: 10px 20px; border-radius: 99px; display: flex; gap: 8px; align-items: center; }
    .sh-d-item.active { background: var(--sh-primary); }
    .sh-d-icon { width: 22px; height: 22px; background: currentColor; opacity: 0.8; }
    .sh-pulse { opacity: 0.85; }
    @keyframes sh-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
  `;
}

export function getAppShellHtml(): string {
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
                <div class="sh-name" style="width: ${Math.floor(Math.random() * 70 + 90)}px"></div>
                <div class="sh-sub"></div>
              </div>
            </div>
            <div class="sh-score"></div>
            <div class="sh-expand"></div>
          </div>
        `).join('')}
      </div>

      <div class="sh-dock" role="navigation" aria-label="Main Navigation">
        <div class="sh-d-item active" role="link" aria-label="Roster View" tabindex="0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white" role="img" aria-hidden="true">
            <title>Roster Icon</title>
            <path d="M3,3v18h18V3H3z M17,17h-2v-5h2V17z M13,17h-2v-9h2V17z M9,17H7V9h2V17z" vector-effect="non-scaling-stroke"/>
          </svg>
          <span style="font-size: 14px; font-weight: 750; color: white; font-family: sans-serif;">Roster</span>
        </div>
        <div class="sh-d-item" role="link" aria-label="Headhunter View" tabindex="0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#73777f" role="img" aria-hidden="true">
            <title>Headhunter Icon</title>
            <path d="M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10s10-4.48,10-10S17.52,2,12,2z M12,17c-2.76,0-5-2.24-5-5s2.24-5,5-5s5,2.24,5,5S14.76,17,12,17z" vector-effect="non-scaling-stroke"/>
          </svg>
        </div>
        <div class="sh-d-item" role="link" aria-label="Settings View" tabindex="0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#73777f" role="img" aria-hidden="true">
            <title>Settings Icon</title>
            <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" vector-effect="non-scaling-stroke" />
          </svg>
        </div>
      </div>
    </main>
  `;
}
