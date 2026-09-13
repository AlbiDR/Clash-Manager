// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * CLASH MANAGER - Global Animations
 * Ported to TypeScript for Technical Purity.
 */
export const animationStyles = `
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

@keyframes pop-in {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.animate-pop {
  animation: pop-in 0.4s var(--sys-motion-spring);
}

/* [DECISION LOG] ONE GLOBAL REDUCED-MOTION GUARD:
   This sheet is injected once at app/main.ts and is not scoped, so a universal
   selector here reaches every component's scoped rules as well. Honouring the
   preference per component would mean 31 separate media blocks that a new
   component silently opts out of by being written; a single guard cannot be
   forgotten.

   [THREAT:] Zeroing the durations outright would suppress the animationend and
   transitionend events, and any handler waiting on one would never resume. 1ms
   keeps the whole event sequence intact while removing the perceived motion. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
`;
