/**
 * ============================================================================
 * 🏛️ MODULE: CONFIGURATION
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Single Source of Truth for the entire application.
 * ⚙️ ROLE: Controls API Keys, Endpoints, Layouts, Schemas, and the UI Menu.
 * 🏷️ VERSION: 5.0.9
 * 
 * 🧠 REASONING:
 *    - Centralizing configuration prevents "Magic Strings" scattered across files.
 *    - The MANIFEST object allows the System Health Check to verify that the
 *      deployed code matches the expected versioning, critical for manual deployments.
 * ============================================================================
 */

// Global Version Constant for this file
const VER_CONFIGURATION = '5.0.9';

// Fetch all script properties once at initialization
// REASONING: Reduces calls to PropertiesService (slow) by fetching en masse.
let _PROPS = {};
try {
  _PROPS = PropertiesService.getScriptProperties().getProperties();
} catch (e) {
  console.warn("Could not fetch Script Properties (likely missing permissions). Defaulting to empty config.");
}

const CONFIG = {
  SYSTEM: {
    // 📋 MANIFEST: Defines the expected version for every module in the system.
    // REASONING: Used by 'checkSystemHealth' in Orchestrator to ensure no file was missed during manual deployment.
    MANIFEST: {
      CONFIGURATION: '5.0.9',
      UTILITIES: '5.1.0', 
      ORCHESTRATOR_TRIGGERS: '5.0.2', 
      LOGGER: '5.0.1', 
      LEADERBOARD: '5.0.3', 
      SCORING_SYSTEM: '5.1.2', 
      RECRUITER: '5.1.1', 
      CONTROLLER_WEBAPP: '6.0.2', 
      API_PUBLIC: '6.0.0'
    },
    
    // Dynamic Configuration from Script Properties
    CLAN_TAG: _PROPS['ClanTag'] || '', 
    PLAYER_TAG: _PROPS['PlayerTag'] || '',
    
    // Pool of API Keys for rotation/redundancy
    // REASONING: RoyaleAPI has rate limits. We rotate keys in Utilities.gs to distribute load.
    // Structure changed to Objects to identify WHICH key fails in logs.
    API_KEYS: [
      { name: 'CRK1', value: _PROPS['CRK1'] },
      { name: 'CRK2', value: _PROPS['CRK2'] },
      { name: 'CRK3', value: _PROPS['CRK3'] },
      { name: 'CRK4', value: _PROPS['CRK4'] },
      { name: 'CRK5', value: _PROPS['CRK5'] },
      { name: 'CRK6', value: _PROPS['CRK6'] },
      { name: 'CRK7', value: _PROPS['CRK7'] },
      { name: 'CRK8', value: _PROPS['CRK8'] },
      { name: 'CRK9', value: _PROPS['CRK9'] },
      { name: 'CRK10', value: _PROPS['CRK10'] }
    ].filter(k => k.value && k.value.trim().length > 0), // Filter out empty or undefined keys
    
    TIMEZONE: 'Europe/Rome',
    API_BASE: 'https://proxy.royaleapi.dev/v1',
    
    // 🌍 FRONTEND URL: The public URL where your React App is hosted.
    // This is NOT sensitive information (it's just a website link), so it is safe to hardcode.
    // Used to generate hyperlinks in the Google Sheet (e.g. clicking a name opens the app).
    WEB_APP_URL: 'https://albidr.github.io/Clash-Manager/',
    
    RETRY_MAX: 3,
    
    // 💥 CACHE BUST: Key updated to V5_0_4 to force flush of old data (100 week history update).
    JSON_STORE_KEY: 'WEB_APP_PAYLOAD_V5_0_4',
    
    // 🧹 DATA HYGIENE: 
    // REASONING: Google Sheets gets slow with >50k rows. We must aggressively prune old data.
    // Updated: Reduced from 14 to 7 days to keep database lean.
    DB_PURGE_DAYS: 7,
    
    // 🛡️ FAILSAFE: Max rows before we stop appending to prevent crashes (approx 1 year of data).
    DB_ROW_LIMIT: 20000 
  },

  SHEETS: { DB: 'Clan Database', LB: 'Leaderboard', HH: 'Headhunter' },
  LAYOUT: { BUFFER_SIZE: 25, DATA_START_ROW: 3 },
  
  UI: { 
    MENU_NAME: '👑 Clan Manager',
    MOBILE_TRIGGER_CELL: 'A1', // 📱 Dedicated cell for Mobile Checkbox
    // REASONING: Centralized strings for the custom menu to allow easy UI tweaks.
    MENU_ITEMS: {
      DB: '☁️ Sync Database',
      LB: '🏆 Update Leaderboard',
      HH: '🔭 Scout Recruits',
      ALL: '🚀 Run Master Sequence',
      MOBILE: '📱 Enable Mobile Controls', // New Setup Item
      HEALTH: '🛡️ Health Check'
    }
  },

  // REASONING: Column indices are defined here. If columns move in the sheet,
  // we update numbers here rather than hunting down hardcoded indices in scripts.
  SCHEMA: {
    DB: { 
      DATE: 0, TAG: 1, NAME: 2, ROLE: 3, TROPHIES: 4, 
      DON_GIVEN: 5, DON_REC: 6, LAST_SEEN: 7, WAR_FAME: 8 
    }, 
    HH: { TAG: 0, INVITED: 1, NAME: 2, TROPHIES: 3, DONATIONS: 4, CARDS: 5, WAR_WINS: 6, FOUND_DATE: 7, RAW_SCORE: 8, PERF_SCORE: 9 },
    LB: { 
      TAG: 0, NAME: 1, ROLE: 2, TROPHIES: 3, 
      DAYS: 4, WEEKLY_REQ: 5, AVG_DAY: 6, 
      TOTAL_DON: 7, LAST_SEEN: 8, WAR_RATE: 9, 
      HISTORY: 10, RAW_SCORE: 11, PERF_SCORE: 12 
    }
  },

  HEADHUNTER: {
    TARGET: 50,
    BLACKLIST_DAYS: 7, // 🚫 Invited recruits are ignored for 7 days
    // 🌐 FULL SPECTRUM SEARCH
    // Scans every letter (a-z) and number (0-9) to ensure maximum coverage.
    // The "Deep Net" protocol in Recruiter.gs deduplicates the results efficiently.
    KEYWORDS: [
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'
    ],
    WEIGHTS: { TROPHY: 1.0, DON: 0.07, WAR: 20.0 }
  },
  
  LEADERBOARD: { 
    // Weights for calculating Raw Score
    // WAR_RATE: 100 means 100% War Rate adds 10,000 points to score (Veteran Bonus)
    // TROPHY: Reduced to 0.0002 (10k trophies = 2 pts) to prevent empty stats players from ranking high.
    WEIGHTS: { FAME: 6, DONATION: 42, TROPHY: 0.0002, WAR_RATE: 100 },
    
    // Penalties applied to the score based on inactivity
    PENALTIES: {
      INACTIVITY_GRACE_DAYS: 4, // 4 days grace period before penalty kicks in
      DECAY_RATE: 0.08          // Exponential decay: Score retains (1 - 0.08)^Days. ~92% retention per day.
    }
  }
};
