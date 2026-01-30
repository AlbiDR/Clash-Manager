
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
    const apiBase = CONFIG.SYSTEM.API_BASE;

    // Test Matrix: With vs Without %23 prefix
    const urlClanNoHash = `${apiBase}/clans/${tag}`;
    const urlClanHash = `${apiBase}/clans/%23${tag}`;
    const urlRiverNoHash = `${apiBase}/clans/${tag}/riverracelog?limit=1`;
    const urlWarNoHash = `${apiBase}/clans/${tag}/warlog`;

    console.info(`[Probing] Tag: ${cleanTag}`);
    console.info(`[URL 1] No Hash Clan: ${urlClanNoHash}`);
    console.info(`[URL 2] Hash Clan: ${urlClanHash}`);

    const results = Registry.Services.Network.fetchRoyaleAPI([urlClanNoHash, urlClanHash, urlRiverNoHash, urlWarNoHash]);
    const dataClanNo = results[0];
    const dataClanYes = results[1];
    const dataRiver = results[2];
    const dataWar = results[3];

    sheet.getRange("A1").setValue("🧪 URL FORMAT DIAGNOSTIC");
    sheet.getRange("A2").setValue(`Tag: ${cleanTag} | Base: ${apiBase}`);
    
    sheet.getRange("A4").setValue("1. Clan Info (NO #)");
    sheet.getRange("B4").setValue(dataClanNo ? `✅ SUCCESS (${dataClanNo.name})` : "❌ FAIL");

    sheet.getRange("A5").setValue("2. Clan Info (WITH #)");
    sheet.getRange("B5").setValue(dataClanYes ? `✅ SUCCESS (${dataClanYes.name})` : "❌ FAIL");

    sheet.getRange("A7").setValue("3. River Log (NO #)");
    sheet.getRange("B7").setValue(dataRiver ? "✅ SUCCESS" : "❌ FAIL");

    sheet.getRange("A8").setValue("4. War Log (NO #)");
    sheet.getRange("B8").setValue(dataWar ? "✅ SUCCESS" : "❌ FAIL");

    console.info(`[Result] ClanNo: ${!!dataClanNo}, ClanYes: ${!!dataClanYes}, River: ${!!dataRiver}, War: ${!!dataWar}`);

    if (!dataRiver && dataClanNo) {
      console.warn("Hypothesis: Clan exists but has no war history, or endpoints are legacy.");
    }

    Registry.Services.View.setStatusMessage(sheet, `Test DONE. Check console for details.`);

  } catch (e: any) {
    console.error(`[CRITICAL] ${e.message}`);
    Registry.Services.Core.logReport("WARLOG_TEST_ERROR", [e.message]);
    if (sheet) sheet.getRange("A1").setValue(`Error: ${e.message}`);
  }
}

// Global Bridge
Object.assign(this as any, { runWarLogTest });
