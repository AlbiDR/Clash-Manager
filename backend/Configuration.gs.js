
/**
 * ============================================================================
 * 🏛️ MODULE: CONFIGURATION
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Single Source of Truth for the entire application.
 * ⚙️ ROLE: Controls API Keys, Endpoints, Layouts, Schemas, and the UI Menu.
 * 🏷️ VERSION: 6.2.2
 * ============================================================================
 */

// Global Version Constant for this file
const VER_CONFIGURATION = '6.2.2';

// Fetch all script properties once at initialization
let _PROPS = {};
try {
  _PROPS = PropertiesService.getScriptProperties().getProperties();
} catch (e) {
  console.warn("Could not fetch Script Properties (likely missing permissions). Defaulting to empty config.");
}

const CONFIG = {
  SYSTEM: {
    MANIFEST: {
      CONFIGURATION: '6.2.2',
      UTILITIES: '6.0.0',
      ORCHESTRATOR_TRIGGERS: '6.0.0',
      LOGGER: '6.0.0',
      LEADERBOARD: '6.1.5',
      SCORING_SYSTEM: '6.0.0',
      RECRUITER: '6.2.2', 
      CONTROLLER_WEBAPP: '6.1.2',
      API_PUBLIC: '6.0.0'
    },

    CLAN_TAG: _PROPS['ClanTag'] || '',
    PLAYER_TAG: _PROPS['PlayerTag'] || '',

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
    ].filter(k => k.value && k.value.trim().length > 0), 

    TIMEZONE: 'Europe/Rome',
    API_BASE: 'https://proxy.royaleapi.dev/v1',
    WEB_APP_URL: 'https://albidr.github.io/Clash-Manager/',
    RETRY_MAX: 3,
    JSON_STORE_KEY: `WEB_APP_PAYLOAD_V${(typeof VER_API_PUBLIC !== 'undefined' ? VER_API_PUBLIC : '6.0.0').replace(/\./g, '_')}`,
    DB_PURGE_DAYS: 7,
    DB_ROW_LIMIT: 20000
  },

  SHEETS: { DB: 'Clan Database', LB: 'Leaderboard', HH: 'Headhunter' },
  LAYOUT: { BUFFER_SIZE: 25, DATA_START_ROW: 3 },

  UI: {
    MENU_NAME: '👑 Clan Manager',
    MOBILE_TRIGGER_CELL: 'A1', 
    MENU_ITEMS: {
      DB: '☁️ Sync Database',
      LB: '🏆 Update Leaderboard',
      HH: '🔭 Scout Recruits',
      ALL: '🚀 Run Master Sequence',
      MOBILE: '📱 Enable Mobile Controls',
      HEALTH: '🛡️ Health Check'
    }
  },

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
      HISTORY: 10, RAW_SCORE: 11, PERF_SCORE: 12,
      TREND: 13 
    }
  },

  HEADHUNTER: {
    TARGET: 50,
    BLACKLIST_DAYS: 14, 
    KEYWORDS: [
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'
    ],
    WEIGHTS: { TROPHY: 1.0, DON: 0.07, WAR: 20.0 }
  },

  LEADERBOARD: {
    WEIGHTS: { FAME: 3, AVG_FAME: 15, DONATION: 50, TROPHY: 0.0002, WAR_RATE: 150 },
    PENALTIES: {
      INACTIVITY_GRACE_DAYS: 4, 
      DECAY_RATE: 0.08          
    }
  }
};

