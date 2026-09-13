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

/* [DECISION LOG] REDUCED MOTION SUBSTITUTES A FADE, IT DOES NOT SUBTRACT:
   Two earlier versions of this block were wrong in opposite directions. The
   first set every duration to 1ms, which is not calm, it is a glitch: a change
   that takes no time reads as a rendering fault and the reader loses any sense
   that one thing became another. The second merely compressed the durations,
   which keeps every slide and scale and just runs them faster - the movement is
   the part that provokes, so making it quicker does not help.

   macOS is the reference here: with the preference set it turns animations into
   fades. It does not accelerate them and it does not remove them. That is what
   this does. Transform is deliberately absent from the transition-property list
   below, so nothing slides, scales or rotates; an element arrives at its new
   position directly and opacity carries the change instead. Durations are left
   at their normal values, because a fade needs its full length to read as one.

   [THREAT:] Zeroing a duration also suppresses transitionend and animationend,
   so a handler waiting on either never resumes. Nothing here is zeroed. */
@media (prefers-reduced-motion: reduce) {
  :root {
    /* The overshoot is the provoking part of a spring, so every springy curve
       flattens. Durations are untouched. */
    --sys-motion-spring:                  ease;
    --sys-motion-easing-spring-overshoot: ease;
    --sys-motion-easing-spring-nav:       ease;
  }

  /* Everything that can crossfade still does. Everything that would travel no
     longer transitions at all, so it simply arrives. */
  *,
  *::before,
  *::after {
    transition-property:
      opacity, color, background-color, border-color, outline-color,
      box-shadow, fill, stroke, height !important;
    scroll-behavior: auto !important;
  }

  /* The one global keyframe that travels becomes the fade it should have been.
     Redefining the keyframe reaches every consumer without any of them opting
     in. */
  @keyframes pop-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* Motion that loops without anyone asking for it settles after one pass.
     These keyframes all begin and end at their resting values, so the element
     is left where it belongs rather than frozen mid-gesture. */
  *,
  *::before,
  *::after {
    animation-iteration-count: 1 !important;
  }

  /* Progress indicators are the documented exception, and macOS keeps them too:
     a spinner is small, local, and the only thing on screen saying work is
     still happening. Stopping it reads as an app that has hung. */
  .spinner,
  .spinner-small,
  .ptr-icon,
  [class*="spinner"] {
    animation-iteration-count: infinite !important;
  }
}
`;
