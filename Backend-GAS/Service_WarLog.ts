
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
    const url = `${CONFIG.SYSTEM.API_BASE}/clans/%23${tag}/warlog`;

    Registry.Services.Core.logStep(1, 1, `Fetching: ${url}`);
    
    const results = Registry.Services.Network.fetchRoyaleAPI([url]);
    const data = results[0];

    if (!data) {
      throw new Error(`API returned null for ${url}. Worker might be down or endpoint invalid.`);
    }

    // SIMPLICITY FIRST: If items exist, draw table. Else, dump raw JSON.
    if (data.items && Array.isArray(data.items)) {
      const headers = ["Created Date", "Season ID", "Rank", "Fame", "Opponents..."];
      const rows: any[][] = [headers];

      data.items.forEach((item: any) => {
        const standings = item.standings || [];
        const ourClan = standings.find((s: any) => s.clan.tag === `#${rawTag}`);
        const row = [
          item.createdDate,
          item.seasonId,
          ourClan ? ourClan.rank : "N/A",
          ourClan ? ourClan.clan.fame : 0
        ];
        standings.filter((s: any) => s.clan.tag !== `#${rawTag}`).forEach((s: any) => {
          row.push(`${s.clan.name} (${s.clan.fame})`);
        });
        rows.push(row);
      });

      sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
      Registry.Services.View.applyStandardLayout(sheet, rows.length, rows[0].length, headers);
    } else {
      // RAW DUMP
      sheet.getRange("A1").setValue("⚠️ STRUCTURE MISMATCH - RAW DATA BELOW:");
      sheet.getRange("A2").setValue(JSON.stringify(data, null, 2).substring(0, 50000));
      Registry.Services.View.setStatusMessage(sheet, "Fetched data but structure is unexpected.");
    }

    Registry.Services.View.setStatusMessage(sheet, `Test complete: ${new Date().toLocaleTimeString()}`);

  } catch (e: any) {
    Registry.Services.Core.logReport("WARLOG_TEST_ERROR", [e.message]);
    if (sheet) sheet.getRange("A1").setValue(`Error: ${e.message}`);
  }
}

// Global Bridge
Object.assign(this as any, { runWarLogTest });
