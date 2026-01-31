
import { CONFIG } from './Configuration';
import Registry from './Registry';
import RosterStore from './Roster_Store';
import type { Recruit, TournamentResult, TournamentMember } from './Headhunter_Types';

/**
 * ============================================================================
 * 🔭 MODULE: HEADHUNTER SCANNER
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Discovery engine for finding new recruits.
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
    console.info(`  ├─ Discovery: Found ${uniqueTourneys.size} total active tournaments.`);

    // 2. Worker Handshake
    const remoteAvailable = Registry.Services.Network.remoteWorkerHealthy(true);
    const remoteExpandEnabled = Registry.Services.Store.props.get("HH_REMOTE_EXPAND", "1") === "1";

    if (!remoteAvailable) {
      const lastErr = Registry.Services.Network.getLastWorkerError();
      console.warn(`⚠️ [WORKER] Remote worker offline: ${lastErr || "Unknown"}. Falling back to local mode (throttled).`);
      lowQuotaMode = true;
    }

    const scanCfg =
      remoteAvailable && remoteExpandEnabled
        ? CONFIG.HEADHUNTER.DEEP_SCAN.REMOTE
        : CONFIG.HEADHUNTER.DEEP_SCAN.LOCAL;

    // 3. Lottery Selection
    const lotteryPool = Array.from(uniqueTourneys.values())
      .sort((a, b) => (b.capacity || 0) - (a.capacity || 0)) // Prioritize bigger tourneys
      .slice(
        0,
        Math.min(
          lowQuotaMode ? 100 : (scanCfg.TOURNEYS || 300) * 2,
          CONFIG.HEADHUNTER.DEEP_SCAN.MAX_TOURNEYS || 2000,
        ),
      );

    Registry.Services.Core.shuffleArray(lotteryPool);
    const tourneyTags = lotteryPool
      .slice(0, scanCfg.TOURNEYS || 300)
      .map((t: TournamentResult) => t.tag);
    
    console.info(`  ├─ Keywords: ${keywords.length} | Mode: ${lowQuotaMode ? "SAFE (Quota Guard)" : "FULL"}`);
    console.info(`  ├─ Worker: ${remoteAvailable ? "ONLINE" : "OFFLINE"} | Deep Expand: ${remoteExpandEnabled ? "ENABLED" : "DISABLED"}`);
    console.info(`  └─ Lottery: Selected ${tourneyTags.length} tournament${tourneyTags.length !== 1 ? 's' : ''} for deep scanning.`);

    if (tourneyTags.length === 0) return [];

    let candidates: any[] = [];
    let usedRemote = false;

    // 4. Execution (Remote vs Local)
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
        console.warn(`⚠️ [REMOTE] Remote scan failed: ${e.message}. Falling back to local.`);
      }
    }

    if (!usedRemote) {
      console.info(`  └─ Executing GAS-based local scan (${tourneyTags.length} tournament${tourneyTags.length !== 1 ? 's' : ''})...`);
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
              (!blacklistSet || !blacklistSet.has(p.tag))
            ) {
              candidates.push(p);
            }
          });
        }
      });
    }

    // 5. Candidate Filtering
    const uniqueCandidates = new Map<string, any>();
    candidates.forEach((c: any) => {
      if (c.trophies >= minTrophies || c.trophies === undefined)
        uniqueCandidates.set(c.tag, c);
    });

    const playerLimit = Math.min(
      CONFIG.HEADHUNTER.DEEP_SCAN.MAX_PLAYERS || 2000,
      scanCfg.PLAYERS || 250,
    );
    const candidatePool = Array.from(uniqueCandidates.values())
      .sort((a, b) => (b.trophies || 0) - (a.trophies || 0))
      .slice(0, playerLimit);

    Registry.Services.Core.shuffleArray(candidatePool);
    const tagsToFetch = candidatePool.slice(0, playerLimit).map((p) => p.tag);
    
    console.info(`  ├─ Candidates: Located ${uniqueCandidates.size} unique clanless players.`);
    console.info(`  └─ Sampling: Profiling ${tagsToFetch.length} players (Limit: ${playerLimit}).`);

    if (tagsToFetch.length === 0) return [];

    // 5B. Prophet Intelligence Integration
    const prophetCache = RosterStore.getProphetCache();
    const heritageTags = new Set(prophetCache.keys());

    const validCandidates: Recruit[] = [];

    /**
     * Helper: Batch fetcher to avoid RoyaleAPI 429 and GAS timeouts.
     * 🛡️ FIX: Ensures array parity by padding results on batch failure.
     */
    const batchFetch = (tags: string[], chunkSize: number, fetchFn: (chunk: string[]) => any[]) => {
      const results: any[] = [];
      for (let i = 0; i < tags.length; i += chunkSize) {
        const chunk = tags.slice(i, i + chunkSize);
        try {
          const res = fetchFn(chunk);
          if (Array.isArray(res)) {
            results.push(...res);
          } else {
            // Padding if result is not an array but expected to be
            results.push(...new Array(chunk.length).fill(null));
          }
          if (typeof Utilities !== 'undefined') Utilities.sleep(100); // 100ms jitter between batches
        } catch (e: any) {
          console.warn(`⚠️ [SCANNER] Batch fetch failed part way: ${e.message}`);
          results.push(...new Array(chunk.length).fill(null));
        }
      }
      return results;
    };

    // 6. Deep Profiling
    const shadowTags = new Set<string>();
    const processedTags = new Set<string>(tagsToFetch);

    if (
      usedRemote &&
      candidates.length > 0 &&
      candidates[0].rawScore !== undefined
    ) {
      // 6A. Process Remote Scored Candidates
      // 🛡️ DEDUPLICATION: Use playerLimit and deduplicated tags
      const remoteMap = new Map<string, any>();
      candidates.forEach(c => remoteMap.set(c.tag, c));
      
      const remotePool = tagsToFetch
        .map(t => remoteMap.get(t))
        .filter(c => c !== undefined);

      remotePool.forEach((c: any) => {
        let finalScore = c.rawScore;
        // Apply Prophet Bonus
        if (heritageTags.has(c.tag.replace("#", "").trim().toLowerCase())) {
          const intel = prophetCache.get(c.tag.replace("#", "").trim().toLowerCase());
          if (intel && intel.wins > 5) {
             finalScore *= 1.25;
             console.info(`  ✨ [PROPHET] Heritage found for ${c.name}: 25% Participation Bonus.`);
          }
        }

        validCandidates.push({
          tag: c.tag,
          name: c.name,
          trophies: c.trophies,
          donations: c.donations,
          cards: c.cards,
          war: c.war,
          foundDate: new Date(),
          invited: false,
          rawScore: finalScore,
          potentialScore: c.potentialScore,
          source: "TOURNAMENT",
        });
      });

      // 🕵️ RECURSIVE SEEDING: Fetch logs for Top 5 Remote Recruits to trigger Shadow Scout
      const seedTags = validCandidates
        .sort((a, b) => b.rawScore - a.rawScore)
        .slice(0, 5)
        .map(c => c.tag);
      
      if (seedTags.length > 0) {
        const seedLogs: any[][] = batchFetch(
          seedTags.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}/battlelog`),
          5,
          (chunk) => Registry.Services.Network.fetchRoyaleAPI(chunk)
        );

        seedLogs.forEach((logList) => {
          if (logList && Array.isArray(logList)) {
            logList.forEach((b: any) => {
              if (shadowTags.size >= 100) return;
              if (["ladder", "pathOfLegends", "challenge", "tournament"].includes(b.type)) {
                const opponents = b.opponent || [];
                opponents.forEach((opp: any) => {
                  if (shadowTags.size >= 100) return;
                  const isClanless = !opp.clan || !opp.clan.tag;
                  if (isClanless && opp.tag && !processedTags.has(opp.tag) && !blacklistSet.has(opp.tag)) {
                    shadowTags.add(opp.tag);
                    processedTags.add(opp.tag);
                  }
                });
              }
            });
          }
        });
      }
    } else {
      // Local scoring required
      const playersData: any[] = batchFetch(
        tagsToFetch,
        25,
        (chunk) => Registry.Services.Network.fetchRoyaleAPI(
          chunk.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`),
          remoteAvailable ? W : null,
        )
      );

      const logUrls: string[] = [];
      const candidatesToProfile: any[] = [];

      playersData.forEach((p: any) => {
        if (p && (p.rawScore !== undefined || p.trophies >= minTrophies)) {
           // If remote worker scored it during player fetch (some weird edge case or optimization)
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
             // Need Battle Logs for War Score
             candidatesToProfile.push(p);
             logUrls.push(
               `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(p.tag)}/battlelog`,
             );
          }
        }
      });

      if (logUrls.length > 0) {
        const logs: any[][] = batchFetch(
          logUrls,
          25,
          (chunk) => Registry.Services.Network.fetchRoyaleAPI(chunk)
        );

        candidatesToProfile.forEach((p, idx) => {
          let hasWar = false;
          if (logs[idx]) {
            hasWar = logs[idx].some((b: any) =>
              ["riverRacePvP", "boatBattle", "riverRaceDuel"].includes(b.type),
            );

            // 🕵️ SHADOW SCOUT: Extract Elite Clanless Opponents
            if (shadowTags.size < 100) {
              logs[idx].forEach((b: any) => {
                if (shadowTags.size >= 100) return;
                // Focus on high-skill matchmaking types
                if (["ladder", "pathOfLegends", "challenge", "tournament"].includes(b.type)) {
                  const opponents = b.opponent || [];
                  opponents.forEach((opp: any) => {
                    if (shadowTags.size >= 100) return;
                    const isClanless = !opp.clan || !opp.clan.tag;
                    if (isClanless && opp.tag && !processedTags.has(opp.tag) && !blacklistSet.has(opp.tag)) {
                      shadowTags.add(opp.tag);
                      processedTags.add(opp.tag);
                    }
                  });
                }
              });
            }
          }
          let totalWarScore = (p.warDayWins || 0);
          if (existingRecruits && existingRecruits.has(p.tag)) {
            totalWarScore = Math.max(
              totalWarScore,
              existingRecruits.get(p.tag)!.war,
            );
          }



          const rawScore = Registry.Services.Scoring.calculateRecruitRawScore(
            p.trophies || 0,
            p.totalDonations || 0,
            p.warDayWins || 0,
            hasWar,
            W,
          );

          // 🛡️ HERITAGE INTELLIGENCE: Apply Prophet Bonus
          let finalScore = rawScore;
          if (heritageTags.has(p.tag.replace("#", "").trim().toLowerCase())) {
            const intel = prophetCache.get(p.tag.replace("#", "").trim().toLowerCase());
            if (intel && intel.wins > 5) {
               finalScore *= 1.25; // 25% Boost for proven high-participation alumni
               console.info(`  ✨ [PROPHET] Heritage found for ${p.name}: Participation Bonus Applied.`);
            }
          }

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

      // 7. Shadow Profiling Pass
      if (shadowTags.size > 0) {
        const shadowList = Array.from(shadowTags);
        console.info(`  🕵️ [SHADOW] Extraction Complete: Found ${shadowList.length} potential recursive seeds.`);
        
        const shadowData: any[] = batchFetch(
          shadowList,
          25,
          (chunk) => Registry.Services.Network.fetchRoyaleAPI(
            chunk.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`),
            remoteAvailable ? W : null,
          )
        );

        shadowData.forEach((p: any) => {
          if (p && p.tag && (p.rawScore !== undefined || p.trophies >= minTrophies)) {
            const rawScore = Registry.Services.Scoring.calculateRecruitRawScore(
              p.trophies || 0,
              p.totalDonations || 0,
              p.warDayWins || 0,
              false, // Assume no recent war for shadow recruits
              W,
            );

            validCandidates.push({
              tag: p.tag,
              name: p.name,
              trophies: p.trophies,
              donations: p.totalDonations,
              cards: p.challengeCardsWon,
              war: p.warDayWins || 0,
              foundDate: new Date(),
              invited: false,
              rawScore: rawScore,
              source: "SHADOW",
            });
          }
        });
      }
    }

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
