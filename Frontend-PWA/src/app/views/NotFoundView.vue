<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * VIEW: NotFoundView
 * ----------------------------------------------------------------------------
 * Rationale: Terminal fallback screen for any hash that matches no route record.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 4 (@app) - navigation orchestration.
 * - **Satisfaction:** ADR Section IV (Resilience and Graceful Degradation),
 *   ADR Section V (A11y: 48px minimum touch footprint).
 *
 * [DECISION LOG] Lives in Layer 4 rather than Layer 2. This view reads router state via
 * `useRoute()`, which makes it neither domain-blind nor stateless; placing it in
 * `@shared/ui` would have put a framework-coupled, route-aware component inside the
 * layer the ADR reserves for domain-blind primitives. Navigation is Layer 4's mandate,
 * and the route table that references this view lives beside it.
 *
 * **Threat Mitigation:**
 * Before this view existed the router declared no catch-all, so an unmatched hash
 * rendered an empty `<RouterView>` beneath a live FloatingDock: a blank console with no
 * error, no diagnosis, and no way back. That state is reachable without a typo -
 * `manifest.json` registers a `share_target` and a `web+clash` protocol handler which
 * both write external input straight into the hash segment.
 *
 * [DECISION LOG] The offending path is echoed back rather than silently redirected, so
 * a malformed deep link stays diagnosable by the operator who received it.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Icon } from "@shared";

/**
 * Maximum rendered length of the unmatched path.
 *
 * @remarks
 * A presentation guard, not a business threshold: the path is attacker-influencable
 * through the share and protocol handlers, and an unbounded string would break the
 * panel's layout.
 */
const PATH_DISPLAY_LIMIT = 96;

const route = useRoute();

/**
 * The unmatched path, clamped for display.
 *
 * @remarks
 * Vue's mustache interpolation escapes the value as text, so markup in the path is
 * rendered inert rather than parsed.
 */
const attemptedPath = computed(() => {
  const requestedPath = route.fullPath || "/";
  return requestedPath.length > PATH_DISPLAY_LIMIT
    ? `${requestedPath.slice(0, PATH_DISPLAY_LIMIT)}...`
    : requestedPath;
});
</script>

<template>
  <div class="not-found-view">
    <section class="nf-panel" role="alert" aria-labelledby="nf-title">
      <span class="nf-badge">
        <Icon name="warning" size="12" />
        <span>404</span>
      </span>

      <h1 id="nf-title" class="nf-title">This link has no console</h1>

      <p class="nf-body">
        The address does not match any Clash Manager screen. It may come from an older
        version of the app or a truncated share link.
      </p>

      <div class="nf-route">
        <span class="nf-route-label">Requested Route</span>
        <code class="nf-route-value">{{ attemptedPath }}</code>
      </div>

      <RouterLink to="/roster" class="nf-action" v-tactile>
        <Icon name="roster" size="18" />
        <span>Return to Roster</span>
      </RouterLink>
    </section>
  </div>
</template>

<style scoped>
.not-found-view {
  /* Matches the horizontal inset used by the Settings and Laboratory consoles so the
     panel's edges line up with every other screen in the shell. */
  padding: var(--sys-space-20) var(--sys-space-16);
}

.nf-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sys-space-14);
  padding: var(--sys-space-28) var(--sys-space-24);
  background: var(--sys-color-surface-container);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--sys-shape-corner-l);
}

.nf-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sys-space-6);
  padding: var(--sys-space-4) var(--sys-space-8);
  border-radius: var(--sys-shape-corner-badge);
  background: color-mix(in srgb, var(--sys-color-primary) 12%, transparent);
  color: var(--sys-color-primary);
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-label-sm);
  font-weight: 900;
  letter-spacing: var(--sys-tracking-wide);
  text-transform: uppercase;
}

.nf-title {
  margin: 0;
  font-size: var(--sys-typescale-title-lg);
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--sys-color-on-surface);
}

.nf-body {
  margin: 0;
  max-width: 46ch;
  font-size: var(--sys-typescale-body-md);
  line-height: 1.55;
  color: var(--sys-color-on-surface-variant);
}

.nf-route {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-6);
  width: 100%;
  min-width: 0;
  padding-top: var(--sys-space-4);
}

.nf-route-label {
  font-size: var(--sys-typescale-label-sm);
  font-weight: 900;
  text-transform: uppercase;
  line-height: 1;
  color: var(--sys-color-on-surface-variant);
}

.nf-route-value {
  min-width: 0;
  padding: var(--sys-space-8) var(--sys-space-10);
  border-radius: var(--sys-shape-corner-small);
  background: var(--sys-color-surface-container-highest);
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-meta);
  font-weight: 700;
  line-height: 1.4;
  color: var(--sys-color-on-surface);
  overflow-wrap: anywhere;
}

.nf-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-8);
  min-height: var(--sys-space-48); /* 48px Mobile Footprint (Target B.2) */
  margin-top: var(--sys-space-2);
  padding: 0 var(--sys-space-24);
  border-radius: var(--sys-shape-corner-full);
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  font-size: var(--sys-typescale-body-md);
  font-weight: 850;
  text-decoration: none;
  transition: transform var(--sys-motion-duration-200) var(--sys-motion-spring);
}

.nf-action:active {
  transform: scale(0.97);
}
</style>
