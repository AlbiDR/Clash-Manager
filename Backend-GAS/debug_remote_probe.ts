
import { CONFIG } from './Configuration';
import Registry from './Registry';

/**
 * DEBUG SCRIPT: Remote Worker Probe
 * Usage: Run this function manually to diagnose worker behavior.
 */
function probeRemoteWorker() {
  console.log("Starting Remote Worker Probe...");

  if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) {
    console.error("No Remote Worker URL configured.");
    return;
  }

  // 1. Mock Data - Fetch Real Tournaments from Configured Keywords
  const keywords = CONFIG.HEADHUNTER.KEYWORDS.slice(0, 5); // Use first 5 keywords
  const searchUrls = keywords.map(k => `${CONFIG.SYSTEM.API_BASE}/tournaments?name=${encodeURIComponent(k)}`);
  
  console.log(`Fetching tournaments for keywords: ${keywords.join(", ")}`);
  const responses = Registry.Services.Network.fetchRoyaleAPI(searchUrls);
  
  let realTags: string[] = [];
  responses.forEach((r: any) => {
      if (r && r.items) {
          r.items.forEach((t: any) => realTags.push(t.tag));
      }
  });
  
  if (realTags.length === 0) {
      console.error("Probe failed: Could not fetch real tournaments. Response was empty.");
      if (responses && responses[0]) console.log("Response:", JSON.stringify(responses[0]));
      return;
  }
  
  console.log(`Probe: Testing with ${realTags.length} real tournaments.`);

  // TEST PAYLOAD VARIANTS
  const variants = [
      { name: "Default (tags)", payload: { tags: realTags, apiKeys: CONFIG.SYSTEM.API_KEYS.map((k: any) => k.value), minTrophies: 1, scoring: W } },
      { name: "Naming (tournamentTags)", payload: { tournamentTags: realTags, apiKeys: CONFIG.SYSTEM.API_KEYS.map((k: any) => k.value), minTrophies: 1, scoring: W } },
      { name: "Batch Size (Single Tag)", payload: { tags: [realTags[0]], apiKeys: CONFIG.SYSTEM.API_KEYS.map((k: any) => k.value), minTrophies: 1, scoring: W } },
      { name: "Snake Case (api_keys, min_trophies)", payload: { tags: realTags, api_keys: CONFIG.SYSTEM.API_KEYS.map((k: any) => k.value), min_trophies: 1, scoring: W } }
  ];
  
  const W = CONFIG.HEADHUNTER.WEIGHTS;
  const blacklistSet = new Set<string>();

  variants.forEach(v => {
    try {
        console.log(`\n--- PROBE: ${v.name} ---`);
        const start = Date.now();
        
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET) headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

        const res = UrlFetchApp.fetch(`${CONFIG.SYSTEM.REMOTE_WORKER_URL}/scan`, {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(v.payload),
            muteHttpExceptions: true,
            headers: headers
        });

        const duration = Date.now() - start;
        const code = res.getResponseCode();
        const text = res.getContentText();
        console.log(`[WORKER_RAW] Code: ${code} | Body: ${text.substring(0, 100)}`);
        
        const json = JSON.parse(text);
        const count = (json.candidates || []).length;
        console.log(`Result: Found ${count} candidates in ${duration}ms.`);
    } catch (e: any) {
        console.error(`PROBE ERROR at ${v.name}: ${e.message}`);
    }
  });
  
  console.log("\n--- PROBE: API Key Audit ---");
  try {
      const keysToAudit = CONFIG.SYSTEM.API_KEYS;
      console.log(`Auditing ${keysToAudit.length} keys via remote worker...`);
      const auditResults = Registry.Services.Network.auditKeysRemote(keysToAudit);
      if (!auditResults) {
          console.error("Audit failed: Worker returned null or error.");
      } else {
          const successCount = auditResults.filter((r: any) => r.success).length;
          console.log(`Audit Results: ${successCount}/${auditResults.length} keys successful.`);
          auditResults.forEach((r: any) => {
              if (!r.success) console.warn(`Key "${r.name}" failed: ${r.error || "Unknown"}`);
          });
      }
  } catch (e: any) {
      console.error(`Audit Exception: ${e.message}`);
  }
  
  console.log("\nProbe Completed.");
}

// Export for manual running if needed, or just copy-paste into GAS editor
// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
    module.exports = { probeRemoteWorker };
}
