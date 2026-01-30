
/**
 * 🧪 SERVICE: WAR LOG TESTER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: A temporary service to validate the /warlog endpoint via
 * the remote worker and display results in the spreadsheet.
 * ----------------------------------------------------------------------------
 */

import type { AppConfig } from "./Configuration";
import type { IRegistry } from "./Registry";

declare const SpreadsheetApp: any;
declare const CONFIG: AppConfig;
declare const Registry: IRegistry;

/**
 * 🧪 SERVICE: WAR LOG TESTER (Ultra-Simple Edition)
 */
function runWarLogTest(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("WarHistory");

  if (!sheet) {
    sheet = ss.insertSheet("WarHistory");
  } else {
    sheet.clear();
  }

  try {
    let rawTag = CONFIG.SYSTEM.CLAN_TAG || "";
    if (rawTag.startsWith("#")) rawTag = rawTag.substring(1);
    const tag = encodeURIComponent(rawTag);
    const urlWarlog = `${CONFIG.SYSTEM.API_BASE}/clans/%23${tag}/warlog`;
    const urlRiverrace = `${CONFIG.SYSTEM.API_BASE}/clans/%23${tag}/riverracelog?limit=10`;

    Registry.Services.Core.logStep(1, 1, `Testing Warlog vs RiverRaceLog...`);
    
    const results = Registry.Services.Network.fetchRoyaleAPI([urlWarlog, urlRiverrace]);
    const dataWarlog = results[0];
    const dataRiverrace = results[1];

    sheet.getRange("A1").setValue("🧪 ENDPOINT COMPARISON TEST");
    
    // Result 1: Warlog
    sheet.getRange("A3").setValue("1. Endpoint: /warlog");
    sheet.getRange("B3").setValue(dataWarlog ? "✅ DATA RECEIVED" : "❌ NULL (404?)");
    if (dataWarlog) {
      sheet.getRange("A4").setValue(JSON.stringify(dataWarlog, null, 2).substring(0, 1000));
    }

    // Result 2: RiverRaceLog
    sheet.getRange("A6").setValue("2. Endpoint: /riverracelog");
    sheet.getRange("B6").setValue(dataRiverrace ? "✅ DATA RECEIVED" : "❌ NULL");
    if (dataRiverrace) {
      sheet.getRange("A7").setValue("Sample Data from /riverracelog:");
      sheet.getRange("A8").setValue(JSON.stringify(dataRiverrace, null, 2).substring(0, 2000));
    }

    Registry.Services.View.setStatusMessage(sheet, `Test complete. Warlog: ${dataWarlog ? 'OK' : 'FAIL'} | River: ${dataRiverrace ? 'OK' : 'FAIL'}`);

    Registry.Services.View.setStatusMessage(sheet, `Test complete: ${new Date().toLocaleTimeString()}`);

  } catch (e: any) {
    Registry.Services.Core.logReport("WARLOG_TEST_ERROR", [e.message]);
    if (sheet) sheet.getRange("A1").setValue(`Error: ${e.message}`);
  }
}

// Global Bridge
Object.assign(this as any, { runWarLogTest });
