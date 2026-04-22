// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * [API] RAW FEED (WORKER HUB INGRESS)
 * ----------------------------------------------------------------------------
 * A minimalist entry point exposing untransformed spreadsheet rows.
 * Designed exclusively for ingestion by the Render Worker's PayloadKernel.
 * ============================================================================
 */

import type { RegistryContract } from "./Registry";
import { CONFIG } from "./Configuration";
import * as v from "valibot";
import { GasGetEventSchema, HubErrorSchema } from "./Validation";

declare const Registry: RegistryContract;
declare const SpreadsheetApp: any;
declare const ContentService: any;

/**
 * Exports raw table data for the Worker Hub matrix.
 * 
 * @remarks
 * This endpoint serves as the primary ingress for the Render Worker's
 * PayloadKernel. It bypasses the standard WebappController to provide
 * untransformed matrix data for high-performance processing.
 *
 * @param requestEvent - The Web App request payload containing parameters.
 * @returns Serialized JSON string and content type response.
 */
export const doGetRawFeed = (requestEvent: unknown): any => {
  // [GUARD] VALIDATION BOUNDARY: Target B [1]
  // THREAT: Malformed request parameters causing unexpected behavior or
  // bypassing the zero-trust token boundary.
  const validation = v.safeParse(GasGetEventSchema, requestEvent);
  if (!validation.success) {
    return ContentService.createTextOutput(JSON.stringify({
      error: "Invalid Request",
      details: validation.issues,
      layer: 'GAS_API_RAW'
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }

  const { parameter } = validation.output;

  // 1. Zero-Trust Token Boundary
  // THREAT: Unauthorized data exfiltration if the token is leaked or bypassed.
  // Target A [1]: Validating the token from the environment ensures only
  // authorized workers can access the raw spreadsheet data.
  const authHeader = parameter.token;
  const envSecret = Registry.Services.Store.props.get('REMOTE_WORKER_SECRET');

  if (!envSecret || authHeader !== envSecret) {
    return ContentService.createTextOutput(JSON.stringify({ 
      error: "Unauthorized", 
      layer: 'GAS_API_RAW' 
    }))
    .setMimeType(ContentService.MimeType.JSON); // GAS Web Apps always return 200/302/404; manual 401 is not supported via TextOutput
  }

  // 2. Fetch Raw Storage (Dumb Store)
  try {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    const rosterSheetInstance = activeSpreadsheet.getSheetByName(CONFIG.SHEETS.ROSTER);
    const rosterRows = rosterSheetInstance ? rosterSheetInstance.getDataRange().getValues() : [];

    const headhunterSheetInstance = activeSpreadsheet.getSheetByName(CONFIG.SHEETS.HH);
    const headhunterRows = headhunterSheetInstance ? headhunterSheetInstance.getDataRange().getValues() : [];
    // Extend with other tables as needed for matrix generation

    const rawPayload = {
      timestamp: new Date().toISOString(),
      source: "GAS_RAW_STORE",
      tables: {
        roster: rosterRows,
        headhunter: headhunterRows
      }
    };

    return ContentService.createTextOutput(JSON.stringify(rawPayload))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (rawFeedError: unknown) {
    // THREAT: Silent crash or leaked internal state on storage failure.
    // Rationale: Consistent error extraction prevents the "any Plague" from leaking.
    const errorMessage = getErrorMessage(rawFeedError);
    return ContentService.createTextOutput(JSON.stringify({
      error: "Store Connection Failed",
      details: errorMessage,
      layer: 'GAS_API_RAW'
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
};

/**
 * [GUARD] ERROR MESSAGE EXTRACTION
 *
 * @remarks
 * Safely extracts an error message from an unknown error object.
 * Consistent with Backend-Worker error handling patterns.
 */
function getErrorMessage(errorPayload: unknown): string {
  const errorValidation = v.safeParse(HubErrorSchema, errorPayload);
  if (errorValidation.success) {
    return errorValidation.output.message;
  }

  if (errorPayload instanceof Error) return errorPayload.message;
  return String(errorPayload);
}
