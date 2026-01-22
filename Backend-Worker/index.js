/**
 * @file index.js (Remote Worker)
 * @description High-concurrency proxy and computational offload layer for Clash Manager.
 * @remarks
 * This module is designed to bypass Google Apps Script (GAS) limitations:
 * 1. Quota: Circummvents UrlFetchApp daily limits by using standard Node.js networking.
 * 2. Concurrency: Parallelizes API requests which GAS can only perform sequentially.
 * 3. Timeouts: Handles long-running batch operations that exceed the GAS 6-minute execution limit.
 *
 * It uses a shared scoring engine from the Backend-GAS directory to ensure mathematical parity
 * between the Cloud Core and Cloud Worker.
 */

const express = require("express");
const fetch = require("node-fetch");

// Shared logic from sibling directory. Required for algorithm consistency.
const ScoringSystem = require("../Backend-GAS/ScoringSystem.js");

const app = express();

// CORS MIDDLEWARE (Allow PWA to hit this directly)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // In production, lock this to your PWA domain
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: "50mb" }));

const DEFAULT_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "20", 10);
const DEFAULT_TIMEOUT = parseInt(process.env.WORKER_TIMEOUT_SEC || "45", 10) * 1000;
const MAX_RETRIES = parseInt(process.env.WORKER_RETRIES || "2", 10);

/**
 * Executes a fetch request with a hard timeout.
 *
 * @remarks
 * Native node-fetch timeout can be unreliable for specific socket hangs.
 * Promise.race ensures the event loop is released if the upstream API becomes unresponsive.
 *
 * @param {string} url - Target API endpoint.
 * @param {Object} opts - Fetch configuration (headers, method, etc.).
 * @param {number} timeout - Timeout in milliseconds.
 * @returns {Promise<Response>}
 */
function timeoutFetch(url, opts = {}, timeout = DEFAULT_TIMEOUT) {
  return Promise.race([
    fetch(url, { ...opts, timeout }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeout)),
  ]);
}

/**
 * Wraps fetch with an exponential backoff retry strategy.
 *
 * @remarks
 * The Clash Royale API frequently returns 429 (Rate Limit) or 503 (Maintenance).
 * Retries are essential for batch stability in the GAS environment where a
 * single failure can crash the entire ETL sequence.
 *
 * @param {string} url - Target API endpoint.
 * @param {Object} opts - Fetch configuration.
 * @param {number} retries - Maximum number of retry attempts.
 * @returns {Promise<{code: number, content: any}>}
 */
async function fetchWithRetries(url, opts, retries = MAX_RETRIES) {
  let attempt = 0;
  let lastErr = null;
  while (attempt <= retries) {
    try {
      const res = await timeoutFetch(url, opts);
      const code = res.status;
      let content = null;
      const text = await res.text();
      try {
        content = JSON.parse(text);
      } catch (e) {
        content = text; // Fallback to raw text if JSON parsing fails
      }
      return { code, content };
    } catch (e) {
      lastErr = e;
      attempt++;
      // Wait (500ms * attempt) before next try to reduce pressure on the API
      if (attempt <= retries) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return {
    code: 520,
    content: `Fetch failed: ${lastErr ? lastErr.message : "unknown"}`,
  };
}

/**
 * Generates a canonical War Week ID (e.g., "24W15").
 *
 * @remarks
 * This function MUST maintain 100% parity with the GAS implementation in Leaderboard.js.
 * It aligns dates to Thursday (standard Clan War start) to ensure consistent historical tracking.
 *
 * @param {string} dateStr - ISO 8601 or CR-specific timestamp.
 * @returns {string} The formatted Week ID.
 */
function calculateWarWeekId(dateStr) {
  if (!dateStr) return "Unknown";

  // Handle Clash Royale's compressed timestamp format (YYYYMMDDTHHMMSS.000Z)
  let date;
  if (/^\d{8}T\d{6}/.test(dateStr)) {
      const y = parseInt(dateStr.substr(0, 4), 10);
      const m = parseInt(dateStr.substr(4, 2), 10) - 1;
      const d = parseInt(dateStr.substr(6, 2), 10);
      const h = parseInt(dateStr.substr(9, 2), 10);
      const min = parseInt(dateStr.substr(11, 2), 10);
      const s = parseInt(dateStr.substr(13, 2), 10);
      date = new Date(Date.UTC(y, m, d, h, min, s));
  } else {
      date = new Date(dateStr);
  }

  // Adjust to Thursday (War Start)
  const d = new Date(date.getTime());
  d.setUTCHours(0,0,0,0);

  // The ISO week-year logic used here ensures that if a war spans a year boundary,
  // it is attributed correctly to the year it started in.
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  
  const year = d.getUTCFullYear();
  const week1 = new Date(Date.UTC(year, 0, 4));
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7);
  const yearShort = year.toString().slice(-2);
  
  return `${yearShort}W${weekNum.toString().padStart(2, "0")}`;
}

/**
 * Processes a batch of URLs using a fixed-size worker pool.
 *
 * @remarks
 * This implements a semaphore-like pattern to control concurrency.
 * High concurrency (e.g., >50) risks triggering upstream WAFs or exhausting Node.js memory.
 *
 * @param {string[]} urls - List of URLs to fetch.
 * @param {string[]} apiKeys - Pool of API keys for round-robin rotation.
 * @param {number} concurrency - Max simultaneous requests.
 * @param {Object|null} scoring - Weights and parameters for the ScoringSystem engine.
 * @returns {Promise<Array>} Results of the batch processing.
 */
async function processBatch(urls = [], apiKeys = [], concurrency = DEFAULT_CONCURRENCY, scoring = null) {
  const results = new Array(urls.length);
  let idx = 0;

  /**
   * Internal worker function that pulls tasks from the shared index.
   */
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= urls.length) return;
      const url = urls[i];

      const headers = {
        "User-Agent": "ClanManagerWorker/1.0",
        "Accept-Encoding": "gzip", // Minimize bandwidth for large response bodies
      };
      if (apiKeys && apiKeys.length > 0) {
        // Round-robin selection reduces the risk of hitting per-key rate limits
        const key = apiKeys[Math.floor(Math.random() * apiKeys.length)];
        headers.Authorization = `Bearer ${key}`;
      }

      // Special logic for player scoring: requires fetching both profile AND battlelog
      if (scoring && url.includes("/players/") && !url.includes("/battlelog")) {
        try {
          const profile = await fetchWithRetries(url, { method: "GET", headers });
          if (profile.code === 200 && profile.content && profile.content.tag) {
            const logUrl = url + "/battlelog";
            const logs = await fetchWithRetries(logUrl, { method: "GET", headers });

            let hasWar = false;
            if (logs.code === 200 && Array.isArray(logs.content)) {
              hasWar = logs.content.some((b) =>
                ["riverRacePvP", "boatBattle", "riverRaceDuel"].includes(b.type)
              );
            }

            const p = profile.content;
            
            // LOGIC SYNC: Use Shared Scoring System
            const rawScore = ScoringSystem.calculateRecruitRawScore(
                p.trophies || 0,
                p.totalDonations || 0,
                p.warDayWins || 0,
                hasWar,
                scoring // Inject weights passed from GAS
            );

            // Calculate War Score for display/consistency with old format
            const warBonus = hasWar ? 500 : 0;
            const totalWarScore = (p.warDayWins || 0) + warBonus;

            results[i] = {
              code: 200,
              content: {
                tag: p.tag,
                name: p.name,
                trophies: p.trophies,
                donations: p.totalDonations,
                cards: p.challengeCardsWon,
                war: totalWarScore,
                rawScore: rawScore,
              },
            };
          } else {
            results[i] = profile;
          }
        } catch (e) {
          results[i] = { code: 500, content: `Scoring fetch failed: ${e.message}` };
        }
      } else {
        const res = await fetchWithRetries(url, { method: "GET", headers });
        results[i] = res;
      }
    }
  }

  const workers = [];
  const spawn = Math.min(concurrency, urls.length);
  for (let i = 0; i < spawn; i++) workers.push(worker());
  await Promise.all(workers);

  if (scoring) {
    return results
      .filter((r) => r && r.code === 200 && r.content && r.content.rawScore !== undefined)
      .sort((a, b) => b.content.rawScore - a.content.rawScore)
      .slice(0, 200);
  }

  return results;
}

// TOURNAMENT SCAN ENGINE
async function processScanBatch(
  tags = [],
  apiKeys = [],
  concurrency = DEFAULT_CONCURRENCY,
  blacklistSet = new Set(),
  minTrophies = 4000
) {
  const candidates = [];
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= tags.length) return;
      const tag = tags[i];
      const url = `https://api.clashroyale.com/v1/tournaments/${encodeURIComponent(tag)}`;

      const headers = {
        "User-Agent": "ClanManagerWorker/1.0",
        "Accept-Encoding": "gzip",
      };
      if (apiKeys && apiKeys.length > 0) {
        const key = apiKeys[Math.floor(Math.random() * apiKeys.length)];
        headers.Authorization = `Bearer ${key}`;
      }

      try {
        const res = await fetchWithRetries(url, { method: "GET", headers });
        if (res.code === 200 && res.content && res.content.membersList) {
           // IN-MEMORY FILTERING
           res.content.membersList.forEach(p => {
             if (p.trophies < minTrophies) return;
             if (p.clan && p.clan.tag) return;
             if (blacklistSet.has(p.tag)) return;
             candidates.push(p);
           });
        }
      } catch (e) {
        console.warn(`Scan error for ${tag}: ${e.message}`);
      }
    }
  }

  const workers = [];
  const spawn = Math.min(concurrency, tags.length);
  for (let i = 0; i < spawn; i++) workers.push(worker());
  await Promise.all(workers);

  return candidates;
}

function checkAuth(req, res, next) {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return next();
  const auth = (req.get("authorization") || "").trim();
  if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: "unauthorized" });
  return next();
}

app.get("/", (req, res) => res.send("Clash Manager Worker is running"));

app.get("/capabilities", checkAuth, (req, res) => {
  return res.json({
    version: "10.0.0",
    concurrency: DEFAULT_CONCURRENCY,
    timeoutMs: DEFAULT_TIMEOUT,
    maxRetries: MAX_RETRIES,
  });
});

app.post("/audit", checkAuth, async (req, res) => {
  try {
    const { apiKeys } = req.body;
    if (!Array.isArray(apiKeys)) return res.status(400).json({ error: "apiKeys must be array" });

    const auditUrl = "https://api.clashroyale.com/v1/cards"; 
    const tasks = apiKeys.map(async (key) => {
        try {
            const response = await timeoutFetch(auditUrl, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${key}`,
                    "User-Agent": "ClanManagerWorker/Audit"
                }
            }, 5000);
            return { key, status: response.status };
        } catch (e) {
            return { key, status: 500, error: e.message };
        }
    });

    const results = await Promise.all(tasks);
    return res.json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * PUBLIC SCAN (DIRECT PWA ACCESS)
 *
 * @remarks
 * This endpoint allows the Frontend PWA to initiate scans without routing
 * through Google Apps Script. This reduces latency for interactive recruiter
 * searches and preserves GAS execution time for core ETL tasks.
 */
app.post("/public/scan", async (req, res) => {
  try {
    const { tags, blacklist, minTrophies, scoring } = req.body;
    // Note: API Keys are injected from process.env in a real worker deployment
    // or passed via req.body if the client is trusted (not ideal for public PWA).
    // For this implementation, we assume the Worker has env keys or accepts keys.
    // Ideally, the Worker should have its own pool of keys.
    
    // Fallback: If client sends keys (legacy), use them. If not, check env.
    const apiKeys = req.body.apiKeys || (process.env.API_KEYS ? process.env.API_KEYS.split(',') : []);
    
    if (!Array.isArray(tags)) return res.status(400).json({ error: "tags must be array" });
    
    const blacklistSet = new Set(blacklist || []);
    const concurrency = Number(process.env.WORKER_CONCURRENCY || req.query.c || DEFAULT_CONCURRENCY);

    // 1. Initial Scan
    const candidates = await processScanBatch(
      tags,
      apiKeys,
      concurrency,
      blacklistSet,
      minTrophies || 4000
    );

    // 2. Deep Scoring
    if (scoring && candidates.length > 0) {
      const candidateTags = [...new Set(candidates.map(c => c.tag))];
      const playerUrls = candidateTags.map(t => `https://api.clashroyale.com/v1/players/${encodeURIComponent(t)}`);
      
      const scoredResults = await processBatch(
        playerUrls, 
        apiKeys, 
        concurrency, 
        scoring
      );

      return res.json({ 
        candidates: scoredResults.map(r => r.content).filter(c => c && c.tag) 
      });
    }
    
    return res.json({ candidates });
  } catch (e) {
    console.error("Failed /public/scan", e);
    return res.status(500).json({ error: e.message });
  }
});

// PUSH SUBSCRIPTION ENDPOINT
// Stores PWA push subscriptions (In-Memory for now, replacing with DB recommended)
const _subs = new Set();
app.post("/public/subscribe", (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: "Invalid subscription" });
  
  _subs.add(JSON.stringify(sub));
  console.log(`New Push Subscription. Total: ${_subs.size}`);
  return res.json({ success: true, count: _subs.size });
});

// Internal Scan Endpoint (Auth required)
app.post("/scan", checkAuth, async (req, res) => {
  try {
    const { tags, apiKeys, blacklist, minTrophies, scoring } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ error: "tags must be array" });
    
    const blacklistSet = new Set(blacklist || []);
    const concurrency = Number(process.env.WORKER_CONCURRENCY || req.query.c || DEFAULT_CONCURRENCY);

    const candidates = await processScanBatch(
      tags,
      apiKeys || [],
      concurrency,
      blacklistSet,
      minTrophies || 4000
    );

    if (scoring && candidates.length > 0) {
      const candidateTags = [...new Set(candidates.map(c => c.tag))];
      const playerUrls = candidateTags.map(t => `https://api.clashroyale.com/v1/players/${encodeURIComponent(t)}`);
      
      const scoredResults = await processBatch(
        playerUrls, 
        apiKeys || [], 
        concurrency, 
        scoring
      );

      return res.json({ 
        candidates: scoredResults.map(r => r.content).filter(c => c && c.tag) 
      });
    }
    
    return res.json({ candidates });
  } catch (e) {
    console.error("Failed /scan", e);
    return res.status(500).json({ error: e.message });
  }
});

// FULL CLAN CONTEXT (Optimized for Leaderboard)
app.post("/clan/full", checkAuth, async (req, res) => {
  try {
    const { tag, apiKeys } = req.body;
    if (!tag) return res.status(400).json({ error: "tag required" });

    const cleanTag = encodeURIComponent(tag);
    const urls = [
      `https://api.clashroyale.com/v1/clans/${cleanTag}/members`,
      `https://api.clashroyale.com/v1/clans/${cleanTag}/currentriverrace`,
      `https://api.clashroyale.com/v1/clans/${cleanTag}/riverracelog?limit=52`
    ];

    const results = await processBatch(urls, apiKeys, 3, null);
    
    const membersData = results[0].code === 200 ? results[0].content : null;
    const raceData = results[1].code === 200 ? results[1].content : null;
    const logData = results[2].code === 200 ? results[2].content : null;

    if (!membersData) {
      return res.status(500).json({ error: "Failed to fetch members" });
    }

    // PRE-PROCESS HISTORY
    // Offload the O(W x M) iteration from GAS to Node
    const warHistory = {}; // tag -> { weekId: fame }
    
    if (logData && logData.items) {
      logData.items.forEach(log => {
        const weekId = calculateWarWeekId(log.createdDate);
        const standings = log.standings || [];
        const myClan = standings.find(s => s.clan.tag === tag);
        
        if (myClan && myClan.clan.participants) {
          myClan.clan.participants.forEach(p => {
            if (!warHistory[p.tag]) warHistory[p.tag] = {};
            // Track max fame if duplicate week entries exist (rare but possible)
            warHistory[p.tag][weekId] = Math.max(warHistory[p.tag][weekId] || 0, p.fame);
          });
        }
      });
    }

    return res.json({
      members: membersData,
      race: raceData,
      history: warHistory
    });

  } catch (e) {
    console.error("Failed /clan/full", e);
    return res.status(500).json({ error: e.message });
  }
});

// PUBLIC API OFFLOAD (Frontend Data Proxy)
app.post("/clan/api", checkAuth, async (req, res) => {
  try {
    const { tag, type, apiKeys } = req.body;
    if (!tag) return res.status(400).json({ error: "tag required" });
    if (!type) return res.status(400).json({ error: "type required" });

    const cleanTag = encodeURIComponent(tag);
    let url = "";
    
    if (type === "members") {
      url = `https://api.clashroyale.com/v1/clans/${cleanTag}/members`;
    } else if (type === "warlog") {
      url = `https://api.clashroyale.com/v1/clans/${cleanTag}/riverracelog?limit=52`;
    } else {
      return res.status(400).json({ error: "invalid type" });
    }

    const { code, content } = await fetchWithRetries(url, {
      method: "GET",
      headers: {
        "User-Agent": "ClanManagerWorker/1.0",
        "Authorization": `Bearer ${apiKeys && apiKeys.length > 0 ? apiKeys[0] : ""}`
      }
    });

    if (code !== 200) {
      return res.status(code).json({ error: "upstream error", details: content });
    }

    // TRANSFORM DATA (Mimics GAS Logic)
    let transformed = [];

    if (type === "members" && content.items) {
      const formatRole = (role) => ({ leader: "Leader", coLeader: "Co-Leader", elder: "Elder" })[role] || "Member";
      transformed = content.items.map(m => ({
        tag: m.tag,
        name: m.name,
        role: formatRole(m.role),
        kingLevel: m.expLevel,
        donations: m.donations,
        donationsReceived: m.donationsReceived
      }));
    } else if (type === "warlog" && content.items) {
      const parseCRDateISO = (t) => {
        if (!t) return new Date().toISOString().split("T")[0];
        // 20240101T120000.000Z -> 2024-01-01
        return t.substring(0,4) + "-" + t.substring(4,6) + "-" + t.substring(6,8);
      };

      transformed = content.items.map(r => {
        let myStanding = null;
        let opponents = [];
        
        if (r.standings) {
          myStanding = r.standings.find(s => s.clan.tag === tag); // Tag passed in body
          opponents = r.standings.filter(s => s.clan.tag !== tag);
        }

        const myFame = myStanding ? myStanding.clan.fame : 0;
        const myRank = myStanding ? myStanding.rank : null;
        const bestRival = opponents.sort((a, b) => b.clan.fame - a.clan.fame)[0];

        let result = "lose";
        if (myRank === 1) result = "win";
        if (myRank === null) result = "n/a";

        return {
          result: result,
          endTime: parseCRDateISO(r.createdDate),
          opponent: bestRival ? bestRival.clan.name : "No Opponent",
          teamSize: 50,
          score: myFame,
          opponentScore: bestRival ? bestRival.clan.fame : 0
        };
      });
    }

    return res.json({ data: transformed });

  } catch (e) {
    console.error("Failed /clan/api", e);
    return res.status(500).json({ error: e.message });
  }
});

app.post("/fetch", checkAuth, async (req, res) => {
  try {
    const { urls, apiKeys, scoring } = req.body;
    if (!Array.isArray(urls)) return res.status(400).json({ error: "urls must be array" });
    const concurrency = Number(process.env.WORKER_CONCURRENCY || req.query.c || DEFAULT_CONCURRENCY);

    const results = await processBatch(urls, apiKeys || [], concurrency, scoring);
    return res.json({ results });
  } catch (e) {
    console.error("Failed /fetch", e);
    return res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Worker listening on ${PORT} (concurrency=${DEFAULT_CONCURRENCY})`));
