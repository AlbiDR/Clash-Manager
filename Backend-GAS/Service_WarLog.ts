
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
    const rawTag = CONFIG.SYSTEM.CLAN_TAG || "";
    let cleanTag = rawTag.trim().toUpperCase();
    if (cleanTag.startsWith("#")) cleanTag = cleanTag.substring(1);
    
    const tag = encodeURIComponent(cleanTag);
    
    const urlClanBase = `${CONFIG.SYSTEM.API_BASE}/clans/%23${tag}`;
    const urlPlayerBase = `${CONFIG.SYSTEM.API_BASE}/players/%23${tag}`;
    const urlWarlog = `${CONFIG.SYSTEM.API_BASE}/clans/%23${tag}/warlog`;
    const urlRiverrace = `${CONFIG.SYSTEM.API_BASE}/clans/%23${tag}/riverracelog?limit=5`;
    const refTag = "L98YCP";
    const urlRefRiver = `${CONFIG.SYSTEM.API_BASE}/clans/%23${refTag}/riverracelog?limit=1`;
    const urlRefWar = `${CONFIG.SYSTEM.API_BASE}/clans/%23${refTag}/warlog`;

    Registry.Services.Core.logStep(1, 1, `Probing Tag: #${cleanTag} + Reference: #${refTag}`);
    
    const results = Registry.Services.Network.fetchRoyaleAPI([urlClanBase, urlPlayerBase, urlWarlog, urlRiverrace, urlRefRiver, urlRefWar]);
    const dataClan = results[0];
    const dataPlayer = results[1];
    const dataWarlog = results[2];
    const dataRiverrace = results[3];
    const dataRefRiver = results[4];
    const dataRefWar = results[5];

    sheet.getRange("A1").setValue("🧪 TAG DIAGNOSTIC TEST");
    sheet.getRange("A2").setValue(`Target Tag: #${cleanTag}`);
    
    // 🔍 PROBE 1: Is this a Clan?
    sheet.getRange("A4").setValue("1. Is this a CLAN tag?");
    sheet.getRange("B4").setValue(dataClan ? `✅ YES (${dataClan.name})` : "❌ NO (404)");

    // 🔍 PROBE 2: War History Connectivity
    sheet.getRange("A6").setValue(`2. Connectivity Check (Ref: #${refTag})`);
    sheet.getRange("B6").setValue(dataRefRiver ? "✅ /riverracelog WORKS" : "❌ /riverracelog FAILS");
    sheet.getRange("C6").setValue(dataRefWar ? "✅ /warlog WORKS" : "❌ /warlog FAILS");

    // 🔍 PROBE 3: Target Clan War Status
    sheet.getRange("A8").setValue(`3. Target War Data (#${cleanTag})`);
    sheet.getRange("B8").setValue(dataRiverrace ? "✅ Found River Log" : "❌ No River Log (Clan likely inactive in wars)");
    sheet.getRange("C8").setValue(dataWarlog ? "✅ Found War Log" : "❌ No War Log");

    if (dataRefRiver && !dataRiverrace) {
      sheet.getRange("A10").setValue("💡 CONCLUSION: Connectivity is fine, but TONYeSOSA CORP has no war history data in the API.");
    }

    Registry.Services.View.setStatusMessage(sheet, `Probe complete. Clan: ${dataClan ? 'YES' : 'NO'} | Player: ${dataPlayer ? 'YES' : 'NO'}`);

    Registry.Services.View.setStatusMessage(sheet, `Test complete: ${new Date().toLocaleTimeString()}`);

  } catch (e: any) {
    Registry.Services.Core.logReport("WARLOG_TEST_ERROR", [e.message]);
    if (sheet) sheet.getRange("A1").setValue(`Error: ${e.message}`);
  }
}

// Global Bridge
Object.assign(this as any, { runWarLogTest });
