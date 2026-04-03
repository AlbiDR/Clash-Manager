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
    const processedTags = new Set<string>();
    const shadowTags = new Set<string>();
    let seedTags: string[] = [];
    let shadowStatus = "ACTIVE";

    // 1. Initialize Prophet (Historical Context)
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

    // 2. Phase I: Tournament Search (Aggressive Discovery)
    const uniqueTourneys = new Set<string>();
    let rawTourneyMatches: any[] = [];
    
    // [FIX] Use configured keywords instead of hardcoded string
    const keywords = [...CONFIG.HEADHUNTER.KEYWORDS].sort(() => Math.random() - 0.5);
    const remoteAvailable = !!CONFIG.SYSTEM.REMOTE_WORKER_URL && S.Network.remoteWorkerHealthy();

    const THRESHOLDS = [50, 25, 10, 5, 2];
    const maxRetries = Math.min(keywords.length, remoteAvailable ? 30 : 10);
    const discoveryTarget = lowQuotaMode ? 5 : 50;
    let attempts = 0;
    const discoveryHits: string[] = [];
    let discoveryMisses = 0;
    let discoveryFailures = 0;

    // [OPTIMIZED]: Fetch all keywords in parallel to reduce GAS log noise and execution time.
    const keywordsToFetch = keywords.slice(0, maxRetries);
    const searchUrls = keywordsToFetch.map(k => `${CONFIG.SYSTEM.API_BASE}/tournaments?name=${encodeURIComponent(k)}`);
    
    // Silence individual search logs in Network by passing a context
    const searchResponses = S.Network.fetchRoyaleAPI(searchUrls, null, "Tournament Discovery") || [];

    searchResponses.forEach((tourneyResponse, idx) => {
      const keyword = keywordsToFetch[idx];
      if (tourneyResponse) {
        const foundItems = Array.isArray(tourneyResponse) ? tourneyResponse : (tourneyResponse.items || []);
        const threshold = THRESHOLDS[Math.min(idx, THRESHOLDS.length - 1)];
        
        const matches = foundItems.filter((t: any) => 
          (t.type === "open" || !t.type) && 
          (t.maxPlayers || t.capacity || 0) >= threshold
        );

        if (matches.length > 0) {
          discoveryHits.push(`${keyword}(${matches.length}/${foundItems.length})`);
          rawTourneyMatches.push(...matches);
        } else {
          discoveryMisses++;
        }
      } else {
        discoveryFailures++;
      }
    });

    if (discoveryHits.length > 0 || discoveryMisses > 0 || discoveryFailures > 0) {
      const trace: string[] = [];
      if (discoveryHits.length > 0) trace.push(`HITS: ${discoveryHits.join(', ')}`);
      if (discoveryMisses > 0) trace.push(`${discoveryMisses} keywords zero-yielded`);
      if (discoveryFailures > 0) trace.push(`${discoveryFailures} searches failed`);
      S.Reporting.logReport("TOURNAMENT DISCOVERY TRACE", [trace.join(' | ')]);
    }

    // 3. Phase II: Member Extraction
    const playerTags = new Set<string>();
    const extractionLimit = discoveryTarget;
    const selectedTourneys = rawTourneyMatches.slice(0, extractionLimit);
    selectedTourneys.forEach(t => uniqueTourneys.add(t.tag));

    const tourneyDetails: any[] = S.Network.fetchRoyaleAPI(
      selectedTourneys.map(t => `${CONFIG.SYSTEM.API_BASE}/tournaments/${encodeURIComponent(t.tag)}`),
      null,
      "Extraction"
    ) || [];

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

    // 4. Phase III: Candidate Profiling (Remote or Local Fallback)
    let tagsToProfile = Array.from(playerTags).slice(0, lowQuotaMode ? 50 : 200);
    tagsToProfile.forEach(tag => processedTags.add(tag));
    
    let profileResults: any[] = [];
    let profilingMode = "LOCAL";

    if (remoteAvailable && tagsToProfile.length > 0) {
      try {
        const remoteResponse = S.Network.fetchRemoteWorker("/scan", { tags: tagsToProfile, scoring: W, minTrophies });
        if (remoteResponse && Array.isArray(remoteResponse.candidates)) {
          profileResults = remoteResponse.candidates;
          profilingMode = "REMOTE";
        }
      } catch (e) {
        console.warn("HeadhunterScanner: Remote profiling failed, falling back to local.");
      }
    }

    // Deep Profiling if Remote /scan failed or returned nothing
    if (profileResults.length === 0 && tagsToProfile.length > 0) {
      const batchSize = 50;
      const localTags = tagsToProfile.slice(0, batchSize);
      profileResults = S.Network.fetchRoyaleAPI(
        localTags.map(tag => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}`),
        remoteAvailable ? W : null,
        "Deep Profiling"
      ) || [];
    }

    profileResults = profileResults || [];

    // Convert profiles to Recruit objects
    profileResults.forEach((profile: any) => {
      if (!profile) return;
      
      const leagueTrophies = profile?.leagueStatistics?.currentSeason?.trophies || 0;
      const effectiveTrophies = (profile.trophies || 0) + (profile.trophies >= 9000 ? leagueTrophies : 0);

      if (effectiveTrophies < minTrophies) return;
      if (profile.clan && profile.clan.tag) return; // Skip players already in clans

      const tag = S.Core.normalizeTag(profile.tag);
      let finalScore = profile.rawScore;
      let hasWar = false;

      // Check Prophet Heritage
      const normTag = tag.replace("#", "").toLowerCase();
      const intel = normalizedProphet.get(normTag);
      
      if (finalScore === undefined) {
          // Local profile needs scoring and battlelog check if available
          finalScore = S.Scoring.calculateRecruitRawScore(effectiveTrophies, profile.totalDonations || 0, profile.warDayWins || 0, false, W);
          if (intel && intel.warFame > 500) finalScore *= 1.25;
      }

      const toNum = (v: any) => {
        if (typeof v === "number") return v;
        if (typeof v === "string") return Number(v) || 0;
        if (Array.isArray(v) || (typeof v === "object" && v !== null)) return NaN;
        return Number(v) || 0;
      };

      validCandidates.push({
        tag,
        name: profile.name,
        trophies: toNum(effectiveTrophies),
        donations: toNum(profile.donations || profile.totalDonations),
        cards: toNum(typeof profile.cards === 'number' ? profile.cards : profile.challengeCardsWon),
        war: toNum(profile.war || profile.warDayWins),
        foundDate: new Date(),
        invited: false,
        rawScore: toNum(finalScore),
        lastScan: Date.now(),
        source: "TOURNAMENT",
      });
    });

    const profilingLogs = [
      `MODE:    ${profilingMode}`,
      `INPUT:   ${tagsToProfile.length} tags`,
      `OUTPUT:  ${validCandidates.length} recruits identified`
    ];
    S.Reporting.logReport("PROFILING REPORT", profilingLogs);

    // 5. Phase IV: Unified Shadow Scouting (Horizontal Layer)
    const shadowThreshold = 100;
    if (validCandidates.length < shadowThreshold) {
      const heritageTags = S.Roster.getTopPerformers(3);
      seedTags = [...heritageTags];
      let seedingSource = heritageTags.length > 0 ? "Heritage" : "None";

      // Include top discovery hits as seeds
      const discoverySeeds = validCandidates
        .sort((a, b) => b.rawScore - a.rawScore)
        .slice(0, 10)
        .map(c => c.tag);
      
      if (discoverySeeds.length > 0) {
        seedTags = Array.from(new Set([...seedTags, ...discoverySeeds]));
        seedingSource += seedingSource === "None" ? "Discovery" : " + Discovery";
      }

      // Fallback to existing recruits if still empty
      if (seedTags.length === 0 && existingRecruits.size > 0) {
        const recruitSeeds = Array.from(existingRecruits.values())
          .sort((a, b) => (b.rawScore || 0) - (a.rawScore || 0))
          .slice(0, 20)
          .map(c => c.tag);
        seedTags = recruitSeeds;
        seedingSource = "Existing Leads";
      }

      if (seedTags.length > 0) {
        const cb = Math.floor(Date.now() / 900000); 
        const shadowLogs: string[] = [];
        shadowLogs.push(`Seeding from ${seedTags.length} sources (${seedingSource}).`);

        const logUrls = seedTags.map(tag => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}/battlelog?__cb=${cb}`);
        const battleLogs: any[][] = S.Network.fetchRoyaleAPI(
          logUrls,
          null,
          "Shadow Seeding"
        ) || [];

        battleLogs.forEach((logBatch, sIdx) => {
          if (!logBatch || !Array.isArray(logBatch)) return;
          logBatch.forEach(entry => {
            if (shadowTags.size >= CONFIG.HEADHUNTER.MAX_SHADOW_RECRUITS) return;
            if (!entry || !entry.opponent) return;

            const VALID_TYPES = ["ladder", "pathOfLegends", "challenge", "tournament", "riverRacePvP", "riverRaceDuel", "PvP"];
            if (VALID_TYPES.includes(entry.type)) {
              entry.opponent.forEach((opp: any) => {
                const tag = S.Core.normalizeTag(opp.tag);
                const isClanless = !opp.clan || !opp.clan.tag;
                if (tag && isClanless && !processedTags.has(tag) && !blacklistSet.has(tag) && !existingRecruits.has(tag)) {
                  shadowTags.add(tag);
                  processedTags.add(tag);
                }
              });
            }
          });
        });

        // Profile Shadow Candidates
        if (shadowTags.size > 0) {
          const shadowList = Array.from(shadowTags);
          const shadowResponse = S.Network.fetchRemoteWorker("/scan", { tags: shadowList, scoring: W, minTrophies });
          const shadowData = shadowResponse?.candidates || [];

          shadowData.forEach((profile: any) => {
            if (profile && profile.tag && (profile.trophies || 0) >= minTrophies) {
               const rawScore = profile.rawScore !== undefined
                ? profile.rawScore
                : S.Scoring.calculateRecruitRawScore(profile.trophies || 0, profile.totalDonations || 0, profile.warDayWins || 0, false, W);

              const toNum = (v: any) => {
                if (typeof v === "number") return v;
                if (typeof v === "string") return Number(v) || 0;
                if (Array.isArray(v) || (typeof v === "object" && v !== null)) return NaN;
                return Number(v) || 0;
              };

              validCandidates.push({
                tag: S.Core.normalizeTag(profile.tag),
                name: profile.name,
                trophies: toNum(profile.trophies),
                donations: toNum(profile.donations || profile.totalDonations),
                cards: toNum(typeof profile.cards === 'number' ? profile.cards : profile.challengeCardsWon),
                war: toNum(profile.war || profile.warDayWins),
                foundDate: new Date(),
                invited: false,
                rawScore: toNum(rawScore),
                lastScan: Date.now(),
                source: "SHADOW",
              });
            }
          });
        }

        const shadowYield = validCandidates.filter(c => c.source === "SHADOW").length;
        shadowLogs.push(`Shadow tracing identified ${shadowTags.size} targets.`);
        shadowLogs.push(`Shadow conversion yielded ${shadowYield} recruits.`);
        S.Reporting.logReport("SHADOW SCOUTING SUMMARY", shadowLogs);
      }
    } else {
      shadowStatus = "SKIPPED (Yield met)";
    }

    // 6. Final Discovery Summary
    const scoutYield = validCandidates.filter(c => c.source === "TOURNAMENT").length;
    const shadowYield = validCandidates.filter(c => c.source === "SHADOW").length;

    S.Reporting.logReport(`[7/9] DISCOVERY: Tournament & Shadow Scouting`, [
      `TOURNAMENTS: ${uniqueTourneys.size} scanned | ${scoutYield} found`,
      `SHADOWS:     ${shadowStatus} | ${shadowYield} found`,
      `TOTAL:       ${validCandidates.length} recruits identified`
    ]);

    return validCandidates;
  }
};



(function(scope: any) {
  Object.assign(scope, { HeadhunterScanner });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default HeadhunterScanner;
