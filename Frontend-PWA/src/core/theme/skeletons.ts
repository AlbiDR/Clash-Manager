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
  height: 76px;
  background: var(--sh-surf);
  border-radius: 20px;
  padding: 12px 16px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgba(128, 128, 128, 0.05);
  margin-bottom: 8px;
  position: relative;
  overflow: hidden;
  transform: translateZ(0);
}

.sk-info { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.sk-header-group { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
.sk-meta-stack { display: flex; flex-direction: column; gap: 4px; width: 60px; flex-shrink: 0; }
.sk-header-actions { display: flex; align-items: center; gap: 4px; }
.sk-box { width: 48px; height: 48px; background: var(--sh-sk); border-radius: 14px; }
.sk-badge-s { height: 18px; width: 100%; background: var(--sh-sk-secondary); border-radius: 6px; }
.sk-badge-m { height: 24px; width: 80px; background: var(--sh-sk-secondary); border-radius: 8px; }
.sk-pill { height: 32px; width: 100px; background: var(--sh-sk-secondary); border-radius: 99px; opacity: 0.8; }
.sk-label-box { width: 60px; height: 10px; background: var(--sh-sk); border-radius: 3px; opacity: 0.5; }
.sk-value-box { width: 40px; height: 14px; background: var(--sh-sk); border-radius: 4px; }
.sk-trophy-meta { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
.sk-icon-dot { width: 10px; height: 10px; background: var(--sh-sk-secondary); border-radius: 50%; opacity: 0.5; }
.sk-player-name { height: 16px; background: var(--sh-sk); border-radius: 4px; }
.sk-input { width: 100%; height: 46px; border-radius: 14px; background: var(--sh-sk-secondary); }
.sk-select { width: 100%; height: 46px; border-radius: 14px; background: var(--sh-sk-secondary); }
.sk-button-m { width: 100%; height: 44px; background: var(--sh-sk-secondary); border-radius: 12px; }
.sk-button-s { width: 60px; height: 28px; background: var(--sh-sk-secondary); border-radius: 8px; }
.sk-chart-area {
  width: 100%; height: 48px; background: var(--sh-sk-secondary); border-radius: 8px;
  display: flex; justify-content: center; align-items: flex-end; gap: 2px; padding: 4px; box-sizing: border-box;
}
.sk-chart-bar { flex: 1; background: var(--sh-sk); border-radius: 2px; opacity: 0.6; }
.sk-text-line-s { width: 80px; height: 10px; background: var(--sh-sk); border-radius: 3px; opacity: 0.6; }
.sk-stat-value { width: 40px; height: 14px; background: var(--sh-sk); border-radius: 4px; }
.sk-icon-btn-s { width: 36px; height: 36px; background: var(--sh-sk-secondary); border-radius: 12px; opacity: 0.6; }
.sk-text-line-m { width: 120px; height: 14px; background: var(--sh-sk); border-radius: 4px; }
`;
