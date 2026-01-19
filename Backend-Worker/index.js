const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json({ limit: "50mb" }));

const DEFAULT_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "20", 10);
const DEFAULT_TIMEOUT = parseInt(process.env.WORKER_TIMEOUT_SEC || "45", 10) * 1000;
const MAX_RETRIES = parseInt(process.env.WORKER_RETRIES || "2", 10);

function timeoutFetch(url, opts = {}, timeout = DEFAULT_TIMEOUT) {
  return Promise.race([
    fetch(url, { ...opts, timeout }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeout)),
  ]);
}

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
        content = text;
      }
      return { code, content };
    } catch (e) {
      lastErr = e;
      attempt++;
      if (attempt <= retries) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return {
    code: 520,
    content: `Fetch failed: ${lastErr ? lastErr.message : "unknown"}`,
  };
}

// Helper: Calculate War Week ID (Matches GAS Implementation)
function calculateWarWeekId(dateStr) {
  if (!dateStr) return "Unknown";
  // Parse ISO string to Date
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
  // Logic aligned with GAS: date.getDate() + 3 - ((date.getDay() + 6) % 7)
  const d = new Date(date.getTime());
  d.setUTCHours(0,0,0,0);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1) + 3; // Adjust to Thursday
  // Simplified approximation of GAS logic
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  
  const year = d.getUTCFullYear();
  const week1 = new Date(Date.UTC(year, 0, 4));
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7);
  const yearShort = year.toString().slice(-2);
  
  return `${yearShort}W${weekNum.toString().padStart(2, "0")}`;
}

async function processBatch(urls = [], apiKeys = [], concurrency = DEFAULT_CONCURRENCY, scoring = null) {
  const results = new Array(urls.length);
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= urls.length) return;
      const url = urls[i];

      const headers = {
        "User-Agent": "ClanManagerWorker/1.0",
        "Accept-Encoding": "gzip",
      };
      if (apiKeys && apiKeys.length > 0) {
        const key = apiKeys[Math.floor(Math.random() * apiKeys.length)];
        headers.Authorization = `Bearer ${key}`;
      }

      if (scoring && url.includes("/players/") && !url.includes("/battlelog")) {
        try {
          const profile = await fetchWithRetries(url, { method: "GET", headers });
          if (profile.code === 200 && profile.content && profile.content.tag) {
            const logUrl = url + "/battlelog";
            const logs = await fetchWithRetries(logUrl, { method: "GET", headers });

            let warBonus = 0;
            if (logs.code === 200 && Array.isArray(logs.content)) {
              const hasWar = logs.content.some((b) =>
                ["riverRacePvP", "boatBattle", "riverRaceDuel"].includes(b.type)
              );
              if (hasWar) warBonus = 500;
            }

            const p = profile.content;
            const totalWarScore = (p.warDayWins || 0) + warBonus;
            const rawScore = Math.round(
              (p.trophies || 0) * (scoring.TROPHY || 0) +
                (p.totalDonations || 0) * (scoring.DON || 0) +
                totalWarScore * (scoring.WAR || 0)
            );

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

// ⚡ TOURNAMENT SCAN ENGINE
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
           // ⚡ IN-MEMORY FILTERING
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

app.post("/scan", checkAuth, async (req, res) => {
  try {
    const { tags, apiKeys, blacklist, minTrophies } = req.body;
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
    
    return res.json({ candidates });
  } catch (e) {
    console.error("Failed /scan", e);
    return res.status(500).json({ error: e.message });
  }
});

// ⚡ FULL CLAN CONTEXT (Optimized for Leaderboard)
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

    // ⚡ PRE-PROCESS HISTORY
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
