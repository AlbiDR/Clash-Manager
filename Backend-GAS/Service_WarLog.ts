
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

    Registry.Services.Core.logStep(1, 1, `Probing Tag: #${cleanTag}`);
    
    const results = Registry.Services.Network.fetchRoyaleAPI([urlClanBase, urlPlayerBase, urlWarlog, urlRiverrace]);
    const dataClan = results[0];
    const dataPlayer = results[1];
    const dataWarlog = results[2];
    const dataRiverrace = results[3];

    sheet.getRange("A1").setValue("🧪 TAG DIAGNOSTIC TEST");
    sheet.getRange("A2").setValue(`Target Tag: #${cleanTag}`);
    
    // 🔍 PROBE 1: Is this a Clan?
    sheet.getRange("A4").setValue("1. Is this a CLAN tag?");
    sheet.getRange("B4").setValue(dataClan ? `✅ YES (${dataClan.name})` : "❌ NO (404)");

    // 🔍 PROBE 2: Is this a PLAYER?
    sheet.getRange("A5").setValue("2. Is this a PLAYER tag?");
    sheet.getRange("B5").setValue(dataPlayer ? `✅ YES (${dataPlayer.name})` : "❌ NO (404)");

    // 🔍 PROBE 3: Warlog
    sheet.getRange("A7").setValue("3. Endpoint: /warlog");
    sheet.getRange("B7").setValue(dataWarlog ? "✅ SUCCESS" : "❌ NULL");

    // 🔍 PROBE 4: RiverRaceLog
    sheet.getRange("A8").setValue("4. Endpoint: /riverracelog");
    sheet.getRange("B8").setValue(dataRiverrace ? "✅ SUCCESS" : "❌ NULL");

    if (!dataClan && dataPlayer) {
      sheet.getRange("A10").setValue("💡 TIP: You are using a PLAYER tag for CLAN endpoints. Change the tag in Script Properties to a Clan Tag.");
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
