import { CONFIG } from './Configuration';
import Registry from './Registry';
import type { Recruit } from './Headhunter_Types';
import BattleLog, { AnalysisGoal } from './Battle_Log';

/**
 * ============================================================================
 * MODULE: HEADHUNTER SCANNER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Search engine for potential recruits.
 *    Scans Tournaments and Battle Logs (Shadow Scouting) for high-potential leads.
 * ============================================================================
 */

declare var Utilities: any;

export interface HeadhunterScannerContract {
  scanTournaments(
    minTrophies: number,
    existingRecruits: Map<string, Recruit>,
    blacklistSet: Set<string>,
    lowQuotaMode: boolean
  ): Recruit[];
}

const HeadhunterScanner: HeadhunterScannerContract = {
  scanTournaments(
    minTrophies: number,
    existingRecruits: Map<string, Recruit>,
    blacklistSet: Set<string>,
    lowQuotaMode: boolean
  ): Recruit[] {
    const S = Registry.Services;
    const validCandidates: Recruit[] = [];
    const W = CONFIG.HEADHUNTER.WEIGHTS;

    // 1. Fetch Global Tournaments (Aggressive Discovery)
    const uniqueTourneys = new Set<string>();
    let activeTourneys: any[] = [];
    // The search MUST be alphanumerical (a-z, 0-9) to guarantee the best discovery yield.
    const keywords = "abcdefghijklmnopqrstuvwxyz0123456789".split("").sort(() => Math.random() - 0.5);

    // HARDENED: Gate on actual health early to optimize discovery targets.
    const remoteAvailable = !!CONFIG.SYSTEM.REMOTE_WORKER_URL && S.Network.remoteWorkerHealthy();

    // Deep Drill: Search up to keywords.length alphanumeric characters if discovery yield is low.
    // If Remote is available, we use the FULL keyword set (36) to maximize discovery.
    const maxRetries = remoteAvailable ? keywords.length : 12; 
    const discoveryTarget = lowQuotaMode ? 2 : (remoteAvailable ? 25 : 5);
    let attempts = 0;
    const discoveryLogs: string[] = [];

    while (activeTourneys.length < discoveryTarget && attempts < Math.min(maxRetries, keywords.length)) {
      const keyword = keywords[attempts];
      const searchUrl = `${CONFIG.SYSTEM.API_BASE}/tournaments?name=${encodeURIComponent(keyword)}`;
      const tourneyResponse: any = S.Network.fetchRoyaleAPIOne(searchUrl);
      
      if (tourneyResponse) {
        // [FLEXIBLE ACQUISITION]: Handle both wrapped {items: []} and raw [] responses.
        const foundItems = Array.isArray(tourneyResponse) ? tourneyResponse : (tourneyResponse.items || []);
        
        if (foundItems.length > 0) {
          discoveryLogs.push(`Found ${foundItems.length} tournaments via '${keyword}'.`);
          activeTourneys.push(...foundItems);
        } else {
          discoveryLogs.push(`No results for '${keyword}'.`);
        }
      } else {
        discoveryLogs.push(`Search failed for '${keyword}'.`);
      }
      attempts++;
    }

    // CONSOLDATED LOGGING: Combine discovery into a single block for readability.
    if (discoveryLogs.length > 0) {
        console.info(`Tournament Discovery Trace:\n${discoveryLogs.join("\n")}`);
    }

    if (activeTourneys.length === 0) {
        console.error(`HeadhunterScanner: Exhausted tournament discovery after ${attempts} alphanumeric retries. Discovery Yield: 0.`);
        return [];
    }

    activeTourneys = activeTourneys.slice(0, discoveryTarget); // Conserve API calls
    activeTourneys.forEach((t: any) => uniqueTourneys.add(t.tag));

    // 3. Load Prophet Intelligence (Historical Context)
    // We pre-load known historically active players to apply "Heritage Bonuses".
    const normalizedProphet = new Map<string, any>();
    try {
      const prophetData = S.Database.loadDatabase();
      prophetData.forEach((p: any) => {
        const normTag = S.Core.normalizeTag(p.tag).replace("#", "").toLowerCase();
        normalizedProphet.set(normTag, p);
      });
    } catch (e) {
      console.warn("HeadhunterScanner: Prophet initialization skipped (DB Error).");
    }

    // 4. Batch Player Discovery
    const playerTags = new Set<string>();
    const tourneyDetails: any[] = S.Network.fetchRoyaleAPI(
      activeTourneys.map((t: any) => `${CONFIG.SYSTEM.API_BASE}/tournaments/${encodeURIComponent(t.tag)}`),
      null,
      "Tourney Details"
    );

    tourneyDetails.forEach(detail => {
      if (detail && Array.isArray(detail.membersList)) {
        detail.membersList.forEach((m: any) => {
          const tag = S.Core.normalizeTag(m.tag);
          if (tag && !existingRecruits.has(tag) && !blacklistSet.has(tag)) {
             playerTags.add(tag);
          }
        });
      }
    });

    // 5. Remote vs Local Profiling
    // We already checked remoteAvailable in step 1.
    let tagsToFetch = Array.from(playerTags).slice(0, lowQuotaMode ? 50 : 200);
    
    let candidates: any[] = [];
    let usedRemote = false;
    let shadowStatus = "ACTIVE";

    if (remoteAvailable && tagsToFetch.length > 0) {
      try {
        console.info(`HeadhunterScanner: Attempting remote scan for ${tagsToFetch.length} tags.`);
        const remoteResponse = S.Network.fetchRemoteWorker("/scan", {
           tags: tagsToFetch,
           scoring: W
        });
        if (remoteResponse && Array.isArray(remoteResponse.candidates)) {
           candidates = remoteResponse.candidates;
           usedRemote = true;
           console.info(`HeadhunterScanner: Remote scan successful, found ${candidates.length} candidates.`);
        } else {
           console.warn("HeadhunterScanner: Remote worker returned invalid response. Falling back to local profiling.");
        }
      } catch (e) {
        console.warn("HeadhunterScanner: Remote worker scan failed. Falling back to local profiling.");
        // HARDENED: Re-slice to local-safe limit to prevent quota exhaustion.
        tagsToFetch = tagsToFetch.slice(0, 50);
      }
    }

    // 6. Local Profiling Pass (Fallback or Shadow Expansion)
    const shadowTags = new Set<string>();
    const processedTags = new Set<string>(tagsToFetch);

    if (
      usedRemote &&
      candidates.length > 0 &&
      candidates[0].rawScore !== undefined
    ) {
      // 7A. Process Remote Scored Candidates
      const remoteMap = new Map<string, any>();
      candidates.forEach(remoteCandidate => {
        const tag = S.Core.normalizeTag(remoteCandidate.tag);
        remoteMap.set(tag, remoteCandidate);
      });
      
      const remotePool = tagsToFetch
        .map(tag => remoteMap.get(tag))
        .filter(candidate => candidate !== undefined);

      remotePool.forEach((candidate: any) => {
        let finalScore = candidate.rawScore;
        const normTag = S.Core.normalizeTag(candidate.tag).replace("#", "").toLowerCase();
        const intel = normalizedProphet.get(normTag);
        
        if (intel && intel.warFame > 500) {
            finalScore *= 1.25;
            console.info(`Prophet: Heritage found for ${candidate.name}: 25% Participation Bonus.`);
        }

        validCandidates.push({
          tag: S.Core.normalizeTag(candidate.tag),
          name: candidate.name,
          trophies: candidate.trophies || 0,
          donations: candidate.donations || candidate.totalDonations || 0,
          cards: candidate.cards || candidate.challengeCardsWon || 0,
          war: candidate.war || candidate.warDayWins || 0,
          foundDate: new Date(),
          invited: false,
          rawScore: finalScore,
          potentialScore: candidate.potentialScore,
          lastScan: Date.now(),
          source: "TOURNAMENT",
        });
      });

      const discoveryYield = validCandidates.length;
      const shadowThreshold = 40;

      if (discoveryYield < shadowThreshold) {
        let seedTags = validCandidates
          .sort((a, b) => b.rawScore - a.rawScore)
          .slice(0, 5) 
          .map(candidate => candidate.tag);
        
        if (seedTags.length === 0 && existingRecruits.size > 0) {
          seedTags = Array.from(existingRecruits.values())
            .sort((a, b) => (b.rawScore || 0) - (a.rawScore || 0))
            .slice(0, 10)
            .map(candidate => candidate.tag);
          console.info(`Shadow Scout: Seeding from ${seedTags.length} existing leads.`);
        }
        
        if (seedTags.length > 0) {
          const cb = Math.floor(Date.now() / 900000); 
          const seedLogs: any[][] = S.Network.fetchRoyaleAPI(
            seedTags.map(tag => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}/battlelog?__cb=${cb}`),
            null,
            "Shadow Seeding"
          );

          for (let sIdx = 0; sIdx < seedLogs.length; sIdx++) {
            const logBatch = seedLogs[sIdx];
            if (!logBatch || !Array.isArray(logBatch) || shadowTags.size >= CONFIG.HEADHUNTER.MAX_SHADOW_RECRUITS) continue;
            
            for (const entry of logBatch) {
              if (shadowTags.size >= CONFIG.HEADHUNTER.MAX_SHADOW_RECRUITS) break;
              if (!entry || !entry.opponent) continue;

              if (["ladder", "pathOfLegends", "challenge", "tournament", "riverRacePvP", "riverRaceDuel", "riverRaceTugOfWar", "riverRaceDuelColosseum", "PvP", "trail"].includes(entry.type)) {
                for (const opp of entry.opponent) {
                  const tag = S.Core.normalizeTag(opp.tag);
                  const isClanless = !opp.clan || !opp.clan.tag;
                  if (tag && isClanless && !processedTags.has(tag) && !blacklistSet.has(tag)) {
                    // [FIX] Ensure we don't treat existing recruits as new shadow arrivals
                    if (!existingRecruits.has(tag)) {
                      shadowTags.add(tag);
                    }
                    processedTags.add(tag);
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
      const playersData: any[] = S.Network.fetchRoyaleAPI(
        tagsToFetch.map(tag => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}`),
        remoteAvailable ? W : null,
        "Candidate Profiles"
      ) || [];

      const logUrls: string[] = [];
      const candidatesToProfile: any[] = [];

      playersData.forEach((profile: any) => {
        if (profile && (profile.rawScore !== undefined || profile.trophies >= minTrophies)) {
           if (profile.rawScore !== undefined) {
            validCandidates.push({
              tag: S.Core.normalizeTag(profile.tag),
              name: profile.name,
              trophies: profile.trophies || 0,
              donations: profile.donations || profile.totalDonations || 0,
              cards: profile.cards || profile.challengeCardsWon || 0,
              war: profile.war || profile.warDayWins || 0,
              foundDate: new Date(),
              invited: false,
              rawScore: profile.rawScore,
              lastScan: Date.now(),
              source: "TOURNAMENT",
            });
          } else {
             candidatesToProfile.push(profile);
             logUrls.push(`${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(profile.tag)}/battlelog`);
          }
        }
      });

      if (logUrls.length > 0) {
        const logs: any[][] = S.Network.fetchRoyaleAPI(logUrls);

        candidatesToProfile.forEach((profile, profileIndex) => {
          let hasWar = false;
          if (logs[profileIndex]) {
            hasWar = logs[profileIndex].some((battleLogEntry: any) => ["riverRacePvP", "boatBattle", "riverRaceDuel"].includes(battleLogEntry.type));

            if (validCandidates.length < 40 && shadowTags.size < CONFIG.HEADHUNTER.MAX_SHADOW_RECRUITS) {
              const recruits = BattleLog.processPlayerHistory(S.Core.normalizeTag(profile.tag), AnalysisGoal.RECRUITMENT);
               recruits.forEach((recruit: any) => {
                  const tag = S.Core.normalizeTag(recruit.tag);
                  if (shadowTags.size < CONFIG.HEADHUNTER.MAX_SHADOW_RECRUITS && tag && !processedTags.has(tag) && !blacklistSet.has(tag)) {
                    // [FIX] Double-check against existing pool before adding to shadowTags
                    if (!existingRecruits.has(tag)) {
                      shadowTags.add(tag);
                    }
                    processedTags.add(tag);
                  }
               });
            }
          }
          
          let totalWarScore = (profile.warDayWins || 0);
          const tag = S.Core.normalizeTag(profile.tag);
          if (existingRecruits && existingRecruits.has(tag)) {
            totalWarScore = Math.max(totalWarScore, existingRecruits.get(tag)!.war);
          }

          const rawScore = S.Scoring.calculateRecruitRawScore(
            profile.trophies || 0,
            profile.totalDonations || 0,
            profile.warDayWins || 0,
            hasWar,
            W,
          );

          let finalScore = rawScore;
          const normTag = tag.replace("#", "").toLowerCase();
          const intel = normalizedProphet.get(normTag);
          if (intel && intel.warFame > 500) finalScore *= 1.25;

          validCandidates.push({
            tag,
            name: profile.name,
            trophies: profile.trophies,
            donations: profile.totalDonations,
            cards: profile.challengeCardsWon,
            war: totalWarScore,
            foundDate: new Date(),
            invited: false,
            rawScore: finalScore,
            lastScan: Date.now(),
            source: "TOURNAMENT",
          });
        });
      }
    }

    if (shadowTags.size > 0) {
      const shadowList = Array.from(shadowTags);
      const shadowData: any[] = S.Network.fetchRoyaleAPI(
        shadowList.map(tag => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}`),
        remoteAvailable ? W : null,
      );

      shadowData.forEach((shadowProfile: any) => {
        if (shadowProfile && shadowProfile.tag && (shadowProfile.rawScore !== undefined || shadowProfile.trophies >= minTrophies)) {
          const rawScore = shadowProfile.rawScore !== undefined
            ? shadowProfile.rawScore
            : S.Scoring.calculateRecruitRawScore(shadowProfile.trophies || 0, shadowProfile.totalDonations || 0, shadowProfile.warDayWins || 0, false, W);

          validCandidates.push({
            tag: S.Core.normalizeTag(shadowProfile.tag),
            name: shadowProfile.name,
            trophies: shadowProfile.trophies,
            donations: shadowProfile.donations || shadowProfile.totalDonations || 0,
            cards: shadowProfile.cards || shadowProfile.challengeCardsWon || 0,
            war: shadowProfile.war || shadowProfile.warDayWins || 0,
            foundDate: new Date(),
            invited: false,
            rawScore: rawScore,
            lastScan: Date.now(),
            source: "SHADOW",
          });
        }
      });
    }

    const scoutYield = validCandidates.filter(candidate => candidate.source === "TOURNAMENT").length;
    const shadowYield = validCandidates.filter(candidate => candidate.source === "SHADOW").length;
    const totalYield = validCandidates.length;

    const shadowReport = shadowStatus === "ACTIVE" 
      ? `${shadowYield} battlelogs traced`
      : shadowStatus;
    
    S.Reporting.logReport(`[7/9] DISCOVERY: Tournament & Shadow Scouting`, [
      `TOURNAMENTS: ${uniqueTourneys.size} scanned | ${scoutYield} candidates found`,
      `SHADOWS:     ${shadowReport}`,
      `TOTAL:       ${totalYield} candidates identified for profiling`
    ]);

    // 10. Local Discovery Check
    if (validCandidates.length === 0 && usedRemote) {
        console.warn("HeadhunterScanner: Remote worker returned 0 candidates. Verification of local yield required.");
    } else {
        console.info(`HeadhunterScanner: Discovery Cycle Complete. Yield: ${validCandidates.length} potential recruits.`);
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
