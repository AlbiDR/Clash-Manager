
import { CONFIG } from './Configuration';
import Registry from './Registry';
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
      (k) => `${CONFIG.SYSTEM.API_BASE}/tournaments?name=${k}`,
    );

    // 1. Discovery: Find Tournaments
    const searchResults: any[] = Registry.Services.Network.fetchRoyaleAPI(searchUrls);
    const uniqueTourneys = new Map<string, TournamentResult>();
    searchResults.forEach((res: TournamentResult) => {
      if (res && res.items)
        res.items.forEach((t) => uniqueTourneys.set(t.tag, t));
    });

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
      .map((t) => t.tag);
    
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

    if (tagsToFetch.length === 0) return [];

    const validCandidates: Recruit[] = [];

    // 6. Deep Profiling
    if (
      usedRemote &&
      candidates.length > 0 &&
      candidates[0].rawScore !== undefined
    ) {
      // Remote worker returned fully scored recruits
      candidates.forEach((c: any) => {
        validCandidates.push({
          tag: c.tag,
          name: c.name,
          trophies: c.trophies,
          donations: c.donations,
          cards: c.cards,
          war: c.war,
          foundDate: new Date(),
          invited: false,
          rawScore: c.rawScore,
          potentialScore: c.potentialScore,
        });
      });
    } else {
      // Local scoring required
      const playersData: any[] = Registry.Services.Network.fetchRoyaleAPI(
        tagsToFetch.map(
          (t) => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`,
        ),
        remoteAvailable ? W : null,
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
        const logs: any[][] = Registry.Services.Network.fetchRoyaleAPI(logUrls);
        candidatesToProfile.forEach((p, idx) => {
          let hasWar = false;
          if (logs[idx]) {
            hasWar = logs[idx].some((b: any) =>
              ["riverRacePvP", "boatBattle", "riverRaceDuel"].includes(b.type),
            );
          }
          let totalWarScore = (p.warDayWins || 0);
          if (existingRecruits && existingRecruits.has(p.tag)) {
            totalWarScore = Math.max(
              totalWarScore,
              existingRecruits.get(p.tag)!.war,
            );
          }

          const rawScore = Registry.Services.ScoringSystem.calculateRecruitRawScore(
            p.trophies || 0,
            p.totalDonations || 0,
            p.warDayWins || 0,
            hasWar,
            W,
          );

          validCandidates.push({
            tag: p.tag,
            name: p.name,
            trophies: p.trophies,
            donations: p.totalDonations,
            cards: p.challengeCardsWon,
            war: totalWarScore,
            foundDate: new Date(),
            invited: false,
            rawScore: rawScore,
          });
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

export default HeadhunterScanner;
