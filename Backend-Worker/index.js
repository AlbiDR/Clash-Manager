const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json({ limit: "2mb" }));

const DEFAULT_CONCURRENCY = parseInt(
  process.env.WORKER_CONCURRENCY || "20",
  10,
);
const DEFAULT_TIMEOUT =
  parseInt(process.env.WORKER_TIMEOUT_SEC || "45", 10) * 1000;
const MAX_RETRIES = parseInt(process.env.WORKER_RETRIES || "2", 10);

function timeoutFetch(url, opts = {}, timeout = DEFAULT_TIMEOUT) {
  return Promise.race([
    fetch(url, { ...opts, timeout }),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error("timeout")), timeout),
    ),
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
      // Retry on network or 5xx
      attempt++;
      if (attempt <= retries)
        await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return {
    code: 520,
    content: `Fetch failed: ${lastErr ? lastErr.message : "unknown"}`,
  };
}

async function processBatch(
  urls = [],
  apiKeys = [],
  concurrency = DEFAULT_CONCURRENCY,
  scoring = null,
) {
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

      // ⚡ SCORING OPTIMIZATION: If we are fetching a player profile, optionally fetch battlelog too
      if (scoring && url.includes("/players/") && !url.includes("/battlelog")) {
        try {
          const profile = await fetchWithRetries(url, {
            method: "GET",
            headers,
          });
          if (profile.code === 200 && profile.content && profile.content.tag) {
            const logUrl = url + "/battlelog";
            const logs = await fetchWithRetries(logUrl, {
              method: "GET",
              headers,
            });

            let warBonus = 0;
            if (logs.code === 200 && Array.isArray(logs.content)) {
              const hasWar = logs.content.some((b) =>
                ["riverRacePvP", "boatBattle", "riverRaceDuel"].includes(
                  b.type,
                ),
              );
              if (hasWar) warBonus = 500;
            }

            const p = profile.content;
            const totalWarScore = (p.warDayWins || 0) + warBonus;
            const rawScore = Math.round(
              (p.trophies || 0) * (scoring.TROPHY || 0) +
                (p.totalDonations || 0) * (scoring.DON || 0) +
                totalWarScore * (scoring.WAR || 0),
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
          results[i] = {
            code: 500,
            content: `Scoring fetch failed: ${e.message}`,
          };
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

  // If scoring was requested, sort and potentially cap to save bandwidth
  if (scoring) {
    return results
      .filter(
        (r) =>
          r && r.code === 200 && r.content && r.content.rawScore !== undefined,
      )
      .sort((a, b) => b.content.rawScore - a.content.rawScore)
      .slice(0, 200); // Return top 200 candidates to GAS
  }

  return results;
}

// Simple auth middleware - check Bearer token if WORKER_SECRET is set
function checkAuth(req, res, next) {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return next();
  const auth = (req.get("authorization") || "").trim();
  if (auth !== `Bearer ${secret}`)
    return res.status(401).json({ error: "unauthorized" });
  return next();
}

app.get("/", (req, res) => res.send("Clash Manager Worker is running"));

// Capabilities endpoint for health and config (simple) - used by GAS preflight
app.get("/capabilities", checkAuth, (req, res) => {
  return res.json({
    version: "10.0.0",
    concurrency: DEFAULT_CONCURRENCY,
    timeoutMs: DEFAULT_TIMEOUT,
    maxRetries: MAX_RETRIES,
  });
});

/**
 * 🔑 AUDIT ENDPOINT (New)
 * Checks a list of API keys against a lightweight endpoint to verify validity.
 * Offloads GAS Quota.
 */
app.post("/audit", checkAuth, async (req, res) => {
  try {
    const { apiKeys } = req.body;
    if (!Array.isArray(apiKeys)) return res.status(400).json({ error: "apiKeys must be array" });

    // Lightweight endpoint that requires auth but returns small data
    const auditUrl = "https://api.clashroyale.com/v1/cards"; 

    // Map keys to fetch promises
    const tasks = apiKeys.map(async (key) => {
        try {
            const response = await timeoutFetch(auditUrl, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${key}`,
                    "User-Agent": "ClanManagerWorker/Audit"
                }
            }, 5000); // 5s timeout per key
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

app.post("/fetch", checkAuth, async (req, res) => {
  try {
    const { urls, apiKeys, scoring } = req.body;
    if (!Array.isArray(urls))
      return res.status(400).json({ error: "urls must be array" });
    const concurrency = Number(
      process.env.WORKER_CONCURRENCY || req.query.c || DEFAULT_CONCURRENCY,
    );

    const results = await processBatch(
      urls,
      apiKeys || [],
      concurrency,
      scoring,
    );
    return res.json({ results });
  } catch (e) {
    console.error("Failed /fetch", e);
    return res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(
    `Worker listening on ${PORT} (concurrency=${DEFAULT_CONCURRENCY})`,
  ),
);
