
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

  const testThresholds = [0, 5000, 10000];
  const blacklistSet = new Set<string>();
  const W = CONFIG.HEADHUNTER.WEIGHTS;

  testThresholds.forEach(threshold => {
    try {
        console.log(`\n--- PROBE: minTrophies = ${threshold} ---`);
        const start = Date.now();
        const candidates = Registry.Services.Network.scanTournamentsRemote(
            realTags,
            threshold,
            blacklistSet,
            W
        );
        const duration = Date.now() - start;
        console.log(`Result: Found ${candidates.length} candidates in ${duration}ms.`);
        if (candidates.length > 0) {
            console.log(`Sample: ${candidates[0].tag} (${candidates[0].trophies} trophies)`);
        }
    } catch (e: any) {
        console.error(`PROBE ERROR at ${threshold}: ${e.message}`);
    }
  });
  
  console.log("\nProbe Completed.");
}

// Export for manual running if needed, or just copy-paste into GAS editor
// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
    module.exports = { probeRemoteWorker };
}
