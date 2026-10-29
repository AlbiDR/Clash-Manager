// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useToast } from "./useToast";
import { useRouter } from "vue-router";
// [CYCLE GUARD] Direct source import, NOT the @core barrel (avoids TDZ eval cycle).
import { cleanTag } from "../utils/text";

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
 * Satisfies ADR Section I (Core Services) & ADR Section III (Validation Boundaries).
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 */

/**
 * Return contract interface for `useShareTarget`.
 */
export interface UseShareTargetReturn {
  /** Main entry point for processing share intent parameters from URL query strings. */
  handleShareTarget: () => void;
}

/**
 * COMPOSABLE: useShareTarget
 *
 * @remarks
 * Listens for OS-level web share target payloads passed via URL search parameters,
 * extracts valid player tags, alerts the user, and navigates to the headhunter view.
 *
 * @returns Object conforming to `UseShareTargetReturn`.
 */
export function useShareTarget(): UseShareTargetReturn {
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
   * @sideeffects
   * - WRITES to `window.history` via `replaceState`.
   * - DISPATCHES toast notifications via `useToast`.
   * - TRIGGERS client-side navigation via `vue-router`.
   */
  function handleShareTarget() {
    const params = new URLSearchParams(window.location.search);
    const text = params.get("text") || params.get("title") || params.get("url");

    if (text) {
      // [THREAT:] Unsanitized user share input containing malformed or malicious query parameters.
      // [DECISION LOG] Match standard Clash Royale player tags (#XXXXXX or tag=XXXXXX) with 3 to 9 alphanumeric chars.
      const tagMatch = text.match(/(?:#|tag=)([0-9A-Z]{3,9})/i);

      if (tagMatch && tagMatch[1]) {
        const extractedTag = cleanTag(tagMatch[1]);
        success(`Shared Tag Found: #${extractedTag}`);

        // [THREAT:] Persistent share params causing infinite re-processing loops on manual page reloads.
        // [DECISION LOG] Clean URL by replacing history state before performing router redirection.
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );

        // Redirect to Recruiter with filter
        router.push({ path: "/headhunter", query: { pin: extractedTag } });
      }
    }
  }

  return {
    handleShareTarget,
  };
}
