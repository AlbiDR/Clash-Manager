
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

  // 1. Mock Data - Fetch Real Tournaments
  // Use a known high-volume keyword like "1k" or "a"
  const searchUrl = `${CONFIG.SYSTEM.API_BASE}/tournaments?name=1k`;
  console.log(`Fetching tournaments from: ${searchUrl}`);

  const discovery = Registry.Services.Network.fetchRoyaleAPI([searchUrl]);
  
  let realTags: string[] = [];
  if (discovery && discovery[0] && discovery[0].items) {
      realTags = discovery[0].items.map((t: any) => t.tag);
  }
  
  if (realTags.length === 0) {
      console.error("Probe failed: Could not fetch real tournaments. Response was empty.");
      if (discovery && discovery[0]) console.log("Response:", JSON.stringify(discovery[0]));
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
