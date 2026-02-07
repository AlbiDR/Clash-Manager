
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

  // TEST SCORING COMPATIBILITY
  // Since threshold is NOT the issue (0 yield at 0 trophies), we test the Payload.
  const W = CONFIG.HEADHUNTER.WEIGHTS;
  const variants = [
      { name: "Default (Current Config)", scoring: W },
      { name: "Null Scoring (Worker Defaults)", scoring: null }
  ];
  
  const testThreshold = 1; // Test 1 instead of 0 to rule out falsy-check bugs (val || default) on worker
  const blacklistSet = new Set<string>();

  variants.forEach(v => {
    try {
        console.log(`\n--- PROBE: ${v.name} ---`);
        const start = Date.now();
        // Manually construct the call to control the 'scoring' arg
        // We can't use Network.scanTournamentsRemote directly because it pulls from CONFIG
        // So we must mock the Network call or modify the probe to allow passing scoring.
        // Actually, Network.scanTournamentsRemote takes 'weights' as the 4th arg!
        
        const candidates = Registry.Services.Network.scanTournamentsRemote(
            realTags,
            testThreshold,
            blacklistSet,
            v.scoring // Pass the variant scoring
        );
        const duration = Date.now() - start;
        console.log(`Result: Found ${candidates.length} candidates in ${duration}ms.`);
        if (candidates.length > 0) {
            console.log(`Sample: ${candidates[0].tag} score=${candidates[0].rawScore}`);
        }
    } catch (e: any) {
        console.error(`PROBE ERROR at ${v.name}: ${e.message}`);
    }
  });
  
  console.log("\nProbe Completed.");
}

// Export for manual running if needed, or just copy-paste into GAS editor
// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
    module.exports = { probeRemoteWorker };
}
