
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
 * Executes the WarLog endpoint test.
 * Fetches data from the /warlog endpoint and writes it to a "WarHistory" sheet.
 */
function runWarLogTest(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("WarHistory");

  // 1. Prepare Sheet
  if (!sheet) {
    sheet = ss.insertSheet("WarHistory");
  } else {
    sheet.clear();
  }

  // 2. Fetch Data
  try {
    let rawTag = CONFIG.SYSTEM.CLAN_TAG || "";
    if (rawTag.startsWith("#")) rawTag = rawTag.substring(1);
    const tag = encodeURIComponent(rawTag);
    const url = `${CONFIG.SYSTEM.API_BASE}/clans/%23${tag}/warlog`;

    Registry.Services.Core.logStep(1, 1, `Fetching WarLog for #${rawTag}...`);
    
    const results = Registry.Services.Network.fetchRoyaleAPI([url]);
    const data = results[0];

    if (!data || !data.items) {
      throw new Error("No data received or invalid format.");
    }

    // 3. Transform & Write
    const headers = ["Created Date", "Season ID", "Rank", "Fame", "Opponent 1", "Score 1", "Opponent 2", "Score 2"];
    const rows: any[][] = [headers];

    data.items.forEach((item: any) => {
      const standings = item.standings || [];
      const ourClan = standings.find((s: any) => s.clan.tag === CONFIG.SYSTEM.CLAN_TAG);
      const opponents = standings.filter((s: any) => s.clan.tag !== CONFIG.SYSTEM.CLAN_TAG);

      const row = [
        item.createdDate,
        item.seasonId,
        ourClan ? ourClan.rank : "N/A",
        ourClan ? ourClan.clan.fame : 0
      ];

      opponents.forEach((opp: any) => {
        row.push(opp.clan.name);
        row.push(opp.clan.fame);
      });

      rows.push(row);
    });

    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

    // 4. Apply Aesthetics
    Registry.Services.View.applyStandardLayout(sheet, rows.length, rows[0].length, headers);
    Registry.Services.View.setStatusMessage(sheet, `Successfully fetched ${data.items.length} war entries.`);
    Registry.Services.Core.logReport("WARLOG_TEST", [`Fetched ${data.items.length} records.`]);

  } catch (e: any) {
    Registry.Services.Core.logReport("WARLOG_TEST_ERROR", [e.message]);
    if (sheet) {
      sheet.getRange("A1").setValue(`Error: ${e.message}`);
    }
  }
}

// Global Bridge
Object.assign(this as any, { runWarLogTest });
