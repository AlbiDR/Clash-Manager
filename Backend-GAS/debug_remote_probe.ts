
import type { AppConfig } from "./Configuration";
import type { IRegistry } from "./Registry";

declare var UrlFetchApp: any;
declare const CONFIG: AppConfig;
declare const Registry: IRegistry;

/**
 * TOURNAMENT SCAN PROBE (FINAL DIAGNOSTIC)
 * 
 * Purpose: Isolate why /scan yields 0 despite healthy handshake and keys.
 * logic: Tests RoyaleAPI behavior vs Worker logic.
 */

function probeRemoteWorkerDefinitive() {
  console.log("Starting Definitive Remote Worker Probe...");
  
  // 1. Fetch Real Tournaments from Configured Keywords
  const keywords = CONFIG.HEADHUNTER.KEYWORDS.slice(0, 5); 
  const searchUrls = keywords.map((k: string) => `${CONFIG.SYSTEM.API_BASE}/tournaments?name=${encodeURIComponent(k)}`);
  
  console.log(`Fetching tournaments for keywords: ${keywords.join(", ")}`);
  const responses = Registry.Services.Network.fetchRoyaleAPI(searchUrls);
  
  let tagsWithHash: string[] = [];
  responses.forEach((r: any) => {
      if (r && r.items) {
          r.items.forEach((t: any) => tagsWithHash.push(t.tag));
      }
  });

  if (tagsWithHash.length === 0) {
      console.error("No active tournaments found. Aborting probe.");
      return;
  }
  
  const tagsStripped = tagsWithHash.map(t => t.replace("#", ""));
  const keys = CONFIG.SYSTEM.API_KEYS.map((k: any) => k.value);
  const W = CONFIG.HEADHUNTER.WEIGHTS;

  const variants = [
      { 
          name: "Variant A: Public Scan (No Keys, Tags With #)", 
          endpoint: "/public/scan",
          payload: { tags: tagsWithHash, minTrophies: 1 } 
      },
      { 
          name: "Variant B: Public Scan (No Keys, Tags Stripped)", 
          endpoint: "/public/scan",
          payload: { tags: tagsStripped, minTrophies: 1 } 
      },
      { 
          name: "Variant C: Standard Scan (With Keys, Tags With #)", 
          endpoint: "/scan",
          payload: { tags: tagsWithHash, apiKeys: keys, minTrophies: 1, scoring: W } 
      },
      { 
          name: "Variant D: Standard Scan (With Keys, Tags Stripped)", 
          endpoint: "/scan",
          payload: { tags: tagsStripped, apiKeys: keys, minTrophies: 1, scoring: W } 
      }
  ];

  variants.forEach(v => {
    try {
        console.log(`\n--- PROBE: ${v.name} ---`);
        const start = Date.now();
        
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET) headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

        const res = UrlFetchApp.fetch(`${CONFIG.SYSTEM.REMOTE_WORKER_URL}${v.endpoint}`, {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(v.payload),
            muteHttpExceptions: true,
            headers: headers
        });

        const duration = Date.now() - start;
        const code = res.getResponseCode();
        const text = res.getContentText();
        
        console.log(`[WORKER_RAW] Code: ${code} | Time: ${duration}ms | Length: ${text.length}`);
        if (code === 200) {
            const json = JSON.parse(text);
            const count = (json.candidates || []).length;
            const debug = json._debug || {};
            
            console.log(`Result: Found ${count} candidates. (Phase 1: ${debug.phase1 || 0}, Phase 2: ${debug.phase2 || 0})`);
            if (count > 0) {
                console.log(`Sample Recruit: ${json.candidates[0].tag} (${json.candidates[0].name})`);
            }
        } else {
            console.error(`Error Payload: ${text.substring(0, 200)}`);
        }
    } catch (e: any) {
        console.error(`Exception: ${e.message}`);
    }
  });

  console.log("\nProbe Completed.");
}
