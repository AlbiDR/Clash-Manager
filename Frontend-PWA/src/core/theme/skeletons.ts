// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * CLASH MANAGER - Hydration Skeletons
 * Ported to TypeScript for Technical Purity.
 */
export const skeletonStyles = `
.skeleton-anim {
  animation: pulse 1.5s infinite ease-in-out;
  pointer-events: none;
}

.sk-card {
  height: var(--sys-space-76);
  background: var(--sh-surf);
  border-radius: var(--sys-shape-corner-m);
  padding: var(--sys-space-12) var(--sys-space-16);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgba(128, 128, 128, 0.05);
  margin-bottom: var(--sys-space-8);
  position: relative;
  overflow: hidden;
}

.sk-info { display: flex; flex-direction: column; gap: var(--sys-space-8); min-width: 0; }
.sk-header-group { display: flex; align-items: center; gap: var(--sys-space-14); flex: 1; min-width: 0; }
.sk-meta-stack { display: flex; flex-direction: column; gap: var(--sys-space-4); width: 60px; flex-shrink: 0; }
.sk-header-actions { display: flex; align-items: center; gap: var(--sys-space-4); }
.sk-box { width: var(--sys-space-48); height: var(--sys-space-48); background: var(--sh-sk); border-radius: var(--sys-shape-corner-input); }
.sk-badge-s { height: var(--sys-space-18); width: 100%; background: var(--sh-sk-secondary); border-radius: var(--sys-shape-corner-badge); }
.sk-badge-m { height: 24px; width: 80px; background: var(--sh-sk-secondary); border-radius: var(--sys-shape-corner-small); }
.sk-pill { height: 32px; width: 100px; background: var(--sh-sk-secondary); border-radius: var(--sys-shape-corner-full); opacity: 0.8; }
.sk-label-box { width: 60px; height: 10px; background: var(--sh-sk); border-radius: 3px; opacity: 0.5; }
.sk-value-box { width: 40px; height: 14px; background: var(--sh-sk); border-radius: var(--sys-shape-corner-extra-small); }
.sk-trophy-meta { display: flex; align-items: center; gap: var(--sys-space-4); margin-top: var(--sys-space-2); }
.sk-icon-dot { width: 10px; height: 10px; background: var(--sh-sk-secondary); border-radius: 50%; opacity: 0.5; }
.sk-player-name { height: 16px; background: var(--sh-sk); border-radius: var(--sys-shape-corner-extra-small); }
.sk-input { width: 100%; height: 46px; border-radius: var(--sys-shape-corner-input); background: var(--sh-sk-secondary); }
.sk-select { width: 100%; height: 46px; border-radius: var(--sys-shape-corner-input); background: var(--sh-sk-secondary); }
.sk-button-m { width: 100%; height: var(--sys-space-44); background: var(--sh-sk-secondary); border-radius: var(--sys-shape-corner-medium); }
.sk-button-s { width: 60px; height: 28px; background: var(--sh-sk-secondary); border-radius: var(--sys-shape-corner-small); }
.sk-chart-area {
  width: 100%; height: var(--sys-space-48); background: var(--sh-sk-secondary); border-radius: var(--sys-shape-corner-small);
  display: flex; justify-content: center; align-items: flex-end; gap: var(--sys-space-2); padding: var(--sys-space-4); box-sizing: border-box;
}
.sk-chart-bar { flex: 1; background: var(--sh-sk); border-radius: 2px; opacity: 0.6; }
.sk-text-line-s { width: 80px; height: 10px; background: var(--sh-sk); border-radius: 3px; opacity: 0.6; }
.sk-stat-value { width: 40px; height: 14px; background: var(--sh-sk); border-radius: var(--sys-shape-corner-extra-small); }
.sk-icon-btn-s { width: 36px; height: 36px; background: var(--sh-sk-secondary); border-radius: var(--sys-shape-corner-medium); opacity: 0.6; }
.sk-text-line-m { width: 120px; height: 14px; background: var(--sh-sk); border-radius: var(--sys-shape-corner-extra-small); }
`;
