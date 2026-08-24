<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

<script setup lang="ts">
/**
 * [FEATURE] ABOUT SETTINGS
 * ----------------------------------------------------------------------------
 * Rationale: Provenance metadata, fan-content compliance, and operator contact surface.
 * Layer: @features/settings
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features)
 * - **Imports:** Consumes Layer 1 (@core) services and Layer 2 (@shared) UI primitives.
 * - **Satisfaction:** ADR Section I (SSOT, Componentization) and Section V (A11y).
 *
 * **Compliance Rationale:**
 * Supercell's Fan Content Policy requires third-party material built on their IP to
 * state that it is unofficial and not endorsed by Supercell. The app carried no such
 * notice anywhere in its UI or manifest while shipping Clash Royale naming,
 * terminology, and asset derivatives.
 *
 * [DECISION LOG] The notice is static card copy rather than a dismissible banner: a
 * notice the operator can permanently dismiss stops satisfying the attribution
 * requirement for every subsequent session.
 *
 * [DECISION LOG] This card introduces zero new visual vocabulary. The metadata strip
 * reuses the two-cell label/value grid established by System & Recovery, and every row
 * is the shared `LinkRow` primitive. An earlier revision invented a bespoke identity
 * header and a multi-paragraph legal block, neither of which had a counterpart in any
 * sibling card - which is precisely why it read as foreign inside the Settings stack.
 */
import { LinkRow, SettingsCard } from "@shared";
import { appVersion, useExternalLink } from "@core";

defineProps<{
  /**
   * Whether the about card should be initially expanded in the settings view.
   *
   * @defaultValue false
   */
  initiallyExpanded?: boolean;
}>();

const { openExternal } = useExternalLink();

/** Supercell's canonical policy URL, referenced by the compliance notice. */
const FAN_CONTENT_POLICY_URL = "https://supercell.com/en/fan-content-policy/";

/**
 * Operator contact and provenance destinations.
 *
 * @remarks
 * [DECISION LOG] The issue tracker leads: a bug report needs a routable destination,
 * and the repository root alone leaves the operator to locate one.
 */
const aboutLinks = [
  {
    label: "Report an Issue",
    desc: "Open a bug report or request a feature",
    url: "https://github.com/AlbiDR/Clash-Manager/issues/new",
    icon: "warning",
  },
  {
    label: "Source Code",
    desc: "Read, audit, or fork the project",
    url: "https://github.com/AlbiDR/Clash-Manager",
    icon: "github",
  },
  {
    label: "Fan Content Policy",
    desc: "Supercell's terms for third-party projects",
    url: FAN_CONTENT_POLICY_URL,
    icon: "shield",
  },
];
</script>

<template>
  <SettingsCard
    title="About"
    icon="info"
    :initially-expanded="initiallyExpanded"
  >
    <div class="about-body">
      <div class="about-meta">
        <div class="about-meta-cell">
          <span class="about-meta-label">Version</span>
          <strong class="about-meta-value">{{ appVersion }}</strong>
        </div>
        <div class="about-meta-cell">
          <span class="about-meta-label">Licence</span>
          <strong class="about-meta-value">GPL-3.0-only</strong>
        </div>
      </div>

      <div class="about-links">
        <LinkRow
          v-for="aboutLinkRecord in aboutLinks"
          :key="aboutLinkRecord.url"
          :label="aboutLinkRecord.label"
          :description="aboutLinkRecord.desc"
          :icon="aboutLinkRecord.icon"
          @click="openExternal(aboutLinkRecord.url)"
        />
      </div>

      <p class="about-notice">
        This material is unofficial and is not endorsed by Supercell. Clash Royale and
        Supercell are trademarks of Supercell Oy.
      </p>
    </div>
  </SettingsCard>
</template>

<style scoped>
.about-body {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-16);
}

/* Mirrors the label/value metadata grid established by System & Recovery. */
.about-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sys-space-10);
}

.about-meta-cell {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-4);
  min-width: 0;
}

.about-meta-label {
  font-size: var(--sys-typescale-label-sm);
  font-weight: 900;
  color: var(--sys-color-on-surface-variant);
  text-transform: uppercase;
  line-height: 1;
}

.about-meta-value {
  min-width: 0;
  overflow: hidden;
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-meta);
  font-weight: 850;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.about-links {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-16);
}

.about-notice {
  margin: 0;
  font-size: var(--sys-typescale-footer);
  font-weight: 500;
  line-height: 1.5;
  color: var(--sys-color-outline);
  opacity: 0.8;
}
</style>
