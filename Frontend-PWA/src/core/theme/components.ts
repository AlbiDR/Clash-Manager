// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
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
  opacity: var(--ptr-opacity, 0); pointer-events: none; z-index: var(--sys-z-ptr); transition: opacity var(--sys-motion-duration-100);
}

.ptr-spinner {
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: var(--sys-elevation-2);
}

.ptr-indicator.is-refreshing .ptr-spinner { animation: spin 0.8s linear infinite; }
.ptr-icon { color: var(--sys-color-primary); transition: transform var(--sys-motion-duration-200); }
.is-pulling .ptr-icon { transform: rotate(var(--ptr-rotate, 0deg)); }

/* =========================================
   GLOBAL TYPOGRAPHY
   ========================================= */
.view-title {
  margin: 0; font-size: var(--sys-typescale-title-lg); font-weight: 900; color: var(--sys-color-on-surface);
  letter-spacing: var(--sys-tracking-snug); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: var(--sys-font-family-body);
}

/* =========================================
   GLOBAL BUTTON PRIMITIVES
   ========================================= */
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-8);
  padding: var(--sys-space-12) var(--sys-space-24);
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border: none;
  border-radius: var(--sys-shape-corner-full);
  font-weight: 850;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.3);
  transition: transform var(--sys-motion-duration-200) var(--sys-motion-spring);
}
.btn-primary:active {
  transform: scale(0.95);
}

.header-wrapper.is-scrolled .view-title { font-size: var(--sys-typescale-title-sm); }

/* =========================================
   LINKS & INTERACTION
   ========================================= */
a { text-decoration: underline; color: inherit; }
.btn-action, .icon-button, .fab-btn, .dock-item { text-decoration: none !important; }

.squish-interaction {
  transition: transform var(--sys-motion-duration-200) var(--sys-motion-spring), background-color var(--sys-motion-duration-200) ease, border-color var(--sys-motion-duration-200) ease;
}
.squish-interaction:active { transform: scale(0.96) translateY(1px); }
.card:active, button:active { transform: scale(0.98); }

.card, .hit-target, button, a, input, select, .icon-button {
  touch-action: manipulation;
  transition: transform var(--sys-motion-duration-200) var(--sys-motion-spring), opacity var(--sys-motion-duration-200) ease, background-color var(--sys-motion-duration-200) ease, box-shadow var(--sys-motion-duration-200) ease;
}

/* =========================================
   SHARED CARD COMPONENTS
   ========================================= */
.player-name {
  font-size: var(--sys-typescale-player);
  font-weight: 850;
  color: var(--sys-color-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: var(--sys-tracking-normal);
  line-height: var(--sys-leading-tight);
}

.trophy-meta {
  display: flex;
  align-items: center;
  gap: var(--sys-space-4);
  color: var(--sys-color-on-surface-variant);
  margin-top: var(--sys-space-2);
  width: fit-content;
  font-size: var(--sys-typescale-meta);
  font-weight: 700;
}

.trophy-val {
  font-family: var(--sys-font-family-mono);
  font-weight: 700;
}

.badge {
  height: var(--sys-space-18);
  width: 100%;
  background: var(--sys-color-surface-container-highest);
  border-radius: var(--sys-shape-corner-badge);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--sys-typescale-label-md);
  font-weight: 800;
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-mono);
  text-transform: uppercase;
}

/* =========================================
   SCORE TINT SCALE (Data-Driven Gradient)
   ---------------------------------------------------------------------------
   Single, continuous OKLCH ramp within the brand's own primary hue, driven
   by the unitless --score-raw custom property (0-100) set by
   shared/utils/scoreTint.ts. A single linear mix (rather than multiple
   segments) gives constant slope across the whole range, so every point
   (not just the extremes) moves visibly for a small score delta.
   The old approach mixed two adjacent M3 *container* tones (primary vs.
   surface), which read as flat because container roles are deliberately
   low-chroma/high-lightness by design - close to each other regardless of
   hue. Widening to the full-strength primary token (instead of swapping
   hue) keeps this on-brand while giving the mix real tonal range to work
   with. OKLCH keeps that range perceptually uniform end to end; srgb
   mixing visibly desaturates the midpoint of a hue+neutral blend.
   Only applied via this class so score-less consumers keep their default
   surface fill.
   ========================================= */
.score-tint {
  background: color-mix(
    in oklch,
    var(--sys-color-primary) calc(var(--score-raw, 0) * 1%),
    var(--sys-color-surface-container-highest)
  );
}
/* Text switches (not fades) between the two ink tokens already paired with
   these fills elsewhere (e.g. .btn-primary uses primary/on-primary).
   A linear crossfade in lockstep with the background is wrong here: at the
   midpoint the mixed ink is mid-gray, which has near-1:1 contrast against
   the equally mid-lightness background at that same point. Instead this
   snaps hard at --score-text-switch, the one score % (see tokens.ts) where
   onSurface and onPrimary give equal contrast against the background -
   the best any two-ink choice can do, and the only point its own worst
   case is reached. clamp()'s huge multiplier turns a few tenths of a point
   of distance from that threshold into a 0%/100% cliff. */
.score-tint.badge {
  color: color-mix(
    in oklch,
    var(--sys-color-on-primary)
      clamp(0%, calc((var(--score-raw, 0) - var(--sys-color-score-text-switch, 50)) * 1000%), 100%),
    var(--sys-color-on-surface)
  );
}

.stat-score {
  font-size: var(--sys-typescale-score);
  font-weight: 950;
  font-family: var(--sys-font-family-mono);
  letter-spacing: var(--sys-tracking-tightest);
  z-index: 1;
}

.btn-action {
  flex: 1;
  height: var(--sys-space-48);
  border-radius: var(--sys-shape-corner-medium);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-8);
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
  font-weight: 700;
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: transform var(--sys-motion-duration-200), background-color var(--sys-motion-duration-200);
}
.btn-action:active { transform: scale(0.98); }
.btn-action.primary { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.btn-action.compact { font-size: var(--sys-typescale-body-sm); }

.role-leader { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.role-coleader { background: var(--sys-color-primary-container); color: var(--sys-color-on-primary-container); border: 1px solid rgba(var(--sys-color-primary-rgb), 0.2); }
.role-elder { background: var(--sys-color-secondary-container); color: var(--sys-color-on-secondary-container); }
.role-member { background: var(--sys-color-surface-container-highest); color: var(--sys-color-on-surface); border: 1px solid var(--sys-color-outline-variant); }

/* =========================================
   GLASS UI PRIMITIVES
   ========================================= */
.glass-panel {
  background: var(--sys-surface-glass);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--sys-shape-corner-l);
  padding: var(--sys-space-20);
  box-shadow: var(--sys-elevation-2);
  transition: opacity var(--sys-motion-duration-300) ease, transform var(--sys-motion-duration-200) ease;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: var(--sys-space-8);
  font-size: var(--sys-typescale-body-sm);
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: var(--sys-tracking-wide);
  opacity: 0.7;
  margin-bottom: var(--sys-space-20);
}

/* Field surface primitive (SSOT).
   Consumers supply their own dimensions via a sibling class; this rule owns only the
   surface, typeface and focus affordance. Previously declared byte-identically in both
   VoyageSetupForm.vue and DurationInput.vue, with a third divergent copy in
   NetworkSettings.vue, so the app rendered two different "glass" fields under one name. */
.glass-input {
  background: var(--sys-color-surface-container-highest);
  border: 1.5px solid transparent;
  border-radius: var(--sys-shape-corner-input);
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-mono);
  font-weight: 800;
  outline: none;
  transition: border-color var(--sys-motion-duration-200) ease,
    box-shadow var(--sys-motion-duration-200) ease;
}

.glass-input:focus {
  border-color: var(--sys-color-primary);
  box-shadow: 0 0 0 3px rgba(var(--sys-color-primary-rgb), 0.12);
}

.glass-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
`;
