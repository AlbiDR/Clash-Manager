
/**
 * ============================================================================
 * 🏛️ MODULE: CONFIGURATION
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Single Source of Truth for the entire application.
 * ⚙️ ROLE: Controls API Keys, Endpoints, Layouts, Schemas, and the UI Menu.
 * 🏷️ VERSION: 10.0.7
 * ============================================================================
 */

// Define the global version constants for type safety
declare const VER_API_PUBLIC: string | undefined;

declare var SpreadsheetApp: any;
declare var LockService: any;
declare var PropertiesService: any;
declare var UrlFetchApp: any;
declare var CacheService: any;
declare var ContentService: any;
declare var Utilities: any;
declare var ScriptApp: any;
declare var Logger: any;
declare var module: any;

declare namespace GoogleAppsScript {
  export namespace Events {
    export type DoGet = any;
    export type DoPost = any;
    export type AppsScriptEvent = any;
    export type SheetsOnEdit = any;
  }
  export namespace Spreadsheet {
    export type Sheet = any;
    export type Spreadsheet = any;
    export type Range = any;
  }
  export namespace Content {
    export type TextOutput = any;
  }
}

/**
 * 🏛️ APP CONFIG INTERFACE
 * Centralized definition for the entire application state.
 */
export interface AppConfig {
  SYSTEM: {
    MANIFEST: {
      CONFIGURATION: string;
      UTILITIES: string;
      ORCHESTRATOR: string;
      LOGGER: string;
      LEADERBOARD: string;
      SCORING_SYSTEM: string;
      RECRUITER: string;
      CONTROLLER_WEBAPP: string;
      REGISTRY: string;
      API_PUBLIC: string;
    };
    CLAN_TAG: string;
    PLAYER_TAG: string;
    API_KEYS: Array<{ name: string; value: string }>;
    TIMEZONE: string;
    API_BASE: string;
    REMOTE_WORKER_URL: string;
    REMOTE_WORKER_SECRET: string;
    WEB_APP_URL: string;
    RETRY_MAX: number;
    JSON_STORE_KEY: string;
    DB_PURGE_DAYS: number;
    DB_ROW_LIMIT: number;
  };
  SHEETS: {
    DB: string;
    LB: string;
    HH: string;
    BL: string;
  };
  LAYOUT: {
    BUFFER_SIZE: number;
    DATA_START_ROW: number;
  };
  UI: {
    MENU_NAME: string;
    MOBILE_TRIGGER_CELL: string;
    MENU_ITEMS: {
      DB: string;
      LB: string;
      HH: string;
      ALL: string;
      MOBILE: string;
      KEYS: string;
      HEALTH: string;
    };
  };
  SCHEMA: {
    LB_HEADERS: Record<string, string>;
    HH_HEADERS: Record<string, string>;
    DB_HEADERS: Record<string, string>;
    DB: Record<string, number>;
    HH: Record<string, number>;
    LB: Record<string, number>;
  };
  HEADHUNTER: {
    TARGET: number;
    BLACKLIST_DAYS: number;
    KEYWORDS: string[];
    WEIGHTS: {
      TROPHY: number;
      DON: number;
      WAR: number;
    };
    DEEP_SCAN: {
      LOCAL: { TOURNEYS: number; PLAYERS: number };
      REMOTE: { TOURNEYS: number; PLAYERS: number };
      MAX_TOURNEYS: number;
      MAX_PLAYERS: number;
    };
    BENCHMARK_DECAY: number;
    BENCHMARK_PERCENTILE: number;
    BENCHMARK_MIN_POOL: number;
  };
  LEADERBOARD: {
    WEIGHTS: {
      FAME: number;
      AVG_FAME: number;
      DONATION: number;
      TROPHY: number;
      WAR_RATE: number;
    };
    PENALTIES: {
      INACTIVITY_GRACE_DAYS: number;
      DECAY_RATE: number;
    };
  };
}

// Global Version Constant for this file
const VER_CONFIGURATION = "10.0.7";

// Fetch all script properties once at initialization
let _PROPS: Record<string, string> = {};
try {
  _PROPS = PropertiesService.getScriptProperties().getProperties();
} catch (e) {
  console.warn(
    "Could not fetch Script Properties (likely missing permissions). Defaulting to empty config.",
  );
}

var CONFIG: AppConfig = {
  SYSTEM: {
    MANIFEST: {
      CONFIGURATION: "10.0.7",
      UTILITIES: "10.0.6",
      ORCHESTRATOR: "10.0.4",
      LOGGER: "10.0.1",
      LEADERBOARD: "10.0.1",
      SCORING_SYSTEM: "10.0.0",
      RECRUITER: "10.0.9",
      CONTROLLER_WEBAPP: "10.0.1",
      REGISTRY: "1.0.0",
      API_PUBLIC: "10.0.0",
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
    // ⚡ UPDATE: Prioritize Script Property for PWA URL, fallback to default
    WEB_APP_URL:
      _PROPS["WebAppUrl"] || "https://albidr.github.io/Clash-Manager/",
    RETRY_MAX: 3,
    JSON_STORE_KEY: `WEB_APP_PAYLOAD_V${(typeof VER_API_PUBLIC !== "undefined"
      ? VER_API_PUBLIC
      : "10.0.0"
    ).replace(/\./g, "_")}_S5`, // S5 suffix for total absolute 1:1 sync
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
    LB_HEADERS: {
      TAG: "Tag",
      NAME: "Name",
      ROLE: "Role",
      TROPHIES: "Trophies",
      DAYS: "Days Tracked",
      WEEKLY_REQ: "Received Weekly",
      AVG_DAY: "Average Daily Donations",
      TOTAL_DON: "Total Donations",
      LAST_SEEN: "Last Seen",
      WAR_RATE: "War Rate",
      AVG_WAR_FAME: "Average War Fame",
      HISTORY: "War History",
      RAW_SCORE: "Performance Raw Score", // ⚡ UPDATED: Explicit Naming
      PERF_SCORE: "Performance Score",
      TREND: "Trend",
      WAR_DAY_WINS: "War Day Wins",
    },
    HH_HEADERS: {
      TAG: "Tag",
      INVITED: "Invited",
      NAME: "Name",
      TROPHIES: "Trophies",
      DONATIONS: "Donations",
      CARDS: "Cards Won",
      WAR_WINS: "War Wins",
      FOUND_DATE: "Found Date",
      RAW_SCORE: "Potential Raw Score", // ⚡ UPDATED: Explicit Naming
      POTENTIAL_SCORE: "Potential Score",
    },
    DB_HEADERS: {
      TAG: "Tag",
      NAME: "Name",
      ROLE: "Role",
      TROPHIES: "Trophies",
      DON_GIVEN: "Donations Given",
      DON_REC: "Donations Received",
      LAST_SEEN: "Last Seen",
      DATE: "Date",
      WAR_FAME: "War Fame",
      BATTLE_CREDITS: "Battle Credits",
    },
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
      BATTLE_CREDITS: 9,
    },
    // Shifted HH indices +1 to align with absolute column A=0 (Buffer), B=1 (Data Start)
    HH: {
      TAG: 1,
      INVITED: 2,
      NAME: 3,
      TROPHIES: 4,
      DONATIONS: 5,
      CARDS: 6,
      WAR_WINS: 7,
      FOUND_DATE: 8,
      RAW_SCORE: 9,
      POTENTIAL_SCORE: 10,
    },
    LB: {
      TAG: 1,
      NAME: 2,
      ROLE: 3,
      TROPHIES: 4,
      DAYS: 5,
      WEEKLY_REQ: 6,
      AVG_DAY: 7,
      TOTAL_DON: 8,
      LAST_SEEN: 9,
      WAR_RATE: 10,
      AVG_WAR_FAME: 11,
      HISTORY: 12,
      RAW_SCORE: 13,
      PERF_SCORE: 14,
      TREND: 15,
      WAR_DAY_WINS: 16,
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

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = { CONFIG, VER_CONFIGURATION };
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { CONFIG, VER_CONFIGURATION });
