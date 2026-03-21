/**
 * MODULE: CONFIGURATION
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Single Source of Truth for the entire application.
 * ROLE: Controls API Keys, Endpoints, Layouts, Schemas, and the UI Menu.
 * VERSION: 10.0.20
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
 * APP CONFIG INTERFACE
 * Centralized definition for the entire application state.
 */
export interface AppConfig {
  SYSTEM: {
    MANIFEST: {
      CONFIGURATION: string;
      UTILITIES: string;
      ORCHESTRATOR: string;
      DATABASE: string;
      ROSTER: string;
      SCORING: string;
      SCORING_KERNEL: string;
      HEADHUNTER: string;
      CONTROLLER_WEBAPP: string;
      REGISTRY: string;
      API_PUBLIC: string;
      SHARED_TYPES: string;
      DATABASE_TYPES: string;
      NETWORK: string;
      SCHEMA: string;
      ROSTER_TYPES: string;
      HH_TYPES: string;
      VIEW: string;
      VALIDATION: string;
      REPORTING: string;
      DATABASE_STORE: string;
      BATTLE_LOG: string;
      STORE: string;
      TIME: string;
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
    MAX_BACKUPS: number;
    DATE_FORMAT_DATE: string;
    DATE_FORMAT_DATETIME: string;
    DATE_FORMAT_VALUE: string;
    PROPHET_TENURE_THRESHOLD: number;
    DB_PRUNE_THRESHOLD: number;
    ELITE_MEMBERSHIP_THRESHOLD: number;
  };
  SHEETS: {
    DB: string;
    ROSTER: string;
    HH: string;
    BL: string;
    EVT: string;
    QUEUE: string;
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
      ROSTER: string;
      HH: string;
      ALL: string;
      MOBILE: string;
      KEYS: string;
      HEALTH: string;
      TGR: string;
    };
  };
  SCHEMA: {
    ROSTER_HEADERS: Record<string, string>;
    HH_HEADERS: Record<string, string>;
    DB_HEADERS: Record<string, string>;
    DB: Record<string, number>;
    HH: Record<string, number>;
    ROSTER: Record<string, number>;
  };
  HEADHUNTER: {
    TARGET: number;
    BLACKLIST_DAYS: number;
    WEIGHTS: {
      TROPHY: number;
      DON: number;
      WAR: number;
      WAR_BASELINE_BONUS: number;
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
    MIN_TROPHIES: number; // Search override
    MAX_SHADOW_RECRUITS: number;
    BENCHMARK_CLAN_WEIGHT: number;
    BENCHMARK_MARKET_WEIGHT: number;
    REBUILD_MIN_PERCENTILE: number;
    MAX_QUEUE_SIZE: number;
    QUEUE_EXPIRY_DAYS: number;
    STRATEGY: {
      SCAN_FLOOR_FALLBACK: number;
      TROPHY_FLOOR_MAX: number;
      PERFORMANCE_BENCHMARK_MIN: number;
    };
  };
  ROSTER: {
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
      HERITAGE_DIVISOR: number;
    };
  };
  THEME: {
    PALETTE: {
      WORKSPACE: {
        DB: string;
        ROSTER: string;
        HH: string;
      };
      TECHNICAL: string;
      BACKUP: string;
      LEGACY: string;
      STRAY: string;
    };
    STATUS_BAR: {
      BG: string;
      FG: string;
    };
    TABLE: {
      HEADER_BG: string;
      ROW_ALT_BG: string;
      BORDER_DARK: string;
      BORDER_LIGHT: string;
    };
  };
}

// Global Version Constant for this file
export const VER_CONFIGURATION = "13.1.0";

// Fetch all script properties once at initialization
let _PROPS: Record<string, string> = {};
try {
  if (typeof PropertiesService !== "undefined") {
    _PROPS = PropertiesService.getScriptProperties().getProperties();
  }
} catch (e: any) {
  console.warn(
    "Could not fetch Script Properties (likely missing permissions). Defaulting to empty config.",
  );
}

export var CONFIG: AppConfig = {
  SYSTEM: {
    MANIFEST: {
      CONFIGURATION: "13.1.0",
      UTILITIES: "13.1.0",
      ORCHESTRATOR: "13.1.0",
      DATABASE: "13.1.0",
      ROSTER: "13.1.0",
      SCORING: "13.1.0",
      SCORING_KERNEL: "13.1.0",
      HEADHUNTER: "14.3.4", 
      CONTROLLER_WEBAPP: "13.1.0",
      REGISTRY: "13.1.0",
      API_PUBLIC: "13.1.0",
      SHARED_TYPES: "1.0.0",
      DATABASE_TYPES: "1.0.0",
      NETWORK: "1.0.1",
      SCHEMA: "1.0.0",
      ROSTER_TYPES: "1.0.0",
      HH_TYPES: "1.0.1",
      VIEW: "1.0.1",
      VALIDATION: "1.0.0",
      REPORTING: "1.2.0",
      DATABASE_STORE: "13.1.1",
      BATTLE_LOG: "1.0.0",
      STORE: "2.0.0",
      TIME: "1.0.1"
    },

    CLAN_TAG: _PROPS["ClanTag"] || "",
    PLAYER_TAG: _PROPS["PlayerTag"] || "",

    API_KEYS: Object.keys(_PROPS)
      .filter((key: string) => /^CRK\d+$/.test(key)) 
      .sort((a: string, b: string) => {
        const numA = parseInt(a.replace("CRK", ""), 10);
        const numB = parseInt(b.replace("CRK", ""), 10);
        return numA - numB;
      })
      .map((key: string) => ({ name: key, value: _PROPS[key]! }))
      .filter((k) => k.value && k.value.trim().length > 0),

    TIMEZONE: "Europe/Rome",
    API_BASE: "https://proxy.royaleapi.dev/v1",
    REMOTE_WORKER_URL: _PROPS["RemoteWorkerUrl"] || "https://clash-manager-worker.onrender.com",
    REMOTE_WORKER_SECRET:
      _PROPS["REMOTE_WORKER_SECRET"] || _PROPS["RemoteWorkerSecret"] || "",
    // UPDATE: Prioritize Script Property for PWA URL, fallback to default
    WEB_APP_URL:
      _PROPS["WebAppUrl"] || "https://albidr.github.io/Clash-Manager/",
    RETRY_MAX: 3,
    JSON_STORE_KEY: `WEB_APP_PAYLOAD_V${(typeof VER_API_PUBLIC !== "undefined"
      ? VER_API_PUBLIC
      : "10.0.0"
    ).replace(/\./g, "_")}_S5`, // S5 suffix for total absolute 1:1 sync
    DB_PURGE_DAYS: 7,
    MAX_BACKUPS: 5,
    DATE_FORMAT_DATE: "dd/MM/yyyy",
    DATE_FORMAT_DATETIME: "dd/MM/yyyy HH:mm",
    DATE_FORMAT_VALUE: "dd/MM/yyyy HH.mm.ss",
    PROPHET_TENURE_THRESHOLD: 10,
    DB_PRUNE_THRESHOLD: 10,
    ELITE_MEMBERSHIP_THRESHOLD: 41,
  },

  SHEETS: {
    DB: "Clan Database",
    ROSTER: "Leaderboard",
    HH: "Headhunter",
    BL: "HH_BLACKLIST",
    EVT: "HH_EVENT_LOG",
    QUEUE: "HH_QUEUE",
  },
  LAYOUT: { BUFFER_SIZE: 25, DATA_START_ROW: 3 },

  UI: {
    MENU_NAME: "Clan Manager",
    MOBILE_TRIGGER_CELL: "A1",
    MENU_ITEMS: {
      DB: "Sync Database",
      ROSTER: "Update Leaderboard",
      HH: "Scout Recruits",
      ALL: "Run Master Sequence",
      MOBILE: "Enable Mobile Controls",
      KEYS: "Verify API Keys",
      HEALTH: "Health Check",
      TGR: "Setup Triggers",
    },
  },

  SCHEMA: {
    ROSTER_HEADERS: {
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
      RAW_SCORE: "Performance Raw Score",
      PERF_SCORE: "Performance Score",
      TREND: "Trend",
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
      RAW_SCORE: "Potential Raw Score", // UPDATED: Explicit Naming
      POTENTIAL_SCORE: "Potential Score",
      LAST_SCAN: "Last Scan (Timestamp)",
    },
    DB_HEADERS: {
      DATE: "Date",
      TAG: "Tag",
      NAME: "Name",
      ROLE: "Role",
      TROPHIES: "Trophies",
      DON_GIVEN: "Donations Given",
      DON_REC: "Donations Received",
      LAST_SEEN: "Last Seen",
      WAR_FAME: "War Fame",
      BATTLE_CREDITS: "Battle Credits",
      DECKS_USED_TODAY: "War Decks Used Today",
      DECKS_USED_WEEKLY: "War Decks Used Weekly",
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
      DECKS_USED_TODAY: 10,
      DECKS_USED_WEEKLY: 11,
    },
    // Unified Schema: 0-based relative to Data Start (Column B)
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
      POTENTIAL_SCORE: 9,
      LAST_SCAN: 10,
    },
    ROSTER: {
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
    },
  },

  HEADHUNTER: {
    TARGET: 50,
    BLACKLIST_DAYS: 30,
    WEIGHTS: { TROPHY: 1.0, DON: 0.07, WAR: 20.0, WAR_BASELINE_BONUS: 500 },
    DEEP_SCAN: {
      LOCAL: { TOURNEYS: 600, PLAYERS: 500 },
      REMOTE: { TOURNEYS: 1500, PLAYERS: 1500 },
      MAX_TOURNEYS: 3000,
      MAX_PLAYERS: 3000,
    },
    BENCHMARK_DECAY: 0.0096, // ~1% Daily Decay (Day 30 = ~75% Value)
    BENCHMARK_PERCENTILE: 0.05, // Top 5% of valid pool
    BENCHMARK_MIN_POOL: 3, // Minimum 3 players for average
    MIN_TROPHIES: 0, // Set to >0 to override auto-threshold (e.g. 5000)
    MAX_SHADOW_RECRUITS: 100,
    BENCHMARK_CLAN_WEIGHT: 0.4,
    BENCHMARK_MARKET_WEIGHT: 0.6,
    REBUILD_MIN_PERCENTILE: 0.1,
    MAX_QUEUE_SIZE: 500,
    QUEUE_EXPIRY_DAYS: 30,
    STRATEGY: {
      SCAN_FLOOR_FALLBACK: 5000,
      TROPHY_FLOOR_MAX: 10000,
      PERFORMANCE_BENCHMARK_MIN: 50,
    },
    KEYWORDS: [
      "Open", "Join", "No pass", "Max", "8", "x", "k", "7", "l",
      "p", "5", "m", "j", "a", "s", "d", "f", "1", "2", "3"
    ],
  },

  ROSTER: {
    WEIGHTS: {
      FAME: 3,
      AVG_FAME: 15,
      DONATION: 50,
      TROPHY: 0.1,
      WAR_RATE: 150,
    },
    PENALTIES: {
      INACTIVITY_GRACE_DAYS: 4,
      DECAY_RATE: 0.08,
      HERITAGE_DIVISOR: 5,
    },
  },
  THEME: {
    PALETTE: {
      WORKSPACE: {
        DB: "#3f51b5", // Indigo
        ROSTER: "#00796b", // Emerald
        HH: "#c62828", // Vibrant Crimson
      },
      TECHNICAL: "#546e7a", // Slate
      BACKUP: "#455a64",    // Dark Slate
      LEGACY: "#eceff1",    // Light Mist
      STRAY: "#fbc02d",     // Vivid Yellow
    },
    STATUS_BAR: {
      BG: "#e9ecef", // Noticeable Light Grey
      FG: "#495057", // Dark Grey
    },
    TABLE: {
      HEADER_BG: "#f8f9fa",
      ROW_ALT_BG: "#f1f3f4",
      BORDER_DARK: "#000000",
      BORDER_LIGHT: "#dee2e6",
    },
  },
};

try { if (typeof module !== "undefined" && module.exports) { module.exports = { CONFIG, VER_CONFIGURATION }; } } catch (e) {}

/**
 * GLOBAL BRIDGE
 * Ensures CONFIG is available globally in both GAS and Node/Vitest environments.
 */
(function(scope: any) {
  if (scope) {
    scope.CONFIG = CONFIG;
    scope.VER_CONFIGURATION = VER_CONFIGURATION;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : {}));
