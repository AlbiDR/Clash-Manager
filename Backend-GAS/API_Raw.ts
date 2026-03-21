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
declare const Registry: RegistryContract;

/**
 * Exports raw table data for the Worker Hub matrix.
 * 
 * @param e - The Web App request payload containing headers.
 * @returns Serialized JSON string and content type response.
 */
export const doGetRawFeed = (e: any): any => {
  // 1. Zero-Trust Token Boundary
  const authHeader = e?.parameter?.token; // GAS query parameter is e.parameter.key
  const envSecret = Registry.Services.Store.props.getString('REMOTE_WORKER_SECRET');

  if (!envSecret || authHeader !== envSecret) {
    return ContentService.createTextOutput(JSON.stringify({ 
      error: "Unauthorized", 
      layer: 'GAS_API_RAW' 
    }))
    .setMimeType(ContentService.MimeType.JSON); // GAS Web Apps always return 200/302/404; manual 401 is not supported via TextOutput
  }

  // 2. Fetch Raw Storage (Dumb Store)
  try {
    const rosterRows = Registry.Services.Database.fetchTable('Roster');
    const headhunterRows = Registry.Services.Database.fetchTable('Headhunter');
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

  } catch (err: any) {
    return ContentService.createTextOutput(JSON.stringify({
      error: "Store Connection Failed",
      details: err.message || String(err),
      layer: 'GAS_API_RAW'
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
};
