/**
 * ============================================================================
 * 🔌 MODULE: API_PUBLIC (JSON REST API ROUTER)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Pure JSON REST API for the Vue 3 PWA frontend.
 *                 Replaces the legacy google.script.run bridge.
 * ⚙️ ARCHITECTURE: 
 *    - doGet(e): Handles all READ operations via ?action= parameter
 *    - doPost(e): Handles all WRITE operations via JSON body { action: ... }
 *    - Standard Envelope: { status, data, error, timestamp }
 * 🏷️ VERSION: 6.0.0
 * 
 * 🧠 REASONING:
 *    - Headless architecture enables hosting frontend on GitHub Pages as PWA
 *    - All responses are JSON with consistent envelope for easy client parsing
 *    - POST recommended from external origins to bypass GAS caching/CORS issues
 * ============================================================================
 */

const VER_API_PUBLIC = '6.0.0';

// ============================================================================
// 🌐 HTTP HANDLERS (Entry Points)
// ============================================================================

/**
 * GET Handler - Read Operations
 * Supports both ?action= query params and POST body for flexibility.
 * 
 * Endpoints:
 *   ?action=ping          - Health check
 *   ?action=getLeaderboard - Full leaderboard + recruiter data (cached)
 *   ?action=getRecruits   - Recruiter pool only
 *   ?action=getMembers    - Real-time clan members from Clash Royale API
 *   ?action=getWarLog     - River Race history
 * 
 * @param {Object} e - Event object with parameters
 * @return {TextOutput} JSON response
 */
function doGet(e) {
  try {
    const action = (e?.parameter?.action || '').toLowerCase().trim();

    switch (action) {
      case 'ping':
        return respond({
          version: VER_API_PUBLIC,
          status: 'online',
          modules: getModuleVersions()
        });

      case 'getleaderboard':
      case 'getwebappdata':
        // Returns cached leaderboard + recruiter data
        const webData = getWebAppData(false);
        // getWebAppData returns a JSON string, parse and re-wrap in envelope
        return respondRaw(webData);

      case 'getrecruits':
        const recruitData = getWebAppData(false);
        const parsed = JSON.parse(recruitData);
        if (parsed.success && parsed.data) {
          return respond({ hh: parsed.data.hh, timestamp: parsed.data.timestamp });
        }
        return respond(null, 'NO_DATA', 'Recruit data not available');

      case 'getmembers':
        return respond(getMembers());

      case 'getwarlog':
        return respond(getWarLog());

      case 'refresh':
        // Force refresh the cache
        const freshData = getWebAppData(true);
        return respondRaw(freshData);

      case '':
        return respond(null, 'NO_ACTION', 'Missing ?action= parameter. Available: ping, getLeaderboard, getRecruits, getMembers, getWarLog, refresh');

      default:
        return respond(null, 'INVALID_ACTION', `Unknown action: "${action}". Available: ping, getLeaderboard, getRecruits, getMembers, getWarLog, refresh`);
    }

  } catch (err) {
    console.error(`doGet CRITICAL ERROR: ${err.stack}`);
    return respond(null, 'SERVER_ERROR', err.message);
  }
}

/**
 * POST Handler - Write Operations & Alternative Read
 * Body format: { "action": "...", ...params }
 * 
 * Write Endpoints:
 *   action: "dismissRecruits" - Mark recruits as invited (ids: string[])
 * 
 * Read Endpoints (POST alternative for CORS):
 *   action: "getLeaderboard", "getRecruits", etc.
 * 
 * @param {Object} e - Event object with postData
 * @return {TextOutput} JSON response
 */
function doPost(e) {
  try {
    // Parse JSON body
    const body = e?.postData?.contents;
    if (!body) {
      return respond(null, 'EMPTY_BODY', 'POST request requires JSON body');
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch (parseErr) {
      return respond(null, 'PARSE_ERROR', `Invalid JSON: ${parseErr.message}`);
    }

    const action = (payload.action || '').toLowerCase().trim();

    switch (action) {
      // ========== WRITE OPERATIONS ==========
      case 'dismissrecruits':
        const ids = payload.ids;
        if (!ids || !Array.isArray(ids)) {
          return respond(null, 'INVALID_PARAMS', 'dismissRecruits requires "ids" array');
        }
        return respond(markRecruitsAsInvitedBulk(ids));

      // ========== TRIGGER OPERATIONS ==========
      case 'triggerupdate':
        return respond(triggerHeadlessUpdate());

      // ========== TRIGGER OPERATIONS ==========
      case 'triggerupdate':
        return respond(triggerHeadlessUpdate());

      // ========== READ OPERATIONS (POST alternative) ==========
      // Allow reads via POST for CORS flexibility
      case 'ping':
      case 'getleaderboard':
      case 'getwebappdata':
      case 'getrecruits':
      case 'getmembers':
      case 'getwarlog':
      case 'refresh':
        // Delegate to doGet logic by constructing a fake event
        return doGet({ parameter: { action: action } });

      case '':
        return respond(null, 'NO_ACTION', 'Missing "action" in POST body');

      default:
        return respond(null, 'INVALID_ACTION', `Unknown action: "${action}"`);
    }

  } catch (err) {
    console.error(`doPost CRITICAL ERROR: ${err.stack}`);
    return respond(null, 'SERVER_ERROR', err.message);
  }
}

// ============================================================================
// 📦 RESPONSE UTILITIES
// ============================================================================

/**
 * Creates a standardized JSON response envelope.
 * 
 * @param {any} data - Response data (null on error)
 * @param {string|null} errorCode - Error code (null on success)
 * @param {string|null} errorMessage - Human-readable error message
 * @return {TextOutput} GAS ContentService text output
 */
function respond(data, errorCode = null, errorMessage = null) {
  const envelope = {
    status: errorCode ? 'error' : 'success',
    data: errorCode ? null : data,
    error: errorCode ? { code: errorCode, message: errorMessage } : null,
    timestamp: new Date().toISOString()
  };

  return ContentService
    .createTextOutput(JSON.stringify(envelope))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Passes through a pre-formatted JSON string.
 * Used when getWebAppData already returns a properly formatted response.
 * 
 * @param {string} jsonString - Pre-formatted JSON string
 * @return {TextOutput} GAS ContentService text output
 */
function respondRaw(jsonString) {
  return ContentService
    .createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Collects version numbers from all modules for health monitoring.
 * 
 * @return {Object} Map of module names to versions
 */
function getModuleVersions() {
  return {
    API_PUBLIC: typeof VER_API_PUBLIC !== 'undefined' ? VER_API_PUBLIC : 'N/A',
    CONFIGURATION: typeof VER_CONFIGURATION !== 'undefined' ? VER_CONFIGURATION : 'N/A',
    CONTROLLER_WEBAPP: typeof VER_CONTROLLER_WEBAPP !== 'undefined' ? VER_CONTROLLER_WEBAPP : 'N/A',
    UTILITIES: typeof VER_UTILITIES !== 'undefined' ? VER_UTILITIES : 'N/A',
    LEADERBOARD: typeof VER_LEADERBOARD !== 'undefined' ? VER_LEADERBOARD : 'N/A',
    LOGGER: typeof VER_LOGGER !== 'undefined' ? VER_LOGGER : 'N/A',
    RECRUITER: typeof VER_RECRUITER !== 'undefined' ? VER_RECRUITER : 'N/A',
    SCORING_SYSTEM: typeof VER_SCORING_SYSTEM !== 'undefined' ? VER_SCORING_SYSTEM : 'N/A'
  };
}

// ============================================================================
// 📊 DATA FETCHERS (Clash Royale API)
// ============================================================================

/**
 * Fetches the current member list from the Clash Royale API.
 * Maps 'expLevel' (King Level) to 'kingLevel' to satisfy the UI interface.
 * 
 * @return {Array} List of clan members
 */
function getMembers() {
  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
  const data = Utils.fetchRoyaleAPI([`${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`]);

  if (!data || !data[0] || !data[0].items) {
    console.warn("API: getMembers returned no data.");
    return [];
  }

  return data[0].items.map(m => ({
    tag: m.tag,
    name: m.name,
    role: formatRole(m.role),
    kingLevel: m.expLevel,
    donations: m.donations,
    donationsReceived: m.donationsReceived
  }));
}

/**
 * Fetches the recent River Race Log (War Log).
 * Transforms complex RoyaleAPI standings into a simplified Win/Loss/Score format.
 * 
 * @return {Array} List of war log entries
 */
function getWarLog() {
  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
  const data = Utils.fetchRoyaleAPI([`${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/riverracelog?limit=52&__t=${new Date().getTime()}`]);

  if (!data || !data[0] || !data[0].items) {
    console.warn("API: getWarLog returned no data.");
    return [];
  }

  return data[0].items.map(r => {
    let myStanding = null;
    let opponents = [];

    if (r.standings) {
      myStanding = r.standings.find(s => s.clan.tag === CONFIG.SYSTEM.CLAN_TAG);
      opponents = r.standings.filter(s => s.clan.tag !== CONFIG.SYSTEM.CLAN_TAG);
    }

    const myFame = myStanding ? myStanding.clan.fame : 0;
    const myRank = myStanding ? myStanding.rank : null;

    const bestRival = opponents.sort((a, b) => b.clan.fame - a.clan.fame)[0];

    let result = 'lose';
    if (myRank === 1) result = 'win';
    if (myRank === null) result = 'n/a';

    return {
      result: result,
      endTime: parseCRDateISO(r.createdDate),
      opponent: bestRival ? bestRival.clan.name : 'No Opponent',
      teamSize: 50,
      score: myFame,
      opponentScore: bestRival ? bestRival.clan.fame : 0
    };
  });
}

// ============================================================================
// 🛠️ HELPER FUNCTIONS
// ============================================================================

/** 
 * Helper: Formats API role string to Title Case 
 * e.g. "coLeader" -> "Co-Leader"
 */
function formatRole(role) {
  if (role === 'leader') return 'Leader';
  if (role === 'coLeader') return 'Co-Leader';
  if (role === 'elder') return 'Elder';
  return 'Member';
}

/**
 * Helper: Parses RoyaleAPI ISO dates (YYYYMMDDThhmmss.000Z) to readable YYYY-MM-DD
 */
function parseCRDateISO(t) {
  if (!t) return new Date().toISOString().split('T')[0];
  const d = new Date(t.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2}).*/, '$1-$2-$3T$4:$5:$6Z'));
  return Utils.formatDate(d);
}

/**
 * 🤖 HEADLESS UPDATE TRIGGER
 * Runs the update sequence without UI interactions (toast/alert) to prevent API crashes.
 */
function triggerHeadlessUpdate() {
  console.log("🤖 API Trigger: Starting Headless Update...");

  return Utils.executeSafely('API_TRIGGER_UPDATE', () => {
    try {
      // 1. Update Leaderboard (Score calculation)
      updateLeaderboard();

      // 2. Refresh Payload (So the PWA sees the new data on next fetch)
      refreshWebPayload();

      return { success: true, message: "Backend updated successfully" };
    } catch (e) {
      console.error(`API Trigger Failed: ${e.message}`);
      throw e;
    }
  });
}