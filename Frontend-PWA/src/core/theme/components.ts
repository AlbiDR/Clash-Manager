/**
 * CLASH MANAGER - UI Components
 * Ported to TypeScript for Technical Purity.
 */
export const componentStyles = `
/* =========================================
   PULL-TO-REFRESH
   ========================================= */
.ptr-indicator {
  position: absolute; top: calc(-1 * var(--ptr-offset, 0px)); left: 0; right: 0;
  height: var(--ptr-offset, 0px); display: flex; align-items: center; justify-content: center;
  opacity: var(--ptr-opacity, 0); pointer-events: none; z-index: 1001; transition: opacity 0.1s;
}

.ptr-spinner {
  width: 36px; height: 36px; background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur); border: 1px solid var(--sys-surface-glass-border);
  border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: var(--sys-elevation-2);
}

.ptr-indicator.is-refreshing .ptr-spinner { animation: spin 0.8s linear infinite; }
.ptr-icon { color: var(--sys-color-primary); transition: transform 0.2s; }
.is-pulling .ptr-icon { transform: rotate(var(--ptr-rotate, 0deg)); }

/* =========================================
   GLOBAL TYPOGRAPHY
   ========================================= */
.view-title {
  margin: 0; font-size: 24px; font-weight: 900; color: var(--sys-color-on-surface);
  letter-spacing: -0.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: "Inter", system-ui, sans-serif;
}
.header-wrapper.is-scrolled .view-title { font-size: 18px; }

/* =========================================
   LINKS & INTERACTION
   ========================================= */
a { text-decoration: underline; color: inherit; }
.btn-action, .icon-button, .fab-btn, .dock-item { text-decoration: none !important; }

.squish-interaction {
  transition: transform 0.2s var(--sys-motion-spring), background-color 0.2s ease, border-color 0.2s ease;
  will-change: transform;
}
.squish-interaction:active { transform: scale(0.96) translateY(1px); }
.card:active, button:active { transform: scale(0.98); }

.card, .hit-target, button, a, input, select, .tier-badge, .icon-button {
  touch-action: manipulation;
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.15), opacity 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

/* =========================================
   RICH TOOLTIPS
   ========================================= */
.rich-tooltip {
  position: absolute; background: var(--sys-surface-glass);
  backdrop-filter: blur(28px) saturate(200%); -webkit-backdrop-filter: blur(28px) saturate(200%);
  color: var(--sys-color-on-surface); padding: 16px; border-radius: 20px; width: 180px;
  pointer-events: none; opacity: 0; z-index: 10000;
  border: 0.5px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: opacity 0.2s ease, transform 0.25s var(--sys-motion-spring), top 0.2s ease, left 0.2s ease;
  display: flex; flex-direction: column; gap: 10px; contain: content;
  transform: translateX(-50%) translateY(-100%) scale(0.9);
}
.rich-tooltip.visible { opacity: 1; transform: translateX(-50%) translateY(-100%) scale(1); }

/* ... other rt-* classes ... */

/* =========================================
   SHARED CARD COMPONENTS
   ========================================= */
.player-name { font-size: 16px; font-weight: 850; color: var(--sys-color-on-surface); letter-spacing: -0.02em; line-height: 1.1; }
.trophy-meta { display: flex; align-items: center; gap: 4px; color: #854d0e; margin-top: 2px; }
:root.dark .trophy-meta { color: #fbbf24; }
.trophy-val { font-size: 13px; font-weight: 700; font-family: var(--sys-font-family-mono); }
.badge {
  height: 18px; width: 100%; background: var(--sys-color-surface-container-highest);
  border-radius: 6px; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800; color: var(--sys-color-on-surface); text-transform: uppercase;
}
.stat-score { font-size: 18px; font-weight: 900; font-family: var(--sys-font-family-mono); }
.stats-grid { display: grid; gap: 8px; margin-bottom: 12px; }

.btn-action {
  flex: 1; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--sys-color-surface-container-highest); color: var(--sys-color-on-surface);
  font-weight: 700; border: none; cursor: pointer; transition: transform 0.2s;
}
.btn-action.primary { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }

.role-leader { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.role-coleader { background: var(--sys-color-primary-container); color: var(--sys-color-on-primary-container); border: 1px solid rgba(var(--sys-color-primary-rgb), 0.2); }
.role-elder { background: var(--sys-color-secondary-container); color: var(--sys-color-on-secondary-container); }
.role-member { background: var(--sys-color-surface-container-highest); color: var(--sys-color-on-surface); border: 1px solid var(--sys-color-outline-variant); }
`;
