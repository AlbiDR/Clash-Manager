// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useToast } from "./useToast";
import { useRouter } from "vue-router";

/**
 * SHARE TARGET SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Orchestrates the Web Share Target API integration.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This service handles incoming share intents from the OS (Android/PWA).
 * It extracts player tags from shared text/titles and redirects the user
 * to the appropriate view with filters applied.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 *
 * @returns
 * - `handleShareTarget`: Main entry point for processing share intent parameters.
 */
export function useShareTarget() {
  const router = useRouter();
  const { success } = useToast();

  /**
   * Processes incoming URL parameters from a share intent.
   *
   * @remarks
   * 1. PARSING: Extracts `text`, `title`, or `url` from search params.
   * 2. EXTRACTION: Uses regex to identify Clash Royale player tags (#XXXX or tag=XXXX).
   * 3. FEEDBACK: Dispatches a toast notification upon successful extraction.
   * 4. CLEANUP: Replaces the current history state to remove share parameters from the URL.
   * 5. NAVIGATION: Redirects to the Recruiter view with the extracted tag as a pin filter.
   *
   * @sideEffects
   * - WRITES to `window.history` via `replaceState`.
   * - DISPATCHES toast notifications via `useToast`.
   * - TRIGGERS client-side navigation via `vue-router`.
   */
  function handleShareTarget() {
    const params = new URLSearchParams(window.location.search);
    const text = params.get("text") || params.get("title") || params.get("url");

    if (text) {
      // Looks for #XXXXXX or tag=XXXXXX
      const tagMatch = text.match(/(?:#|tag=)([0-9A-Z]{3,9})/i);

      if (tagMatch && tagMatch[1]) {
        const extractedTag = tagMatch[1].toUpperCase();
        success(`Shared Tag Found: #${extractedTag}`);

        // Clean URL: Remove the share parameters from the browser history
        // to prevent re-triggering the logic on page reload.
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );

        // Redirect to Recruiter with filter
        router.push({ path: "/recruiter", query: { pin: extractedTag } });
      }
    }
  }

  return {
    handleShareTarget,
  };
}
