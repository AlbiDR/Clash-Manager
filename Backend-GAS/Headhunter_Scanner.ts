
import { CONFIG } from './Configuration';
import Registry from './Registry';
import RosterStore from './Roster_Store';
import { BattleLogProcessor, AnalysisGoal } from './Service_BattleLog';
import type { Recruit, TournamentResult, TournamentMember } from './Headhunter_Types';

/**
 * ============================================================================
 * MODULE: HEADHUNTER SCANNER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Discovery engine for finding new recruits.
 *    Handles Tournament Searching -> Lottery -> Member Scanning -> Profiling.
 * ============================================================================
 */

export interface IHeadhunterScanner {
  scanTournaments(
    minTrophies: number,
    existingRecruits: Map<string, Recruit>,
    blacklistSet: Set<string>,
    lowQuotaMode?: boolean
  ): Recruit[];
}

const HeadhunterScanner: IHeadhunterScanner = {
  
  scanTournaments(
    minTrophies: number,
    existingRecruits: Map<string, Recruit>,
    blacklistSet: Set<string>,
    lowQuotaMode: boolean = false
  ): Recruit[] {
    const W = CONFIG.HEADHUNTER.WEIGHTS;
    const keywords = CONFIG.HEADHUNTER.KEYWORDS; 
    const searchUrls = keywords.map(
      (k: string) => `${CONFIG.SYSTEM.API_BASE}/tournaments?name=${k}`,
    );

    // 1. Discovery: Find Tournaments
    const searchResults: any[] = Registry.Services.Network.fetchRoyaleAPI(searchUrls);
    const uniqueTourneys = new Map<string, TournamentResult>();
    searchResults.forEach((res: TournamentResult) => {
      if (res && res.items)
        res.items.forEach((t: TournamentResult) => uniqueTourneys.set(t.tag, t));
    });
    console.info(`Discovery: Found ${uniqueTourneys.size} unique tournaments across ${keywords.length} keywords.`);

    // 2. Worker Handshake
    const remoteAvailable = Registry.Services.Network.remoteWorkerHealthy(true);
    const remoteExpandEnabled = Registry.Services.Store.props.get("HH_REMOTE_EXPAND", "1") === "1";

    if (!remoteAvailable) {
      const lastErr = Registry.Services.Network.getLastWorkerError();
      console.warn(`Remote worker offline: ${lastErr || "Unknown"}. Falling back to local mode (throttled).`);
      lowQuotaMode = true;
    }

    const scanCfg =
      remoteAvailable && remoteExpandEnabled
        ? CONFIG.HEADHUNTER.DEEP_SCAN.REMOTE
        : CONFIG.HEADHUNTER.DEEP_SCAN.LOCAL;

    // 3. Configuration & Pool Limits
    const lotteryLimit = scanCfg.TOURNEYS || 300;
    const playerLimit = Math.min(
      CONFIG.HEADHUNTER.DEEP_SCAN.MAX_PLAYERS || 3000,
      scanCfg.PLAYERS || 250,
    );

    // 4. Lottery Selection
    const lotteryPool = Array.from(uniqueTourneys.values())
      .sort((a, b) => (b.capacity || 0) - (a.capacity || 0)) // Prioritize bigger tourneys
      .slice(
        0,
        Math.min(
          lowQuotaMode ? 100 : lotteryLimit * 2,
          CONFIG.HEADHUNTER.DEEP_SCAN.MAX_TOURNEYS || 3000,
        ),
      );

    const tourneyTags = [...new Set(lotteryPool
      .slice(0, lotteryLimit)
      .map((t: TournamentResult) => t.tag))];
    
    if (tourneyTags.length === 0) return [];

    let candidates: any[] = [];
    let usedRemote = false;
    let shadowStatus = "ACTIVE";
    const uniqueCandidates = new Map<string, any>();
    let tagsToFetch: string[] = [];

    // 5. Execution (Remote vs Local)
    if (remoteAvailable && remoteExpandEnabled) {
      try {
        candidates = Registry.Services.Network.scanTournamentsRemote(
          tourneyTags,
          minTrophies,
          blacklistSet,
          W,
        );
        usedRemote = true;
      } catch (e: any) {
        console.warn(`Remote scan failed: ${e.message}. Falling back to local.`);
      }
    }

    // Step 5A: Process Remote Results & Verify Yield
    if (usedRemote) {
        candidates.forEach((c: any) => {
            if (c.trophies >= minTrophies || c.trophies === undefined)
                uniqueCandidates.set(c.tag, c);
        });
        
        tagsToFetch = Array.from(uniqueCandidates.values())
            .sort((a, b) => (b.trophies || 0) - (a.trophies || 0))
            .slice(0, playerLimit)
            .map(p => p.tag);

        // SAFETY: Fallback to local if remote yields nothing
        if (tagsToFetch.length === 0) {
            console.warn(`Network: Remote Worker yielded 0 candidates from ${tourneyTags.length} tournaments. Falling back to local discovery.`);
            const workerError = Registry.Services.Network.getLastWorkerError();
            if (workerError && workerError !== "N/A") console.warn(`Network: Last Worker Error: ${workerError}`);
            usedRemote = false;
        }
    }

    // Step 5B: Local Discovery (Fallback or Primary)
    if (!usedRemote) {
      console.info(`Executing GAS-based local scan (${tourneyTags.length} tournaments)...`);
      const details: TournamentResult[] = Registry.Services.Network.fetchRoyaleAPI(
        tourneyTags.map(
          (t) => `${CONFIG.SYSTEM.API_BASE}/tournaments/${encodeURIComponent(t)}`,
        ),
      );

      details.forEach((d: TournamentResult) => {
        if (d && d.membersList && d.membersList.length >= 10) {
          d.membersList.forEach((p) => {
            if (
              (!p.clan || p.clan.tag === "") &&
              (!blacklistSet || !blacklistSet.has(p.tag)) &&
              (p.trophies >= minTrophies || p.trophies === undefined)
            ) {
              uniqueCandidates.set(p.tag, p);
            }
          });
        }
      });

      const localPool = Array.from(uniqueCandidates.values())
        .sort((a, b) => (b.trophies || 0) - (a.trophies || 0))
        .slice(0, playerLimit);
      
      Registry.Services.Core.shuffleArray(localPool);
      tagsToFetch = localPool.map(p => p.tag);
    }
    
    if (tagsToFetch.length === 0) return [];

    // 6. Prophet Intelligence Integration
    const prophetCache = RosterStore?.getProphetCache?.() || new Map();
    const normalizedProphet = new Map<string, any>();
    prophetCache.forEach((v: any, k: string) => {
        normalizedProphet.set(k.replace("#", "").trim().toLowerCase(), v);
    });

    const validCandidates: Recruit[] = [];

    // 7. Deep Profiling
    const shadowTags = new Set<string>();
    const processedTags = new Set<string>(tagsToFetch);

    if (
      usedRemote &&
      candidates.length > 0 &&
      candidates[0].rawScore !== undefined
    ) {
      // 7A. Process Remote Scored Candidates
      const remoteMap = new Map<string, any>();
      candidates.forEach(c => remoteMap.set(c.tag, c));
      
      const remotePool = tagsToFetch
        .map(t => remoteMap.get(t))
        .filter(c => c !== undefined);

      remotePool.forEach((c: any) => {
        let finalScore = c.rawScore;
        const normTag = c.tag.replace("#", "").trim().toLowerCase();
        const intel = normalizedProphet.get(normTag);
        
        if (intel && intel.wins > 5) {
             // Redundant for remote (worker applies it), but safe if worker logic fails.
             // We only log if we didn't use remote to avoid console spam.
             if (!usedRemote) {
                finalScore *= 1.25;
                console.info(`Prophet: Heritage found for ${c.name}: 25% Participation Bonus.`);
             }
        }

        validCandidates.push({
          tag: c.tag,
          name: c.name,
          trophies: c.trophies || 0,
          donations: c.donations || 0,
          cards: c.cards || 0,
          war: c.war || 0,
          foundDate: new Date(),
          invited: false,
          rawScore: finalScore,
          potentialScore: c.potentialScore,
          lastScan: Date.now(),
          source: "TOURNAMENT",
        });
      });

      // 7B. RECURSIVE SEEDING: Dynamic Shadow Threshold
      const discoveryYield = validCandidates.length;
      const shadowThreshold = 40; 

      if (discoveryYield < shadowThreshold) {
        let seedTags = validCandidates
          .sort((a, b) => b.rawScore - a.rawScore)
          .slice(0, 5) 
          .map(c => c.tag);
        
        if (seedTags.length === 0 && existingRecruits.size > 0) {
          seedTags = Array.from(existingRecruits.values())
            .sort((a, b) => (b.rawScore || 0) - (a.rawScore || 0))
            .slice(0, 10)
            .map(c => c.tag);
          console.info(`Shadow Scout: Seeding from ${seedTags.length} existing leads.`);
        }
        
        if (seedTags.length > 0) {
          const cb = Math.floor(Date.now() / 900000); 
          const seedLogs: any[][] = Registry.Services.Network.fetchRoyaleAPI(
            seedTags.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}/battlelog?__cb=${cb}`)
          );

          for (let sIdx = 0; sIdx < seedLogs.length; sIdx++) {
            const logBatch = seedLogs[sIdx];
            if (!logBatch || !Array.isArray(logBatch) || shadowTags.size >= CONFIG.HEADHUNTER.MAX_SHADOW_RECRUITS) continue;
            
            for (const entry of logBatch) {
              if (shadowTags.size >= CONFIG.HEADHUNTER.MAX_SHADOW_RECRUITS) break;
              if (!entry || !entry.opponent) continue;

              if (["ladder", "pathOfLegends", "challenge", "tournament", "riverRacePvP", "riverRaceDuel", "riverRaceTugOfWar", "riverRaceDuelColosseum", "PvP", "trail"].includes(entry.type)) {
                for (const opp of entry.opponent) {
                  const isClanless = !opp.clan || !opp.clan.tag;
                  if (opp.tag && isClanless && !processedTags.has(opp.tag) && !blacklistSet.has(opp.tag)) {
                    shadowTags.add(opp.tag);
                    processedTags.add(opp.tag);
                  }
                }
              }
            }
          }
        }
      } else {
        shadowStatus = "SKIPPED (High Yield)";
      }
    } else {
      // Local scoring required
      const playersData: any[] = Registry.Services.Network.fetchRoyaleAPI(
        tagsToFetch.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`),
        remoteAvailable ? W : null,
      );

      const logUrls: string[] = [];
      const candidatesToProfile: any[] = [];

      playersData.forEach((p: any) => {
        if (p && (p.rawScore !== undefined || p.trophies >= minTrophies)) {
           if (p.rawScore !== undefined) {
            validCandidates.push({
              tag: p.tag,
              name: p.name,
              trophies: p.trophies,
              donations: p.totalDonations,
              cards: p.challengeCardsWon,
              war: p.warDayWins,
              foundDate: new Date(),
              invited: false,
              rawScore: p.rawScore,
              source: "TOURNAMENT",
            });
          } else {
             candidatesToProfile.push(p);
             logUrls.push(`${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(p.tag)}/battlelog`);
          }
        }
      });

      if (logUrls.length > 0) {
        const logs: any[][] = Registry.Services.Network.fetchRoyaleAPI(logUrls);

        candidatesToProfile.forEach((p, idx) => {
          let hasWar = false;
          if (logs[idx]) {
            hasWar = logs[idx].some((b: any) => ["riverRacePvP", "boatBattle", "riverRaceDuel"].includes(b.type));

            if (validCandidates.length < 40 && shadowTags.size < CONFIG.HEADHUNTER.MAX_SHADOW_RECRUITS) {
              const recruits = BattleLogProcessor.digest(p.tag, AnalysisGoal.RECRUITMENT);
              recruits.forEach((r: any) => {
                 if (shadowTags.size < CONFIG.HEADHUNTER.MAX_SHADOW_RECRUITS && r.tag && !processedTags.has(r.tag) && !blacklistSet.has(r.tag)) {
                    shadowTags.add(r.tag);
                    processedTags.add(r.tag);
                 }
              });
            }
          }
          
          let totalWarScore = (p.warDayWins || 0);
          if (existingRecruits && existingRecruits.has(p.tag)) {
            totalWarScore = Math.max(totalWarScore, existingRecruits.get(p.tag)!.war);
          }

          const rawScore = Registry.Services.Scoring.calculateRecruitRawScore(
            p.trophies || 0,
            p.totalDonations || 0,
            p.warDayWins || 0,
            hasWar,
            W,
          );

          let finalScore = rawScore;
          const normTag = p.tag.replace("#", "").trim().toLowerCase();
          const intel = normalizedProphet.get(normTag);
          if (intel && intel.wins > 5) finalScore *= 1.25;

          validCandidates.push({
            tag: p.tag,
            name: p.name,
            trophies: p.trophies,
            donations: p.totalDonations,
            cards: p.challengeCardsWon,
            war: totalWarScore,
            foundDate: new Date(),
            invited: false,
            rawScore: finalScore,
            source: "TOURNAMENT",
          });
        });
      }
    }

    // 8. Shadow Profiling Pass
    if (shadowTags.size > 0) {
      const shadowList = Array.from(shadowTags);
      const shadowData: any[] = Registry.Services.Network.fetchRoyaleAPI(
        shadowList.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`),
        remoteAvailable ? W : null,
      );

      shadowData.forEach((p: any) => {
        if (p && p.tag && (p.rawScore !== undefined || p.trophies >= minTrophies)) {
          const rs = p.rawScore !== undefined 
            ? p.rawScore 
            : Registry.Services.Scoring.calculateRecruitRawScore(p.trophies || 0, p.totalDonations || 0, p.warDayWins || 0, false, W);

          validCandidates.push({
            tag: p.tag,
            name: p.name,
            trophies: p.trophies,
            donations: p.totalDonations,
            cards: p.challengeCardsWon,
            war: p.warDayWins || 0,
            foundDate: new Date(),
            invited: false,
            rawScore: rs,
            source: "SHADOW",
          });
        }
      });
    }

    // 9. FINAL SCAN SUMMARY [7/9]
    const scoutYield = validCandidates.filter(c => c.source === "TOURNAMENT").length;
    const shadowYield = validCandidates.filter(c => c.source === "SHADOW").length;
    const totalYield = validCandidates.length;

    const shadowReport = shadowStatus === "ACTIVE" 
      ? `${shadowYield} battlelogs traced`
      : shadowStatus;
    
    Registry.Services.Reporting.logReport(`[7/9] DISCOVERY: Tournament & Shadow Scouting`, [
      `TOURNAMENTS: ${uniqueTourneys.size} scanned | ${scoutYield} candidates found`,
      `SHADOWS:     ${shadowReport}`,
      `TOTAL:       ${totalYield} candidates identified for profiling`
    ]);

    return validCandidates;
  }
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = HeadhunterScanner;
}

(function(scope: any) {
  Object.assign(scope, { HeadhunterScanner });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default HeadhunterScanner;
