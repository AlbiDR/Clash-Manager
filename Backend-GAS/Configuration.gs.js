/**
 * ============================================================================
 * 🏛️ MODULE: CONFIGURATION
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Single Source of Truth for the entire application.
 * ⚙️ ROLE: Controls API Keys, Endpoints, Layouts, Schemas, and the UI Menu.
 * 🏷️ VERSION: 7.0.0
 * ============================================================================
 */

// Global Version Constant for this file
const VER_CONFIGURATION = "7.0.0";

// Fetch all script properties once at initialization
let _PROPS = {};
try {
  _PROPS = PropertiesService.getScriptProperties().getProperties();
} catch (e) {
  console.warn(
    "Could not fetch Script Properties (likely missing permissions). Defaulting to empty config.",
  );
}

const CONFIG = {
  SYSTEM: {
    MANIFEST: {
      CONFIGURATION: "7.0.0",
      UTILITIES: "7.0.0",
      ORCHESTRATOR_TRIGGERS: "7.0.0",
      LOGGER: "7.0.0",
      LEADERBOARD: "7.0.0",
      SCORING_SYSTEM: "7.0.0",
      RECRUITER: "7.0.0",
      CONTROLLER_WEBAPP: "7.0.0",
      API_PUBLIC: "7.0.0",
    },

    CLAN_TAG: _PROPS["ClanTag"] || "",
    PLAYER_TAG: _PROPS["PlayerTag"] || "",

    API_KEYS: Object.keys(_PROPS)
      .filter((key) => /^CRK\d+$/.test(key)) // Match CRK followed by one or more digits
      .sort((a, b) => {
        // Sort numerically by the number part (CRK2 before CRK10)
        const numA = parseInt(a.replace("CRK", ""), 10);
        const numB = parseInt(b.replace("CRK", ""), 10);
        return numA - numB;
      })
      .map((key) => ({ name: key, value: _PROPS[key] }))
      .filter((k) => k.value && k.value.trim().length > 0),

    TIMEZONE: "Europe/Rome",
    API_BASE: "https://proxy.royaleapi.dev/v1",
    REMOTE_WORKER_URL: _PROPS["RemoteWorkerUrl"] || "",
    REMOTE_WORKER_SECRET: _PROPS["RemoteWorkerSecret"] || "",
    WEB_APP_URL: "https://albidr.github.io/Clash-Manager/",
    RETRY_MAX: 3,
    JSON_STORE_KEY: `WEB_APP_PAYLOAD_V${(typeof VER_API_PUBLIC !== "undefined"
      ? VER_API_PUBLIC
      : "6.0.0"
    ).replace(/\./g, "_")}`,
    DB_PURGE_DAYS: 7,
    DB_ROW_LIMIT: 20000,
  },

  SHEETS: {
    DB: "Clan Database",
    LB: "Leaderboard",
    HH: "Headhunter",
    BL: "HH_BLACKLIST",
  },
  LAYOUT: { BUFFER_SIZE: 25, DATA_START_ROW: 3 },

  UI: {
    MENU_NAME: "👑 Clan Manager",
    MOBILE_TRIGGER_CELL: "A1",
    MENU_ITEMS: {
      DB: "☁️ Sync Database",
      LB: "🏆 Update Leaderboard",
      HH: "🔭 Scout Recruits",
      ALL: "🚀 Run Master Sequence",
      MOBILE: "📱 Enable Mobile Controls",
      KEYS: "🔑 Verify API Keys",
      HEALTH: "🛡️ Health Check",
    },
  },

  SCHEMA: {
    DB: {
      DATE: 0,
      TAG: 1,
      NAME: 2,
      ROLE: 3,
      TROPHIES: 4,
      DON_GIVEN: 5,
      DON_REC: 6,
      LAST_SEEN: 7,
      WAR_FAME: 8,
    },
    HH: {
      TAG: 0,
      INVITED: 1,
      NAME: 2,
      TROPHIES: 3,
      DONATIONS: 4,
      CARDS: 5,
      WAR_WINS: 6,
      FOUND_DATE: 7,
      RAW_SCORE: 8,
      PERF_SCORE: 9,
    },
    LB: {
      TAG: 0,
      NAME: 1,
      ROLE: 2,
      TROPHIES: 3,
      DAYS: 4,
      WEEKLY_REQ: 5,
      AVG_DAY: 6,
      TOTAL_DON: 7,
      LAST_SEEN: 8,
      WAR_RATE: 9,
      AVG_WAR_FAME: 10,
      HISTORY: 11,
      RAW_SCORE: 12,
      PERF_SCORE: 13,
      TREND: 14,
      WAR_DAY_WINS: 15, // WHY: Required for V7 Hybrid Benchmarking
    },
  },

  HEADHUNTER: {
    TARGET: 50,
    BLACKLIST_DAYS: 30,
    KEYWORDS: [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
      "m",
      "n",
      "o",
      "p",
      "q",
      "r",
      "s",
      "t",
      "u",
      "v",
      "w",
      "x",
      "y",
      "z",
    ],
    WEIGHTS: { TROPHY: 1.0, DON: 0.07, WAR: 20.0 },
    DEEP_SCAN: {
      LOCAL: { TOURNEYS: 300, PLAYERS: 250 },
      REMOTE: { TOURNEYS: 1000, PLAYERS: 1000 },
      MAX_TOURNEYS: 2000,
      MAX_PLAYERS: 2000,
    },
    BENCHMARK_DECAY: 0.0096, // ~1% Daily Decay (Day 30 = ~75% Value)
    BENCHMARK_PERCENTILE: 0.05, // Top 5% of valid pool
    BENCHMARK_MIN_POOL: 3, // Minimum 3 players for average
  },

  LEADERBOARD: {
    WEIGHTS: {
      FAME: 3,
      AVG_FAME: 15,
      DONATION: 50,
      TROPHY: 0.0002,
      WAR_RATE: 150,
    },
    PENALTIES: {
      INACTIVITY_GRACE_DAYS: 4,
      DECAY_RATE: 0.08,
    },
  },
};
